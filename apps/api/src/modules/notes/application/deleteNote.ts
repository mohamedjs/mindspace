import type {
  NoteRepositoryPort,
  SpaceActivityPort,
  TimelinePort,
  UnitOfWorkPort,
} from '../domain/ports.js';
import { NoteNotFoundError } from '../domain/errors.js';

export class DeleteNoteUseCase {
  constructor(
    private noteRepo: NoteRepositoryPort,
    private spacePort: SpaceActivityPort,
    private timelinePort: TimelinePort,
    private uow: UnitOfWorkPort
  ) {}

  async execute(userId: string, noteId: string): Promise<void> {
    await this.uow.runInTransaction(async (trx) => {
      // 1. Soft delete note atomically with deleted_at IS NULL guard
      const deleted = await this.noteRepo.softDelete(userId, noteId, trx);
      if (!deleted) {
        // Check if note exists and is owned by user (could be already deleted)
        const anyNote = await this.noteRepo.findAnyById(userId, noteId, trx);
        if (!anyNote) {
          throw new NoteNotFoundError();
        }
        // Already deleted concurrently or earlier - no-op
        return;
      }

      // 2. Child promotion: promote children of deleted parent
      await this.noteRepo.promoteChildren(userId, noteId, trx);

      // 3. Decrement note count and bump last_activity_at
      await this.spacePort.bumpActivity(deleted.space_id, -1, trx);

      // 4. Record timeline event
      const summary = deleted.title || deleted.content.slice(0, 60);
      await this.timelinePort.recordEvent(
        {
          userId,
          spaceId: deleted.space_id,
          type: 'note_deleted',
          refId: noteId,
          summary,
        },
        trx
      );
    });
  }
}
