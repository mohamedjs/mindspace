# 11 — Two new features for the web build

These are **not** in the native app. They are additions to the port, requested
after the parity plan was written. Everything in `01`–`10` still applies; this
file adds to it.

Build them **after** parity, in Phase 9. Both touch code you will have just
written, and neither is worth debugging on top of an incomplete canvas.

| Feature | Scope | Where it lands |
|---|---|---|
| **A. Arrow tool** — connect two notes as parent/child by dragging an arrow | Canvas, connectors, a new port method, cycle safety | §11.1 |
| **B. Desktop sidebar** — the header becomes a claude.ai-style left sidebar | Layout, routing, navigation, spaces | §11.2 |

---

# 11.1 — Arrow tool: draw a parent → child link

## What the user asked for

> "new feature icon arrow to connect two notes with each other as parent child
> depending on arrow direction"

**Drag from the parent to the child. The arrowhead points at the child.**

## 11.1.1 The data question — answer it correctly first

There are **two** places in the schema that could store a link, and picking the
wrong one produces an arrow nothing else in the app understands.

| Candidate | What it is | Verdict |
|---|---|---|
| `sticky_notes.parent_id` | Single-valued FK, `on delete set null` | ✅ **Use this** |
| `relationships` table | `from_note_id` / `to_note_id` / `type` enum incl. `child_of`, written by `ai-extract` for AI-detected relations | ❌ Not for this |

`parent_id` is what **everything else already keys on**: `NoteConnectors`, the
sub-note count badge, `useNoteTree`, list-view indentation, the `showChildNotes`
toggle, `placeChild` orbit placement, cluster drag, and the
`promote_children_on_soft_delete` trigger.

The `relationships` table is populated by `ai-extract` but **nothing in the
client reads it.** Writing arrows there would draw a line that no other feature
recognises — no indentation, no cluster drag, no promotion on delete.

> Log in your summary: `relationships` is currently write-only. Surfacing
> AI-detected non-parent relations (`supports`, `contradicts`, `depends_on`) as
> a second class of connector is a genuine future feature — and it is **not**
> this one.

## 11.1.2 This needs a new port method — the first one

`NoteRepository` has `updateContent`, `updateColor`, `updateType`,
`updatePosition`, `moveMany`, `remove`. **There is no way to change a note's
parent.** `parentId` can only be set at `create()`.

This is exactly the case rule 3 in the README anticipated: *"If a web
implementation needs a new capability, add a method to the port — never bypass
it."*

```ts
// src/core/ports/index.ts — add to NoteRepository
export interface NoteRepository {
  // …existing methods…

  /**
   * Re-parent a note, or detach it with null.
   *
   * parent_id is single-valued, so connecting an already-connected note
   * replaces its old link rather than adding a second one. Callers must
   * reject cycles before calling this — see wouldCycle().
   */
  updateParent(noteId: string, parentId: string | null): Promise<void>;
}
```

```ts
// src/infrastructure/supabase/noteRepository.ts
async updateParent(noteId, parentId) {
  const { error } = await supabase
    .from('sticky_notes')
    .update({ parent_id: parentId })
    .eq('id', noteId);
  if (error) throw error;
},
```

Then the usual chain: `notes.api.ts` delegate → `useSetNoteParent` mutation hook
with an optimistic update → the canvas.

No migration. No edge function. `parent_id` already exists and RLS already
covers the update.

## 11.1.3 Cycle prevention — do this before the UI

**A cycle will hang the app.** `CanvasRoot` builds `descendantsMap` with a
recursive walk that memoises *after* returning:

```ts
const getDescendants = (id) => {
  if (map[id]) return map[id];        // ← not set until the walk completes
  const children = childrenMap[id] || [];
  let all = [...children];
  for (const child of children) all = all.concat(getDescendants(child));
  map[id] = all;
  return all;
};
```

With `A → B → A`, `getDescendants(A)` recurses into `B`, which recurses into `A`,
whose entry is still unset. Stack overflow, white screen, and a database row that
reproduces it on every reload.

Today no cycle is possible: `parent_id` is only ever written by `create()` on a
brand-new note. **The arrow tool is the first thing that can create one.**

