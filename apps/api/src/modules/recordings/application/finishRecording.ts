import type { RecordingStatus } from '../domain/entities.js';
import { AiNotInPlanError, RecordingNotFoundError } from '../domain/errors.js';
import type {
  EntitlementsPort,
  RecordingEventsPort,
  RecordingRepositoryPort,
} from '../domain/ports.js';

export class FinishRecordingUseCase {
  constructor(
    private readonly recordingRepo: RecordingRepositoryPort,
    private readonly eventsPort: RecordingEventsPort,
    private readonly entitlements?: EntitlementsPort
  ) {}

  async execute(
    userId: string,
    recordingId: string
  ): Promise<{ id: string; status: RecordingStatus }> {
    const recording = await this.recordingRepo.findByIdForUser(recordingId, userId);
    if (!recording) {
      throw new RecordingNotFoundError();
    }

    if (this.entitlements) {
      const ent = await this.entitlements.getEntitlements(userId);
      if (!ent.aiEnabled) {
        await this.recordingRepo.updateStatus(
          recording.id,
          userId,
          'failed',
          'ai_not_in_plan',
          true
        );
        await this.eventsPort.publishStatus(recording.id, {
          status: 'failed',
          error: 'ai_not_in_plan',
        });
        throw new AiNotInPlanError();
      }
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
