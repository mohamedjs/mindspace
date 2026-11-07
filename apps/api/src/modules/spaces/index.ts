import type { Database } from '../../platform/db.js';
import { KyselySpaceRepository } from './infrastructure/spaceRepo.js';
import { CreateDefaultSpaceUseCase } from './application/createDefaultSpace.js';
export type { SpaceSeedPort } from './domain/ports.js';

export interface SpacesModule {
  createDefaultSpace(trxOrDb: unknown, userId: string): Promise<void>;
}

export function createSpacesModule(db: Database): SpacesModule {
  const repo = new KyselySpaceRepository(db);
  const useCase = new CreateDefaultSpaceUseCase(repo);
  return {
    createDefaultSpace: (trx, userId) => useCase.execute(trx, userId),
  };
}
