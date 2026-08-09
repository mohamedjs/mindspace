import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { supabase } from '../../../lib/supabase/client';
import { markRecordingUploaded } from './recorder';
import { buildStoragePath, extensionFor } from './audioFormat';

const BUCKET = 'recordings';
const MAX_ATTEMPTS = 3;

export { buildStoragePath, extensionFor };

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface UploadArgs {
  localUri: string;
  userId: string;
  spaceId: string;
  recordingId: string;
}

/**
 * Uploads the recorded audio to Storage.
 *
 * Native: reads the file into an ArrayBuffer — React Native's FormData
 * implementation uploads 0 bytes to Supabase Storage, so ArrayBuffer is the
 * only path that works there. `expo-file-system`'s File API is an
 * unimplemented stub on web (no .arrayBuffer()), so web instead fetches the
 * recorder's blob: URI directly and uploads the Blob.
 *
 * Retries 3x with exponential backoff; on success flips the recordings row
 * off local_only so the transcribe function can pick it up.
 */
export async function uploadRecording({
  localUri,
  userId,
  spaceId,
  recordingId,
}: UploadArgs): Promise<string> {
  // Web must read the blob first: only the blob itself knows which container
  // MediaRecorder actually chose, and the stored extension has to match it.
  const blob = Platform.OS === 'web' ? await (await fetch(localUri)).blob() : null;
  const body = blob ?? (await new File(localUri).arrayBuffer());

  const { ext, contentType } = extensionFor(Platform.OS, blob?.type);
  const path = buildStoragePath(userId, spaceId, recordingId, ext);

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      // ponytail: fixed exponential backoff, no jitter — add jitter if we ever
      // see thundering-herd retries from many clients reconnecting at once.
      await delay(2 ** attempt * 500);
    }

    const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
      contentType,
      upsert: true,
    });

    if (!error) {
      await markRecordingUploaded(recordingId, path);
      return path;
    }

    lastError = error;
  }

  throw lastError ?? new Error('upload_failed');
}
