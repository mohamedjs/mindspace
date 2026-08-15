import { gridScale, screenToWorld, worldToScreen, wrapToTile, zoomAbout } from './coords';

const MIN_SCALE = 0.12;
const MAX_SCALE = 2.5;
const GRID_SIZE = 24;
const SHEET = 3;

describe('canvas transform', () => {
  it('round-trips a point through world and screen space', () => {
    const translate = { x: -120, y: 340 };
    const scale = 0.7;
    const screen = worldToScreen(500, -80, translate, scale);
    const back = screenToWorld(screen.x, screen.y, translate, scale);

    expect(back.x).toBeCloseTo(500);
    expect(back.y).toBeCloseTo(-80);
  });
});

describe('zoomAbout', () => {
  /**
   * The whole point of focal zoom: whatever world point sat under the fingers
   * before the pinch is still under them after it.
   */
  it('keeps the world point under the focal point fixed', () => {
    const translate = { x: 40, y: -15 };
    const from = 1;
    const to = 2.3;
    const focal = { x: 180, y: 420 };

    const worldBefore = screenToWorld(focal.x, focal.y, translate, from);
    const after = {
      x: zoomAbout(focal.x, translate.x, from, to),
      y: zoomAbout(focal.y, translate.y, from, to),
    };
    const worldAfter = screenToWorld(focal.x, focal.y, after, to);

    expect(worldAfter.x).toBeCloseTo(worldBefore.x);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y);
  });

  it('leaves the board alone when the scale does not change', () => {
    expect(zoomAbout(200, 33, 1.4, 1.4)).toBeCloseTo(33);
  });

  /**
   * The property that makes zooming out safe from any pan position: content
   * always moves *towards* the fingers, never away. Without it, zooming out
   * from a board panned a long way could fling everything off screen — the old
   * centre-origin transform got this for free, and focal zoom has to earn it.
   */
  it('pulls everything towards the focal point when zooming out', () => {
    const board = 400;
    // A board dragged a long way in each direction, at each end of the range.
    for (const translate of [0, 3000, -3000, 12_500]) {
      for (const focal of [0, board / 2, board]) {
        for (const world of [-5000, 0, 250, 9000]) {
          const before = worldToScreen(world, 0, { x: translate, y: 0 }, 1).x;
          const after = worldToScreen(
            world,
            0,
            { x: zoomAbout(focal, translate, 1, MIN_SCALE), y: 0 },
            MIN_SCALE
          ).x;

          expect(Math.abs(after - focal)).toBeLessThanOrEqual(Math.abs(before - focal) + 1e-9);
        }
      }
    }
  });
});

describe('gridScale', () => {
  it('tracks the board exactly once the grid is legible', () => {
    for (const s of [0.5, 0.8, 1, 1.7, MAX_SCALE]) {
      expect(gridScale(s)).toBeCloseTo(s);
    }
  });

  it('keeps a drawable grid all the way down to the zoom floor', () => {
    for (const s of [MIN_SCALE, 0.13, 0.2, 0.34, 0.49]) {
      expect(gridScale(s)).toBeGreaterThanOrEqual(0.5);
      expect(gridScale(s)).toBeLessThan(1);
    }
  });

  it('only ever steps the world spacing by whole doublings', () => {
    // A non-power-of-two step would make the coarse grid land between the fine
    // grid's lines, so the grid would visibly shift as you crossed the
    // threshold instead of simply dropping every other line.
    for (const s of [MIN_SCALE, 0.2, 0.34, 0.49, 1, MAX_SCALE]) {
      const steps = Math.log2(gridScale(s) / s);
      expect(steps).toBeCloseTo(Math.round(steps));
    }
  });

  it('never asks the sheet to cover more than it can', () => {
    // The sheet is SHEET viewports wide and drawn at gridScale, so it must
    // still span the viewport plus the one tile wrapToTile shifts it back by.
    for (const s of [MIN_SCALE, 0.3, 0.5, 1, MAX_SCALE]) {
      const board = 400;
      const drawn = gridScale(s);
      expect(SHEET * board * drawn).toBeGreaterThan(board + GRID_SIZE * drawn);
    }
  });
});

describe('wrapToTile', () => {
  const TILE = 24;

  it('always lands in the tile before the origin, so there is never a gap', () => {
    for (const pan of [0, 1, 23, 24, 25, -1, -23, -24, -25, 1000.5, -9999.25]) {
      const wrapped = wrapToTile(pan, TILE);
      expect(wrapped).toBeGreaterThanOrEqual(-TILE);
      expect(wrapped).toBeLessThan(0);
    }
  });

  it('is indistinguishable from the real pan for a repeating pattern', () => {
    // Wrapped and unwrapped offsets must differ by a whole number of tiles,
    // which is exactly the condition for the grid to look unmoved.
    for (const pan of [37, -37, 512, -0.75]) {
      const tiles = (pan - wrapToTile(pan, TILE)) / TILE;
      expect(tiles).toBeCloseTo(Math.round(tiles));
    }
  });

  it('shrinks the wrap window as the board zooms out', () => {
    expect(wrapToTile(100, 24 * 0.5)).toBeGreaterThanOrEqual(-12);
  });
});
