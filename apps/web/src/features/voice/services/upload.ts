import { supabaseContainer } from '../../../infrastructure/container';
import { buildStoragePath, extensionFor } from './audioFormat';

export { buildStoragePath, extensionFor };

export interface UploadArgs {
  localUri: string;
  userId: string;
  spaceId: string;
  recordingId: string;
}

/**
 * Uploads the recorded audio and returns its stored path.
 *
 * The retry loop and the web-vs-native blob branch now live in the storage
 * adapter — they're details of how *this* backend stores bytes, not of what
 * the app is doing.
 */
export const uploadRecording = (args: UploadArgs): Promise<string> =>
  supabaseContainer.storage.uploadRecording(args);
