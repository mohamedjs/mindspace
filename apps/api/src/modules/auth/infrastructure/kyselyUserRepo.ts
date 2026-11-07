import { sql } from 'kysely';
import type { Database } from '../../../platform/db.js';
import type { UserRepositoryPort, NewUserData, User } from '../domain/ports.js';

export class KyselyUserRepository implements UserRepositoryPort {
  constructor(private db: Database) {}

  async findById(id: string, trx?: unknown): Promise<User | null> {
    const client = (trx as Database) || this.db;
    const row = await client
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      password_hash: row.password_hash,
      display_name: row.display_name,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  async findByEmail(email: string, trx?: unknown): Promise<User | null> {
    const client = (trx as Database) || this.db;
    const row = await client
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();

    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      password_hash: row.password_hash,
      display_name: row.display_name,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  async create(data: NewUserData, trx?: unknown): Promise<User> {
    const client = (trx as Database) || this.db;
    const row = await client
      .insertInto('users')
      .values({
        email: data.email,
        password_hash: data.password_hash,
        display_name: data.display_name ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: row.id,
      email: row.email,
      password_hash: row.password_hash,
      display_name: row.display_name,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  async updateDisplayName(id: string, displayName: string, trx?: unknown): Promise<void> {
    const client = (trx as Database) || this.db;
    await client
      .updateTable('users')
      .set({
        display_name: displayName,
        updated_at: sql`NOW()`,
      })
      .where('id', '=', id)
      .execute();
  }

  async updatePasswordHash(id: string, passwordHash: string, trx?: unknown): Promise<void> {
    const client = (trx as Database) || this.db;
    await client
      .updateTable('users')
      .set({
        password_hash: passwordHash,
        updated_at: sql`NOW()`,
      })
      .where('id', '=', id)
      .execute();
  }

  async deleteUser(id: string, trx?: unknown): Promise<void> {
    const client = (trx as Database) || this.db;
    await client.deleteFrom('users').where('id', '=', id).execute();
  }
}
