import React, { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Text } from '../../../shared/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { StickyNoteItem, StickyNoteData } from '../../sticky-notes/components/StickyNoteItem';
import { CreditChip } from '../../credits/components/CreditChip';
import { useTheme } from '../../../shared/theme';
import { CanvasBackground } from './CanvasBackground';
import { NoteConnectors } from './NoteConnectors';
import { clay, clayAccent, shade } from '../../../shared/theme/clay';
import { Mic, Settings, LayoutGrid } from 'lucide-react-native';

interface CanvasRootProps {
  spaceName?: string;
  creditBalance?: number;
  notes?: StickyNoteData[];
  onUpdateNoteColor?: (noteId: string, color: string) => void;
  onDeleteNote?: (noteId: string) => void;
  onMoveNote?: (noteId: string, x: number, y: number) => void;
  onStartRecord?: () => void;
  onOpenCredits?: () => void;
  onOpenSpaces?: () => void;
  onOpenSettings?: () => void;
  onOpenRecordings?: () => void;
  onTidy?: () => void;
  onPressNote?: (noteId: string) => void;
  /** noteId -> number of sub-notes it has, for the corner badge. */
  childCounts?: Map<string, number>;
}

const DEMO_FALLBACK_NOTES: StickyNoteData[] = [
  {
    id: '1',
    title: 'Onboarding Flow',
    content: 'Sketch wireframes for onboarding flow and clean voice prompt.',
    type: 'idea',
    color: '#FFF8BC',
    x: 40,
    y: 80,
  },
  {
    id: '2',
    title: 'Competitor Specs',
    content: 'Research competitor audio features in Figma & Miro.',
    type: 'task',
    color: '#F8BBD0',
    x: 250,
    y: 110,
  },
  {
    id: '3',
    title: 'User Feedback',
    content: 'Review user feedback on sticky note colors and push pin physics.',
    type: 'decision',
    color: '#C8E6C9',
    x: 30,
    y: 280,
  },
  {
    id: '4',
    title: 'Testing Sessions',
    content: 'Schedule user testing sessions (N=5) for voice-first canvas.',
    type: 'question',
    color: '#BBDEFB',
    x: 240,
    y: 310,
  },
  {
    id: '5',
    title: 'Color Palette',
    content: 'Finalize realistic paper color palette & typography.',
    type: 'reference',
    color: '#E1BEE7',
    x: 40,
    y: 500,
  },
];

const MIN_SCALE = 0.4;
const MAX_SCALE = 2.5;