Two guards, both required:

**Guard 1 — reject the connection.** Pure function, unit-tested:

```ts
// src/features/canvas/utils/graph.ts
/**
 * Would making `parentId` the parent of `noteId` create a cycle?
 *
 * True when they are the same note, or when the proposed parent is already
 * somewhere below the child — connecting those would make a ring that the
 * descendant walk in CanvasRoot cannot terminate on.
 */
export function wouldCycle(
  noteId: string,
  parentId: string,
  parentOf: Map<string, string | null>
): boolean {
  if (noteId === parentId) return true;

  let cursor: string | null | undefined = parentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === noteId) return true;
    if (seen.has(cursor)) return true;   // pre-existing corruption; refuse anyway
    seen.add(cursor);
    cursor = parentOf.get(cursor) ?? null;
  }
  return false;
}
```

Walking **up** from the proposed parent is O(depth), not O(n).

**Guard 2 — make the walk cycle-proof anyway.** Add a `visiting` set to
`getDescendants` so corrupt data degrades to a wrong tree instead of a crash:

```ts
const getDescendants = (id: string, visiting = new Set<string>()): string[] => {
  if (map[id]) return map[id];
  if (visiting.has(id)) return [];      // cycle: stop rather than recurse forever
  visiting.add(id);
  // …unchanged…
};
```

Guard 1 is the fix. Guard 2 is why a bad row somewhere else can never take the
board down.

Tests to write:

```
wouldCycle
  ✓ rejects a note as its own parent
  ✓ rejects connecting a note to its direct child
  ✓ rejects connecting a note to a grandchild
  ✓ allows connecting two unrelated roots
  ✓ allows re-parenting a child to a different branch
  ✓ terminates on an already-corrupt cycle
```

## 11.1.4 Interaction

**Modal tool.** Click the arrow icon → the tool arms → the next drag draws a
link instead of moving a note.

| Step | Behaviour |
|---|---|
| Arm | Toolbar arrow button becomes `active`; board cursor → `crosshair`; **note dragging is disabled** while armed |
| Hover a note | Note gets an accent outline: "this can be an endpoint" |
| `pointerdown` on a note | That note is the **parent**. Start a rubber-band line from its centre |
| `pointermove` | Line follows the pointer, arrowhead at the pointer end |
| Hover a valid target | Target outlines in the accent colour |
| Hover an invalid target (self, or a descendant) | Target outlines in the **warning** colour, arrowhead shows a "no" state. Do not wait until release to say no |
| `pointerup` on a valid note | `setNoteParent(targetId, sourceId)`. Tool **disarms** (one link per activation — arm again for the next) |
| `pointerup` on empty canvas or an invalid target | Cancel silently. Do **not** create a note |
| `Escape`, or right-click | Cancel and disarm |

Keep the tool modal rather than adding a drag-handle to every note: handles
collide with the existing long-press-to-drag and long-press-to-recolour
gestures, and this canvas already has three gestures competing on a note.

## 11.1.5 What re-parenting does *not* do

Decide these once, here, because each is a plausible wrong guess:

| Question | Decision | Why |
|---|---|---|
| Resize the note to `CHILD_WIDTH` × `CHILD_HEIGHT` (150×110)? | **No** | Those dimensions exist so AI-generated sub-notes fit an orbit. Shrinking a note the user wrote and placed is destructive |
| Move the note into orbit via `placeChild()`? | **No** | The user drew an arrow between two specific positions. Teleporting the target discards the spatial intent they just expressed. `placeChild` is for notes that have no position yet |
| Replace an existing parent link? | **Yes, silently** | `parent_id` is single-valued. Redrawing an arrow re-parents. This is the expected mental model |
| Move the child's own children with it? | **Yes, implicitly** | They stay attached via their own `parent_id`; the subtree just hangs off a new place. Nothing to do |
| Renumber or re-colour anything? | **No** | |

## 11.1.6 The `showChildNotes` trap

`showChildNotes = false` hides every note with a `parentId`. So if the user has
that setting off and draws an arrow, **the target note vanishes the instant they
connect it.** That reads as "the arrow tool deleted my note."

