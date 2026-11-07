import type { RecordingStatus } from '../domain/entities.js';
import { RecordingNotFoundError } from '../domain/errors.js';
import type { RecordingEventsPort, RecordingRepositoryPort } from '../domain/ports.js';

export class FinishRecordingUseCase {
  constructor(
    private readonly recordingRepo: RecordingRepositoryPort,
    private readonly eventsPort: RecordingEventsPort
  ) {}

  async execute(
    userId: string,
    recordingId: string
  ): Promise<{ id: string; status: RecordingStatus }> {
    const recording = await this.recordingRepo.findByIdForUser(recordingId, userId);
    if (!recording) {
      throw new RecordingNotFoundError();
    }

    const { status, changed } = await this.recordingRepo.queueRecording(recording.id, userId);

    if (changed || status === 'queued') {
      await this.eventsPort.publishStatus(recording.id, { status: 'queued', error: null });
      await this.eventsPort.publishWake();
    }

    return {
      id: recording.id,
      status,
    };
  }
}
