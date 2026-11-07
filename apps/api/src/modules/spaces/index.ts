import type { FastifyInstance } from 'fastify';
import type { Database } from '../../platform/db.js';
import type { RequireUserHook } from '../../platform/http/auth.js';
import { KyselySpaceRepository } from './infrastructure/spaceRepo.js';
import { CreateDefaultSpaceUseCase } from './application/createDefaultSpace.js';
import { ListSpacesUseCase } from './application/listSpaces.js';
import { CreateSpaceUseCase } from './application/createSpace.js';
import { UpdateSpaceUseCase } from './application/updateSpace.js';
import { DeleteSpaceUseCase } from './application/deleteSpace.js';
import { EnsureSpaceOwnedUseCase } from './application/ensureSpaceOwned.js';
import { BumpSpaceActivityUseCase } from './application/bumpSpaceActivity.js';
import { registerSpaceRoutes } from './presentation/routes.js';
import type { SpaceSummary, Space } from './domain/entities.js';

export * from './domain/entities.js';
export * from './domain/errors.js';
export * from './domain/ports.js';
export * from './application/createDefaultSpace.js';
export * from './application/listSpaces.js';
export * from './application/createSpace.js';
export * from './application/updateSpace.js';
export * from './application/deleteSpace.js';
export * from './application/ensureSpaceOwned.js';
export * from './application/bumpSpaceActivity.js';
export * from './infrastructure/spaceRepo.js';

export interface SpacesModuleDependencies {
  db: Database;
  requireUser?: RequireUserHook;
}

export interface SpacesModule {
  registerRoutes(app: FastifyInstance): void;
  createDefaultSpace(trxOrDb: unknown, userId: string): Promise<void>;
  ensureOwned(spaceId: string, userId: string, trx?: unknown): Promise<Space>;
  bumpActivity(spaceId: string, noteDelta: number, trx?: unknown): Promise<void>;
  listSpaces(userId: string): Promise<SpaceSummary[]>;
}

export function createSpacesModule(depsOrDb: Database | SpacesModuleDependencies): SpacesModule {
  const db = 'db' in depsOrDb ? depsOrDb.db : depsOrDb;
  const requireUser = 'requireUser' in depsOrDb ? depsOrDb.requireUser : undefined;

  const repo = new KyselySpaceRepository(db);
  const createDefaultSpaceUseCase = new CreateDefaultSpaceUseCase(repo);
  const listSpacesUseCase = new ListSpacesUseCase(repo);
  const createSpaceUseCase = new CreateSpaceUseCase(repo);
  const updateSpaceUseCase = new UpdateSpaceUseCase(repo);
  const deleteSpaceUseCase = new DeleteSpaceUseCase(repo);
  const ensureSpaceOwnedUseCase = new EnsureSpaceOwnedUseCase(repo);
  const bumpSpaceActivityUseCase = new BumpSpaceActivityUseCase(repo);

  return {
    registerRoutes: (app: FastifyInstance) => {
      registerSpaceRoutes(app, {
        requireUser,
        listSpacesUseCase,
        createSpaceUseCase,
        updateSpaceUseCase,
        deleteSpaceUseCase,
      });
    },
    createDefaultSpace: (trx, userId) => createDefaultSpaceUseCase.execute(trx, userId),
    ensureOwned: (spaceId, userId, trx) => ensureSpaceOwnedUseCase.execute(userId, spaceId, trx),
    bumpActivity: (spaceId, noteDelta, trx) => bumpSpaceActivityUseCase.execute(spaceId, noteDelta, trx),
    listSpaces: (userId) => listSpacesUseCase.execute(userId),
  };
}
