import type { CreateRecordingInput, Recording } from '../domain/entities.js';
import type {
  NoteOwnershipPort,
  RecordingRepositoryPort,
  SpaceOwnershipPort,
} from '../domain/ports.js';

export class CreateRecordingUseCase {
  constructor(
    private readonly recordingRepo: RecordingRepositoryPort,
    private readonly spaceOwnership: SpaceOwnershipPort,
    private readonly noteOwnership: NoteOwnershipPort
  ) {}

  async execute(input: CreateRecordingInput): Promise<Recording> {
    await this.spaceOwnership.ensureOwned(input.spaceId, input.userId);

    if (input.targetNoteId) {
      await this.noteOwnership.ensureNoteInSpaceOwned(
        input.targetNoteId,
        input.spaceId,
        input.userId
      );
    }

    if (input.parentNoteId) {
      await this.noteOwnership.ensureNoteInSpaceOwned(
        input.parentNoteId,
        input.spaceId,
        input.userId
      );
    }

    return this.recordingRepo.create(input);
  }
}
