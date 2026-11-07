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
import { createRequireUser } from './platform/http/auth.js';
import { createCreditsModule } from './modules/credits/index.js';
import { createSpacesModule, type SpacesModule } from './modules/spaces/index.js';
import { createAuthModule, type AuthModule } from './modules/auth/index.js';
import { createTimelineModule, type TimelineModule } from './modules/timeline/index.js';
import { createNotesModule, type NotesModule } from './modules/notes/index.js';

export interface AppComposition {
  config: AppConfig;
  clock: Clock;
  db: Database;
  cache: Cache;
  server: FastifyInstance;
  authModule: AuthModule;
  spacesModule: SpacesModule;
  timelineModule: TimelineModule;
  notesModule: NotesModule;
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

  // Wire modules through composition root
  const requireUser = createRequireUser(config.JWT_SECRET);
  const creditsModule = createCreditsModule(db);
  const spacesModule = createSpacesModule({ db, requireUser });

  const authModule = createAuthModule({
    db,
    config,
    clock,
    creditsGrant: creditsModule,
    spacesSeed: spacesModule,
    requireUser,
  });

  const timelineModule = createTimelineModule({
    db,
    requireUser,
    spaceChecker: {
      ensureOwned: async (spaceId: string, userId: string) => {
        await spacesModule.ensureOwned(spaceId, userId);
      },
    },
  });

  const notesModule = createNotesModule({
    db,
    requireUser,
    spacePort: {
      ensureOwned: async (spaceId: string, userId: string, trx?: unknown) => {
        await spacesModule.ensureOwned(spaceId, userId, trx);
      },
      bumpActivity: async (spaceId: string, noteDelta: number, trx?: unknown) => {
        await spacesModule.bumpActivity(spaceId, noteDelta, trx);
      },
    },
    timelinePort: {
      recordEvent: async (event, trx) => {
        await timelineModule.recordEvent(event, trx);
      },
    },
  });

  // Register presentation routes
  authModule.registerRoutes(server);
  spacesModule.registerRoutes(server);
  timelineModule.registerRoutes(server);
  notesModule.registerRoutes(server);

  return {
    config,
    clock,
    db,
    cache,
    server,
    authModule,
    spacesModule,
    timelineModule,
    notesModule,
    close: async () => {
      await server.close();
      await closeCache(cache);
      await closeDb(db);
    },
  };
}
