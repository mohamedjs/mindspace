import { sql } from 'kysely';
import type { Database } from '../../../platform/db.js';
import type {
  CreditBalance,
  CreditLedgerEntry,
  CreditPackage,
  GrantCreditsOptions,
  LedgerReason,
  SweepResult,
} from '../domain/entities.js';
import {
  InsufficientCreditsError,
  ProfileNotFoundError,
  ReservationNotFoundError,
  TransactionRequiredError,
} from '../domain/errors.js';
import type { CreditRepositoryPort } from '../domain/ports.js';

export class KyselyCreditRepository implements CreditRepositoryPort {
  constructor(private readonly db: Database) {}

  private async runInTx<T>(tx: unknown | undefined, fn: (client: Database) => Promise<T>): Promise<T> {
    if (tx) {
      return fn(tx as Database);
    }
    return this.db.transaction().execute(async (trx) => fn(trx as unknown as Database));
  }

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

  async getBalance(userId: string, trx?: unknown): Promise<CreditBalance | null> {
    const client = (trx as Database) || this.db;
    const row = await client
      .selectFrom('profiles')
      .select(['credits_balance', 'credits_reserved'])
      .where('id', '=', userId)
      .executeTakeFirst();

    if (!row) return null;

    return {
      credits_balance: Number(row.credits_balance),
      credits_reserved: Number(row.credits_reserved),
    };
  }

  async listLedger(userId: string, limit: number, offset: number): Promise<CreditLedgerEntry[]> {
    const rows = await this.db
      .selectFrom('credit_ledger')
      .select(['id', 'delta', 'balance_after', 'reason', 'created_at'])
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    return rows.map((row) => ({
      id: Number(row.id),
      delta: Number(row.delta),
      balance_after: Number(row.balance_after),
      reason: row.reason as LedgerReason,
      created_at:
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }));
  }

