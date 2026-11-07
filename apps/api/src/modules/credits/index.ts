import type { Database } from '../../platform/db.js';
import { KyselyCreditRepository } from './infrastructure/creditRepo.js';
import { GrantSignupUseCase } from './application/grantSignup.js';
export type { CreditSignupPort } from './domain/ports.js';

export interface CreditsModule {
  grantSignup(trxOrDb: unknown, userId: string): Promise<void>;
}

export function createCreditsModule(db: Database): CreditsModule {
  const repo = new KyselyCreditRepository(db);
  const useCase = new GrantSignupUseCase(repo);
  return {
    grantSignup: (trx, userId) => useCase.execute(trx, userId),
  };
}
