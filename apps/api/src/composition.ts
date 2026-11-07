import type { FastifyInstance } from 'fastify';
import type { AppConfig } from './platform/config.js';
import { loadConfig } from './platform/config.js';
import type { Database } from './platform/db.js';
import { createDb, closeDb } from './platform/db.js';
import type { Cache } from './platform/cache.js';
import { createCache, closeCache } from './platform/cache.js';
import type { Clock } from './platform/clock.js';
import { systemClock } from './platform/clock.js';
import { logger } from './platform/logger.js';
import { buildServer } from './platform/http/server.js';

export interface AppComposition {
  config: AppConfig;
  clock: Clock;
  db: Database;
  cache: Cache;
  server: FastifyInstance;
  close: () => Promise<void>;
}

export async function composeApp(envOverrides?: Partial<AppConfig>): Promise<AppComposition> {
  const baseConfig = loadConfig();
  const config: AppConfig = { ...baseConfig, ...envOverrides };

  const clock = systemClock;
  const db = createDb(config);
  const cache = createCache(config);

  const server = await buildServer({
    config,
    db,
    cache,
    logger,
  });

  return {
    config,
    clock,
    db,
    cache,
    server,
    close: async () => {
      await server.close();
      await closeCache(cache);
      await closeDb(db);
    },
  };
}
