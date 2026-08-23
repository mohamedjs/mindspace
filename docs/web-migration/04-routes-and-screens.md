# 04 — Routes and screens

## 4.1 Route map

> **Superseded in part by `11` §11.2.3.** The desktop sidebar needs a shared
> layout that survives navigation, so these pages end up inside an `app/(app)/`
> route group. URLs are unchanged — route groups do not appear in the path — so
> build the flat structure below first and regroup in Phase 10.


| Expo Router | Next.js App Router | Notes |
|---|---|---|
| `src/app/_layout.tsx` | `app/layout.tsx` + `app/providers.tsx` | Server shell + `'use client'` provider tree |
| `src/app/index.tsx` | `app/page.tsx` | The home screen. 368 lines — the largest screen |
| `src/app/sign-in.tsx` | `app/sign-in/page.tsx` | |
| `src/app/record.tsx` | `app/record/page.tsx` | Takes `?spaceId=`, `?parentNoteId=`, `?fillNoteId=` |
| `src/app/note/[id].tsx` | `app/note/[id]/page.tsx` | **`params` is a Promise in Next 16 — `await` it** |
| `src/app/settings/index.tsx` | `app/settings/page.tsx` | 382 lines, four sections |
| `src/app/credits/index.tsx` | `app/credits/page.tsx` | |
| `src/app/plans/index.tsx` | `app/plans/page.tsx` | |
| `src/app/keys/index.tsx` | `app/keys/page.tsx` | Redirects non-BYOK users to `/plans` |

### Navigation API translation

| Expo Router | Next.js |
|---|---|
| `useRouter().push('/credits')` | `useRouter().push('/credits')` from `next/navigation` |
| `router.push({ pathname: '/note/[id]', params: { id, spaceId } })` | `router.push(\`/note/${id}?spaceId=${spaceId}\`)` |
| `router.back()` | `router.back()` |
| `router.replace(…)` | `router.replace(…)` |
| `useLocalSearchParams<{ recordingId?: string }>()` | `useSearchParams()` (client) — returns `URLSearchParams`, so `.get('recordingId')` |
| `<Redirect href="/plans" />` | `redirect('/plans')` (server) or `router.replace` in an effect (client) |
| `usePathname()` | `usePathname()` from `next/navigation` |

> **Next 16 gotcha.** `params` and `searchParams` in a **page** are Promises.
> In Server Components: `const { id } = await props.params`. In Client
> Components use the `useParams()` / `useSearchParams()` hooks instead — they
> are synchronous. Run `npx next typegen` to get the `PageProps<'/note/[id]'>`
> helper.

> **`useSearchParams()` requires a `<Suspense>` boundary** or the page opts out
> of static rendering. Since every page here is dynamic anyway, wrap the client
> component in `<Suspense fallback={…}>` inside the server page and move on.

## 4.2 `app/page.tsx` — the home screen

The single most important screen. Read `src/app/index.tsx` end to end before
writing it.

### Responsibilities

1. **Space selection.** Query `queryKeys.spaces.all` → `fetchSpaces()`. Auto-select
   `spaces[0]` when none is chosen (the backend auto-creates a space on signup
   via the `handle_new_user` trigger + migration `0022_default_space`). The
   chosen id is written to `localStorage` under `mindspace:lastSpace`.

   > There is a live inconsistency in the RN app worth fixing during the port:
   > `selectSpace()` **writes** `LAST_SPACE_KEY` but the auto-select effect
   > never **reads** it — it always jumps to `spaces[0]`. Restoring the last
   > space is the obviously intended behaviour. Implement the read, and note it
   > as a deliberate behaviour change in your summary.

2. **View switching.** Reads `notesView` from the theme context. Renders
   `<NotesListView>` when `'list'`, `<CanvasRoot>` when `'canvas'`. Both get the
   same props and the same handlers.

3. **All note and group mutations**, each a React Query mutation hook with
   optimistic updates:

   | Handler | Hook | Behaviour |
   |---|---|---|
   | `handleUpdateColor` | `useUpdateNoteColor` | |
   | `handleMoveNote` | `useMoveNote` | |
   | `handleMoveCluster` | `useMoveCluster` | Parent + descendants in one `bulk_move_notes` RPC |
   | `handleDeleteNote` | `useDeleteNote` | **Soft** delete — the recordings sheet still shows what a recording produced, and the row survives for undo. A DB trigger promotes orphaned children to the parent's level |
   | `handleAddNote(x, y)` | `useCreateNote` | Creates `{ content: 'New note', x, y }` then **navigates straight to the editor**. An empty card with no keyboard up is a dead end |
   | `handleTidy` | `useTidyNotes` | Runs `tidyLayout()` from `ai/services/layout.ts` |
   | `handleAddGroup` / `Rename` / `Move` / `Resize` / `Delete` | `useCreateGroup` / `useUpdateGroup` / `useDeleteGroup` | |

