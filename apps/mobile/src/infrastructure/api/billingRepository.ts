import type {
  ActiveSubscription,
  ConfirmSubscriptionResult,
  PaymentChannel,
  ProviderOption,
  StartSubscriptionResult,
  SubscriptionPlan,
} from '../../core/domain';
import type { BillingRepository } from '../../core/ports';
import { apiFetch } from './client';
import { toPlan, toSubscription } from './mappers';

export const apiBillingRepository: BillingRepository = {
  async listPlans(): Promise<SubscriptionPlan[]> {
    const data = await apiFetch<Record<string, unknown>[]>('/billing/plans');
    return (data ?? []).map(toPlan);
  },

  async getActiveSubscription(): Promise<ActiveSubscription | null> {
    try {
      const data = await apiFetch<Record<string, unknown>>('/billing/subscription');
      return data ? toSubscription(data) : null;
    } catch {
      return null;
    }
  },

  async listPaymentProviders(): Promise<ProviderOption[]> {
    const data = await apiFetch<ProviderOption[]>('/billing/providers');
    return data ?? [];
  },

  async start(planId: string, channel?: PaymentChannel): Promise<StartSubscriptionResult> {
    return apiFetch<StartSubscriptionResult>('/billing/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ planId, channel: channel ?? null }),
    });
  },

  async confirm(subscriptionId: string, receipt: unknown): Promise<ConfirmSubscriptionResult> {
    return apiFetch<ConfirmSubscriptionResult>(`/billing/subscriptions/${subscriptionId}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ receipt }),
    });
  },
};
