import { COLUMNS, layoutNewNotes, slotRect, tidyLayout, type Rect } from './layout';

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

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
    // A note dragged onto slot 0 must push the next one further along.
    const existing = [{ ...slotRect(0) }];
    const [first] = layoutNewNotes(1, existing);
    expect(overlaps(first, existing[0])).toBe(false);
  });

  it('places the first note at the origin on an empty board', () => {
    expect(layoutNewNotes(1, [])[0]).toMatchObject({ x: 0, y: 0 });
  });
});

describe('tidyLayout', () => {
  it('reflows every note into grid order, keeping identity and extra fields', () => {
    const notes = [
      { id: 'a', content: 'one' },
      { id: 'b', content: 'two' },
      { id: 'c', content: 'three' },
      { id: 'd', content: 'four' },
      { id: 'e', content: 'five' },
    ];
    const tidied = tidyLayout(notes);

    expect(tidied.map((n) => n.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(tidied[0].content).toBe('one');
    expect(tidied[0]).toMatchObject({ x: 0, y: 0 });
    // Fifth note wraps to row two.
    expect(tidied[COLUMNS].x).toBe(0);
    expect(tidied[COLUMNS].y).toBeGreaterThan(tidied[0].y);

    for (let i = 0; i < tidied.length; i++) {
      for (let j = i + 1; j < tidied.length; j++) {
        expect(overlaps(tidied[i], tidied[j])).toBe(false);
      }
    }
  });
});
