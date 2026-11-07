import type {
  NoteRepositoryPort,
  SpaceActivityPort,
  TimelinePort,
  UnitOfWorkPort,
} from '../domain/ports.js';
import { NoteNotFoundError } from '../domain/errors.js';

export class UpdateNoteContentUseCase {
  constructor(
    private noteRepo: NoteRepositoryPort,
    private spacePort: SpaceActivityPort,
    private timelinePort: TimelinePort,
    private uow: UnitOfWorkPort
  ) {}

  async execute(
    userId: string,
    noteId: string,
    title: string | null,
    content: string
  ): Promise<void> {
    const existing = await this.noteRepo.findById(userId, noteId);
    if (!existing) {
      throw new NoteNotFoundError();
    }

    const contentChanged = existing.content !== content;

    await this.uow.runInTransaction(async (trx) => {
      await this.noteRepo.updateContent(userId, noteId, title, content, trx);

      if (contentChanged) {
        await this.spacePort.bumpActivity(existing.space_id, 0, trx);

        const summary = title || content.slice(0, 60);
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
