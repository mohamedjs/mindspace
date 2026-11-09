'use client';

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
 * Fails **closed** while loading: no plan yet means no AI yet.
 */
export function useEntitlements(): Entitlements {
  const { data: plans, isLoading: plansLoading } = usePlans();
  const { data: subscription, isLoading: subLoading } = useActiveSubscription();

  return useMemo(() => {
    const isLoading = plansLoading || subLoading;

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
