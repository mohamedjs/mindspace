import type { AuthPort, AuthSession } from '../../core/ports';
import { apiFetch } from './client';
import { tokenStore } from './tokenStore';

let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

export const apiAuth: AuthPort = {
  async getSession(): Promise<AuthSession | null> {
    await tokenStore.init();
    const cached = tokenStore.getSession();
    if (cached) return cached;

    const refreshToken = tokenStore.getRefreshToken();
    if (refreshToken) {
      try {
        const data = await apiFetch<{
          access_token: string;
          refresh_token?: string;
          user: { id: string; email: string; user_metadata?: { full_name?: string } };
        }>('/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refreshToken }),
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
          tokenStore.setSession(session, data.refresh_token ?? refreshToken);
          return session;
        }
      } catch {
        tokenStore.setSession(null);
      }
    }

    return null;
  },

  onSessionChange(listener: (session: AuthSession | null) => void): () => void {
    return tokenStore.subscribe(listener);
  },

  async signIn(email: string, password: string): Promise<void> {
    const data = await apiFetch<{
      access_token: string;
      refresh_token?: string;
      user: { id: string; email: string; user_metadata?: { full_name?: string } };
    }>('/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), password }),
    });

    if (data?.access_token && data.user) {
      tokenStore.setSession(
        {
          accessToken: data.access_token,
          user: {
            id: data.user.id,
            email: data.user.email ?? null,
            fullName: data.user.user_metadata?.full_name ?? null,
          },
        },
        data.refresh_token
      );
    }
  },

  async signUp(email: string, password: string, fullName?: string): Promise<void> {
    const data = await apiFetch<{
      access_token?: string;
      refresh_token?: string;
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
      tokenStore.setSession(
        {
          accessToken: data.access_token,
          user: {
            id: data.user.id,
            email: data.user.email ?? null,
            fullName: data.user.user_metadata?.full_name ?? null,
          },
        },
        data.refresh_token
      );
    }
  },

  async signOut(): Promise<void> {
    const refreshToken = tokenStore.getRefreshToken();
    try {
      await apiFetch('/auth/sign-out', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken ?? undefined }),
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
    if (autoRefreshTimer) return;
    // Periodic refresh every 10 minutes while app is in foreground
    autoRefreshTimer = setInterval(async () => {
      const refreshToken = tokenStore.getRefreshToken();
      if (!refreshToken) return;
      try {
        const data = await apiFetch<{
          access_token: string;
          refresh_token?: string;
          user: { id: string; email: string; user_metadata?: { full_name?: string } };
        }>('/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (data?.access_token && data.user) {
          tokenStore.setSession(
            {
              accessToken: data.access_token,
              user: {
                id: data.user.id,
                email: data.user.email ?? null,
                fullName: data.user.user_metadata?.full_name ?? null,
              },
            },
            data.refresh_token ?? refreshToken
          );
        }
      } catch {
        // Ignore transient refresh error
      }
    }, 10 * 60 * 1000);
  },

  stopAutoRefresh(): void {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
  },
};
