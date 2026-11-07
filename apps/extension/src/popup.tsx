import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_API_URL, detectMeetingTitleFromTab } from './background.js';

const WEB_URL =
  typeof process !== 'undefined' && (process.env?.VITE_WEB_URL || process.env?.WEB_URL)
    ? process.env.VITE_WEB_URL || process.env.WEB_URL
    : 'http://localhost:3000';

interface UserProfile {
  id: string;
  email: string;
  display_name?: string | null;
}

interface ActiveRecording {
  recordingId: string;
  spaceId: string;
  tabId: number;
  title: string;
  startedAt: number;
  status: 'recording' | 'stopping';
}

interface FinishedRecording {
  recordingId: string;
  spaceId: string;
  title: string;
  finishedAt: number;
}

export const PopupApp: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [consentAccepted, setConsentAccepted] = useState<boolean>(false);
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);
  const [activeRecording, setActiveRecording] = useState<ActiveRecording | null>(null);
  const [lastFinished, setLastFinished] = useState<FinishedRecording | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Initial State Loading
  useEffect(() => {
    async function loadInitialState() {
      if (typeof chrome === 'undefined' || !chrome.storage) return;

      // Auth
      const session = await chrome.storage.session.get('accessToken');
      const local = await chrome.storage.local.get([
        'refreshToken',
        'user',
        'consentAccepted',
        'activeRecording',
        'lastFinishedRecording',
      ]);

      if (session?.accessToken) {
        setToken(session.accessToken as string);
      }
      if (local?.user) {
        setUser(local.user as UserProfile);
      }
      if (local?.consentAccepted) {
        setConsentAccepted(true);
      }
      if (local?.activeRecording) {
        setActiveRecording(local.activeRecording as ActiveRecording);
      }
      if (local?.lastFinishedRecording) {
        setLastFinished(local.lastFinishedRecording as FinishedRecording);
      }

      // Active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        setCurrentTab(tab);
      }
    }

    loadInitialState();
  }, []);

  // 2. Timer effect for active recording
  useEffect(() => {
    if (!activeRecording || activeRecording.status !== 'recording') {
      return;
    }

    const updateTimer = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - activeRecording.startedAt) / 1000));
      setElapsedSeconds(elapsed);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeRecording]);

  // 3. Storage change listener
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local') {
        if (changes.activeRecording) {
          setActiveRecording((changes.activeRecording.newValue as ActiveRecording) || null);
        }
        if (changes.lastFinishedRecording) {
          setLastFinished((changes.lastFinishedRecording.newValue as FinishedRecording) || null);
        }
        if (changes.consentAccepted) {
          setConsentAccepted(Boolean(changes.consentAccepted.newValue));
        }
      }
      if (areaName === 'session') {
        if (changes.accessToken) {
          setToken((changes.accessToken.newValue as string) || null);
        }
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${DEFAULT_API_URL}/auth/sign-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client': 'extension',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Invalid email or password');
      }

      const data = await res.json();
      setToken(data.access_token);
      setUser(data.user);

      await chrome.storage.session.set({ accessToken: data.access_token });
      await chrome.storage.local.set({
        refreshToken: data.refresh_token,
        user: data.user,
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setToken(null);
    setUser(null);
    await chrome.storage.session.remove('accessToken');
    await chrome.storage.local.remove(['refreshToken', 'user']);
  };

  const handleAcceptConsent = async () => {
    setConsentAccepted(true);
    await chrome.storage.local.set({ consentAccepted: true });
  };

  const handleStartRecording = async () => {
    setError(null);
    setLoading(true);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'START_MEETING_RECORDING',
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Failed to start recording');
      }

      setActiveRecording(response.state);
      setLastFinished(null);
    } catch (err: any) {
      setError(err?.message || 'Error starting recording');
    } finally {
      setLoading(false);
    }
  };

  const handleStopRecording = async () => {
    if (!activeRecording) return;
    setError(null);
    setLoading(true);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'STOP_MEETING_RECORDING',
        recordingId: activeRecording.recordingId,
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Failed to stop recording');
      }
    } catch (err: any) {
      setError(err?.message || 'Error stopping recording');
    } finally {
      setLoading(false);
    }
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const openSpaceUrl = (spaceId: string) => {
    const url = `${WEB_URL}/spaces/${spaceId}`;
    chrome.tabs.create({ url });
  };

  const meetingTitle = detectMeetingTitleFromTab(currentTab?.url, currentTab?.title);

  // VIEW 1: SIGN IN
  if (!token) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 24 }}>🎙️</span>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Mindspace Meetings</h2>
        </div>
        <p style={{ fontSize: 13, color: '#8b949e', marginBottom: 20 }}>
          Sign in to automatically record and summarize your meetings into structured spaces.
        </p>

        {error && (
          <div style={{ padding: '8px 12px', background: '#f8514926', color: '#ff7b72', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: '#c9d1d9' }}>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid #30363d',
                background: '#161b22',
                color: '#fff',
                fontSize: 13,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: '#c9d1d9' }}>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid #30363d',
                background: '#161b22',
                color: '#fff',
                fontSize: 13,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 8,
              padding: '10px 16px',
              borderRadius: 6,
              border: 'none',
              background: '#238636',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    );
  }

  // VIEW 2: CONSENT NOTICE (First use)
  if (!consentAccepted) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 24 }}>⚖️</span>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Consent Required</h2>
        </div>

        <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: 14, marginBottom: 20 }}>
          <p style={{ margin: '0 0 12px 0', fontSize: 13, lineHeight: 1.5, color: '#e6edf3' }}>
            <strong>Important Legal Notice:</strong>
          </p>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#8b949e' }}>
            Everyone in the meeting must know they are being recorded. You are solely responsible for compliance with all local recording and consent laws.
          </p>
        </div>

        <button
          onClick={handleAcceptConsent}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: 6,
            border: 'none',
            background: '#1f6feb',
            color: '#fff',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          I Understand and Agree
        </button>
      </div>
    );
  }

  // VIEW 3: ACTIVE RECORDING OR READY TO RECORD
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', minHeight: 400, justifyContent: 'space-between' }}>
      <div>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🎙️</span>
            <span style={{ fontWeight: 600, fontSize: 16 }}>Mindspace Meeting</span>
          </div>
          <button
            onClick={handleSignOut}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8b949e',
              fontSize: 12,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Sign out
          </button>
        </div>

        {error && (
          <div style={{ padding: '8px 12px', background: '#f8514926', color: '#ff7b72', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Tab & Meeting Details */}
        <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Target Meeting Tab
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#f0f6fc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {meetingTitle}
          </div>
          {currentTab?.url && (
            <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentTab.url}
            </div>
          )}
        </div>

        {/* Recording Controls */}
        {activeRecording ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: '#da363326',
                border: '1px solid #da3633',
                padding: '6px 14px',
                borderRadius: 20,
                color: '#f85149',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 12,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f85149', display: 'inline-block' }} />
              {activeRecording.status === 'stopping' ? 'Finalizing parts...' : 'Recording Active'}
            </div>

            <div style={{ fontSize: 36, fontWeight: 700, fontFamily: 'monospace', color: '#fff', marginBottom: 16 }}>
              {formatTimer(elapsedSeconds)}
            </div>

            <button
              onClick={handleStopRecording}
              disabled={loading || activeRecording.status === 'stopping'}
              style={{
                width: '100%',
                padding: '12px 20px',
                borderRadius: 8,
                border: 'none',
                background: '#da3633',
                color: '#fff',
                fontWeight: 600,
                fontSize: 15,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {activeRecording.status === 'stopping' ? 'Finishing upload...' : 'Stop Recording'}
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <button
              onClick={handleStartRecording}
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px 20px',
                borderRadius: 8,
                border: 'none',
                background: '#238636',
                color: '#fff',
                fontWeight: 600,
                fontSize: 15,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <span style={{ fontSize: 18 }}>🔴</span>
              {loading ? 'Starting...' : 'Start Meeting Recording'}
            </button>
            <p style={{ fontSize: 12, color: '#8b949e', marginTop: 10 }}>
              Captures tab audio mixed with your microphone. A 5-minute rotation saves to IndexedDB.
            </p>
          </div>
        )}

        {/* Finished space link */}
        {lastFinished && !activeRecording && (
          <div style={{ marginTop: 16, background: '#1f242c', border: '1px solid #388bfd4d', borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 12, color: '#58a6ff', fontWeight: 600, marginBottom: 4 }}>
              ✓ Meeting Space Ready
            </div>
            <div style={{ fontSize: 13, color: '#e6edf3', marginBottom: 10 }}>
              {lastFinished.title}
            </div>
            <button
              onClick={() => openSpaceUrl(lastFinished.spaceId)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #388bfd',
                background: '#388bfd1a',
                color: '#58a6ff',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Open Space in Mindspace →
            </button>
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: '#6e7681', textAlign: 'center', paddingTop: 12, borderTop: '1px solid #21262d' }}>
        Mindspace Chrome MV3 • TabCapture & AudioContext
      </div>
    </div>
  );
};

// Mount popup if running in DOM
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<PopupApp />);
}
