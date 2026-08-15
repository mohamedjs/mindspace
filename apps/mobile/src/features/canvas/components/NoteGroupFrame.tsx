import React, { useEffect, useState } from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { Text } from '../../../shared/ui/Text';
import { useTheme } from '../../../shared/theme';
import { shade } from '../../../shared/theme/clay';
import { X, GripHorizontal } from 'lucide-react-native';
import type { NoteGroup } from '../api/groups.api';

interface NoteGroupFrameProps {
  group: NoteGroup;
  onRename?: (id: string, title: string) => void;
  onMoveStart?: (id: string) => void;
  onMoveEnd?: (id: string, x: number, y: number) => void;
  onResize?: (id: string, width: number, height: number) => void;
  onDelete?: (id: string) => void;
  /** Live canvas zoom, so a drag maps screen px to world units. */
  canvasScale?: SharedValue<number>;
  /**
   * The arrow tool is armed. The frame body already lets touches through, but
   * the title chip and the resize handle do not — and they sit right where you
   * would start a link from a note near the frame's edge.
   */
  linkMode?: boolean;
}

/**
 * A labelled region drawn behind the notes. Membership is spatial — whatever
 * sits inside the rectangle reads as part of the group — so dragging a note in
 * or out costs nothing and deleting the frame never touches a note.
 *
 * The body is deliberately not pressable: taps must fall through to the canvas
 * pan and to the notes stacked on top. Only the title bar is interactive.
 */
export const NoteGroupFrame: React.FC<NoteGroupFrameProps> = ({
  group,
  onRename,
  onMoveStart,
  onMoveEnd,
  onResize,
  onDelete,
  canvasScale,
  linkMode,
}) => {
  const { colors, scheme } = useTheme();
  const [title, setTitle] = useState(group.title ?? '');

  useEffect(() => setTitle(group.title ?? ''), [group.title]);

  const translateX = useSharedValue(group.x);
  const translateY = useSharedValue(group.y);
  const width = useSharedValue(group.width);
  const height = useSharedValue(group.height);
  const dragging = useSharedValue(false);
  const resizing = useSharedValue(false);

  useEffect(() => {
    if (!dragging.value) {
      translateX.value = group.x;
      translateY.value = group.y;
    }
    if (!resizing.value) {
      width.value = group.width;
      height.value = group.height;
    }
  }, [group.x, group.y, group.width, group.height]);

  const commit = (x: number, y: number) => onMoveEnd?.(group.id, x, y);

  // Dragging is gated to the title bar, so no long-press delay is needed —
  // the bar has nothing else to do with a plain drag.
  const dragGesture = Gesture.Pan()
    .onStart(() => {
      dragging.value = true;
    })
    .onUpdate((e) => {
      const zoom = canvasScale?.value ?? 1;
      translateX.value = group.x + e.translationX / zoom;
      translateY.value = group.y + e.translationY / zoom;
    })
    .onEnd(() => {
      dragging.value = false;
      runOnJS(commit)(translateX.value, translateY.value);
    });

  const commitResize = (w: number, h: number) => onResize?.(group.id, w, h);

  const resizeGesture = Gesture.Pan()
    .onStart(() => {
      resizing.value = true;
    })
    .onUpdate((e) => {
      const zoom = canvasScale?.value ?? 1;
      width.value = Math.max(150, group.width + e.translationX / zoom);
      height.value = Math.max(100, group.height + e.translationY / zoom);
    })
    .onEnd(() => {
      resizing.value = false;
      runOnJS(commitResize)(width.value, height.value);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
    width: width.value,
    height: height.value,
  }));
  
  const animatedTitleStyle = useAnimatedStyle(() => {
    const scale = 1 / Math.max(0.1, canvasScale?.value ?? 1);
    return {
      transform: [{ scale }],
      transformOrigin: 'top left',
    };
  });

  const animatedResizeStyle = useAnimatedStyle(() => {
    const scale = 1 / Math.max(0.1, canvasScale?.value ?? 1);
    return {
      transform: [{ scale }],
      transformOrigin: 'bottom right',
    };
  });

  const frameColor = group.color ?? colors.accent;
  const tint = scheme === 'dark' ? '14' : '10';

  return (
    <Animated.View
      className="absolute"
      style={[animatedStyle]}
      pointerEvents={linkMode ? 'none' : 'box-none'}
    >
      <View
        className="absolute inset-0 rounded-3xl border-2 border-dashed"
        style={{ borderColor: `${frameColor}66`, backgroundColor: `${frameColor}${tint}` }}
        pointerEvents="none"
      />

      <GestureDetector gesture={dragGesture}>
        <Animated.View
          className="absolute -top-5 left-4 flex-row items-center rounded-xl px-3 py-1.5 shadow-sm"
          style={[{ backgroundColor: shade(colors.surface, scheme === 'dark' ? 0.06 : -0.04) }, animatedTitleStyle]}
        >
          <GripHorizontal size={14} color={colors.muted} style={{ marginRight: 6 }} />
          <TextInput
            value={title}
            onChangeText={setTitle}
            onBlur={() => onRename?.(group.id, title.trim())}
            onSubmitEditing={() => onRename?.(group.id, title.trim())}
            placeholder="Group name"
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            autoFocus={!group.title}
            className="min-w-[90px] py-0.5 text-xs font-bold"
            style={{ color: colors.ink }}
          />
          {onDelete && (
            <TouchableOpacity onPress={() => onDelete(group.id)} hitSlop={15} className="ml-3">
              <X size={14} color={colors.muted} strokeWidth={3} />
            </TouchableOpacity>
          )}
        </Animated.View>
      </GestureDetector>

      {/* Resize Handle */}
      {onResize && (
        <GestureDetector gesture={resizeGesture}>
          <Animated.View
            className="absolute bottom-[-10px] right-[-10px] h-12 w-12 items-center justify-center p-2"
            hitSlop={30}
            style={animatedResizeStyle}
          >
            <View
              className="h-5 w-5 rounded-br-md border-b-[5px] border-r-[5px]"
              style={{ borderColor: `${frameColor}88` }}
            />
          </Animated.View>
        </GestureDetector>
      )}
    </Animated.View>
  );
};
