export const NOTE_TYPES = [
  'idea',
  'task',
  'question',
  'decision',
  'reference',
  'thought',
  'summary',
] as const;

export type NoteType = (typeof NOTE_TYPES)[number];

export const REL_TYPES = [
  'related',
  'depends_on',
  'supports',
  'contradicts',
  'derived_from',
  'child_of',
] as const;

export type RelType = (typeof REL_TYPES)[number];

export const SOURCE_TYPES = ['voice', 'manual', 'ai'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export interface Note {
  id: string;
  userId: string;
  spaceId: string;
  title: string | null;
  content: string;
  type: NoteType;
  color: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: string | null;
  zIndex: number;
  sourceType: SourceType;
  recordingId: string | null;
  transcriptId: string | null;
  spanStart: number | null;
  spanEnd: number | null;
  aiActionId: string | null;
  dueAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt?: Date | string | null;
}

export interface NoteOut {
  id: string;
  title: string | null;
  content: string;
  type: NoteType;
  color: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  parent_id: string | null;
  space_id: string;
  due_at: string | null;
  created_at: string;
}

export interface NoteGroup {
  id: string;
  userId: string;
  spaceId: string;
  title: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string | null;
  createdAt: Date | string;
  deletedAt?: Date | string | null;
}

export interface GroupOut {
  id: string;
  title: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string | null;
}

export interface Relationship {
  id: string;
  userId: string;
  spaceId: string;
  fromNoteId: string;
  toNoteId: string;
  type: RelType;
  createdBy: string;
  aiActionId: string | null;
  createdAt: Date | string;
  deletedAt?: Date | string | null;
}

export interface RelationshipOut {
  id: string;
  from_note_id: string;
  to_note_id: string;
  type: RelType;
  created_by: string;
  created_at: string;
}

export interface MindMapEdge {
  id: string;
  from: string;
  to: string;
  from_note_id?: string;
  to_note_id?: string;
  type: string;
}

export interface MindMapResult {
  nodes: NoteOut[];
  edges: MindMapEdge[];
}
