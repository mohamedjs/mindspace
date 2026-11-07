import type { UserKeySummary } from '../domain/entities.js';
import type { ByokRepositoryPort } from '../domain/ports.js';

export class ListKeysUseCase {
  constructor(private readonly byokRepo: ByokRepositoryPort) {}

  async execute(userId: string): Promise<UserKeySummary[]> {
    return this.byokRepo.listByUser(userId);
  }
}
