import { PartsStore } from './parts-store.js';
import { Uploader } from './uploader.js';

export const DEFAULT_API_URL =
  typeof process !== 'undefined' && process.env?.VITE_API_URL
    ? process.env.VITE_API_URL
    : 'http://localhost:8080';

export interface ActiveRecordingState {
  recordingId: string;
  spaceId: string;
  tabId: number;
  title: string;
  startedAt: number;
  status: 'recording' | 'stopping' | 'finished';
}

export function formatBadgeTime(seconds: number): string {
  if (seconds < 600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`;
  }
  const h = Math.floor(seconds / 3600);
  return `${h}h`;
}

export function detectMeetingTitleFromTab(url?: string, title?: string): string {
  const cleanTitle = title?.trim() || 'Meeting';
  if (!url) return cleanTitle;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('meet.google.com')) {
      const code = parsed.pathname.replace(/^\/+/, '');
      return code ? `Google Meet (${code})` : 'Google Meet';
    }

    if (host.includes('zoom.us')) {
      return cleanTitle.toLowerCase().includes('zoom') ? cleanTitle : `Zoom: ${cleanTitle}`;
    }

    if (host.includes('teams.microsoft.com') || host.includes('teams.live.com')) {
      return cleanTitle.toLowerCase().includes('teams') ? cleanTitle : `Teams: ${cleanTitle}`;
    }
  } catch {
    // Fallback to title
  }

  return cleanTitle;
}

export class ExtensionBackgroundService {
  private readonly apiUrl: string;
  private readonly partsStore: PartsStore;
  private readonly uploader: Uploader;
  private badgeInterval: any = null;

  constructor(options?: {
    apiUrl?: string;
    partsStore?: PartsStore;
    uploader?: Uploader;
  }) {
    this.apiUrl = (options?.apiUrl || DEFAULT_API_URL).replace(/\/+$/, '');
    this.partsStore = options?.partsStore ?? new PartsStore();

    this.uploader =
      options?.uploader ??
      new Uploader({
        apiUrl: this.apiUrl,
        partsStore: this.partsStore,
        getAccessToken: () => this.getAccessToken(),
        refreshAccessToken: () => this.refreshAccessToken(),
      });
  }

  public async getAccessToken(): Promise<string | null> {
    if (typeof chrome === 'undefined' || !chrome.storage?.session) {
      return null;
    }
    const session = await chrome.storage.session.get('accessToken');
    if (session?.accessToken) {
      return session.accessToken as string;
    }
    return this.refreshAccessToken();
  }

  public async refreshAccessToken(): Promise<string | null> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return null;
    }
    const local = await chrome.storage.local.get('refreshToken');
    const refreshToken = local?.refreshToken as string | undefined;
    if (!refreshToken) {
      return null;
    }

    try {
      const res = await fetch(`${this.apiUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client': 'extension',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) {
        // Token invalid, clear it
        await chrome.storage.session.remove('accessToken');
        await chrome.storage.local.remove('refreshToken');
        return null;
      }

      const data = await res.json();
      if (data.access_token) {
        await chrome.storage.session.set({ accessToken: data.access_token });
      }
      if (data.refresh_token) {
        await chrome.storage.local.set({ refreshToken: data.refresh_token });
      }

      return data.access_token as string;
    } catch (err) {
      console.error('[Background] Failed to refresh token:', err);
      return null;
    }
  }

  public async ensureOffscreenDocument(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.offscreen) {
      return;
    }

    if (chrome.runtime?.getContexts) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
      });
      if (contexts.length > 0) {
        return;
      }
    }

    try {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.USER_MEDIA],
        justification: 'Capturing tab and microphone audio for meeting recording',
      });
    } catch (err: any) {
      if (!err.message?.includes('Only a single offscreen document may be created')) {
        throw err;
      }
    }
  }

  public startBadgeTimer(startedAt: number): void {
    if (typeof chrome === 'undefined' || !chrome.action) return;

    this.stopBadgeTimer();
    chrome.action.setBadgeBackgroundColor({ color: '#EF4444' }); // Red badge

    const update = () => {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      chrome.action.setBadgeText({ text: formatBadgeTime(elapsedSeconds) });
    };

    update();
    this.badgeInterval = setInterval(update, 1000);
  }

  public stopBadgeTimer(): void {
    if (this.badgeInterval) {
      clearInterval(this.badgeInterval);
      this.badgeInterval = null;
    }
    if (typeof chrome !== 'undefined' && chrome.action) {
      chrome.action.setBadgeText({ text: '' });
    }
  }

  public async startRecording(tab: chrome.tabs.Tab): Promise<ActiveRecordingState> {
    if (!tab.id) {
      throw new Error('No active tab identified for recording');
    }

    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('You must be signed in to record a meeting');
    }

    // 1. Consent check
    const local = await chrome.storage.local.get('consentAccepted');
    if (!local.consentAccepted) {
      throw new Error('Recording consent must be accepted prior to recording');
    }

    // 2. Obtain stream ID for the tab
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tab.id,
    });

    // 3. Create Space for the meeting
    const title = detectMeetingTitleFromTab(tab.url, tab.title);
    const spaceRes = await fetch(`${this.apiUrl}/spaces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: title,
        emoji: '🎙️',
      }),
    });

    if (!spaceRes.ok) {
      const errorText = await spaceRes.text();
      throw new Error(`Failed to create space: HTTP ${spaceRes.status} ${errorText}`);
    }
    const space = await spaceRes.json();

    // 4. Create Recording in the newly created space
    const recRes = await fetch(`${this.apiUrl}/spaces/${space.id}/recordings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        kind: 'meeting',
        process_mode: 'extract',
      }),
    });

    if (!recRes.ok) {
      const errorText = await recRes.text();
      throw new Error(`Failed to create recording: HTTP ${recRes.status} ${errorText}`);
    }
    const recording = await recRes.json();

    // 5. Ensure offscreen document is open
    await this.ensureOffscreenDocument();

    // 6. Tell offscreen document to begin recording
    const startedAt = Date.now();
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'START_RECORDING',
      streamId,
      recordingId: recording.id,
    });

    const state: ActiveRecordingState = {
      recordingId: recording.id,
      spaceId: space.id,
      tabId: tab.id,
      title,
      startedAt,
      status: 'recording',
    };

    await chrome.storage.local.set({ activeRecording: state });
    this.startBadgeTimer(startedAt);

    return state;
  }

  public async stopRecording(recordingId: string, reason = 'user_action'): Promise<void> {
    const local = await chrome.storage.local.get('activeRecording');
    const state = local.activeRecording as ActiveRecordingState | undefined;

    if (!state || state.recordingId !== recordingId) {
      // Nothing active matching this ID
      return;
    }

    state.status = 'stopping';
    await chrome.storage.local.set({ activeRecording: state });
    this.stopBadgeTimer();

    // 1. Tell offscreen document to stop and flush final part
    try {
      await chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'STOP_RECORDING',
        recordingId,
      });
    } catch (err) {
      console.warn('[Background] Offscreen stop message failed (may already be closed):', err);
    }

    // 2. Upload remaining parts and finalize recording
    try {
      await this.uploader.finishRecording(recordingId);
    } catch (err) {
      console.error('[Background] Failed to finish recording parts:', err);
    }

    // 3. Mark completed and store lastFinishedRecording for popup link
    await chrome.storage.local.remove('activeRecording');
    await chrome.storage.local.set({
      lastFinishedRecording: {
        recordingId: state.recordingId,
        spaceId: state.spaceId,
        title: state.title,
        finishedAt: Date.now(),
      },
    });

    // 4. Close offscreen document if desired
    if (typeof chrome !== 'undefined' && chrome.offscreen?.closeDocument) {
      try {
        await chrome.offscreen.closeDocument();
      } catch {
        // Ignored
      }
    }
  }

  public async onBrowserStartup(): Promise<void> {
    // Check if there was an active recording that was interrupted by browser shutdown
    const local = await chrome.storage.local.get('activeRecording');
    const state = local.activeRecording as ActiveRecordingState | undefined;

    if (state && state.status === 'recording') {
      // Tab and audio are gone; finish pending parts
      state.status = 'stopping';
      await chrome.storage.local.set({ activeRecording: state });
    }

    // Resume any pending part uploads and finalize
    await this.uploader.resumePendingRecordings({
      isRecordingActive: (recId) => state?.status === 'recording' && state.recordingId === recId,
    });

    if (state && state.status === 'stopping') {
      const pending = await this.partsStore.getPendingParts(state.recordingId);
      if (pending.length === 0) {
        await chrome.storage.local.remove('activeRecording');
        await chrome.storage.local.set({
          lastFinishedRecording: {
            recordingId: state.recordingId,
            spaceId: state.spaceId,
            title: state.title,
            finishedAt: Date.now(),
          },
        });
      }
    }
  }

  public getUploader(): Uploader {
    return this.uploader;
  }
}

