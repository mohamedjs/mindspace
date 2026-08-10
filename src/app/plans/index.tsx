import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { ChevronLeft } from 'lucide-react-native';
import { Text } from '../../shared/ui/Text';
import { useTheme } from '../../shared/theme';
import { clay } from '../../shared/theme/clay';
import { PlanCard } from '../../features/billing/components/PlanCard';
import { PaymentMethodSheet } from '../../features/billing/components/PaymentMethodSheet';
import {
  useActiveSubscription,
  usePaymentProviders,
  usePlans,
  useSubscribe,
} from '../../features/billing/hooks/useBilling';
import type { PaymentChannel } from '../../features/billing/api/billing.api';

export default function PlansScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const { data: plans, isLoading } = usePlans();
  const { data: subscription } = useActiveSubscription();
  const { data: providers } = usePaymentProviders();
  const subscribe = useSubscribe();

  const [pickingPlanId, setPickingPlanId] = useState<string | null>(null);
  const [busyChannel, setBusyChannel] = useState<PaymentChannel | null>(null);

  const pickingPlan = plans?.find((p) => p.id === pickingPlanId) ?? null;

  const handlePick = (channel: PaymentChannel) => {
    if (!pickingPlanId) return;
    setBusyChannel(channel);

    subscribe.mutate(
      { planId: pickingPlanId, channel },
      {
        onSuccess: (result) => {
          setPickingPlanId(null);
          Toast.show({
            type: 'success',
            text1: result.alreadyActive ? 'Already active' : 'You are subscribed',
            text2: result.creditsGranted
              ? `${result.creditsGranted.toLocaleString()} credits added.`
              : 'Nothing was charged twice.',
          });
        },
        onError: (err) =>
          Toast.show({ type: 'error', text1: 'Payment did not go through', text2: err.message }),
        onSettled: () => setBusyChannel(null),
      }
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-board">
      <View
        className="z-30 mx-3 mt-2 flex-row items-center px-4 py-3"
        style={clay({ color: colors.surface, radius: 24 })}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} className="mr-2">
          <ChevronLeft size={24} color={colors.ink} strokeWidth={3} />
        </TouchableOpacity>
        <Text className="ml-3 text-xl font-bold text-ink">Plans</Text>
      </View>

      <ScrollView className="px-5" contentContainerStyle={{ paddingVertical: 20 }}>
        <Text className="mb-1 text-2xl font-bold text-ink">Keep thinking out loud</Text>
        <Text className="mb-6 text-sm text-muted">
          Credits arrive every month, and buy more per pound the higher you go. Cancel whenever.
        </Text>

        {isLoading && <ActivityIndicator color={colors.accent} />}

        {plans?.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrent={subscription?.planId === plan.id}
            disabled={subscribe.isPending}
            onPress={setPickingPlanId}
          />
        ))}

        {subscription?.currentPeriodEnd && (
          <Text className="mt-2 text-center text-xs text-muted">
            Your credits last renewed for the period ending{' '}
            {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.
          </Text>
        )}
      </ScrollView>

      <PaymentMethodSheet
        visible={Boolean(pickingPlanId)}
        plan={pickingPlan}
        providers={providers}
        busyChannel={busyChannel}
        onPick={handlePick}
        onClose={() => !busyChannel && setPickingPlanId(null)}
      />
    </SafeAreaView>
  );
}
