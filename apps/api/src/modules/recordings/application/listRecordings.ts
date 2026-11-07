import type { RecordingListItem } from '../domain/entities.js';
import type { RecordingRepositoryPort, SpaceOwnershipPort } from '../domain/ports.js';

export class ListRecordingsUseCase {
  constructor(
    private readonly recordingRepo: RecordingRepositoryPort,
    private readonly spaceOwnership: SpaceOwnershipPort
  ) {}

  async execute(userId: string, spaceId: string): Promise<RecordingListItem[]> {
    await this.spaceOwnership.ensureOwned(spaceId, userId);
    return this.recordingRepo.listBySpaceForUser(spaceId, userId);
  }
}
