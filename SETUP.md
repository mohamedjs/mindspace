# MindSpace — Setup & Auth Lifecycle

How to stand up the Supabase backend, configure it, run the app, and what
actually happens end-to-end when a user signs up and signs in.

---

## 1. Create the Supabase project

1. [supabase.com/dashboard](https://supabase.com/dashboard) → New project.
2. Note down, from **Project Settings → API**:
   - Project URL
   - `anon` / publishable key

---

## 2. Apply the database schema

Two ways — pick one.

**Dashboard (no CLI):**
SQL Editor → paste the contents of `supabase/ALL_MIGRATIONS_COMBINED.sql` → Run.

**CLI (recommended once you're iterating):**
```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

This creates every table, RLS policy, trigger, and RPC — `profiles`,
`spaces`, `sticky_notes`, `recordings`, `transcripts`, `credit_ledger`,
`ai_actions`, `user_ai_keys`, the storage bucket, and the credit RPCs
(`reserve_credits`/`settle_credits`/`release_credits`). See
`supabase/migrations/` for the numbered breakdown.

---

## 3. Configure Auth (email/password)

**Dashboard → Authentication → Providers → Email**
- Enable the Email provider.
- "Confirm email" **ON** is recommended. With it on, `signUp()` returns no
  session until the user clicks the link in their inbox — the app's
  sign-up screen (`src/app/sign-in.tsx`) already handles this by telling
  the user to check their email rather than assuming an immediate session.

**Dashboard → Authentication → URL Configuration**
- Site URL: `mindspace://`
- Redirect URLs: add `mindspace://**`

This matters because `app.json` declares `"scheme": "mindspace"` — without
the redirect URL allow-listed, the confirmation and password-reset emails
link to a URL Supabase will refuse to complete.

**Dashboard → Authentication → Providers → Anonymous sign-ins**
Leave **off**. The app does not use anonymous accounts — every user signs
up with email/password (see [§8](#8-auth-lifecycle-sign-up-to-signed-in)).

*(This is also written up as `supabase/migrations/0016_email_auth_notes.sql`
— it's documentation, not a real migration; no schema change was needed
because RLS and the signup trigger already key off `auth.uid()`.)*

---

## 4. Storage

Already created by the migrations (`0013_storage.sql`): a private
`recordings` bucket, 25MB limit, `audio/m4a|mp4|mpeg|wav` only, with RLS
policies that scope every object to `{user_id}/...` — a user can only
read/write/delete their own folder. Nothing to configure manually.

---

## 5. Edge Function secrets

These are **server-only** — never put them in `.env` or anything prefixed
`EXPO_PUBLIC_`, or they ship inside the app bundle and become extractable
by anyone who downloads the app.

```bash
npx supabase secrets set PLATFORM_OPENROUTER_KEY=sk-or-v1-your-key
npx supabase secrets set BYOK_MASTER_KEY=$(openssl rand -base64 32)
npx supabase secrets set FX_EGP_PER_USD=50
npx supabase secrets set FX_BUFFER=1.15
npx supabase secrets set FREE_TIER_CREDITS=100
npx supabase secrets set FREE_MAX_RECORDING_SEC=180
```

| Secret | What it's for |
|---|---|
| `PLATFORM_OPENROUTER_KEY` | Your shared key. Used for any user who hasn't saved their own key via `/keys` (BYOK). Billed against MindSpace credits. |
| `BYOK_MASTER_KEY` | AES-GCM key that encrypts users' own API keys before they're stored in `user_ai_keys.encrypted_key`. Losing it makes every saved user key permanently undecryptable — back it up. |
| `FX_EGP_PER_USD`, `FX_BUFFER` | Used to price credits against EGP. |
| `FREE_TIER_CREDITS`, `FREE_MAX_RECORDING_SEC` | Free-tier caps (100 credits/month, 180s max recording). |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically into every Edge Function by the platform — never
set these yourself.

Deploy the functions:
```bash
npx supabase functions deploy transcribe
npx supabase functions deploy ai-extract
npx supabase functions deploy byok-save
npx supabase functions deploy byok-delete
```

---

## 6. Client env

Copy `.env.example` → `.env` and fill in the **client-safe** values only
(the anon key is designed to be public; RLS is the real security boundary):

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxx
```

`.env` is gitignored. Never commit real values into `.env.example`.

---

## 7. Run the app

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test             # jest
npm start             # expo start
```

Press `s` in the terminal to switch between Expo Go and a dev build. Note
that `expo-audio` recording needs native modules Expo Go doesn't fully
support — for real device testing of the record flow, build a dev client
(`npx expo install expo-dev-client`, then `npx expo run:ios` /
`npx expo run:android`).

---

## 8. Auth lifecycle: sign-up to signed-in

What actually happens, file by file, from a cold app launch to a working
board — this is the full round trip through the layers built in this repo.

### A. Cold launch

1. `src/app/_layout.tsx` mounts `AuthProvider` before anything else renders.
2. `AuthProvider` (`src/providers/AuthProvider.tsx`) calls
   `supabase.auth.getSession()` — this reads whatever session was
   persisted in `AsyncStorage` from a previous launch. No network call is
   made to sign anyone in automatically; if nothing is stored, `session`
   stays `null`.
3. While that resolves, `isLoading` is `true` and `AuthGate` shows a
   spinner instead of any route.
4. Once resolved, `AuthGate` checks: no `user` and not already on
   `/sign-in` or `/auth/*` → `<Redirect href="/sign-in" />`.

### B. Sign up

1. User opens `src/app/sign-in.tsx`, toggles to "Create account", enters
   email + password (min 8 chars, enforced client-side).
2. `signUp(email, password)` in `AuthProvider` calls
   `supabase.auth.signUp({ email, password })`.
3. **Database side, automatically** (`supabase/migrations/0003_profiles.sql`):
   a Postgres trigger `on_auth_user_created` fires on the `auth.users`
   insert and runs `handle_new_user()`, which:
   - Inserts a `profiles` row for the new user with `credits_balance = 100`.
   - Inserts a `credit_ledger` row: `delta: 100, reason: 'signup_grant'`.
   This is why nothing in the app needs to explicitly "grant starter
   credits" — it happens at the DB layer the instant the auth user exists.
4. If **email confirmation is ON** (recommended, §3): `signUp()` returns
   no session. The sign-in screen shows "Check your email" and switches
   back to sign-in mode. The user clicks the link in their inbox, which
   redirects to `mindspace://` (per the URL config in §3) and completes
   the confirmation.
5. If confirmation is OFF: a session is returned immediately and
   `onAuthStateChange` in `AuthProvider` fires, setting `session` — the
   user is instantly signed in.

### C. Sign in

1. `signIn(email, password)` calls `supabase.auth.signInWithPassword(...)`.
2. On success, Supabase's client SDK persists the session to `AsyncStorage`
   and fires `onAuthStateChange`, which `AuthProvider` is subscribed to —
   `session` updates, `user` becomes non-null.
3. `AuthGate` re-renders: `user` exists and `pathname === '/sign-in'` →
   `<Redirect href="/" />`. The user lands on the home/canvas screen.

### D. Inside the app (RLS is the real boundary)

Every table has Row Level Security keyed on `auth.uid()`
(`supabase/migrations/0010_rls.sql`) — a signed-in user's client can only
ever see their own `spaces`, `sticky_notes`, `recordings`, etc. This isn't
enforced by app code; it's enforced by Postgres regardless of what the
client sends. Money tables (`credit_ledger`, `credit_reservations`) are
**read-only** from the client — all writes go through `SECURITY DEFINER`
RPCs (`reserve_credits`, `settle_credits`, `release_credits`,
`grant_credits`), so a compromised client can't fabricate credits.

1. `src/app/index.tsx` fetches the user's spaces
   (`src/features/canvas/api/spaces.api.ts`); if none exist, it creates
   one (`createSpace('My MindSpace')`).
2. Notes for that space load via `useNotes` → `notes.api.ts`, all scoped
   by RLS to the signed-in user automatically.
3. Recording → `src/app/record.tsx` → `RecordScreen` → on stop, a
   `recordings` row is written immediately (durable checkpoint before any
   upload), then `uploadRecording()` pushes the audio to the private
   `recordings` storage bucket at `{user_id}/{space_id}/{recording_id}.m4a`.
4. The `transcribe` Edge Function picks it up: resolves the model, resolves
   the API key (user's own key from `/keys` if saved, else
   `PLATFORM_OPENROUTER_KEY`), reserves credits if using the platform key,
   transcribes, writes the `transcripts` row, settles credits.
5. `ai-extract` turns the transcript into sticky notes the same way —
   reserve → call the model → parse → insert notes + a reversible
   `ai_action_items` record (for undo) → settle.

### E. Sign out

`signOut()` in `AuthProvider` calls `supabase.auth.signOut()` (reachable
from the Credits screen). This clears the persisted session; `onAuthStateChange`
fires with `session: null`; `AuthGate` redirects back to `/sign-in`. Local
query cache (from `PersistQueryClientProvider`) is not explicitly cleared
on sign-out today — the next signed-in user would briefly see cached data
from a previous account before queries refetch. Worth fixing if this ever
supports multiple accounts on one device; not addressed yet.

### F. BYOK path (optional, per-user)

If a user saves their own key on `/keys` (`src/app/keys/index.tsx`):
1. `byok-save` Edge Function validates it with a live 1-token call, then
   encrypts it (AES-GCM, `BYOK_MASTER_KEY`) and stores it in
   `user_ai_keys.encrypted_key` — a column the client can never `SELECT`
   (revoked at the DB level in `0005_user_ai_keys.sql`).
2. From then on, `_shared/keys.ts` in `transcribe`/`ai-extract` resolves
   that user's key first — their requests bypass the credit
   reserve/settle path entirely and are billed to their own provider
   account instead of MindSpace's.

---

## Prerequisites checklist

- [ ] Supabase project created, URL + anon key noted
- [ ] Migrations applied (`ALL_MIGRATIONS_COMBINED.sql` or `db push`)
- [ ] Email provider enabled, Site URL / redirect URLs set to `mindspace://`
- [ ] Anonymous sign-ins left **off**
- [ ] `PLATFORM_OPENROUTER_KEY`, `BYOK_MASTER_KEY` (+ the FX/free-tier vars) set as Edge Function secrets
- [ ] Edge functions deployed (`transcribe`, `ai-extract`, `byok-save`, `byok-delete`)
- [ ] `.env` created from `.env.example` with the client-safe values only
