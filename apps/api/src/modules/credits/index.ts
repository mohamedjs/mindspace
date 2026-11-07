import type { FastifyInstance } from 'fastify';
import type { Database } from '../../platform/db.js';
import type { RequireUserHook } from '../../platform/http/auth.js';
import type {
  CreditBalance,
  CreditLedgerEntry,
  CreditPackage,
  GrantCreditsOptions,
  LedgerReason,
  SweepResult,
} from './domain/entities.js';
import { KyselyCreditRepository } from './infrastructure/creditRepo.js';
import {
  CreditService,
  GetBalanceUseCase,
  GrantCreditsUseCase,
  GrantSignupUseCase,
  ListLedgerUseCase,
  ListPackagesUseCase,
  MonthlyRefillUseCase,
  ReleaseCreditsUseCase,
  ReserveCreditsUseCase,
  SettleCreditsUseCase,
  SweepReservationsUseCase,
  type GrantCreditsInput,
} from './application/index.js';
import { registerCreditRoutes } from './presentation/routes.js';

export * from './domain/index.js';
export * from './application/index.js';
export * from './infrastructure/creditRepo.js';

export interface CreditsModuleDependencies {
  db: Database;
  requireUser?: RequireUserHook;
}

export interface CreditsModule {
  registerRoutes(app: FastifyInstance): void;
  service: CreditService;
  grantSignup(trxOrDb: unknown, userId: string): Promise<void>;
  getBalance(userId: string): Promise<CreditBalance>;
  listLedger(userId: string, limit?: number, offset?: number): Promise<CreditLedgerEntry[]>;
  listPackages(): Promise<CreditPackage[]>;
  reserve(userId: string, amount: number, tx?: unknown): Promise<string>;
  settle(
    reservationId: string,
    userId: string,
    actual: number,
    aiActionId: string | null,
    tx: unknown
  ): Promise<number>;
  release(reservationId: string, userIdOrTx?: string | unknown, tx?: unknown): Promise<void>;
  grant(
    userIdOrInput: string | GrantCreditsInput,
    amountOrTx?: number | unknown,
    reasonOrTx?: LedgerReason | unknown,
    tx?: unknown,
    options?: GrantCreditsOptions
  ): Promise<number>;
  sweepExpiredReservations(tx?: unknown): Promise<SweepResult>;
  monthlyFreeRefill(tx?: unknown): Promise<number>;
}

export function createCreditsModule(depsOrDb: Database | CreditsModuleDependencies): CreditsModule {
  const db = 'db' in depsOrDb ? depsOrDb.db : depsOrDb;
  const requireUser = 'requireUser' in depsOrDb ? depsOrDb.requireUser : undefined;

  const repo = new KyselyCreditRepository(db);
  const service = new CreditService(repo);
  const getBalanceUseCase = new GetBalanceUseCase(repo);
  const listLedgerUseCase = new ListLedgerUseCase(repo);
  const listPackagesUseCase = new ListPackagesUseCase(repo);

  return {
    registerRoutes: (app: FastifyInstance) => {
      registerCreditRoutes(app, {
        requireUser,
        getBalanceUseCase,
        listLedgerUseCase,
        listPackagesUseCase,
      });
    },
    service,
    grantSignup: (trx, userId) => service.grantSignup(trx, userId),
    getBalance: (userId) => service.getBalance(userId),
    listLedger: (userId, limit, offset) => service.listLedger(userId, limit, offset),
    listPackages: () => service.listPackages(),
    reserve: (userId, amount, tx) => service.reserve(userId, amount, tx),
    settle: (reservationId, userId, actual, aiActionId, tx) =>
      service.settle(reservationId, userId, actual, aiActionId, tx),
    release: (reservationId, userIdOrTx, tx) => service.release(reservationId, userIdOrTx, tx),
    grant: (userIdOrInput, amountOrTx, reasonOrTx, tx, options) =>
      service.grant(userIdOrInput, amountOrTx, reasonOrTx, tx, options),
    sweepExpiredReservations: (tx) => service.sweepExpiredReservations(tx),
    monthlyFreeRefill: (tx) => service.monthlyFreeRefill(tx),
  };
}
