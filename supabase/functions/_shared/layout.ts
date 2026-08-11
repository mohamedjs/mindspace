export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_WIDTH = 190;
const DEFAULT_HEIGHT = 145;
const GAP = 22;

/** A sub-note orbits its parent rather than claiming a grid slot. */
export const CHILD_WIDTH = 150;
export const CHILD_HEIGHT = 110;
// Must exceed the sibling rect's diagonal (~186px) so two siblings 60° apart
// — the closest adjacent pair — never overlap regardless of direction.
const CHILD_DISTANCE = 210;
const CHILD_ANGLE_STEP = (2 * Math.PI) / 6; // 60°, evenly spread up to 6 without overlap

/**
 * Mirrors src/features/ai/services/layout.ts, which carries the unit tests.
 * Four across matches a phone at 1x zoom.
 */
export const COLUMNS = 4;

const STEP_X = DEFAULT_WIDTH + GAP;
const STEP_Y = DEFAULT_HEIGHT + GAP;

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** Grid slot -> world rect. Slot 0 is the origin, filling left-to-right. */
export function slotRect(index: number): Rect {
  return {
    x: (index % COLUMNS) * STEP_X,
    y: Math.floor(index / COLUMNS) * STEP_Y,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  };
}

/**
 * Places `count` new notes into the first free slots of the 4-column grid.
 *
 * A slot counts as taken when an existing note overlaps it, so hand-moved notes
 * still push new ones out of the way instead of landing underneath them. The
 * previous spiral produced a scattered board that was hard to read down.
 */
export function layoutNewNotes(count: number, existing: Rect[]): Rect[] {
  const placed: Rect[] = [];

  let slot = 0;
  for (let i = 0; i < count; i++) {
    // ponytail: linear slot scan, capped. A board dense enough for this to
    // matter needs a spatial index anyway.
    let candidate = slotRect(slot);
    while (
      slot < 4000 &&
      [...existing, ...placed].some((rect) => overlaps(candidate, rect))
    ) {
      slot++;
      candidate = slotRect(slot);
    }
    placed.push(candidate);
    slot++;
  }

  return placed;
}

/**
 * A sub-note's ideal spot: orbiting its parent at `angleSlot` (0-5, starting
 * above and sweeping clockwise), pushed to a wider ring for each `ring` past
 * the first so a placement search (placeChild) has somewhere to retry.
 *
 * Mirrors src/features/ai/services/layout.ts, which carries the unit tests.
 */
export function radialChildRect(parent: Rect, angleSlot: number, ring = 0): Rect {
  const distance = CHILD_DISTANCE + ring * CHILD_DISTANCE * 0.8;
  const angle = -Math.PI / 2 + angleSlot * CHILD_ANGLE_STEP;
  const cx = parent.x + parent.width / 2 + Math.cos(angle) * distance;
  const cy = parent.y + parent.height / 2 + Math.sin(angle) * distance;
  return {
    x: cx - CHILD_WIDTH / 2,
    y: cy - CHILD_HEIGHT / 2,
    width: CHILD_WIDTH,
    height: CHILD_HEIGHT,
  };
}

/**
 * Places a sub-note near its parent without landing on top of anything else
 * already on the board — orbiting the parent alone doesn't know about an
 * unrelated note that happens to sit in that direction. Widens the ring
 * outward, six angle slots at a time, until a free spot turns up.
 */
export function placeChild(parent: Rect, siblingIndex: number, occupied: Rect[]): Rect {
  const clashes = (rect: Rect) => overlaps(rect, parent) || occupied.some((o) => overlaps(rect, o));

  for (let attempt = siblingIndex; attempt < siblingIndex + 60; attempt++) {
    const candidate = radialChildRect(parent, attempt % 6, Math.floor(attempt / 6));
    if (!clashes(candidate)) return candidate;
  }
  // Gave up avoiding a collision — land far out rather than loop forever.
  return radialChildRect(parent, siblingIndex, 10);
}
