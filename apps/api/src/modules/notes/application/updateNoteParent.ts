import type { NoteRepositoryPort } from '../domain/ports.js';
import { NoteNotFoundError, CycleDetectedError } from '../domain/errors.js';

export class UpdateNoteParentUseCase {
  constructor(private noteRepo: NoteRepositoryPort) {}

  async execute(userId: string, noteId: string, parentId: string | null): Promise<void> {
    const existing = await this.noteRepo.findById(userId, noteId);
    if (!existing) {
      throw new NoteNotFoundError();
    }

    if (parentId !== null) {
      if (parentId === noteId) {
        throw new CycleDetectedError('Note cannot be its own parent');
      }

      const parent = await this.noteRepo.findById(userId, parentId);
      if (!parent || parent.space_id !== existing.space_id) {
        throw new NoteNotFoundError('Parent note not found');
      }

      const createsCycle = await this.noteRepo.hasCycle(parentId, noteId);
      if (createsCycle) {
        throw new CycleDetectedError('Setting this parent would create a cycle');
      }
    }

    await this.noteRepo.updateParent(userId, noteId, parentId);
  }
}
