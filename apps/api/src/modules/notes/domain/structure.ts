import { NOTE_TYPES, REL_TYPES, type NoteType, type RelType, type GroupOut } from './entities.js';
import { InvalidStructureError } from './errors.js';

export const NOTE_COLORS: Record<NoteType, string> = {
  idea: '#FFF8BC',
  task: '#C8E6C9',
  question: '#BBDEFB',
  decision: '#F8BBD0',
  reference: '#E1BEE7',
  thought: '#FFE0B2',
  summary: '#B2EBF2',
};

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

export function colorForNote(type: NoteType, proposed?: string | null): string {
  if (proposed && HEX_REGEX.test(proposed)) {
    return proposed;
  }
  return NOTE_COLORS[type] || NOTE_COLORS.idea;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExistingNote extends Rect {
  id: string;
  parent_id: string | null;
}

export interface IngestNoteItem {
  clientKey: string;
  title?: string | null;
  content: string;
  type: NoteType;
  color?: string | null;
  parentKey?: string | null;
  dueAt?: string | null;
}

export interface IngestRelationItem {
  from: string;
  to: string;
  type: RelType;
}

export interface IngestGroupItem {
  title: string;
  color?: string | null;
  memberKeys: string[];
}

export interface NoteRow {
  id: string;
  space_id: string;
  title: string | null;
  content: string;
  type: NoteType;
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
  type: RelType;
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
  idByKey: Map<string, string>;
}

const DEFAULT_WIDTH = 250;
const DEFAULT_HEIGHT = 190;
const GAP = 24;
export const CHILD_WIDTH = 180;
export const CHILD_HEIGHT = 135;
const CHILD_DISTANCE = 250;
const CHILD_ANGLE_STEP = (2 * Math.PI) / 6;
export const COLUMNS = 5;
const STEP_X = DEFAULT_WIDTH + GAP;
const STEP_Y = DEFAULT_HEIGHT + GAP;
const GROUP_PADDING = 28;

export function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function slotRect(index: number): Rect {
  return {
    x: (index % COLUMNS) * STEP_X,
    y: Math.floor(index / COLUMNS) * STEP_Y,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  };
}

export function layoutNewNotes(count: number, existing: Rect[]): Rect[] {
  const placed: Rect[] = [];
  let slot = 0;

  for (let i = 0; i < count; i++) {
    let candidate = slotRect(slot);
    while (
      slot < 4000 &&
      [...existing, ...placed].some((rect) => overlaps(candidate, rect))
    ) {
      slot++;
      candidate = slotRect(slot);
    }
    placed.push(candidate);
    slot++;
  }

  return placed;
}

export function radialChildRect(parent: Rect, angleSlot: number, ring = 0): Rect {
  const distance = CHILD_DISTANCE + ring * CHILD_DISTANCE * 0.8;
  const angle = -Math.PI / 2 + angleSlot * CHILD_ANGLE_STEP;
  const cx = parent.x + parent.width / 2 + Math.cos(angle) * distance;
  const cy = parent.y + parent.height / 2 + Math.sin(angle) * distance;
  return {
    x: cx - CHILD_WIDTH / 2,
    y: cy - CHILD_HEIGHT / 2,
    width: CHILD_WIDTH,
    height: CHILD_HEIGHT,
  };
}

export function placeChild(parent: Rect, siblingIndex: number, occupied: Rect[]): Rect {
  const clashes = (rect: Rect) =>
    overlaps(rect, parent) || occupied.some((o) => overlaps(rect, o));

  for (let attempt = siblingIndex; attempt < siblingIndex + 60; attempt++) {
    const candidate = radialChildRect(parent, attempt % 6, Math.floor(attempt / 6));
    if (!clashes(candidate)) return candidate;
  }

  return radialChildRect(parent, siblingIndex, 10);
}

export function boundingRect(rects: Rect[]): Rect {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 460, height: 360 };
  }
  const x = Math.min(...rects.map((r) => r.x)) - GROUP_PADDING;
  const y = Math.min(...rects.map((r) => r.y)) - GROUP_PADDING;
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) + GROUP_PADDING - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) + GROUP_PADDING - y,
  };
}

