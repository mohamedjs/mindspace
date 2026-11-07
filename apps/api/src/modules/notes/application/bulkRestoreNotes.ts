import type {
  NoteRepositoryPort,
  SpaceActivityPort,
  TimelinePort,
  UnitOfWorkPort,
} from '../domain/ports.js';
import { LimitExceededError, NoteNotFoundError } from '../domain/errors.js';

export class BulkRestoreNotesUseCase {
  constructor(
    private noteRepo: NoteRepositoryPort,
    private spacePort: SpaceActivityPort,
    private timelinePort: TimelinePort,
    private uow: UnitOfWorkPort
  ) {}

  async execute(userId: string, ids: string[]): Promise<void> {
    if (ids.length > 500) {
      throw new LimitExceededError('Cannot restore more than 500 notes');
    }

    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) return;

    // Check ownership of all IDs
    const ownedNotes = await this.noteRepo.findAnyByIds(userId, uniqueIds);
    if (ownedNotes.length !== uniqueIds.length) {
      throw new NoteNotFoundError('One or more notes not found');
    }

    await this.uow.runInTransaction(async (trx) => {
      // 1. Restore atomically with deleted_at IS NOT NULL guard, returning actually changed rows
      const restoredNotes = await this.noteRepo.bulkRestore(userId, uniqueIds, trx);
      if (restoredNotes.length === 0) {
        return;
      }

      // 2. Count per space and bump activity (single SQL increment for each space)
      const countsBySpace = new Map<string, number>();
      for (const note of restoredNotes) {
        countsBySpace.set(note.space_id, (countsBySpace.get(note.space_id) ?? 0) + 1);
      }

      for (const [spaceId, count] of countsBySpace.entries()) {
        await this.spacePort.bumpActivity(spaceId, count, trx);
      }

      // 3. Timeline events only for notes actually restored
      for (const note of restoredNotes) {
        const summary = note.title || note.content.slice(0, 60);
        await this.timelinePort.recordEvent(
          {
            userId,
            spaceId: note.space_id,
            type: 'note_created',
            refId: note.id,
            summary,
          },
          trx
        );
      }
    });
  }
}
