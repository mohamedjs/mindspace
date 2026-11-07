import { sql } from 'kysely';
import type { Database } from '../../../platform/db.js';
import type { CreditSignupPort } from '../domain/ports.js';

export class KyselyCreditRepository implements CreditSignupPort {
  constructor(private db: Database) {}

  async grantSignup(trxOrDb: unknown, userId: string): Promise<void> {
    const client = (trxOrDb as Database) || this.db;

    await client
      .updateTable('profiles')
      .set({
        credits_balance: 100,
        free_refill_at: sql`CURRENT_DATE`,
      })
      .where('id', '=', userId)
      .execute();

    await client
      .insertInto('credit_ledger')
      .values({
        user_id: userId,
        delta: 100,
        balance_after: 100,
        reason: 'signup_grant',
      })
      .execute();
  }
}
