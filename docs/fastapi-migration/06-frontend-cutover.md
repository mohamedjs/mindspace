# 06 — Frontend change list

## The headline

**Feature code does not move.** Not one file under `src/features/`,
`src/app/`, `src/components/`, `src/shared/`, `src/providers/`, `src/core/` or
`src/lib/` changes, with two named exceptions on web
(`proxy.ts`, `app/api/functions/[name]/route.ts`).

That is possible because `src/core/ports/` already states every capability
without naming Supabase, `src/infrastructure/container.ts` is the single wiring
point, and `src/core/architecture.test.ts` fails the build if anything outside
`src/infrastructure/` imports the Supabase client.

## What actually changes

### New folder, in both apps

```
apps/{web,mobile}/src/infrastructure/api/
├── client.ts          # fetch wrapper: base URL, bearer token, error envelope → PipelineError
├── tokenStore.ts      # web: cookies via document.cookie + a /api/session route  |  mobile: expo-secure-store
├── auth.ts            # AuthPort
├── storage.ts         # StoragePort
├── realtime.ts        # RealtimePort  (SSE)
├── functions.ts       # FunctionsPort
├── noteRepository.ts  # NoteRepository
└── repositories.ts    # Space, Group, Recording, Credit, Model, Account, Key, Billing
```

`repositories.ts` and `noteRepository.ts` are **byte-identical between web and
mobile today** (verified by `diff`), so write them once and copy. `mappers.ts`
is shared already and **needs no change at all** — the API returns the same
snake_case column names it already parses.

### Deleted, in both apps

```
apps/{web,mobile}/src/infrastructure/supabase/     ← the whole folder
```

Keep it during the strangler phase; delete it in the last step of
[09](09-phases.md).

### One-line switch, in both apps

`apps/{web,mobile}/src/infrastructure/container.ts`:

```diff
-import { supabaseNoteRepository } from './supabase/noteRepository';
-import { supabaseAccountRepository, … } from './supabase/repositories';
-import { supabaseFunctions } from './supabase/functions';
-import { supabaseAuth, supabaseRealtime, supabaseStorage } from './supabase/platform';
+import { apiNoteRepository } from './api/noteRepository';
+import { apiAccountRepository, … } from './api/repositories';
+import { apiFunctions } from './api/functions';
+import { apiAuth, apiRealtime, apiStorage } from './api/auth' /* … */;

 export const supabaseContainer: Repositories = {
-  notes: supabaseNoteRepository,
+  notes: apiNoteRepository,
   …
 };
```

Keep the exported name `supabaseContainer` in the first pass — 30+ files import
it by that name (`import { supabaseContainer } from '…/infrastructure/container'`).
Rename it to `container` as a separate, mechanical commit **after** the cutover
lands, or you will conflate a behaviour change with a rename in the same diff.

### Web-only

| File | Change |
|---|---|
| `apps/web/src/app/api/functions/[name]/route.ts` | Point at `${API_BASE_URL}/functions/${name}` instead of `${SUPABASE_URL}/functions/v1/${name}`; drop the `apikey` header. Keep it — it still avoids CORS preflight and it is where the SSR-side token lives |
| `apps/web/src/proxy.ts` | Replace `createServerClient` + `supabase.auth.getUser()` with a local check: read the session cookie, verify the JWT's `exp` (or call `GET /auth/session`), redirect to `/sign-in` when absent. The matcher and the `isPublic` logic are unchanged |
| `apps/web/src/infrastructure/supabase/server.ts` | Delete. Replace with `apps/web/src/infrastructure/api/server.ts` exposing `getServerAccessToken()` reading the cookie via `await cookies()` |
| `apps/web/package.json` | Remove `@supabase/ssr` and `@supabase/supabase-js` |

### Mobile-only

