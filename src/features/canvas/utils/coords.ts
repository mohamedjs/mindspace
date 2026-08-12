/**
 * The canvas transform, in one place.
 *
 * Both the note container and the grid sheet use `transformOrigin: top left`,
 * so the whole board is described by `screen = translate + world * scale`.
 * Everything below is an inversion or a re-derivation of that one line, and
 * every one of them runs inside a reanimated worklet on the UI thread.
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