export function wouldCycle(
  noteId: string,
  parentId: string,
  parentOf: Map<string, string | null>
): boolean {
  if (noteId === parentId) return true;

  let cursor: string | null | undefined = parentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === noteId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = parentOf.get(cursor) ?? null;
  }
  return false;
}

export function topoSort(notes: IngestNoteItem[]): IngestNoteItem[] {
  const byKey = new Map(notes.map((n) => [n.clientKey, n]));
  const sorted: IngestNoteItem[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (note: IngestNoteItem, trail: string[]) => {
    const status = state.get(note.clientKey);
    if (status === 'done') return;
    if (status === 'visiting') {
      throw new InvalidStructureError(`parentKey cycle: ${[...trail, note.clientKey].join(' -> ')}`);
    }
    state.set(note.clientKey, 'visiting');

    const parent = note.parentKey ? byKey.get(note.parentKey) : undefined;
    if (parent) {
      visit(parent, [...trail, note.clientKey]);
    }

    state.set(note.clientKey, 'done');
    sorted.push(note);
  };

  for (const note of notes) {
    visit(note, []);
  }

  return sorted;
}

function clusterByKey(notes: IngestNoteItem[], groups: IngestGroupItem[]): Map<string, number> {
  const byKey = new Map(notes.map((n) => [n.clientKey, n]));
  const direct = new Map<string, number>();

  groups.forEach((group, index) => {
    for (const key of group.memberKeys) {
      if (byKey.has(key)) direct.set(key, index);
    }
  });

  const rootOf = (note: IngestNoteItem): IngestNoteItem => {
    const parent = note.parentKey ? byKey.get(note.parentKey) : undefined;
    return parent ? rootOf(parent) : note;
  };

  const cluster = new Map<string, number>();
  for (const note of notes) {
    const index = direct.get(rootOf(note).clientKey);
    if (index !== undefined) {
      cluster.set(note.clientKey, index);
    }
  }

  return cluster;
}

export interface StructureInput {
  spaceId: string;
  notes: IngestNoteItem[];
  relations?: IngestRelationItem[];
  groups?: IngestGroupItem[];
  existing: ExistingNote[];
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
  if (duplicate) {
    throw new InvalidStructureError(`duplicate clientKey: ${duplicate}`);
  }

  const ordered = topoSort(notes);
  const idByKey = new Map(ordered.map((note) => [note.clientKey, newId()]));
  const existingIds = new Set(existing.map((n) => n.id));
  const keyById = new Map([...idByKey].map(([key, id]) => [id, key]));
  const cluster = clusterByKey(ordered, groups);
  const indexByKey = new Map(ordered.map((n, i) => [n.clientKey, i]));

  const parentIds = ordered.map((note, index) => {
    const key = note.parentKey;
    if (!key || key === note.clientKey) return null;
    const parentIndex = indexByKey.get(key);
    if (parentIndex !== undefined) {
      return parentIndex < index ? idByKey.get(key) ?? null : null;
    }
    return existingIds.has(key) ? key : null;
  });

  const occupied: Rect[] = existing.map((n) => ({
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
  }));
  const rectByKey = new Map<string, Rect>();
  const siblingCount = new Map<string, number>();
  const frameByCluster = new Map<number, Rect>();

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

  const resolve = (key: string) => idByKey.get(key) ?? (existingIds.has(key) ? key : null);

  const seenRel = new Set<string>();
  const relationships: RelationRow[] = [];
  for (const rel of relations) {
    const from = resolve(rel.from);
    const to = resolve(rel.to);
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
      return frame
        ? {
            space_id: spaceId,
            title: group.title,
            color: group.color ?? null,
            ...frame,
          }
        : null;
    })
    .filter((row): row is GroupRow => row !== null);

  return { notes: noteRows, relationships, groups: groupRows, idByKey };
}
