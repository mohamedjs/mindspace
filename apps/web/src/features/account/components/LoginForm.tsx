'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/shared/theme';
import { clay, clayAccent, shade } from '@/shared/theme/clay';
import { getGreeting } from '@/shared/utils/greeting';

interface LoginFormProps {
  onSwitchToRegister: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSwitchToRegister }) => {
  const { signIn, resetPassword } = useAuth();
  const { colors } = useTheme();
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
    if (!email.trim() || !password) {
      toast.error('Missing details', { description: 'Enter your email and password to continue.' });
      return;
    }
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      toast.error('Sign in failed', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast.error('Enter your email', { description: 'Type your email address first, then tap reset.' });
      return;
    }
    try {
      await resetPassword(email);
      toast.success('Reset sent', { description: 'Check your email for a password reset link.' });
    } catch (err) {
      toast.error('Could not send reset', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="flex flex-col flex-1 justify-center max-w-md w-full mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold text-ink">{getGreeting()}</h1>
      <p className="mt-2 text-base text-muted">
        Welcome back. Sign in to your boards.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
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
          placeholder="Password"
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
            'Sign in'
          )}
        </button>
      </form>

      <button
        type="button"
        className="mt-4 min-h-[44px] flex items-center justify-center py-2 text-sm text-muted hover:text-ink transition-colors cursor-pointer text-center"
        onClick={handleForgotPassword}
      >
        Forgot your password?
      </button>

      <button
        type="button"
        className="mt-2 min-h-[44px] flex items-center justify-center py-2 text-sm text-muted hover:text-ink transition-colors cursor-pointer text-center"
        onClick={onSwitchToRegister}
      >
        New here? Create an account
      </button>
    </div>
  );
};
