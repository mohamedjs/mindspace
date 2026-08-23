# 03 — Data layer and auth on the web

The whole of `src/infrastructure/supabase/` ports over. Two files need real
changes; the rest are copies. This file gives you both patches in full.

## 3.1 Client creation — the one structural change

The RN app has a single module-level Supabase client
(`src/infrastructure/supabase/client.ts`) using `AsyncStorage` for session
persistence. The web needs **two** clients because Next.js runs code in two
places.

Install `@supabase/ssr`. It exists precisely for this.

### Browser client

```ts
// web/src/infrastructure/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

/**
 * The browser-side client. Sessions live in cookies (not localStorage) so the
 * server can read them too — that is what makes route protection in proxy.ts
 * possible without shipping the app shell to signed-out visitors.
 *
 * createBrowserClient is a singleton internally; calling it repeatedly is safe
 * and returns the same instance.
 */
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

Keeping the export named `supabase` means every adapter file
(`repositories.ts`, `noteRepository.ts`, `platform.ts`, `functions.ts`) imports
unchanged.

### Server client

```ts
// web/src/infrastructure/supabase/server.ts
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * For Server Components, Route Handlers and proxy.ts.
 *
 * NOTE Next.js 16: cookies() is async — the sync form was removed. This
 * function must be awaited at every call site.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Safe to ignore when proxy.ts is refreshing the session.
          }
        },
      },
    }
  );
}
```

**The architecture boundary applies to this file too** — it lives under
`src/infrastructure/`, so the boundary test allows the Supabase import here and
nowhere else.

## 3.2 `platform.ts` patch — StoragePort

The current `uploadRecording` already branches on `Platform.OS === 'web'`. You
are deleting the native half, not writing a new one.

**Before** (RN, abridged):

```ts
const blob = Platform.OS === 'web' ? await (await fetch(localUri)).blob() : null;
const body = blob ?? (await new File(localUri).arrayBuffer());
const { ext, contentType } = extensionFor(Platform.OS, blob?.type);
```

**After** (web):

```ts
// web/src/infrastructure/supabase/platform.ts
import { buildStoragePath, mimeToExt } from '../../features/voice/services/audioFormat';
import { supabase } from './client';

