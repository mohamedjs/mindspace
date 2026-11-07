import type {
  RelationshipRepositoryPort,
  NoteRepositoryPort,
  SpaceActivityPort,
  CreateRelationshipData,
} from '../domain/ports.js';
import type { RelationshipOut } from '../domain/entities.js';
import { NoteNotFoundError, InvalidStructureError } from '../domain/errors.js';

export class CreateRelationshipUseCase {
  constructor(
    private relRepo: RelationshipRepositoryPort,
    private noteRepo: NoteRepositoryPort,
    private spacePort: SpaceActivityPort
  ) {}

  async execute(userId: string, data: CreateRelationshipData): Promise<RelationshipOut> {
    if (data.fromNoteId === data.toNoteId) {
      throw new InvalidStructureError('Self-links are not allowed');
    }

    await this.spacePort.ensureOwned(data.spaceId, userId);

    const fromNote = await this.noteRepo.findById(userId, data.fromNoteId);
    const toNote = await this.noteRepo.findById(userId, data.toNoteId);

    if (
      !fromNote ||
      !toNote ||
      fromNote.space_id !== data.spaceId ||
      toNote.space_id !== data.spaceId
    ) {
      throw new NoteNotFoundError('One or both notes not found in this space');
    }

    return this.relRepo.create(userId, data);
  }
}
