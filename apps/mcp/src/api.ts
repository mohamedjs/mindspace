/**
 * The only way this server touches data: HTTP calls to the MindSpace web API,
 * carrying the user's own app token. No Supabase client, no PostgREST, no
 * service-role key — one authorization path, and the day the API becomes
 * FastAPI this file does not change.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var: ${name}`);
  return value;
}

const BASE = required('MINDSPACE_API_URL').replace(/\/+$/, '');
let accessToken = required('MINDSPACE_TOKEN');
let refreshToken = process.env.MINDSPACE_REFRESH_TOKEN;

interface Options {
  body?: unknown;
  query?: Record<string, string | undefined>;
}

async function send(method: string, path: string, options: Options): Promise<Response> {
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

/**
 * An access token lasts about an hour; this process lives for a whole agent
 * session. With a refresh token configured we renew once and retry, so a long
 * session does not fall over halfway through. Without one, hour two fails.
 */
async function renew(): Promise<boolean> {
  if (!refreshToken) return false;
  const res = await fetch(`${BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) return false;
  const pair = (await res.json()) as { access_token: string; refresh_token: string };
  accessToken = pair.access_token;
  refreshToken = pair.refresh_token;
  return true;
}

export async function api<T>(method: string, path: string, options: Options = {}): Promise<T> {
  let res = await send(method, path, options);
  if (res.status === 401 && (await renew())) res = await send(method, path, options);

  if (!res.ok) {
    // The API's error envelope is `{ error, message }` — surface both so the
    // agent sees a machine code it can act on, not just prose.
    const detail = (await res.json().catch(() => null)) as
      | { error?: string; message?: string }
      | null;
    throw new Error(
      `${method} ${path} failed (${res.status}): ${detail?.error ?? 'http_error'}${
        detail?.message ? ` — ${detail.message}` : ''
      }`
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
