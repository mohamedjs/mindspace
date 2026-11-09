import {
  noteAtPoint,
  notesInRect,
  notesInsideRect,
  withDescendants,
  wouldCycle,
  type NoteRect,
} from './graph';

describe('wouldCycle', () => {
  it('rejects a note as its own parent', () => {
    const parentOf = new Map<string, string | null>([['note1', null]]);
    expect(wouldCycle('note1', 'note1', parentOf)).toBe(true);
  });

  it('rejects connecting a note to its direct child', () => {
    const parentOf = new Map<string, string | null>([
      ['note1', null],
      ['note2', 'note1'],
    ]);
    expect(wouldCycle('note1', 'note2', parentOf)).toBe(true);
  });

  it('rejects connecting a note to a grandchild', () => {
    const parentOf = new Map<string, string | null>([
      ['note1', null],
      ['note2', 'note1'],
      ['note3', 'note2'],
    ]);
    expect(wouldCycle('note1', 'note3', parentOf)).toBe(true);
  });

  it('allows connecting two unrelated roots', () => {
    const parentOf = new Map<string, string | null>([
      ['note1', null],
      ['note2', null],
    ]);
    expect(wouldCycle('note2', 'note1', parentOf)).toBe(false);
  });

  it('allows re-parenting a child to a different branch', () => {
    const parentOf = new Map<string, string | null>([
      ['note1', null],
      ['note2', 'note1'],
      ['note3', null],
    ]);
    expect(wouldCycle('note2', 'note3', parentOf)).toBe(false);
  });

  it('terminates on an already-corrupt cycle', () => {
    const parentOf = new Map<string, string | null>([
      ['A', 'B'],
      ['B', 'A'],
      ['C', null],
    ]);
    expect(wouldCycle('C', 'A', parentOf)).toBe(true);
  });
});

describe('noteAtPoint', () => {
  const notes: NoteRect[] = [
    { id: 'a', x: 0, y: 0, width: 100, height: 100 },
    { id: 'b', x: 200, y: 200, width: 100, height: 100 },
  ];

  it('finds the note containing the point', () => {
    expect(noteAtPoint(50, 50, notes)).toBe('a');
    expect(noteAtPoint(250, 250, notes)).toBe('b');
  });

  it('returns null on empty board space', () => {
    expect(noteAtPoint(150, 150, notes)).toBeNull();
    expect(noteAtPoint(-40, -40, notes)).toBeNull();
  });

  it('counts the edges as inside, so a drop on the border still connects', () => {
    expect(noteAtPoint(0, 0, notes)).toBe('a');
    expect(noteAtPoint(100, 100, notes)).toBe('a');
  });

  it('returns the topmost note when two overlap', () => {
    const stacked: NoteRect[] = [
      { id: 'under', x: 0, y: 0, width: 100, height: 100 },
      { id: 'over', x: 50, y: 50, width: 100, height: 100 },
    ];
    expect(noteAtPoint(75, 75, stacked)).toBe('over');
    expect(noteAtPoint(10, 10, stacked)).toBe('under');
  });

  it('falls back to the rendered note size when one is not stored', () => {
    expect(noteAtPoint(230, 190, [{ id: 'c', x: 0, y: 0 }])).toBe('c');
    expect(noteAtPoint(250, 190, [{ id: 'c', x: 0, y: 0 }])).toBeNull();
  });

  it('covers the whole rendered note, not just its stored height', () => {
    const short: NoteRect[] = [{ id: 'db', x: 0, y: 0, width: 180, height: 120 }];
    expect(noteAtPoint(90, 60, short)).toBe('db');
    expect(noteAtPoint(90, 180, short)).toBe('db');
    expect(noteAtPoint(90, 260, short)).toBeNull();
  });

  it('works in negative world space, where a tidied board ends up', () => {
    expect(noteAtPoint(-950, -950, [{ id: 'd', x: -1000, y: -1000, width: 100, height: 100 }]))
      .toBe('d');
  });
});

describe('notesInsideRect', () => {
  it('only takes notes fully enclosed, using their rendered height', () => {
    const frame = { x: 0, y: 0, w: 500, h: 400 };
    const overflowing = [{ id: 'tall', x: 10, y: 250, width: 180, height: 120 }];
    expect(notesInsideRect(frame, overflowing)).toEqual([]);
    expect(notesInsideRect(frame, [{ id: 'in', x: 10, y: 10, width: 180, height: 120 }]))
      .toEqual(['in']);
  });
});

describe('notesInRect', () => {
  it('takes anything the marquee touches, not just what it encloses', () => {
    const notes: NoteRect[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'far', x: 900, y: 900, height: 100, width: 100 },
    ];
    expect(notesInRect({ x: -50, y: -50, w: 60, h: 60 }, notes)).toEqual(['a']);
    expect(notesInRect({ x: 400, y: 400, w: 50, h: 50 }, notes)).toEqual([]);
  });
});

describe('withDescendants', () => {
  const tree = { p: ['c1', 'c2', 'g1'], c1: ['g1'], c2: [], g1: [] };

  it('carries the whole subtree of anything selected', () => {
    expect(withDescendants(['p'], tree).sort()).toEqual(['c1', 'c2', 'g1', 'p']);
  });

  it('is just the note itself when it has no children', () => {
    expect(withDescendants(['c2'], tree)).toEqual(['c2']);
  });

  it('does not duplicate a note reachable two ways', () => {
    expect(withDescendants(['p', 'c1'], tree).sort()).toEqual(['c1', 'c2', 'g1', 'p']);
  });
});
