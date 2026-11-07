import { sql } from 'kysely';
import type { Database } from '../../../platform/db.js';
import type { RelationshipRepositoryPort, CreateRelationshipData } from '../domain/ports.js';
import type { RelationshipOut, RelType } from '../domain/entities.js';
import type { RelationRow } from '../domain/structure.js';

export class KyselyRelationshipRepository implements RelationshipRepositoryPort {
  constructor(private db: Database) {}

  private mapRow(row: any): RelationshipOut {
    return {
      id: row.id,
      from_note_id: row.from_note_id,
      to_note_id: row.to_note_id,
      type: row.type as RelType,
      created_by: row.created_by,
      created_at: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
    };
  }

  async listBySpace(userId: string, spaceId: string, trx?: unknown): Promise<RelationshipOut[]> {
    const client = (trx as Database) || this.db;
    const rows = await client
      .selectFrom('relationships')
      .selectAll()
      .where('space_id', '=', spaceId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .orderBy('created_at', 'asc')
      .execute();

    return rows.map((r: any) => this.mapRow(r));
  }

  async create(userId: string, data: CreateRelationshipData, trx?: unknown): Promise<RelationshipOut> {
    const client = (trx as Database) || this.db;
    const relType: RelType = data.type || 'related';

    // Unique index on (from_note_id, to_note_id, type) where deleted_at is null
    const existing = await client
      .selectFrom('relationships')
      .selectAll()
      .where('space_id', '=', data.spaceId)
      .where('user_id', '=', userId)
      .where('from_note_id', '=', data.fromNoteId)
      .where('to_note_id', '=', data.toNoteId)
      .where('type', '=', relType)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    if (existing) {
      return this.mapRow(existing);
    }

    const inserted = await client
      .insertInto('relationships')
      .values({
        user_id: userId,
        space_id: data.spaceId,
        from_note_id: data.fromNoteId,
        to_note_id: data.toNoteId,
        type: relType,
        created_by: 'user',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRow(inserted);
  }

  async bulkCreate(
    userId: string,
    relations: Array<{ spaceId: string; fromNoteId: string; toNoteId: string; type?: RelType }>,
    trx?: unknown
  ): Promise<RelationshipOut[]> {
    if (relations.length === 0) return [];
    const client = (trx as Database) || this.db;

    const values = relations.map((r) => ({
      user_id: userId,
      space_id: r.spaceId,
      from_note_id: r.fromNoteId,
      to_note_id: r.toNoteId,
      type: r.type || 'related',
      created_by: 'user',
    }));

    const inserted = await client
      .insertInto('relationships')
      .values(values)
      .returningAll()
      .execute();

    return inserted.map((r: any) => this.mapRow(r));
  }

  async bulkInsertStructuredRelations(
    userId: string,
    relations: RelationRow[],
    trx?: unknown
  ): Promise<number> {
    if (relations.length === 0) return 0;
    const client = (trx as Database) || this.db;

    const values = relations.map((r) => ({
      user_id: userId,
      space_id: r.space_id,
      from_note_id: r.from_note_id,
      to_note_id: r.to_note_id,
      type: r.type,
      created_by: 'ai',
    }));

    const inserted = await client
      .insertInto('relationships')
      .values(values)
      .returning(['id'])
      .execute();

    return inserted.length;
  }

  async softDelete(
    userId: string,
    spaceId: string,
    fromNoteId: string,
    toNoteId: string,
    type?: RelType | null,
    trx?: unknown
  ): Promise<void> {
    const client = (trx as Database) || this.db;

    let query = client
      .updateTable('relationships')
      .set({
        deleted_at: sql`now()`,
      })
      .where('space_id', '=', spaceId)
      .where('user_id', '=', userId)
      .where('from_note_id', '=', fromNoteId)
      .where('to_note_id', '=', toNoteId)
      .where('deleted_at', 'is', null);

    if (type) {
      query = query.where('type', '=', type);
    }

    await query.execute();
  }
}