Required handling: after a successful connection, if `showChildNotes` is false,
show a toast — *"Now a sub-note of «parent title»"* — with two actions:
**Show sub-notes** (flips the setting) and **Undo** (sets `parentId` back to its
previous value). Capture the previous parent before the mutation.

## 11.1.7 Detaching and deleting a link

Connectors are currently `pointer-events: none`. The arrow tool makes them
objects the user can act on, so they need a hit area:

```html
<!-- Wide invisible stroke for hit-testing, visible stroke on top -->
<path d={d} stroke="transparent" strokeWidth={16} fill="none" style={{ pointerEvents: 'stroke' }} onClick={…} />
<path d={d} stroke={colors.line} strokeWidth={2} fill="none" markerEnd="url(#arrowhead)" pointerEvents="none" />
```

- **Click a connector** → selected (thicker, accent colour).
- **`Delete` / `Backspace`** → `setNoteParent(childId, null)`.
- **Right-click** → a small menu with "Detach".
- Clicking empty canvas clears the selection.

Keep the parent layer `pointer-events: none` and opt **in** per path, or the
connectors' bounding box (which is deliberately padded by 1000px — see `06`
§6.5) will swallow clicks meant for the board.

## 11.1.8 Arrowheads

`NoteConnectors` currently draws undirected paths. Add a marker:

```html
<defs>
  <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
  </marker>
</defs>
```

`orient="auto-start-reverse"` rotates the head to the path direction.

Two details:

- **Stop the path at the child's edge, not its centre.** An arrowhead buried
  under the note is invisible. Intersect the centre-to-centre line with the
  child's rectangle and end there, minus ~4px.
- **`markerWidth`/`markerHeight` are in stroke widths, so heads scale with the
  canvas zoom automatically** — but at 0.12 zoom they become specks. Either
  scale the stroke inversely below ~0.4 zoom, or drop the markers there. Pick
  one and comment it.

This improves the **existing** AI-generated connectors too: today they show that
two notes are related but not which way round.

## 11.1.9 Toolbar: six becomes seven

`06` §6.8 and the native app both say **exactly six tools**, deliberately —
"a tool strip that needs scrolling is a tool strip nobody uses."

The arrow makes it **seven**. That is a direct instruction from the product
owner and it supersedes the earlier constraint. Seven still fits a vertical rail
without scrolling at any supported height.

| # | Icon | Label |
|---|---|---|
| 1 | `StickyNote` | Add a note |
| 2 | **`ArrowRight`** | **Connect two notes** |
| 3 | `Frame` | Add a group frame |
| 4 | `LayoutGrid` | Tidy notes into a grid |
| 5 | `Scan` | Fit everything on screen |
| 6 | `Mic` | Recordings in this space |
| 7 | `Eye` / `EyeOff` | Show / hide sub-notes |

Arrow sits at position 2, next to "add a note" — both create structure. Do not
put it at the end next to the view toggles.

`lucide-react` alternatives if `ArrowRight` reads too plainly next to the other
glyphs: `MoveRight`, `Spline`, `Waypoints`. Pick one and keep it.

## 11.1.10 Arrow tool acceptance criteria

- [ ] Arrow tool arms and disarms; cursor and button state reflect it
- [ ] Note dragging is disabled while armed
- [ ] Rubber-band line follows the pointer from the source note's centre
- [ ] Valid targets outline in accent; invalid in warning, **before** release
- [ ] Release on a valid note sets `parent_id`, optimistically and then durably
- [ ] Arrowhead points at the **child**; the path stops at its edge
- [ ] Self-link rejected; descendant-as-parent rejected; the app does not hang
- [ ] Re-parenting an existing child replaces the old link
- [ ] Connecting while `showChildNotes` is off shows the toast with **Show sub-notes** and **Undo**
- [ ] Click a connector to select; `Delete` detaches; right-click offers "Detach"
- [ ] Detaching restores the note to top level, keeping its own children
- [ ] The re-parented note keeps its size and position
- [ ] List view indentation and sub-note counts update to match
- [ ] `graph.test.ts` covers all six `wouldCycle` cases
- [ ] Works with mouse and with touch

---

# 11.2 — Desktop sidebar

