import type {
  AiAction,
  AiActionItem,
  AiActionStatus,
  AiModel,
  ChatArgs,
  ChatResult,
  ExistingNoteContext,
  ModelKind,
  ModelPreferences,
} from './entities.js';

export interface AiModelRepositoryPort {
  listModels(): Promise<AiModel[]>;
  getModelById(id: string): Promise<AiModel | null>;
  getDefaultModel(kind: ModelKind): Promise<AiModel | null>;
  findEnabledModelForProviders(kind: ModelKind, providers: string[]): Promise<AiModel | null>;
  getUserModelPreferences(userId: string): Promise<ModelPreferences>;
  updateUserModelPreference(userId: string, kind: ModelKind, modelRowId: string | null): Promise<void>;
  listActiveProviderKeys(userId: string): Promise<string[]>;
}

export interface AiActionRepositoryPort {
  findActionById(actionId: string, userId: string): Promise<AiAction | null>;
  findActionByRecording(recordingId: string, userId: string): Promise<AiAction | null>;
  createAction(
    action: Omit<AiAction, 'id' | 'createdAt' | 'resolvedAt'>,
    tx?: unknown
  ): Promise<string>;
  updateActionStatus(
    actionId: string,
    status: AiActionStatus,
    resolvedAt?: Date | null,
    tx?: unknown
  ): Promise<void>;
  createActionItems(items: Array<Omit<AiActionItem, 'id'>>, tx?: unknown): Promise<void>;
  listActionItems(actionId: string, tx?: unknown): Promise<AiActionItem[]>;
  updateActionItemApplied(itemId: string, appliedAt: Date | null, tx?: unknown): Promise<void>;
}

export interface AiChatProviderPort {
  chat(args: ChatArgs): Promise<ChatResult>;
}

export interface AiKeyResolverPort {
  resolveKey(
    userId: string,
    provider: string,
    byokOnly: boolean
  ): Promise<{ apiKey: string; usesPlatformKey: boolean; baseUrl: string }>;
}

export interface AiCreditsPort {
  reserve(userId: string, amount: number, tx?: unknown): Promise<string>;
  settle(
    reservationId: string,
    userId: string,
    actual: number,
    aiActionId: string | null,
    tx: unknown
  ): Promise<number>;
  release(reservationId: string, userId?: string, tx?: unknown): Promise<void>;
}

export interface AiSpacePort {
  ensureOwned(spaceId: string, userId: string, tx?: unknown): Promise<void>;
  createSpace(
    userId: string,
    space: { name: string; emoji?: string },
    tx?: unknown
  ): Promise<{ id: string; name: string }>;
  bumpActivity(spaceId: string, noteDelta: number, tx?: unknown): Promise<void>;
}

export interface NoteInsertRow {
  id: string;
  userId: string;
  spaceId: string;
  title: string | null;
  content: string;
  type: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: string | null;
  dueAt: string | null;
  sourceType: string;
  recordingId: string | null;
  transcriptId: string | null;
  spanStart: number | null;
  spanEnd: number | null;
  aiActionId: string | null;
}

export interface AiNotePort {
  getNoteById(noteId: string, userId: string, tx?: unknown): Promise<ExistingNoteContext | null>;
  listSpaceNotes(
    spaceId: string,
    userId: string,
    limit?: number,
    tx?: unknown
  ): Promise<ExistingNoteContext[]>;
  insertNotes(notes: NoteInsertRow[], tx?: unknown): Promise<Array<{ id: string }>>;
  updateNoteContent(
    noteId: string,
    userId: string,
    patch: { title?: string | null; content?: string; dueAt?: string | null },
    tx?: unknown
  ): Promise<void>;
  softDeleteNote(noteId: string, userId: string, tx?: unknown): Promise<void>;
  countLiveNotesForAction(actionId: string, userId: string, tx?: unknown): Promise<number>;
}

export interface RelationshipInsertRow {
  userId: string;
  spaceId: string;
  fromNoteId: string;
  toNoteId: string;
  type: string;
  createdBy: string;
  aiActionId: string | null;
}

export interface AiRelationshipPort {
  insertRelationships(rels: RelationshipInsertRow[], tx?: unknown): Promise<void>;
  softDeleteRelationship(relId: string, userId: string, tx?: unknown): Promise<void>;
  softDeleteRelationshipsForAction(actionId: string, userId: string, tx?: unknown): Promise<void>;
}

export interface AiTranscriptPort {
  findTranscript(
    transcriptId: string,
    userId: string,
    tx?: unknown
  ): Promise<{ id: string; userId: string; recordingId: string; text: string } | null>;
}

export interface AiRecordingPort {
  updateRecordingStatus(
    recordingId: string,
    userId: string,
    status: string,
    tx?: unknown
  ): Promise<void>;
}

export interface AiUserProfilePort {
  getUserTimezone(userId: string, tx?: unknown): Promise<string>;
}

export interface AiUnitOfWorkPort {
  runInTransaction<T>(work: (trx: unknown) => Promise<T>): Promise<T>;
}
