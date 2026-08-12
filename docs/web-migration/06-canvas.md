# 06 — The infinite canvas

The hardest part of the port, and the part where a wrong architectural choice
costs the most. Read all of it before writing a line.

## 6.1 The transform — one equation, already unit-tested

Both the note container and the grid sheet use **`transform-origin: top left`**,
so the entire board is:

```
screen = translate + world × scale
```

`src/features/canvas/utils/coords.ts` **already implements every derivation of
this and has 11 passing tests.** Copy it. Copy `coords.test.ts`. Keep both
green. Do not re-derive.

| Function | Purpose |
|---|---|
| `worldToScreen(wx, wy, translate, scale)` | Forward |
| `screenToWorld(sx, sy, translate, scale)` | Inverse — used for "add note at viewport centre" |
| `zoomAbout(focal, translate, fromScale, toScale)` | The translation that pins a screen point while zoom changes. This is what makes pinch/wheel zoom feel attached to the pointer |
| `wrapToTile(translate, tile)` | Pan folded into one tile, minus one tile — the infinite-grid trick |
| `gridScale(scale)` | Doubles the grid's world spacing below 0.5 zoom so the grid never collapses into mush and the sheet never has to be more than 3 viewports wide |

The `'worklet'` directives in that file are Reanimated markers. **On the web
they are inert string-literal statements — harmless.** You may strip them; the
tests pass either way. Stripping is cleaner; leaving them costs nothing.

Constants: `MIN_SCALE = 0.12`, `MAX_SCALE = 2.5`.

## 6.2 DOM structure

```html
<div class="board" style="overflow:hidden; touch-action:none; user-select:none; overscroll-behavior:none">

  <!-- Grid sheet: 3× viewport, transform-origin top-left.
       translate = wrapToTile(pan, GRID_SIZE * gridScale(scale)), scale = gridScale(scale) -->
  <div class="grid-sheet"><svg><!-- <pattern> of two 1px rules, 24px tile --></svg></div>

  <!-- Ambient orbs: fixed to the viewport, NOT transformed. Three radial gradients. -->
  <svg class="orbs"><!-- … --></svg>

  <!-- Content: transform-origin top-left, translate(tx,ty) scale(s) -->
  <div class="content">
    <!-- z order matters -->
    <NoteGroupFrame … />     <!-- frames are the backdrop notes sit on -->
    <NoteConnectors … />     <!-- one absolutely-positioned SVG -->
    <StickyNoteItem … />     <!-- absolutely positioned at world x/y -->
  </div>
</div>
```

Both transformed layers **must share the same origin**. The grid sheet lives
*inside* the board element, not behind the whole page — otherwise the two scale
about different points and the grid slides under the notes as you zoom. (This
was a real bug found and fixed in the RN version; do not reintroduce it.)

Apply the transform as a single string:

```ts
element.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
element.style.transformOrigin = 'top left';
```

Order matters: `translate` then `scale`, matching the RN transform array.

## 6.3 Gestures

Use **Pointer Events** — one code path for mouse, touch and pen. No library.

### Pan
`pointerdown` on the board background (not on a note) → record
`{ startX, startY, startTx, startTy }`, `setPointerCapture`, then on
`pointermove` set `translate = start + delta`. Release on `pointerup` /
`pointercancel`.

### Zoom — three inputs on the web where RN had one

| Input | Behaviour |
|---|---|
| **Wheel** (`wheel` event) | The primary desktop zoom. `deltaY` → multiplicative scale step; focal point is the cursor. Must `preventDefault()` or the page scrolls — **see the passive-listener trap below** |
| **Ctrl/Cmd + wheel** | Trackpad pinch arrives as `wheel` with `ctrlKey: true`. Same handler, larger step |
| **Two-finger pinch** | Track two active pointers, scale by the ratio of current to initial distance; focal point is the midpoint |

> **The passive-listener trap.** React attaches `wheel` at the root as a
> **passive** listener, so calling `e.preventDefault()` inside a JSX `onWheel`
> handler does nothing except log *"Unable to preventDefault inside passive
> event listener"*. The page will scroll while you zoom and it will look like a
> zoom bug. Attach it yourself, non-passively:
>
> ```ts
> useEffect(() => {
>   const el = boardRef.current;
>   if (!el) return;
>   const onWheel = (e: WheelEvent) => {
>     e.preventDefault();
>     const rect = el.getBoundingClientRect();
>     const step = e.ctrlKey ? 0.01 : 0.0015;      // trackpad pinch arrives as ctrl+wheel
>     zoomTo(scaleRef.current * Math.exp(-e.deltaY * step),
>            e.clientX - rect.left, e.clientY - rect.top);
>   };
>   el.addEventListener('wheel', onWheel, { passive: false });
>   return () => el.removeEventListener('wheel', onWheel);
> }, []);
> ```
>
> Read the current scale from a ref, not from state, or the effect re-subscribes
> on every frame.

All three funnel into the same function:

```ts
function zoomTo(nextScale: number, focalX: number, focalY: number) {
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
  setTranslate({
    x: zoomAbout(focalX, translate.x, scale, s),
    y: zoomAbout(focalY, translate.y, scale, s),
  });
  setScale(s);
}
```

