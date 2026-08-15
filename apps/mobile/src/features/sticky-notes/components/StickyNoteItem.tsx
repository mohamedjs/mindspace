import React, { useState } from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from '../../../shared/ui/Text';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { Check, Pencil } from 'lucide-react-native';
import { PushPin } from './PushPin';
import { ColorPicker } from './ColorPicker';
import { PeelFlap } from './PeelFlap';
import { noteColors, NoteType } from '../../../shared/constants/tokens';
import { shade } from '../../../shared/theme/clay';
import { readableTextOn } from '../../../shared/theme/color';
import { useTheme } from '../../../shared/theme';
import type { Note } from '../../../core/domain';

/** Size of the peeled bottom-right corner, in px. */
const CURL = 38;

/** The domain entity. Kept as a named re-export so existing call sites read naturally. */
export type StickyNoteData = Note;

interface StickyNoteItemProps {
  note: StickyNoteData;
  onUpdateColor?: (id: string, color: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onMoveClusterEnd?: (id: string, finalX: number, finalY: number) => void;
  onDelete?: (id: string) => void;
  onDragStart?: (id: string) => void;
  onPressNote?: (id: string) => void;
  /** Live canvas zoom, so a drag can be converted from screen px to world units. */
  canvasScale?: SharedValue<number>;
  /** How many sub-notes this idea has, if any — shown as a small corner badge. */
  childCount?: number;
  activeDragState?: SharedValue<{ id: string | null; dx: number; dy: number }>;
  activeDragNotes?: SharedValue<string[]>;
  /**
   * The arrow tool is armed. Notes stop being draggable and stop swallowing
   * touches, so the board's link gesture receives the whole drag — otherwise
   * the note's own pan wins the moment a finger lands on it.
   */
  linkMode?: boolean;
  /**
   * What this note is during a link drag: where the arrow started, a legal
   * drop, or one that would make a cycle. Drives the outline.
   */
  linkRole?: 'source' | 'valid' | 'invalid' | null;
  /**
   * Tapped. The canvas decides what that means — open the editor, toggle the
   * selection, or pick a link endpoint — because only it knows the tool mode.
   */
  onTap?: (id: string) => void;
  /** Save an inline edit made on the board, without opening the note. */
  onSaveContent?: (id: string, fields: { title: string | null; content: string }) => void;
  /** Part of a marquee selection — drags as one unit with the rest. */
  selected?: boolean;
}

const StickyNoteItemImpl: React.FC<StickyNoteItemProps> = ({
  note,
  onUpdateColor,
  onMove,
  onMoveClusterEnd,
  onDelete,
  onDragStart,
  onPressNote,
  canvasScale,
  childCount,
  activeDragState,
  activeDragNotes,
  linkMode,
  linkRole,
  selected,
  onTap,
  onSaveContent,
}) => {
  const { colors } = useTheme();
  const [colorPickerVisible, setColorPickerVisible] = useState(false);

  /**
   * Inline editing, right on the board.
   *
   * Opening the full editor to fix a word was the single most common reason to
   * leave the canvas, and leaving the canvas loses your place on it. Drafts are
   * local until saved, so a background refetch cannot overwrite what is being
   * typed.
   */
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(note.title ?? '');
  const [draftContent, setDraftContent] = useState(note.content);

  const dirty = draftTitle !== (note.title ?? '') || draftContent !== note.content;

  const beginEdit = () => {
    setDraftTitle(note.title ?? '');
    setDraftContent(note.content);
    setEditing(true);
  };

  const saveEdit = () => {
    if (dirty) {
      onSaveContent?.(note.id, {
        title: draftTitle.trim() ? draftTitle.trim() : null,
        content: draftContent,
      });
    }
    setEditing(false);
  };
  const [isLifted, setIsLifted] = useState(false);

  // Deterministic tilt for a hand-placed feel (-2.5° to +2.5°).
  const tilt = note.rotation ?? (((note.id.charCodeAt(0) || 0) % 5) - 2) * 1.2;

  // Say no *before* the finger lifts: a drop that silently does nothing reads
  // as a broken tool, and "would make a cycle" is not guessable.
  const ringColor =
    linkRole === 'invalid'
      ? colors.warning
      : linkRole === 'valid' || linkRole === 'source' || selected
        ? colors.accent
        : null;

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
      if (onDragStart) runOnJS(onDragStart)(note.id);
      scale.value = withSpring(1.06);
      if (activeDragState) activeDragState.value = { id: note.id, dx: 0, dy: 0 };
      runOnJS(setLifted)(true);
    })
    .onUpdate((e) => {
      // The note lives inside the canvas's scaled container, so a finger that
      // travels 100 screen px only covers 100/zoom world units. Without this
      // the note visibly lags the finger when zoomed out and overshoots when
      // zoomed in.
      const zoom = canvasScale?.value ?? 1;
      const dx = e.translationX / zoom;
      const dy = e.translationY / zoom;
      translateX.value = note.x + dx;
      translateY.value = note.y + dy;
      if (activeDragState) activeDragState.value = { id: note.id, dx, dy };
    })
    .onEnd(() => {
      scale.value = withSpring(1);
      if (activeDragState) activeDragState.value = { id: null, dx: 0, dy: 0 };
      runOnJS(setLifted)(false);
      
      if (onMoveClusterEnd) {
        runOnJS(onMoveClusterEnd)(note.id, translateX.value, translateY.value);
      } else {
        runOnJS(commitPosition)(translateX.value, translateY.value);
      }
    });

  const handleTap = () => {
    if (onTap) onTap(note.id);
    else onPressNote?.(note.id);
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

  // While a field has focus every gesture is off: a drag that starts on a
  // caret is someone trying to place the caret, and a long-press is someone
  // trying to select text.
  const composed = Gesture.Race(dragGesture, Gesture.Exclusive(longPressGesture, tapGesture));

  const animatedStyle = useAnimatedStyle(() => {
    let extraX = 0;
    let extraY = 0;
    
    // If a cluster is dragging, check if we are part of it
    if (activeDragState && activeDragNotes && activeDragState.value.id && activeDragState.value.id !== note.id) {
      if (activeDragNotes.value.includes(note.id)) {
        extraX = activeDragState.value.dx;
        extraY = activeDragState.value.dy;
      }
    }

    return {
      transform: [
        { translateX: translateX.value + extraX },
        { translateY: translateY.value + extraY },
        { rotate: `${tilt}deg` },
        { scale: scale.value },
      ],
    };
  });

  const body = (
      <Animated.View
        className="absolute"
        pointerEvents={linkMode ? 'none' : 'auto'}
        style={[{ width: note.width || 240, minHeight: note.height || 200 }, animatedStyle]}
      >
        {/*
          Link-target ring. An overlay rather than a border on the card itself:
          a border would reflow the note by its own width the moment it became
          an endpoint, so notes would twitch as the finger passes over them.
        */}
        {ringColor && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -4,
              left: -4,
              right: -4,
              bottom: -4,
              borderWidth: 3,
              borderColor: ringColor,
              borderRadius: 22,
              zIndex: 30,
            }}
          />
        )}
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
            borderBottomRightRadius: CURL,
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
            Pencil to start, check to commit — an explicit save rather than a
            silent one. On a board you glance at, a note that quietly rewrote
            itself while your thumb rested on it would be worse than one extra
            tap. The button doubles as the dirty indicator.
          */}
          {Boolean(onSaveContent) && (
            <TouchableOpacity
              className="absolute right-1.5 top-1.5 z-20 h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: shade(paperBg, editing && dirty ? -0.3 : -0.12) }}
              onPress={editing ? saveEdit : beginEdit}
              hitSlop={8}
              accessibilityLabel={editing ? 'Save note' : 'Edit note here'}
            >
              {editing ? (
                <Check size={16} color={textColor} strokeWidth={3} />
              ) : (
                <Pencil size={13} color={textColor} strokeWidth={2.5} />
              )}
            </TouchableOpacity>
          )}

          <View className="mt-0.5 flex-1">
            {editing ? (
              <>
                <TextInput
                  className="mb-1 p-0 text-base font-bold tracking-[-0.2px]"
                  style={{ color: textColor }}
                  value={draftTitle}
                  onChangeText={setDraftTitle}
                  placeholder="Title"
                  placeholderTextColor={shade(textColor, 0.45)}
                  autoFocus
                  returnKeyType="next"
                />
                <TextInput
                  className="p-0 text-sm font-medium leading-5"
                  style={{ color: textColor }}
                  value={draftContent}
                  onChangeText={setDraftContent}
                  placeholder="What is this about?"
                  placeholderTextColor={shade(textColor, 0.45)}
                  multiline
                  scrollEnabled={false}
                  textAlignVertical="top"
                />
              </>
            ) : (
              <>
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
              </>
            )}
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

        {Boolean(childCount) && (
          <View
            className="absolute -right-2 -top-2 z-20 h-6 min-w-6 items-center justify-center rounded-full px-1"
            style={{ backgroundColor: shade(paperBg, -0.35) }}
          >
            <Text className="text-[11px] font-bold" style={{ color: textColor }}>
              {childCount}
            </Text>
          </View>
        )}



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
  );

  // Swapping the composed gesture on a mounted GestureDetector is the flaky
  // corner of gesture-handler, so the detector is dropped entirely instead.
  // Mode changes are a toolbar tap, never mid-gesture, so remounting is free.
  // No gesture detector while a field has focus: a drag on a caret is someone
  // placing the caret, and a long-press is someone selecting text. Editing ends
  // on save, so the swap never happens mid-gesture.
  if (linkMode || editing) return body;

  return <GestureDetector gesture={composed}>{body}</GestureDetector>;
};

/**
 * Memoised, because the canvas re-renders on every selection or mode change and
 * a board of thirty notes was re-rendering all thirty to highlight one.
 *
 * The comparison is explicit rather than shallow: `note` is a fresh object on
 * every React Query settle even when nothing about it changed, and the handler
 * props are recreated per render by CanvasRoot. Comparing the fields that
 * actually affect the output is what makes the memo bite.
 */
export const StickyNoteItem = React.memo(StickyNoteItemImpl, (a, b) => {
  const n = a.note;
  const m = b.note;
  return (
    n.id === m.id &&
    n.x === m.x &&
    n.y === m.y &&
    n.title === m.title &&
    n.content === m.content &&
    n.color === m.color &&
    n.type === m.type &&
    n.width === m.width &&
    n.height === m.height &&
    n.parentId === m.parentId &&
    a.childCount === b.childCount &&
    a.selected === b.selected &&
    a.linkRole === b.linkRole &&
    a.linkMode === b.linkMode &&
    a.onSaveContent === b.onSaveContent
  );
});
