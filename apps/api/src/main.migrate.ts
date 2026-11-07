import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runner } from 'node-pg-migrate';
import { loadConfig } from './platform/config.js';
import { logger } from './platform/logger.js';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrationsAndSeed(databaseUrl?: string): Promise<void> {
  const dbUrl = databaseUrl || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL must be set to run migrations');
  }
  logger.info({ dbUrl: dbUrl.replace(/:[^:@]+@/, ':***@') }, 'Running database migrations');

  // Locate migrations and seed directories
  // In development/ts-node/tsx: __dirname is src/
  // In compiled dist: __dirname is dist/
  const appRoot = join(__dirname, '..');
  const migrationsDir = join(appRoot, 'migrations');
  const seedFile = join(appRoot, 'seed', 'seed.sql');

  // 1. Run migrations
  await runner({
    databaseUrl: dbUrl,
    dir: migrationsDir,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    count: Infinity,
    log: (msg: string) => logger.info({ migration: msg }, 'Migration log'),
  });

  logger.info('Migrations applied successfully');

  // 2. Run seed
  logger.info('Applying seed data');
  const seedSql = readFileSync(seedFile, 'utf8');

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(seedSql);
    logger.info('Seed data applied successfully');
  } finally {
    await client.end();
  }
}

// Auto-run if executed directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigrationsAndSeed()
    .then(() => {
      logger.info('Migration and seeding completed');
      process.exit(0);
    })
    .catch((err) => {
      logger.error(err, 'Migration and seeding failed');
      process.exit(1);
    });
}
