import { describe, it, expect } from 'vitest';
import {
  topoSort,
  colorForNote,
  layoutNewNotes,
  placeChild,
  boundingRect,
  structureNotes,
  overlaps,
} from './structure.js';
import { InvalidStructureError } from './errors.js';

describe('structureNotes Domain Logic', () => {
  describe('colorForNote', () => {
    it('maps default note types to established palette', () => {
      expect(colorForNote('idea')).toBe('#FFF8BC');
      expect(colorForNote('task')).toBe('#C8E6C9');
      expect(colorForNote('question')).toBe('#BBDEFB');
      expect(colorForNote('decision')).toBe('#F8BBD0');
      expect(colorForNote('reference')).toBe('#E1BEE7');
      expect(colorForNote('thought')).toBe('#FFE0B2');
      expect(colorForNote('summary')).toBe('#B2EBF2');
    });

    it('respects valid hex override and ignores invalid formats', () => {
      expect(colorForNote('idea', '#123456')).toBe('#123456');
      expect(colorForNote('idea', 'blue')).toBe('#FFF8BC');
      expect(colorForNote('task', '#XYZ123')).toBe('#C8E6C9');
    });
  });

  describe('topoSort', () => {
    it('sorts notes so parents appear before children regardless of input order', () => {
      const notes = [
        { clientKey: 'child', content: 'Sub idea', type: 'idea' as const, parentKey: 'parent' },
        { clientKey: 'parent', content: 'Main idea', type: 'idea' as const },
      ];

      const sorted = topoSort(notes);
      expect(sorted.map((n) => n.clientKey)).toEqual(['parent', 'child']);
    });

    it('detects direct cycles and throws InvalidStructureError', () => {
      const notes = [
        { clientKey: 'a', content: 'A', type: 'idea' as const, parentKey: 'b' },
        { clientKey: 'b', content: 'B', type: 'idea' as const, parentKey: 'a' },
      ];

      expect(() => topoSort(notes)).toThrow(InvalidStructureError);
    });

    it('detects indirect cycles across 3+ nodes', () => {
      const notes = [
        { clientKey: 'a', content: 'A', type: 'idea' as const, parentKey: 'c' },
        { clientKey: 'b', content: 'B', type: 'idea' as const, parentKey: 'a' },
        { clientKey: 'c', content: 'C', type: 'idea' as const, parentKey: 'b' },
      ];

      expect(() => topoSort(notes)).toThrow(InvalidStructureError);
    });
  });

  describe('geometry and layout', () => {
    it('allocates distinct slots that do not overlap', () => {
      const slots = layoutNewNotes(5, []);
      expect(slots.length).toBe(5);

      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          expect(overlaps(slots[i], slots[j])).toBe(false);
        }
      }
    });

    it('avoids existing occupied rects', () => {
      const existing = [{ x: 0, y: 0, width: 250, height: 190 }];
      const slots = layoutNewNotes(1, existing);

      expect(overlaps(slots[0], existing[0])).toBe(false);
    });

    it('places child orbiting parent', () => {
      const parent = { x: 100, y: 100, width: 250, height: 190 };
      const child = placeChild(parent, 0, []);

      expect(child.width).toBe(180);
      expect(child.height).toBe(135);
      expect(overlaps(parent, child)).toBe(false);
    });

    it('computes bounding rectangle with padding around notes', () => {
      const rects = [
        { x: 10, y: 10, width: 100, height: 100 },
        { x: 150, y: 150, width: 100, height: 100 },
      ];
      const bound = boundingRect(rects);

      // min x = 10 - 28 = -18
      expect(bound.x).toBe(-18);
      // min y = 10 - 28 = -18
      expect(bound.y).toBe(-18);
      // max x = 250 + 28 = 278 -> width = 278 - (-18) = 296
      expect(bound.width).toBe(296);
      expect(bound.height).toBe(296);
    });
  });

  describe('structureNotes full pipeline', () => {
    it('throws error on duplicate clientKey', () => {
      expect(() =>
        structureNotes({
          spaceId: 's1',
          notes: [
            { clientKey: 'dup', content: 'One', type: 'idea' },
            { clientKey: 'dup', content: 'Two', type: 'idea' },
          ],
          existing: [],
        })
      ).toThrow(InvalidStructureError);
    });

    it('resolves relationships, groups and parent links into rows', () => {
      let idCounter = 1;
      const result = structureNotes({
        spaceId: 's1',
        notes: [
          { clientKey: 'parent', content: 'Main topic', type: 'idea' },
          { clientKey: 'child', content: 'Sub topic', type: 'task', parentKey: 'parent' },
        ],
        relations: [{ from: 'parent', to: 'child', type: 'related' }],
        groups: [{ title: 'Main Group', memberKeys: ['parent'] }],
        existing: [],
        newId: () => `id-${idCounter++}`,
      });

      expect(result.notes.length).toBe(2);
      expect(result.notes[0].id).toBe('id-1');
      expect(result.notes[0].parent_id).toBeNull();
      expect(result.notes[1].id).toBe('id-2');
      expect(result.notes[1].parent_id).toBe('id-1');

      expect(result.relationships.length).toBe(1);
      expect(result.relationships[0].from_note_id).toBe('id-1');
      expect(result.relationships[0].to_note_id).toBe('id-2');

      expect(result.groups.length).toBe(1);
      expect(result.groups[0].title).toBe('Main Group');
    });
  });
});
