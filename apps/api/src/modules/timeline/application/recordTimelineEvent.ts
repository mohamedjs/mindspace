import type { TimelineRepositoryPort } from '../domain/ports.js';
import type { TimelineEvent, TimelineEventInput } from '../domain/entities.js';

export class RecordTimelineEventUseCase {
  constructor(private repo: TimelineRepositoryPort) {}

  async execute(input: TimelineEventInput, trx?: unknown): Promise<TimelineEvent> {
    return this.repo.recordEvent(input, trx);
  }
}
