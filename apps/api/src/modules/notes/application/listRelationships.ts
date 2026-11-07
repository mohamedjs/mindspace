import type { RelationshipRepositoryPort, SpaceActivityPort } from '../domain/ports.js';
import type { RelationshipOut } from '../domain/entities.js';

export class ListRelationshipsUseCase {
  constructor(
    private relRepo: RelationshipRepositoryPort,
    private spacePort: SpaceActivityPort
  ) {}

  async execute(userId: string, spaceId: string): Promise<RelationshipOut[]> {
    await this.spacePort.ensureOwned(spaceId, userId);
    return this.relRepo.listBySpace(userId, spaceId);
  }
}
