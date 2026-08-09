import { RecordingOptions, RecordingPresets } from 'expo-audio';
import { supabase } from '../../../lib/supabase/client';

/** Free tier hard-stops at 180s (spec §3). */
export const FREE_MAX_RECORDING_SEC = 180;

/** m4a / AAC 44.1kHz mono 64kbps — small enough to upload on Egyptian mobile data. */
export const MINDSPACE_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
};

/** Metering cadence — feeds a Reanimated shared value, never React state. */
export const METERING_INTERVAL_MS = 60;

export interface CreateRecordingRowArgs {
  spaceId: string;
  durationMs: number;
  sizeBytes?: number;
}

/**
 * Durable checkpoint: write the recordings row immediately on stop, before any
 * upload is attempted. If the upload or transcription dies, the row survives and
 * the audio can be retried instead of silently lost.
 */
export async function createRecordingRow({
  spaceId,
  durationMs,
  sizeBytes,
}: CreateRecordingRowArgs): Promise<string> {
  const { data, error } = await supabase
    .from('recordings')
    .insert({
      space_id: spaceId,
      duration_ms: durationMs,
      size_bytes: sizeBytes,
      local_only: true,
      status: 'recorded',
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
}

export async function markRecordingUploaded(recordingId: string, storagePath: string) {
  const { error } = await supabase
    .from('recordings')
    .update({ storage_path: storagePath, local_only: false })
    .eq('id', recordingId);

  if (error) throw error;
}

export async function markRecordingFailed(recordingId: string, message: string) {
  const { error } = await supabase
    .from('recordings')
    .update({ status: 'failed', error: message })
    .eq('id', recordingId);

  if (error) throw error;
}
