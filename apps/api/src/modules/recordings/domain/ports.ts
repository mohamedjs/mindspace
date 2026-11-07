import type { Readable } from 'node:stream';
import type {
  AllowedAudioExtension,
  CreateRecordingInput,
  ExtractionHandoffInput,
  Recording,
  RecordingListItem,
  RecordingPart,
  RecordingStatus,
  RecordingStatusEvent,
  ResolvedProviderKey,
  ResolvedTranscribeModel,
  Transcript,
  UserEntitlements,
} from './entities.js';

export interface SpaceOwnershipPort {
  ensureOwned(spaceId: string, userId: string): Promise<void>;
}

export interface NoteOwnershipPort {
  ensureNoteInSpaceOwned(noteId: string, spaceId: string, userId: string): Promise<void>;
}

export interface BlobStorePort {
  buildPartKey(userId: string, recordingId: string, idx: number, ext: AllowedAudioExtension): string;
  resolveFilePath(key: string): string;
  savePartFromStream(input: {
    userId: string;
    recordingId: string;
    idx: number;
    stream: Readable;
    maxBytes?: number;
  }): Promise<{
    blobKey: string;
    ext: AllowedAudioExtension;
    sizeBytes: number;
  }>;
  createReadStream(key: string): Readable;
  delete(key: string): Promise<void>;
  deleteRecordingFiles(userId: string, recordingId: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export interface SplitChunkInfo {
  blobKey: string;
  durationMs: number;
}

export interface AudioMediaPort {
  probeDurationMs(blobKey: string): Promise<number>;
  splitPart(input: {
    userId: string;
    recordingId: string;
    part: RecordingPart;
    segmentSeconds: number;
  }): Promise<Array<{ tempFilePath: string; ext: AllowedAudioExtension; durationMs: number }>>;
  stagePartToTemp(blobKey: string): Promise<string>;
  moveSplitChunk(
    tempFilePath: string,
    userId: string,
    recordingId: string,
    newIdx: number,
    ext: AllowedAudioExtension
  ): Promise<string>;
}

export interface TranscriberPort {
  transcribe(input: {
    apiKey: string;
    model: string;
    provider?: string;
    baseUrl?: string;
    audioStream: Readable;
    format: string;
    partIdx?: number;
    recordingId?: string;
    blobKey?: string;
    signal?: AbortSignal;
  }): Promise<{ text: string; language: string | null }>;
}

export interface TranscribeModelResolverPort {
  resolveTranscribeModel(userId: string): Promise<ResolvedTranscribeModel>;
}

export interface KeyResolverPort {
  resolveKey(userId: string, provider: string, byokOnly: boolean): Promise<ResolvedProviderKey>;
}

export interface CreditsReservationPort {
  reserve(userId: string, amount: number, tx?: unknown): Promise<string>;
  settle(
    reservationId: string,
    userId: string,
    actual: number,
    aiActionId: string | null,
    tx: unknown
  ): Promise<number>;
  release(reservationId: string, userId?: string, tx?: unknown): Promise<void>;
}

export interface EntitlementsPort {
  getEntitlements(userId: string): Promise<UserEntitlements>;
}

export interface ExtractorPort {
  extract(input: ExtractionHandoffInput): Promise<void>;
}

export interface RecordingEventsPort {
  publishWake(): Promise<void>;
  publishStatus(recordingId: string, event: RecordingStatusEvent): Promise<void>;
  subscribeStatus(
    recordingId: string,
    onEvent: (event: RecordingStatusEvent) => void
  ): Promise<{ unsubscribe: () => Promise<void>; usingRedis: boolean }>;
  subscribeWake(onWake: () => void): Promise<{ unsubscribe: () => Promise<void> }>;
}

export interface RecordingRepositoryPort {
  create(input: CreateRecordingInput): Promise<Recording>;
  findByIdForUser(recordingId: string, userId: string): Promise<Recording | null>;
  listBySpaceForUser(spaceId: string, userId: string): Promise<RecordingListItem[]>;
  upsertPart(input: {
    recordingId: string;
    userId: string;
    idx: number;
    blobKey: string;
    sizeBytes: number;
    mimeType: string;
  }): Promise<RecordingPart>;
  listParts(recordingId: string, userId: string): Promise<RecordingPart[]>;
  updatePartDuration(partId: string, userId: string, durationMs: number): Promise<void>;
  markPartTranscribed(partId: string, userId: string, transcriptText: string): Promise<void>;
  replacePartsAfterSplit(
    recordingId: string,
    userId: string,
    newParts: Array<{
      idx: number;
      blobKey: string;
      durationMs: number;
      status: string;
      transcriptText: string | null;
      attempts: number;
    }>
  ): Promise<RecordingPart[]>;
  updateRecordingDuration(recordingId: string, userId: string, durationMs: number): Promise<void>;
  updateStatus(
    recordingId: string,
    userId: string,
    status: RecordingStatus,
    error?: string | null,
    clearClaim?: boolean
  ): Promise<boolean>;
  queueRecording(recordingId: string, userId: string): Promise<{ status: RecordingStatus; changed: boolean }>;
  findTranscriptByRecording(recordingId: string, userId: string): Promise<Transcript | null>;
  claimNextQueued(): Promise<Recording | null>;
  tagReservationForRecording(reservationId: string, userId: string, recordingId: string): Promise<void>;
  findHeldReservationsForRecording(recordingId: string, userId: string): Promise<string[]>;
  saveTranscriptAndSettle(input: {
    recordingId: string;
    userId: string;
    text: string;
    language: string | null;
    provider: string;
    modelId: string;
    durationMs: number;
    reservationId: string | null;
    estimatedCredits: number;
    creditsPort: CreditsReservationPort;
  }): Promise<Transcript>;
  isFreePlanUser(userId: string): Promise<boolean>;
  markAudioRemovedForFreePlan(recordingId: string, userId: string): Promise<void>;
  findStaleClaimedRecordings(idleMs: number): Promise<Recording[]>;
  requeueStaleRecording(recordingId: string, userId: string): Promise<void>;
  failStaleRecording(recordingId: string, userId: string, error: string): Promise<void>;
}
