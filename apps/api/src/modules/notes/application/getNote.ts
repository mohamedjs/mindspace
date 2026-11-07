import type { NoteRepositoryPort } from '../domain/ports.js';
import type { NoteOut } from '../domain/entities.js';
import { NoteNotFoundError } from '../domain/errors.js';

export class GetNoteUseCase {
  constructor(private noteRepo: NoteRepositoryPort) {}

  async execute(userId: string, noteId: string): Promise<NoteOut> {
    const note = await this.noteRepo.findById(userId, noteId);
    if (!note) {
      throw new NoteNotFoundError();
    }
    return note;
  }
}
