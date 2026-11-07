import type { CreditLedgerEntry } from '../domain/entities.js';
import type { CreditRepositoryPort } from '../domain/ports.js';

export class ListLedgerUseCase {
  constructor(private readonly creditRepo: CreditRepositoryPort) {}

  async execute(userId: string, limit = 50, offset = 0): Promise<CreditLedgerEntry[]> {
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit) || 50));
    const safeOffset = Math.max(0, Math.floor(offset) || 0);
    return this.creditRepo.listLedger(userId, safeLimit, safeOffset);
  }
}
