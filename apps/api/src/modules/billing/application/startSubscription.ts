import { type Clock, systemClock } from '../../../platform/clock.js';
import type { StartSubscriptionResult } from '../domain/entities.js';
import {
  ActivePaidSubscriptionExistsError,
  MissingBillingParamsError,
  PlanDisabledError,
  PlanNotFoundError,
} from '../domain/errors.js';
import type {
  BillingRepositoryPort,
  EntitlementsPort,
  PaymentProviderRegistryPort,
} from '../domain/ports.js';

export interface StartSubscriptionInput {
  userId: string;
  planId?: string;
  channel?: string;
}

export class StartSubscriptionUseCase {
  constructor(
    private readonly repo: BillingRepositoryPort,
    private readonly providers: PaymentProviderRegistryPort,
    private readonly entitlements: EntitlementsPort,
    private readonly clock: Clock = systemClock
  ) {}

  async execute(input: StartSubscriptionInput): Promise<StartSubscriptionResult> {
    const planId = input.planId?.trim();
    const channel = input.channel?.trim();

    if (!planId || !channel) {
      throw new MissingBillingParamsError('planId and channel are required');
    }

    const plan = await this.repo.findPlanById(planId);
    if (!plan) {
      throw new PlanNotFoundError();
    }
    if (!plan.enabled) {
      throw new PlanDisabledError();
    }

    // Free plan (price_egp === 0): never replace an active paid subscription,
    // and activate immediately with a 30-day period.
    if (plan.price_egp === 0) {
      const hasPaid = await this.repo.hasActivePaidSubscription(input.userId);
      if (hasPaid) {
        throw new ActivePaidSubscriptionExistsError();
      }

      const start = this.clock.now();
      const end = new Date(start.getTime() + 30 * 86_400_000);
      const sub = await this.repo.createFreeSubscription({
        userId: input.userId,
        planId: plan.id,
        start,
        end,
      });

      await this.entitlements.invalidateUser(input.userId);

      return {
        subscriptionId: sub.id,
        free: true,
        plan: {
          id: plan.id,
          name: plan.name,
          priceEgp: 0,
          credits: plan.total_credits,
        },
      };
    }

    // Paid plan: resolve provider first so unknown/unconfigured channels fail before DB writes.
    const provider = this.providers.paymentProviderFor(channel);

    const sub = await this.repo.createPendingSubscription({
      userId: input.userId,
      planId: plan.id,
      channel: provider.channel,
    });

    const reference = `sub_${sub.id.replace(/-/g, '').slice(0, 12)}`;
    const intent = await provider.createCharge({
      userId: input.userId,
      planId: plan.id,
      amountEgp: plan.price_egp,
      reference,
    });

    return {
      subscriptionId: sub.id,
      reference,
      plan: {
        id: plan.id,
        name: plan.name,
        priceEgp: plan.price_egp,
        credits: plan.total_credits,
      },
      intent,
    };
  }
}
