# 09 — Parity checklist (the definition of done)

Every box must be checked against a **running app talking to the real Supabase
project**, not against the code. "It compiles" is not evidence.

This file covers **parity only**. The two new features have their own criteria:
`11` §11.1.10 (arrow tool) and `11` §11.2.8 (desktop sidebar). Finish this list
before starting either.

## 9.1 Auth

- [ ] Sign up with email, password, **and full name**
- [ ] Full name reaches `user_metadata.full_name` and shows in Settings
- [ ] Sign in / sign out
- [ ] Password reset email sends
- [ ] Signed-out visitor to any private route is redirected to `/sign-in` **by the server** (`proxy.ts`), not just the client
- [ ] Signed-in visitor to `/sign-in` is redirected to `/`
- [ ] `/auth/*` stays public
- [ ] Session survives a full page reload
- [ ] Session survives token expiry mid-session (refresh works)

## 9.2 Spaces

- [ ] A new account lands in an auto-created space
- [ ] Space switcher lists all spaces with note counts
- [ ] Create, rename, delete a space
- [ ] The last-used space is restored on reload (see `04` §4.2 — a fix, not a port)

## 9.3 Notes — data

- [ ] Notes load for the selected space
- [ ] Create a blank note → editor opens immediately
- [ ] Edit title and content, autosaving
- [ ] Change note type; change colour
- [ ] Soft delete; **sub-notes survive and are promoted to the parent's level**
- [ ] Sub-note count badge shows the true total even when sub-notes are hidden
- [ ] Optimistic updates: dragging, recolouring and editing feel instant
- [ ] Offline: edits queue and replay (`networkMode: 'offlineFirst'`)
- [ ] Query cache persists across reload (7-day `gcTime`)

## 9.4 Canvas

Full list in `06` §6.12. Summary:

- [ ] Pan: mouse, touch, trackpad
- [ ] Zoom: wheel, ctrl+wheel, pinch, keyboard — all focal-correct
- [ ] Grid pans and scales with the notes at every zoom down to 0.12
- [ ] Orbs fixed to the viewport
- [ ] `canvasBackgroundEnabled = false` hides both
- [ ] Tap → editor; long-press → colour picker; hold+drag → move
- [ ] Parent drag moves all descendants, in **one** mutation
- [ ] Group frame drag moves every note inside it
- [ ] Group frame: create, rename, resize, delete
- [ ] Connectors follow notes live during a drag
- [ ] `showChildNotes = false` hides sub-notes and their connectors
- [ ] All six toolbar tools work
- [ ] Tidy, fit-to-view, add-note and add-frame are correct at zoom ≠ 1

## 9.5 List view

- [ ] Settings toggle switches the whole app between Canvas and List
- [ ] Notes grouped by day, newest first
- [ ] Sub-notes indented under their parents
- [ ] Tap a row → editor
- [ ] Record button present and working from the list
- [ ] Empty-day state renders

## 9.6 Calendar tab

- [ ] Calendar is a **tab inside the list view**, not a third top-level mode
- [ ] Month header + week strip
- [ ] Tap a day → that day's notes
- [ ] Notes with `dueAt` appear on that date
- [ ] Notes without `dueAt` fall back to `createdAt`
- [ ] `day.test.ts` (10 tests) passes unchanged

## 9.7 Voice — the core loop

- [ ] Microphone permission prompt, with correct copy for denied / missing / busy
- [ ] Live timer and level meter while recording
- [ ] Auto-stop at the plan's cap; free tier is 5 minutes; unknown plan **fails closed to 5**
- [ ] Stop → recording row created **before** upload
- [ ] Upload to `recordings/{userId}/{spaceId}/{recordingId}.{ext}` with the **correct extension for the blob's actual container**
- [ ] Retry with backoff on upload failure (3 attempts)
- [ ] Navigate to `/?recordingId=…`; live banner appears
- [ ] Banner shows every stage; `transcribed` keeps it up; `completed`/`failed` clear it
- [ ] Notes appear on the canvas / list without a manual refresh
- [ ] A failed extraction retries **without re-transcribing** (transcript reused)
- [ ] Recordings sheet lists this space's recordings with status
- [ ] Microphone tracks stopped and object URL revoked after upload
- [ ] Tested in Chrome **and Safari** — different audio containers

## 9.8 Sub-notes and the two microphones

- [ ] Recording from **inside a note** creates sub-notes attached to that parent
- [ ] Sub-notes are placed in an orbit around the parent without overlapping siblings **or unrelated notes**
- [ ] The header microphone (next to delete) writes **the note's own content**
- [ ] It appends, and only replaces when the content is empty or `"New note"`
- [ ] `fillNoteId` and `parentNoteId` are never both set

