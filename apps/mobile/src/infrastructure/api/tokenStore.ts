import * as SecureStore from 'expo-secure-store';
import type { AuthUser } from '../../core/domain';
import type { AuthSession } from '../../core/ports';

type SessionListener = (session: AuthSession | null) => void;

const ACCESS_TOKEN_KEY = 'mindspace_access_token';
const REFRESH_TOKEN_KEY = 'mindspace_refresh_token';
const USER_KEY = 'mindspace_user';

class TokenStore {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private user: AuthUser | null = null;
  private listeners = new Set<SessionListener>();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const [storedAccess, storedRefresh, storedUser] = await Promise.all([
          SecureStore.getItemAsync(ACCESS_TOKEN_KEY).catch(() => null),
          SecureStore.getItemAsync(REFRESH_TOKEN_KEY).catch(() => null),
          SecureStore.getItemAsync(USER_KEY).catch(() => null),
        ]);

        if (storedAccess && storedUser) {
          this.accessToken = storedAccess;
          this.refreshToken = storedRefresh ?? null;
          try {
            this.user = JSON.parse(storedUser);
          } catch {
            this.user = null;
          }
        }
      } catch {
        // SecureStore access error
      } finally {
        this.initialized = true;
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
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

  setSession(session: AuthSession | null, refreshToken?: string | null): void {
    const changed =
      this.accessToken !== (session?.accessToken ?? null) ||
      this.user?.id !== (session?.user?.id ?? null);

    this.accessToken = session?.accessToken ?? null;
    this.user = session?.user ?? null;
    if (refreshToken !== undefined) {
      this.refreshToken = refreshToken;
    } else if (!session) {
      this.refreshToken = null;
    }

    // Persist asynchronously in SecureStore
    if (session) {
      void SecureStore.setItemAsync(ACCESS_TOKEN_KEY, session.accessToken).catch(() => {});
      void SecureStore.setItemAsync(USER_KEY, JSON.stringify(session.user)).catch(() => {});
      if (this.refreshToken) {
        void SecureStore.setItemAsync(REFRESH_TOKEN_KEY, this.refreshToken).catch(() => {});
      }
    } else {
      void SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY).catch(() => {});
      void SecureStore.deleteItemAsync(USER_KEY).catch(() => {});
      void SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => {});
    }

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
