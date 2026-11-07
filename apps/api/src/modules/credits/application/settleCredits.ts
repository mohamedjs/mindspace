import { InvalidCreditAmountError, TransactionRequiredError } from '../domain/errors.js';
import type { CreditRepositoryPort } from '../domain/ports.js';

export class SettleCreditsUseCase {
  constructor(private readonly creditRepo: CreditRepositoryPort) {}

  async execute(
    reservationId: string,
    userId: string,
    actual: number,
    aiActionId: string | null,
    tx: unknown
  ): Promise<number> {
    if (!tx) {
      throw new TransactionRequiredError('settle');
    }
    if (!Number.isInteger(actual) || actual < 0) {
      throw new InvalidCreditAmountError('actual must be a non-negative integer');
    }
    return this.creditRepo.settle(reservationId, userId, actual, aiActionId, tx);
  }
}
