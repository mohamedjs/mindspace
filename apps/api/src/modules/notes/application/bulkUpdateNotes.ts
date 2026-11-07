import type {
  NoteRepositoryPort,
  SpaceActivityPort,
  TimelinePort,
  UnitOfWorkPort,
} from '../domain/ports.js';
import type { NoteType } from '../domain/entities.js';
import { LimitExceededError, NoteNotFoundError } from '../domain/errors.js';

export class BulkUpdateNotesUseCase {
  constructor(
    private noteRepo: NoteRepositoryPort,
    private spacePort: SpaceActivityPort,
    private timelinePort: TimelinePort,
    private uow: UnitOfWorkPort
  ) {}

  async execute(
    userId: string,
    ids: string[],
    updates: { color?: string | null; type?: NoteType }
  ): Promise<void> {
    if (ids.length > 500) {
      throw new LimitExceededError('Cannot update more than 500 notes');
    }

    const uniqueIds = Array.from(new Set(ids));
    const liveNotes = await this.noteRepo.findLiveByIds(userId, uniqueIds);

    if (liveNotes.length !== uniqueIds.length) {
      throw new NoteNotFoundError('One or more notes not found');
    }

    await this.uow.runInTransaction(async (trx) => {
      await this.noteRepo.bulkUpdate(userId, uniqueIds, updates, trx);

      if (updates.type) {
        const touchedSpaces = new Set<string>();

        for (const note of liveNotes) {
          if (note.type !== updates.type) {
            touchedSpaces.add(note.space_id);
            const summary = note.title || note.content.slice(0, 60);
            await this.timelinePort.recordEvent(
              {
                userId,
                spaceId: note.space_id,
                type: 'note_updated',
                refId: note.id,
                summary,
              },
              trx
            );
          }
        }

        for (const spaceId of touchedSpaces) {
          await this.spacePort.bumpActivity(spaceId, 0, trx);
        }
      }
    });
  }
}