const BUCKET = 'recordings';
const MAX_ATTEMPTS = 3;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const supabaseStorage: StoragePort = {
  /**
   * The recorder hands us a blob: URI. Only the Blob knows which container
   * MediaRecorder actually chose, and the stored extension must match, because
   * the transcribe edge function parses the extension back off storage_path to
   * tell the model how to decode the audio.
   */
  async uploadRecording({ localUri, userId, spaceId, recordingId }) {
    const blob = await (await fetch(localUri)).blob();
    const ext = mimeToExt(blob.type);
    const contentType = blob.type.split(';')[0] || 'audio/webm';
    const path = buildStoragePath(userId, spaceId, recordingId, ext);

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // ponytail: fixed exponential backoff, no jitter — add jitter if we ever
      // see thundering-herd retries from many clients reconnecting.
      if (attempt > 0) await delay(2 ** attempt * 500);

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType, upsert: true });

      if (!error) {
        // Flip off local_only so the transcribe function can pick it up.
        await supabase
          .from('recordings')
          .update({ local_only: false, storage_path: path, status: 'uploading' })
          .eq('id', recordingId);
        return path;
      }
      lastError = error;
    }
    throw lastError ?? new Error('upload_failed');
  },

  async signedUrl(storagePath, expiresInSeconds = 3600) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (error || !data) throw error ?? new Error('signed_url_failed');
    return data.signedUrl;
  },
};
```

Notes:

- The web adapter calls **`mimeToExt()` directly** and never uses
  `extensionFor()`. Keep `extensionFor` anyway — `upload.test.ts` covers it and
  it documents the native contract — but delete its `react-native` type import
  and widen the parameter to `'ios' | 'android' | 'web'` (see `01` §1.3). **Do
  not** keep a fake `Platform` object around.
- The three-attempt backoff and the `local_only: false` update are **not
  optional**. The transcribe function refuses to touch a row that still says
  `local_only`, and `upsert: true` is what makes a retry idempotent.

## 3.3 `platform.ts` patch — AuthPort

`supabaseAuth` ports **almost verbatim**. Two changes:

1. `startAutoRefresh()` / `stopAutoRefresh()` exist in RN because the app must
   pause token refresh when backgrounded. On the web, `@supabase/ssr` handles
   refresh itself. **Keep the port methods** (removing them changes the
   contract) but make them no-ops with a comment saying why.

2. `toSession()` reads `raw.user.user_metadata?.full_name`. Unchanged — this is
   how `fullName` survives `signUp(email, password, fullName)`.

> **Regression warning, learned the hard way.** During the original repository
> refactor, `fullName` was silently dropped from `signUp` when `AuthProvider`
> was rewritten; only `tsc` caught it, because `RegisterForm` passes three
> arguments. When you rewrite `AuthProvider.tsx`, verify by hand that
> `signUp(email, password, fullName)` reaches
> `options: { data: { full_name } }`. There is no test covering it.

`RealtimePort.watchRecording` needs **no changes at all** — Supabase Realtime
uses WebSockets, which work identically in a browser.

## 3.4 `AuthProvider` on the web

Shape stays the same. Add `'use client'`. It consumes `AuthPort`, not Supabase.

```tsx
'use client';
// web/src/providers/AuthProvider.tsx
```

Exposes: `{ user, isLoading, signIn, signUp, signOut, resetPassword }` where
`user` is the **domain** `AuthUser` (`{ id, email, fullName }`) — *not* a
Supabase user object.

> `SpacesSheet` originally read `user.user_metadata.full_name` and had to be
> corrected to `user.fullName` during the refactor. When porting components,
> grep for `user_metadata` and make sure none survives.

## 3.5 Route protection

Two layers, and you need both.

### Client gate (port of the existing `AuthGate`)

`src/app/_layout.tsx` currently renders a `<Redirect>` based on `usePathname()`.
The web equivalent is a client component in the provider tree:

```tsx
'use client';
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();       // next/navigation
  const router = useRouter();           // next/navigation

  const isPublic = pathname === '/sign-in' || pathname.startsWith('/auth/');

  useEffect(() => {
    if (isLoading) return;
    if (!user && !isPublic) router.replace('/sign-in');
    if (user && pathname === '/sign-in') router.replace('/');
  }, [user, isLoading, isPublic, pathname, router]);

  if (isLoading) return <FullScreenSpinner />;
  if (!user && !isPublic) return <FullScreenSpinner />;  // avoid a flash
  return <>{children}</>;
}
```

Same public-route rule as the RN app: `/sign-in` and anything under `/auth/`.

### Server gate — `proxy.ts` (NOT `middleware.ts`)

Next.js 16 renamed the convention. The export is `proxy`, and it runs on the
**Node runtime only** — edge is not supported in `proxy`, and setting the
`runtime` config option there throws.

**Location:** the docs say to create it *"in the project root, or inside `src`
if applicable, so that it is located at the same level as `pages` or `app`."*
The scaffold in `02` uses `--src-dir`, so `app/` is at `src/app/` and the file
belongs at **`web/src/proxy.ts`**, not the repo root.

```ts
// web/src/proxy.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes an expired token and writes the new cookie onto `response`.
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = path === '/sign-in' || path.startsWith('/auth/');

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)'],
};
```

The client gate alone is not enough (the signed-out user still downloads the
app shell); the server gate alone is not enough (client navigations do not
re-run it after a session expires mid-session).

## 3.6 React Query persistence

`src/lib/query-client/index.ts` uses an AsyncStorage persister. Swap the
persister, keep every option.

```ts
// web/src/lib/query-client/index.ts
import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { networkMode: 'offlineFirst', gcTime: SEVEN_DAYS_MS, retry: 2 },
    mutations: { networkMode: 'offlineFirst' },
  },
});

