import { describe, expect, it } from 'vitest';
import {
  COLUMNS,
  layoutNewNotes,
  overlaps,
  placeChild,
  radialChildRect,
  slotRect,
  type Rect,
} from './layout.js';

describe('slotRect', () => {
  it('fills left-to-right and wraps after four columns', () => {
    expect(slotRect(0)).toMatchObject({ x: 0, y: 0 });
    expect(slotRect(1).y).toBe(0);
    expect(slotRect(COLUMNS - 1).y).toBe(0);
    // Slot 4 starts the second row, back at the left edge.
    expect(slotRect(COLUMNS).x).toBe(0);
    expect(slotRect(COLUMNS).y).toBeGreaterThan(0);
  });

  it('leaves a gap between neighbours rather than butting them together', () => {
    expect(slotRect(1).x).toBeGreaterThan(slotRect(0).x + slotRect(0).width);
  });
});

describe('layoutNewNotes', () => {
  it('lays a fresh board out four per row', () => {
    const placed = layoutNewNotes(8, []);
    const rows = new Set(placed.map((p) => p.y));
    expect(placed).toHaveLength(8);
    expect(rows.size).toBe(2);
    expect(placed.slice(0, COLUMNS).every((p) => p.y === placed[0].y)).toBe(true);
  });

  it('never places a note on top of another', () => {
    const placed = layoutNewNotes(12, []);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(overlaps(placed[i], placed[j])).toBe(false);
      }
    }
  });

  it('skips slots already occupied by a hand-moved note', () => {
    const existing = [{ ...slotRect(0) }];
    const [first] = layoutNewNotes(1, existing);
    expect(overlaps(first, existing[0])).toBe(false);
  });

  it('places the first note at the origin on an empty board', () => {
    expect(layoutNewNotes(1, [])[0]).toMatchObject({ x: 0, y: 0 });
  });
});

describe('radialChildRect', () => {
  const parent: Rect = { x: 100, y: 100, width: 190, height: 145 };

  it('places the first child above the parent, offset from its centre', () => {
    const child = radialChildRect(parent, 0);
    const parentCx = parent.x + parent.width / 2;
    expect(child.x + child.width / 2).toBeCloseTo(parentCx, 0);
    expect(child.y + child.height / 2).toBeLessThan(parent.y + parent.height / 2);
  });

  it('spreads siblings around the parent without stacking them on each other', () => {
    const siblings = [0, 1, 2, 3].map((i) => radialChildRect(parent, i));
    for (let i = 0; i < siblings.length; i++) {
      for (let j = i + 1; j < siblings.length; j++) {
        expect(overlaps(siblings[i], siblings[j])).toBe(false);
      }
    }
  });

  it('never overlaps the parent itself', () => {
    const child = radialChildRect(parent, 0);
    expect(overlaps(child, parent)).toBe(false);
  });
});

describe('placeChild', () => {
  const parent: Rect = { x: 100, y: 100, width: 190, height: 145 };

  it('matches the ideal radial slot when nothing is in the way', () => {
    expect(placeChild(parent, 0, [])).toEqual(radialChildRect(parent, 0));
  });

  it('avoids an unrelated note sitting where the ideal slot would land', () => {
    const neighbourSlot = slotRect(1);
    const child = placeChild(parent, 1, [neighbourSlot]);
    expect(overlaps(child, neighbourSlot)).toBe(false);
    expect(overlaps(child, parent)).toBe(false);
  });

  it('never overlaps the parent or anything already occupied', () => {
    const occupied = [slotRect(0), slotRect(1), slotRect(2)];
    for (let i = 0; i < 5; i++) {
      const child = placeChild(parent, i, occupied);
      expect(overlaps(child, parent)).toBe(false);
      occupied.forEach((o) => expect(overlaps(child, o)).toBe(false));
      occupied.push(child);
    }
  });
});
