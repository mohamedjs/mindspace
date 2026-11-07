# Canvas tools: desktop and mobile

Binding for phases 03, 08 and 10. The goal: a new user can group, connect and move notes without being taught.

## Principles

1. **Separate the four jobs.** Modes change what a press does. Create adds something. Selection acts on what is chosen. View changes what you see. Each has its own place on screen.
2. **Show actions where they apply.** Selection commands exist only while something is selected.
3. **Say what is happening.** An active mode looks active, and any mode that is not the default shows a one-line hint.
4. **Every action can be undone.**
5. **Thumbs on mobile, keyboard on desktop.** Same concepts, different gestures. The differences in `docs/IMPLEMENTATION_REFERENCE.md` section 3 stay: mobile defaults to Hand and selects by tap; web defaults to Select and uses a marquee.

## Problems this replaces

| Today | Fix |
|---|---|
| 13 equal icons mix modes, commands and view | Four zones |
| "Group" creates an empty frame | Selecting notes then Group wraps them |
| No commands for a selection | Selection bar |
| Mobile icons have no text and tools hide behind a toggle | Labelled bottom dock |
| Mobile has no undo | Undo and redo on both |
| Digit shortcuts must be memorised | Letters, shown in tooltips |
| `Tool` is declared inside render, remounting each time | A module-level component |

## Desktop layout

```
+------------------------------------------------------------------+
| Space name                     [Undo][Redo] | [-] 100% [+] [Fit] |  View
|                                                                  |
| +----+                                                           |
| |Sel |                                                           |
| |Hand|              canvas                                       |
| |Link|                                                           |
| |Edit|     +------------------------------------------+          |
| |----|     | 3 selected  Group Link Color Type  ... X |          |  Selection,
| | +  |     +------------------------------------------+          |  above the
| +----+                                                           |  selected notes
|             Hint: Connect: drag from one note to another   [Esc] |
+------------------------------------------------------------------+
```

Below 1024 px wide, use the mobile layout.

## Mobile layout

```
+----------------------------+
| < Space      [Undo] [Redo] |
|                            |
|         canvas             |
|                    [Fit]   |
|                    [ - ]   |
|                    [ + ]   |
|                            |
|   Tap the parent note      |  Hint chip
+----------------------------+
| Hand  Select  (+)  Link Edit|  Dock
+----------------------------+
```

With notes selected, the dock is replaced:

```
+----------------------------+
| X  3 selected              |
| Group Link Color Delete ...|
+----------------------------+
```

Dock rules:
- Fixed to the bottom, above the safe area, 64 pt tall.
- Every item shows an icon and a text label. Touch targets are at least 44 by 44 pt.
- `+` is centred and raised, the only filled item.
- The dock hides when the keyboard is open.
- It animates by sliding, and respects reduced-motion settings.
- Long-pressing a note selects it and opens the selection bar, from any mode.
- Dragging a note still works in Hand mode.

## Modes

Pick one. The selected mode stays until changed, except Write, which returns to the previous mode when the editor closes.

| Mode | Icon | Key | Desktop | Mobile | Hint |
|---|---|---|---|---|---|
| Select | `MousePointer2` | V | Click, shift-click, marquee. Drag moves. | Tap toggles selection | none on desktop; mobile: "Tap notes to select" |
| Hand | `Hand` | H | Drag moves the board. Holding Space does this temporarily. | Drag moves the board | none on mobile |
| Connect | `Waypoints` | C | Drag from a note to another | Tap the parent, then the child | "Drag from one note to another" / "Tap the parent note", then "Now tap the child note" |
| Write | `Pencil` | W | Click a note to type | Tap a note to type | "Tap a note to write in it" |

`Esc` cancels what is in progress, then clears the selection, then returns to the default mode.

## Create

`+` opens a small menu. On desktop it opens beside the rail; on mobile, a bottom sheet.

