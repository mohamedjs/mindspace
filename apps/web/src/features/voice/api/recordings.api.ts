import type { Recording as SpaceRecording, RecordingNote } from '../../../core/domain';
import { container } from '../../../infrastructure/container';

export type { SpaceRecording, RecordingNote };

export const fetchSpaceRecordings = (spaceId: string) =>
  container.recordings.listBySpace(spaceId);

/** Short-lived URL the audio player can stream from. */
export const signedAudioUrl = (storagePath: string) =>
  container.storage.signedUrl(storagePath);

export const finishRecording = (recordingId: string) =>
  container.recordings.finish(recordingId);

export const markRecordingFailed = (recordingId: string, errorMessage: string) =>
  container.recordings.markFailed(recordingId, errorMessage);
