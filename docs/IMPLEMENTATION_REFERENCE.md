# Implementation reference

**What actually exists in the code, for whoever works on it next.**

The migration docs in [`web-migration/`](web-migration/README.md) describe how
the web app was planned. This file is different: it catalogues what has since
been **built**, in both apps, with the invariants that are easy to break by
accident. Read it before adding to the canvas, the billing model, or the
gesture layer.

Apps: `apps/mobile` (Expo) and `apps/web` (Next.js 16). Paths below are relative
to an app's `src/`, and identical in both unless a row says otherwise.

---

## 1. Canvas geometry — `features/canvas/utils/coords.ts`

One equation describes the board: `screen = translate + world × scale`, with
`transform-origin: top left` on both the note layer and the grid sheet.

| Function | Purpose |
|---|---|
| `worldToScreen(wx, wy, translate, scale)` | Forward projection |
| `screenToWorld(sx, sy, translate, scale)` | Inverse. "Add note at viewport centre" uses it |
| `zoomAbout(focal, translate, from, to)` | The translation that pins a screen point while zoom changes — what makes pinch and wheel zoom feel attached to the pointer |
| `wrapToTile(translate, tile)` | Pan folded into one tile, minus one tile. The infinite-grid trick |
| `gridScale(scale)` | Doubles the grid's world spacing below 0.5 zoom so it never collapses into mush **and** the sheet never needs to exceed 3 viewports |

`MIN_SCALE = 0.12`, `MAX_SCALE = 2.5`. 11 tests in `coords.test.ts`.

**Invariant.** `zoomAbout` contracts everything toward the focal point when
zooming out (`to/from < 1`), so content can never fly off screen from any pan
position. There is a test asserting exactly that — keep it.

## 2. Canvas graph — `features/canvas/utils/graph.ts`

| Function | Purpose |
|---|---|
| `wouldCycle(noteId, parentId, parentOf)` | Would this link create a ring? Walks **up** from the proposed parent: O(depth) |
| `noteBox(note)` | The rectangle a note actually covers on screen |
| `noteAtPoint(wx, wy, notes)` | Hit-test. Topmost wins (later in the array is drawn on top) |
| `notesInRect(rect, notes)` | Overlap test — marquee selection |
| `notesInsideRect(rect, notes)` | Containment test — group-frame membership |
| `withDescendants(ids, descendants)` | A drag set closed under descendants |

**Invariant — rendered size, not stored size.** `StickyNoteItem` renders
`{ width: note.width || 240, minHeight: note.height || 200 }`. `minHeight`:
content pushes notes past the stored number, and the seeded default is only 120.
Every geometry helper goes through `noteBox`, which floors the height. Testing
the stored height leaves the visible lower half of most notes dead to hit-testing
— indistinguishable from a broken tool.

**Invariant — cycles.** `parent_id` has no database-level cycle guard, and
`CanvasRoot`'s `descendantsMap` memoises *after* the recursive walk returns, so a
ring would blow the stack on every load. Two guards, both required: `wouldCycle`
refuses the link, and the walk carries a `visiting` set so a bad row from
anywhere else degrades to a wrong tree rather than a white screen.

18 tests in `graph.test.ts`.

## 3. Canvas tool modes

A single mode decides what a tap or drag on the board does.

| Mobile | Web | Behaviour |
|---|---|---|
| `pan` *(default)* | `pan` | One finger / drag moves the board |
| `select` | `pointer` *(default)* | Mobile: **tap** notes to toggle selection. Web: **drag a marquee** |
| `arrow` | `arrow` | Mobile: **tap parent, tap child**. Web: **drag** a rubber band |
| `write` | `write` | Tap a note to type in it in place |

**The two clients differ on purpose.** Web's press-drag-release and marquee are
mouse gestures; on a phone your finger covers the target, there is no hover to
preview the outcome, and a marquee fights the pan you use constantly. Mobile
therefore uses deliberate taps. Do not "unify" these without re-testing on a
real phone.

Mobile default is `pan`, web default is `pointer` — a drag that drew a selection
box instead of panning would read as broken on a phone.

**Invariant — drag set.** Dragging a note moves the **union** of the selection
(if the note is in it) and every descendant of everything in that set —
`withDescendants`. Neither app did this originally: web moved only the
selection, tearing sub-notes off their parent; mobile moved only descendants.
The union is the only rule where a note's children never detach however the drag
started, and it degrades to today's behaviour for a single note. Committed as
**one** `bulk_move_notes` RPC, never one update per note.

## 4. Worklet declaration order — `features/canvas/components/gestureOrder.test.ts` *(mobile)*

**This one crashed the app.** Reanimated's babel plugin builds a worklet's
closure *at the point the worklet is created*, emitting
`fn.__closure = { modeSV, beginLink, … }`. That object literal is evaluated
during render, so a gesture naming a `const` declared further down the component
throws `Cannot access 'X' before initialization` the moment the canvas mounts —
blank screen, no recovery.

TypeScript cannot see it: the reference is legal, just ordered wrong. The test
parses `CanvasRoot.tsx` and fails if any gesture closes over a binding declared
below it. **Keep gesture definitions after every callback they reference.**

## 5. Notes — inline editing

Editing happens on the board; the full editor is for everything else.

| Prop on `StickyNoteItem` | Purpose |
|---|---|
| `onSaveContent(id, { title, content })` | Persist an inline edit. Absent ⇒ no pencil button |
| `editRequested` | The canvas is asking this note to open — the toolbar pencil tool |
| `onEditRequestHandled()` | Consumed immediately, so the same note can be reopened after a save |

Pencil starts, check commits. **Explicit save, not autosave**: on a board you
glance at, a note that quietly rewrote itself would be worse than one extra tap.
The button darkens while dirty, doubling as the unsaved indicator.

