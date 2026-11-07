import type {
  CreditBalance,
  CreditLedgerEntry,
  CreditPackage,
  GrantCreditsOptions,
  LedgerReason,
  SweepResult,
} from './entities.js';

export interface CreditSignupPort {
  grantSignup(trxOrDb: unknown, userId: string): Promise<void>;
}

export interface CreditRepositoryPort extends CreditSignupPort {
  getBalance(userId: string, trx?: unknown): Promise<CreditBalance | null>;
  listLedger(userId: string, limit: number, offset: number): Promise<CreditLedgerEntry[]>;
  listEnabledPackages(): Promise<CreditPackage[]>;
  reserve(userId: string, amount: number, tx?: unknown): Promise<string>;
  settle(
    reservationId: string,
    userId: string,
    actual: number,
    aiActionId: string | null,
    tx: unknown
  ): Promise<number>;
  release(reservationId: string, userId?: string, tx?: unknown): Promise<void>;
  grant(
    userId: string,
    amount: number,
    reason: LedgerReason,
    tx: unknown,
    options?: GrantCreditsOptions
  ): Promise<number>;
  sweepExpiredReservations(tx?: unknown): Promise<SweepResult>;
  monthlyFreeRefill(tx?: unknown): Promise<number>;
}
