# 01 — Architecture, and exactly what carries over

## 1.1 The layering

```
  src/app/**                    routes / screens        ← rewrite
  src/features/*/components/**  presentation            ← rewrite
        │
        ▼  (calls hooks)
  src/features/*/hooks/**       React Query wrappers    ← copy + 'use client'
        │
        ▼  (calls api modules, which delegate)
  src/features/*/api/**         thin delegates          ← copy verbatim
        │
        ▼  (typed against ports only)
  src/core/ports/index.ts       13 interfaces           ← copy verbatim
  src/core/domain/index.ts      entity types            ← copy verbatim
  src/core/errors.ts            PipelineError           ← copy verbatim
        ▲
        │  (implements)
  src/infrastructure/supabase/  adapters                ← copy + patch 2 files
```

Dependencies point **inward**. `core/` imports nothing — not React, not Expo,
not a database driver. That is enforced, not aspirational.

## 1.2 The boundary test — port this first

`src/core/architecture.test.ts` walks every file under `src/` and fails if:

1. Anything outside `src/infrastructure/` imports `@supabase/supabase-js` or
   the Supabase client module.
2. Anything under `src/core/` imports React, Expo, infrastructure, or features.

**Port this test in Phase 0, before writing any application code.** It is the
only thing standing between you and a web app where 40 components each reach
for `supabase.from('sticky_notes')`.

Two edits are needed for the web version:

- The path check `src/infrastructure` stays.
- Rule 2's forbidden list should drop `expo` and gain `next` and `react-dom`:
  `core/` must not import `react`, `react-dom`, `next`, `src/infrastructure`,
  or `src/features`.

Update the test's own path resolution if you move it (it uses `__dirname` and
`fs`, so it needs `@types/node` and `"types": ["jest", "node"]` in
`tsconfig.json` — the RN project already does this).

## 1.3 File-by-file disposition

### Copy verbatim — no edits at all

```
src/core/domain/index.ts               entity types (Note, Space, Recording, …)
src/core/errors.ts                     PipelineError
src/core/ports/index.ts                13 port interfaces
src/core/ports/container.ts            Repositories bundle
src/features/ai/schemas/extraction.ts  Zod schema (mirrors the edge copy)
src/features/ai/services/layout.ts     slotRect / layoutNewNotes / tidyLayout /
                                       radialChildRect / placeChild
src/features/notes-list/services/day.ts       day bucketing for list + calendar
src/features/voice/services/pipeline.ts       transcribe → extract orchestration
src/features/voice/services/pipelineErrors.ts error code → user-facing copy
src/features/canvas/utils/coords.ts    worldToScreen / screenToWorld /
                                       zoomAbout / wrapToTile / gridScale
src/features/billing/api/billing.api.ts       + creditsTo*Label helpers
src/features/sticky-notes/api/notes.api.ts
src/features/canvas/api/{spaces,groups}.api.ts
src/features/credits/api/credits.api.ts
src/features/ai/api/models.api.ts
src/features/account/api/account.api.ts
src/features/byok/api/keys.api.ts
src/features/voice/api/recordings.api.ts
src/lib/query-client/keys.ts           React Query key factory
src/shared/theme/color.ts
src/shared/theme/fonts.ts
src/shared/constants/errors.ts
src/shared/constants/tokens.ts
src/shared/utils/greeting.ts
```

Plus all eight existing test files (`*.test.ts`) — 79 tests, all pure logic,
all must keep passing. `src/features/canvas/utils/coords.test.ts` (11 tests) is your
regression net for the canvas maths in `06`.

### Copy, then delete one `react-native` type import

Exactly two otherwise-portable files reach for a React Native **type**. Neither
has any runtime coupling, and **neither change touches a test.**

| File | The one edit |
|---|---|
| `src/features/voice/services/audioFormat.ts` | Delete `import type { Platform } from 'react-native'` and widen `extensionFor`'s first parameter from `typeof Platform.OS` to `'ios' \| 'android' \| 'web'`. `upload.test.ts` calls it with string literals, so it passes unchanged. The web storage adapter calls `mimeToExt()` directly and never uses `extensionFor` — but keep the function, because the test covers it and it documents the native contract |
| `src/shared/theme/clay.ts` | Delete `import type { ViewStyle } from 'react-native'` and change `clay()` / `clayAccent()` / `claySurface()` to return `React.CSSProperties`. See `05` §5.3 for the full CSS translation. **`shade()` is untouched**, so `color.test.ts` passes unchanged |

Run this before you start, and treat any *new* hit as a file that does not
belong in the verbatim list:

```bash
grep -rn "from 'react-native'" src/core src/features/*/api src/features/*/services \
  src/features/*/schemas src/features/canvas/utils src/lib src/shared/theme \
  src/shared/constants src/shared/utils
```

As of writing it returns exactly three lines: the two above, plus
`reminders.ts`, which is deleted anyway.

### Copy, add `'use client'` at the top

All ten hook files. They are React Query wrappers with optimistic updates and
no platform coupling:

