import { z } from 'zod';
import {
  NOTE_TYPES,
  REL_TYPES,
  colorForNote,
  resolveParentId,
} from '../../../supabase/functions/_shared/extraction.ts';
import {
  layoutNewNotes,
  placeChild,
  type Rect,
} from '../../../supabase/functions/_shared/layout.ts';

/**
 * Turns the tree an agent hands us into the exact rows sticky_notes /
 * relationships / note_groups want — ids, parent links, colours and canvas
 * positions included. Pure: no network, no clock, no randomness beyond the
 * injected id factory, which is what makes structure.test.ts possible.
 *
 * The LLM calling this server replaces ai-extract's model call, so we reuse
 * that pipeline's *modules* (colorForNote, resolveParentId, the layout
 * engine) rather than the edge function, which is welded to a transcript row
 * and to credit reservations. parseExtraction is deliberately NOT reused: it
 * caps at 8 notes, which is right for 60s of speech and wrong for a PDF.
 */

/** Breathing room between a group frame and the notes it encloses. */
const GROUP_PADDING = 28;

export const noteInputSchema = z.object({
  clientKey: z
    .string()
    .min(1)
    .describe('Your own unique label for this note, used by parentKey/relations/groups.'),
  title: z.string().max(80).nullish().describe('Short headline. Omit for a one-liner note.'),
  content: z.string().min(1).describe('The note body — one idea, a couple of sentences at most.'),
  type: z.enum(NOTE_TYPES).default('idea'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullish()
    .describe('Rarely needed: colour is derived from type.'),
  parentKey: z
    .string()
    .nullish()
    .describe(
      'clientKey of the note this one sits under, or the uuid of a note already in the space. Null for a top-level note.'
    ),
  dueAt: z
    .string()
    .datetime({ offset: true })
    .nullish()
    .describe('ISO 8601 instant this note is for, when the source states one.'),
});

export const relationInputSchema = z.object({
  from: z.string().describe('clientKey or existing note uuid'),
  to: z.string().describe('clientKey or existing note uuid'),
  type: z.enum(REL_TYPES).default('related'),
});

export const groupInputSchema = z.object({
  title: z.string().min(1).describe('Frame label, e.g. "Risks" or "Q3 launch".'),
  color: z.string().nullish(),
  memberKeys: z
    .array(z.string().min(1))
    .min(1)
    .describe('clientKeys of the notes this frame should enclose.'),
});

export type NoteInput = z.infer<typeof noteInputSchema>;
export type RelationInput = z.infer<typeof relationInputSchema>;
export type GroupInput = z.infer<typeof groupInputSchema>;

/** A note already on the board — supplies occupied rects and valid parent ids. */
export interface ExistingNote extends Rect {
  id: string;
  parent_id: string | null;
}

export interface NoteRow {
  id: string;
  space_id: string;
  title: string | null;
  content: string;
  type: NoteInput['type'];
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parent_id: string | null;
  due_at: string | null;
  source_type: 'ai';
}

export interface RelationRow {
  space_id: string;
  from_note_id: string;
  to_note_id: string;
  type: RelationInput['type'];
  created_by: 'ai';
}

export interface GroupRow {
  space_id: string;
  title: string;
  color: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StructureResult {
  notes: NoteRow[];
  relationships: RelationRow[];
  groups: GroupRow[];
  /** clientKey -> the id the note was given, so callers can report it back. */
  idByKey: Map<string, string>;
}

/**
 * Parent-before-child ordering, because resolveParentId (correctly) refuses a
 * forward reference: FK checks are deferred inside a multi-row INSERT, so a
 * child listed first would otherwise commit pointing at nothing. An agent
 * emits notes in reading order, not dependency order, so sort rather than
 * silently flattening half the tree to top level.
 */
export function topoSort(notes: NoteInput[]): NoteInput[] {
  const byKey = new Map(notes.map((n) => [n.clientKey, n]));
  const sorted: NoteInput[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (note: NoteInput, trail: string[]) => {
    const status = state.get(note.clientKey);
    if (status === 'done') return;
    if (status === 'visiting') {
      throw new Error(`parentKey cycle: ${[...trail, note.clientKey].join(' -> ')}`);
    }
    state.set(note.clientKey, 'visiting');

    const parent = note.parentKey ? byKey.get(note.parentKey) : undefined;
    if (parent) visit(parent, [...trail, note.clientKey]);

    state.set(note.clientKey, 'done');
    sorted.push(note);
  };

  for (const note of notes) visit(note, []);
  return sorted;
}

/** A note belongs to whichever group its top-most in-batch ancestor is in. */
function clusterByKey(notes: NoteInput[], groups: GroupInput[]): Map<string, number> {
  const byKey = new Map(notes.map((n) => [n.clientKey, n]));
  const direct = new Map<string, number>();
  groups.forEach((group, index) => {
    for (const key of group.memberKeys) if (byKey.has(key)) direct.set(key, index);
  });

  const rootOf = (note: NoteInput): NoteInput => {
    const parent = note.parentKey ? byKey.get(note.parentKey) : undefined;
    return parent ? rootOf(parent) : note;
  };

  const cluster = new Map<string, number>();
  for (const note of notes) {
    const index = direct.get(rootOf(note).clientKey);
    if (index !== undefined) cluster.set(note.clientKey, index);
  }
  return cluster;
}

function boundingRect(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x)) - GROUP_PADDING;
  const y = Math.min(...rects.map((r) => r.y)) - GROUP_PADDING;
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) + GROUP_PADDING - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) + GROUP_PADDING - y,
  };
}

