import { useMemo } from 'react';
import { usePlans, useActiveSubscription } from './useBilling';
import { features } from '../../../shared/config/features';
import type { SubscriptionPlan } from '../api/billing.api';

export interface Entitlements {
  /** The plan actually in force, or null while it is still loading. */
  plan: SubscriptionPlan | null;
  /** Can this account record and run the AI pipeline at all? */
  aiEnabled: boolean;
  /** Sticky notes run on the user's own provider key. */
  isByok: boolean;
  /** Longest single recording, in minutes. Zero when AI is off. */
  maxRecordingMinutes: number;
  isLoading: boolean;
}

/**
 * What this account is allowed to do — the single place the app asks.
 *
 * Every AI entry point reads `aiEnabled` from here rather than checking a
 * credit balance. A balance answers "can they afford the next recording"; this
 * answers "is recording part of their plan at all", and conflating the two is
 * how you end up showing a microphone that only fails once it has been tapped.
 *
 * Fails **closed** while loading: no plan yet means no AI yet. The alternative
 * is a microphone that appears for a moment on a Free account and then vanishes.
 */
export function useEntitlements(): Entitlements {
  const { data: plans, isLoading: plansLoading } = usePlans();
  const { data: subscription, isLoading: subLoading } = useActiveSubscription();

  return useMemo(() => {
    const isLoading = plansLoading || subLoading;

    // No subscription is the Free plan, which is a real row now rather than a
    // null to special-case everywhere.
    const plan =
      plans?.find((p) => p.id === subscription?.planId) ??
      plans?.find((p) => p.id === 'free') ??
      null;

    const isByok = Boolean(plan?.isByok) && features.byok;

    return {
      plan,
      aiEnabled: !isLoading && Boolean(plan?.aiEnabled),
      isByok,
      maxRecordingMinutes: plan?.maxRecordingMinutes ?? 0,
      isLoading,
    };
  }, [plans, subscription, plansLoading, subLoading]);
}
