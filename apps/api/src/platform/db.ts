import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { AppConfig } from './config.js';

const { Pool } = pg;

export type Database = Kysely<any>;

export function createDb(config: AppConfig): Database {
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DB_POOL_MAX,
  });

  return new Kysely<any>({
    dialect: new PostgresDialect({ pool }),
  });
}

export async function checkDbHealth(db: Database): Promise<boolean> {
  try {
    await sql`SELECT 1`.execute(db);
    return true;
  } catch {
    return false;
  }
}

export async function closeDb(db: Database): Promise<void> {
  await db.destroy();
}
