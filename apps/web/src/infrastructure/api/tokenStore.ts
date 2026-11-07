import type { AuthUser } from '../../core/domain';
import type { AuthSession } from '../../core/ports';

type SessionListener = (session: AuthSession | null) => void;

class TokenStore {
  private accessToken: string | null = null;
  private user: AuthUser | null = null;
  private listeners = new Set<SessionListener>();

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getUser(): AuthUser | null {
    return this.user;
  }

  getSession(): AuthSession | null {
    if (!this.accessToken || !this.user) return null;
    return {
      accessToken: this.accessToken,
      user: this.user,
    };
  }

  setSession(session: AuthSession | null): void {
    const changed =
      this.accessToken !== (session?.accessToken ?? null) ||
      this.user?.id !== (session?.user?.id ?? null);

    this.accessToken = session?.accessToken ?? null;
    this.user = session?.user ?? null;

    if (changed) {
      for (const listener of this.listeners) {
        try {
          listener(session);
        } catch (err) {
          console.error('[TokenStore] listener error:', err);
        }
      }
    }
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const tokenStore = new TokenStore();