| File | Change |
|---|---|
| `apps/mobile/package.json` | Remove `@supabase/supabase-js`, `react-native-url-polyfill` (only there for Supabase), and the dev dep `supabase`. Keep `@react-native-async-storage/async-storage` — TanStack Query's persister uses it |
| `apps/mobile/src/infrastructure/api/tokenStore.ts` | Use `expo-secure-store` (already a dependency) for the refresh token, `AsyncStorage` for the non-secret access token, matching Supabase's `storage: AsyncStorage` behaviour closely enough that `AuthProvider` sees no difference |

### Not touched

`apps/{web,mobile}/src/core/ports/index.ts` — **zero changes**. Every signature
already fits. That is the proof the seam was drawn correctly.

---

## Port-by-port implementation notes

### `client.ts` — the one place the base URL lives

```ts
const BASE = process.env.NEXT_PUBLIC_API_URL!;          // web
// const BASE = process.env.EXPO_PUBLIC_API_URL!;       // mobile

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await tokenStore.getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 204) return undefined as T;
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
```

`PipelineError` comes from the existing `src/core/errors.ts` — unchanged.

**Token refresh:** on a 401 with code `token_expired`, `apiFetch` calls
`POST /auth/refresh` once, retries the request, and on a second failure emits a
session-change event with `null` (which `AuthProvider` already handles by
routing to `/sign-in`). Guard the refresh with a single in-flight promise so
twenty parallel queries do not fire twenty refreshes.

### `AuthPort` {#authport}

| Method | New implementation |
|---|---|
| `getSession()` | Read token from `tokenStore`; decode locally for `user`, or call `GET /auth/session` when there is no cached user |
| `onSessionChange(cb)` | A tiny local emitter in `tokenStore.ts` — `subscribe(cb): () => void`. Fired on sign-in, sign-out, refresh failure. Returns an unsubscribe function, exactly as the port requires ("never leaks the provider's handle") |
| `signIn(email, password)` | `POST /auth/sign-in` → store both tokens → emit |
| `signUp(email, password, fullName?)` | `POST /auth/sign-up` with `full_name`. **If the response has `session: null`, do not store tokens and do not emit** — the sign-up screen already handles "check your inbox" |
| `signOut()` | `POST /auth/sign-out` → clear tokens → emit `null` |
| `resetPassword(email)` | `POST /auth/reset-password` |
| `startAutoRefresh()` / `stopAutoRefresh()` | Mobile: start/stop an interval that refreshes at `exp - 5 min`, tied to app foreground exactly as `supabase.auth.startAutoRefresh()` was. Web: no-ops, as today |

