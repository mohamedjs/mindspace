import type { SpaceRepositoryPort } from '../domain/ports.js';
import { SpaceNotFoundError } from '../domain/errors.js';

export class UpdateSpaceUseCase {
  constructor(private repo: SpaceRepositoryPort) {}

  async execute(userId: string, spaceId: string, name: string): Promise<void> {
    const existing = await this.repo.findById(userId, spaceId);
    if (!existing) {
      throw new SpaceNotFoundError();
    }
    const trimmed = name.trim();
    await this.repo.updateSpaceName(userId, spaceId, trimmed);
  }
}
