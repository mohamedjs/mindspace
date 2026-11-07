import { PipelineError } from '../../core/errors';
import { tokenStore } from './tokenStore';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        tokenStore.setSession(null);
        return null;
      }

      const data = await res.json();
      const session = {
        accessToken: data.access_token,
        user: {
          id: data.user.id,
          email: data.user.email ?? null,
          fullName: data.user.user_metadata?.full_name ?? null,
        },
      };
      tokenStore.setSession(session);
      return data.access_token as string;
    } catch {
      tokenStore.setSession(null);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = tokenStore.getAccessToken();
  const headers = new Headers(init.headers || {});

  if (!headers.has('Content-Type') && !(init.body instanceof FormData) && !(init.body instanceof Blob)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: init.credentials ?? 'include',
  });

  // Single-flight refresh on 401
  if (res.status === 401) {
    // Don't loop refresh if /auth/refresh itself returned 401 or if credentials were wrong on sign-in
    if (path !== '/auth/refresh' && path !== '/auth/sign-in') {
      const newToken = await refreshAccessToken();
      if (newToken) {
        headers.set('Authorization', `Bearer ${newToken}`);
        res = await fetch(`${API_BASE_URL}${path}`, {
          ...init,
          headers,
          credentials: init.credentials ?? 'include',
        });
      }
    }
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new PipelineError(
      data?.error ?? 'http_error',
      data?.message ?? data?.reason ?? data?.error ?? `HTTP ${res.status}`,
      res.status,
      data
    );
  }

  return data as T;
}
