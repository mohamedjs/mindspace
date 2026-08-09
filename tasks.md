# MindSpace — Implementation Plan & Technical Tasks

Ticket-level backlog for building the MVP defined in `MINDSPACE_MVP_SPEC.md`.
Solo developer, ~11 weeks. Every ticket has an ID, an estimate, dependencies, and
acceptance criteria you can check without judgement calls.

---

## Table of Contents

1. [How to Use This](#1-how-to-use-this)
2. [Conventions](#2-conventions)
3. [Epic Map & Dependency Graph](#3-epic-map--dependency-graph)
4. [Sprint Plan](#4-sprint-plan)
5. [Epic 0 — Prompt Validation](#epic-0--prompt-validation-gate)
6. [Epic 1 — Project & Supabase Foundation](#epic-1--project--supabase-foundation)
7. [Epic 2 — Credits Core](#epic-2--credits-core)
8. [Epic 3 — Voice Capture & Transcription](#epic-3--voice-capture--transcription)
9. [Epic 4 — Canvas & Sticky Notes](#epic-4--canvas--sticky-notes)
10. [Epic 5 — AI Extraction](#epic-5--ai-extraction-the-core)
11. [Epic 6 — Provenance](#epic-6--provenance)
12. [Epic 7 — Test Release](#epic-7--test-release-gate)
13. [Epic 8 — Payments](#epic-8--payments)
14. [Epic 9 — Model Picker](#epic-9--model-picker-phase-b)
15. [Epic 10 — BYOK](#epic-10--byok-phase-c)
16. [Epic 11 — Polish & Launch](#epic-11--polish--launch)
17. [Cross-Cutting Tasks](#17-cross-cutting-tasks)
18. [Release Checklist](#18-release-checklist)
19. [Parallelization Notes](#19-parallelization-notes)

---

## 0. Implementation status (2026-08-08)

Code exists for Epics 1–5 (client + edge functions). **Nothing below is
runtime-verified.** The last `tsc --noEmit` + `expo export` that passed was
commit `e4d6cdc` (Phase 1); everything after was written without running
checks, at the user's request.

Unverified surfaces to check first when keys land:
- `expo-audio` `RecorderState.durationMillis`/`.metering` — field names read
  from `Audio.types.d.ts`, never observed live.
- `expo-file-system` `File.arrayBuffer()` in `upload.ts` — `base64Sync()`
  does not exist in this version; verified by reading `File.d.ts`.
- nativewind class output on native — bundles, but no render was observed.
  Shadows and `opacity` were deliberately kept as inline `style`.
- Every Supabase query and both edge functions — never executed.

Still blocked on the human (see IMPLEMENTATION_PLAN.md Pre-requisites):
Supabase project + `EXPO_PUBLIC_*` keys, `ALL_MIGRATIONS_COMBINED.sql`,
Edge Function secrets, **anonymous sign-ins enabled**, and GATE 0 below.

---

## 1. How to Use This

- **Gates are real.** Epic 0 and Epic 7 are marked `GATE`. Do not start the next
  epic until the gate's exit criteria pass. Skipping Epic 0 is how this project
  fails.
- **Estimates are for a focused solo day**, not a calendar day. Multiply by 1.4
  if you have a day job.
- **Each ticket names the files it touches.** If you find yourself editing files
  outside that list, the ticket was scoped wrong — split it.
- **A ticket isn't done until its AC boxes are checked on a physical device**,
  not a simulator.

---

## 2. Conventions

### Branches & commits
```
feat/MS-042-canvas-pinch-zoom
fix/MS-088-credit-rounding
chore/MS-003-eslint-boundaries

Commit: MS-042: add pinch gesture with focal-point zoom
```

### Definition of Done (every ticket)
- [ ] `npx tsc --noEmit` clean
- [ ] `npx eslint .` clean
- [ ] Tests written where the ticket says so, and passing
- [ ] Verified on a physical iPhone **and** a mid-range Android
- [ ] No new `any`, no new `console.log`
- [ ] No secret added to the app bundle

### Estimate key
`0.5d` half day · `1d` one day · `2d` two days · `3d` three days

### Ticket format
```
MS-NNN · Title                                    [estimate] ← deps
Files:  paths touched
Do:     what to build
AC:     checkable outcomes
```

---

## 3. Epic Map & Dependency Graph

```
E0 Prompt Validation ── GATE
        │
        ▼
E1 Foundation ──┬──► E2 Credits ──┐
                │                  │
                ├──► E4 Canvas ────┼──► E5 Extraction ──► E6 Provenance
                │                  │         ▲
                └──► E3 Capture ───┴─────────┘
                                              │
                                              ▼
                                    E7 Test Release ── GATE
                                              │
                        ┌─────────────────────┼─────────────────┐
                        ▼                     ▼                 ▼
                   E8 Payments         E9 Model Picker      E11 Polish
                                              │
                                              ▼
                                         E10 BYOK
```

| Epic | Name | Days | Can start after |
| --- | --- | --- | --- |
| E0 | Prompt Validation `GATE` | 3 | — |
| E1 | Project & Supabase Foundation | 5 | E0 |
| E2 | Credits Core | 4 | E1 |
| E3 | Voice Capture & Transcription | 5 | E1, E2 |
| E4 | Canvas & Sticky Notes | 8 | E1 |
| E5 | AI Extraction | 8 | E3, E4 |
| E6 | Provenance | 4 | E5 |
| E7 | Test Release `GATE` | 2 | E6 |
| E8 | Payments | 5 | E7 |
| E9 | Model Picker | 3 | E7 |
| E10 | BYOK | 4 | E9 |
| E11 | Polish & Launch | 5 | E7 |
| — | Cross-cutting (CI, tests, RLS) | 3 | ongoing |
| | **Total** | **~55d** | **≈ 11 weeks** |

---

## 4. Sprint Plan

Two-week sprints, 10 working days each.

| Sprint | Days | Epics | Shippable outcome |
| --- | --- | --- | --- |
| **S1** | 1–10 | E0, E1, E2 | Prompt proven. DB + RLS live. Anon auth works. Credit balance visible and provably tamper-proof. |
| **S2** | 11–20 | E3, E4 (start) | Record → transcript on screen, credits deducted. Canvas pans and zooms with manual notes. |
| **S3** | 21–30 | E4 (finish), E5 (start) | Canvas complete at 60fps/300 notes. `ai-extract` returns validated proposals. |
| **S4** | 31–40 | E5 (finish), E6, E7 | **The full loop works.** Review sheet, undo, audio replay. 20 testers on TestFlight. |
| **S5** | 41–50 | E8, E9, E11 (start) | Users can buy credits. Model picker live. |
| **S6** | 51–55 | E10, E11 (finish) | BYOK. Store submission. |

**Milestone to protect:** end of S4. That's when you find out whether the product
is real. Everything in S5–S6 is monetization and configurability on a thing that
already works.

---

## Epic 0 — Prompt Validation `GATE`

**No application code in this epic.** A Node script and a spreadsheet.

```
MS-001 · Collect 10 real transcripts                              [1d]
Files:  evals/fixtures/*.json
Do:     Record yourself (and 2 friends) talking 40–60s about a real project.
        Transcribe manually or with a one-off API call. Include deliberately
        messy cases: rambling, self-contradicting, Arabic/English mixing,
        one that trails off mid-sentence.
AC:     [ ] 10 fixtures, each {id, audioDurationSec, text, expectedThemes[]}
        [ ] At least 3 are messy/rambling, not clean pitches
        [ ] At least 2 mix Arabic and English

MS-002 · Build the eval harness                                   [0.5d] ← MS-001
Files:  evals/run.ts, evals/report.ts, package.json
Do:     Node script: for each fixture → call OpenRouter with
        extract-thoughts prompt → validate against Zod → print a table.
AC:     [ ] `npm run evals` prints per-fixture: note count, max depth,
              type distribution, schema pass/fail, latency, cost USD
        [ ] Writes evals/results/{timestamp}.json for diffing

MS-003 · Write and iterate extract-thoughts v1                    [1.5d] ← MS-002
Files:  supabase/functions/_shared/prompts/extract-thoughts.ts
        supabase/functions/_shared/schemas.ts
Do:     Draft the system prompt per the spec. Run evals. Iterate.
        Expect 5–10 revisions. Version each one.
AC:     [ ] ≥8/10 fixtures return 3–6 notes
        [ ] ≥8/10 have hierarchy depth ≥2 (at least one parentTempId)
        [ ] 10/10 pass Zod validation on first attempt (no repair needed)
        [ ] 0/10 produce one-note-per-sentence output
        [ ] You personally read 3 outputs and think "that's what I meant"
```

### 🚦 GATE 0 — do not proceed unless

- [ ] All MS-003 acceptance criteria pass
- [ ] Average cost per extraction < $0.0005
- [ ] Average latency < 8s

**If this gate fails:** the problem is the prompt or the model tier, not the app.
Spend another 2 days here. Do not "fix it later in code" — there is no code fix
for a model that doesn't understand thinking.

---

## Epic 1 — Project & Supabase Foundation

```
MS-010 · Scaffold Expo app                                        [0.5d]
Files:  package.json, app.json, tsconfig.json, babel.config.js
Do:     create-expo-app with TS template. Install the dependency list from
        the spec §13. Enable TS strict. Configure Expo Router.
AC:     [ ] App boots on iOS + Android device  ← bundles clean both platforms
              (`expo export`); on-device render still UNVERIFIED
        [x] `tsc --noEmit` clean with "strict": true
        [x] Expo Router renders a placeholder home route (src/app/_layout.tsx
              + src/app/index.tsx -> CanvasRoot)

MS-011 · ESLint + Prettier + import boundaries                    [0.5d] ← MS-010
Files:  eslint.config.js, .prettierrc
Do:     expo lint config + import/no-restricted-paths:
        app/ may not import lib/supabase directly
        features/A may not import features/B/components
        ban filenames: utils.ts, api.ts, helpers.ts
        max-lines: warn 300, error 500
AC:     [ ] A deliberate violation of each rule fails lint

MS-012 · CI pipeline                                              [0.5d] ← MS-011
Files:  .github/workflows/ci.yml
Do:     On push: typecheck, lint, test, gitleaks secret scan.
AC:     [ ] Pipeline green on main
        [ ] A commit containing a fake `sk-or-v1-...` string fails CI

MS-013 · Supabase project + local dev                             [0.5d]
Files:  supabase/config.toml, .env.example
Do:     Create project. `supabase init`, `supabase start` for local Postgres.
AC:     [ ] `supabase db reset` runs locally
        [ ] .env.example lists only the two EXPO_PUBLIC_ vars

MS-014 · Migrations 0001–0004: extensions, enums, profiles, models [1d] ← MS-013
Files:  supabase/migrations/0001_extensions.sql … 0004_ai_models.sql
Do:     Per spec §8. Include handle_new_user() trigger granting 100 credits.
AC:     [ ] `supabase db reset` applies cleanly
        [ ] Inserting into auth.users creates a profile with 100 credits
              AND a credit_ledger row with reason='signup_grant'

MS-015 · Migrations 0005–0009: keys, credits, core, ai, timeline  [1d] ← MS-014
Files:  supabase/migrations/0005…0009.sql
Do:     Per spec §8. Include the note-change trigger and touch_updated_at.
AC:     [ ] All migrations apply on a fresh DB
        [ ] Inserting a note writes a timeline_event and increments
              spaces.note_count
        [ ] Updating only x/y writes NO timeline_event
        [ ] Soft-deleting a note decrements note_count

MS-016 · Migration 0010: RLS on every table                       [0.5d] ← MS-015
Files:  supabase/migrations/0010_rls.sql
Do:     Per spec §9, including the guard_profile_update trigger.
AC:     [ ] Every policy has both `using` and `with check` where applicable
        [ ] Client UPDATE on profiles.credits_balance raises an exception

MS-017 · RLS CI test                                              [0.5d] ← MS-016
Files:  supabase/tests/rls.test.sql, .github/workflows/ci.yml
Do:     Two test users. Assert user B reads 0 rows from every table owned
        by user A. Plus the pg_tables rowsecurity sweep from the spec.
AC:     [ ] Test fails if any public table lacks RLS
        [ ] Test fails if user B can read user A's notes
        [ ] Wired into CI

MS-018 · Seed data                                                [0.5d] ← MS-015
Files:  supabase/seed.sql
Do:     Insert ai_models rows (gpt-oss-120b, gpt-transcribe, 2 fallbacks)
        and the 4 credit_packages.
AC:     [ ] Fresh DB has 1 default chat model and 1 default transcribe model
        [ ] `select * from credit_packages` returns 4 rows with correct
              total_credits (550 / 1200 / 3250 / 7000)

MS-019 · Typed Supabase client + anon auth                        [1d] ← MS-016
Files:  src/lib/supabase/client.ts, database.types.ts,
        src/providers/AuthProvider.tsx
Do:     Generate types. Client with AsyncStorage + detectSessionInUrl:false.
        signInAnonymously on first launch. AppState-aware token refresh.
AC:     [ ] Fresh install creates a session within 2s, no UI shown
        [ ] Session survives app kill and relaunch
        [ ] `supabase gen types` wired into a `npm run types` script
        [ ] Backgrounding the app does not spam refresh errors

MS-020 · TanStack Query + persistence                             [0.5d] ← MS-019
Files:  src/lib/query-client/index.ts, src/providers/QueryProvider.tsx
Do:     networkMode 'offlineFirst', 7-day gcTime, AsyncStorage persister.
Files:  src/lib/query-client/keys.ts — centralised query key factory
AC:     [ ] Airplane mode + cold start renders cached data
        [ ] All query keys come from the factory, none inline

MS-021 · Design tokens + NativeWind                               [0.5d] ← MS-010
Files:  src/shared/constants/tokens.ts, tailwind.config.js
Do:     Colors (7 sticky types), typography, spacing, radius, shadows, motion.
AC:     [ ] Every sticky note type has bg/border/text defined
        [ ] Tailwind classes resolve from the token file, not duplicated
```

---

## Epic 2 — Credits Core

```
MS-030 · Migration 0011: credit RPCs                              [1d] ← MS-015
Files:  supabase/migrations/0011_credit_rpcs.sql
Do:     reserve_credits, settle_credits, release_credits, grant_credits,
        monthly_free_refill. Revoke grant_credits from authenticated.
AC:     [ ] reserve_credits raises INSUFFICIENT_CREDITS when balance too low
        [ ] settle_credits writes a ledger row and returns new balance
        [ ] release_credits restores reserved without touching balance
        [ ] `select grant_credits(...)` as an authenticated user is denied

MS-031 · Concurrency test for credits                             [0.5d] ← MS-030
Files:  supabase/tests/credits.test.sql
Do:     Balance = 10. Fire 5 concurrent reserve_credits(4). Assert exactly
        2 succeed and 3 raise.
AC:     [ ] Test passes 20 consecutive runs
        [ ] credits_reserved returns to 0 after all settle/release

MS-032 · Cron: monthly refill + stale reservation sweep           [0.5d] ← MS-030
Files:  supabase/migrations/0012_cron.sql
Do:     pg_cron schedules per spec §10.
AC:     [ ] Manually running monthly_free_refill() tops a 20-credit user to 100
        [ ] It does NOT reduce a user holding 500 credits
        [ ] Reservations older than 10 min flip to 'released' and
              credits_reserved is recomputed correctly

MS-033 · Credits domain hooks                                     [0.5d] ← MS-030, MS-020
Files:  src/features/credits/hooks/useCredits.ts, api/credits.api.ts
Do:     useBalance(), useLedger(), formatCredits(), estimateMinutes().
AC:     [ ] Balance updates optimistically after an AI action
        [ ] estimateMinutes(340) returns ~42 at default model rates

MS-034 · Balance chip component                                   [0.5d] ← MS-033, MS-021
Files:  src/features/credits/components/CreditChip.tsx
Do:     Shows "340 · 34 EGP". Amber under 50, red at 0. Taps to /credits.
AC:     [ ] Renders in Home and Canvas headers
        [ ] Colour states verified at 340 / 40 / 0

MS-035 · Credits screen + ledger history                          [1d] ← MS-033
Files:  src/app/credits/index.tsx, features/credits/components/LedgerRow.tsx
Do:     Balance card with minutes estimate, package grid (non-functional
        until E8), FlashList of ledger rows with running balance.
AC:     [ ] Ledger shows date, reason, delta, balance_after
        [ ] Empty state before any usage
        [ ] Signup grant appears as the first row

MS-036 · Insufficient-credit UX                                   [0.5d] ← MS-034
Files:  src/features/credits/components/OutOfCreditsSheet.tsx
Do:     Sheet explaining what's needed, how many credits, and a buy CTA.
AC:     [ ] Blocking a record attempt at 0 credits shows the sheet, not a crash
        [ ] The sheet states the exact credit cost of the blocked action
```

---

## Epic 3 — Voice Capture & Transcription

```
MS-040 · Storage bucket + policies                                [0.5d] ← MS-016
Files:  supabase/migrations/0013_storage.sql
Do:     Private 'recordings' bucket, 25MB limit, path-scoped RLS
        {user_id}/{space_id}/{recording_id}.m4a
AC:     [ ] User B cannot read user A's object path
        [ ] Upload over 25MB is rejected by the bucket, not the app

MS-041 · Recording service                                        [1.5d] ← MS-019
Files:  src/features/voice/services/recorder.ts, store/recordingStore.ts
Do:     expo-audio, m4a/AAC 44.1kHz mono 64kbps. Permission flow. Metering
        at 60ms into a shared value. Write the recordings row immediately
        on stop (durable checkpoint before upload).
AC:     [ ] Recording survives app backgrounding
        [ ] Killing the app mid-record leaves a playable local file
        [ ] Metering drives the waveform with zero React re-renders
        [ ] Permission denial shows a recoverable message, not a dead end

MS-042 · Recording screen                                         [1d] ← MS-041, MS-021
Files:  src/features/voice/components/RecordScreen.tsx, Waveform.tsx, MicButton.tsx
Do:     Full-screen near-black. Elapsed time, live waveform, stop button.
        NO live transcript.
AC:     [ ] Waveform animates at 60fps
        [ ] Free tier hard-stops at 180s with a clear message
        [ ] Mic button has idle / recording / processing states

MS-043 · Audio upload                                             [1d] ← MS-040, MS-041
Files:  src/features/voice/services/upload.ts
Do:     base64-arraybuffer path (NOT FormData). Retry 3× with backoff.
        Signed resumable upload for files > 5MB.
AC:     [ ] Uploaded object size matches the local file exactly (not 0 bytes)
        [ ] Airplane mode → upload queues and completes on reconnect
        [ ] A 5-minute recording uploads without a memory spike

MS-044 · Edge Function: shared auth + credits helpers             [0.5d] ← MS-030
Files:  supabase/functions/_shared/auth.ts, credits.ts, models.ts
Do:     getUserOrThrow, reserve/settle/release wrappers, resolveModel.
AC:     [ ] A request without a JWT returns 401
        [ ] resolveModel falls back to the is_default row when the user
              has no preference set

MS-045 · Provider adapter: openaiCompatible                       [1d] ← MS-044
Files:  supabase/functions/_shared/providers/openaiCompatible.ts,
        openrouter.ts, index.ts
Do:     One factory taking a baseUrl. openrouter.ts is a 5-line instance.
        Chat + transcribe methods. Normalise usage/token counts.
AC:     [ ] Unit test with a mocked fetch returns normalised ChatResult
        [ ] Adding a new OpenAI-compatible provider is < 10 lines

MS-046 · Edge Function: transcribe                                [1d] ← MS-043, MS-045
Files:  supabase/functions/transcribe/index.ts
Do:     Full sequence from spec §11: auth → model → key → reserve →
        signed URL → provider → transcript row → settle → free-plan cleanup.
AC:     [ ] 30s audio returns a transcript in < 6s
        [ ] Credits deducted = ceil(6 × minutes × multiplier)
        [ ] A forced provider 500 charges 0 credits and sets status='failed'
        [ ] Free plan deletes the Storage object after success

MS-047 · Realtime status subscription                             [0.5d] ← MS-046
Files:  src/features/voice/hooks/useRecordingStatus.ts
Do:     Subscribe to postgres_changes on the single recordings row.
AC:     [ ] UI moves recorded → transcribing → transcribed without polling
        [ ] Channel is removed on unmount (no leaked subscriptions)

MS-048 · Transcript review screen                                 [0.5d] ← MS-046
Files:  src/features/voice/components/TranscriptSheet.tsx
Do:     Show transcript, allow edit before extraction, "Continue" CTA
        showing the credit cost of extraction.
AC:     [ ] Editing the transcript persists before extraction runs
        [ ] Cost shown matches what is actually charged
```

---

## Epic 4 — Canvas & Sticky Notes

```
MS-050 · Canvas coordinate system + transform                     [1d] ← MS-021
Files:  src/features/canvas/utils/coords.ts, components/CanvasRoot.tsx
Do:     world↔screen conversion, one Animated.View carrying the transform,
        scale clamp 0.25–3.0.
AC:     [ ] Unit tests for worldToScreen/screenToWorld round-tripping
        [ ] A hard-coded note renders at the correct screen position at
              3 different zoom levels

MS-051 · Pan + pinch gestures                                     [1.5d] ← MS-050
Files:  src/features/canvas/gestures/useCanvasGestures.ts
Do:     Gesture.Simultaneous(pan, pinch). Focal-point zoom. Worklets only —
        no React state during the gesture.
AC:     [ ] 60fps on a mid-range Android during continuous pan+pinch
        [ ] Zoom keeps the pinch focal point stationary
        [ ] React DevTools profiler shows 0 renders while gesturing

MS-052 · Canvas store (Zustand)                                   [0.5d] ← MS-051
Files:  src/features/canvas/store/canvasStore.ts
Do:     scale, offset (synced on gesture end only), selectedNoteIds,
        draggingNoteId, connectingFrom.
AC:     [ ] All consumers use useShallow selectors
        [ ] No component subscribes to the whole store

MS-053 · Notes data layer                                         [1d] ← MS-020
Files:  src/features/sticky-notes/api/notes.api.ts, hooks/useNotes.ts, useNote.ts
Do:     useNotes(spaceId) fetches once; useNote(id) narrows via `select`
        with structuralSharing. Explicitly exclude embedding columns.
AC:     [ ] useNote(id) returns a referentially stable object when other
              notes change
        [ ] No query uses select('*') on sticky_notes

MS-054 · StickyNoteItem component                                 [1.5d] ← MS-053, MS-052
Files:  src/features/sticky-notes/components/StickyNoteItem.tsx
Do:     React.memo, takes ONLY an id prop. Own drag gesture in a worklet.
        LOD: below 0.5 scale drop shadow + body text.
AC:     [ ] Dragging note A produces 0 renders of note B (profiler-verified)
        [ ] All 7 note types render with correct semantic colours
        [ ] LOD switch is visually smooth, not a pop

MS-055 · Drag persistence with batching                           [1d] ← MS-054
Files:  src/features/sticky-notes/hooks/useNoteDrag.ts,
        supabase/migrations/0014_bulk_move.sql
Do:     bulk_move_notes RPC (security invoker). Debounce 250ms after
        gesture end, coalesce multiple moves into one call.
AC:     [ ] Moving 5 notes quickly issues exactly 1 network call
        [ ] Position survives app restart
        [ ] Optimistic update rolls back correctly on a forced 500

MS-056 · Manual note creation                                     [1d] ← MS-054
Files:  src/features/sticky-notes/components/AddNoteMenu.tsx
Do:     Long-press background → create at that world point. Type picker
        (idea/task/question/decision/text). Inline edit on double-tap.
AC:     [ ] Note is created at the exact long-pressed world coordinate
        [ ] Manual notes behave identically to AI notes on the canvas
        [ ] Costs 0 credits

MS-057 · Note context menu                                        [0.5d] ← MS-056
Files:  src/features/sticky-notes/components/NoteContextMenu.tsx
Do:     Long-press note → change colour, change type, duplicate, delete
        (soft). Haptic on open.
AC:     [ ] Delete is soft (deleted_at set), note disappears from canvas
        [ ] Type change updates the semantic colour unless colour is custom

MS-058 · Connections layer (Skia)                                 [1.5d] ← MS-054
Files:  src/features/canvas/components/ConnectionsLayer.tsx
Do:     ONE Skia canvas drawing all relationship curves. Style per type:
        solid=supports, dashed=related, red=contradicts, arrow=depends_on.
AC:     [ ] 100 connections render without frame drops
        [ ] Curves update live while a connected note is dragged
        [ ] Zero React views created per connection

MS-059 · Manual relationship creation                             [0.5d] ← MS-058
Files:  src/features/canvas/hooks/useConnectMode.ts
Do:     Drag from a note edge handle to another note.
AC:     [ ] Creates a relationships row with created_by='user'
        [ ] Self-link is prevented (DB constraint surfaces as a message)

MS-060 · Viewport culling + zoom to fit                           [1d] ← MS-054
Files:  src/features/canvas/hooks/useVisibleNotes.ts
Do:     Cull outside viewport × 1.5 when count > 150. Recompute on gesture
        end, not per frame. Two-finger double-tap → fit all.
AC:     [ ] 500-note seed script pans at 60fps
        [ ] No blank holes appear during a fast pan
        [ ] Below 150 notes, culling is bypassed entirely

MS-061 · Spaces CRUD + Home screen                                [1d] ← MS-020, MS-021
Files:  src/app/index.tsx, src/features/spaces/*
Do:     Greeting, large mic button, space list, create/rename/delete space,
        credit chip in header.
AC:     [ ] Creating a space navigates straight into its empty canvas
        [ ] Space list shows note_count and last activity
        [ ] Mic is reachable in one tap from Home
```

---

## Epic 5 — AI Extraction `the core`

```
MS-070 · Context builder                                          [1d] ← MS-053
Files:  supabase/functions/_shared/context.ts
Do:     Select up to 15 most relevant existing notes by recency + type
        weight + keyword overlap. Hard cap 2000 tokens. Format per spec §7.5.
AC:     [ ] Unit test: 200-note space produces ≤2000 tokens
        [ ] An empty space produces "(this space is empty)"
        [ ] Note ids are included so the model can reference them

MS-071 · Layout engine                                            [1.5d] ← MS-070
Files:  supabase/functions/_shared/layout.ts
Do:     Build parent/child forest → radial roots → children on arcs →
        force relaxation (120 iters, 40ms cap) → translate near viewport.
AC:     [ ] Deterministic: same input produces identical output
        [ ] Zero overlapping notes for 6 notes with 2 levels
        [ ] Completes in < 50ms for 15 notes
        [ ] Unit tested with 5 fixture structures

MS-072 · Zod schemas + JSON repair                                [0.5d] ← MS-003
Files:  supabase/functions/_shared/schemas.ts, jsonRepair.ts
Do:     Port schemas from Epic 0. Strip markdown fences. One repair pass
        that feeds validation errors back to the model.
AC:     [ ] Fenced JSON parses correctly
        [ ] Flat output (no parentTempId) is REJECTED by the refine rule
        [ ] >8 notes is rejected by the schema

MS-073 · Edge Function: ai-extract                                [2d] ← MS-070, MS-071, MS-072
Files:  supabase/functions/ai-extract/index.ts
Do:     Full sequence per spec §11. Persist as ai_actions(status='proposed')
        + ai_action_items with forward_patch AND inverse_patch. Nothing
        applied yet.
AC:     [ ] Returns proposal with positions already computed
        [ ] Schema failure after repair → 0 credits charged, clear error code
        [ ] ai_actions row records provider, model, prompt_version, tokens, cost
        [ ] Two concurrent extractions cannot overdraw the balance

MS-074 · Apply/reject RPC                                         [1d] ← MS-073
Files:  supabase/migrations/0015_apply_ai_action.sql
Do:     apply_ai_action(action_id, accepted_item_ids[]) — single transaction
        applying forward_patch for accepted items only. Sets status.
        undo_ai_action(action_id) replays inverse_patch in reverse order.
AC:     [ ] Applying 5 notes + 4 relationships is ONE transaction
        [ ] Undo restores the exact prior state including soft-deletes
        [ ] Partial accept sets status='partially_accepted'
        [ ] Cannot apply another user's action (RLS enforced)

MS-075 · AI review sheet                                          [1.5d] ← MS-073, MS-021
Files:  src/features/ai/components/AiReviewSheet.tsx
Do:     Per-item checkboxes with hierarchy indentation, inline title edit,
        credit cost shown at top, Accept / Reject.
AC:     [ ] Unchecking an item excludes it from apply
        [ ] Unchecking a parent warns about orphaning children
        [ ] Reject sets status='rejected' and applies nothing

MS-076 · Staggered entry animation                                [1d] ← MS-074, MS-054
Files:  src/features/canvas/hooks/useNoteEntrance.ts
Do:     New notes fade+scale in with a 40ms stagger, capped at 400ms total.
        Spring, not linear.
AC:     [ ] 6 notes complete entrance in ≤ 400ms
        [ ] Runs at 60fps
        [ ] This is the "wow" — watch a non-technical person react to it

MS-077 · Undo toast                                               [0.5d] ← MS-074
Files:  src/shared/components/Toast.tsx, features/ai/hooks/useUndo.ts
Do:     "AI added 5 notes [Undo]" for 8s. Also permanently in Timeline.
AC:     [ ] Undo within 8s restores prior state
        [ ] Undo is still reachable from Timeline after the toast expires

MS-078 · Full-loop wiring                                         [1d] ← MS-076, MS-048
Files:  src/features/voice/hooks/useThinkingFlow.ts
Do:     Chain record → upload → transcribe → review transcript → extract →
        review proposal → apply → animate. Single state machine, one error
        surface, resumable if the app is killed mid-flow.
AC:     [ ] End-to-end on a physical device in < 45s for 40s of speech
        [ ] Killing the app after transcription resumes at the extract step
        [ ] Every failure path charges 0 credits
```

---

## Epic 6 — Provenance

```
MS-080 · Note detail screen                                       [1d] ← MS-053
Files:  src/app/space/[id]/note/[noteId].tsx
Do:     Bottom sheet on phone. Title + content editable, type/colour
        pickers, delete, created/updated timestamps.
AC:     [ ] Edits save optimistically and persist
        [ ] Editing AI content does NOT alter the transcript or recording

MS-081 · Audio player component                                   [1d] ← MS-041
Files:  src/features/voice/components/AudioPlayerRow.tsx
Do:     Play/pause, scrub, duration, static waveform. Prefers the LOCAL
        file; falls back to a signed Storage URL.
AC:     [ ] Plays from local file with no network
        [ ] Two taps from any voice-sourced note to hearing audio
        [ ] Falls back to Storage when the local file is missing

MS-082 · Transcript span highlight                                [1d] ← MS-080, MS-081
Files:  src/features/voice/components/TranscriptView.tsx
Do:     Render full transcript with span_start..span_end highlighted.
        Tapping the highlight seeks the player to that point if segments exist.
AC:     [ ] Highlighted span matches the note's content semantically
        [ ] Notes with no span show the full transcript without a crash

MS-083 · "What AI changed" diff                                   [0.5d] ← MS-082
Files:  src/features/ai/components/InterpretationDiff.tsx
Do:     Collapsed by default. Shows the original span vs the AI interpretation.
AC:     [ ] Available on every note with source_type='ai'
        [ ] Hidden for manual notes

MS-084 · Timeline screen                                          [0.5d] ← MS-015
Files:  src/app/space/[id]/timeline.tsx
Do:     FlashList over timeline_events grouped by day. Filter chips.
        Rows deep-link to their subject.
AC:     [ ] Position-only drags produce no timeline rows
        [ ] Tapping an AI action row opens its undo option
```

---

## Epic 7 — Test Release `GATE`

```
MS-090 · Build config + EAS                                       [1d] ← MS-078
Files:  eas.json, app.config.ts
Do:     Dev/preview/production profiles. Bundle identifiers. Icons, splash.
AC:     [ ] `eas build --profile preview` succeeds for iOS and Android
        [ ] `npx expo export` output contains no API key (grep it)

MS-091 · Crash + error reporting                                  [0.5d] ← MS-090
Files:  src/lib/telemetry/*
Do:     Sentry or equivalent. Scrub transcripts and audio paths from events.
AC:     [ ] A forced crash appears in the dashboard
        [ ] No transcript text appears in any captured event

MS-092 · TestFlight + internal track release                      [0.5d] ← MS-090
Do:     Ship to 20 testers. Include a 3-question feedback form.
AC:     [ ] 20 testers installed
        [ ] At least 12 completed the full loop at least once
```

### 🚦 GATE 7 — do not proceed unless

- [ ] ≥10/20 testers say the notes matched what they meant
- [ ] ≥12/20 completed the loop without help
- [ ] Zero credit-accounting discrepancies in the ledger
- [ ] Zero reports of lost recordings
- [ ] Median time from stop-recording to notes-on-canvas < 20s

**If this gate fails:** stop. Do not build payments for a product people don't
finish using. Return to Epic 0 or Epic 5 depending on what the feedback says.

---

## Epic 8 — Payments

```
MS-100 · IAP products + store setup                               [1d] ← GATE 7
Do:     4 consumable products in App Store Connect and Play Console.
        Map store price tiers to the nearest EGP point; adjust base_credits
        so credits-per-EGP stays consistent. Apply to Apple Small Business
        Program and Google's equivalent.
AC:     [ ] 4 products live in both consoles
        [ ] store_product_id_ios/android populated in credit_packages
        [ ] SBP application submitted (15% vs 30% — do not skip)

MS-101 · Edge Function: verify-purchase                           [1.5d] ← MS-100
Files:  supabase/functions/verify-purchase/index.ts
Do:     Apple App Store Server API + Google Play Developer API verification.
        Insert into payments (unique channel+external_ref) then grant_credits.
AC:     [ ] Valid receipt grants exactly the package's total_credits
        [ ] Replaying the same receipt grants credits exactly once
        [ ] A forged receipt is rejected
        [ ] Credits are never granted from a client-reported purchase

MS-102 · Purchase flow UI                                         [1d] ← MS-101
Files:  src/app/credits/buy.tsx, features/credits/hooks/usePurchase.ts
Do:     expo-in-app-purchases. Package grid with bonus badges, "Regular"
        featured. Pending/success/failure states.
AC:     [ ] Purchase completes and the balance updates within 5s
        [ ] Cancelled purchase leaves balance untouched
        [ ] Network failure after payment still grants on retry (idempotent)

MS-103 · Paymob web checkout                                      [1.5d] ← MS-101
Files:  web/checkout/* (or a Supabase-hosted page)
Do:     Simple page: sign in, pick package, Paymob iframe. HMAC callback
        verification into the same verify-purchase function.
AC:     [ ] A web purchase appears in the app within 10s
        [ ] HMAC signature failure rejects the callback
        [ ] The iOS app contains NO link to this page
```

---

## Epic 9 — Model Picker `Phase B`

```
MS-110 · Append model catalog rows                                [0.5d] ← GATE 7
Files:  supabase/migrations/0016_more_models.sql
Do:     Add 3–5 OpenRouter chat models across tiers. Verify prices against
        openrouter.ai/models at the time of writing. Compute multipliers
        with the spec formula.
AC:     [ ] Each row has correct input/output prices and a computed multiplier
        [ ] Expensive models are marked tier='paid'

MS-111 · Edge Function: models-sync                               [1d] ← MS-110
Files:  supabase/functions/models-sync/index.ts, migrations/0017_sync_cron.sql
Do:     Nightly GET /api/v1/models → update prices → recompute multipliers →
        alert if any moved >25%.
AC:     [ ] Manual invoke updates price_synced_at on all openrouter rows
        [ ] A simulated 50% price rise produces an alert row
        [ ] Scheduled at 03:00 via pg_cron

MS-112 · Model picker screen                                      [1d] ← MS-110
Files:  src/app/settings/models.tsx
Do:     Separate chat and transcribe sections. Credit cost per model shown
        inline. Persists to profiles.chat_model_id / transcribe_model_id.
AC:     [ ] Selecting a model changes the cost shown on the next extraction
        [ ] Free-tier users see paid models locked with a clear reason
        [ ] byok_only models show "Needs your own key"

MS-113 · Per-model cost preview                                   [0.5d] ← MS-112
Files:  src/features/ai/utils/estimateCost.ts
Do:     Show "This will cost N credits" before every AI action, computed
        from the selected model's multiplier.
AC:     [ ] Preview matches the actual charge for 10 consecutive actions
```

---

## Epic 10 — BYOK `Phase C`

```
MS-120 · Crypto module                                            [1d] ← MS-013
Files:  supabase/functions/_shared/crypto.ts
Do:     AES-256-GCM seal/open with BYOK_MASTER_KEY. iv||ciphertext layout.
AC:     [ ] Round-trip test passes
        [ ] Tampering with one ciphertext byte causes decrypt to throw
        [ ] Unit tested with 3 key formats (OpenAI, Google, Anthropic)

MS-121 · Edge Function: byok-save                                 [1d] ← MS-120
Files:  supabase/functions/byok-save/index.ts
Do:     Validate the key with a 1-token test call → encrypt → store with
        key_hint (last 4). Revoke SELECT on encrypted_key.
AC:     [ ] An invalid key is rejected before storage
        [ ] `select encrypted_key from user_ai_keys` with a user JWT fails
        [ ] The key never appears in Edge Function logs

MS-122 · Key resolution + 0-credit routing                        [1d] ← MS-121
Files:  supabase/functions/_shared/keys.ts
Do:     resolveApiKey per spec §5 resolution order. BYOK path skips
        reserve/settle entirely and sets billed_to='byok'.
AC:     [ ] A BYOK extraction charges exactly 0 credits
        [ ] It still writes an ai_actions row with raw_cost_usd
        [ ] A provider 401 sets is_active=false and notifies the user
        [ ] A non-openrouter model with no user key returns NEEDS_OWN_KEY

MS-123 · Google + Anthropic adapters                              [1d] ← MS-045
Files:  supabase/functions/_shared/providers/google.ts, anthropic.ts
Do:     Real request/response mapping (these two are NOT OpenAI-compatible).
        Normalise to ChatResult including token usage.
AC:     [ ] Both return valid JSON for the extract prompt
        [ ] Token counts populate correctly in ai_actions
        [ ] Both pass the eval harness with ≥8/10 fixtures

MS-124 · Keys management screen                                   [0.5d] ← MS-121
Files:  src/app/settings/keys.tsx
Do:     List providers with hints, add/remove, "Calls with your own key cost
        0 credits" copy.
AC:     [ ] Only the last-4 hint is ever displayed
        [ ] Removing a key falls back to platform routing immediately
```

---

## Epic 11 — Polish & Launch

```
MS-130 · Onboarding                                               [1d] ← GATE 7
Files:  src/app/onboarding.tsx
Do:     Max 2 screens, skippable. Lead straight into a first recording.
AC:     [ ] Time from install to recording < 15s including onboarding
        [ ] Skippable in one tap

MS-131 · Empty states                                             [0.5d]
Files:  src/shared/components/EmptyState.tsx
Do:     Empty canvas, empty space list, empty ledger, empty timeline.
AC:     [ ] Empty canvas invites a recording, not a manual note

MS-132 · Email linking                                            [0.5d] ← MS-019
Files:  src/features/auth/components/LinkEmailSheet.tsx
Do:     Prompt after the 3rd recording. updateUser({email}) + OTP.
AC:     [ ] Same user id retained, zero data migration
        [ ] Warns clearly that anonymous accounts are install-bound

MS-133 · Lock Screen widget / quick capture                       [1.5d] ← MS-041
Files:  ios widget target, android app shortcut
Do:     Widget/shortcut launches straight into recording.
AC:     [ ] Two seconds from locked phone to recording
        [ ] Recording lands in the last-used space

MS-134 · Copy review pass                                         [0.5d]
Do:     Sweep every string against the banned-terms list: therapy, treat,
        heal, diagnos*, anxiety, mental health condition.
AC:     [ ] Zero matches across the codebase and store listing
        [ ] Reflection copy framed as focus / decluttering only

MS-135 · Store listing + assets                                   [1d] ← MS-090
Do:     Screenshots, 20s demo video (talk → notes appear → zoom → replay),
        description, privacy policy, data-safety forms.
AC:     [ ] Both store listings complete
        [ ] Privacy policy states audio handling accurately
        [ ] Data-safety form matches what the app actually sends
```

---

## 17. Cross-Cutting Tasks

Do these continuously, not in a block at the end.

```
MS-140 · AI eval harness in CI                                    [0.5d] ← MS-002
Do:     Run evals on every change to a prompt file. Fail the build if
        note-count or hierarchy-depth regresses.
AC:     [ ] A deliberately broken prompt fails CI

MS-141 · Performance seed script                                  [0.5d] ← MS-053
Files:  scripts/seed-notes.ts
Do:     Generate 500 notes + 300 relationships in one space.
AC:     [ ] Run at the end of every canvas ticket to check for regression

MS-142 · Credit reconciliation job                                [0.5d] ← MS-030
Files:  supabase/migrations/0018_reconcile.sql
Do:     Daily check: sum(credit_ledger.delta) per user == credits_balance.
        Also sum(ai_actions.credits_charged) == sum of usage ledger rows.
AC:     [ ] A manually corrupted balance is flagged within 24h

MS-143 · Error taxonomy                                           [0.5d]
Files:  src/shared/constants/errors.ts, supabase/functions/_shared/errors.ts
Do:     One shared error code list: INSUFFICIENT_CREDITS, NEEDS_OWN_KEY,
        AI_SCHEMA_FAILED, TRANSCRIBE_FAILED, PROVIDER_AUTH_FAILED.
AC:     [ ] Every Edge Function returns a code from this list
        [ ] Every code maps to a user-facing message in one place

MS-144 · Cost dashboard query                                     [0.5d] ← MS-073
Files:  supabase/queries/cost.sql
Do:     Per-user raw_cost_usd vs credits_charged, weekly. Find the users
        burning margin.
AC:     [ ] Query returns cost, revenue equivalent, and effective markup
```

---

## 18. Release Checklist

Run before every store submission.

**Security**
- [ ] RLS CI test green — every public table protected
- [ ] `npx expo export` grepped for `sk-`, `AIza`, `sk-ant` — zero matches
- [ ] `encrypted_key` unreadable with a user JWT
- [ ] Second-user JWT reads zero rows from every table
- [ ] Storage bucket private, path-scoped

**Money**
- [ ] Failed AI call charges 0 credits (test all 4 failure paths)
- [ ] Concurrent extraction cannot overdraw
- [ ] Replayed receipt grants once
- [ ] Reconciliation job returns zero discrepancies
- [ ] Package total_credits match the spec table exactly

**Performance**
- [ ] 500-note seed pans at 60fps on a mid-range Android
- [ ] Dragging one note = 0 renders of others (profiler screenshot attached)
- [ ] Cold start to canvas < 1.5s from persisted cache
- [ ] Stop-recording to notes-on-canvas < 20s median

**Product**
- [ ] Extraction never exceeds 6 notes for 60s of audio
- [ ] Every voice note replays its original audio in 2 taps
- [ ] Undo restores exact prior state
- [ ] Banned-terms sweep clean

---

## 19. Parallelization Notes

If a second developer joins, the clean split is:

| Track A (backend) | Track B (client) |
| --- | --- |
| E1 migrations, RLS | E1 app scaffold, tokens |
| E2 credit RPCs | E2 credits UI |
| E3 transcribe function | E3 recorder + upload |
| E5 context/layout/extract | E4 canvas entirely |
| E8 verify-purchase | E8 purchase UI |
| E10 crypto + adapters | E10 keys screen |

**Interface contracts to freeze on day one** so the tracks don't collide:
`database.types.ts`, the Edge Function request/response shapes, and
`src/shared/constants/errors.ts`.

**The one thing that cannot be parallelized:** Epic 0. Both people should read
the eval output before either writes code.

---

## The Five Rules of This Plan

1. **Gate 0 and Gate 7 are hard stops.** Everything else can slip.
2. **Epic 5 is the product.** If you're running late, cut from E9/E10/E11, never E5.
3. **Run the 500-note seed after every canvas ticket** — performance regresses silently.
4. **Never mark a ticket done on a simulator.** Gestures and audio lie there.
5. **If a ticket takes more than 2× its estimate, stop and re-scope it.** That
   signal means the design is wrong, not that you're slow.