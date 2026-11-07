import { sql } from 'kysely';
import type { Database } from '../../../platform/db.js';
import type { ExistingNoteContext } from '../domain/entities.js';
import type {
  AiNotePort,
  AiRecordingPort,
  AiRelationshipPort,
  AiTranscriptPort,
  AiUnitOfWorkPort,
  AiUserProfilePort,
  NoteInsertRow,
  RelationshipInsertRow,
} from '../domain/ports.js';

export class KyselyAiNoteAdapter implements AiNotePort {
  constructor(private readonly db: Database) {}

  private getClient(tx?: unknown): Database {
    return (tx as Database) ?? this.db;
  }

  async getNoteById(noteId: string, userId: string, tx?: unknown): Promise<ExistingNoteContext | null> {
    const client = this.getClient(tx);
    const row = await client
      .selectFrom('sticky_notes')
      .select(['id', 'space_id', 'title', 'content', 'type', 'x', 'y', 'width', 'height', 'parent_id', 'updated_at'])
      .where('id', '=', noteId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      title: row.title ?? null,
      content: row.content,
      type: row.type,
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
      parentId: row.parent_id ?? null,
      x: row.x !== null ? Number(row.x) : undefined,
      y: row.y !== null ? Number(row.y) : undefined,
      width: row.width !== null ? Number(row.width) : undefined,
      height: row.height !== null ? Number(row.height) : undefined,
      ...(row.space_id ? { spaceId: row.space_id } : {}),
    };
  }

