/**
 * The canvas transform, in one place.
 *
 * Both the note container and the grid sheet use `transformOrigin: top left`,
 * so the whole board is described by `screen = translate + world * scale`.
 * The transform helpers below are inversions or re-derivations of that one
 * line, and each runs inside a reanimated worklet on the UI thread.
 */

export interface Point {
  x: number;
  y: number;
}

/** Where a world point lands on screen. */
export function worldToScreen(wx: number, wy: number, translate: Point, scale: number): Point {
  'worklet';
  return { x: translate.x + wx * scale, y: translate.y + wy * scale };
}

/** Where a screen point sits in the world. */
export function screenToWorld(sx: number, sy: number, translate: Point, scale: number): Point {
  'worklet';
  return { x: (sx - translate.x) / scale, y: (sy - translate.y) / scale };
}

/**
 * The translation that holds `focal` (a screen point) still while the zoom
 * changes from `fromScale` to `toScale`.
 *
 * This is what makes pinching feel attached to your fingers rather than to the
 * middle of the screen: the world point under the pinch centre is the one that
 * must not move.
 */
export function zoomAbout(
  focal: number,
  translate: number,
  fromScale: number,
  toScale: number
): number {
  'worklet';
  return focal - (focal - translate) * (toScale / fromScale);
}

/**
 * Pan distance folded into a single tile, minus one whole tile.
 *
 * A repeating pattern looks identical translated by `d` or by `d mod tile`, so
 * the grid sheet only ever has to move within one tile no matter how far the
 * board has been dragged. The extra `- tile` guarantees the sheet starts at or
 * before the top-left corner instead of leaving a gap inside the screen.
 */
export function wrapToTile(translate: number, tile: number): number {
  'worklet';
  return (((translate % tile) + tile) % tile) - tile;
}

/**
 * The scale to draw the grid sheet at, given the board's zoom.
 *
 * Above half zoom this is just the zoom: the grid grows and shrinks in exact
 * lockstep with the notes, which is the whole point. Below it, doubling the
 * world spacing (24 -> 48 -> 96 -> ...) keeps the drawn tile in the same
 * comfortable pixel range instead of collapsing into grey mush — the same
 * thing Figma does, and the reason the board can zoom all the way out to 0.12
 * and still show a grid.
 *
 * It also caps what the sheet has to cover. The returned value never drops
 * below 0.5, so a sheet three viewports across always reaches the screen edges,
 * no matter how far out the board is zoomed.
 */
export function gridScale(scale: number): number {
  'worklet';
  let s = scale;
  while (s < 0.5) s *= 2;
  return s;
}

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  /** 0 = pixels, 1 = lines, 2 = pages. */
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
}

export type WheelIntent =
  | { type: 'zoom'; factor: number }
  | { type: 'pan'; dx: number; dy: number };

/** One line of a line-mode wheel, in pixels. */
const LINE_HEIGHT = 16;

/**
 * What a wheel event means on the board.
 *
 * A trackpad pinch reaches the browser as a wheel event with a *synthetic*
 * `ctrlKey` — nobody is holding Ctrl — so that flag is the only reliable way
 * to tell a pinch from an ordinary two-finger swipe. Pinch (and Ctrl/Cmd +
 * wheel on a mouse) zooms; everything else pans, in screen pixels, exactly
 * like dragging the board with the pointer.
 *
 * Deltas are normalised to pixels first: a mouse usually reports whole lines
 * (`deltaMode` 1) and occasionally pages (2), and both feel broken if taken
 * as pixel counts.
 */
export function wheelIntent(e: WheelLike, viewport: Point): WheelIntent {
  const [sx, sy] =
    e.deltaMode === 1
      ? [LINE_HEIGHT, LINE_HEIGHT]
      : e.deltaMode === 2
        ? [viewport.x, viewport.y]
        : [1, 1];
  const dx = e.deltaX * sx;
  const dy = e.deltaY * sy;

  if (e.ctrlKey || e.metaKey) {
    return { type: 'zoom', factor: Math.exp(-dy * 0.01) };
  }
  return { type: 'pan', dx, dy };
}
