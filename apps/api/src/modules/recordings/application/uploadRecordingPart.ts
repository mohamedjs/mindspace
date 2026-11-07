import type { Readable } from 'node:stream';
import { mimeTypeForAudioExt, type RecordingPart } from '../domain/entities.js';
import {
  AudioPartTooLargeError,
  InvalidAudioContainerError,
  RecordingNotFoundError,
} from '../domain/errors.js';
import type { BlobStorePort, RecordingRepositoryPort } from '../domain/ports.js';

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
    private readonly blobStore: BlobStorePort
  ) {}

  async execute(input: UploadRecordingPartInput): Promise<RecordingPart> {
    const recording = await this.recordingRepo.findByIdForUser(input.recordingId, input.userId);
    if (!recording) {
      // Drain/destroy stream and reject with 404 before touching disk
      input.stream.destroy();
      throw new RecordingNotFoundError();
    }

    let saved: { blobKey: string; ext: any; sizeBytes: number };
    try {
      saved = await this.blobStore.savePartFromStream({
        userId: input.userId,
        recordingId: recording.id,
        idx: input.idx,
        stream: input.stream,
        maxBytes: input.maxBytes,
      });
    } catch (err: any) {
      if (err?.name === 'InvalidAudioFormatError') {
        throw new InvalidAudioContainerError(err.message);
      }
      if (err?.name === 'BlobTooLargeError') {
        throw new AudioPartTooLargeError(err.message);
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
