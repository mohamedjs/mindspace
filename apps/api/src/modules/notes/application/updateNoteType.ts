import type {
  NoteRepositoryPort,
  SpaceActivityPort,
  TimelinePort,
  UnitOfWorkPort,
} from '../domain/ports.js';
import type { NoteType } from '../domain/entities.js';
import { NoteNotFoundError } from '../domain/errors.js';

export class UpdateNoteTypeUseCase {
  constructor(
    private noteRepo: NoteRepositoryPort,
    private spacePort: SpaceActivityPort,
    private timelinePort: TimelinePort,
    private uow: UnitOfWorkPort
  ) {}

  async execute(userId: string, noteId: string, type: NoteType): Promise<void> {
    const existing = await this.noteRepo.findById(userId, noteId);
    if (!existing) {
      throw new NoteNotFoundError();
    }

    const typeChanged = existing.type !== type;

    await this.uow.runInTransaction(async (trx) => {
      await this.noteRepo.updateType(userId, noteId, type, trx);

      if (typeChanged) {
        await this.spacePort.bumpActivity(existing.space_id, 0, trx);

        const summary = existing.title || existing.content.slice(0, 60);
        await this.timelinePort.recordEvent(
          {
            userId,
            spaceId: existing.space_id,
            type: 'note_updated',
            refId: noteId,
            summary,
          },
          trx
        );
      }
    });
  }
}
