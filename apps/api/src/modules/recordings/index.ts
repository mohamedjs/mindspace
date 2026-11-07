import type { FastifyInstance } from 'fastify';
import type { Database } from '../../platform/db.js';
import type { Cache } from '../../platform/cache.js';
import type { RequireUserHook } from '../../platform/http/auth.js';
import { DiskBlobStore } from '../../platform/blob.js';
import type {
  AudioMediaPort,
  BlobStorePort,
  CreditsReservationPort,
  EntitlementsPort,
  ExtractorPort,
  KeyResolverPort,
  NoteOwnershipPort,
  RecordingEventsPort,
  SpaceOwnershipPort,
  TranscribeModelResolverPort,
  TranscriberPort,
} from './domain/ports.js';
import {
  CreateRecordingUseCase,
  FinishRecordingUseCase,
  GetRecordingStatusUseCase,
  GetTranscriptIdUseCase,
  ListRecordingsUseCase,
  MarkRecordingCompletedUseCase,
  MarkRecordingFailedUseCase,
  ProcessRecordingJobUseCase,
  UploadRecordingPartUseCase,
} from './application/index.js';
import {
  DefaultEntitlementsAdapter,
  FfmpegMediaAdapter,
  KyselyNoteOwnershipChecker,
  KyselyRecordingRepository,
  KyselyTranscribeModelResolver,
  NoopExtractorAdapter,
  PipelineWorker,
  RedisRecordingEventsAdapter,
  type WorkerMaintenanceCallbacks,
} from './infrastructure/index.js';
import { registerRecordingRoutes } from './presentation/routes.js';

export * from './domain/index.js';
export * from './application/index.js';
export * from './infrastructure/index.js';
export * from './presentation/routes.js';

export interface RecordingsModuleDependencies {
  db: Database;
  cache: Cache | null;
  audioDir: string;
  requireUser?: RequireUserHook;
  spaceOwnership: SpaceOwnershipPort;
  noteOwnership?: NoteOwnershipPort;
  blobStore?: BlobStorePort;
  audioMedia?: AudioMediaPort;
  transcriber: TranscriberPort;
  modelResolver?: TranscribeModelResolverPort;
  keyResolver: KeyResolverPort;
  creditsPort: CreditsReservationPort;
  entitlements?: EntitlementsPort;
  extractor?: ExtractorPort;
  eventsPort?: RecordingEventsPort;
  sttConcurrency?: number;
  pipelineWorkers?: number;
  splitThresholdMs?: number;
  maxAttempts?: number;
  idleSweepMs?: number;
  sseHeartbeatMs?: number;
  ssePollIntervalMs?: number;
  maxPartBytes?: number;
  maintenance?: WorkerMaintenanceCallbacks;
}

export interface RecordingsModule {
  registerRoutes(app: FastifyInstance): void;
  createWorker(options?: {
    pollIntervalMs?: number;
    sweepIntervalMs?: number;
    maxConcurrentJobs?: number;
    maintenance?: WorkerMaintenanceCallbacks;
  }): PipelineWorker;
  jobUseCase: ProcessRecordingJobUseCase;
  eventsPort: RecordingEventsPort;
  blobStore: BlobStorePort;
  setEntitlements(entitlements: EntitlementsPort): void;
  setExtractor(extractor: ExtractorPort): void;
  setTranscriber(transcriber: TranscriberPort): void;
}

