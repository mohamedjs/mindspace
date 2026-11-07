export const RECORDING_STATUSES = [
  'recorded',
  'uploading',
  'queued',
  'splitting',
  'transcribing',
  'transcribed',
  'extracting',
  'completed',
  'failed',
] as const;

export type RecordingStatus = (typeof RECORDING_STATUSES)[number];

export const RECORDING_KINDS = ['note', 'meeting'] as const;
export type RecordingKind = (typeof RECORDING_KINDS)[number];

export const ALLOWED_AUDIO_EXTENSIONS = ['webm', 'm4a', 'mp4', 'mp3', 'wav', 'ogg'] as const;
export type AllowedAudioExtension = (typeof ALLOWED_AUDIO_EXTENSIONS)[number];

export function mimeTypeForAudioExt(ext: AllowedAudioExtension): string {
  switch (ext) {
    case 'webm':
      return 'audio/webm';
    case 'm4a':
      return 'audio/m4a';
    case 'mp4':
      return 'audio/mp4';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
  }
}

export interface Recording {
  id: string;
  userId: string;
  spaceId: string;
  storagePath: string | null;
  localOnly: boolean;
  durationMs: number;
  sizeBytes: number | null;
  mimeType: string;
  status: RecordingStatus;
  error: string | null;
  claimedAt: Date | null;
  attempts: number;
  processMode: string | null;
  targetNoteId: string | null;
  parentNoteId: string | null;
  kind: RecordingKind;
  createdAt: string;
}

export interface RecordingPart {
  id: string;
  recordingId: string;
  userId: string;
  idx: number;
  blobKey: string;
  durationMs: number | null;
  status: string;
  transcriptText: string | null;
  attempts: number;
  error: string | null;
  createdAt: string;
}

export interface Transcript {
  id: string;
  userId: string;
  recordingId: string;
  text: string;
  language: string | null;
  provider: string;
  modelId: string;
  createdAt: string;
}

export interface RecordingNoteItem {
  id: string;
  title: string | null;
  content: string;
  type: string;
  color: string | null;
  deleted_at: string | null;
}

export interface RecordingListItem {
  id: string;
  status: RecordingStatus;
  error: string | null;
  duration_ms: number;
  created_at: string;
  storage_path: string | null;
  transcripts: Array<{ text: string }>;
  sticky_notes: RecordingNoteItem[];
}

export interface RecordingStatusEvent {
  status: RecordingStatus;
  error: string | null;
}

export interface CreateRecordingInput {
  userId: string;
  spaceId: string;
  kind: RecordingKind;
  processMode: string | null;
  targetNoteId: string | null;
  parentNoteId: string | null;
}

export interface ResolvedTranscribeModel {
  id: string;
  provider: string;
  modelId: string;
  creditMultiplier: number;
  byokOnly: boolean;
}

export interface ResolvedProviderKey {
  apiKey: string;
  usesPlatformKey: boolean;
  baseUrl: string;
}

export interface UserEntitlements {
  planId?: string;
  aiEnabled: boolean;
  isByok?: boolean;
  maxRecordingMinutes: number | null;
  maxStoredAudioBytes?: number | null;
  isFreePlan?: boolean;
}

export interface ExtractionHandoffInput {
  recordingId: string;
  userId: string;
  spaceId: string;
  transcriptId: string;
  transcriptText: string;
  kind: RecordingKind;
  processMode: string | null;
  targetNoteId: string | null;
  parentNoteId: string | null;
}
