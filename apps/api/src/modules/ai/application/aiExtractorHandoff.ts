import type { ExtractionHandoffInput } from '../domain/entities.js';
import type { ExtractThoughtsUseCase } from './extractThoughts.js';
import type { WriteNoteUseCase } from './writeNote.js';

export class AiExtractorHandoff {
  constructor(
    private readonly extractThoughtsUseCase: ExtractThoughtsUseCase,
    private readonly writeNoteUseCase: WriteNoteUseCase
  ) {}

  async extract(input: ExtractionHandoffInput): Promise<void> {
    if (input.processMode === 'note_write' || (input.targetNoteId && input.processMode !== 'extract')) {
      if (!input.targetNoteId) {
        throw new Error('note_write mode requires targetNoteId');
      }
      await this.writeNoteUseCase.execute({
        userId: input.userId,
        transcriptId: input.transcriptId,
        noteId: input.targetNoteId,
        recordingId: input.recordingId,
      });
    } else {
      await this.extractThoughtsUseCase.execute({
        userId: input.userId,
        transcriptId: input.transcriptId,
        spaceId: input.spaceId,
        parentNoteId: input.parentNoteId,
        recordingId: input.recordingId,
        kind: input.kind,
        processMode: input.processMode,
      });
    }
  }
}
