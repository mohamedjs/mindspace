import { RecordingNotFoundError } from '../domain/errors.js';
import type { RecordingEventsPort, RecordingRepositoryPort } from '../domain/ports.js';

export class MarkRecordingFailedUseCase {
  constructor(
    private readonly recordingRepo: RecordingRepositoryPort,
    private readonly eventsPort: RecordingEventsPort
  ) {}

  async execute(userId: string, recordingId: string, errorText: string): Promise<void> {
    const updated = await this.recordingRepo.updateStatus(
      recordingId,
      userId,
      'failed',
      errorText,
      true
    );
    if (!updated) {
      throw new RecordingNotFoundError();
    }
    await this.eventsPort.publishStatus(recordingId, { status: 'failed', error: errorText });
  }
}

export class MarkRecordingCompletedUseCase {
  constructor(
    private readonly recordingRepo: RecordingRepositoryPort,
    private readonly eventsPort: RecordingEventsPort
  ) {}

  async execute(userId: string, recordingId: string): Promise<void> {
    const updated = await this.recordingRepo.updateStatus(
      recordingId,
      userId,
      'completed',
      null,
      true
    );
    if (!updated) {
      throw new RecordingNotFoundError();
    }
    await this.eventsPort.publishStatus(recordingId, { status: 'completed', error: null });
  }
}
