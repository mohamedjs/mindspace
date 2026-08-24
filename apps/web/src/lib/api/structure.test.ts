import assert from 'node:assert/strict';
import { CHILD_WIDTH } from '@/features/ai/services/layout';
import { structureNotes, topoSort, type NoteInput } from './structure';

/**
 * Guards the document -> note-tree structuring: ordering, parent resolution,
 * relation mapping and layout. No network, no Supabase.
 * Moved here from apps/mcp with the logic it covers — the MCP server is now a
 * thin HTTP client and this runs inside POST /api/spaces/[spaceId]/ingest.
 * Run: npm test --workspace=@mindspace/web
 */

const note = (clientKey: string, parentKey: string | null = null): NoteInput => ({
  clientKey,
  content: clientKey,
  type: 'idea',
  parentKey,
  title: null,
  color: null,
  dueAt: null,
});

const SPACE = '00000000-0000-4000-8000-000000000001';
let counter = 0;
const seqId = () => `id-${++counter}`;
const run = (input: Parameters<typeof structureNotes>[0]) => {
  counter = 0;
  return structureNotes(input);
};

test('a child listed before its parent still gets linked, parents inserted first', () => {
  const result = run({
    spaceId: SPACE,
    // deliberately out of order: grandchild, child, root
    notes: [note('grandchild', 'child'), note('child', 'root'), note('root')],
    existing: [],
    newId: seqId,
  });

  const byContent = new Map(result.notes.map((n) => [n.content, n]));
  assert.equal(byContent.get('root')!.parent_id, null);
  assert.equal(byContent.get('child')!.parent_id, byContent.get('root')!.id);
  assert.equal(byContent.get('grandchild')!.parent_id, byContent.get('child')!.id);

  // parents must be inserted before their children (deferred FK checks).
  const position = new Map(result.notes.map((n, i) => [n.id, i]));
  for (const row of result.notes) {
    if (row.parent_id) assert.ok(position.get(row.parent_id)! < position.get(row.id)!);
  }
});

test('existing note ids resolve as parents, unknown keys drop to top level', () => {
  const existingId = '00000000-0000-4000-8000-0000000000aa';
  const result = run({
    spaceId: SPACE,
    notes: [note('grafted', existingId), note('lost', 'nope')],
    existing: [{ id: existingId, x: 0, y: 0, width: 190, height: 145, parent_id: null }],
    newId: seqId,
  });

  const byContent = new Map(result.notes.map((n) => [n.content, n]));
  assert.equal(byContent.get('grafted')!.parent_id, existingId);
  assert.equal(byContent.get('lost')!.parent_id, null);
});

test('cycles and duplicate keys fail loudly', () => {
  assert.throws(() => topoSort([note('a', 'b'), note('b', 'a')]), /cycle/);
  assert.throws(
    () => run({ spaceId: SPACE, notes: [note('dup'), note('dup')], existing: [], newId: seqId }),
    /duplicate clientKey/
  );
});

test('relations map onto real ids; self-links, dupes and ghosts are dropped', () => {
  const result = run({
    spaceId: SPACE,
    notes: [note('a'), note('b')],
    relations: [
      { from: 'a', to: 'b', type: 'depends_on' },
      { from: 'a', to: 'b', type: 'depends_on' },
      { from: 'a', to: 'a', type: 'related' },
      { from: 'ghost', to: 'b', type: 'related' },
    ],
    existing: [],
    newId: seqId,
  });

  assert.equal(result.relationships.length, 1);
  const [rel] = result.relationships;
  assert.equal(rel.from_note_id, result.idByKey.get('a'));
  assert.equal(rel.to_note_id, result.idByKey.get('b'));
  assert.equal(rel.space_id, SPACE);
});

test('layout: nothing overlaps, children orbit, groups frame their members', () => {
  const result = run({
    spaceId: SPACE,
    notes: [note('r1'), note('r1a', 'r1'), note('r1b', 'r1'), note('r2'), note('loose')],
    groups: [{ title: 'Section one', memberKeys: ['r1'], color: null }],
    existing: [{ id: 'x', x: 0, y: 0, width: 190, height: 145, parent_id: null }],
    newId: seqId,
  });

  const rects = [
    ...result.notes.map((n) => ({ x: n.x, y: n.y, width: n.width, height: n.height })),
    { x: 0, y: 0, width: 190, height: 145 },
  ];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const hit =
        a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      assert.ok(!hit, `notes overlap: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    }
  }

  // The group frame encloses the parent AND the children it adopted.
  assert.equal(result.groups.length, 1);
  const frame = result.groups[0];
  for (const key of ['r1', 'r1a', 'r1b']) {
    const row = result.notes.find((n) => n.content === key)!;
    assert.ok(row.x >= frame.x && row.x + row.width <= frame.x + frame.width, `${key} outside frame`);
    assert.ok(
      row.y >= frame.y && row.y + row.height <= frame.y + frame.height,
      `${key} outside frame`
    );
  }

  // Children are the smaller radial size, not grid-sized.
  assert.equal(result.notes.find((n) => n.content === 'r1a')!.width, CHILD_WIDTH);
  // Colour comes from type, never left null (the canvas renders it).
  assert.ok(result.notes.every((n) => /^#[0-9A-F]{6}$/i.test(n.color)));
});