```
src/features/sticky-notes/hooks/useNotes.ts
src/features/canvas/hooks/useGroups.ts
src/features/credits/hooks/useCredits.ts
src/features/billing/hooks/useBilling.ts
src/features/byok/hooks/useUserKeys.ts
src/features/ai/hooks/useModels.ts
src/features/account/hooks/useAccount.ts
src/features/voice/hooks/useRecordingStatus.ts
src/features/notes-list/hooks/{useNoteTree,useCalendarDays}.ts
```

Also the two Zustand stores — they are platform-free:

```
src/features/canvas/store/canvasStore.ts
src/features/voice/store/recordingStore.ts
```

### Copy with named patches — details in `03`

```
src/infrastructure/supabase/client.ts        → browser/server client split
src/infrastructure/supabase/platform.ts      → drop expo-file-system, keep web branch
src/infrastructure/supabase/repositories.ts  → verbatim
src/infrastructure/supabase/noteRepository.ts→ verbatim
src/infrastructure/supabase/mappers.ts       → verbatim
src/infrastructure/supabase/functions.ts     → verbatim
src/infrastructure/container.ts              → verbatim
src/lib/query-client/index.ts                → AsyncStorage → localStorage persister
src/shared/theme/index.tsx                   → AsyncStorage → localStorage; nativewind
                                               useColorScheme → own implementation
src/providers/AuthProvider.tsx               → 'use client', otherwise same shape
src/providers/RepositoryProvider.tsx         → 'use client', otherwise same shape
```

### Rewrite — the actual work

31 feature components, 4 shared components, and 9 routes. Enumerated in `04` and `05`.

### Delete — no web equivalent needed

```
src/features/voice/services/recorder.ts   expo-audio options; replaced by
                                          MediaRecorder config (see 07)
src/features/notes-list/services/reminders.ts
                                          expo-notifications; replaced by
                                          Notification API + a scheduler (see 07 §7.6)
```

Keep the two exported constants from `recorder.ts` — `FREE_MAX_RECORDING_MIN = 5`
and `FREE_MAX_RECORDING_SEC` — they are product rules, not platform code.

## 1.4 The 13 ports — your implementation contract

From `src/core/ports/index.ts`. Every one already has a working Supabase
adapter that ports over.

| Port | Methods | Adapter file |
|---|---|---|
| `NoteRepository` | `listBySpace` `findById` `create` `updateContent` `updateColor` `updateType` `updatePosition` `moveMany` `remove` — plus `updateParent` in Phase 9, see `11` §11.1.2 | `noteRepository.ts` |
| `SpaceRepository` | `list` `create` `rename` `remove` | `repositories.ts` |
| `GroupRepository` | `listBySpace` `create` `update` `remove` | `repositories.ts` |
| `RecordingRepository` | `listBySpace` `create` `markFailed` `markCompleted` `findTranscriptId` `getStatus` | `repositories.ts` |
| `CreditRepository` | `getBalance` `listLedger` | `repositories.ts` |
| `ModelRepository` | `list` `getPreferences` `setPreference` | `repositories.ts` |
| `AccountRepository` | `getProfile` `updateDisplayName` `deleteAccount` | `repositories.ts` |
| `KeyRepository` | `list` `save` `remove` | `repositories.ts` |
| `BillingRepository` | `listPlans` `getActiveSubscription` `listPaymentProviders` `start` `confirm` | `repositories.ts` |
| `AuthPort` | `getSession` `onSessionChange` `signIn` `signUp` `signOut` `resetPassword` `startAutoRefresh` `stopAutoRefresh` | `platform.ts` |
| `StoragePort` | `uploadRecording` `signedUrl` | `platform.ts` ← **patch** |
| `RealtimePort` | `watchRecording` | `platform.ts` |
| `FunctionsPort` | `invoke` | `functions.ts` |

`src/core/ports/container.ts` bundles all 13 into a `Repositories` interface;
`src/infrastructure/container.ts` builds the Supabase one; `RepositoryProvider`
puts it in context via `useRepositories()`.

> **Known state to preserve, not "fix":** the `api/` modules currently import
> `supabaseContainer` directly rather than going through `useRepositories()`.
> The DI path exists and works but is unused. Keep this as-is during the port —
> changing both the platform *and* the wiring at once makes failures
> un-bisectable. Note it in `10-open-questions.md` as follow-up work.

## 1.5 What the architecture does *not* give you

Be honest about this in your own planning:

- **Authorization is Postgres RLS.** Every table has `auth.uid() = user_id`
  policies. The repository layer does not enforce access; the database does.
  This is correct and must not be reimplemented in the web app.
- **Business rules live in SQL.** `reserve_credits`, `settle_credits`,
  `release_credits`, `grant_credits`, `bulk_move_notes`, `delete_own_account`,
  `apply_ai_action`, plus triggers (`promote_children_on_soft_delete`,
  `handle_new_user`, `guard_profile_update`, `on_note_change`,
  `touch_updated_at`). The client calls RPCs; it does not own the logic.
- Therefore: the repository layer buys you **platform** portability (RN → web),
  which is what you are using it for now. It does not buy you database
  portability. Do not write documentation claiming otherwise.