4. **Recording status banner.** Reads `?recordingId=` from the URL, feeds
   `useRecordingStatus(recordingId)` which subscribes via `RealtimePort`. The
   banner shows for every status **except** `completed` and `failed`.
   `'transcribed'` is mid-pipeline (extraction still to run) so it **stays** on
   the banner. On `failed`, `describeStoredFailure()` produces the message and a
   retry action calls `runThinkingPipeline` again.

5. **Out-of-credits sheet.** `available = balance.creditsBalance - balance.creditsReserved`.
   Opens `<OutOfCreditsSheet>` when a pipeline call returns `insufficient_credits`.

6. **Reminder sync.** Calls `syncNoteReminders(notes)` on every notes refetch.
   See `07` §7.6 for the web replacement.

7. **Two sheets**: `<SpacesSheet>` (switch/create/rename/delete spaces) and
   `<RecordingsSheet>` (recordings in this space, with status).

### Structure

```tsx
// app/page.tsx  — Server Component, 6 lines
import { Suspense } from 'react';
import { HomeScreen } from '@/features/home/HomeScreen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <HomeScreen />
    </Suspense>
  );
}
```

Everything else goes in `HomeScreen` as `'use client'`. **Do not** try to split
this screen across the server/client boundary — it is entirely interactive.

## 4.3 `app/note/[id]/page.tsx` — the note editor

The route file is 25 lines; all the work is in
`src/features/sticky-notes/components/NoteEditor.tsx`.

Query params: `id` (path), `spaceId` (search).

The editor must have, in the header, **in this order**: back, title field,
**microphone**, **delete**. The microphone position is a product requirement
("voice icon behind the delete icon"), and it does something specific:

- **The header microphone writes *this note's own content*.** It navigates to
  `/record?spaceId=…&fillNoteId=<id>`, which drives the `ai-note-write` edge
  function. That function *appends* to the note's content — it only *replaces*
  when the content is empty or the literal string `"New note"`.
- **A separate microphone in the sub-notes area generates *children*.** It
  navigates to `/record?spaceId=…&parentNoteId=<id>`, driving `ai-extract` with
  a parent, which places the new notes in an orbit around it.

These two are mutually exclusive in `runThinkingPipeline` — `fillNoteId` and
`parentNoteId` must never both be set.

Other editor features: edit title and content (autosaving), change note type,
change colour, list sub-notes with tap-through, soft delete with confirmation.

## 4.4 `app/settings/page.tsx`

Four sections, in this order, each with a coloured dot in its heading:

### Profile card (no dot)
Avatar initial on an accent circle; full name is **inline-editable** (pencil →
text field → check button, saving through `AccountRepository.updateDisplayName`,
which writes `auth.users.user_metadata.full_name`); email below, read-only.

### AI models — dot `#66BB6A`
Two `<ModelPicker>`s:
- **"Text → sticky notes"** — chat models. If the user has saved BYOK keys, this
  list is **filtered to providers they hold a key for**. Provider labels are
  `{ openai: 'GPT', anthropic: 'Claude', google: 'Gemini' }`.
- **"Voice → text"** — transcribe models. Subtitle, verbatim:
  *"Always runs on MindSpace credits, even with your own key saved."*

### Appearance — dot `#42A5F5`
- `<ThemeToggle>` (light / dark / system)
- **"Your notes as"** — segmented Canvas | List. Subtitle: *"A board you arrange,
  or a list you scroll — with its own calendar tab. Both record and both keep
  sub-notes with their parent."*
- **"Hand-drawn text"** switch — *"Excalidraw-style font instead of the system default."*
- **"Canvas background"** switch — *"Grid and colour orbs, or a plain solid board."*
- **"Sub-notes on canvas"** switch — *"Show them as connected cards, or just the idea they belong to."*

### Account — dot `#FFCA28`
- **Plans** row → `/plans`. Subtitle: *"Monthly credits, longer recordings — or bring your own AI key."*
- **Your API keys** row → `/keys`, **rendered only when the active plan `isByok`**
- **Sign out** (confirm dialog)
- **Delete account** (confirm dialog; calls `delete_own_account()` then signs out).
  Confirmation copy, verbatim: *"This permanently deletes every space, recording, and note you own. This cannot be undone."*

Copy every string exactly. These are product decisions, not placeholders.

## 4.5 `app/credits/page.tsx`

Balance card (available = balance − reserved, plus an EGP equivalent via
`creditsToEgp` and an estimated recording time via `estimateMinutes`), then the
ledger as a list: reason + date on the left, signed delta and running balance on
the right. Negative deltas render in the warning colour. Sign-out lives in this
header too.

`useLedger()` supports `limit`/`offset` — the RN app uses a `FlatList`; on the
web use a plain list with a "load more" button or an `IntersectionObserver`.

## 4.6 `app/plans/page.tsx`

Header *"Keep thinking out loud"*, then a `<PlanCard>` per plan from
`usePlans()`, ordered by `sort_order`. The current plan is marked; the featured
plan gets a "Popular" pill.