Focal coordinates must be **relative to the board element**, not the page — use
`event.clientX - boardRect.left`.

Add keyboard zoom too (`+` / `-` / `0` to reset, focal = viewport centre). Free
accessibility win.

### Why zooming out is always safe
`zoomAbout` contracts everything toward the focal point when `toScale < fromScale`
(the displacement from the focal point is multiplied by `toScale/fromScale < 1`).
So content can never fly off-screen when zooming out, from any pan position.
There is a test asserting exactly this — `'pulls everything towards the focal
point when zooming out'`. Keep it.

## 6.4 `StickyNoteItem` — drag semantics

The RN gesture composition is:

```
Gesture.Race(
  dragGesture,                                    // Pan, activateAfterLongPress(120ms)
  Gesture.Exclusive(longPressGesture, tapGesture) // long-press → colour picker; tap → open editor
)
```

Reproduce this exactly:

| Interaction | Result |
|---|---|
| Tap / click | Open the note editor |
| Press and hold **120 ms** then move | Drag the note (and all its descendants) |
| Press and hold **without moving** (longer) | Open the colour picker |

On drag start the note springs to `scale(1.06)` and lifts (shadow grows). On
release it springs back.

**Desktop deviation you should make deliberately:** a 120 ms hold before drag is
a touch affordance. With a mouse, dragging should start immediately on
`pointerdown` + move beyond a ~4px threshold. Branch on `event.pointerType`:
`'touch'` keeps the 120 ms delay; `'mouse'` / `'pen'` use the threshold. Record
this in your summary as an intentional platform difference.

### Drag maths
The note lives in world coordinates. The pointer moves in screen pixels.
**Divide the pointer delta by the canvas scale** before applying it, or dragging
at 0.5 zoom moves the note twice as far as the cursor.

```ts
worldDx = (clientX - startClientX) / scale;
```

### Cluster drag
Dragging a parent moves **all descendants** with it. The RN implementation
precomputes a `descendantsMap` (id → all descendant ids) whenever the notes
change, then on drag-end builds a `moves[]` array and sends **one**
`moveCluster` mutation → one `bulk_move_notes` RPC.

Do the same. Do not fire one update per note.

### Group frames
Dragging a `NoteGroupFrame` moves every note **spatially inside** it. Membership
is computed at drag start by a bounds test (note fully inside the frame), stored
in a ref, and applied as a single cluster move on release. Group membership is
purely spatial — there is no join table.

## 6.5 `NoteConnectors`

One absolutely-positioned SVG containing a `<path>` per parent→child edge, drawn
between note centres. Notes can live at negative world coordinates (after
panning and tidying), so the SVG is sized to the **bounding box of the edges it
draws**, offset by `PAD = 1000`, and positioned at `left: minX, top: minY`.
Every path is drawn in that local space (`x - minX`, `y - minY`).

Keep that approach. A fixed giant SVG either clips or wastes memory.

Note the layer is `pointer-events: none`, and its bounding box is padded by
1000px — so making it interactive naively would swallow clicks meant for the
board. `11` §11.1.7 opts in per-path instead, when connectors become selectable.

During a drag, the RN version animates the paths via `useAnimatedProps` so the
threads follow the note in real time. On the web, either:

- **(a)** Update the `d` attribute directly from the same `requestAnimationFrame`
  loop that moves the note (imperative, no React re-render), or
- **(b)** Re-render the connectors from React state and accept a re-render per
  frame — fine up to a few dozen notes, verify with a profiler.

Start with (b). Move to (a) only if you measure a problem.

Defaults if a note has no explicit size: `width 190`, `height 145` — these
match `layout.ts` and must agree, or connectors attach off-centre.

## 6.6 `CanvasBackground`

Two independent layers:

**Grid** — an SVG `<pattern>` of two 1px rules on a 24px tile, filling a sheet
**3× the viewport**, transformed by
`translate(wrapToTile(tx, tile), wrapToTile(ty, tile)) scale(gridScale(s))`
where `tile = 24 × gridScale(s)`.

Why wrapping: parenting the grid to the content layer would need a sheet tens of
thousands of pixels across at 0.12 zoom, and panning far would always run off
it. A repeating pattern looks identical translated by `d` or by `d mod tile`, so
the sheet only ever moves within one tile — constant cost at any pan distance.

Why `gridScale`: below 0.5 zoom the world spacing doubles (24 → 48 → 96 → 192),
keeping the drawn tile legible **and** capping the sheet at 3 viewports. Between
0.5 and 2.5 it tracks the notes exactly, which is the point of the feature.

**Orbs** — three radial gradients, **fixed to the viewport, not transformed**.
They are ambient light on the screen, not objects on the board; scaling them to
specks at low zoom loses the only warmth the dark theme has. Deliberate.

Both layers are hidden entirely when `canvasBackgroundEnabled` is false.

CSS gradients would work for the orbs on the web, but keep the SVG on the first
pass so the two implementations can be compared side by side.

