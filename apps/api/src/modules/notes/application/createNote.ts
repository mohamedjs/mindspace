import type {
  NoteRepositoryPort,
  SpaceActivityPort,
  TimelinePort,
  UnitOfWorkPort,
  CreateNoteData,
} from '../domain/ports.js';
import type { NoteOut } from '../domain/entities.js';
import { NoteNotFoundError, CycleDetectedError } from '../domain/errors.js';

export class CreateNoteUseCase {
  constructor(
    private noteRepo: NoteRepositoryPort,
    private spacePort: SpaceActivityPort,
    private timelinePort: TimelinePort,
    private uow: UnitOfWorkPort
  ) {}

  async execute(userId: string, data: CreateNoteData): Promise<NoteOut> {
    await this.spacePort.ensureOwned(data.spaceId, userId);

    if (data.parentId) {
      const parent = await this.noteRepo.findById(userId, data.parentId);
      if (!parent || parent.space_id !== data.spaceId) {
        throw new NoteNotFoundError('Parent note not found');
      }
    }

    return this.uow.runInTransaction(async (trx) => {
      const created = await this.noteRepo.create(userId, data, trx);

      await this.spacePort.bumpActivity(data.spaceId, 1, trx);

      const summary = created.title || created.content.slice(0, 60);
      await this.timelinePort.recordEvent(
        {
          userId,
          spaceId: data.spaceId,
          type: 'note_created',
          refId: created.id,
          summary,
        },
        trx
      );

      return created;
    });
  }
}
