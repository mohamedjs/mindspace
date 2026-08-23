import React, { useCallback, useRef, useState } from 'react';
import { TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { Text } from '../../../shared/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { StickyNoteItem } from '../../sticky-notes/components/StickyNoteItem';
import type { Note as StickyNoteData } from '../../../core/domain';
import { CreditChip } from '../../credits/components/CreditChip';
import { useTheme } from '../../../shared/theme';
import { CanvasBackground } from './CanvasBackground';
import { NoteConnectors } from './NoteConnectors';
import { NoteGroupFrame } from './NoteGroupFrame';
import { CanvasToolbar, type ToolMode } from './CanvasToolbar';
import { screenToWorld, zoomAbout } from '../utils/coords';
import Toast from 'react-native-toast-message';
import { notesInsideRect, withDescendants, wouldCycle } from '../utils/graph';
import type { NoteGroup } from '../api/groups.api';
import { clay, clayAccent, shade } from '../../../shared/theme/clay';
import { Mic, Settings, Sparkles } from 'lucide-react-native';

interface CanvasRootProps {
  spaceName?: string;
  creditBalance?: number;
  notes?: StickyNoteData[];
  groups?: NoteGroup[];
  onUpdateNoteColor?: (noteId: string, color: string) => void;
  onDeleteNote?: (noteId: string) => void;
  onMoveNote?: (noteId: string, x: number, y: number) => void;
  onMoveCluster?: (moves: { id: string; x: number; y: number }[]) => void;
  onStartRecord?: () => void;
  onOpenCredits?: () => void;
  onOpenSpaces?: () => void;
  onOpenSettings?: () => void;
  onOpenRecordings?: () => void;
  onTidy?: () => void;
  onPressNote?: (noteId: string) => void;
  /** Called with the world-space centre of the current viewport. */
  onAddNote?: (x: number, y: number) => void;
  onAddGroup?: (x: number, y: number) => void;
  onRenameGroup?: (groupId: string, title: string) => void;
  onMoveGroup?: (groupId: string, x: number, y: number) => void;
  onResizeGroup?: (groupId: string, width: number, height: number) => void;
  onDeleteGroup?: (groupId: string) => void;
  /** noteId -> number of sub-notes it has, for the corner badge. */
  childCounts?: Map<string, number>;
  /**
   * Re-parent a note. Drives the arrow tool; also used to detach.
   * The canvas rejects cycles before ever calling this.
   */
  onSetNoteParent?: (noteId: string, parentId: string | null) => void;
  /** Sub-notes are hidden, so a freshly linked note is about to disappear. */
  onLinkedWhileHidden?: (childId: string, parentId: string, previousParentId: string | null) => void;
  /**
   * The account's plan includes the voice pipeline. False on Free, where the
   * whole board still works and only the microphone is gone.
   */
  aiEnabled?: boolean;
  /** Persist an edit made directly on a note, without opening the editor. */
  onSaveNoteContent?: (noteId: string, fields: { title: string | null; content: string }) => void;
  /** Tapped when someone on a plan without AI reaches for the microphone. */
  onUpgrade?: () => void;
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

// Low enough to fit a board of a few dozen notes on screen at once. Text is
// unreadable down there, but the layout still is — that's what zooming out is
// for on a canvas this size.
const MIN_SCALE = 0.12;
const MAX_SCALE = 2.5;

export const CanvasRoot: React.FC<CanvasRootProps> = ({
  spaceName = 'My MindSpace',
  creditBalance = 140,
  notes: propNotes,
  onUpdateNoteColor,
  onDeleteNote,
  onMoveNote,
  onMoveCluster,
  onStartRecord,
  onOpenCredits,
  onOpenSpaces,
  onOpenSettings,
  onOpenRecordings,
  onTidy,
  onPressNote,
  groups,
  onAddNote,
  onAddGroup,
  onRenameGroup,
  onMoveGroup,
  onResizeGroup,
  onDeleteGroup,
  childCounts,
  onSetNoteParent,
  onLinkedWhileHidden,
  aiEnabled = true,
  onUpgrade,
  onSaveNoteContent,
}) => {
  const { colors, showChildNotes, setShowChildNotes } = useTheme();
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

  const descendantsMap = useSharedValue<Record<string, string[]>>({});
  const activeDragState = useSharedValue({ id: null as string | null, dx: 0, dy: 0 });
  const activeDragNotes = useSharedValue<string[]>([]);

  React.useEffect(() => {
    const map: Record<string, string[]> = {};
    const childrenMap: Record<string, string[]> = {};
    for (const note of displayNotes) {
      if (note.parentId) {
        if (!childrenMap[note.parentId]) childrenMap[note.parentId] = [];
        childrenMap[note.parentId].push(note.id);
      }
    }
    // `visiting` is the guard, not an optimisation. The memo above is only
    // written *after* the walk returns, so a parent_id ring would recurse until
    // the stack blew — and once such a row exists it reproduces on every load.
    // The arrow tool is the first thing that can create one; wouldCycle refuses
    // to, and this makes a bad row from anywhere else a wrong tree rather than
    // a white screen.
    const getDescendants = (id: string, visiting = new Set<string>()): string[] => {
      if (map[id]) return map[id];
      if (visiting.has(id)) return [];
      visiting.add(id);
      const children = childrenMap[id] || [];
      let all = [...children];
      for (const child of children) {
        all = all.concat(getDescendants(child, visiting));
      }
      map[id] = all;
      return all;
    };
    for (const note of displayNotes) {
      getDescendants(note.id);
    }
    descendantsMap.value = map;
  }, [displayNotes, descendantsMap]);

  /**
   * Everything that travels with `id`, excluding `id` itself.
   *
   * Union of the selection (when the dragged note is part of it) and every
   * descendant of everything in that set. The union is the point: a marquee
   * that happens to catch a parent but not its sub-notes would otherwise tear
   * them off, and "a note's children follow it" is an invariant the board has
   * always had. With nothing selected this is exactly the old behaviour.
   */
  const dragSetFor = React.useCallback(
    (id: string) => {
      const seeds = selectedRef.current.includes(id) ? selectedRef.current : [id];
      return withDescendants(seeds, descendantsMap.value).filter((n) => n !== id);
    },
    [descendantsMap]
  );

  const handleNoteDragStart = React.useCallback((id: string) => {
    activeDragNotes.value = dragSetFor(id);
  }, [activeDragNotes, dragSetFor]);

  const activeGroupDragNotes = React.useRef<string[]>([]);

  const handleGroupDragStart = React.useCallback((groupId: string) => {
    const group = groups?.find((g) => g.id === groupId);
    if (!group) return;

    // Rendered size, not the stored one: a note whose row says 120 tall renders
    // at least 200, so the old test counted notes that visibly hang out of the
    // frame as being inside it.
    const inside = notesInsideRect(
      { x: group.x, y: group.y, w: group.width, h: group.height },
      displayNotes
    );

    activeGroupDragNotes.current = inside;
    activeDragNotes.value = inside;
  }, [groups, displayNotes, activeDragNotes]);

  const handleMoveGroupEnd = React.useCallback(
    (groupId: string, finalX: number, finalY: number) => {
      const group = groups?.find((g) => g.id === groupId);
      if (group) {
        const dx = finalX - group.x;
        const dy = finalY - group.y;

        const moves = activeGroupDragNotes.current
          .map((noteId) => {
            const note = displayNotes.find((n) => n.id === noteId);
            return note ? { id: note.id, x: note.x + dx, y: note.y + dy } : null;
          })
          .filter(Boolean) as { id: string; x: number; y: number }[];

        if (moves.length > 0) {
          if (onMoveCluster && !isDemo) {
            onMoveCluster(moves);
          } else {
            setLocalNotes((prev) =>
              prev.map((item) => {
                const move = moves.find((m) => m.id === item.id);
                return move ? { ...item, x: move.x, y: move.y } : item;
              })
            );
          }
        }
      }

      if (onMoveGroup) onMoveGroup(groupId, finalX, finalY);
      activeGroupDragNotes.current = [];
    },
    [groups, displayNotes, onMoveGroup, onMoveCluster, isDemo]
  );

  const handleMoveClusterEnd = React.useCallback(
    (id: string, finalX: number, finalY: number) => {
      const parent = displayNotes.find((n) => n.id === id);
      if (!parent) return;

      const dx = finalX - parent.x;
      const dy = finalY - parent.y;

      const moves = [{ id, x: finalX, y: finalY }];

      for (const childId of dragSetFor(id)) {
        const child = displayNotes.find((n) => n.id === childId);
        if (child) {
          moves.push({ id: child.id, x: child.x + dx, y: child.y + dy });
        }
      }

      if (onMoveCluster && !isDemo) {
        onMoveCluster(moves);
      } else {
        setLocalNotes((prev) =>
          prev.map((item) => {
            const move = moves.find((m) => m.id === item.id);
            return move ? { ...item, x: move.x, y: move.y } : item;
          })
        );
      }
    },
    [displayNotes, dragSetFor, onMoveCluster, isDemo]
  );

  // Infinite pan/zoom canvas: translation + scale on the UI thread, exactly
  // the transform coords.ts's worldToScreen/screenToWorld already assume —
  // world-space note x/y stay untouched, only the container moves.
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scaleValue = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  // Pinch keeps its own start values: pan is capped at one pointer, so the two
  // never write translate in the same frame, but sharing the fields would still
  // leave whichever gesture starts second holding the other's origin.
  const pinchStartX = useSharedValue(0);
  const pinchStartY = useSharedValue(0);
  const pinchFocalX = useSharedValue(0);
  const pinchFocalY = useSharedValue(0);
  const startScale = useSharedValue(1);


  // ─── Tool modes ─────────────────────────────────────────────────────────
  /**
   * What a tap on the board does.
   *
   *   pan     — nothing; one finger drags the board. The default.
   *   select  — tap notes to add or remove them from a selection.
   *   write   — tap a note and start typing in it, no editor to open.
   *   arrow   — tap the parent, then tap the child.
   *
   * Both non-default modes are **tap-driven, not drag-driven**. The first cut
   * copied the web build: press a note, drag a rubber band, release on the
   * target; and drag a marquee box to multi-select. Both are mouse gestures.
   * On a phone your finger covers the thing you are aiming at, there is no
   * hover to preview the outcome, and a marquee fights the pan you use
   * constantly. Two deliberate taps beat one blind drag.
   *
   * The mode is also the whole reason the canvas got slow: hit-testing on every
   * drag frame meant a `runOnJS` hop plus a possible re-render of every note,
   * sixty times a second. Tapping does that work twice per link.
   */
  const [toolMode, setToolMode] = useState<ToolMode>('pan');
  /** Which note the pencil tool has asked to open for typing. */
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const arrowArmed = toolMode === 'arrow';

  /** Read inside the pan worklet, which must not pan in the tap-driven modes. */
  const panEnabled = useSharedValue(true);
  React.useEffect(() => {
    panEnabled.value = toolMode === 'pan';
  }, [toolMode, panEnabled]);

  /** The note tapped first in arrow mode — the parent-to-be. */
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedRef = useRef<string[]>([]);

  const applySelection = React.useCallback((ids: string[]) => {
    selectedRef.current = ids;
    setSelectedIds(ids);
  }, []);

  /**
   * Parent lookup for the cycle check.
   *
   * Built from the *visible* notes, which is sound today only because hiding
   * sub-notes leaves nothing but roots on the board — and a root cannot be an
   * ancestor of anything you could still reach. If the visibility filter ever
   * becomes partial, the upward walk would terminate early and this would fail
   * open; feed it the unfiltered list at that point.
   */
  const parentOf = React.useMemo(
    () => new Map<string, string | null>(displayNotes.map((n) => [n.id, n.parentId ?? null])),
    [displayNotes]
  );

  /**
   * A note was tapped. What that means depends on the mode.
   *
   * Runs on the JS thread from the note's own tap gesture, so there is no
   * hit-testing to do — the note that was touched tells us who it is.
   */
  const handleNoteTap = React.useCallback(
    (noteId: string) => {
      if (toolMode === 'write') {
        setEditingNoteId(noteId);
        return;
      }

      if (toolMode === 'select') {
        const next = selectedRef.current.includes(noteId)
          ? selectedRef.current.filter((id) => id !== noteId)
          : [...selectedRef.current, noteId];
        applySelection(next);
        return;
      }

      if (toolMode === 'arrow') {
        if (!linkSourceId) {
          setLinkSourceId(noteId);
          return;
        }
        if (noteId === linkSourceId) {
          setLinkSourceId(null); // tapped the parent again — cancel
          return;
        }
        if (wouldCycle(noteId, linkSourceId, parentOf)) {
          Toast.show({
            type: 'error',
            text1: 'That would make a loop',
            text2: 'A note cannot end up underneath one of its own sub-notes.',
          });
          return;
        }

        const target = displayNotes.find((n) => n.id === noteId);
        const previousParentId = target?.parentId ?? null;
        if (previousParentId !== linkSourceId) {
          onSetNoteParent?.(noteId, linkSourceId);
          if (!showChildNotes) onLinkedWhileHidden?.(noteId, linkSourceId, previousParentId);
        }
        setLinkSourceId(null);
        setToolMode('pan');
        return;
      }

      onPressNote?.(noteId);
    },
    [
      toolMode,
      linkSourceId,
      parentOf,
      displayNotes,
      applySelection,
      onSetNoteParent,
      onPressNote,
      showChildNotes,
      onLinkedWhileHidden,
    ]
  );

  const changeMode = React.useCallback(
    (mode: ToolMode) => {
      setLinkSourceId(null);
      setEditingNoteId(null);
      if (mode !== 'select') applySelection([]);
      setToolMode(mode);
    },
    [applySelection]
  );


  /**
   * Pan the board. Only pans — the tap-driven modes leave it disabled rather
   * than teaching one gesture three jobs, which is what made the previous
   * version both hard to follow and expensive per frame.
   */
  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .onStart(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      if (!panEnabled.value) return;
      translateX.value = startX.value + e.translationX;
      translateY.value = startY.value + e.translationY;
    });

  const pinchGesture = Gesture.Pinch()
    .onStart((e) => {
      startScale.value = scaleValue.value;
      pinchStartX.value = translateX.value;
      pinchStartY.value = translateY.value;
      pinchFocalX.value = e.focalX;
      pinchFocalY.value = e.focalY;
    })
    .onUpdate((e) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, startScale.value * e.scale));
      // Zoom about the point between the fingers rather than the middle of the
      // screen, so the thing you are pinching stays under them. With a
      // top-left origin that means re-deriving the translation each frame:
      // screen = translate + world * scale, held fixed at the focal point.
      translateX.value = zoomAbout(pinchFocalX.value, pinchStartX.value, startScale.value, next);
      translateY.value = zoomAbout(pinchFocalY.value, pinchStartY.value, startScale.value, next);
      scaleValue.value = next;
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

  // The board's own size, needed to turn "centre of the screen" into world
  // coordinates and to work out a fit-everything zoom.
  const boardSize = useRef({ width: 0, height: 0 });
  const onBoardLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    boardSize.current = { width, height };
  };

  /** Screen centre -> world, undoing the container's transform. */
  const viewportCentre = useCallback(() => {
    const { width, height } = boardSize.current;
    return screenToWorld(
      width / 2,
      height / 2,
      { x: translateX.value, y: translateY.value },
      scaleValue.value
    );
  }, [translateX, translateY, scaleValue]);

  const handleFitToView = useCallback(() => {
    const boxes = [
      ...displayNotes.map((n) => ({
        x: n.x,
        y: n.y,
        width: n.width ?? 190,
        height: n.height ?? 145,
      })),
      ...(groups ?? []),
    ];
    const { width: boardW, height: boardH } = boardSize.current;
    if (!boxes.length || !boardW || !boardH) return;

    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.width));
    const maxY = Math.max(...boxes.map((b) => b.y + b.height));

    const PAD = 48;
    const scale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, Math.min(boardW / (maxX - minX + PAD * 2), boardH / (maxY - minY + PAD * 2)))
    );

    // Centre the content box in the viewport at the new scale.
    const next = {
      x: boardW / 2 - ((minX + maxX) / 2) * scale,
      y: boardH / 2 - ((minY + maxY) / 2) * scale,
    };

    scaleValue.value = withTiming(scale, { duration: 240 });
    translateX.value = withTiming(next.x, { duration: 240 });
    translateY.value = withTiming(next.y, { duration: 240 });
  }, [displayNotes, groups, scaleValue, translateX, translateY]);

  return (
    <View className="flex-1 bg-board">
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
              {toolMode === 'arrow'
                ? linkSourceId
                  ? 'Now tap the note that belongs under it'
                  : 'Tap the main idea first'
                : toolMode === 'write'
                  ? 'Tap a note to write in it'
                  : toolMode === 'select'
                  ? `Tap notes to select · ${selectedIds.length} chosen`
                  : 'Pinch to zoom · hold a note to move it'}
            </Text>
          </View>
        </TouchableOpacity>
        <CreditChip balance={creditBalance} onPress={onOpenCredits} />
        {/* Tidy and recordings live in the canvas toolbar — they act on the
            board, so they belong beside it rather than in the chrome. */}
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
        <View className="flex-1 overflow-hidden" onLayout={onBoardLayout}>
          {/* Inside the board, not behind the whole screen: the grid scales
              about its own top-left, so it has to share an origin with the note
              container or the two would slide apart as you pinch. */}
          <CanvasBackground translateX={translateX} translateY={translateY} scale={scaleValue} />
          <Animated.View
            style={[
              { width: '100%', height: '100%', transformOrigin: 'top left' },
              canvasAnimatedStyle,
            ]}
          >
            {/* Frames first: they are the backdrop the notes sit on. */}
            {groups?.map((group) => (
              <NoteGroupFrame
                key={group.id}
                group={group}
                onRename={onRenameGroup}
                onMoveStart={handleGroupDragStart}
                onMoveEnd={handleMoveGroupEnd}
                onResize={onResizeGroup}
                onDelete={onDeleteGroup}
                canvasScale={scaleValue}
                linkMode={false}
              />
            ))}
            <NoteConnectors 
              notes={displayNotes} 
              activeDragState={activeDragState} 
              activeDragNotes={activeDragNotes} 
            />
            {displayNotes.map((note) => (
              <StickyNoteItem
                key={note.id}
                note={note}
                onUpdateColor={handleUpdateColor}
                onDelete={onDeleteNote}
                onDragStart={handleNoteDragStart}
                onMove={handleMoveNote}
                onMoveClusterEnd={handleMoveClusterEnd}
                onPressNote={onPressNote}
                canvasScale={scaleValue}
                childCount={childCounts?.get(note.id)}
                activeDragState={activeDragState}
                activeDragNotes={activeDragNotes}
                selected={selectedIds.includes(note.id)}
                linkRole={note.id === linkSourceId ? 'source' : null}
                onTap={handleNoteTap}
                onSaveContent={onSaveNoteContent}
                editRequested={note.id === editingNoteId}
                onEditRequestHandled={() => setEditingNoteId(null)}
              />
            ))}
          </Animated.View>
        </View>
      </GestureDetector>

      <CanvasToolbar
        onAddNote={
          onAddNote
            ? () => {
                const { x, y } = viewportCentre();
                onAddNote(x - 95, y - 72);
              }
            : undefined
        }
        onAddGroup={
          onAddGroup
            ? () => {
                const { x, y } = viewportCentre();
                onAddGroup(x - 230, y - 180);
              }
            : undefined
        }
        toolMode={toolMode}
        canConnect={Boolean(onSetNoteParent)}
        onSetToolMode={changeMode}
        onTidy={onTidy}
        onFitToView={displayNotes.length ? handleFitToView : undefined}
        // Recordings are an AI artefact; a Free board has none to list.
        onOpenRecordings={aiEnabled ? onOpenRecordings : undefined}
        showChildNotes={showChildNotes}
        onToggleChildNotes={() => setShowChildNotes(!showChildNotes)}
      />

      {/*
        The microphone only exists on a plan that includes it. Free keeps the
        entire board — showing a mic that fails on tap teaches people the app is
        broken rather than that the feature is paid.
      */}
      {aiEnabled ? (
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
      ) : onUpgrade ? (
        <View className="absolute inset-x-0 bottom-[30px] z-40 items-center px-8">
          <TouchableOpacity
            className="flex-row items-center px-5 py-3"
            style={clay({ color: colors.surface, radius: 24, depth: 0.8 })}
            activeOpacity={0.85}
            onPress={onUpgrade}
          >
            <Sparkles size={16} color={colors.accent} strokeWidth={2.5} />
            <Text className="ml-2 text-[13px] font-bold text-ink">
              Turn talking into notes
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
      </SafeAreaView>
    </View>
  );
};
