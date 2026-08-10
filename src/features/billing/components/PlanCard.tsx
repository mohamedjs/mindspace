import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Check, Sparkles } from 'lucide-react-native';
import { Text } from '../../../shared/ui/Text';
import { useTheme } from '../../../shared/theme';
import { clay, shade } from '../../../shared/theme/clay';
import type { SubscriptionPlan } from '../api/billing.api';

interface PlanCardProps {
  plan: SubscriptionPlan;
  isCurrent: boolean;
  disabled?: boolean;
  onPress: (planId: string) => void;
}

/** One plan, priced per month, with what it actually buys in credits. */
export const PlanCard: React.FC<PlanCardProps> = ({ plan, isCurrent, disabled, onPress }) => {
  const { colors, scheme } = useTheme();

  const surface = isCurrent
    ? shade(colors.accent, scheme === 'dark' ? -0.72 : 0.78)
    : shade(colors.surface, -0.05);

  return (
    <TouchableOpacity
      className="mb-3 px-5 py-4"
      style={clay({ color: surface, radius: 22, depth: plan.isFeatured ? 0.9 : 0.5 })}
      activeOpacity={0.85}
      disabled={disabled || isCurrent}
      onPress={() => onPress(plan.id)}
    >
      <View className="flex-row items-center">
        <Text className="text-lg font-bold text-ink">{plan.name}</Text>

        {plan.isFeatured && !isCurrent && (
          <View
            className="ml-2 flex-row items-center rounded-full px-2 py-0.5"
            style={{ backgroundColor: colors.accent }}
          >
            <Sparkles size={10} color={colors.onAccent} strokeWidth={3} />
            <Text className="ml-1 text-[9px] font-bold uppercase" style={{ color: colors.onAccent }}>
              Popular
            </Text>
          </View>
        )}

        {isCurrent && (
          <View className="ml-2 flex-row items-center">
            <Check size={14} color={colors.accent} strokeWidth={3} />
            <Text className="ml-1 text-[10px] font-bold uppercase" style={{ color: colors.accent }}>
              Current
            </Text>
          </View>
        )}

        <View className="flex-1" />

        <Text className="text-lg font-bold text-ink">{plan.priceEgp}</Text>
        <Text className="ml-1 text-xs font-semibold text-muted">EGP/mo</Text>
      </View>

      {Boolean(plan.tagline) && (
        <Text className="mt-0.5 text-xs text-muted">{plan.tagline}</Text>
      )}

      <View className="mt-3 flex-row items-baseline">
        <Text className="text-sm font-bold" style={{ color: colors.accent }}>
          {plan.totalCredits.toLocaleString()} credits
        </Text>
        <Text className="ml-1.5 text-[11px] text-muted">a month</Text>
        {plan.bonusPct > 0 && (
          <Text className="ml-2 text-[11px] font-semibold text-warning">
            +{plan.bonusPct}% bonus
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};
