import React, { useState } from 'react';
import { View } from 'react-native';
import { Text } from '../../../shared/ui/Text';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { PushPin } from './PushPin';
import { ColorPicker } from './ColorPicker';
import { PeelFlap } from './PeelFlap';
import { noteColors, NoteType } from '../../../shared/constants/tokens';
import { shade } from '../../../shared/theme/clay';
import { readableTextOn } from '../../../shared/theme/color';
import { useTheme } from '../../../shared/theme';

/** Size of the peeled bottom-right corner, in px. */
const CURL = 24;

export interface StickyNoteData {
  id: string;
  title?: string | null;
  content: string;
  type: NoteType;
  color?: string | null;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
}

interface StickyNoteItemProps {
  note: StickyNoteData;
  onUpdateColor?: (id: string, color: string) => void;
  onDelete?: (id: string) => void;
  onPressNote?: (id: string) => void;
  /** Fires once, when a drag ends, with the note's new world position. */
  onMove?: (id: string, x: number, y: number) => void;
  /** Live canvas zoom, so a drag can be converted from screen px to world units. */
  canvasScale?: SharedValue<number>;
}

export const StickyNoteItem: React.FC<StickyNoteItemProps> = ({
  note,
  onUpdateColor,
  onDelete,
  onPressNote,
  onMove,
  canvasScale,
}) => {
  const { colors } = useTheme();
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [isLifted, setIsLifted] = useState(false);

  // Deterministic tilt for a hand-placed feel (-2.5° to +2.5°).
  const tilt = note.rotation ?? (((note.id.charCodeAt(0) || 0) % 5) - 2) * 1.2;

  const defaultScheme = noteColors[note.type] || noteColors.idea;
  const paperBg = note.color || defaultScheme.bg;
  // The picker now offers the whole spectrum, so ink is derived from the paper's
  // luminance instead of the note type — a dark swatch would swallow dark ink.
  const textColor = note.color ? readableTextOn(paperBg) : defaultScheme.text;

  // Position is a shared value so drag runs entirely on the UI thread —
  // dragging 5-10 notes at 60fps is not a React re-render problem.
  const translateX = useSharedValue(note.x);
  const translateY = useSharedValue(note.y);
  const scale = useSharedValue(1);

  // The parent may hand us a fresh `note.x/y` after a server refetch —
  // resync unless the user is mid-drag (scale !== 1 marks that window).
  React.useEffect(() => {
    if (scale.value === 1) {
      translateX.value = note.x;
      translateY.value = note.y;
    }
  }, [note.x, note.y]);

  const commitPosition = (x: number, y: number) => {
    onMove?.(note.id, x, y);
  };

  const setLifted = (lifted: boolean) => setIsLifted(lifted);

  // Long-press activation so a plain tap still reaches onPressNote/long-press
  // color picker, and a hold-then-drag moves the note without fighting the
  // canvas's own pan gesture (composed with Exclusive in CanvasRoot).
  const dragGesture = Gesture.Pan()
    .activateAfterLongPress(120)
    .onStart(() => {
      scale.value = withSpring(1.06);
      runOnJS(setLifted)(true);
    })
    .onUpdate((e) => {
      // The note lives inside the canvas's scaled container, so a finger that
      // travels 100 screen px only covers 100/zoom world units. Without this
      // the note visibly lags the finger when zoomed out and overshoots when
      // zoomed in.
      const zoom = canvasScale?.value ?? 1;
      translateX.value = note.x + e.translationX / zoom;
      translateY.value = note.y + e.translationY / zoom;
    })
    .onEnd(() => {
      scale.value = withSpring(1);
      runOnJS(setLifted)(false);
      runOnJS(commitPosition)(translateX.value, translateY.value);
    });

  const handleTap = () => {
    onPressNote?.(note.id);
  };

  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .onEnd(() => {
      runOnJS(handleTap)();
    });

  const longPressGesture = Gesture.LongPress()
    .minDuration(400)
    .onStart(() => {
      runOnJS(setColorPickerVisible)(true);
    });

  const composed = Gesture.Race(dragGesture, Gesture.Exclusive(longPressGesture, tapGesture));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${tilt}deg` },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        className="absolute"
        style={[{ width: note.width || 190, minHeight: note.height || 145 }, animatedStyle]}
      >
        {/*
          Cast shadow sits on its own layer *behind* the paper rather than on
          the paper itself. A shadow on the paper would be clipped by the folded
          corner; keeping it separate lets the note read as floating above the
          board with the light coming from the top-left.
        */}
        <View
          className="absolute inset-x-1 bottom-0 top-1 rounded-sm"
          style={{
            backgroundColor: '#000',
            opacity: isLifted ? 0.34 : 0.2,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: isLifted ? 16 : 7 },
            shadowOpacity: 1,
            shadowRadius: isLifted ? 20 : 9,
            elevation: isLifted ? 16 : 6,
          }}
        />

        {/* Paper */}
        <View
          className="absolute inset-0 p-3.5 pt-[22px]"
          style={{
            backgroundColor: paperBg,
            borderTopLeftRadius: 3,
            borderTopRightRadius: 3,
            borderBottomLeftRadius: 3,
            borderBottomRightRadius: CURL, // Carve out the corner!
          }}
        >
          {/*
            Real sticky notes are glued along the top, and that band catches
            light differently from the free-hanging rest of the sheet.
          */}
          <View
            className="absolute inset-x-0 top-0 h-[26px]"
            style={{
              backgroundColor: shade(paperBg, 0.16),
              borderTopLeftRadius: 3,
              borderTopRightRadius: 3,
            }}
          />

          <View className="mt-0.5 flex-1">
            {Boolean(note.title) && (
              <Text
                className="mb-1 text-base font-bold tracking-[-0.2px]"
                style={{ color: textColor }}
                numberOfLines={1}
              >
                {note.title}
              </Text>
            )}
            <Text className="text-sm font-medium leading-5" style={{ color: textColor }}>
              {note.content}
            </Text>
          </View>

          <View className="mt-2.5 flex-row justify-start">
            <View
              className="rounded-md px-2 py-0.5"
              style={{ backgroundColor: shade(paperBg, -0.12) }}
            >
              <Text
                className="text-[10px] font-bold uppercase tracking-wide"
                style={{ color: textColor }}
              >
                {note.type}
              </Text>
            </View>
          </View>
        </View>

        <PeelFlap size={CURL + 4} color={shade(paperBg, -0.15)} />

        {/* Metallic push pin (مسمار) at top-center */}
        <View className="absolute -top-[9px] left-0 right-0 z-20 items-center">
          <PushPin isLifted={isLifted} />
        </View>



        <ColorPicker
          visible={colorPickerVisible}
          currentColor={paperBg}
          onSelectColor={(color) => {
            onUpdateColor?.(note.id, color);
            setColorPickerVisible(false);
          }}
          onClose={() => setColorPickerVisible(false)}
        />
      </Animated.View>
    </GestureDetector>
  );
};
