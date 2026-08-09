import { supabase } from '../../../lib/supabase/client';

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
  // response body hanging off .context. Surface it or every failure is opaque.
  if (error) {
    const res = (error as { context?: Response }).context;
    if (res && typeof res.json === 'function') {
      const detail = await res.json().catch(() => null);
      if (detail?.error) {
        throw new Error(`${name}: ${detail.message ?? detail.error}`);
      }
    }
    throw error;
  }

  if (data?.error) throw new Error(data.message ?? data.error);
  return data as T;
}

/**
 * The direct record -> notes cycle: transcribe the uploaded audio, then feed
 * the transcript straight into extraction. No manual "review transcript"
 * step — the user asked for record-to-notes with nothing in between.
 */
export async function runThinkingPipeline(
  recordingId: string,
  spaceId: string
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

  const result = await invoke<ExtractResult>('ai-extract', { transcriptId, spaceId });

  // Extraction is the last step, so this is where the recording is really done.
  // Clears a stale `failed` from an earlier attempt, which the status banner
  // would otherwise keep showing forever.
  await supabase
    .from('recordings')
    .update({ status: 'completed', error: null })
    .eq('id', recordingId);

  return result;
}
