import type { SpaceRepositoryPort } from '../domain/ports.js';
import type { SpaceSummary } from '../domain/entities.js';

export class ListSpacesUseCase {
  constructor(private repo: SpaceRepositoryPort) {}

  async execute(userId: string): Promise<SpaceSummary[]> {
    return this.repo.listSpaces(userId);
  }
}
