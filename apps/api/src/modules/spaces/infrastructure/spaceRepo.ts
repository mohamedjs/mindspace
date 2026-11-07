import { sql } from 'kysely';
import type { Database } from '../../../platform/db.js';
import type { SpaceRepositoryPort } from '../domain/ports.js';
import type { Space, SpaceSummary } from '../domain/entities.js';

export class KyselySpaceRepository implements SpaceRepositoryPort {
  constructor(private db: Database) {}

  async createDefaultSpace(trxOrDb: unknown, userId: string): Promise<void> {
    const client = (trxOrDb as Database) || this.db;

    await client
      .insertInto('spaces')
      .values({
        user_id: userId,
        name: 'My MindSpace',
        emoji: '💡',
      })
      .execute();
  }

  async listSpaces(userId: string): Promise<SpaceSummary[]> {
    const rows = await this.db
      .selectFrom('spaces')
      .select(['id', 'name', 'emoji', 'note_count', 'last_activity_at'])
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .orderBy('last_activity_at', 'desc')
      .execute();

    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      note_count: Number(r.note_count),
      last_activity_at: typeof r.last_activity_at === 'string' ? r.last_activity_at : new Date(r.last_activity_at).toISOString(),
    }));
  }

  async findById(userId: string, spaceId: string, trx?: unknown): Promise<Space | null> {
    const client = (trx as Database) || this.db;
    const row = await client
      .selectFrom('spaces')
      .selectAll()
      .where('id', '=', spaceId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      emoji: row.emoji,
      canvasZoom: Number(row.canvas_zoom),
      canvasX: Number(row.canvas_x),
      canvasY: Number(row.canvas_y),
      noteCount: Number(row.note_count),
      lastActivityAt: row.last_activity_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }

  async createSpace(userId: string, name: string, emoji = '💡'): Promise<SpaceSummary> {
    const inserted = await this.db
      .insertInto('spaces')
      .values({
        user_id: userId,
        name,
        emoji,
      })
      .returning(['id', 'name', 'emoji', 'note_count', 'last_activity_at'])
      .executeTakeFirstOrThrow();

    return {
      id: inserted.id,
      name: inserted.name,
      emoji: inserted.emoji,
      note_count: Number(inserted.note_count),
      last_activity_at: typeof inserted.last_activity_at === 'string' ? inserted.last_activity_at : new Date(inserted.last_activity_at).toISOString(),
    };
  }

  async updateSpaceName(userId: string, spaceId: string, name: string): Promise<void> {
    await this.db
      .updateTable('spaces')
      .set({
        name,
        updated_at: sql`now()`,
      })
      .where('id', '=', spaceId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .execute();
  }

  async softDeleteSpace(userId: string, spaceId: string): Promise<void> {
    await this.db
      .updateTable('spaces')
      .set({
        deleted_at: sql`now()`,
        updated_at: sql`now()`,
      })
      .where('id', '=', spaceId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .execute();
  }

  async bumpActivity(spaceId: string, noteDelta: number, trx?: unknown): Promise<void> {
    const client = (trx as Database) || this.db;
    if (noteDelta !== 0) {
      await client
        .updateTable('spaces')
        .set({
          note_count: sql`GREATEST(note_count + ${noteDelta}, 0)`,
          last_activity_at: sql`now()`,
          updated_at: sql`now()`,
        })
        .where('id', '=', spaceId)
        .where('deleted_at', 'is', null)
        .execute();
    } else {
      await client
        .updateTable('spaces')
        .set({
          last_activity_at: sql`now()`,
          updated_at: sql`now()`,
        })
        .where('id', '=', spaceId)
        .where('deleted_at', 'is', null)
        .execute();
    }
  }
}
