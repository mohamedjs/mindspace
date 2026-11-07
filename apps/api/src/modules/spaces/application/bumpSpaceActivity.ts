import type { SpaceRepositoryPort } from '../domain/ports.js';

export class BumpSpaceActivityUseCase {
  constructor(private repo: SpaceRepositoryPort) {}

  async execute(spaceId: string, noteDelta: number, trx?: unknown): Promise<void> {
    await this.repo.bumpActivity(spaceId, noteDelta, trx);
  }
}
