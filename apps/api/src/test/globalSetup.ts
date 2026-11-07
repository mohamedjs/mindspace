import pg from 'pg';
import { runMigrationsAndSeed } from '../main.migrate.js';

const TEST_DATABASE = 'mindspace_test';

/** Rebuilds the test database, so a run never depends on or touches development data. */
export default async function setup(): Promise<void> {
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: url.href });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
  await admin.end();

  url.pathname = `/${TEST_DATABASE}`;
  await runMigrationsAndSeed(url.href);
}