## 6.7 Do not install an animation library

Everything animated on this canvas is one of:

- The pan/zoom transform — driven by pointer events, written straight to
  `style.transform`. **No library. No React state per frame.**
- The note lift (`scale(1.06)` + shadow) — a CSS transition on a class toggle.
- Connector paths during drag — see §6.5.
- Sheet enter/exit — CSS transition + `@starting-style`.

Reanimated exists in the RN app because RN's JS↔native bridge makes per-frame
JS animation janky. **The browser has no bridge.** `style.transform` written in
a `pointermove` handler is already composited on the GPU. Importing Framer
Motion to reproduce a Reanimated shared value is solving a problem you do not
have.

The one rule: **during a drag or pan, write to `element.style` directly, not to
React state.** Commit to React (and to the database) on release.

## 6.8 `CanvasToolbar` — six tools, becoming seven

A collapsible vertical strip on the left. Six, deliberately — "a tool strip that
needs scrolling is a tool strip nobody uses."

> **`11` §11.1.9 adds a seventh**: the arrow tool. Build six for parity; add the
> arrow in Phase 9. The "exactly six" rule was the product owner's own earlier
> constraint and they have since superseded it.

| Icon | Label | Action |
|---|---|---|
| `StickyNote` | Add a note | Create at viewport centre, offset `(-95, -72)`, then open the editor |
| `Frame` | Add a group frame | Create at viewport centre, offset `(-230, -180)` |
| `LayoutGrid` | Tidy notes into a grid | `tidyLayout()` |
| `Scan` | Fit everything on screen | See §6.9 |
| `Mic` | Recordings in this space | Opens `RecordingsSheet` |
| `Eye`/`EyeOff` | Show / hide sub-notes | Toggles `showChildNotes` |

The offsets centre the new object under the viewport centre using the default
note (190×145) and frame (460×360) sizes.

## 6.9 Fit to view

Compute the bounding box of all notes and groups, then:

```ts
const PAD = 48;
const scale = clamp(
  Math.min(boardW / (maxX - minX + PAD * 2), boardH / (maxY - minY + PAD * 2)),
  MIN_SCALE, MAX_SCALE
);
translate = {
  x: boardW / 2 - ((minX + maxX) / 2) * scale,
  y: boardH / 2 - ((minY + maxY) / 2) * scale,
};
```

This formula is **only correct with a top-left transform origin** — it was
silently wrong in the RN app until the origin was made explicit. Animate to the
target over ~240 ms with a CSS transition on the content layer, and remove the
transition before the next pointer-driven pan so dragging stays instant.

## 6.10 Layout maths — `ai/services/layout.ts`, copy verbatim

| Constant | Value | Why |
|---|---|---|
| `DEFAULT_WIDTH` / `DEFAULT_HEIGHT` | 190 / 145 | Parent note size |
| `CHILD_WIDTH` / `CHILD_HEIGHT` | 150 / 110 | Sub-note size |
| `GAP` | 22 | Grid gap in `tidyLayout` |
| `COLUMNS` | 4 | Tidy grid width |
| `CHILD_DISTANCE` | **210** | Orbit radius. Must exceed the sibling diagonal (~186px) or adjacent children overlap. It was 170 and they did |
| `CHILD_ANGLE_STEP` | 60° | Six children fit a ring without overlap |

`placeChild(parent, siblingIndex, occupied)` does a **ring-expanding collision
search** — a radial child could otherwise land on an unrelated note. There is a
regression test for exactly that case. Keep it.

`layout.test.ts` must stay green. **This file also exists in a second copy under
`supabase/functions/_shared/layout.ts`** for server-side placement. They must
agree. You are not changing either.

## 6.11 Performance targets

Modest, but check them:

- 200 notes on screen: pan and zoom hold 60fps.
- Dragging a parent with 20 descendants: no dropped frames.
- Notes are plain absolutely-positioned divs. If you hit a wall, the first move
  is `content-visibility: auto` or culling off-screen notes — not a rewrite onto
  `<canvas>`. Sticky notes contain selectable, editable text; a canvas
  implementation would have to rebuild text rendering and accessibility from
  scratch.

## 6.12 Canvas acceptance criteria

- [ ] Pan with mouse drag, touch drag, and trackpad two-finger scroll
- [ ] Zoom with wheel, ctrl+wheel, pinch, and keyboard — all focal-correct
- [ ] Grid pans and scales with the notes; visible at every zoom incl. 0.12
- [ ] Orbs stay fixed to the viewport
- [ ] `canvasBackgroundEnabled = false` hides both layers
- [ ] Tap a note → editor. Long-press → colour picker. Hold+drag → move
- [ ] Dragging a parent moves all descendants, committed as **one** mutation
- [ ] Dragging a group frame moves every note inside it
- [ ] Connectors follow notes live during a drag
- [ ] `showChildNotes = false` hides sub-notes **and** their connectors, while
      the parent's sub-note count badge still shows the true total
- [ ] Tidy, fit-to-view, add note, add frame all correct at zoom ≠ 1
- [ ] `coords.test.ts` and `layout.test.ts` pass unchanged
