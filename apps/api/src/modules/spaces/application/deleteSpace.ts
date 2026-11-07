import type { SpaceRepositoryPort } from '../domain/ports.js';
import { SpaceNotFoundError } from '../domain/errors.js';

export class DeleteSpaceUseCase {
  constructor(private repo: SpaceRepositoryPort) {}

  async execute(userId: string, spaceId: string): Promise<void> {
    const existing = await this.repo.findById(userId, spaceId);
    if (!existing) {
      throw new SpaceNotFoundError();
    }
    await this.repo.softDeleteSpace(userId, spaceId);
  }
}
