'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronLeft } from 'lucide-react';
import { useTheme } from '@/shared/theme';
import { clay } from '@/shared/theme/clay';
import { PlanCard } from '@/features/billing/components/PlanCard';
import { PaymentMethodSheet } from '@/features/billing/components/PaymentMethodSheet';
import {
  useActiveSubscription,
  usePaymentProviders,
  usePlans,
  useSubscribe,
} from '@/features/billing/hooks/useBilling';
import type { PaymentChannel } from '@/features/billing/api/billing.api';

export default function PlansPage() {
  const router = useRouter();
  const { colors } = useTheme();

  const { data: plans, isLoading } = usePlans();
  const { data: subscription } = useActiveSubscription();
  const { data: providers } = usePaymentProviders();
  const subscribe = useSubscribe();

  const [pickingPlanId, setPickingPlanId] = useState<string | null>(null);
  const [busyChannel, setBusyChannel] = useState<PaymentChannel | null>(null);

  const pickingPlan = plans?.find((p) => p.id === pickingPlanId) ?? null;

  const activate = (planId: string, channel?: PaymentChannel) =>
    subscribe.mutate(
      { planId, channel },
      {
        onSuccess: (result) => {
          setPickingPlanId(null);
          toast.success(result.alreadyActive ? 'Already active' : 'You are subscribed', {
            description: result.creditsGranted
              ? `${result.creditsGranted.toLocaleString()} credits added.`
              : 'Add your API key in Settings to start using it.',
          });
        },
        onError: (err) =>
          toast.error('Could not activate', { description: err.message }),
        onSettled: () => setBusyChannel(null),
      }
    );

  const handleChoosePlan = (planId: string) => {
    const plan = plans?.find((p) => p.id === planId);
    if (plan?.priceEgp === 0) activate(planId);
    else setPickingPlanId(planId);
  };

  const handlePick = (channel: PaymentChannel) => {
    if (!pickingPlanId) return;
    setBusyChannel(channel);
    activate(pickingPlanId, channel);
  };

  return (
    <div className="flex flex-col flex-1 min-h-screen bg-board overflow-y-auto">
      <div className="flex flex-col flex-1 max-w-2xl w-full mx-auto pb-12">
        <header
          className="z-30 mx-3 mt-2 flex flex-row items-center px-4 py-3"
          style={clay({ color: colors.surface, radius: 24 })}
        >
          <button
            type="button"
            onClick={() => router.back()}
            className="mr-2 cursor-pointer border-0 bg-transparent text-ink lg:hidden"
            aria-label="Back"
          >
            <ChevronLeft size={24} color={colors.ink} strokeWidth={3} />
          </button>
          <h1 className="ml-2 text-xl font-bold text-ink">Plans</h1>
        </header>

        <div className="px-5 py-5">
          <h2 className="text-2xl font-bold text-ink mb-1">Keep thinking out loud</h2>
          <p className="mb-6 text-sm text-muted">
            Credits arrive every month, and buy more per pound the higher you go. Cancel whenever.
          </p>

          {isLoading && (
            <div className="py-8 text-center text-xs text-muted animate-pulse">Loading plans…</div>
          )}

          {plans?.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrent={subscription?.planId === plan.id}
              disabled={subscribe.isPending}
              onPress={handleChoosePlan}
            />
          ))}

          {subscription?.currentPeriodEnd && (
            <div className="mt-4 text-center text-xs text-muted">
              Your credits last renewed for the period ending{' '}
              {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.
            </div>
          )}
        </div>

        <PaymentMethodSheet
          visible={Boolean(pickingPlanId)}
          plan={pickingPlan}
          providers={providers}
          busyChannel={busyChannel}
          onPick={handlePick}
          onClose={() => !busyChannel && setPickingPlanId(null)}
        />
      </div>
    </div>
  );
}
