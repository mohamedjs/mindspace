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
import { createCreditsModule, type CreditsModule } from './modules/credits/index.js';
import {
  createByokModule,
  FakeKeyValidator,
  HttpKeyValidator,
  type ByokModule,
  type KeyValidator,
} from './modules/byok/index.js';
import { createSpacesModule, type SpacesModule } from './modules/spaces/index.js';
import { createAuthModule, type AuthModule } from './modules/auth/index.js';
import { createTimelineModule, type TimelineModule } from './modules/timeline/index.js';
import { createNotesModule, type NotesModule } from './modules/notes/index.js';
import {
  createTranscriptionModule,
  FakeTranscriber,
  OpenRouterTranscriber,
  type Transcriber,
  type TranscriptionModule,
} from './modules/transcription/index.js';
import {
  createRecordingsModule,
  type EntitlementsPort,
  type ExtractorPort,
  type PipelineWorker,
  type RecordingsModule,
} from './modules/recordings/index.js';

export interface ComposeAppOptions {
  keyValidator?: KeyValidator;
  transcriber?: Transcriber;
  entitlements?: EntitlementsPort;
  extractor?: ExtractorPort;
  splitThresholdMs?: number;
  maxAttempts?: number;
  idleSweepMs?: number;
  sseHeartbeatMs?: number;
  ssePollIntervalMs?: number;
  maxPartBytes?: number;
}

export interface AppComposition {
  config: AppConfig;
  clock: Clock;
  db: Database;
  cache: Cache;
  server: FastifyInstance;
  creditsModule: CreditsModule;
  byokModule: ByokModule;
  authModule: AuthModule;
  spacesModule: SpacesModule;
  timelineModule: TimelineModule;
  notesModule: NotesModule;
  transcriptionModule: TranscriptionModule;
  recordingsModule: RecordingsModule;
  close: () => Promise<void>;
}

export interface WorkerComposition {
  config: AppConfig;
  db: Database;
  cache: Cache;
  creditsModule: CreditsModule;
  byokModule: ByokModule;
  spacesModule: SpacesModule;
  transcriptionModule: TranscriptionModule;
  recordingsModule: RecordingsModule;
  worker: PipelineWorker;
  close: () => Promise<void>;
}

export async function composeApp(
  envOverrides?: Partial<AppConfig>,
  options?: ComposeAppOptions
): Promise<AppComposition> {
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
  const creditsModule = createCreditsModule({ db, requireUser });

  const defaultKeyValidator =
    options?.keyValidator ??
    (config.NODE_ENV === 'test' ? new FakeKeyValidator() : new HttpKeyValidator());

  const byokModule = createByokModule({
    db,
    masterKeyBase64: config.BYOK_MASTER_KEY,
    requireUser,
    keyValidator: defaultKeyValidator,
    getPlatformKey: (provider: string) => {
      const envName = `PLATFORM_${provider.toUpperCase()}_KEY`;
      if (process.env[envName]) {
        return process.env[envName];
      }
      if (provider === 'openrouter' && config.OPENROUTER_API_KEY) {
        return config.OPENROUTER_API_KEY;
      }
      return undefined;
    },
  });

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

  const defaultTranscriber =
    options?.transcriber ??
    (config.NODE_ENV === 'test' ? new FakeTranscriber() : new OpenRouterTranscriber());

  const transcriptionModule = createTranscriptionModule({
    transcriber: defaultTranscriber,
  });

  const recordingsModule = createRecordingsModule({
    db,
    cache,
    audioDir: config.AUDIO_DIR,
    requireUser,
    spaceOwnership: {
      ensureOwned: async (spaceId: string, userId: string) => {
        await spacesModule.ensureOwned(spaceId, userId);
      },
    },
    transcriber: transcriptionModule,
    keyResolver: {
      resolveKey: (userId: string, provider: string, byokOnly: boolean) =>
        byokModule.resolveKey(userId, provider, byokOnly),
    },
    creditsPort: {
      reserve: (userId: string, amount: number, tx?: unknown) =>
        creditsModule.reserve(userId, amount, tx),
      settle: (
        reservationId: string,
        userId: string,
        actual: number,
        aiActionId: string | null,
        tx: unknown
      ) => creditsModule.settle(reservationId, userId, actual, aiActionId, tx),
      release: (reservationId: string, userId?: string, tx?: unknown) =>
        creditsModule.release(reservationId, userId, tx),
    },
    entitlements: options?.entitlements,
    extractor: options?.extractor,
    sttConcurrency: config.STT_CONCURRENCY,
    pipelineWorkers: config.PIPELINE_WORKERS,
    splitThresholdMs: options?.splitThresholdMs,
    maxAttempts: options?.maxAttempts,
    idleSweepMs: options?.idleSweepMs,
    sseHeartbeatMs: options?.sseHeartbeatMs,
    ssePollIntervalMs: options?.ssePollIntervalMs,
    maxPartBytes: options?.maxPartBytes,
  });

  // Register presentation routes
  authModule.registerRoutes(server);
  creditsModule.registerRoutes(server);
  byokModule.registerRoutes(server);
  spacesModule.registerRoutes(server);
  timelineModule.registerRoutes(server);
  notesModule.registerRoutes(server);
  recordingsModule.registerRoutes(server);

  return {
    config,
    clock,
    db,
    cache,
    server,
    creditsModule,
    byokModule,
    authModule,
    spacesModule,
    timelineModule,
    notesModule,
    transcriptionModule,
    recordingsModule,
    close: async () => {
      await server.close();
      await closeCache(cache);
      await closeDb(db);
    },
  };
}