| Item | Key | Behaviour |
|---|---|---|
| Voice note | R | Opens recording. First item, since this is the product's core. |
| Sticky note | N | Adds a note at the centre of the view and opens it for typing |
| Sub-note | Shift+N | Enabled with one note selected. Creates a child. |
| Group | G | With a selection: wraps it. Otherwise: adds an empty frame at the centre. |

Double-clicking empty canvas on desktop adds a note there.

## Selection bar

Appears with one or more notes selected. Shows the count. It sits above the selection on desktop, and stays inside the viewport.

| Command | Key | Shown when | Behaviour | Server call |
|---|---|---|---|---|
| Group | G | 2 or more, or any | Creates a frame around the selection's bounds plus 24 px, then focuses its title | `POST /spaces/:id/groups` |
| Ungroup | Shift+G | A frame is selected | Deletes the frame. Notes stay in place. | `DELETE /groups/:id` |
| Link | L | Exactly 2 | First selected becomes parent of the second | `PATCH /notes/:id/parent` |
| Unlink | Shift+L | A note with a parent | Removes the parent. Note stays in place. | `PATCH /notes/:id/parent` |
| Color | | Any | Swatches. Applies to all selected. | `POST /notes/bulk-update` |
| Type | | Any | Idea, task, question, decision, reference, thought, summary | `POST /notes/bulk-update` |
| Tidy | T | 2 or more | Grid arrangement of the selection only | `POST /notes/move` |
| Duplicate | Ctrl+D | Any | Copies notes with a 24 px offset, keeping links among the copies | `POST /notes/bulk-create` |
| Delete | Delete | Any | Soft delete. Shows an Undo toast for 6 seconds. | `POST /notes/bulk-delete` |
| Clear | Esc | Always | Clears the selection | none |

Mobile shows Group, Link, Color and Delete, and puts the rest under `...`. Commands that do not apply are hidden, not disabled.

Rules that must survive:
- Dragging moves the selection plus all descendants, in one bulk move, never one request per note.
- The cycle guard rejects links that would create a loop. Say why in a toast.

## View

| Command | Key | Behaviour |
|---|---|---|
| Undo, Redo | Ctrl+Z, Ctrl+Shift+Z | Covers move, create, edit, group, link, color, type, delete |
| Zoom | + - and 0 for 100% | Zoom about the viewport centre. Desktop shows the percentage. |
| Fit | F | Fits all notes |
| Tidy all | Shift+T | In the view menu, undoable |
| Sub-notes | S | Show or hide sub-notes |
| View switch | | Canvas, Mind map, List, Calendar, as tabs on desktop and a menu on mobile |
| Recordings | | In the view menu |

Undo is a client-side stack of up to 50 inverse operations per space, cleared on leaving the space. One user action is one undo step, however many notes it touched.

## Feedback

- Press response within one frame. Updates are optimistic, and roll back with a toast naming what failed.
- Tooltips on desktop show name and key after 400 ms.
- First visit: one short coach tip per zone, dismissible, stored per user, never repeated.

## Accessibility and language

- Modes are a `radiogroup` with arrow-key navigation. Bars use `role="toolbar"`, with visible focus.
- Every tool has a name in English and Arabic. Layout mirrors in RTL, while spatial icons such as undo also mirror.
- Colour is never the only signal for the active mode. Contrast is at least 4.5:1 for labels.
- Shortcuts do nothing while typing.

## Shared definition

`packages/contracts/src/tools.ts` is the single source for tool ids, English and Arabic labels, keys, zones and `isAvailable(selection)` rules. Web and mobile render from it, so behaviour and wording cannot drift. `canvas/utils/shortcuts.ts` resolves from the same table.

## Acceptance

- Unit tests: `isAvailable` for each selection state; shortcut table has no duplicates and ignores typing targets; undo reverses each command; one user action makes one undo entry.
- Web: Group on 3 notes makes a frame containing them, and Undo removes it.
- Mobile: all dock targets measure at least 44 pt; the dock clears the safe area; `gestureOrder.test.ts` still passes.
- Screenshots of each state at 375 px, 768 px and 1440 px, in English and Arabic, saved to `docs/v2/toolbar-screens/`, for the web build.
