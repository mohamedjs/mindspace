import { sql } from 'kysely';
import type { Database } from '../../../platform/db.js';
import type { RefreshTokenRepositoryPort, NewRefreshTokenData, RefreshToken } from '../domain/ports.js';

export class KyselyRefreshTokenRepository implements RefreshTokenRepositoryPort {
  constructor(private db: Database) {}

  async create(data: NewRefreshTokenData, trx?: unknown): Promise<RefreshToken> {
    const client = (trx as Database) || this.db;
    const row = await client
      .insertInto('refresh_tokens')
      .values({
        user_id: data.user_id,
        token_hash: data.token_hash,
        family_id: data.family_id,
        expires_at: data.expires_at,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: row.id,
      user_id: row.user_id,
      token_hash: row.token_hash,
      family_id: row.family_id,
      expires_at: new Date(row.expires_at),
      revoked_at: row.revoked_at ? new Date(row.revoked_at) : null,
      created_at: new Date(row.created_at),
    };
  }

  async findByHash(tokenHash: string, trx?: unknown): Promise<RefreshToken | null> {
    const client = (trx as Database) || this.db;
    const row = await client
      .selectFrom('refresh_tokens')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();

    if (!row) return null;
    return {
      id: row.id,
      user_id: row.user_id,
      token_hash: row.token_hash,
      family_id: row.family_id,
      expires_at: new Date(row.expires_at),
      revoked_at: row.revoked_at ? new Date(row.revoked_at) : null,
      created_at: new Date(row.created_at),
    };
  }

  async revoke(id: string, trx?: unknown): Promise<boolean> {
    const client = (trx as Database) || this.db;
    const row = await client
      .updateTable('refresh_tokens')
      .set({ revoked_at: sql`NOW()` })
      .where('id', '=', id)
      .where('revoked_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    return !!row;
  }

  async revokeFamily(familyId: string, trx?: unknown): Promise<void> {
    const client = (trx as Database) || this.db;
    await client
      .updateTable('refresh_tokens')
      .set({ revoked_at: sql`NOW()` })
      .where('family_id', '=', familyId)
      .where('revoked_at', 'is', null)
      .execute();
  }

  async revokeAllForUser(userId: string, trx?: unknown): Promise<void> {
    const client = (trx as Database) || this.db;
    await client
      .updateTable('refresh_tokens')
      .set({ revoked_at: sql`NOW()` })
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .execute();
  }
}
