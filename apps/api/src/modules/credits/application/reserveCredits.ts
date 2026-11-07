import { InvalidCreditAmountError } from '../domain/errors.js';
import type { CreditRepositoryPort } from '../domain/ports.js';

export class ReserveCreditsUseCase {
  constructor(private readonly creditRepo: CreditRepositoryPort) {}

  async execute(userId: string, amount: number, tx?: unknown): Promise<string> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new InvalidCreditAmountError('amount must be a positive integer');
    }
    return this.creditRepo.reserve(userId, amount, tx);
  }
}
