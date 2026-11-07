import type { NoteRepositoryPort } from '../domain/ports.js';
import { LimitExceededError, NoteNotFoundError } from '../domain/errors.js';

export class BulkMoveNotesUseCase {
  constructor(private noteRepo: NoteRepositoryPort) {}

  async execute(
    userId: string,
    moves: Array<{ id: string; x: number; y: number }>
  ): Promise<void> {
    if (moves.length > 500) {
      throw new LimitExceededError('Cannot move more than 500 notes');
    }

    if (moves.length === 0) {
      return;
    }

    const uniqueIds = Array.from(new Set(moves.map((m) => m.id)));
    const liveNotes = await this.noteRepo.findLiveByIds(userId, uniqueIds);

    if (liveNotes.length !== uniqueIds.length) {
      throw new NoteNotFoundError('One or more notes not found');
    }

    // Single statement bulk update, no timeline event emitted
    await this.noteRepo.bulkMove(userId, moves);
  }
}
