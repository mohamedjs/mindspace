import type { Database } from '../../../platform/db.js';
import type { TimelineRepositoryPort } from '../domain/ports.js';
import type { TimelineEvent, TimelineEventInput } from '../domain/entities.js';

export class KyselyTimelineRepository implements TimelineRepositoryPort {
  constructor(private db: Database) {}

  async recordEvent(input: TimelineEventInput, trx?: unknown): Promise<TimelineEvent> {
    const client = (trx as Database) || this.db;
    const inserted = await client
      .insertInto('timeline_events')
      .values({
        user_id: input.userId,
        space_id: input.spaceId,
        type: input.type,
        ref_id: input.refId ?? null,
        summary: input.summary,
      })
      .returning(['id', 'user_id', 'space_id', 'type', 'ref_id', 'summary', 'created_at'])
      .executeTakeFirstOrThrow();

    return {
      id: inserted.id,
      userId: inserted.user_id,
      spaceId: inserted.space_id,
      type: inserted.type,
      refId: inserted.ref_id,
      summary: inserted.summary,
      createdAt: inserted.created_at,
    };
  }

  async listEvents(userId: string, spaceId: string, limit = 50): Promise<TimelineEvent[]> {
    const rows = await this.db
      .selectFrom('timeline_events')
      .select(['id', 'user_id', 'space_id', 'type', 'ref_id', 'summary', 'created_at'])
      .where('space_id', '=', spaceId)
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();

    return rows.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      spaceId: r.space_id,
      type: r.type,
      refId: r.ref_id,
      summary: r.summary,
      createdAt: r.created_at,
    }));
  }
}
