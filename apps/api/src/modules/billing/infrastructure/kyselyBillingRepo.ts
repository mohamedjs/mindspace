import { type Kysely, type Transaction, sql } from 'kysely';
import type { Database } from '../../../platform/db.js';
import type {
  ActiveSubscriptionOut,
  ExpireSubscriptionsResult,
  PaymentChannel,
  Subscription,
  SubscriptionPlan,
  SubscriptionPlanOut,
  SubscriptionStatus,
} from '../domain/entities.js';
import {
  PaymentRecordFailedError,
  SubscriptionCreateFailedError,
} from '../domain/errors.js';
import type { BillingRepositoryPort } from '../domain/ports.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toIsoOrNull(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

function mapSubscriptionRow(row: Record<string, unknown>): Subscription {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    plan_id: String(row.plan_id),
    status: row.status as SubscriptionStatus,
    channel: row.channel as PaymentChannel,
    external_ref: row.external_ref ? String(row.external_ref) : null,
    current_period_start: toIsoOrNull(row.current_period_start),
    current_period_end: toIsoOrNull(row.current_period_end),
    created_at:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    cancelled_at: toIsoOrNull(row.cancelled_at),
  };
}

export class KyselyBillingRepository implements BillingRepositoryPort {
  constructor(private readonly db: Database) {}

  private executor(tx?: unknown): Kysely<any> | Transaction<any> {
    return (tx as Transaction<any> | undefined) ?? this.db;
  }

  async listEnabledPlans(): Promise<SubscriptionPlanOut[]> {
    const rows = await this.db
      .selectFrom('subscription_plans')
      .select([
        'id',
        'name',
        'tagline',
        'price_egp',
        'total_credits',
        'bonus_pct',
        'is_featured',
        'max_recording_minutes',
        'is_byok',
        'ai_enabled',
      ])
      .where('enabled', '=', true)
      .orderBy('sort_order', 'asc')
      .execute();

    return rows.map((r: any) => ({
      id: String(r.id),
      name: String(r.name),
      tagline: r.tagline !== null && r.tagline !== undefined ? String(r.tagline) : null,
      price_egp: Number(r.price_egp),
      total_credits: Number(r.total_credits),
      bonus_pct: Number(r.bonus_pct),
      is_featured: Boolean(r.is_featured),
      max_recording_minutes: Number(r.max_recording_minutes),
      is_byok: Boolean(r.is_byok),
      ai_enabled: Boolean(r.ai_enabled),
    }));
  }

