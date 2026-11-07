import type { TimelineRepositoryPort } from '../domain/ports.js';
import type { TimelineEvent } from '../domain/entities.js';

export class ListTimelineEventsUseCase {
  constructor(private repo: TimelineRepositoryPort) {}

  async execute(userId: string, spaceId: string, limit = 50): Promise<TimelineEvent[]> {
    return this.repo.listEvents(userId, spaceId, limit);
  }
}
