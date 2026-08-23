# 10 — Decisions you must not make alone

Everything here changes product behaviour, costs money, or touches the backend.
**Implement the "port default" column, note the question in your summary, and
move on.** Do not block, and do not silently pick the other branch.

## 10.1 Blocking-if-wrong — ask before shipping

| # | Question | Port default | Why it needs a human |
|---|---|---|---|
| 1 | **Does the web app replace the mobile app, or run alongside it?** | Alongside. Keep `src/` intact | Determines whether "install to home screen" / PWA is required, whether mobile-web layout must be phone-perfect, and whether the Expo app keeps getting features |
| 2 | **Reminders when the tab is closed** — build Web Push? | No. In-app scheduling only (`07` §7.6 option B) | Web Push needs a new table for subscriptions and a scheduled job. That is a backend change, which this port is forbidden from making |
| 3 | **Payments on the web** | Nothing new. Only TestPay, same as native | Play Billing and StoreKit **cannot** be used from a browser. Charging web users requires a card gateway or InstaPay — a commercial decision, not a technical one |
| 4 | **Desktop layout** | ~~Open~~ **Decided.** Sheets become centred modals above 768px, and a claude.ai-style sidebar replaces the header at ≥1024px — spec in `11` §11.2 | Was an open question; the product owner has since specified it. Build parity for phone first, then Phase 10 |
| 5 | **Full RTL** | `dir="auto"` on note text only | Arabic is first-class in the *content*, but the *chrome* has never been mirrored. Full RTL touches every component |
| 6 | **Note editor as a desktop side panel?** | No — full content area, same as mobile | With a persistent sidebar (`11` §11.2), editing a note beside the visible board is clearly nicer. It also means reflowing the canvas and keeping the URL shareable. Product call, not a port call |
| 7 | **Surface non-parent relations?** | No | The `relationships` table already stores AI-detected `supports` / `contradicts` / `depends_on` links and **nothing reads them**. A second class of connector is a real feature; the arrow tool in `11` §11.1 is explicitly not it |

## 10.2 Known issues in the current app — do not fix during the port

Fixing these while also changing platform makes every regression
un-bisectable. Carry them across as-is and log them.

| Issue | Detail |
|---|---|
| **Recording cap is client-side only** | `RecordScreen` enforces `maxRecordingMinutes`; nothing server-side does. A modified client can exceed its tier. The fix belongs in the `transcribe` edge function |
| **Monthly refill has no plan filter** | `monthly_free_refill()` tops **any** account below 100 credits back up to 100, including paid subscribers who burned through their allowance |
| **Subscription renewal is not automated** | Confirm grants once and stores `current_period_end`; nothing advances it |
| **`ALLOW_TEST_PAY` is enabled** | Anyone can subscribe for free while it is set. Must be unset before taking real money — on either platform |
| **Two migrations numbered `0022`** | Both applied; ambiguous on a fresh `db push`. Do not renumber |
| **BYOK runtime paths unverified** | No OpenAI / Anthropic / Google key has ever been used against this code. Bugs there predate the port |
| **`descendantsMap` has no cycle guard** | The recursive walk in `CanvasRoot` memoises after returning, so a `parent_id` cycle would overflow the stack. No cycle is reachable today — but the arrow tool makes one reachable, which is why `11` §11.1.3 adds both a rejection check and a guard in the walk. Add them **with** that feature, not before |
| **`api/` modules bypass the DI container** | They import `supabaseContainer` directly instead of using `useRepositories()`. The DI path exists and works but is unused. Changing platform *and* wiring at once is a bad idea — port as-is |
| **3 pre-existing tsc errors in `ThemedToast.tsx`** | Excluded from every check today. Do not port the errors; write the web toast cleanly |

## 10.3 Deliberate behaviour changes the port should make

These are improvements the web makes possible or necessary. **Do them, and list
them explicitly in your final summary** so nobody mistakes them for accidents.

| Change | Reason |
|---|---|
| **Restore the last-used space on load** | `selectSpace()` already writes `mindspace:lastSpace`; nothing reads it. Always jumping to `spaces[0]` is clearly a bug, not a decision |
| **Mouse drag starts on a 4px threshold, not a 120ms hold** | A hold-to-drag delay is a touch affordance. Keep 120ms for `pointerType === 'touch'` |
| **Wheel and keyboard zoom** | The web has inputs RN did not. Wheel zoom is table stakes on desktop |
| **`<Text>` wrapper deleted** | CSS inherits `font-family`; RN does not. The Arabic rule is reproduced by font-stack fallback order |
| **Colour wheel → swatch grid** | The app only ever assigns palette colours. A full HSV picker was always more than the feature needed |
| **Sheets become centred modals on desktop** | A bottom sheet on a 1440px monitor is a phone app in a browser |
| **Refetch recording status on `visibilitychange`** | Realtime sockets drop when a tab sleeps. Native had no equivalent problem |

## 10.4 Explicitly out of scope

Do not do any of these, however tempting:

- Moving data fetching to Server Components / Server Actions. See `02` §2.6.
- Enabling `cacheComponents` / PPR. Nothing here is cacheable.
- Extracting a shared `packages/core` monorepo package. Copy first, extract
  later — if ever.
- Swapping React Query for anything else.
- Adopting a canvas or diagramming library. See `02` §2.4.
- Adding an animation library. See `06` §6.7.
- Touching `supabase/`.
- "Improving" the extraction prompt.
- Renumbering migrations.

## 10.5 What to put in your final summary

1. Which parity boxes in `09` are **not** checked, and why.
2. Every item from §10.3 you actually did.
3. Anything you were forced to decide from §10.1, and which way you went.
4. What you verified **in a browser against the real backend**, and what you
   only verified by types and tests. Be specific — "the canvas works" is not a
   verification claim; "panned, pinched, dragged a parent with 3 children at
   0.3 and 2.0 zoom in Chrome and Safari" is.
5. Anything you found that looks wrong in the *existing* app and deliberately
   left alone.
