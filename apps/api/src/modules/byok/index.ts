import type { FastifyInstance } from 'fastify';
import type { Database } from '../../platform/db.js';
import type { RequireUserHook } from '../../platform/http/auth.js';
import type { ResolvedKey, UserKeySummary } from './domain/entities.js';
import type { KeyValidator } from './domain/ports.js';
import {
  DeleteKeyUseCase,
  ListKeysUseCase,
  ResolveKeyUseCase,
  SaveKeyUseCase,
  type PlatformKeyResolver,
  type SaveKeyInput,
} from './application/index.js';
import {
  FakeKeyValidator,
  HttpKeyValidator,
  KyselyByokRepository,
} from './infrastructure/index.js';
import { registerByokRoutes } from './presentation/routes.js';

export * from './domain/index.js';
export * from './application/index.js';
export * from './infrastructure/index.js';

export interface ByokModuleDependencies {
  db: Database;
  masterKeyBase64: string;
  requireUser?: RequireUserHook;
  keyValidator?: KeyValidator;
  getPlatformKey?: PlatformKeyResolver;
}

export interface ByokModule {
  registerRoutes(app: FastifyInstance): void;
  listKeys(userId: string): Promise<UserKeySummary[]>;
  saveKey(input: SaveKeyInput): Promise<{ ok: true; keyHint: string }>;
  deleteKey(userId: string, keyId: string): Promise<{ ok: true }>;
  resolveKey(userId: string, provider: string, byokOnly: boolean): Promise<ResolvedKey>;
  resolveApiKey(userId: string, provider: string, byokOnly: boolean): Promise<ResolvedKey>;
  setKeyValidator(validator: KeyValidator): void;
}

export function createByokModule(deps: ByokModuleDependencies): ByokModule {
  const repo = new KyselyByokRepository(deps.db);
  let activeValidator: KeyValidator = deps.keyValidator ?? new HttpKeyValidator();

  const defaultPlatformKeyResolver: PlatformKeyResolver = (provider: string) => {
    const envName = `PLATFORM_${provider.toUpperCase()}_KEY`;
    if (process.env[envName]) {
      return process.env[envName];
    }
    if (provider === 'openrouter' && process.env.OPENROUTER_API_KEY) {
      return process.env.OPENROUTER_API_KEY;
    }
    return undefined;
  };

  const listKeysUseCase = new ListKeysUseCase(repo);
  const saveKeyUseCase = new SaveKeyUseCase(
    repo,
    () => activeValidator,
    deps.masterKeyBase64
  );
  const deleteKeyUseCase = new DeleteKeyUseCase(repo);
  const resolveKeyUseCase = new ResolveKeyUseCase(
    repo,
    deps.masterKeyBase64,
    deps.getPlatformKey ?? defaultPlatformKeyResolver
  );

  return {
    registerRoutes: (app: FastifyInstance) => {
      registerByokRoutes(app, {
        requireUser: deps.requireUser,
        listKeysUseCase,
        saveKeyUseCase,
        deleteKeyUseCase,
      });
    },
    listKeys: (userId) => listKeysUseCase.execute(userId),
    saveKey: (input) => saveKeyUseCase.execute(input),
    deleteKey: (userId, keyId) => deleteKeyUseCase.execute(userId, keyId),
    resolveKey: (userId, provider, byokOnly) =>
      resolveKeyUseCase.execute(userId, provider, byokOnly),
    resolveApiKey: (userId, provider, byokOnly) =>
      resolveKeyUseCase.execute(userId, provider, byokOnly),
    setKeyValidator: (validator: KeyValidator) => {
      activeValidator = validator;
    },
  };
}