## 9.9 Dates and reminders

- [ ] Speaking a deadline sets `dueAt` on the right note, in the user's timezone
- [ ] The note appears on that date in the calendar
- [ ] A reminder fires while the tab is open (option B in `07` §7.6)
- [ ] Permission asked on a user gesture, not on load
- [ ] No duplicate reminders after repeated note refetches
- [ ] Past dates never fire immediately

## 9.10 Settings

- [ ] Profile: avatar initial, inline-editable full name, read-only email
- [ ] AI models: chat picker **filtered to providers the user holds a key for**
- [ ] Voice → text picker with the "always runs on MindSpace credits" subtitle
- [ ] Theme: light / dark / system, persisted, **no flash of the wrong theme on load**
- [ ] "Your notes as" Canvas | List
- [ ] Hand-drawn text toggle switches the font — and Arabic still renders correctly with it on
- [ ] Canvas background toggle
- [ ] Sub-notes on canvas toggle
- [ ] Plans row → `/plans`
- [ ] "Your API keys" row visible **only** on the BYOK plan
- [ ] Sign out with confirmation
- [ ] Delete account with confirmation; removes everything and signs out
- [ ] Every string matches `04` §4.4 verbatim

## 9.11 Credits

- [ ] Header chip shows the number only — **no "EGP"**
- [ ] Balance = `creditsBalance - creditsReserved`
- [ ] EGP equivalent and estimated minutes shown
- [ ] Ledger lists entries with reason, date, signed delta, running balance
- [ ] Negative deltas in the warning colour
- [ ] Pagination / load-more works
- [ ] Out-of-credits sheet appears on `insufficient_credits` and links to `/plans`

## 9.12 Plans and payments

- [ ] All five plans render, ordered by `sort_order`, values read from the API
- [ ] Featured plan shows "Popular"; current plan is marked and not re-purchasable
- [ ] BYOK card shows the transcription-credits body, not the generic one
- [ ] Recording caps and credit→minutes labels use `creditsTo*Label` helpers
- [ ] Payment sheet lists channels; unconfigured ones **disabled**
- [ ] TestPay end-to-end: start → confirm → credits granted → ledger row
- [ ] A repeated confirm grants **once** (idempotence holds through the web client)
- [ ] `provider_not_configured` renders a clear message, not a crash

## 9.13 BYOK

- [ ] `/keys` redirects to `/plans` for non-BYOK users
- [ ] Exactly three providers: OpenAI · GPT, Anthropic · Claude, Google · Gemini
- [ ] "Voice still runs on credits" callout present, verbatim
- [ ] Key input is masked, `autoComplete="off"`, never echoed back
- [ ] Saved keys show only `keyHint`
- [ ] An inactive key shows the provider's rejection message
- [ ] Remove key, with confirmation
- [ ] Saving a key narrows the chat model picker to that provider's models

## 9.14 Errors

- [ ] All twelve codes in `07` §7.5 produce their exact title / message / action
- [ ] Each action button navigates or retries correctly
- [ ] Codes survive the edge → `PipelineError` → UI path (spot-check by forcing `insufficient_credits`)
- [ ] Stored failures on old recordings render via `describeStoredFailure`

## 9.15 Cross-cutting

- [ ] `npm run typecheck` clean
- [ ] `npm run test` green, **including the ported `architecture.test.ts`**
- [ ] No component, hook or page imports `@supabase/supabase-js`
- [ ] `next build` succeeds with Turbopack (the default)
- [ ] Works at 375px and 1440px
- [ ] Full keyboard navigation; visible focus rings; Escape closes dialogs
- [ ] `prefers-reduced-motion` honoured
- [ ] Arabic notes render in Baloo and lay out with `dir="auto"`
- [ ] No console errors on any route
- [ ] Lighthouse: no accessibility regressions below 90

## 9.16 Tests that must still pass, unchanged

| File | Tests | Covers |
|---|---|---|
| `core/architecture.test.ts` | 2 | The layering boundary |
| `features/canvas/utils/coords.test.ts` | 11 | Canvas transform, focal zoom, grid wrapping |
| `features/ai/services/layout.test.ts` | — | Note placement, child orbit, overlap regression |
| `features/ai/schemas/extraction.test.ts` | — | The AI output contract |
| `features/notes-list/services/day.test.ts` | 10 | Day bucketing |
| `features/voice/services/upload.test.ts` | — | Storage paths |
| `shared/theme/color.test.ts` | — | `shade()` |
| `shared/theme/fonts.test.ts` | — | Font selection / `hasArabic` |

**79 tests across 8 suites at the time of writing.** If any of them needs
editing to pass, you have changed behaviour — stop and work out whether that was
intentional.
