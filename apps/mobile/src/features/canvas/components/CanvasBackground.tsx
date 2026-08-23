import React from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../../shared/theme';
import { gridScale, wrapToTile } from '../utils/coords';

const GRID_SIZE = 24;

/**
 * How much bigger than the viewport the grid sheet is.
 *
 * The sheet is drawn at `gridScale`, which never goes below 0.5, so three
 * viewports' worth always reaches the screen edges — at any board zoom, right
 * down to the 0.12 floor. Growing this instead of stepping the grid would mean
 * a sheet nine viewports across to cover the same range.
 */
const SHEET = 3;

interface CanvasBackgroundProps {
  /** The same shared values driving the note container's transform. */
  translateX?: SharedValue<number>;
  translateY?: SharedValue<number>;
  scale?: SharedValue<number>;
}

/**
 * Board backdrop: a ruled grid that pans and zooms with the board, plus soft
 * colour orbs that don't.
 *
 * Below half zoom the grid steps to a coarser world spacing rather than
 * shrinking into mush — see `gridScale`. Between 0.5 and the 2.5 maximum it
 * tracks the notes exactly.
 *
 * The grid is the part that has to move — a fixed grid under a moving board
 * reads as the notes sliding over glass rather than the board itself moving,
 * which is the thing n8n and Figma get right. It can't simply be parented to
 * the note container, though: at the minimum zoom that layer would need to be
 * tens of thousands of pixels across to still reach the screen edges, and
 * panning far enough would always run off it.
 *
 * So the grid is drawn once at viewport scale and *wrapped*: the sheet is
 * translated by the pan distance modulo one tile, which is visually identical
 * to translating by the full distance for a repeating pattern, and costs the
 * same at any pan offset. Zoom is a real scale on the sheet, so the tiles grow
 * and shrink exactly like the notes do. `transformOrigin: top left` matches the
 * note container so both layers share one coordinate system.
 *
 * The orbs stay put on purpose — they are ambient light on the viewport, not
 * objects on the board, and scaling them to specks at low zoom would lose the
 * only warmth the dark theme has.
 *
 * Purely decorative: `pointerEvents="none"` keeps the whole thing out of the
 * way of the canvas pan/pinch gestures sitting on top of it.
 */
export const CanvasBackground: React.FC<CanvasBackgroundProps> = ({
  translateX,
  translateY,
  scale,
}) => {
  const { colors, scheme, canvasBackgroundEnabled } = useTheme();
  const { width, height } = useWindowDimensions();
  const isDark = scheme === 'dark';

  const gridStyle = useAnimatedStyle(() => {
    if (!translateX || !translateY || !scale) return {};

    const s = gridScale(scale.value);
    const tile = GRID_SIZE * s;

    return {
      transform: [
        { translateX: wrapToTile(translateX.value, tile) },
        { translateY: wrapToTile(translateY.value, tile) },
        { scale: s },
      ],
    };
  });

  if (!canvasBackgroundEnabled) return null;

  return (
    <View className="absolute inset-0" pointerEvents="none">
      {/* Ambient orbs, fixed to the viewport. Under the grid so the rules read
          on top of the glow, exactly as before. */}
      <Svg width="100%" height="100%" style={{ position: 'absolute' }}>
        <Defs>
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

        <Circle cx="15%" cy="18%" r="180" fill="url(#orbA)" />
        <Circle cx="88%" cy="42%" r="210" fill="url(#orbB)" />
        <Circle cx="35%" cy="82%" r="240" fill="url(#orbC)" />
      </Svg>

      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            width: width * SHEET,
            height: height * SHEET,
            transformOrigin: 'top left',
          },
          gridStyle,
        ]}
      >
        <Svg width="100%" height="100%">
          <Defs>
            <Pattern id="grid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
              {/* Horizontal rule, then vertical — the two gradients of the CSS version. */}
              <Rect x="0" y="0" width={GRID_SIZE} height="1" fill={colors.grid} />
              <Rect x="0" y="0" width="1" height={GRID_SIZE} fill={colors.grid} />
            </Pattern>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#grid)" />
        </Svg>
      </Animated.View>
    </View>
  );
};
