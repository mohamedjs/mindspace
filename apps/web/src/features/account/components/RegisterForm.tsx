'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/shared/theme';
import { clay, clayAccent, shade } from '@/shared/theme/clay';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSwitchToLogin }) => {
  const { signUp } = useAuth();
  const { colors } = useTheme();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const inputStyle = clay({
    color: shade(colors.surface, -0.05),
    radius: 18,
    pressed: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error('Name required', { description: 'Tell us your name so we can greet you properly.' });
      return;
    }
    if (!email.trim() || !password) {
      toast.error('Missing details', { description: 'Enter your email and password to continue.' });
      return;
    }
    if (password.length < 8) {
      toast.error('Password too short', { description: 'Use at least 8 characters.' });
      return;
    }

    setBusy(true);
    try {
      await signUp(email, password, fullName);
      toast.success('Check your email', {
        description: 'We sent you a confirmation link. Open it, then sign in.',
      });
      onSwitchToLogin();
    } catch (err) {
      toast.error('Sign up failed', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 justify-center max-w-md w-full mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold text-ink">Join MindSpace ✨</h1>
      <p className="mt-2 text-base text-muted">
        Create an account to keep your boards safe.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
        <input
          type="text"
          className="w-full px-4 py-4 text-base text-ink outline-none transition-all placeholder:text-muted"
          style={inputStyle}
          placeholder="Full name"
          autoCapitalize="words"
          autoCorrect="off"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={busy}
        />

        <input
          type="email"
          className="w-full px-4 py-4 text-base text-ink outline-none transition-all placeholder:text-muted"
          style={inputStyle}
          placeholder="Email"
          autoCapitalize="none"
          autoCorrect="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />

        <input
          type="password"
          className="w-full px-4 py-4 text-base text-ink outline-none transition-all placeholder:text-muted"
          style={inputStyle}
          placeholder="Password (8+ characters)"
          autoCapitalize="none"
          autoCorrect="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />

        <button
          type="submit"
          className="mt-4 w-full flex items-center justify-center py-4 text-base font-bold text-on-accent transition-all cursor-pointer disabled:opacity-50"
          style={clayAccent(colors)}
          disabled={busy}
        >
          {busy ? (
            <div
              className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: `${colors.onAccent} transparent ${colors.onAccent} ${colors.onAccent}` }}
            />
          ) : (
            'Create account'
          )}
        </button>
      </form>

      <button
        type="button"
        className="mt-6 min-h-[44px] flex items-center justify-center py-2 text-sm text-muted hover:text-ink transition-colors cursor-pointer text-center"
        onClick={onSwitchToLogin}
      >
        Already have an account? Sign in
      </button>
    </div>
  );
};
