import type { NoteRepositoryPort } from '../domain/ports.js';
import { NoteNotFoundError } from '../domain/errors.js';

export class UpdateNotePositionUseCase {
  constructor(private noteRepo: NoteRepositoryPort) {}

  async execute(userId: string, noteId: string, x: number, y: number): Promise<void> {
    const existing = await this.noteRepo.findById(userId, noteId);
    if (!existing) {
      throw new NoteNotFoundError();
    }

    // Position updates do NOT emit timeline events and do NOT bump last_activity_at
    await this.noteRepo.updatePosition(userId, noteId, x, y);
  }
}
