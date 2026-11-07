import type { CreditBalance } from '../domain/entities.js';
import { ProfileNotFoundError } from '../domain/errors.js';
import type { CreditRepositoryPort } from '../domain/ports.js';

export class GetBalanceUseCase {
  constructor(private readonly creditRepo: CreditRepositoryPort) {}

  async execute(userId: string): Promise<CreditBalance> {
    const balance = await this.creditRepo.getBalance(userId);
    if (!balance) {
      throw new ProfileNotFoundError();
    }
    return balance;
  }
}
