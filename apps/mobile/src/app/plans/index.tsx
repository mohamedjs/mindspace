import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { ChevronLeft } from 'lucide-react-native';
import { Text } from '../../shared/ui/Text';
import { useTheme } from '../../shared/theme';
import { clay } from '../../shared/theme/clay';
import { features } from '../../shared/config/features';
import { WebView } from 'react-native-webview';
import { FONTS } from '../../shared/theme/fonts';
import { buildPlansPage } from '../../features/billing/components/plansPage';
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

  const { data: allPlans, isLoading } = usePlans();
  // "Your AI" stays hidden until a live key has actually been round-tripped
  // against each provider — see shared/config/features.
  const plans = features.byok ? allPlans : allPlans?.filter((p) => !p.isByok);
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
          Toast.show({
            type: 'success',
            text1: result.alreadyActive ? 'Already active' : 'You are subscribed',
            text2: result.creditsGranted
              ? `${result.creditsGranted.toLocaleString()} credits added.`
              : 'Add your API key in Settings to start using it.',
          });
        },
        onError: (err) =>
          Toast.show({ type: 'error', text1: 'Could not activate', text2: err.message }),
        onSettled: () => setBusyChannel(null),
      }
    );

  /** A free plan has nothing to pay, so skip the payment sheet entirely. */
  const handleChoosePlan = (planId: string) => {
    const plan = plans?.find((p) => p.id === planId);
    if (plan?.priceEgp === 0) activate(planId);
    else setPickingPlanId(planId);
  };

  const { handDrawnEnabled } = useTheme();
  const pageHtml = useMemo(
    () =>
      buildPlansPage({
        plans: plans ?? [],
        subscription: subscription ?? null,
        colors,
        fontFamily: handDrawnEnabled ? FONTS.hand : FONTS.arabic,
      }),
    [plans, subscription, colors, handDrawnEnabled]
  );

  const handlePick = (channel: PaymentChannel) => {
    if (!pickingPlanId) return;
    setBusyChannel(channel);
    activate(pickingPlanId, channel);
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

      {isLoading || !plans ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : features.webviewPlans ? (
        /*
          The page is generated locally and handed over as a string — no server,
          no network, no offline failure. It cannot navigate anywhere and never
          sees a token; the only thing it can do is post back a plan id, which
          goes through exactly the same handler the native cards use.
        */
        <WebView
          originWhitelist={['about:blank']}
          source={{ html: pageHtml }}
          style={{ flex: 1, backgroundColor: colors.board }}
          showsVerticalScrollIndicator={false}
          javaScriptEnabled
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={(req) => req.url === 'about:blank'}
          onMessage={(event) => {
            try {
              const msg = JSON.parse(event.nativeEvent.data);
              if (msg?.type === 'choose-plan' && typeof msg.planId === 'string') {
                handleChoosePlan(msg.planId);
              }
            } catch {
              // A malformed message is not worth surfacing; the page is ours.
            }
          }}
        />
      ) : (
        <ScrollView className="px-5" contentContainerStyle={{ paddingVertical: 20 }}>
          <Text className="mb-1 text-2xl font-bold text-ink">Keep thinking out loud</Text>
          <Text className="mb-6 text-sm text-muted">
            Credits arrive every month, and buy more per pound the higher you go. Cancel whenever.
          </Text>

          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrent={subscription?.planId === plan.id}
              disabled={subscribe.isPending}
              onPress={handleChoosePlan}
            />
          ))}

          {subscription?.currentPeriodEnd && (
            <Text className="mt-2 text-center text-xs text-muted">
              Your credits last renewed for the period ending{' '}
              {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.
            </Text>
          )}
        </ScrollView>
      )}

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