export function createPersister() {
  return createSyncStoragePersister({
    storage: window.localStorage,
    key: 'mindspace-query-cache',
  });
}
```

**`persistOptions.persister` is not optional in `PersistQueryClientProvider`'s
type**, so you cannot hand it `undefined` on the server and still typecheck.
Build it once on the client instead:

```tsx
'use client';
export function Providers({ children }: { children: React.ReactNode }) {
  const [persister] = useState(createPersister);   // runs only in the browser
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      {/* … */}
    </PersistQueryClientProvider>
  );
}
```

`Providers` is `'use client'`, but Next still renders client components on the
server for the initial HTML — so if you ever see `window is not defined` here,
gate the whole provider tree on a `mounted` flag and render plain
`QueryClientProvider` until then.

`networkMode: 'offlineFirst'` and `gcTime: 7 days` are deliberate — this app is
used on Egyptian mobile data and must stay usable through a dropout. Keep both.

`PersistQueryClientProvider` must not run during SSR. Either render the whole
provider tree in a `'use client'` component that bails out until mounted, or
guard the persister as above and let it be `undefined` on the server.

`src/lib/query-client/keys.ts` (the key factory) copies verbatim.

## 3.7 Theme + preference storage

Five preferences, all in AsyncStorage today, all → `localStorage`:

| Key | Type | Meaning |
|---|---|---|
| `mindspace:theme` | `'light' \| 'dark' \| 'system'` | Colour scheme |
| `mindspace:handdrawn` | `'1' \| '0'` | Architects Daughter vs Baloo |
| `mindspace:canvasbg` | `'1' \| '0'` | Grid + orbs vs solid board |
| `mindspace:showchildnotes` | `'1' \| '0'` | Sub-notes visible on canvas |
| `mindspace:notesview` | `'canvas' \| 'list'` | Which view the app opens in |

`localStorage` is synchronous, so the `useEffect` + `.then()` reads in
`ThemeProvider` collapse into a lazy `useState` initialiser. Guard with
`typeof window !== 'undefined'`.

Replace `nativewind`'s `useColorScheme` with:

```ts
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
```

…and apply the resolved scheme by setting `data-theme` on
`document.documentElement`, matching the CSS in `02` §2.9. Subscribe to
`prefersDark.addEventListener('change', …)` so `'system'` stays live.

Keep exporting the `palettes` object and the `useTheme()` hook with the same
shape — dozens of components read `colors.accent`, `colors.ink`, `scheme`,
`handDrawnEnabled`, `canvasBackgroundEnabled`, `showChildNotes`, `notesView`
and their setters.

## 3.8 Row-level security — what you must not re-implement

Every user-owned table carries `create policy "own" … using (auth.uid() = user_id)`:
`spaces`, `sticky_notes`, `note_groups`, `recordings`, `transcripts`,
`relationships`, `ai_actions`, `ai_action_items`, `user_ai_keys`.

Read-only-to-the-client tables: `profiles` (own row, with an update policy
limited to preferences via the `guard_profile_update` trigger), `credit_ledger`,
`credit_reservations`, `payments`, `subscriptions`, `timeline_events`.

Catalogue tables readable by any signed-in user: `ai_models` (where enabled),
`credit_packages`, `subscription_plans`.

Storage: the `recordings` bucket has per-user read/upload/delete policies keyed
on the path prefix — which is why `buildStoragePath()` starts with `userId`.
**Do not change the path shape.**

The web client gets exactly the same access as the native client, because it
authenticates the same way. There is nothing to configure.

## 3.9 Realtime

`recordings` is in the realtime publication (migration `0018`). The
`watchRecording(recordingId, onChange)` port subscribes to `UPDATE` on that one
row and reports `{ status, error }`.

This is the mechanism behind the live "transcribing… extracting…" banner. It
works unchanged in the browser. Keep the subscription **narrow** — the port
deliberately does not expose generic table subscriptions, because that would
drag PostgREST filter syntax across the boundary.
