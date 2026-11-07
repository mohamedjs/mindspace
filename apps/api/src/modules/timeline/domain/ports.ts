import type { TimelineEvent, TimelineEventInput } from './entities.js';

export interface TimelineRepositoryPort {
  recordEvent(input: TimelineEventInput, trx?: unknown): Promise<TimelineEvent>;
  listEvents(userId: string, spaceId: string, limit?: number): Promise<TimelineEvent[]>;
}
