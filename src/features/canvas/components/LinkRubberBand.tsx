import React from 'react';
import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { useTheme } from '../../../shared/theme';

const AnimatedLine = Animated.createAnimatedComponent(Line);

interface LinkRubberBandProps {
  /** Centre of the note the arrow started from, in world coordinates. */
  source: SharedValue<{ x: number; y: number }>;
  /** Current finger position, in board-relative screen coordinates. */
  pointer: SharedValue<{ x: number; y: number }>;
  active: SharedValue<boolean>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  scale: SharedValue<number>;
  /** False while the drop under the finger would make a cycle. */
  valid: boolean;
}

/**
 * The line that follows your finger while you draw a link.
 *
 * Drawn in *screen* space on top of the board rather than inside the
 * transformed container: the finger position is already screen-space, and
 * world coordinates go negative on a tidied board, which would force the same
 * padded-bounding-box trick NoteConnectors needs. Only the source end has to be
 * projected, and that is one multiply.
 *
 * Everything runs through useAnimatedProps so the line tracks at 60fps without
 * re-rendering the canvas on every frame.
 */
export const LinkRubberBand: React.FC<LinkRubberBandProps> = ({
  source,
  pointer,
  active,
  translateX,
  translateY,
  scale,
  valid,
}) => {
  const { colors } = useTheme();

  const animatedProps = useAnimatedProps(() => {
    const s = scale.value;
    return {
      x1: translateX.value + source.value.x * s,
      y1: translateY.value + source.value.y * s,
      x2: pointer.value.x,
      y2: pointer.value.y,
      opacity: active.value ? 1 : 0,
    };
  });

  return (
    <View className="absolute inset-0" pointerEvents="none">
      <Svg width="100%" height="100%">
        <AnimatedLine
          animatedProps={animatedProps}
          stroke={valid ? colors.accent : colors.warning}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray="8 6"
        />
      </Svg>
    </View>
  );
};
