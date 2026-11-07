import type { NoteRepositoryPort } from '../domain/ports.js';
import { NoteNotFoundError } from '../domain/errors.js';

export class UpdateNoteColorUseCase {
  constructor(private noteRepo: NoteRepositoryPort) {}

  async execute(userId: string, noteId: string, color: string | null): Promise<void> {
    const existing = await this.noteRepo.findById(userId, noteId);
    if (!existing) {
      throw new NoteNotFoundError();
    }

    await this.noteRepo.updateColor(userId, noteId, color);
  }
}
