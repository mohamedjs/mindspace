import type { Recording as SpaceRecording, RecordingNote } from '../../../core/domain';
import { supabaseContainer } from '../../../infrastructure/container';

export type { SpaceRecording, RecordingNote };

export const fetchSpaceRecordings = (spaceId: string) =>
  supabaseContainer.recordings.listBySpace(spaceId);

/** Short-lived URL the audio player can stream from. */
export const signedAudioUrl = (storagePath: string) =>
  supabaseContainer.storage.signedUrl(storagePath);
