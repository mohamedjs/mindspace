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
import { CanvasToolbar } from './CanvasToolbar';
import { LinkRubberBand } from './LinkRubberBand';
import { screenToWorld, zoomAbout } from '../utils/coords';
import {
  noteAtPoint,
  notesInRect,
  notesInsideRect,
  withDescendants,
  wouldCycle,
} from '../utils/graph';
import type { NoteGroup } from '../api/groups.api';
import { clay, clayAccent, shade } from '../../../shared/theme/clay';
import { Mic, Settings } from 'lucide-react-native';

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
   * What a one-finger drag on the board does.
   *
   *   pan     — move the board. The default, unlike web's `pointer`: on a phone
   *             panning is the constant need and a drag that drew a selection
   *             box instead would read as broken.
   *   pointer — marquee-select notes.
   *   arrow   — draw a parent -> child link.
   *
   * Encoded as one shared value rather than a flag per mode: three booleans
   * describe eight states, five of which are illegal, and that is where the
   * next bug would live.
   */
  const [toolMode, setToolMode] = useState<'pan' | 'pointer' | 'arrow'>('pan');
  const MODE = { pan: 0, pointer: 1, arrow: 2 } as const;
  const modeSV = useSharedValue<number>(MODE.pan);

  React.useEffect(() => {
    modeSV.value = MODE[toolMode];
  }, [toolMode, modeSV, MODE]);

  const arrowArmed = toolMode === 'arrow';
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [linkTargetId, setLinkTargetId] = useState<string | null>(null);

  /**
   * The same two ids, mirrored into refs.
   *
   * The pan gesture is rebuilt every render, so `runOnJS(finishLink)` captures
   * whichever closure existed when the drag *started* — before beginLink's
   * setState had rendered. Reading state there would see `null` on release and
   * the link would silently never commit. State drives the outlines; the refs
   * drive the logic.
   */
  const linkSourceRef = useRef<string | null>(null);
  const linkTargetRef = useRef<string | null>(null);

  const linkActive = useSharedValue(false);
  const linkSourceCentre = useSharedValue({ x: 0, y: 0 });
  const linkPointer = useSharedValue({ x: 0, y: 0 });

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

  const isTargetValid =
    Boolean(linkSourceId && linkTargetId) &&
    !wouldCycle(linkTargetId!, linkSourceId!, parentOf);

  /** Begin a link if the press landed on a note; otherwise the drag is a no-op. */
  const beginLink = React.useCallback(
    (wx: number, wy: number) => {
      const hit = noteAtPoint(wx, wy, displayNotes);
      if (!hit) return;
      const note = displayNotes.find((n) => n.id === hit)!;
      linkSourceCentre.value = {
        x: note.x + (note.width ?? 190) / 2,
        y: note.y + (note.height ?? 145) / 2,
      };
      linkActive.value = true;
      linkSourceRef.current = hit;
      setLinkSourceId(hit);
    },
    [displayNotes, linkActive, linkSourceCentre]
  );

  /**
   * Called on every move frame. setState with an unchanged id is a no-op in
   * React, so the canvas only re-renders when the note under the finger
   * actually changes.
   *
   * ponytail: linear scan per frame. Fine for the tens of notes a board holds;
   * index by grid cell if a space ever grows into the thousands.
   */
  const hoverLink = React.useCallback(
    (wx: number, wy: number) => {
      const hit = noteAtPoint(wx, wy, displayNotes);
      const next = hit && hit !== linkSourceRef.current ? hit : null;
      linkTargetRef.current = next;
      // setState with an unchanged id is a no-op, so this only re-renders when
      // the note under the finger actually changes.
      setLinkTargetId(next);
    },
    [displayNotes]
  );

  const finishLink = React.useCallback(() => {
    linkActive.value = false;

    const sourceId = linkSourceRef.current;
    const targetId = linkTargetRef.current;
    linkSourceRef.current = null;
    linkTargetRef.current = null;
    setLinkSourceId(null);
    setLinkTargetId(null);

    if (!sourceId || !targetId) return;
    // Re-check rather than trusting the render-time flag: the notes list can
    // have refetched between the last move frame and the release.
    if (wouldCycle(targetId, sourceId, parentOf)) return;

    const target = displayNotes.find((n) => n.id === targetId);
    const previousParentId = target?.parentId ?? null;
    if (previousParentId === sourceId) return; // already linked; nothing to do

    onSetNoteParent?.(targetId, sourceId);
    // One link per activation, then back to panning. Staying armed makes it far
    // too easy to re-parent a note you only meant to tap.
    setToolMode('pan');

    if (!showChildNotes) onLinkedWhileHidden?.(targetId, sourceId, previousParentId);
  }, [
    parentOf,
    displayNotes,
    onSetNoteParent,
    showChildNotes,
    onLinkedWhileHidden,
    linkActive,
  ]);

  // ─── Marquee selection ──────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Read from the gesture's onEnd, which closes over the render that started
  // the drag — same staleness trap as the link ids.
  const selectedRef = useRef<string[]>([]);
  const marqueeActive = useSharedValue(false);
  const marqueeFrom = useSharedValue({ x: 0, y: 0 });
  const marqueeTo = useSharedValue({ x: 0, y: 0 });

  const applySelection = React.useCallback((ids: string[]) => {
    selectedRef.current = ids;
    setSelectedIds(ids);
  }, []);

  const finishMarquee = React.useCallback(() => {
    const a = marqueeFrom.value;
    const b = marqueeTo.value;
    marqueeActive.value = false;

    // A tap, not a drag — treat it as "clear the selection" rather than
    // selecting whatever single note happened to be under the finger.
    if (Math.abs(b.x - a.x) < 6 && Math.abs(b.y - a.y) < 6) {
      applySelection([]);
      return;
    }

    const s = scaleValue.value;
    const toWorldX = (v: number) => (v - translateX.value) / s;
    const toWorldY = (v: number) => (v - translateY.value) / s;

    const x1 = toWorldX(Math.min(a.x, b.x));
    const y1 = toWorldY(Math.min(a.y, b.y));
    const x2 = toWorldX(Math.max(a.x, b.x));
    const y2 = toWorldY(Math.max(a.y, b.y));

    applySelection(notesInRect({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, displayNotes));
  }, [applySelection, displayNotes, marqueeActive, marqueeFrom, marqueeTo, scaleValue, translateX, translateY]);

  const cancelLink = React.useCallback(() => {
    linkActive.value = false;
    linkSourceRef.current = null;
    linkTargetRef.current = null;
    setLinkSourceId(null);
    setLinkTargetId(null);
  }, [linkActive]);

  /**
   * One pan, three jobs, chosen per gesture from `modeSV`.
   *
   * Swapping the composed gesture on a live GestureDetector is the flaky part
   * of gesture-handler, so the mode is read from a shared value inside the
   * worklet instead — that also guarantees a drag finishes in whichever mode it
   * started, even if the toolbar is tapped mid-drag.
   */
  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .onStart((e) => {
      if (modeSV.value === 2) {
        linkPointer.value = { x: e.x, y: e.y };
        const wx = (e.x - translateX.value) / scaleValue.value;
        const wy = (e.y - translateY.value) / scaleValue.value;
        runOnJS(beginLink)(wx, wy);
        return;
      }
      if (modeSV.value === 1) {
        marqueeFrom.value = { x: e.x, y: e.y };
        marqueeTo.value = { x: e.x, y: e.y };
        marqueeActive.value = true;
        return;
      }
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      if (marqueeActive.value) {
        marqueeTo.value = { x: e.x, y: e.y };
        return;
      }
      if (linkActive.value) {
        linkPointer.value = { x: e.x, y: e.y };
        const wx = (e.x - translateX.value) / scaleValue.value;
        const wy = (e.y - translateY.value) / scaleValue.value;
        runOnJS(hoverLink)(wx, wy);
        return;
      }
      // Still armed but the press missed every note — swallow the drag rather
      // than panning, so an arm-then-miss doesn't shove the board sideways.
      if (modeSV.value === 2) return;

      translateX.value = startX.value + e.translationX;
      translateY.value = startY.value + e.translationY;
    })
    .onEnd(() => {
      if (marqueeActive.value) {
        marqueeActive.value = false;
        runOnJS(finishMarquee)();
        return;
      }
      if (!linkActive.value) return;
      // Cleared here, in the worklet, so the onFinalize below sees the drag as
      // already resolved and does not also queue a cancel.
      linkActive.value = false;
      runOnJS(finishLink)();
    })
    .onFinalize(() => {
      // Covers a cancelled gesture (a second finger, a system interruption),
      // which fires onFinalize without onEnd and would otherwise strand the
      // rubber band or the marquee box on screen.
      if (linkActive.value) runOnJS(cancelLink)();
      marqueeActive.value = false;
    });

  const pinchGesture = Gesture.Pinch()
    .onStart((e) => {
      // Only blocked mid-arrow, not merely while armed: needing to zoom out to
      // reach the target note is the normal case, and forcing a disarm/re-arm
      // round trip for it makes the tool feel broken.
      if (linkActive.value) return;
      startScale.value = scaleValue.value;
      pinchStartX.value = translateX.value;
      pinchStartY.value = translateY.value;
      pinchFocalX.value = e.focalX;
      pinchFocalY.value = e.focalY;
    })
    .onUpdate((e) => {
      if (linkActive.value) return;
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

  /** Screen-space box, so it needs no world conversion while dragging. */
  const marqueeStyle = useAnimatedStyle(() => {
    const a = marqueeFrom.value;
    const b = marqueeTo.value;
    return {
      opacity: marqueeActive.value ? 1 : 0,
      left: Math.min(a.x, b.x),
      top: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
    };
  });

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
              {arrowArmed
                ? 'Drag from the idea to the note under it'
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
                linkMode={arrowArmed}
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
                linkMode={arrowArmed}
                selected={selectedIds.includes(note.id)}
                linkRole={
                  note.id === linkSourceId
                    ? 'source'
                    : note.id === linkTargetId
                      ? isTargetValid
                        ? 'valid'
                        : 'invalid'
                      : null
                }
              />
            ))}
          </Animated.View>
        </View>
      </GestureDetector>

      <Animated.View
        pointerEvents="none"
        className="absolute z-20 rounded-lg border-2"
        style={[
          { borderColor: colors.accent, backgroundColor: `${colors.accent}22` },
          marqueeStyle,
        ]}
      />

      <LinkRubberBand
        source={linkSourceCentre}
        pointer={linkPointer}
        active={linkActive}
        translateX={translateX}
        translateY={translateY}
        scale={scaleValue}
        valid={!linkTargetId || isTargetValid}
      />

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
        onSetToolMode={(mode) => {
          cancelLink();
          if (mode !== 'pointer') applySelection([]);
          setToolMode(mode);
        }}
        onTidy={onTidy}
        onFitToView={displayNotes.length ? handleFitToView : undefined}
        onOpenRecordings={onOpenRecordings}
        showChildNotes={showChildNotes}
        onToggleChildNotes={() => setShowChildNotes(!showChildNotes)}
      />

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
