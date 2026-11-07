import type { RelationshipRepositoryPort, SpaceActivityPort } from '../domain/ports.js';
import type { RelType } from '../domain/entities.js';

export class DeleteRelationshipUseCase {
  constructor(
    private relRepo: RelationshipRepositoryPort,
    private spacePort: SpaceActivityPort
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    fromNoteId: string,
    toNoteId: string,
    type?: RelType | null
  ): Promise<void> {
    await this.spacePort.ensureOwned(spaceId, userId);
    await this.relRepo.softDelete(userId, spaceId, fromNoteId, toNoteId, type);
  }
}