**Invariants.** Drafts are local until saved, so a background refetch cannot
overwrite what is being typed. Gestures are removed entirely while a field has
focus — a pointerdown on a caret is someone placing the caret, not starting a
drag. Web additionally stops propagation and handles `Esc` / `⌘↵`.

## 6. Re-parenting — the arrow tool's data path

| Layer | Symbol |
|---|---|
| Port | `NoteRepository.updateParent(noteId, parentId \| null)` |
| Adapter | `infrastructure/supabase/noteRepository.ts` |
| API | `updateNoteParent()` in `features/sticky-notes/api/notes.api.ts` |
| Hook | `useSetNoteParent(spaceId)` — optimistic |

Uses `sticky_notes.parent_id`, **not** the `relationships` table. `parent_id` is
what connectors, sub-note counts, list indentation, `showChildNotes`, orbit
placement, cluster drag and `promote_children_on_soft_delete` all key on.
`relationships` is written by `ai-extract` and read by nothing; an arrow stored
there would draw a line no other feature understands.

Detach differs by platform, deliberately: **mobile** has a "Detach from parent"
row in the note editor (a 3px connector is not a finger target); **web** adds
connector click + `Delete` + right-click on top of that.

## 7. Entitlements — `features/billing/hooks/useEntitlements.ts`

The single place the app asks what an account may do.

```ts
const { plan, aiEnabled, isByok, maxRecordingMinutes, isLoading } = useEntitlements();
```

**AI is an entitlement, not a balance.** A balance answers "can they afford the
next recording"; this answers "is recording part of their plan at all".
Conflating them gives you a microphone that only fails once tapped.

**Invariant — fails closed.** While loading, `aiEnabled` is `false`. The
alternative is a microphone that flashes up on a Free account and vanishes.

**Every recording entry point is gated on it**, and the `/record` route guards
again so a deep link or a back-stack entry cannot bypass the UI:

| Surface | Gated |
|---|---|
| Canvas record FAB | Replaced by "Turn talking into notes" → `/plans` |
| List-view record FAB | Hidden |
| Canvas toolbar "Recordings in this space" | Hidden |
| List header microphone | Hidden |
| Note editor: speak-into-note microphone | Hidden |
| Note editor: sub-notes microphone | Hidden |
| Settings → AI models section | Hidden |
| `/record` route | Redirects to `/plans` |

## 8. Feature flags — `shared/config/features.ts`

| Flag | Env | Default | Effect |
|---|---|---|---|
| `byok` | `EXPO_PUBLIC_FF_BYOK` | **off** | "Your AI" plan, the keys screen, `/keys` |
| `webviewPlans` | `EXPO_PUBLIC_FF_WEBVIEW_PLANS` | on | Subscription page as a web page instead of native cards |

**Invariant — name every variable literally.** Metro inlines
`process.env.EXPO_PUBLIC_*` by scanning for exact member expressions.
`process.env[\`EXPO_PUBLIC_FF_${name}\`]` type-checks, bundles, and then reads
`undefined` on device forever — the flag silently sticks on its default and no
amount of setting the variable changes it. Add a new flag by adding a literal
entry to `RAW`.

BYOK is off because the plan, key screen, model filtering and server-side split
billing are all built but **no provider path has ever been exercised with a live
key**. Turn it on once each has been round-tripped for real.

## 9. Plans — `features/billing/components/plansPage.ts`

`buildPlansPage({ plans, subscription, colors, fontFamily })` returns a complete
HTML document for the subscription screen, rendered in a WebView.

Generated locally and passed as a string: no server, no network fetch, no
offline failure. Plan data comes from the same `listPlans()` the rest of the app
uses; colours are injected from the native palette so it follows the theme.

**Security shape.** The page cannot navigate (`onShouldStartLoadWithRequest`
pins it to `about:blank`), never sees a token, and its only capability is
posting `{ type: 'choose-plan', planId }` back — which goes through the same
handler the native cards use. All interpolated values are HTML-escaped.

`react-native-webview` must stay pinned to the version in
`node_modules/expo/bundledNativeModules.json` (13.16.1) or it will not load in
Expo Go.

## 10. Plan model — migration `0028`

`subscription_plans.ai_enabled boolean not null default true`, plus a real
`free` row so the client reads entitlements from one place instead of
special-casing "no subscription".

| id | EGP | Credits | Max recording | `ai_enabled` |
|---|---|---|---|---|
| `free` | 0 | 0 | — | **false** |
| `hobby` | 50 | 625 | 15 min | true |
| `plus` ⭐ | 150 | 2,025 | 30 min | true |
| `pro` | 300 | 4,500 | 60 min | true |
| `max` | 500 | 8,000 | 120 min | true |
| `byok` | 50 | 900 | 120 min | true *(hidden by flag)* |

Free gets the entire app — boards, sub-notes, groups, connections, list,
calendar, reminders — with the voice pipeline off. Credits are untouched; a plan
without `ai_enabled` simply never reaches the code that spends them.

Read these from `listPlans()` at runtime. The table is for orientation only.

## 11. Running it

Every script, both env files, feature flags and troubleshooting:
[`../COMMANDS.md`](../COMMANDS.md).

```bash
npm run dev:tunnel
```

---

## Invariants worth re-reading before you change the canvas

1. Gesture definitions come **after** every callback they close over (§4).
2. Geometry goes through `noteBox`, never raw `note.height` (§2).
3. `wouldCycle` before any `updateParent`, and keep the `visiting` guard (§2).
4. A drag moves the union of selection and descendants, in one RPC (§3).
5. Entitlements fail closed; gate the route as well as the icon (§7).
6. Feature-flag env vars are named literally (§8).
7. Mobile and web interaction models differ deliberately — verify on a phone (§3).
