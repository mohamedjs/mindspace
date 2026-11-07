import type { Database } from '../../../platform/db.js';
import type { ProfileRepositoryPort, Profile } from '../domain/ports.js';

export class KyselyProfileRepository implements ProfileRepositoryPort {
  constructor(private db: Database) {}

  async findByUserId(userId: string, trx?: unknown): Promise<Profile | null> {
    const client = (trx as Database) || this.db;
    const row = await client
      .selectFrom('profiles')
      .select(['id', 'display_name', 'is_anonymous', 'created_at'])
      .where('id', '=', userId)
      .executeTakeFirst();

    if (!row) return null;
    return {
      id: row.id,
      display_name: row.display_name,
      is_anonymous: row.is_anonymous,
      created_at: new Date(row.created_at),
    };
  }

  async create(
    data: { id: string; display_name?: string | null; is_anonymous: boolean },
    trx?: unknown
  ): Promise<void> {
    const client = (trx as Database) || this.db;
    await client
      .insertInto('profiles')
      .values({
        id: data.id,
        display_name: data.display_name ?? null,
        is_anonymous: data.is_anonymous,
      })
      .execute();
  }

  async updateDisplayName(userId: string, displayName: string, trx?: unknown): Promise<void> {
    const client = (trx as Database) || this.db;
    await client
      .updateTable('profiles')
      .set({
        display_name: displayName,
      })
      .where('id', '=', userId)
      .execute();
  }
}