// Global initialization in service worker
if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled) {
  const service = new ExtensionBackgroundService();

  chrome.runtime.onStartup.addListener(() => {
    service.onBrowserStartup().catch(console.error);
  });

  // Handle recorded tab being closed
  chrome.tabs?.onRemoved.addListener(async (closedTabId) => {
    const local = await chrome.storage.local.get('activeRecording');
    const state = local.activeRecording as ActiveRecordingState | undefined;
    if (state && state.tabId === closedTabId && state.status === 'recording') {
      await service.stopRecording(state.recordingId, 'tab_closed');
    }
  });

  // Listen for messages from popup or offscreen
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.target === 'offscreen') {
      // Directed to offscreen document
      return false;
    }

    if (message.type === 'START_MEETING_RECORDING') {
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (!tab) {
          sendResponse({ success: false, error: 'No active tab found' });
          return;
        }
        service
          .startRecording(tab)
          .then((state) => sendResponse({ success: true, state }))
          .catch((err) => sendResponse({ success: false, error: err?.message || String(err) }));
      });
      return true; // async
    }

    if (message.type === 'STOP_MEETING_RECORDING') {
      service
        .stopRecording(message.recordingId)
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err?.message || String(err) }));
      return true; // async
    }

    if (message.type === 'PART_READY') {
      // Offscreen flushed a part into IndexedDB: trigger upload
      service
        .getUploader()
        .uploadPendingParts(message.recordingId)
        .catch(console.error);
      sendResponse({ received: true });
      return false;
    }

    return false;
  });
}