**Explicit answer to the task's question:** the mobile app does **not** keep
Supabase Auth. FastAPI issues the tokens. The compatibility story is in
[04 §A](04-authorization.md#a-auth-tokens): during cutover the API also accepts
Supabase-signed HS256 JWTs, so a user with a live Supabase session is not logged
out and the two backends can run side by side.

### `StoragePort`

`uploadRecording({localUri, userId, spaceId, recordingId})` becomes:

1. Read the bytes exactly as today — **keep the platform branch verbatim**:
   web fetches the `blob:` URI and uploads a `Blob`; native uses
   `new File(localUri).arrayBuffer()` because *"React Native's FormData uploads
   0 bytes"*. That branch belongs in the adapter and always did.
2. `POST /storage/recordings/presign-upload` with `{recording_id, space_id, ext, content_type}`
   where `{ext, contentType} = extensionFor(Platform.OS, blob?.type)` — unchanged helper.
3. `PUT` the body to the returned `url` with the returned `headers`.
4. `POST /storage/recordings/{recording_id}/uploaded` with `{key}`.
5. Return `key`.

Keep the existing 3-attempt retry with `2**attempt * 500 ms` backoff around
steps 2–4.

`signedUrl(path, expires)` → `POST /storage/recordings/sign` → `{url}`.

### `RealtimePort`

```ts
export const apiRealtime: RealtimePort = {
  watchRecording(recordingId, onChange) {
    const controller = new AbortController();
    (async () => {
      const token = await tokenStore.getAccessToken();
      const res = await fetch(`${BASE}/recordings/${recordingId}/events`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const line = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;                       // keepalive comment
          const next = JSON.parse(line.slice(6));
          onChange({ status: next.status, error: next.error ?? null });
        }
      }
    })().catch(() => { /* aborted or dropped; the hook re-seeds via getStatus */ });
    return () => controller.abort();
  },
};
```

Uses `fetch` streaming rather than `EventSource` because (a) React Native has no
`EventSource` and (b) `EventSource` cannot set an `Authorization` header, which
would force the token into a query string.

**React Native caveat:** `fetch` response streaming needs
`reactNativeStreamingResponse` / a polyfill on some RN versions. If it does not
work on the target RN 0.85, fall back to **polling `GET /recordings/{id}/status`
every 2 s while the status is not terminal**. That is a legitimate implementation
of `RealtimePort.watchRecording` — the port says nothing about the transport —
and it is what the plan recommends as the safe default for mobile. Verify
streaming on device before choosing.

### `FunctionsPort`

Point at `/functions/{name}` on the API (or `/api/functions/{name}` on web, which
proxies there). Error unwrapping is already correct in the web version:

```ts
export const apiFunctions: FunctionsPort = {
  invoke<T>(name, body, options?) {
    return apiFetch<T>(`/functions/${name}`, options?.method === 'GET'
      ? { method: 'GET' }
      : { method: 'POST', body: JSON.stringify(body) });
  },
};
```

The mobile version's `FunctionsHttpError`/`.context` unwrapping **disappears
entirely** — a plain `fetch` already gives you the body. Net simplification.

### CRUD repositories

Straight rewrites, e.g.:

```diff
   async listBySpace(spaceId: string): Promise<Note[]> {
-    const { data, error } = await supabase.from('sticky_notes')
-      .select(NOTE_COLUMNS).eq('space_id', spaceId).is('deleted_at', null);
-    if (error) throw error;
-    return (data ?? []).map((row) => toNote(row as unknown as NoteRow));
+    const rows = await apiFetch<NoteRow[]>(`/spaces/${spaceId}/notes`);
+    return rows.map(toNote);
   },
```

Two details to preserve:

- `findById` currently returns `null` on **any** error (`if (error) return null`).
  The new adapter must catch a 404 and return `null`, not throw.
- `moveMany` returns early when `moves.length === 0` — keep it, so an empty tidy
  makes no request.
- `getPreferences` returns `{chatModelId: null, transcribeModelId: null}` when
  there is no session rather than throwing — keep it.
- `getActiveSubscription` returns `null` when there is no session — keep it.

### `architecture.test.ts`

`FORBIDDEN_IMPORTS = [/@supabase\/supabase-js/, /lib\/supabase\/client/]` and the
test exempts `src/infrastructure/**`. The new folder is inside `infrastructure`,
so the test passes unchanged. **Add** a rule while you are there:

```ts
const FORBIDDEN_IMPORTS = [/@supabase\/supabase-js/, /@supabase\/ssr/, /lib\/supabase\/client/];
```

so a stray Supabase import cannot creep back in outside infrastructure.

---

## Client env vars

| App | Old | New |
|---|---|---|
| web | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_API_URL` |
| mobile | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `EXPO_PUBLIC_API_URL` |

**Compose gotcha:** a physical phone cannot reach `localhost`.
`EXPO_PUBLIC_API_URL` must be the dev machine's **LAN IP**
(`http://192.168.x.y:8000`), while `NEXT_PUBLIC_API_URL` can stay
`http://localhost:8000`. The `.env.example` in [07](07-docker.md) says so in a
comment; the `Makefile` has a `make lan-ip` helper that prints the right value.

The mobile client currently falls back to `'https://placeholder.supabase.co'`
when the env var is missing. Keep an equivalent guard but make it **fail loudly**
— a placeholder URL produced silent network errors, and there is no reason to
repeat that.
