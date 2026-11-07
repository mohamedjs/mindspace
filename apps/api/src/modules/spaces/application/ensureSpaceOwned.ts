import type { SpaceRepositoryPort } from '../domain/ports.js';
import type { Space } from '../domain/entities.js';
import { SpaceNotFoundError } from '../domain/errors.js';

export class EnsureSpaceOwnedUseCase {
  constructor(private repo: SpaceRepositoryPort) {}

  async execute(userId: string, spaceId: string, trx?: unknown): Promise<Space> {
    const space = await this.repo.findById(userId, spaceId, trx);
    if (!space) {
      throw new SpaceNotFoundError();
    }
    return space;
  }
}
