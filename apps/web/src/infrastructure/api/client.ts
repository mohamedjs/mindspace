import { PipelineError } from '../../core/errors';
import { tokenStore } from './tokenStore';

/** Without a build-time URL, follow the page's host so a changed LAN IP needs no rebuild. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:18080`
    : 'http://localhost:18080');

let refreshPromise: Promise<string | null> | null = null;

async function requestRefresh(): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });
  } catch {
    return null; // Offline or a blip: the session may still be valid.
  }

  if (res.status === 401) {
    tokenStore.setSession(null);
    return null;
  }
  if (!res.ok) return null;

  const data = await res.json();
  tokenStore.setSession({
    accessToken: data.access_token,
    user: {
      id: data.user.id,
      email: data.user.email ?? null,
      fullName: data.user.user_metadata?.full_name ?? null,
    },
  });
  return data.access_token as string;
}

async function refreshUnderLock(): Promise<string | null> {
  let token: string | null = null;
  await navigator.locks.request('mindspace-auth-refresh', async () => {
    token = await requestRefresh();
  });
  return token;
}

/**
 * Refresh tokens are single-use and reuse revokes the whole family, so at most
 * one refresh may be in flight: per tab via refreshPromise, across tabs via a Web Lock.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  const run =
    typeof navigator !== 'undefined' && navigator.locks ? refreshUnderLock() : requestRefresh();

  const tracked = run.finally(() => {
    refreshPromise = null;
  });
  refreshPromise = tracked;
  return tracked;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = tokenStore.getAccessToken();
  const headers = new Headers(init.headers || {});

  if (init.body != null && !headers.has('Content-Type') && !(init.body instanceof FormData) && !(init.body instanceof Blob)) {
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