  async listSpaceNotes(
    spaceId: string,
    userId: string,
    limit?: number,
    tx?: unknown
  ): Promise<ExistingNoteContext[]> {
    const client = this.getClient(tx);
    let query = client
      .selectFrom('sticky_notes')
      .select(['id', 'title', 'content', 'type', 'x', 'y', 'width', 'height', 'parent_id', 'updated_at'])
      .where('space_id', '=', spaceId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .orderBy('updated_at', 'desc');

    if (limit) {
      query = query.limit(limit);
    }

    const rows = await query.execute();

    return rows.map((row) => ({
      id: row.id,
      title: row.title ?? null,
      content: row.content,
      type: row.type,
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
      parentId: row.parent_id ?? null,
      x: row.x !== null ? Number(row.x) : undefined,
      y: row.y !== null ? Number(row.y) : undefined,
      width: row.width !== null ? Number(row.width) : undefined,
      height: row.height !== null ? Number(row.height) : undefined,
    }));
  }

  async insertNotes(notes: NoteInsertRow[], tx?: unknown): Promise<Array<{ id: string }>> {
    if (notes.length === 0) return [];
    const client = this.getClient(tx);

    const rows = await client
      .insertInto('sticky_notes')
      .values(
        notes.map((n) => ({
          id: n.id,
          user_id: n.userId,
          space_id: n.spaceId,
          title: n.title,
          content: n.content,
          type: n.type,
          color: n.color,
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
          parent_id: n.parentId,
          due_at: n.dueAt ? new Date(n.dueAt).toISOString() : null,
          source_type: n.sourceType,
          recording_id: n.recordingId,
          transcript_id: n.transcriptId,
          span_start: n.spanStart,
          span_end: n.spanEnd,
          ai_action_id: n.aiActionId,
        }))
      )
      .returning('id')
      .execute();

    return rows.map((r) => ({ id: String(r.id) }));
  }

  async updateNoteContent(
    noteId: string,
    userId: string,
    patch: { title?: string | null; content?: string; dueAt?: string | null },
    tx?: unknown
  ): Promise<void> {
    const client = this.getClient(tx);
    const updateValues: Record<string, unknown> = {
      updated_at: sql`now()`,
    };

    if (patch.title !== undefined) updateValues.title = patch.title;
    if (patch.content !== undefined) updateValues.content = patch.content;
    if (patch.dueAt !== undefined) {
      updateValues.due_at = patch.dueAt ? new Date(patch.dueAt).toISOString() : null;
    }

    await client
      .updateTable('sticky_notes')
      .set(updateValues)
      .where('id', '=', noteId)
      .where('user_id', '=', userId)
      .execute();
  }

  async softDeleteNote(noteId: string, userId: string, tx?: unknown): Promise<void> {
    const client = this.getClient(tx);
    await client
      .updateTable('sticky_notes')
      .set({ deleted_at: sql`now()` })
      .where('id', '=', noteId)
      .where('user_id', '=', userId)
      .execute();
  }

  async countLiveNotesForAction(actionId: string, userId: string, tx?: unknown): Promise<number> {
    const client = this.getClient(tx);
    const row = await client
      .selectFrom('sticky_notes')
      .select(sql<string>`count(*)`.as('count'))
      .where('ai_action_id', '=', actionId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return Number(row?.count ?? 0);
  }
}

export class KyselyAiRelationshipAdapter implements AiRelationshipPort {
  constructor(private readonly db: Database) {}

  private getClient(tx?: unknown): Database {
    return (tx as Database) ?? this.db;
  }

  async insertRelationships(rels: RelationshipInsertRow[], tx?: unknown): Promise<void> {
    if (rels.length === 0) return;
    const client = this.getClient(tx);

    await client
      .insertInto('relationships')
      .values(
        rels.map((r) => ({
          user_id: r.userId,
          space_id: r.spaceId,
          from_note_id: r.fromNoteId,
          to_note_id: r.toNoteId,
          type: r.type,
          created_by: r.createdBy,
          ai_action_id: r.aiActionId,
        }))
      )
      .execute();
  }

  async softDeleteRelationship(relId: string, userId: string, tx?: unknown): Promise<void> {
    const client = this.getClient(tx);
    await client
      .updateTable('relationships')
      .set({ deleted_at: sql`now()` })
      .where('id', '=', relId)
      .where('user_id', '=', userId)
      .execute();
  }

  async softDeleteRelationshipsForAction(actionId: string, userId: string, tx?: unknown): Promise<void> {
    const client = this.getClient(tx);
    await client
      .updateTable('relationships')
      .set({ deleted_at: sql`now()` })
      .where('ai_action_id', '=', actionId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .execute();
  }
}

export class KyselyAiTranscriptAdapter implements AiTranscriptPort {
  constructor(private readonly db: Database) {}

  async findTranscript(
    transcriptId: string,
    userId: string,
    tx?: unknown
  ): Promise<{ id: string; userId: string; recordingId: string; text: string } | null> {
    const client = (tx as Database) ?? this.db;
    const row = await client
      .selectFrom('transcripts')
      .select(['id', 'user_id', 'recording_id', 'text'])
      .where('id', '=', transcriptId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      recordingId: row.recording_id,
      text: row.text,
    };
  }
}

export class KyselyAiRecordingAdapter implements AiRecordingPort {
  constructor(private readonly db: Database) {}

  async updateRecordingStatus(
    recordingId: string,
    userId: string,
    status: string,
    tx?: unknown
  ): Promise<void> {
    const client = (tx as Database) ?? this.db;
    await client
      .updateTable('recordings')
      .set({ status })
      .where('id', '=', recordingId)
      .where('user_id', '=', userId)
      .execute();
  }
}

export class KyselyAiUserProfileAdapter implements AiUserProfilePort {
  constructor(private readonly db: Database) {}

  async getUserTimezone(userId: string, tx?: unknown): Promise<string> {
    const client = (tx as Database) ?? this.db;
    const row = await client
      .selectFrom('profiles')
      .select('timezone')
      .where('id', '=', userId)
      .executeTakeFirst();

    return row?.timezone ?? 'Africa/Cairo';
  }
}

export class KyselyAiUnitOfWork implements AiUnitOfWorkPort {
  constructor(private readonly db: Database) {}

  async runInTransaction<T>(work: (trx: unknown) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(async (trx) => {
      return work(trx);
    });
  }
}
