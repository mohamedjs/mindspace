import type { NoteRepositoryPort, SpaceActivityPort } from '../domain/ports.js';
import type { MindMapResult } from '../domain/entities.js';

export class GetMindMapUseCase {
  constructor(
    private noteRepo: NoteRepositoryPort,
    private spacePort: SpaceActivityPort
  ) {}

  async execute(userId: string, spaceId: string): Promise<MindMapResult> {
    await this.spacePort.ensureOwned(spaceId, userId);
    return this.noteRepo.getMindMap(userId, spaceId);
  }
}
