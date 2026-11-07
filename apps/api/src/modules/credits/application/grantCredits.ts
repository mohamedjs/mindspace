import type { GrantCreditsOptions, LedgerReason } from '../domain/entities.js';
import { InvalidCreditAmountError, TransactionRequiredError } from '../domain/errors.js';
import type { CreditRepositoryPort } from '../domain/ports.js';

export class GrantCreditsUseCase {
  constructor(private readonly creditRepo: CreditRepositoryPort) {}

  async execute(
    userId: string,
    amount: number,
    reason: LedgerReason,
    tx: unknown,
    options?: GrantCreditsOptions
  ): Promise<number> {
    if (!tx) {
      throw new TransactionRequiredError('grant');
    }
    if (!Number.isInteger(amount) || amount < 0) {
      throw new InvalidCreditAmountError('grant amount must be a non-negative integer');
    }
    return this.creditRepo.grant(userId, amount, reason, tx, options);
  }
}
