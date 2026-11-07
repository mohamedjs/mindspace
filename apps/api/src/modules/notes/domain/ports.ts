import type {
  NoteOut,
  GroupOut,
  RelationshipOut,
  NoteType,
  RelType,
  MindMapResult,
} from './entities.js';
import type {
  ExistingNote,
  NoteRow,
  RelationRow,
  GroupRow,
} from './structure.js';

export interface CreateNoteData {
  spaceId: string;
  content: string;
  type?: NoteType;
  color?: string | null;
  x: number;
  y: number;
  width?: number;
  height?: number;
  parentId?: string | null;
  title?: string | null;
  dueAt?: string | null;
}

export interface BulkCreateNoteData {
  id?: string;
  spaceId: string;
  content: string;
  type?: NoteType;
  color?: string | null;
  x: number;
  y: number;
  width?: number;
  height?: number;
  parentId?: string | null;
  title?: string | null;
  dueAt?: string | null;
}

export interface CreateGroupData {
  spaceId: string;
  title?: string | null;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string | null;
}

export interface CreateRelationshipData {
  spaceId: string;
  fromNoteId: string;
  toNoteId: string;
  type?: RelType;
}

export interface SpaceActivityPort {
  ensureOwned(spaceId: string, userId: string, trx?: unknown): Promise<void>;
  bumpActivity(spaceId: string, noteDelta: number, trx?: unknown): Promise<void>;
}

export interface TimelinePort {
  recordEvent(
    event: {
      userId: string;
      spaceId: string;
      type: string;
      refId?: string | null;
      summary: string;
    },
    trx?: unknown
  ): Promise<void>;
}

export interface NoteRepositoryPort {
  listBySpace(userId: string, spaceId: string, trx?: unknown): Promise<NoteOut[]>;
  findById(userId: string, noteId: string, trx?: unknown): Promise<NoteOut | null>;
  create(userId: string, data: CreateNoteData, trx?: unknown): Promise<NoteOut>;
  updateContent(userId: string, noteId: string, title: string | null, content: string, trx?: unknown): Promise<void>;
  updateColor(userId: string, noteId: string, color: string | null, trx?: unknown): Promise<void>;
  updateType(userId: string, noteId: string, type: NoteType, trx?: unknown): Promise<void>;
  updatePosition(userId: string, noteId: string, x: number, y: number, trx?: unknown): Promise<void>;
  updateParent(userId: string, noteId: string, parentId: string | null, trx?: unknown): Promise<void>;
  softDelete(userId: string, noteId: string, trx?: unknown): Promise<NoteOut | null>;
  promoteChildren(userId: string, parentNoteId: string, trx?: unknown): Promise<void>;
  bulkPromoteChildren(userId: string, parentNoteIds: string[], trx?: unknown): Promise<void>;
  bulkMove(userId: string, moves: Array<{ id: string; x: number; y: number }>, trx?: unknown): Promise<void>;
  bulkUpdate(userId: string, ids: string[], updates: { color?: string | null; type?: NoteType }, trx?: unknown): Promise<void>;
  bulkSoftDelete(userId: string, ids: string[], trx?: unknown): Promise<NoteOut[]>;
  bulkRestore(userId: string, ids: string[], trx?: unknown): Promise<NoteOut[]>;
  bulkCreate(userId: string, notes: BulkCreateNoteData[], trx?: unknown): Promise<NoteOut[]>;
  bulkInsertStructuredNotes(userId: string, notes: NoteRow[], trx?: unknown): Promise<void>;
  hasCycle(proposedParentId: string, noteId: string, trx?: unknown): Promise<boolean>;
  findLiveByIds(userId: string, ids: string[], trx?: unknown): Promise<NoteOut[]>;
  findDeletedByIds(userId: string, ids: string[], trx?: unknown): Promise<NoteOut[]>;
  findAnyById(userId: string, noteId: string, trx?: unknown): Promise<NoteOut | null>;
  findAnyByIds(userId: string, ids: string[], trx?: unknown): Promise<NoteOut[]>;
  getExistingForLayout(userId: string, spaceId: string, trx?: unknown): Promise<ExistingNote[]>;
  getMindMap(userId: string, spaceId: string, trx?: unknown): Promise<MindMapResult>;
}

export interface GroupRepositoryPort {
  listBySpace(userId: string, spaceId: string, trx?: unknown): Promise<GroupOut[]>;
  findById(userId: string, groupId: string, trx?: unknown): Promise<GroupOut | null>;
  create(userId: string, data: CreateGroupData, trx?: unknown): Promise<GroupOut>;
  bulkInsertStructuredGroups(userId: string, groups: GroupRow[], trx?: unknown): Promise<GroupOut[]>;
  update(userId: string, groupId: string, data: Partial<CreateGroupData>, trx?: unknown): Promise<void>;
  softDelete(userId: string, groupId: string, trx?: unknown): Promise<void>;
}

export interface RelationshipRepositoryPort {
  listBySpace(userId: string, spaceId: string, trx?: unknown): Promise<RelationshipOut[]>;
  create(userId: string, data: CreateRelationshipData, trx?: unknown): Promise<RelationshipOut>;
  bulkCreate(userId: string, relations: Array<{ spaceId: string; fromNoteId: string; toNoteId: string; type?: RelType }>, trx?: unknown): Promise<RelationshipOut[]>;
  bulkInsertStructuredRelations(userId: string, relations: RelationRow[], trx?: unknown): Promise<number>;
  softDelete(userId: string, spaceId: string, fromNoteId: string, toNoteId: string, type?: RelType | null, trx?: unknown): Promise<void>;
}

export interface UnitOfWorkPort {
  runInTransaction<T>(work: (trx: unknown) => Promise<T>): Promise<T>;
}
