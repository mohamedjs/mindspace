import type { AuthPort, AuthSession } from '../../core/ports';
import { apiFetch } from './client';
import { tokenStore } from './tokenStore';

export const apiAuth: AuthPort = {
  async getSession(): Promise<AuthSession | null> {
    const cached = tokenStore.getSession();
    if (cached) return cached;

    // On page reload, try to refresh via httpOnly cookie
    try {
      const data = await apiFetch<{
        access_token: string;
        user: { id: string; email: string; user_metadata?: { full_name?: string } };
      }>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      if (data?.access_token && data.user) {
        const session: AuthSession = {
          accessToken: data.access_token,
          user: {
            id: data.user.id,
            email: data.user.email ?? null,
            fullName: data.user.user_metadata?.full_name ?? null,
          },
        };
        tokenStore.setSession(session);
        return session;
      }
    } catch {
      tokenStore.setSession(null);
    }

    return null;
  },

  onSessionChange(listener: (session: AuthSession | null) => void): () => void {
    return tokenStore.subscribe(listener);
  },

  async signIn(email: string, password: string): Promise<void> {
    const data = await apiFetch<{
      access_token: string;
      user: { id: string; email: string; user_metadata?: { full_name?: string } };
    }>('/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), password }),
    });

    if (data?.access_token && data.user) {
      tokenStore.setSession({
        accessToken: data.access_token,
        user: {
          id: data.user.id,
          email: data.user.email ?? null,
          fullName: data.user.user_metadata?.full_name ?? null,
        },
      });
    }
  },

  async signUp(email: string, password: string, fullName?: string): Promise<void> {
    const data = await apiFetch<{
      access_token?: string;
      user?: { id: string; email: string; user_metadata?: { full_name?: string } };
    }>('/auth/sign-up', {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim(),
        password,
        full_name: fullName?.trim() || undefined,
      }),
    });

    if (data?.access_token && data.user) {
      tokenStore.setSession({
        accessToken: data.access_token,
        user: {
          id: data.user.id,
          email: data.user.email ?? null,
          fullName: data.user.user_metadata?.full_name ?? null,
        },
      });
    }
  },

  async signOut(): Promise<void> {
    try {
      await apiFetch('/auth/sign-out', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    } catch {
      // Clear local session regardless of server outcome
    } finally {
      tokenStore.setSession(null);
    }
  },

  async resetPassword(email: string): Promise<void> {
    await apiFetch('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim() }),
    });
  },

  startAutoRefresh(): void {
    // No-op on web
  },

  stopAutoRefresh(): void {
    // No-op on web
  },
};
