import { wouldCycle } from './graph';

describe('wouldCycle', () => {
  it('rejects a note as its own parent', () => {
    const parentOf = new Map<string, string | null>([
      ['note1', null],
    ]);
    expect(wouldCycle('note1', 'note1', parentOf)).toBe(true);
  });

  it('rejects connecting a note to its direct child', () => {
    // note1 is parent of note2 (parentOf.get('note2') = 'note1')
    // Attempting to make note2 the parent of note1: noteId='note1', parentId='note2'
    const parentOf = new Map<string, string | null>([
      ['note1', null],
      ['note2', 'note1'],
    ]);
    expect(wouldCycle('note1', 'note2', parentOf)).toBe(true);
  });

  it('rejects connecting a note to a grandchild', () => {
    // note1 -> note2 -> note3
    // Attempting to make note3 the parent of note1: noteId='note1', parentId='note3'
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
    // Make note1 parent of note2 (noteId='note2', parentId='note1')
    expect(wouldCycle('note2', 'note1', parentOf)).toBe(false);
  });

  it('allows re-parenting a child to a different branch', () => {
    // note1 -> note2, note3 (root)
    // Move note2 under note3 (noteId='note2', parentId='note3')
    const parentOf = new Map<string, string | null>([
      ['note1', null],
      ['note2', 'note1'],
      ['note3', null],
    ]);
    expect(wouldCycle('note2', 'note3', parentOf)).toBe(false);
  });

  it('terminates on an already-corrupt cycle', () => {
    // Corrupt data: A -> B -> A
    const parentOf = new Map<string, string | null>([
      ['A', 'B'],
      ['B', 'A'],
      ['C', null],
    ]);
    // Try to connect C to A (noteId='C', parentId='A')
    // Walking up from A finds B -> A -> (seen cycle) -> returns true
    expect(wouldCycle('C', 'A', parentOf)).toBe(true);
  });
});
