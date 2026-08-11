import { supabase } from '../../../lib/supabase/client';
import { PipelineError } from './pipelineErrors';

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

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });

  // FunctionsHttpError stringifies to a useless "non-2xx status code" — the
  // real reason (no_platform_key, byok_required, provider_error…) is in the
  // response body hanging off .context.
  //
  // The *code* is what matters, not the prose: it decides whether the user
  // sees "out of credits" with a top-up button or "the AI took too long" with
  // a retry. Flattening it into a message string, as this used to, made every
  // failure look the same downstream.
  if (error) {
    const res = (error as { context?: Response }).context;
    if (res && typeof res.json === 'function') {
      const detail = await res.json().catch(() => null);
      if (detail?.error) {
        throw new PipelineError(
          detail.error,
          detail.message ?? detail.reason ?? detail.error,
          res.status,
          detail
        );
      }
    }
    throw error;
  }

  if (data?.error) {
    throw new PipelineError(data.error, data.message ?? data.reason ?? data.error, 200, data);
  }
  return data as T;
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
  const { data: existing } = await supabase
    .from('transcripts')
    .select('id')
    .eq('recording_id', recordingId)
    .maybeSingle();

  const transcriptId =
    existing?.id ?? (await invoke<TranscribeResult>('transcribe', { recordingId })).transcriptId;

  const result = fillNoteId
    ? await invoke<ExtractResult>('ai-note-write', { transcriptId, noteId: fillNoteId })
    : await invoke<ExtractResult>('ai-extract', {
        transcriptId,
        spaceId,
        parentNoteId: parentNoteId ?? null,
      });

  // Extraction is the last step, so this is where the recording is really done.
  // Clears a stale `failed` from an earlier attempt, which the status banner
  // would otherwise keep showing forever.
  await supabase
    .from('recordings')
    .update({ status: 'completed', error: null })
    .eq('id', recordingId);

  return result;
}
