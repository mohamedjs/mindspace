import type {
  NoteRepositoryPort,
  SpaceActivityPort,
  TimelinePort,
  UnitOfWorkPort,
} from '../domain/ports.js';
import { LimitExceededError, NoteNotFoundError } from '../domain/errors.js';

export class BulkDeleteNotesUseCase {
  constructor(
    private noteRepo: NoteRepositoryPort,
    private spacePort: SpaceActivityPort,
    private timelinePort: TimelinePort,
    private uow: UnitOfWorkPort
  ) {}

  async execute(userId: string, ids: string[]): Promise<void> {
    if (ids.length > 500) {
      throw new LimitExceededError('Cannot delete more than 500 notes');
    }

    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) return;

    // Check ownership of all IDs (including already-deleted ones)
    const ownedNotes = await this.noteRepo.findAnyByIds(userId, uniqueIds);
    if (ownedNotes.length !== uniqueIds.length) {
      throw new NoteNotFoundError('One or more notes not found');
    }

    await this.uow.runInTransaction(async (trx) => {
      // 1. Soft delete atomically with deleted_at IS NULL guard, returning actually changed rows
      const deletedNotes = await this.noteRepo.bulkSoftDelete(userId, uniqueIds, trx);
      if (deletedNotes.length === 0) {
        return;
      }

      const deletedIds = deletedNotes.map((n) => n.id);

      // 2. Child promotion only for notes actually deleted
      await this.noteRepo.bulkPromoteChildren(userId, deletedIds, trx);

      // 3. Count per space and bump activity (single SQL increment for each space)
      const countsBySpace = new Map<string, number>();
      for (const note of deletedNotes) {
        countsBySpace.set(note.space_id, (countsBySpace.get(note.space_id) ?? 0) + 1);
      }

      for (const [spaceId, count] of countsBySpace.entries()) {
        await this.spacePort.bumpActivity(spaceId, -count, trx);
      }

      // 4. Timeline events only for notes actually deleted
      for (const note of deletedNotes) {
        const summary = note.title || note.content.slice(0, 60);
        await this.timelinePort.recordEvent(
          {
            userId,
            spaceId: note.space_id,
            type: 'note_deleted',
            refId: note.id,
            summary,
          },
          trx
        );
      }
    });
  }
}
