import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../../shared/theme';

const GRID_SIZE = 24;

/**
 * Board backdrop: a faint ruled grid, plus soft colour orbs on the dark theme.
 *
 * The equivalent on the web is two stacked `linear-gradient`s, but React Native
 * has no CSS gradient backgrounds — so the grid is an SVG `<Pattern>` of two
 * 1px lines tiled across the surface, which renders identically on iOS,
 * Android and web. The orbs are radial gradients rather than blurred circles
 * because SVG filter support is uneven across react-native-svg backends.
 *
 * Purely decorative: `pointerEvents="none"` keeps it out of the way of the
 * canvas pan/pinch gestures sitting on top of it.
 */
export const CanvasBackground: React.FC = () => {
  const { colors, scheme } = useTheme();
  const isDark = scheme === 'dark';

  return (
    <View className="absolute inset-0" pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern
            id="grid"
            width={GRID_SIZE}
            height={GRID_SIZE}
            patternUnits="userSpaceOnUse"
          >
            {/* Horizontal rule, then vertical — the two gradients of the CSS version. */}
            <Rect x="0" y="0" width={GRID_SIZE} height="1" fill={colors.grid} />
            <Rect x="0" y="0" width="1" height={GRID_SIZE} fill={colors.grid} />
          </Pattern>

          <RadialGradient id="orbA" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.accent} stopOpacity={isDark ? 0.16 : 0.1} />
            <Stop offset="1" stopColor={colors.accent} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="orbB" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#B388FF" stopOpacity={isDark ? 0.13 : 0.08} />
            <Stop offset="1" stopColor="#B388FF" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="orbC" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#4DD0E1" stopOpacity={isDark ? 0.1 : 0.07} />
            <Stop offset="1" stopColor="#4DD0E1" stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* Orbs sit under the grid so the rules read on top of the glow. */}
        <Circle cx="15%" cy="18%" r="180" fill="url(#orbA)" />
        <Circle cx="88%" cy="42%" r="210" fill="url(#orbB)" />
        <Circle cx="35%" cy="82%" r="240" fill="url(#orbC)" />

        <Rect x="0" y="0" width="100%" height="100%" fill="url(#grid)" />
      </Svg>
    </View>
  );
};
