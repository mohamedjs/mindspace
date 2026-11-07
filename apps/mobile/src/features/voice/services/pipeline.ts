import { container } from '../../../infrastructure/container';

interface ExtractResult {
  aiActionId: string;
  noteIds: string[];
  creditsCharged: number;
}

/**
 * Trigger server-side thinking pipeline via finish recording.
 */
export async function runThinkingPipeline(
  recordingId: string,
  _spaceId?: string,
  _parentNoteId?: string | null,
  _fillNoteId?: string | null
): Promise<ExtractResult> {
  await container.recordings.finish(recordingId).catch(() => {});
  return {
    aiActionId: recordingId,
    noteIds: [],
    creditsCharged: 0,
  };
}
