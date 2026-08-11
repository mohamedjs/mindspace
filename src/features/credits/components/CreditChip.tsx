import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Text } from '../../../shared/ui/Text';
import { useTheme } from '../../../shared/theme';

interface CreditChipProps {
  balance?: number;
  onPress?: () => void;
}

/** Danger red reads the same on both themes; only its tint strength changes. */
const DANGER = '#E53935';
const OK = '#4CAF50';

export const CreditChip: React.FC<CreditChipProps> = ({ balance = 100, onPress }) => {
  const { colors, scheme } = useTheme();
  const isLow = balance < 50;
  const isZero = balance <= 0;

  // A tinted outline rather than a filled dark badge — a fixed dark fill would
  // be an ink blot on the light theme.
  const accentColor = isZero ? DANGER : isLow ? colors.warning : OK;
  const textColor = isZero ? DANGER : isLow ? colors.warning : colors.ink;
  const tintAlpha = scheme === 'dark' ? '22' : '18';

  return (
    <TouchableOpacity
      className="flex-row items-center rounded-full border px-3 py-1.5"
      style={{
        backgroundColor: isZero || isLow ? `${accentColor}${tintAlpha}` : colors.canvas,
        borderColor: isZero || isLow ? accentColor : colors.line,
      }}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View className="mr-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: accentColor }} />
      <Text className="text-[13px] font-semibold" style={{ color: textColor }}>
        {balance}
      </Text>
    </TouchableOpacity>
  );
};
