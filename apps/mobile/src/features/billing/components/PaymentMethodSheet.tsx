import React from 'react';
import { ActivityIndicator, Modal, Pressable, TouchableOpacity, View } from 'react-native';
import { Apple, FlaskConical, Smartphone, Wallet, type LucideIcon } from 'lucide-react-native';
import { Text } from '../../../shared/ui/Text';
import { useTheme } from '../../../shared/theme';
import { clay, claySurface, shade } from '../../../shared/theme/clay';
import type { PaymentChannel, ProviderOption, SubscriptionPlan } from '../api/billing.api';

interface PaymentMethodSheetProps {
  visible: boolean;
  plan: SubscriptionPlan | null;
  providers: ProviderOption[] | undefined;
  busyChannel: PaymentChannel | null;
  onPick: (channel: PaymentChannel) => void;
  onClose: () => void;
}

const CHANNEL_ICON: Record<PaymentChannel, LucideIcon> = {
  google_pay: Smartphone,
  apple_pay: Apple,
  instapay: Wallet,
  test_pay: FlaskConical,
};

/** How to pay. Channels this deployment has no credentials for stay visible but dead. */
export const PaymentMethodSheet: React.FC<PaymentMethodSheetProps> = ({
  visible,
  plan,
  providers,
  busyChannel,
  onPick,
  onClose,
}) => {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: colors.scrim }}
        onPress={onClose}
      >
        <Pressable
          className="px-5 pb-10 pt-4"
          style={[claySurface(colors, 32), { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View
            className="mb-5 h-1.5 w-12 self-center rounded-full"
            style={{ backgroundColor: shade(colors.surface, -0.18) }}
          />

          <Text className="text-lg font-bold text-ink">How would you like to pay?</Text>
          {plan && (
            <Text className="mb-5 mt-0.5 text-xs text-muted">
              {plan.name} · {plan.priceEgp} EGP a month ·{' '}
              {plan.totalCredits.toLocaleString()} credits
            </Text>
          )}

          {!providers && <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />}

          {providers?.map((provider) => {
            const Icon = CHANNEL_ICON[provider.channel];
            const busy = busyChannel === provider.channel;
            const usable = provider.isConfigured && !busyChannel;

            return (
              <TouchableOpacity
                key={provider.channel}
                className="mb-2.5 flex-row items-center px-4 py-3.5"
                style={clay({
                  color: shade(colors.surface, -0.05),
                  radius: 18,
                  depth: provider.isConfigured ? 0.6 : 0.2,
                })}
                activeOpacity={0.85}
                disabled={!usable}
                onPress={() => onPick(provider.channel)}
              >
                <Icon
                  size={20}
                  color={provider.isConfigured ? colors.ink : colors.muted}
                  strokeWidth={2.2}
                />
                <View className="ml-3 flex-1">
                  <Text
                    className="text-base font-semibold"
                    style={{ color: provider.isConfigured ? colors.ink : colors.muted }}
                  >
                    {provider.displayName}
                  </Text>
                  {!provider.isConfigured && (
                    <Text className="mt-0.5 text-[11px] text-muted">Not available yet</Text>
                  )}
                </View>
                {busy && <ActivityIndicator size="small" color={colors.accent} />}
              </TouchableOpacity>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
};
