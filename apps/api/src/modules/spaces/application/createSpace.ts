import type { SpaceRepositoryPort } from '../domain/ports.js';
import type { SpaceSummary } from '../domain/entities.js';

export class CreateSpaceUseCase {
  constructor(private repo: SpaceRepositoryPort) {}

  async execute(userId: string, name: string, emoji?: string): Promise<SpaceSummary> {
    const trimmed = name.trim();
    return this.repo.createSpace(userId, trimmed, emoji);
  }
}