export function createRecordingsModule(deps: RecordingsModuleDependencies): RecordingsModule {
  const recordingRepo = new KyselyRecordingRepository(deps.db);
  const blobStore = deps.blobStore ?? new DiskBlobStore(deps.audioDir);
  const audioMedia = deps.audioMedia ?? new FfmpegMediaAdapter(blobStore);
  const noteOwnership = deps.noteOwnership ?? new KyselyNoteOwnershipChecker(deps.db);
  const modelResolver = deps.modelResolver ?? new KyselyTranscribeModelResolver(deps.db);
  const eventsPort = deps.eventsPort ?? new RedisRecordingEventsAdapter(deps.cache);

  let activeEntitlements: EntitlementsPort =
    deps.entitlements ?? new DefaultEntitlementsAdapter();
  let activeExtractor: ExtractorPort =
    deps.extractor ?? new NoopExtractorAdapter(recordingRepo, eventsPort);
  let activeTranscriber: TranscriberPort = deps.transcriber;

  const proxyEntitlements: EntitlementsPort = {
    getEntitlements: (userId) => activeEntitlements.getEntitlements(userId),
  };

  const proxyExtractor: ExtractorPort = {
    extract: (input) => activeExtractor.extract(input),
  };

  const proxyTranscriber: TranscriberPort = {
    transcribe: (input) => activeTranscriber.transcribe(input),
  };

  const createRecordingUseCase = new CreateRecordingUseCase(
    recordingRepo,
    deps.spaceOwnership,
    noteOwnership
  );
  const uploadRecordingPartUseCase = new UploadRecordingPartUseCase(
    recordingRepo,
    blobStore,
    proxyEntitlements
  );
  const finishRecordingUseCase = new FinishRecordingUseCase(
    recordingRepo,
    eventsPort,
    proxyEntitlements
  );
  const listRecordingsUseCase = new ListRecordingsUseCase(recordingRepo, deps.spaceOwnership);
  const getRecordingStatusUseCase = new GetRecordingStatusUseCase(recordingRepo);
  const getTranscriptIdUseCase = new GetTranscriptIdUseCase(recordingRepo);
  const markRecordingFailedUseCase = new MarkRecordingFailedUseCase(recordingRepo, eventsPort);
  const markRecordingCompletedUseCase = new MarkRecordingCompletedUseCase(
    recordingRepo,
    eventsPort
  );

  const jobUseCase = new ProcessRecordingJobUseCase({
    recordingRepo,
    blobStore,
    audioMedia,
    transcriber: proxyTranscriber,
    modelResolver,
    keyResolver: deps.keyResolver,
    creditsPort: deps.creditsPort,
    entitlements: proxyEntitlements,
    extractor: proxyExtractor,
    eventsPort,
    sttConcurrency: deps.sttConcurrency,
    splitThresholdMs: deps.splitThresholdMs,
    maxAttempts: deps.maxAttempts,
    idleSweepMs: deps.idleSweepMs,
  });

  return {
    registerRoutes: (app: FastifyInstance) => {
      registerRecordingRoutes(app, {
        requireUser: deps.requireUser,
        createRecordingUseCase,
        uploadRecordingPartUseCase,
        finishRecordingUseCase,
        listRecordingsUseCase,
        getRecordingStatusUseCase,
        getTranscriptIdUseCase,
        markRecordingFailedUseCase,
        markRecordingCompletedUseCase,
        eventsPort,
        sseHeartbeatMs: deps.sseHeartbeatMs,
        ssePollIntervalMs: deps.ssePollIntervalMs,
        maxPartBytes: deps.maxPartBytes,
      });
    },
    createWorker: (options) =>
      new PipelineWorker({
        db: deps.db,
        jobUseCase,
        eventsPort,
        maintenance: options?.maintenance ?? deps.maintenance,
        maxConcurrentJobs: options?.maxConcurrentJobs ?? deps.pipelineWorkers ?? 32,
        pollIntervalMs: options?.pollIntervalMs ?? 2_000,
        sweepIntervalMs: options?.sweepIntervalMs ?? 30_000,
      }),
    jobUseCase,
    eventsPort,
    blobStore,
    setEntitlements: (entitlements) => {
      activeEntitlements = entitlements;
    },
    setExtractor: (extractor) => {
      activeExtractor = extractor;
    },
    setTranscriber: (transcriber) => {
      activeTranscriber = transcriber;
    },
  };
}
