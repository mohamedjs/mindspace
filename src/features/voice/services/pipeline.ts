import { supabaseContainer } from '../../../infrastructure/container';

interface TranscribeResult {
  transcriptId: string;
  text: string;
  language: string | null;
}

interface ExtractResult {
  aiActionId: string;
  noteIds: string[];
  creditsCharged: number;
}

/**
 * The direct record -> notes cycle: transcribe the uploaded audio, then feed
 * the transcript straight into extraction. No manual "review transcript"
 * step — the user asked for record-to-notes with nothing in between.
 */
export async function runThinkingPipeline(
  recordingId: string,
  spaceId: string,
  /** Set when recording from inside a note — the notes land under it as sub-notes. */
  parentNoteId?: string | null,
  /**
   * Set when speaking into a note to fill the note itself. Mutually exclusive
   * with parentNoteId: one writes the note, the other writes notes under it.
   */
  fillNoteId?: string | null
): Promise<ExtractResult> {
  // Never transcribe twice. On the free plan the transcribe function deletes
  // the audio once the text exists, so a retry after a failed *extraction*
  // would call transcribe with no object in Storage, get recording_not_uploaded,
  // and strand a perfectly good transcript. Reuse it instead — that also means
  // a retry only pays for the step that actually failed.
  const existingId = await supabaseContainer.recordings.findTranscriptId(recordingId);

  const transcriptId =
    existingId ??
    (await supabaseContainer.functions.invoke<TranscribeResult>('transcribe', { recordingId }))
      .transcriptId;

  const result = fillNoteId
    ? await supabaseContainer.functions.invoke<ExtractResult>('ai-note-write', { transcriptId, noteId: fillNoteId })
    : await supabaseContainer.functions.invoke<ExtractResult>('ai-extract', {
        transcriptId,
        spaceId,
        parentNoteId: parentNoteId ?? null,
      });

  // Extraction is the last step, so this is where the recording is really done.
  // Clears a stale `failed` from an earlier attempt, which the status banner
  // would otherwise keep showing forever.
  await supabaseContainer.recordings.markCompleted(recordingId);

  return result;
}
