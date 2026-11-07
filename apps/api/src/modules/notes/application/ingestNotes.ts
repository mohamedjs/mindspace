import type {
  NoteRepositoryPort,
  GroupRepositoryPort,
  RelationshipRepositoryPort,
  SpaceActivityPort,
  TimelinePort,
  UnitOfWorkPort,
} from '../domain/ports.js';
import type { GroupOut } from '../domain/entities.js';
import { LimitExceededError, InvalidStructureError } from '../domain/errors.js';
import {
  structureNotes,
  type IngestNoteItem,
  type IngestRelationItem,
  type IngestGroupItem,
} from '../domain/structure.js';

export interface IngestInput {
  spaceId: string;
  notes: IngestNoteItem[];
  relations?: IngestRelationItem[];
  groups?: IngestGroupItem[];
}

export interface IngestResult {
  notes: Array<{ client_key: string; id: string }>;
  relations: number;
  groups: GroupOut[];
}

export class IngestNotesUseCase {
  constructor(
    private noteRepo: NoteRepositoryPort,
    private groupRepo: GroupRepositoryPort,
    private relRepo: RelationshipRepositoryPort,
    private spacePort: SpaceActivityPort,
    private timelinePort: TimelinePort,
    private uow: UnitOfWorkPort
  ) {}

  async execute(userId: string, input: IngestInput): Promise<IngestResult> {
    if (input.notes.length === 0) {
      throw new InvalidStructureError('At least 1 note is required');
    }
    if (input.notes.length > 200) {
      throw new LimitExceededError('Maximum 200 notes per ingest');
    }

    // 1. Verify caller owns space
    await this.spacePort.ensureOwned(input.spaceId, userId);

    // 2. Fetch existing live notes for board layout
    const existing = await this.noteRepo.getExistingForLayout(userId, input.spaceId);

    // 3. Pure structuring (toposort, parent resolution, color, canvas layout, group frames)
    const structured = structureNotes({
      spaceId: input.spaceId,
      notes: input.notes,
      relations: input.relations || [],
      groups: input.groups || [],
      existing,
    });

    // 4. Wrap all inserts in one transaction
    return this.uow.runInTransaction(async (trx) => {
      // Notes
      await this.noteRepo.bulkInsertStructuredNotes(userId, structured.notes, trx);

      // Relations
      const relationsCount = await this.relRepo.bulkInsertStructuredRelations(
        userId,
        structured.relationships,
        trx
      );

      // Groups
      const createdGroups = await this.groupRepo.bulkInsertStructuredGroups(
        userId,
        structured.groups,
        trx
      );

      // Bump space activity (+number of new notes)
      await this.spacePort.bumpActivity(input.spaceId, structured.notes.length, trx);

      // Timeline events for each note
      for (const note of structured.notes) {
        const summary = note.title || note.content.slice(0, 60);
        await this.timelinePort.recordEvent(
          {
            userId,
            spaceId: input.spaceId,
            type: 'note_created',
            refId: note.id,
            summary,
          },
          trx
        );
      }

      const clientNotes = input.notes.map((n) => ({
        client_key: n.clientKey,
        id: structured.idByKey.get(n.clientKey)!,
      }));

      return {
        notes: clientNotes,
        relations: relationsCount,
        groups: createdGroups,
      };
    });
  }
}
