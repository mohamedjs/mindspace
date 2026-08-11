import type {
  ActiveSubscription,
  ChargeIntent,
  ConfirmSubscriptionResult as ConfirmResult,
  PaymentChannel,
  ProviderOption,
  StartSubscriptionResult as StartResult,
  SubscriptionPlan,
} from '../../../core/domain';

export type {
  ActiveSubscription,
  ChargeIntent,
  ConfirmResult,
  PaymentChannel,
  ProviderOption,
  StartResult,
  SubscriptionPlan,
};



/**
 * Roughly how long you can talk on a given number of credits.
 *
 * Derived from what a recording actually costs: transcription is 6 credits a
 * minute and extraction is a flat 8 per recording, so the real rate depends on
 * how long each recording is. Assuming a typical few-minute recording lands
 * around 9 credits a minute — deliberately conservative, since advertising
 * more hours than a plan delivers is a refund conversation.
 */
const CREDITS_PER_RECORDED_MINUTE = 9;

export function creditsToRecordingLabel(credits: number): string {
  const minutes = Math.floor(credits / CREDITS_PER_RECORDED_MINUTE);
  if (minutes < 90) return `about ${minutes} min of talking`;
  return `about ${(minutes / 60).toFixed(1).replace(/\.0$/, '')} hours of talking`;
}

import { supabaseContainer } from '../../../infrastructure/container';

const billing = supabaseContainer.billing;

export const fetchPlans = () => billing.listPlans();
export const fetchActiveSubscription = () => billing.getActiveSubscription();
export const fetchProviders = () => billing.listPaymentProviders();
export const startSubscription = (planId: string, channel?: PaymentChannel) =>
  billing.start(planId, channel);
export const confirmSubscription = (subscriptionId: string, receipt: unknown) =>
  billing.confirm(subscriptionId, receipt);
