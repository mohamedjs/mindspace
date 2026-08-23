import React from 'react';
import { View } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../../shared/theme';

const BAR_COUNT = 32;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 90;

interface WaveformProps {
  /** 0..1 live meter level. Driven on the UI thread — never React state. */
  level: SharedValue<number>;
}

function Bar({ level, index }: { level: SharedValue<number>; index: number }) {
  const { colors } = useTheme();
  // Bars further from centre react a little less, giving the classic taper.
  const falloff = 1 - Math.abs(index - BAR_COUNT / 2) / (BAR_COUNT / 2);
  const weight = 0.35 + falloff * 0.65;

  const style = useAnimatedStyle(() => {
    const height = MIN_HEIGHT + level.value * weight * (MAX_HEIGHT - MIN_HEIGHT);
    return { height: withTiming(height, { duration: 80 }) };
  });

  return (
    <Animated.View
      className="mx-0.5 flex-1 rounded-full"
      style={[{ backgroundColor: colors.accent }, style]}
    />
  );
}

export const Waveform: React.FC<WaveformProps> = ({ level }) => {
  return (
    <View
      className="w-full flex-row items-center justify-center"
      style={{ height: MAX_HEIGHT }}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <Bar key={i} level={level} index={i} />
      ))}
    </View>
  );
};
