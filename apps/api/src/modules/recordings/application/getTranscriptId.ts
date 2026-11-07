import { RecordingNotFoundError } from '../domain/errors.js';
import type { RecordingRepositoryPort } from '../domain/ports.js';

export class GetTranscriptIdUseCase {
  constructor(private readonly recordingRepo: RecordingRepositoryPort) {}

  async execute(userId: string, recordingId: string): Promise<{ transcript_id: string | null }> {
    const recording = await this.recordingRepo.findByIdForUser(recordingId, userId);
    if (!recording) {
      throw new RecordingNotFoundError();
    }
    const transcript = await this.recordingRepo.findTranscriptByRecording(recording.id, userId);
    return {
      transcript_id: transcript ? transcript.id : null,
    };
  }
}
