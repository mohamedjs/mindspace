import type {
  NoteRepositoryPort,
  RelationshipRepositoryPort,
  SpaceActivityPort,
  TimelinePort,
  UnitOfWorkPort,
  BulkCreateNoteData,
} from '../domain/ports.js';
import type { NoteOut, RelationshipOut, RelType } from '../domain/entities.js';
import { LimitExceededError } from '../domain/errors.js';

export interface BulkCreateInput {
  notes: BulkCreateNoteData[];
  relations?: Array<{
    spaceId?: string;
    fromNoteId: string;
    toNoteId: string;
    type?: RelType;
  }>;
}

export class BulkCreateNotesUseCase {
  constructor(
    private noteRepo: NoteRepositoryPort,
    private relRepo: RelationshipRepositoryPort,
    private spacePort: SpaceActivityPort,
    private timelinePort: TimelinePort,
    private uow: UnitOfWorkPort
  ) {}

  async execute(
    userId: string,
    input: BulkCreateInput
  ): Promise<{ notes: NoteOut[]; relations: RelationshipOut[] }> {
    if (input.notes.length > 500) {
      throw new LimitExceededError('Cannot create more than 500 notes');
    }

    // Verify all spaces belong to caller
    const spaceIds = Array.from(new Set(input.notes.map((n) => n.spaceId)));
    for (const spaceId of spaceIds) {
      await this.spacePort.ensureOwned(spaceId, userId);
    }

    return this.uow.runInTransaction(async (trx) => {
      // 1. Bulk create notes
      const createdNotes = await this.noteRepo.bulkCreate(userId, input.notes, trx);

      // 2. Count per space & bump activity
      const countsBySpace = new Map<string, number>();
      for (const note of createdNotes) {
        countsBySpace.set(note.space_id, (countsBySpace.get(note.space_id) ?? 0) + 1);
      }
      for (const [spaceId, count] of countsBySpace.entries()) {
        await this.spacePort.bumpActivity(spaceId, count, trx);
      }

      // 3. Timeline events
      for (const note of createdNotes) {
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

      // 4. Create relations if any
      let createdRelations: RelationshipOut[] = [];
      if (input.relations && input.relations.length > 0) {
        const relationsToCreate = input.relations.map((r) => ({
          spaceId: r.spaceId || spaceIds[0],
          fromNoteId: r.fromNoteId,
          toNoteId: r.toNoteId,
          type: r.type || 'related',
        }));
        createdRelations = await this.relRepo.bulkCreate(userId, relationsToCreate, trx);
      }

      return {
        notes: createdNotes,
        relations: createdRelations,
      };
    });
  }
}