## What the user asked for

> "in desktop need header to be sidebar like in claude ai website as desktop
> view"

A persistent left sidebar on desktop, replacing the floating header. Mobile
keeps exactly what `04` and `05` describe.

## 11.2.1 Breakpoints

| Width | Navigation |
|---|---|
| `< 768px` | Current design: floating clay header, `SpacesSheet` as a bottom sheet |
| `768–1023px` | Current header; sheets become **centred modals** (already specified in `05` §5.6) |
| `≥ 1024px` | **Sidebar.** Header is gone |

Use `lg:` (1024px) as the sidebar breakpoint. It must be a **CSS** breakpoint,
not a JS width check, or the layout flashes on load and breaks SSR.

## 11.2.2 Anatomy — mapped from claude.ai

```
┌─ 260px ─────────────┐┌─────────────────────────────────┐
│ ☰  MindSpace        ││                                 │
│                     ││  (canvas / list / settings /    │
│ [ + New space ]     ││   credits / plans / keys)       │
│                     ││                                 │
│ SPACES              ││                                 │
│ ▸ Work          12  ││   canvas toolbar sits here,     │
│ ▸ Book novel     4  ││   at the left edge of THIS area │
│ ▸ Client X       7  ││                                 │
│  …scrolls…          ││                                 │
│                     ││                                 │
│ ─────────────────── ││                                 │
│ ⚡ 2,410            ││                                 │
│ ⚙  Settings         ││                                 │
│ ─────────────────── ││                                 │
│ (M) Mohamed      ⋯  ││                                 │
└─────────────────────┘└─────────────────────────────────┘
```

| Zone | Contents | Replaces |
|---|---|---|
| **Header** | Collapse toggle + wordmark | — |
| **Primary action** | "New space" button | `SpacesSheet`'s create row |
| **Spaces list** | Scrollable; emoji, name, note count; active row highlighted; hover `⋯` → Rename / Delete | The whole of `SpacesSheet` on desktop |
| **Footer nav** | Credit chip → `/credits`; Settings → `/settings`; **API keys → `/keys` only when the plan `isByok`** | The header's credit chip and settings gear |
| **Account row** | Avatar initial, full name, email; menu with Plans and Sign out | The sign-out buried in the credits screen header |

### Collapsed state
Collapses to a **~64px icon rail**: wordmark → logo mark, space rows → emoji
only with a tooltip, footer → icons. Persist the flag in `localStorage` under
`mindspace:sidebar` (same pattern as the five preferences in `03` §3.7) and
apply it before first paint with the same inline script that sets `data-theme`,
or the sidebar visibly snaps on every load.

## 11.2.3 This changes the route structure — use a route group

The sidebar must persist across `/`, `/note/[id]`, `/settings`, `/credits`,
`/plans`, `/keys` **without remounting** on navigation. In the App Router that
means a shared layout, which means a **route group**:

```
app/
├── layout.tsx              root: <html>, fonts, providers
├── sign-in/page.tsx        no sidebar
├── (app)/
│   ├── layout.tsx          ← AppShell: sidebar + content area
│   ├── page.tsx            home (canvas / list)
│   ├── note/[id]/page.tsx
│   ├── record/page.tsx     full-bleed — see below
│   ├── settings/page.tsx
│   ├── credits/page.tsx
│   ├── plans/page.tsx
│   └── keys/page.tsx
```

**This supersedes the flat route list in `04` §4.1.** Paths are unchanged —
route groups do not appear in the URL.

Two exceptions:

- **`/record`** should be full-bleed even on desktop. Recording is a focused,
  single-purpose moment; a sidebar full of navigation invites the user to leave
  mid-recording. Either place it outside `(app)`, or have `AppShell` hide the
  sidebar on that path.
- **`/sign-in`** stays outside the group and has no shell.

## 11.2.4 What the header becomes

On desktop the floating clay header is **removed**, not restyled. Its three jobs
move:

| Header element | Desktop home |
|---|---|
| Space name + `▾` (opens `SpacesSheet`) | The sidebar's spaces list. The active space's name becomes a plain title in the content area |
| Credit chip | Sidebar footer |
| Settings gear | Sidebar footer |
| Hint text *"Pinch to zoom · hold a note to move it"* | Rewrite for desktop: *"Scroll to zoom · drag a note to move it"*. It is wrong on desktop as written |

