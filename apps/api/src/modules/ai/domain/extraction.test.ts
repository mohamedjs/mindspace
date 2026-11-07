import { describe, expect, it } from 'vitest';
import {
  colorForNote,
  extractJsonBlock,
  parseExtraction,
  resolveParentId,
} from './extraction.js';

describe('extractJsonBlock', () => {
  it('returns bare JSON unchanged', () => {
    expect(extractJsonBlock('{"a":1}')).toBe('{"a":1}');
  });

  it('unwraps ```json fences', () => {
    expect(extractJsonBlock('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips prose around the object', () => {
    expect(extractJsonBlock('Sure! Here you go:\n{"a":1}\nHope that helps.')).toBe('{"a":1}');
  });

  it('keeps nested objects intact', () => {
    expect(extractJsonBlock('x {"a":{"b":2}} y')).toBe('{"a":{"b":2}}');
  });

  it('ignores braces inside strings', () => {
    expect(extractJsonBlock('{"a":"}"}')).toBe('{"a":"}"}');
  });

  it('ignores escaped quotes inside strings', () => {
    expect(extractJsonBlock('{"a":"say \\"}\\" ok"}')).toBe('{"a":"say \\"}\\" ok"}');
  });

  it('survives a reasoning model that thinks out loud before answering', () => {
    const raw = 'We need JSON.\nLet me think: {not json}\nFinal:\n```json\n{"notes":[]}\n```';
    expect(extractJsonBlock(raw)).toBe('{"notes":[]}');
  });
});

const note = (clientKey: string, extra: Record<string, unknown> = {}) => ({
  clientKey,
  content: clientKey,
  ...extra,
});

describe('parseExtraction', () => {
  it('parses notes and their clientKey-based relations', () => {
    const result = parseExtraction(
      JSON.stringify({
        notes: [note('note_0'), note('note_1')],
        relations: [{ from: 'note_0', to: 'note_1', type: 'supports' }],
      })
    );
    expect(result.notes).toHaveLength(2);
    expect(result.relations).toEqual([{ from: 'note_0', to: 'note_1', type: 'supports' }]);
  });

  it('defaults an unknown note type to idea', () => {
    const result = parseExtraction(
      JSON.stringify({ notes: [note('note_0', { type: 'nonsense' })] })
    );
    expect(result.notes[0].type).toBe('idea');
  });

  it('drops relations naming a clientKey that was never returned', () => {
    const result = parseExtraction(
      JSON.stringify({
        notes: [note('note_0')],
        relations: [{ from: 'note_0', to: 'note_9', type: 'related' }],
      })
    );
    expect(result.relations).toEqual([]);
  });

  it('drops self-referencing relations', () => {
    const result = parseExtraction(
      JSON.stringify({
        notes: [note('note_0'), note('note_1')],
        relations: [{ from: 'note_1', to: 'note_1', type: 'related' }],
      })
    );
    expect(result.relations).toEqual([]);
  });

  it('drops relations whose key is ambiguous, keeping both notes', () => {
    const result = parseExtraction(
      JSON.stringify({
        notes: [note('dup', { content: 'a' }), note('dup', { content: 'b' }), note('note_2')],
        relations: [{ from: 'dup', to: 'note_2', type: 'related' }],
      })
    );
    expect(result.notes).toHaveLength(3);
    expect(result.relations).toEqual([]);
  });

  it('accepts an empty extraction — a silent recording has no thought in it', () => {
    const result = parseExtraction('{"notes":[],"relations":[]}');
    expect(result.notes).toEqual([]);
    expect(result.relations).toEqual([]);
  });

  it('still rejects a reply that omits notes entirely', () => {
    expect(() => parseExtraction('{"relations":[]}')).toThrow();
  });

  it('trims to MAX_NOTES instead of throwing away the extraction', () => {
    const many = { notes: Array.from({ length: 12 }, (_, i) => note(`note_${i}`)) };
    expect(parseExtraction(JSON.stringify(many)).notes).toHaveLength(8);
  });

  it('drops relations that pointed at notes lost to the trim', () => {
    const many = {
      notes: Array.from({ length: 12 }, (_, i) => note(`note_${i}`)),
      relations: [{ from: 'note_0', to: 'note_11', type: 'related' }],
    };
    expect(parseExtraction(JSON.stringify(many)).relations).toEqual([]);
  });
});

describe('parseExtraction parentClientKey validation', () => {
  it('passes through a valid reference to a sibling clientKey', () => {
    const result = parseExtraction(
      JSON.stringify({
        notes: [note('note_0'), note('note_1', { parentClientKey: 'note_0' })],
      })
    );
    expect(result.notes[1].parentClientKey).toBe('note_0');
  });

  it('nulls a self-referencing parentClientKey', () => {
    const result = parseExtraction(
      JSON.stringify({ notes: [note('note_0', { parentClientKey: 'note_0' })] })
    );
    expect(result.notes[0].parentClientKey).toBeNull();
  });

  it('nulls a parentClientKey pointing at a duplicated (ambiguous) batch key', () => {
    const result = parseExtraction(
      JSON.stringify({
        notes: [
          note('dup', { content: 'a' }),
          note('dup', { content: 'b' }),
          note('note_2', { parentClientKey: 'dup' }),
        ],
      })
    );
    expect(result.notes[2].parentClientKey).toBeNull();
  });

  it('leaves an unrecognised key untouched — presumed an existing note id', () => {
    const result = parseExtraction(
      JSON.stringify({ notes: [note('note_0', { parentClientKey: 'existing-uuid-123' })] })
    );
    expect(result.notes[0].parentClientKey).toBe('existing-uuid-123');
  });
});

describe('parseExtraction dueAt', () => {
  it('keeps a valid ISO instant with an offset', () => {
    const result = parseExtraction(
      JSON.stringify({ notes: [note('note_0', { dueAt: '2026-08-11T15:00:00+03:00' })] })
    );
    expect(result.notes[0].dueAt).toBe('2026-08-11T15:00:00+03:00');
  });

  it('drops a malformed date to null instead of failing the extraction', () => {
    const result = parseExtraction(
      JSON.stringify({
        notes: [note('note_0', { dueAt: 'tomorrow at 3' }), note('note_1')],
      })
    );
    expect(result.notes[0].dueAt).toBeNull();
    expect(result.notes).toHaveLength(2);
  });

  it('rejects a bare date with no timezone — an instant needs an offset', () => {
    const result = parseExtraction(
      JSON.stringify({ notes: [note('note_0', { dueAt: '2026-08-11' })] })
    );
    expect(result.notes[0].dueAt).toBeNull();
  });

  it('leaves dueAt absent when the model omits it', () => {
    const result = parseExtraction(JSON.stringify({ notes: [note('note_0')] }));
    expect(result.notes[0].dueAt ?? null).toBeNull();
  });
});

describe('resolveParentId', () => {
  const ctx = (overrides: Partial<Parameters<typeof resolveParentId>[2]> = {}) => ({
    batchIndex: new Map([
      ['note_0', 0],
      ['note_1', 1],
    ]),
    batchIds: new Map([
      ['note_0', 'id-0'],
      ['note_1', 'id-1'],
    ]),
    existingIds: new Set<string>(),
    ...overrides,
  });

  it('resolves a same-batch parent emitted earlier', () => {
    expect(resolveParentId({ clientKey: 'note_1', parentClientKey: 'note_0' }, 1, ctx())).toBe(
      'id-0'
    );
  });

  it('refuses a forward reference — parent emitted later in the batch', () => {
    expect(resolveParentId({ clientKey: 'note_0', parentClientKey: 'note_1' }, 0, ctx())).toBeNull();
  });

  it('resolves a reference to an existing note regardless of order', () => {
    const result = resolveParentId(
      { clientKey: 'note_0', parentClientKey: 'existing-uuid' },
      0,
      ctx({ existingIds: new Set(['existing-uuid']) })
    );
    expect(result).toBe('existing-uuid');
  });

  it('drops an unresolvable reference to top-level instead of throwing', () => {
    expect(
      resolveParentId({ clientKey: 'note_0', parentClientKey: 'nonsense' }, 0, ctx())
    ).toBeNull();
  });

  it('returns null when there is no parent at all', () => {
    expect(resolveParentId({ clientKey: 'note_0', parentClientKey: null }, 0, ctx())).toBeNull();
  });
});

describe('colorForNote', () => {
  it('falls back to the type colour when the model omits one', () => {
    expect(colorForNote('task')).toBe('#C8E6C9');
    expect(colorForNote('question', null)).toBe('#BBDEFB');
  });

  it('honours an explicit hex but rejects anything unrenderable', () => {
    expect(colorForNote('idea', '#ABCDEF')).toBe('#ABCDEF');
    expect(colorForNote('idea', 'red')).toBe('#FFF8BC');
    expect(colorForNote('idea', '#FFF')).toBe('#FFF8BC');
    expect(colorForNote('idea', 'javascript:alert(1)')).toBe('#FFF8BC');
  });
});
