import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Text } from '../../shared/ui/Text';
import { ThemePreference, useTheme } from './index';
import { clay, shade } from './clay';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Auto' },
];

/** Segmented light / dark / auto control. */
export const ThemeToggle: React.FC = () => {
  const { preference, setPreference, colors } = useTheme();

  return (
    <View
      className="flex-row p-1.5"
      style={clay({ color: shade(colors.surface, -0.06), radius: 20, pressed: true })}
    >
      {OPTIONS.map((option) => {
        const isActive = preference === option.value;
        return (
          <TouchableOpacity
            key={option.value}
            className="flex-1 items-center py-2"
            style={isActive ? clay({ color: colors.accent, radius: 15, depth: 0.7 }) : undefined}
            onPress={() => setPreference(option.value)}
            activeOpacity={0.8}
          >
            <Text
              className="text-sm font-semibold"
              style={{ color: isActive ? colors.onAccent : colors.muted }}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};