export async function composeWorker(
  envOverrides?: Partial<AppConfig>,
  options?: ComposeAppOptions
): Promise<WorkerComposition> {
  const baseConfig = loadConfig();
  const config: AppConfig = { ...baseConfig, ...envOverrides };

  const db = createDb(config);
  const cache = createCache(config);

  const creditsModule = createCreditsModule({ db });
  const byokModule = createByokModule({
    db,
    masterKeyBase64: config.BYOK_MASTER_KEY,
    getPlatformKey: (provider: string) => {
      const envName = `PLATFORM_${provider.toUpperCase()}_KEY`;
      if (process.env[envName]) {
        return process.env[envName];
      }
      if (provider === 'openrouter' && config.OPENROUTER_API_KEY) {
        return config.OPENROUTER_API_KEY;
      }
      return undefined;
    },
  });

  const spacesModule = createSpacesModule({ db });

  const defaultTranscriber =
    options?.transcriber ??
    (config.NODE_ENV === 'test' ? new FakeTranscriber() : new OpenRouterTranscriber());

  const transcriptionModule = createTranscriptionModule({
    transcriber: defaultTranscriber,
  });

  const recordingsModule = createRecordingsModule({
    db,
    cache,
    audioDir: config.AUDIO_DIR,
    spaceOwnership: {
      ensureOwned: async (spaceId: string, userId: string) => {
        await spacesModule.ensureOwned(spaceId, userId);
      },
    },
    transcriber: transcriptionModule,
    keyResolver: {
      resolveKey: (userId: string, provider: string, byokOnly: boolean) =>
        byokModule.resolveKey(userId, provider, byokOnly),
    },
    creditsPort: {
      reserve: (userId: string, amount: number, tx?: unknown) =>
        creditsModule.reserve(userId, amount, tx),
      settle: (
        reservationId: string,
        userId: string,
        actual: number,
        aiActionId: string | null,
        tx: unknown
      ) => creditsModule.settle(reservationId, userId, actual, aiActionId, tx),
      release: (reservationId: string, userId?: string, tx?: unknown) =>
        creditsModule.release(reservationId, userId, tx),
    },
    entitlements: options?.entitlements,
    extractor: options?.extractor,
    sttConcurrency: config.STT_CONCURRENCY,
    pipelineWorkers: config.PIPELINE_WORKERS,
    splitThresholdMs: options?.splitThresholdMs,
    maxAttempts: options?.maxAttempts,
    idleSweepMs: options?.idleSweepMs,
  });

  const worker = recordingsModule.createWorker({
    maxConcurrentJobs: config.PIPELINE_WORKERS,
  });

  return {
    config,
    db,
    cache,
    creditsModule,
    byokModule,
    spacesModule,
    transcriptionModule,
    recordingsModule,
    worker,
    close: async () => {
      await worker.stop();
      await closeCache(cache);
      await closeDb(db);
    },
  };
}
