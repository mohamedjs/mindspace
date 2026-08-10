import React from 'react';
import { View } from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { Text } from '../../../shared/ui/Text';
import { useTheme } from '../../../shared/theme';
import { clay, shade } from '../../../shared/theme/clay';

/** Shown for a day with nothing on it. */
export const FreeDayEmptyState: React.FC = () => {
  const { colors } = useTheme();

  return (
    <View className="flex-1 items-center justify-center px-8 py-20">
      <View
        className="mb-5 h-20 w-20 items-center justify-center"
        style={clay({ color: shade(colors.surface, -0.05), radius: 28, depth: 0.5 })}
      >
        <CalendarDays size={32} color={colors.muted} strokeWidth={1.8} />
      </View>
      <Text className="text-lg font-bold text-ink">You have a free day</Text>
      <Text className="mt-1 text-sm text-muted">Take it easy</Text>
    </View>
  );
};
