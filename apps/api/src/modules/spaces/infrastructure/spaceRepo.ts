import type { Database } from '../../../platform/db.js';
import type { SpaceSeedPort } from '../domain/ports.js';

export class KyselySpaceRepository implements SpaceSeedPort {
  constructor(private db: Database) {}

  async createDefaultSpace(trxOrDb: unknown, userId: string): Promise<void> {
    const client = (trxOrDb as Database) || this.db;

    await client
      .insertInto('spaces')
      .values({
        user_id: userId,
        name: 'My MindSpace',
        emoji: '💡',
      })
      .execute();
  }
}
