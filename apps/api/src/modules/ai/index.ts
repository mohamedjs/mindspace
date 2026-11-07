import type { FastifyInstance } from 'fastify';
import type { Database } from '../../platform/db.js';
import type { RequireUserHook } from '../../platform/http/auth.js';
import type {
  ExtractionHandoffInput,
} from './domain/entities.js';
import type {
  ExtractThoughtsInput,
  ExtractThoughtsResult,
  WriteNoteInput,
  WriteNoteResult,
} from './application/index.js';
import type {
  AiChatProviderPort,
  AiCreditsPort,
  AiKeyResolverPort,
  AiSpacePort,
} from './domain/ports.js';
import {
  AiExtractorHandoff,
  ExtractThoughtsUseCase,
  GetModelPreferencesUseCase,
  ListModelsUseCase,
  ResolveModelUseCase,
  UndoActionUseCase,
  UpdateModelPreferencesUseCase,
  WriteNoteUseCase,
} from './application/index.js';
import {
  FakeAiChatProvider,
  KyselyAiActionRepository,
  KyselyAiModelRepository,
  KyselyAiNoteAdapter,
  KyselyAiRecordingAdapter,
  KyselyAiRelationshipAdapter,
  KyselyAiTranscriptAdapter,
  KyselyAiUnitOfWork,
  KyselyAiUserProfileAdapter,
  OpenAICompatibleChatProvider,
} from './infrastructure/index.js';
import { registerAiRoutes } from './presentation/routes.js';

export * from './domain/index.js';
export * from './application/index.js';
export * from './infrastructure/index.js';
export * from './presentation/index.js';

export interface AiModuleDependencies {
  db: Database;
  requireUser?: RequireUserHook;
  spacePort: AiSpacePort;
  keyResolver: AiKeyResolverPort;
  creditsPort: AiCreditsPort;
  chatProvider?: AiChatProviderPort;
  llmConcurrency?: number;
}

export interface ExtractorPort {
  extract(input: ExtractionHandoffInput): Promise<void>;
}

export interface AiModule {
  registerRoutes(app: FastifyInstance): void;
  extractor: ExtractorPort;
  extractThoughtsUseCase: ExtractThoughtsUseCase;
  writeNoteUseCase: WriteNoteUseCase;
  undoActionUseCase: UndoActionUseCase;
  listModelsUseCase: ListModelsUseCase;
  resolveModelUseCase: ResolveModelUseCase;
  chatProvider: AiChatProviderPort;
  setChatProvider(provider: AiChatProviderPort): void;
}

export function createAiModule(deps: AiModuleDependencies): AiModule {
  const modelRepo = new KyselyAiModelRepository(deps.db);
  const actionRepo = new KyselyAiActionRepository(deps.db);
  const notePort = new KyselyAiNoteAdapter(deps.db);
  const relationshipPort = new KyselyAiRelationshipAdapter(deps.db);
  const transcriptPort = new KyselyAiTranscriptAdapter(deps.db);
  const recordingPort = new KyselyAiRecordingAdapter(deps.db);
  const userProfilePort = new KyselyAiUserProfileAdapter(deps.db);
  const unitOfWork = new KyselyAiUnitOfWork(deps.db);

  let activeChatProvider: AiChatProviderPort =
    deps.chatProvider ?? new OpenAICompatibleChatProvider();

  const proxyChatProvider: AiChatProviderPort = {
    chat: (args) => activeChatProvider.chat(args),
  };

  const resolveModelUseCase = new ResolveModelUseCase(modelRepo);
  const listModelsUseCase = new ListModelsUseCase(modelRepo);
  const getModelPreferencesUseCase = new GetModelPreferencesUseCase(modelRepo);
  const updateModelPreferencesUseCase = new UpdateModelPreferencesUseCase(modelRepo);

  const extractThoughtsUseCase = new ExtractThoughtsUseCase({
    actionRepo,
    resolveModelUseCase,
    keyResolver: deps.keyResolver,
    chatProvider: proxyChatProvider,
    creditsPort: deps.creditsPort,
    spacePort: deps.spacePort,
    notePort,
    relationshipPort,
    transcriptPort,
    recordingPort,
    userProfilePort,
    unitOfWork,
    llmConcurrency: deps.llmConcurrency,
  });

  const writeNoteUseCase = new WriteNoteUseCase({
    actionRepo,
    resolveModelUseCase,
    keyResolver: deps.keyResolver,
    chatProvider: proxyChatProvider,
    creditsPort: deps.creditsPort,
    notePort,
    transcriptPort,
    recordingPort,
    userProfilePort,
    unitOfWork,
  });

  const undoActionUseCase = new UndoActionUseCase({
    actionRepo,
    notePort,
    relationshipPort,
    spacePort: deps.spacePort,
    unitOfWork,
  });

  const extractor = new AiExtractorHandoff(extractThoughtsUseCase, writeNoteUseCase);

  return {
    registerRoutes: (app: FastifyInstance) => {
      registerAiRoutes(app, {
        requireUser: deps.requireUser,
        listModelsUseCase,
        getModelPreferencesUseCase,
        updateModelPreferencesUseCase,
        extractThoughtsUseCase,
        writeNoteUseCase,
        undoActionUseCase,
      });
    },
    extractor,
    extractThoughtsUseCase,
    writeNoteUseCase,
    undoActionUseCase,
    listModelsUseCase,
    resolveModelUseCase,
    chatProvider: proxyChatProvider,
    setChatProvider: (provider: AiChatProviderPort) => {
      activeChatProvider = provider;
    },
  };
}