export const CanvasRoot: React.FC<CanvasRootProps> = ({
  spaceName = 'My MindSpace',
  creditBalance = 140,
  notes: propNotes,
  onUpdateNoteColor,
  onDeleteNote,
  onMoveNote,
  onStartRecord,
  onOpenCredits,
  onOpenSpaces,
  onOpenSettings,
  onOpenRecordings,
  onTidy,
  onPressNote,
  childCounts,
}) => {
  const { colors } = useTheme();
  const [localNotes, setLocalNotes] = useState<StickyNoteData[]>(DEMO_FALLBACK_NOTES);
  // propNotes is undefined only when no data source is wired up at all (e.g. a
  // standalone preview) — once a real (possibly empty) array arrives, render it
  // as-is so a genuinely empty space shows empty, not five fake notes.
  const isDemo = propNotes === undefined;
  const displayNotes = isDemo ? localNotes : propNotes;

  const handleUpdateColor = (id: string, color: string) => {
    if (onUpdateNoteColor) {
      onUpdateNoteColor(id, color);
    } else {
      setLocalNotes((prev) => prev.map((item) => (item.id === id ? { ...item, color } : item)));
    }
  };

  const handleMoveNote = (id: string, x: number, y: number) => {
    if (onMoveNote && !isDemo) {
      onMoveNote(id, x, y);
    } else {
      setLocalNotes((prev) => prev.map((item) => (item.id === id ? { ...item, x, y } : item)));
    }
  };

  // Infinite pan/zoom canvas: translation + scale on the UI thread, exactly
  // the transform coords.ts's worldToScreen/screenToWorld already assume —
  // world-space note x/y stay untouched, only the container moves.
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scaleValue = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .onStart(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = startX.value + e.translationX;
      translateY.value = startY.value + e.translationY;
    });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scaleValue.value;
    })
    .onUpdate((e) => {
      const next = startScale.value * e.scale;
      scaleValue.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    });

  // Pan and pinch run together; a note's own long-press-gated drag gesture
  // wins over this pan via Gesture.Race in StickyNoteItem, so dragging a
  // note doesn't also pan the board underneath it.
  const canvasGesture = Gesture.Simultaneous(panGesture, pinchGesture);

  const canvasAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scaleValue.value },
    ],
  }));

  return (
    <View className="flex-1 bg-board">
      <CanvasBackground />
      <SafeAreaView className="flex-1">
      {/* Header */}
      <View
        className="z-30 mx-3 mt-2 flex-row items-center justify-between px-4 py-3"
        style={clay({ color: colors.surface, radius: 24 })}
      >
        <TouchableOpacity
          className="flex-1 flex-row items-center"
          onPress={onOpenSpaces}
          disabled={!onOpenSpaces}
          activeOpacity={0.7}
        >
          <View className="flex-1">
            <Text className="text-[19px] font-bold text-ink">
              {spaceName} {onOpenSpaces ? '▾' : ''}
            </Text>
            <Text className="mt-0.5 text-[11px] font-medium text-muted">
              Pinch to zoom · hold a note to move it
            </Text>
          </View>
        </TouchableOpacity>
        <CreditChip balance={creditBalance} onPress={onOpenCredits} />
        {onTidy && (
          <TouchableOpacity
            className="ml-2 h-9 w-9 items-center justify-center"
            style={clay({ color: shade(colors.surface, -0.06), radius: 18, depth: 0.6 })}
            onPress={onTidy}
            accessibilityLabel="Tidy notes into a grid"
          >
            <LayoutGrid size={17} color={colors.muted} strokeWidth={2.4} />
          </TouchableOpacity>
        )}
        {onOpenRecordings && (
          <TouchableOpacity
            className="ml-2 h-9 w-9 items-center justify-center"
            style={clay({ color: shade(colors.surface, -0.06), radius: 18, depth: 0.6 })}
            onPress={onOpenRecordings}
          >
            <Mic size={18} color={colors.ink} strokeWidth={2.5} />
          </TouchableOpacity>
        )}
        {onOpenSettings && (
          <TouchableOpacity
            className="ml-2 h-9 w-9 items-center justify-center"
            style={clay({ color: shade(colors.surface, -0.06), radius: 18, depth: 0.6 })}
            onPress={onOpenSettings}
          >
            <Settings size={18} color={colors.ink} strokeWidth={2.5} />
          </TouchableOpacity>
        )}
      </View>

      {/* Infinite pan/zoom board */}
      <GestureDetector gesture={canvasGesture}>
        <View className="flex-1 overflow-hidden">
          <Animated.View style={[{ width: '100%', height: '100%' }, canvasAnimatedStyle]}>
            <NoteConnectors notes={displayNotes} />
            {displayNotes.map((note) => (
              <StickyNoteItem
                key={note.id}
                note={note}
                onUpdateColor={handleUpdateColor}
                onDelete={onDeleteNote}
                onMove={handleMoveNote}
                onPressNote={onPressNote}
                canvasScale={scaleValue}
                childCount={childCounts?.get(note.id)}
              />
            ))}
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Floating record button */}
      <View className="absolute inset-x-0 bottom-[30px] z-40 items-center">
        <TouchableOpacity
          className="h-[74px] w-[74px] items-center justify-center"
          style={[clayAccent(colors, 37), { shadowColor: colors.accent, shadowOpacity: 0.45 }]}
          activeOpacity={0.85}
          onPress={onStartRecord}
        >
          <View
            className="absolute h-[92px] w-[92px] rounded-full"
            style={{ backgroundColor: `${colors.accent}2E` }}
          />
          <Mic size={32} color="#FFF" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>
      </SafeAreaView>
    </View>
  );
};
