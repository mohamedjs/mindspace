/**
 * Graph helpers for the arrow tool — the only thing in the app that can change
 * a note's parent after it has been created.
 */

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
    if (seen.has(cursor)) return true; // pre-existing corruption; refuse anyway
    seen.add(cursor);
    cursor = parentOf.get(cursor) ?? null;
  }
  return false;
}

export interface NoteRect {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

/**
 * The box a note actually occupies on screen — which is *not* its stored size.
 *
 * StickyNoteItem renders `{ width: note.width || 240, minHeight: note.height || 200 }`.
 * `minHeight`, not `height`: content pushes a note taller than the number in
 * the database, and the seeded default is only 120. Hit-testing the stored
 * height would leave the visible lower half of most notes dead to the arrow
 * tool, which is indistinguishable from the tool being broken.
 *
 * ponytail: floors the height instead of measuring. Over-covering by a few
 * pixels below a short note is a far better failure than a dead zone; measure
 * with onLayout if notes ever need to be hit precisely edge-to-edge.
 */
const DEFAULT_WIDTH = 240;
const MIN_HEIGHT = 200;

/** The rectangle a note actually covers on the board. */
export function noteBox(n: NoteRect) {
  return {
    x: n.x,
    y: n.y,
    w: n.width ?? DEFAULT_WIDTH,
    h: Math.max(n.height ?? MIN_HEIGHT, MIN_HEIGHT),
  };
}

/**
 * Which note is under a world-space point, or null.
 *
 * The web build hit-tests with `document.elementFromPoint`. React Native has no
 * equivalent, so the arrow tool works it out from the note rectangles it is
 * already rendering. Later notes are drawn on top, so the search runs backwards
 * and the topmost hit wins.
 *
 * Callers pass only the notes that are actually visible — a hidden sub-note
 * must not swallow a drop aimed at the board.
 */
export function noteAtPoint(wx: number, wy: number, notes: NoteRect[]): string | null {
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    const { x, y, w, h } = noteBox(n);
    if (wx >= x && wx <= x + w && wy >= y && wy <= y + h) return n.id;
  }
  return null;
}

/** Notes that overlap a world-space rectangle at all — marquee selection. */
export function notesInRect(
  rect: { x: number; y: number; w: number; h: number },
  notes: NoteRect[]
): string[] {
  return notes
    .filter((n) => {
      const b = noteBox(n);
      return b.x < rect.x + rect.w && b.x + b.w > rect.x && b.y < rect.y + rect.h && b.y + b.h > rect.y;
    })
    .map((n) => n.id);
}

/** Notes fully enclosed by a world-space rectangle — group-frame membership. */
export function notesInsideRect(
  rect: { x: number; y: number; w: number; h: number },
  notes: NoteRect[]
): string[] {
  return notes
    .filter((n) => {
      const b = noteBox(n);
      return b.x >= rect.x && b.y >= rect.y && b.x + b.w <= rect.x + rect.w && b.y + b.h <= rect.y + rect.h;
    })
    .map((n) => n.id);
}

/**
 * A drag set closed under descendants: everything selected, plus every
 * sub-note beneath any of it.
 *
 * The rule that keeps the board honest. Dragging a parent has always carried
 * its children on mobile; multi-select adds a second way to start a drag, and
 * without the closure a selection that happens to include a parent would tear
 * its sub-notes off. Degrades to exactly today's behaviour for a single note.
 */
export function withDescendants(ids: string[], descendants: Record<string, string[]>): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    out.add(id);
    for (const d of descendants[id] ?? []) out.add(d);
  }
  return [...out];
}
