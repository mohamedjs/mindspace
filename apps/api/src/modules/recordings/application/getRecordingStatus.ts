import type { RecordingStatusEvent } from '../domain/entities.js';
import { RecordingNotFoundError } from '../domain/errors.js';
import type { RecordingRepositoryPort } from '../domain/ports.js';

export class GetRecordingStatusUseCase {
  constructor(private readonly recordingRepo: RecordingRepositoryPort) {}

  async execute(userId: string, recordingId: string): Promise<RecordingStatusEvent> {
    const recording = await this.recordingRepo.findByIdForUser(recordingId, userId);
    if (!recording) {
      throw new RecordingNotFoundError();
    }
    return {
      status: recording.status,
      error: recording.error,
    };
  }
}
