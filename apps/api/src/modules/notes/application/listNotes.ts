import type { NoteRepositoryPort, SpaceActivityPort } from '../domain/ports.js';
import type { NoteOut } from '../domain/entities.js';

export class ListNotesUseCase {
  constructor(
    private noteRepo: NoteRepositoryPort,
    private spacePort: SpaceActivityPort
  ) {}

  async execute(userId: string, spaceId: string): Promise<NoteOut[]> {
    await this.spacePort.ensureOwned(spaceId, userId);
    return this.noteRepo.listBySpace(userId, spaceId);
  }
}
