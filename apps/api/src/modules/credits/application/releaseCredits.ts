import type { CreditRepositoryPort } from '../domain/ports.js';

export class ReleaseCreditsUseCase {
  constructor(private readonly creditRepo: CreditRepositoryPort) {}

  async execute(reservationId: string, userId?: string, tx?: unknown): Promise<void> {
    await this.creditRepo.release(reservationId, userId, tx);
  }
}
