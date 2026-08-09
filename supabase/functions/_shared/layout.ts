export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_WIDTH = 190;
const DEFAULT_HEIGHT = 145;
const GAP = 22;

/**
 * Mirrors src/features/ai/services/layout.ts, which carries the unit tests.
 * Four across matches a phone at 1x zoom.
 */
export const COLUMNS = 4;

const STEP_X = DEFAULT_WIDTH + GAP;
const STEP_Y = DEFAULT_HEIGHT + GAP;

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

  const overlaps = (a: Rect, b: Rect) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

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