`<PlanCard>` renders two different bodies:
- **BYOK plan** (`plan.isByok`): *"Sticky notes on your own GPT / Claude / Gemini key"*
  plus `N credits for voice → text (creditsToTranscriptionLabel(N)) · recordings up to M min`.
- **Everything else**: `N credits a month`, `+X% bonus` when non-zero, then
  `creditsToRecordingLabel(N) · up to M min per recording`.

Both label helpers are already written in `billing.api.ts` — **use them, do not
re-derive the numbers.** `creditsToRecordingLabel` assumes 9 credits/minute
(transcription plus amortised extraction); `creditsToTranscriptionLabel` assumes
6. Getting this wrong means advertising more minutes than the plan delivers.

Tapping a plan opens `<PaymentMethodSheet>` listing channels from
`usePaymentProviders()`. Channels whose `isConfigured` is false must be visibly
disabled — today only **TestPay** is configured; Google Pay, Apple Pay and
InstaPay all throw `provider_not_configured` server-side.

Flow: `startSubscription(planId, channel)` → provider-specific confirmation →
`confirmSubscription(subscriptionId, receipt)`. See `08` §8.5 for the exact
contract and why confirm is idempotent.

## 4.7 `app/keys/page.tsx`

Guarded: reads `useActiveSubscription()` + `usePlans()`; if the active plan is
not `isByok`, **redirect to `/plans`**.

Exactly three providers, no more:

```ts
const PROVIDERS = [
  { id: 'openai',    label: 'OpenAI · GPT' },
  { id: 'anthropic', label: 'Anthropic · Claude' },
  { id: 'google',    label: 'Google · Gemini' },
] as const;
```

Includes a callout box, verbatim:

> **Voice still runs on credits**
> Turning your voice into text always uses our OpenRouter key, so your plan
> includes credits for it. Your own key is only ever used for the writing.

Key input is `type="password"`, `autoComplete="off"`, `autoCapitalize="none"`,
`spellCheck={false}`. Saved keys list shows only `keyHint`; an inactive key
shows the provider's rejection message and asks for a replacement.

> **Security note for the web port.** The RN app used `secureTextEntry`. On the
> web, additionally set `autoComplete="off"` and do **not** wrap the field in a
> `<form>` that a password manager will offer to save — this is a third-party
> API key, not a credential for this site. The key is sent to the `byok-save`
> edge function and never returned.

## 4.8 `app/sign-in/page.tsx`

Toggles between `<LoginForm>` and `<RegisterForm>`. Register takes **three**
fields — email, password, **full name** — and passes all three to
`signUp(email, password, fullName)`. See the regression warning in `03` §3.3.

This is the one page worth rendering on the server later (see
`10-open-questions.md`); build it as a client component first.

## 4.9 `app/record/page.tsx`

Thin route around `<RecordScreen>`. Search params: `spaceId` (required),
`parentNoteId`, `fillNoteId` (both optional, mutually exclusive).

On stop it runs, in order:

1. `createRecordingRow({ spaceId, durationMs })` — **a durable checkpoint written
   before any upload is attempted.** If the upload dies, the row survives and the
   audio can be retried instead of silently lost. Do not reorder this.
2. `uploadRecording(...)` → Supabase Storage, 3 attempts with backoff.
3. Navigate back to `/?recordingId=<id>` so the home screen shows the live banner.
4. `runThinkingPipeline(recordingId, spaceId, parentNoteId, fillNoteId)`.

On any failure: `markRecordingFailed(recordingId, message)` and show
`describeFailure(err)`.

Full detail in `07`.

## 4.10 `app/layout.tsx` and the provider tree

The RN provider order is, outermost first:

```
SafeAreaProvider
  GestureHandlerRootView
    PersistQueryClientProvider
      RepositoryProvider
        ThemeProvider
          AuthProvider
            StatusBar / AuthGate / Toast
```

The web equivalent drops the first two and keeps the rest in the same order —
**`RepositoryProvider` must stay outside `AuthProvider`**, because `AuthProvider`
consumes `AuthPort` from it.

```tsx
// app/layout.tsx — Server Component
import { architectsDaughter, baloo } from './fonts';
import { Providers } from './providers';
import './globals.css';

export const metadata = { title: 'MindSpace', description: 'Talk. Get organised thoughts.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${baloo.variable} ${architectsDaughter.variable}`}>
      <head>
        {/* Set data-theme before first paint or the app flashes the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-canvas text-ink">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

```tsx
// app/providers.tsx
'use client';
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      <RepositoryProvider>
        <ThemeProvider>
          <AuthProvider>
            <AuthGate>{children}</AuthGate>
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </RepositoryProvider>
    </PersistQueryClientProvider>
  );
}
```

`suppressHydrationWarning` on `<html>` is required because the inline script
mutates `data-theme` before React hydrates.