Keep the header component. It still renders below 1024px. Do not fork the
screens — render `<AppHeader className="lg:hidden" />` and
`<Sidebar className="hidden lg:flex" />`.

## 11.2.5 Collision: the canvas toolbar is also on the left

`CanvasToolbar` is a vertical strip on the **left edge**. With a sidebar there
too, they stack into two rails.

**Recommended: leave it.** Anchor the toolbar to the left edge of the *content
area*, not the viewport, so it sits immediately right of the sidebar. Figma does
exactly this and it reads fine. It also means zero change to the component.

The alternative — moving the toolbar to a floating bottom-centre pill, FigJam
style — is better looking on wide screens and more work, and it collides with
the record FAB, which is bottom-centre. If you want it, move the FAB to the
bottom-right first. **Do not do both changes in one commit.**

## 11.2.6 Full-screen pages become panes

With a persistent sidebar, `/settings`, `/credits`, `/plans` and `/keys` are no
longer full-screen pushes — they render in the content area. So on desktop:

- The **back chevron** in each of those headers is meaningless. Hide it at `lg:`.
- Constrain the content: `max-width: 720px; margin-inline: auto`. Settings rows
  stretched across 1400px look broken.
- The active nav item in the sidebar should be highlighted.

`/note/[id]` is the interesting one. On mobile it is a full-screen push. On
desktop the better pattern is a **right-hand panel beside the canvas**, so you
can see the board while editing. That is genuinely nicer and genuinely more work
(the canvas must reflow, and the URL still has to be shareable).

**Port default: keep it full-content-area on desktop too.** Log the side-panel
idea in `10-open-questions.md` §10.1 as a product decision, not a port decision.

## 11.2.7 Accessibility and behaviour

- `<nav aria-label="Spaces">` around the spaces list; `aria-current="page"` on
  the active row.
- The collapse toggle is a `<button>` with `aria-expanded`.
- Sidebar is keyboard-navigable; visible focus rings throughout.
- The content area must be reachable by keyboard without tabbing through every
  space — add a "Skip to content" link.
- **Do not** trap focus. It is a persistent region, not a dialog.
- Respect `prefers-reduced-motion` on the collapse transition.
- The spaces list scrolls independently; the footer and account row stay pinned.

## 11.2.8 Sidebar acceptance criteria

- [ ] Sidebar appears at ≥1024px and only there; header appears below it
- [ ] Switching is pure CSS — no flash, no layout shift, no JS width check
- [ ] Sidebar persists across every in-app navigation **without remounting** (verify: an open dropdown survives a route change)
- [ ] Spaces list: create, switch, rename, delete; active row highlighted; counts correct
- [ ] Credit chip shows the number only and links to `/credits`
- [ ] Settings link; API keys link **only** on the BYOK plan
- [ ] Account row shows name and email; menu offers Plans and Sign out
- [ ] Collapse to icon rail; state persists across reload with **no snap on load**
- [ ] `/record` is full-bleed, no sidebar
- [ ] `/sign-in` has no shell
- [ ] Canvas toolbar sits at the content area's left edge, not under the sidebar
- [ ] Settings / credits / plans / keys are width-constrained and drop their back chevron at `lg:`
- [ ] Desktop hint text says "Scroll to zoom", not "Pinch to zoom"
- [ ] Keyboard navigable; skip-to-content link; `aria-current` on the active space
- [ ] Nothing regresses below 1024px — the mobile app is byte-identical in behaviour

---

## 11.3 Where these land in the plan

Add to the `README` §4 phase table:

| Phase | Deliverable |
|---|---|
| **9** | Arrow tool (§11.1) |
| **10** | Desktop sidebar (§11.2) |

Both after Phase 8's parity sweep. Doing them earlier means debugging a new
feature on top of an unfinished canvas, and neither is on the critical path to a
working app.

Arrow first: it is smaller, self-contained, and its cycle-safety work protects
everything else. The sidebar restructures routing, so it wants a stable app
underneath it.