  async listEnabledPackages(): Promise<CreditPackage[]> {
    const rows = await this.db
      .selectFrom('credit_packages')
      .select([
        'id',
        'name',
        'price_egp',
        'base_credits',
        'bonus_pct',
        'total_credits',
        'is_featured',
        'store_product_id_ios',
        'store_product_id_android',
        'sort_order',
      ])
      .where('enabled', '=', true)
      .orderBy('sort_order', 'asc')
      .execute();

    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      price_egp: Number(row.price_egp),
      base_credits: Number(row.base_credits),
      bonus_pct: Number(row.bonus_pct),
      total_credits: Number(row.total_credits),
      is_featured: Boolean(row.is_featured),
      store_product_id_ios: row.store_product_id_ios ?? null,
      store_product_id_android: row.store_product_id_android ?? null,
      sort_order: Number(row.sort_order),
    }));
  }

  async reserve(userId: string, amount: number, tx?: unknown): Promise<string> {
    return this.runInTx(tx, async (client) => {
      const profile = await client
        .selectFrom('profiles')
        .select(['id', 'credits_balance', 'credits_reserved'])
        .where('id', '=', userId)
        .forUpdate()
        .executeTakeFirst();

      if (!profile) {
        throw new ProfileNotFoundError();
      }

      const available = Number(profile.credits_balance) - Number(profile.credits_reserved);
      if (available < amount) {
        throw new InsufficientCreditsError(amount, available);
      }

      await client
        .updateTable('profiles')
        .set({
          credits_reserved: sql`credits_reserved + ${amount}`,
        })
        .where('id', '=', userId)
        .execute();

      const reservation = await client
        .insertInto('credit_reservations')
        .values({
          user_id: userId,
          amount,
          status: 'held',
          expires_at: sql`now() + interval '30 minutes'`,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      return String(reservation.id);
    });
  }

  async settle(
    reservationId: string,
    userId: string,
    actual: number,
    aiActionId: string | null,
    tx: unknown
  ): Promise<number> {
    if (!tx) {
      throw new TransactionRequiredError('settle');
    }

    const client = tx as Database;

    const reservation = await client
      .selectFrom('credit_reservations')
      .select(['id', 'user_id', 'amount', 'status'])
      .where('id', '=', reservationId)
      .where('user_id', '=', userId)
      .where('status', '=', 'held')
      .forUpdate()
      .executeTakeFirst();

    if (!reservation) {
      throw new ReservationNotFoundError();
    }

    const held = Number(reservation.amount);
    const charged = Math.min(actual, held);

    const updatedProfile = await client
      .updateTable('profiles')
      .set({
        credits_reserved: sql`credits_reserved - ${held}`,
        credits_balance: sql`credits_balance - ${charged}`,
      })
      .where('id', '=', userId)
      .returning('credits_balance')
      .executeTakeFirstOrThrow();

    await client
      .updateTable('credit_reservations')
      .set({
        status: 'settled',
        ai_action_id: aiActionId,
      })
      .where('id', '=', reservationId)
      .where('user_id', '=', userId)
      .execute();

    if (charged > 0) {
      await client
        .insertInto('credit_ledger')
        .values({
          user_id: userId,
          delta: -charged,
          balance_after: Number(updatedProfile.credits_balance),
          reason: 'usage',
          ai_action_id: aiActionId,
        })
        .execute();
    }

    return charged;
  }

  async release(reservationId: string, userId?: string, tx?: unknown): Promise<void> {
    await this.runInTx(tx, async (client) => {
      let query = client
        .selectFrom('credit_reservations')
        .select(['id', 'user_id', 'amount', 'status'])
        .where('id', '=', reservationId)
        .where('status', '=', 'held');

      if (userId) {
        query = query.where('user_id', '=', userId);
      }

      const reservation = await query.forUpdate().executeTakeFirst();
      if (!reservation) {
        return;
      }

      const held = Number(reservation.amount);
      const ownerId = String(reservation.user_id);

      await client
        .updateTable('profiles')
        .set({
          credits_reserved: sql`GREATEST(0, credits_reserved - ${held})`,
        })
        .where('id', '=', ownerId)
        .execute();

      await client
        .updateTable('credit_reservations')
        .set({
          status: 'released',
        })
        .where('id', '=', reservationId)
        .where('user_id', '=', ownerId)
        .execute();
    });
  }

  async grant(
    userId: string,
    amount: number,
    reason: LedgerReason,
    tx: unknown,
    options?: GrantCreditsOptions
  ): Promise<number> {
    if (!tx) {
      throw new TransactionRequiredError('grant');
    }

    const client = tx as Database;

    if (amount === 0) {
      const profile = await client
        .selectFrom('profiles')
        .select('credits_balance')
        .where('id', '=', userId)
        .executeTakeFirst();
      if (!profile) {
        throw new ProfileNotFoundError();
      }
      return Number(profile.credits_balance);
    }

    const updatedProfile = await client
      .updateTable('profiles')
      .set({
        credits_balance: sql`credits_balance + ${amount}`,
      })
      .where('id', '=', userId)
      .returning('credits_balance')
      .executeTakeFirst();

    if (!updatedProfile) {
      throw new ProfileNotFoundError();
    }

    const balanceAfter = Number(updatedProfile.credits_balance);

    await client
      .insertInto('credit_ledger')
      .values({
        user_id: userId,
        delta: amount,
        balance_after: balanceAfter,
        reason,
        package_id: options?.packageId ?? null,
        payment_ref: options?.paymentRef ?? null,
        meta: options?.meta ? JSON.stringify(options.meta) : null,
      })
      .execute();

    return balanceAfter;
  }

  async sweepExpiredReservations(tx?: unknown): Promise<SweepResult> {
    return this.runInTx(tx, async (client) => {
      const releasedRows = await sql<{ id: string; user_id: string; amount: number }>`
        UPDATE credit_reservations
           SET status = 'released'
         WHERE status = 'held'
           AND expires_at < now()
        RETURNING id, user_id, amount
      `.execute(client);

      if (releasedRows.rows.length === 0) {
        return { releasedCount: 0, affectedUserIds: [] };
      }

      const amountByUser = new Map<string, number>();
      for (const row of releasedRows.rows) {
        const uid = String(row.user_id);
        amountByUser.set(uid, (amountByUser.get(uid) ?? 0) + Number(row.amount));
      }

      const affectedUserIds = Array.from(amountByUser.keys());
      for (const [uid, releasedAmount] of amountByUser.entries()) {
        await client
          .updateTable('profiles')
          .set({
            credits_reserved: sql`GREATEST(0, credits_reserved - ${releasedAmount})`,
          })
          .where('id', '=', uid)
          .execute();
      }

      return {
        releasedCount: releasedRows.rows.length,
        affectedUserIds,
      };
    });
  }

  async monthlyFreeRefill(tx?: unknown): Promise<number> {
    return this.runInTx(tx, async (client) => {
      const res = await sql<{ user_id: string }>`
        WITH eligible AS (
          SELECT id, credits_balance AS old_balance
            FROM profiles
           WHERE (free_refill_at IS NULL OR free_refill_at < date_trunc('month', CURRENT_DATE)::date)
             AND credits_balance < 100
           FOR UPDATE
        ),
        bumped AS (
          UPDATE profiles p
             SET credits_balance = 100,
                 free_refill_at  = CURRENT_DATE
            FROM eligible e
           WHERE p.id = e.id
           RETURNING p.id, (100 - e.old_balance) AS delta, p.credits_balance AS balance_after
        )
        INSERT INTO credit_ledger (user_id, delta, balance_after, reason)
        SELECT id, delta, balance_after, 'monthly_refill'::ledger_reason
          FROM bumped
        RETURNING user_id
      `.execute(client);

      return res.rows.length;
    });
  }
}
