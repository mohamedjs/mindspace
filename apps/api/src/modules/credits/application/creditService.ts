import type {
  CreditBalance,
  CreditLedgerEntry,
  CreditPackage,
  GrantCreditsOptions,
  LedgerReason,
  SweepResult,
} from '../domain/entities.js';
import type { CreditRepositoryPort } from '../domain/ports.js';
import { GetBalanceUseCase } from './getBalance.js';
import { GrantCreditsUseCase } from './grantCredits.js';
import { GrantSignupUseCase } from './grantSignup.js';
import { ListLedgerUseCase } from './listLedger.js';
import { ListPackagesUseCase } from './listPackages.js';
import { MonthlyRefillUseCase } from './monthlyRefill.js';
import { ReleaseCreditsUseCase } from './releaseCredits.js';
import { ReserveCreditsUseCase } from './reserveCredits.js';
import { SettleCreditsUseCase } from './settleCredits.js';
import { SweepReservationsUseCase } from './sweepReservations.js';

export interface GrantCreditsInput extends GrantCreditsOptions {
  userId: string;
  amount: number;
  reason?: LedgerReason;
  tx?: unknown;
}

export class CreditService {
  private readonly getBalanceUseCase: GetBalanceUseCase;
  private readonly listLedgerUseCase: ListLedgerUseCase;
  private readonly listPackagesUseCase: ListPackagesUseCase;
  private readonly reserveUseCase: ReserveCreditsUseCase;
  private readonly settleUseCase: SettleCreditsUseCase;
  private readonly releaseUseCase: ReleaseCreditsUseCase;
  private readonly grantUseCase: GrantCreditsUseCase;
  private readonly grantSignupUseCase: GrantSignupUseCase;
  private readonly sweepUseCase: SweepReservationsUseCase;
  private readonly refillUseCase: MonthlyRefillUseCase;

  constructor(creditRepo: CreditRepositoryPort) {
    this.getBalanceUseCase = new GetBalanceUseCase(creditRepo);
    this.listLedgerUseCase = new ListLedgerUseCase(creditRepo);
    this.listPackagesUseCase = new ListPackagesUseCase(creditRepo);
    this.reserveUseCase = new ReserveCreditsUseCase(creditRepo);
    this.settleUseCase = new SettleCreditsUseCase(creditRepo);
    this.releaseUseCase = new ReleaseCreditsUseCase(creditRepo);
    this.grantUseCase = new GrantCreditsUseCase(creditRepo);
    this.grantSignupUseCase = new GrantSignupUseCase(creditRepo);
    this.sweepUseCase = new SweepReservationsUseCase(creditRepo);
    this.refillUseCase = new MonthlyRefillUseCase(creditRepo);
  }

  async getBalance(userId: string): Promise<CreditBalance> {
    return this.getBalanceUseCase.execute(userId);
  }

  async listLedger(userId: string, limit = 50, offset = 0): Promise<CreditLedgerEntry[]> {
    return this.listLedgerUseCase.execute(userId, limit, offset);
  }

  async listPackages(): Promise<CreditPackage[]> {
    return this.listPackagesUseCase.execute();
  }

  async reserve(userId: string, amount: number, tx?: unknown): Promise<string> {
    return this.reserveUseCase.execute(userId, amount, tx);
  }

  async settle(
    reservationId: string,
    userId: string,
    actual: number,
    aiActionId: string | null,
    tx: unknown
  ): Promise<number> {
    return this.settleUseCase.execute(reservationId, userId, actual, aiActionId, tx);
  }

  async release(
    reservationId: string,
    userIdOrTx?: string | unknown,
    tx?: unknown
  ): Promise<void> {
    if (typeof userIdOrTx === 'string') {
      return this.releaseUseCase.execute(reservationId, userIdOrTx, tx);
    }
    return this.releaseUseCase.execute(reservationId, undefined, userIdOrTx);
  }

  async grant(
    userIdOrInput: string | GrantCreditsInput,
    amountOrTx?: number | unknown,
    reasonOrTx?: LedgerReason | unknown,
    tx?: unknown,
    options?: GrantCreditsOptions
  ): Promise<number> {
    if (typeof userIdOrInput === 'object' && userIdOrInput !== null) {
      const input = userIdOrInput;
      const resolvedTx = amountOrTx ?? input.tx;
      return this.grantUseCase.execute(
        input.userId,
        input.amount,
        input.reason ?? 'purchase',
        resolvedTx,
        {
          packageId: input.packageId,
          paymentRef: input.paymentRef,
          meta: input.meta,
        }
      );
    }

    const userId = userIdOrInput;
    const amount = amountOrTx as number;

    if (typeof reasonOrTx === 'string') {
      return this.grantUseCase.execute(userId, amount, reasonOrTx as LedgerReason, tx, options);
    }

    return this.grantUseCase.execute(userId, amount, 'purchase', reasonOrTx);
  }

  async grantSignup(trxOrDb: unknown, userId: string): Promise<void> {
    return this.grantSignupUseCase.execute(trxOrDb, userId);
  }

  async sweepExpiredReservations(tx?: unknown): Promise<SweepResult> {
    return this.sweepUseCase.execute(tx);
  }

  async monthlyFreeRefill(tx?: unknown): Promise<number> {
    return this.refillUseCase.execute(tx);
  }
}
