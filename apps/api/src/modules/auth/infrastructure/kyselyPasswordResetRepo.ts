import { sql } from 'kysely';
import type { Database } from '../../../platform/db.js';
import type { PasswordResetTokenRepositoryPort, NewPasswordResetTokenData, PasswordResetToken } from '../domain/ports.js';

export class KyselyPasswordResetRepository implements PasswordResetTokenRepositoryPort {
  constructor(private db: Database) {}

  async create(data: NewPasswordResetTokenData, trx?: unknown): Promise<PasswordResetToken> {
    const client = (trx as Database) || this.db;
    const row = await client
      .insertInto('password_reset_tokens')
      .values({
        user_id: data.user_id,
        token_hash: data.token_hash,
        expires_at: data.expires_at,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: row.id,
      user_id: row.user_id,
      token_hash: row.token_hash,
      expires_at: new Date(row.expires_at),
      used_at: row.used_at ? new Date(row.used_at) : null,
      created_at: new Date(row.created_at),
    };
  }

  async findByHash(tokenHash: string, trx?: unknown): Promise<PasswordResetToken | null> {
    const client = (trx as Database) || this.db;
    const row = await client
      .selectFrom('password_reset_tokens')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();

    if (!row) return null;
    return {
      id: row.id,
      user_id: row.user_id,
      token_hash: row.token_hash,
      expires_at: new Date(row.expires_at),
      used_at: row.used_at ? new Date(row.used_at) : null,
      created_at: new Date(row.created_at),
    };
  }

  async markUsed(id: string, trx?: unknown): Promise<boolean> {
    const client = (trx as Database) || this.db;
    const row = await client
      .updateTable('password_reset_tokens')
      .set({ used_at: sql`NOW()` })
      .where('id', '=', id)
      .where('used_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    return !!row;
  }
}