  async findPlanById(planId: string, tx?: unknown): Promise<SubscriptionPlan | null> {
    const exec = this.executor(tx);
    const row = await exec
      .selectFrom('subscription_plans')
      .select([
        'id',
        'name',
        'tagline',
        'price_egp',
        'base_credits',
        'bonus_pct',
        'total_credits',
        'is_featured',
        'enabled',
        'sort_order',
        'max_recording_minutes',
        'is_byok',
        'ai_enabled',
      ])
      .where('id', '=', planId)
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: String(row.id),
      name: String(row.name),
      tagline: row.tagline !== null && row.tagline !== undefined ? String(row.tagline) : null,
      price_egp: Number(row.price_egp),
      base_credits: Number(row.base_credits),
      bonus_pct: Number(row.bonus_pct),
      total_credits: Number(row.total_credits),
      is_featured: Boolean(row.is_featured),
      enabled: Boolean(row.enabled),
      sort_order: Number(row.sort_order),
      max_recording_minutes: Number(row.max_recording_minutes),
      is_byok: Boolean(row.is_byok),
      ai_enabled: Boolean(row.ai_enabled),
    };
  }

  async getActiveSubscription(
    userId: string,
    tx?: unknown
  ): Promise<ActiveSubscriptionOut | null> {
    const exec = this.executor(tx);
    const res = await sql<Record<string, unknown>>`
      SELECT id, plan_id, status, channel, current_period_end
      FROM public.subscriptions
      WHERE user_id = ${userId}::uuid
        AND status = 'active'
        AND (current_period_end IS NULL OR current_period_end > now())
      ORDER BY created_at DESC
      LIMIT 1
    `.execute(exec);

    const row = res.rows[0];
    if (!row) return null;

    return {
      id: String(row.id),
      plan_id: String(row.plan_id),
      status: row.status as SubscriptionStatus,
      channel: row.channel as PaymentChannel,
      current_period_end: toIsoOrNull(row.current_period_end),
    };
  }

  async hasActivePaidSubscription(userId: string, tx?: unknown): Promise<boolean> {
    const exec = this.executor(tx);
    const res = await sql<{ id: string }>`
      SELECT s.id
      FROM public.subscriptions s
      JOIN public.subscription_plans p ON p.id = s.plan_id
      WHERE s.user_id = ${userId}::uuid
        AND s.status = 'active'
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
        AND p.price_egp > 0
      LIMIT 1
    `.execute(exec);

    return res.rows.length > 0;
  }

  async findSubscriptionForUser(
    subscriptionId: string,
    userId: string,
    tx?: unknown,
    forUpdate?: boolean
  ): Promise<Subscription | null> {
    if (!UUID_REGEX.test(subscriptionId)) {
      return null;
    }

    const exec = this.executor(tx);
    let query = exec
      .selectFrom('subscriptions')
      .selectAll()
      .where('id', '=', subscriptionId)
      .where('user_id', '=', userId);

    if (forUpdate) {
      query = query.forUpdate();
    }

    const row = await query.executeTakeFirst();
    if (!row) return null;
    return mapSubscriptionRow(row as Record<string, unknown>);
  }

  async createFreeSubscription(input: {
    userId: string;
    planId: string;
    start: Date;
    end: Date;
  }): Promise<Subscription> {
    const row = await this.db
      .insertInto('subscriptions')
      .values({
        user_id: input.userId,
        plan_id: input.planId,
        status: 'active',
        channel: 'test_pay',
        external_ref: 'free',
        current_period_start: input.start,
        current_period_end: input.end,
      })
      .returningAll()
      .executeTakeFirst();

    if (!row) {
      throw new SubscriptionCreateFailedError();
    }
    return mapSubscriptionRow(row as Record<string, unknown>);
  }

  async createPendingSubscription(input: {
    userId: string;
    planId: string;
    channel: PaymentChannel;
  }): Promise<Subscription> {
    const row = await this.db
      .insertInto('subscriptions')
      .values({
        user_id: input.userId,
        plan_id: input.planId,
        status: 'pending',
        channel: input.channel,
      })
      .returningAll()
      .executeTakeFirst();

    if (!row) {
      throw new SubscriptionCreateFailedError();
    }
    return mapSubscriptionRow(row as Record<string, unknown>);
  }

  async insertVerifiedPayment(
    input: {
      userId: string;
      subscriptionId: string;
      amountEgp: number;
      channel: PaymentChannel;
      externalRef: string;
      rawReceipt: unknown;
      verifiedAt: Date;
    },
    tx: unknown
  ): Promise<{ inserted: boolean; paymentId: string | null }> {
    const exec = this.executor(tx);
    try {
      const res = await sql<{ id: string }>`
        INSERT INTO public.payments (
          user_id,
          subscription_id,
          package_id,
          amount_egp,
          channel,
          status,
          external_ref,
          raw_receipt,
          verified_at
        ) VALUES (
          ${input.userId}::uuid,
          ${input.subscriptionId}::uuid,
          NULL,
          ${input.amountEgp},
          ${input.channel},
          'verified',
          ${input.externalRef},
          ${JSON.stringify(input.rawReceipt ?? null)}::jsonb,
          ${input.verifiedAt}
        )
        ON CONFLICT (channel, external_ref) DO NOTHING
        RETURNING id
      `.execute(exec);

      const paymentId = res.rows[0]?.id ?? null;
      return { inserted: res.rows.length > 0, paymentId };
    } catch (err) {
      throw new PaymentRecordFailedError(
        err instanceof Error ? err.message : 'Failed to record payment'
      );
    }
  }

  async activateSubscription(
    input: {
      subscriptionId: string;
      userId: string;
      externalRef: string;
      currentPeriodStart: Date;
      currentPeriodEnd: Date;
    },
    tx: unknown
  ): Promise<void> {
    const exec = this.executor(tx);
    await exec
      .updateTable('subscriptions')
      .set({
        status: 'active',
        external_ref: input.externalRef,
        current_period_start: input.currentPeriodStart,
        current_period_end: input.currentPeriodEnd,
      })
      .where('id', '=', input.subscriptionId)
      .where('user_id', '=', input.userId)
      .execute();
  }

  async expireDueSubscriptions(now?: Date, tx?: unknown): Promise<ExpireSubscriptionsResult> {
    const exec = this.executor(tx);
    const cutoff = now ?? new Date();
    const res = await sql<{ user_id: string }>`
      UPDATE public.subscriptions
      SET status = 'expired'
      WHERE status = 'active'
        AND current_period_end IS NOT NULL
        AND current_period_end <= ${cutoff}
      RETURNING user_id
    `.execute(exec);

    const affectedUserIds = Array.from(new Set(res.rows.map((r) => String(r.user_id))));
    return {
      expiredCount: res.rows.length,
      affectedUserIds,
    };
  }

  async runInTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(async (tx) => fn(tx));
  }
}
