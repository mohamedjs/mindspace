import type { SweepResult } from '../domain/entities.js';
import type { CreditRepositoryPort } from '../domain/ports.js';

export class SweepReservationsUseCase {
  constructor(private readonly creditRepo: CreditRepositoryPort) {}

  async execute(tx?: unknown): Promise<SweepResult> {
    return this.creditRepo.sweepExpiredReservations(tx);
  }
}
