import { sql } from 'kysely';
import type { Database } from '../../../platform/db.js';
import type { UserKeySummary } from '../domain/entities.js';
import type { ByokRepositoryPort, SaveKeyRepoInput } from '../domain/ports.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class KyselyByokRepository implements ByokRepositoryPort {
  constructor(private readonly db: Database) {}

  async listByUser(userId: string): Promise<UserKeySummary[]> {
    const rows = await this.db
      .selectFrom('user_ai_keys')
      .select(['id', 'provider', 'label', 'key_hint', 'is_active', 'last_error', 'created_at'])
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .execute();

    return rows.map((row) => ({
      id: String(row.id),
      provider: String(row.provider),
      label: row.label ?? null,
      key_hint: String(row.key_hint),
      is_active: Boolean(row.is_active),
      last_error: row.last_error ?? null,
      created_at:
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }));
  }

  async findActiveEncryptedKey(
    userId: string,
    provider: string
  ): Promise<{ id: string; encryptedKey: Uint8Array } | null> {
    const row = await this.db
      .selectFrom('user_ai_keys')
      .select(['id', 'encrypted_key'])
      .where('user_id', '=', userId)
      .where('provider', '=', provider)
      .where('is_active', '=', true)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (!row || !row.encrypted_key) {
      return null;
    }

    const buf = Buffer.isBuffer(row.encrypted_key)
      ? row.encrypted_key
      : Buffer.from(row.encrypted_key);

    return {
      id: String(row.id),
      encryptedKey: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
    };
  }

  async saveKey(input: SaveKeyRepoInput): Promise<UserKeySummary> {
    return this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('user_ai_keys')
        .where('user_id', '=', input.userId)
        .where('provider', '=', input.provider)
        .where('is_active', '=', false)
        .execute();

      const keyBuf = Buffer.from(
        input.encryptedKey.buffer,
        input.encryptedKey.byteOffset,
        input.encryptedKey.byteLength
      );

      const res = await sql<{
        id: string;
        provider: string;
        label: string | null;
        key_hint: string;
        is_active: boolean;
        last_error: string | null;
        created_at: Date | string;
      }>`
        INSERT INTO user_ai_keys (
          user_id,
          provider,
          label,
          encrypted_key,
          key_hint,
          is_active,
          last_error
        )
        VALUES (
          ${input.userId},
          ${input.provider}::provider_id,
          ${input.label},
          ${keyBuf},
          ${input.keyHint},
          true,
          null
        )
        ON CONFLICT (user_id, provider) WHERE is_active = true
        DO UPDATE SET
          label         = EXCLUDED.label,
          encrypted_key = EXCLUDED.encrypted_key,
          key_hint      = EXCLUDED.key_hint,
          is_active     = true,
          last_error    = null,
          created_at    = now()
        RETURNING id, provider, label, key_hint, is_active, last_error, created_at
      `.execute(trx);

      const row = res.rows[0];
      return {
        id: String(row.id),
        provider: String(row.provider),
        label: row.label ?? null,
        key_hint: String(row.key_hint),
        is_active: Boolean(row.is_active),
        last_error: row.last_error ?? null,
        created_at:
          row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      };
    });
  }

  async deleteKey(userId: string, keyId: string): Promise<boolean> {
    if (!UUID_REGEX.test(keyId)) {
      return false;
    }

    const res = await this.db
      .deleteFrom('user_ai_keys')
      .where('id', '=', keyId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    return Number(res.numDeletedRows ?? 0) > 0;
  }
}
