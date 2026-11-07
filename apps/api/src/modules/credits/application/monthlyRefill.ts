import type { CreditRepositoryPort } from '../domain/ports.js';

export class MonthlyRefillUseCase {
  constructor(private readonly creditRepo: CreditRepositoryPort) {}

  async execute(tx?: unknown): Promise<number> {
    return this.creditRepo.monthlyFreeRefill(tx);
  }
}
