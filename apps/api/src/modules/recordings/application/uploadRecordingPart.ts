import type { Readable } from 'node:stream';
import { mimeTypeForAudioExt, type RecordingPart } from '../domain/entities.js';
import {
  AudioPartIndexExceededError,
  AudioPartTooLargeError,
  AudioStorageQuotaExceededError,
  InvalidAudioContainerError,
  RecordingNotFoundError,
} from '../domain/errors.js';
import type {
  BlobStorePort,
  EntitlementsPort,
  RecordingRepositoryPort,
} from '../domain/ports.js';

export interface UploadRecordingPartInput {
  userId: string;
  recordingId: string;
  idx: number;
  stream: Readable;
  maxBytes?: number;
}

export class UploadRecordingPartUseCase {
  constructor(
    private readonly recordingRepo: RecordingRepositoryPort,
    private readonly blobStore: BlobStorePort,
    private readonly entitlements?: EntitlementsPort
  ) {}

  async execute(input: UploadRecordingPartInput): Promise<RecordingPart> {
    const recording = await this.recordingRepo.findByIdForUser(input.recordingId, input.userId);
    if (!recording) {
      // Drain/destroy stream and reject with 404 before touching disk
      input.stream.destroy();
      throw new RecordingNotFoundError();
    }

    let quotaMaxBytes: number | undefined;
    if (this.entitlements) {
      const ent = await this.entitlements.getEntitlements(input.userId);
      if (ent.maxRecordingMinutes !== null && ent.maxRecordingMinutes !== undefined) {
        const maxIdx = Math.ceil(ent.maxRecordingMinutes / 5) + 2;
        if (input.idx >= maxIdx) {
          input.stream.destroy();
          throw new AudioPartIndexExceededError(maxIdx);
        }
      }

      if (
        ent.maxStoredAudioBytes !== null &&
        ent.maxStoredAudioBytes !== undefined &&
        this.blobStore.getUserStoredBytes
      ) {
        const currentBytes = await this.blobStore.getUserStoredBytes(input.userId, {
          recordingId: recording.id,
          idx: input.idx,
        });
        const remainingQuota = ent.maxStoredAudioBytes - currentBytes;
        if (remainingQuota <= 0) {
          input.stream.destroy();
          throw new AudioStorageQuotaExceededError();
        }
        quotaMaxBytes = remainingQuota;
      }
    }

    let saved: { blobKey: string; ext: any; sizeBytes: number };
    try {
      saved = await this.blobStore.savePartFromStream({
        userId: input.userId,
        recordingId: recording.id,
        idx: input.idx,
        stream: input.stream,
        maxBytes: input.maxBytes,
        quotaMaxBytes,
      });
    } catch (err: any) {
      if (err?.name === 'InvalidAudioFormatError') {
        throw new InvalidAudioContainerError(err.message);
      }
      if (err?.name === 'BlobTooLargeError') {
        throw new AudioPartTooLargeError(err.message);
      }
      if (err?.name === 'BlobQuotaExceededError') {
        throw new AudioStorageQuotaExceededError(err.message);
      }
      throw err;
    }

    const mimeType = mimeTypeForAudioExt(saved.ext);
    return this.recordingRepo.upsertPart({
      recordingId: recording.id,
      userId: input.userId,
      idx: input.idx,
      blobKey: saved.blobKey,
      sizeBytes: saved.sizeBytes,
      mimeType,
    });
  }
}