export interface StructureInput {
  spaceId: string;
  notes: NoteInput[];
  relations?: RelationInput[];
  groups?: GroupInput[];
  existing: ExistingNote[];
  /** Injected so the test can assert on stable ids. */
  newId?: () => string;
}

export function structureNotes({
  spaceId,
  notes,
  relations = [],
  groups = [],
  existing,
  newId = () => crypto.randomUUID(),
}: StructureInput): StructureResult {
  const duplicate = notes.map((n) => n.clientKey).find((k, i, all) => all.indexOf(k) !== i);
  // Loud, not lenient: a repeated key silently misfiles parents and relations,
  // and the caller is an agent that can just retry with distinct keys.
  if (duplicate) throw new Error(`duplicate clientKey: ${duplicate}`);

  const ordered = topoSort(notes);
  const idByKey = new Map(ordered.map((note) => [note.clientKey, newId()]));
  const existingIds = new Set(existing.map((n) => n.id));
  const keyById = new Map([...idByKey].map(([key, id]) => [id, key]));
  const cluster = clusterByKey(ordered, groups);

  const indexByKey = new Map(ordered.map((n, i) => [n.clientKey, i]));

  const parentIds = ordered.map((note, index) =>
    resolveParentId(
      { clientKey: note.clientKey, parentClientKey: note.parentKey ?? null },
      index,
      {
        batchIndex: indexByKey,
        batchIds: idByKey,
        existingIds,
      }
    )
  );

  // Everything already on the board blocks a slot. Only top-level notes claim
  // grid slots; a child orbits its parent (ai-extract does the same).
  const occupied: Rect[] = existing.map((n) => ({ x: n.x, y: n.y, width: n.width, height: n.height }));
  const rectByKey = new Map<string, Rect>();
  const siblingCount = new Map<string, number>();
  const frameByCluster = new Map<number, Rect>();

  // Cluster by cluster, so a group's notes land together and the frame we then
  // draw around them blocks the next cluster from overlapping it.
  const clusterOrder = [...groups.keys(), -1];
  for (const clusterIndex of clusterOrder) {
    const members = ordered.filter(
      (note) => (cluster.get(note.clientKey) ?? -1) === clusterIndex
    );
    if (!members.length) continue;

    const topLevel = members.filter((n) => parentIds[indexByKey.get(n.clientKey)!] === null);
    const slots = layoutNewNotes(topLevel.length, occupied);
    topLevel.forEach((note, i) => rectByKey.set(note.clientKey, slots[i]));
    occupied.push(...slots);

    for (const note of members) {
      if (rectByKey.has(note.clientKey)) continue;
      const parentId = parentIds[indexByKey.get(note.clientKey)!]!;
      const seen = siblingCount.get(parentId) ?? 0;
      siblingCount.set(parentId, seen + 1);

      const parentRect =
        existing.find((n) => n.id === parentId) ?? rectByKey.get(keyById.get(parentId)!)!;

      const rect = placeChild(parentRect, seen, occupied);
      rectByKey.set(note.clientKey, rect);
      occupied.push(rect);
    }

    if (clusterIndex >= 0) {
      // The frame wraps the whole cluster — members plus the sub-notes that
      // were adopted into it — not just the keys the caller listed.
      const frame = boundingRect(members.map((n) => rectByKey.get(n.clientKey)!));
      frameByCluster.set(clusterIndex, frame);
      occupied.push(frame);
    }
  }

  const noteRows: NoteRow[] = ordered.map((note, index) => {
    const rect = rectByKey.get(note.clientKey)!;
    return {
      id: idByKey.get(note.clientKey)!,
      space_id: spaceId,
      title: note.title ?? null,
      content: note.content,
      type: note.type,
      color: colorForNote(note.type, note.color),
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      parent_id: parentIds[index],
      due_at: note.dueAt ?? null,
      source_type: 'ai',
    };
  });

  const resolve = (key: string) =>
    idByKey.get(key) ?? (existingIds.has(key) ? key : null);

  const seenRel = new Set<string>();
  const relationships: RelationRow[] = [];
  for (const rel of relations) {
    const from = resolve(rel.from);
    const to = resolve(rel.to);
    // no_self_link and the (from,to,type) unique index are DB constraints —
    // a bad pair would fail the whole insert, so drop them here instead.
    if (!from || !to || from === to) continue;
    const key = `${from}|${to}|${rel.type}`;
    if (seenRel.has(key)) continue;
    seenRel.add(key);
    relationships.push({
      space_id: spaceId,
      from_note_id: from,
      to_note_id: to,
      type: rel.type,
      created_by: 'ai',
    });
  }

  const groupRows: GroupRow[] = groups
    .map((group, index) => {
      const frame = frameByCluster.get(index);
      // No frame means every listed key was unknown — skip rather than draw an
      // empty rectangle at the origin.
      return frame
        ? { space_id: spaceId, title: group.title, color: group.color ?? null, ...frame }
        : null;
    })
    .filter((row): row is GroupRow => row !== null);

  return { notes: noteRows, relationships, groups: groupRows, idByKey };
}
