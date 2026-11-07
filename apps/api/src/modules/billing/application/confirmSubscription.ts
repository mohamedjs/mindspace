import { type Clock, systemClock } from '../../../platform/clock.js';
import type { ConfirmSubscriptionResult } from '../domain/entities.js';
import {
  AmountMismatchError,
  MissingBillingParamsError,
  PaymentNotVerifiedError,
  PlanNotFoundError,
  SubscriptionNotFoundError,
} from '../domain/errors.js';
import type {
  BillingCreditsPort,
  BillingRepositoryPort,
  ConfirmStepHookPort,
  EntitlementsPort,
  PaymentProviderRegistryPort,
} from '../domain/ports.js';

export interface ConfirmSubscriptionInput {
  userId: string;
  subscriptionId: string;
  receipt?: unknown;
}

export class ConfirmSubscriptionUseCase {
  private stepHook?: ConfirmStepHookPort | null;

  constructor(
    private readonly repo: BillingRepositoryPort,
    private readonly providers: PaymentProviderRegistryPort,
    private readonly credits: BillingCreditsPort,
    private readonly entitlements: EntitlementsPort,
    private readonly clock: Clock = systemClock,
    stepHook?: ConfirmStepHookPort | null
  ) {
    this.stepHook = stepHook;
  }

  setStepHook(hook: ConfirmStepHookPort | null): void {
    this.stepHook = hook;
  }

  async execute(input: ConfirmSubscriptionInput): Promise<ConfirmSubscriptionResult> {
    const subscriptionId = input.subscriptionId?.trim();
    if (!subscriptionId) {
      throw new MissingBillingParamsError('subscriptionId is required');
    }

    const sub = await this.repo.findSubscriptionForUser(subscriptionId, input.userId);
    if (!sub) {
      throw new SubscriptionNotFoundError();
    }

    if (sub.status === 'active') {
      return {
        subscriptionId: sub.id,
        status: 'active',
        creditsGranted: 0,
        alreadyActive: true,
      };
    }

    const plan = await this.repo.findPlanById(sub.plan_id);
    if (!plan) {
      throw new PlanNotFoundError();
    }

    const provider = this.providers.paymentProviderFor(sub.channel);
    const reference = `sub_${sub.id.replace(/-/g, '').slice(0, 12)}`;

    const check = await provider.verify({
      reference,
      amountEgp: plan.price_egp,
      receipt: input.receipt,
    });

    if (check.status === 'failed') {
      throw new PaymentNotVerifiedError(check.reason);
    }

    if (check.amountEgp !== plan.price_egp) {
      throw new AmountMismatchError();
    }

    const now = this.clock.now();
    const periodEnd = new Date(now.getTime() + 30 * 86_400_000);

    const result = await this.repo.runInTransaction<ConfirmSubscriptionResult>(async (tx) => {
      const lockedSub = await this.repo.findSubscriptionForUser(
        subscriptionId,
        input.userId,
        tx,
        true
      );
      if (!lockedSub) {
        throw new SubscriptionNotFoundError();
      }

      if (lockedSub.status === 'active') {
        return {
          subscriptionId: lockedSub.id,
          status: 'active',
          creditsGranted: 0,
          alreadyActive: true,
        };
      }

      await this.stepHook?.onBeforeInsertPayment?.(tx);

      const paymentInsert = await this.repo.insertVerifiedPayment(
        {
          userId: input.userId,
          subscriptionId: lockedSub.id,
          amountEgp: check.amountEgp,
          channel: lockedSub.channel,
          externalRef: check.externalRef,
          rawReceipt: check.raw ?? input.receipt ?? null,
          verifiedAt: now,
        },
        tx
      );

      if (!paymentInsert.inserted) {
        throw new PaymentNotVerifiedError('Receipt external reference has already been used');
      }

      await this.stepHook?.onBeforeGrantCredits?.(tx);

      let creditsGranted = 0;
      if (plan.total_credits > 0) {
        await this.credits.grant(input.userId, plan.total_credits, 'purchase', tx, {
          paymentRef: check.externalRef,
          packageId: null,
          meta: {
            subscription_id: lockedSub.id,
            plan_id: plan.id,
            channel: lockedSub.channel,
          },
        });
        creditsGranted = plan.total_credits;
      }

      await this.stepHook?.onBeforeActivateSubscription?.(tx);

      await this.repo.activateSubscription(
        {
          subscriptionId: lockedSub.id,
          userId: input.userId,
          externalRef: check.externalRef,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
        tx
      );

      return {
        subscriptionId: lockedSub.id,
        status: 'active',
        plan: {
          id: plan.id,
          name: plan.name,
        },
        creditsGranted,
      };
    });

    await this.entitlements.invalidateUser(input.userId);

    return result;
  }
}
