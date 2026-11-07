import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { Text } from '../../../shared/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { StickyNoteItem } from '../../sticky-notes/components/StickyNoteItem';
import type { Note as StickyNoteData, NoteType } from '../../../core/domain';
import { CreditChip } from '../../credits/components/CreditChip';
import { useTheme } from '../../../shared/theme';
import { CanvasBackground } from './CanvasBackground';
import { NoteConnectors } from './NoteConnectors';
import { NoteGroupFrame } from './NoteGroupFrame';
import { CanvasToolbar, type ToolMode } from './CanvasToolbar';
import { screenToWorld, zoomAbout } from '../utils/coords';
import Toast from 'react-native-toast-message';
import { notesInsideRect, withDescendants, wouldCycle } from '../utils/graph';
import { UndoManager } from '../utils/undoStack';
import type { NoteGroup } from '../api/groups.api';
import { clay, shade } from '../../../shared/theme/clay';
import { Settings, Undo2, Redo2 } from 'lucide-react-native';

interface CanvasRootProps {
  spaceName?: string;
  creditBalance?: number;
  notes?: StickyNoteData[];
  groups?: NoteGroup[];
  onUpdateNoteColor?: (noteId: string, color: string) => void;
  onUpdateNoteType?: (noteId: string, type: NoteType) => void;
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
  lang?: 'en' | 'ar';
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

const MIN_SCALE = 0.12;
const MAX_SCALE = 2.5;

export const CanvasRoot: React.FC<CanvasRootProps> = ({
  spaceName = 'My MindSpace',
  creditBalance = 140,
  notes: propNotes,
  onUpdateNoteColor,
  onUpdateNoteType,
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
  lang = 'en',
}) => {
  const { colors, showChildNotes, setShowChildNotes } = useTheme();
  const [localNotes, setLocalNotes] = useState<StickyNoteData[]>(DEMO_FALLBACK_NOTES);
  const isDemo = propNotes === undefined;
  const displayNotes = isDemo ? localNotes : propNotes;

  // ─── Undo / Redo Manager ──────────────────────────────────────────────────
  const undoManager = useRef(new UndoManager(50));
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncUndoState = useCallback(() => {
    setCanUndo(undoManager.current.canUndo());
    setCanRedo(undoManager.current.canRedo());
  }, []);

  const handleUndo = useCallback(async () => {
    if (undoManager.current.canUndo()) {
      await undoManager.current.undo();
      syncUndoState();
    }
  }, [syncUndoState]);

  const handleRedo = useCallback(async () => {
    if (undoManager.current.canRedo()) {
      await undoManager.current.redo();
      syncUndoState();
    }
  }, [syncUndoState]);

  // Clear undo stack on unmount or space change
  useEffect(() => {
    undoManager.current.clear();
    setCanUndo(false);
    setCanRedo(false);
  }, [spaceName]);

  const handleUpdateColor = useCallback(
    (id: string, color: string) => {
      if (onUpdateNoteColor) {
        onUpdateNoteColor(id, color);
      } else {
        setLocalNotes((prev) => prev.map((item) => (item.id === id ? { ...item, color } : item)));
      }
    },
    [onUpdateNoteColor]
  );

  const handleUpdateType = useCallback(
    (id: string, type: NoteType) => {
      if (onUpdateNoteType) {
        onUpdateNoteType(id, type);
      } else {
        setLocalNotes((prev) => prev.map((item) => (item.id === id ? { ...item, type } : item)));
      }
    },
    [onUpdateNoteType]
  );

  const handleMoveNote = useCallback(
    (id: string, x: number, y: number) => {
      if (onMoveNote && !isDemo) {
        onMoveNote(id, x, y);
      } else {
        setLocalNotes((prev) => prev.map((item) => (item.id === id ? { ...item, x, y } : item)));
      }
    },
    [onMoveNote, isDemo]
  );

  const descendantsMap = useSharedValue<Record<string, string[]>>({});
  const activeDragState = useSharedValue({ id: null as string | null, dx: 0, dy: 0 });
  const activeDragNotes = useSharedValue<string[]>([]);

  useEffect(() => {
    const map: Record<string, string[]> = {};
    const childrenMap: Record<string, string[]> = {};
    for (const note of displayNotes) {
      if (note.parentId) {
        if (!childrenMap[note.parentId]) childrenMap[note.parentId] = [];
        childrenMap[note.parentId].push(note.id);
      }
    }

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

  const selectedRef = useRef<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const applySelection = useCallback((ids: string[]) => {
    selectedRef.current = ids;
    setSelectedIds(ids);
  }, []);

  const dragSetFor = useCallback(
    (id: string) => {
      const seeds = selectedRef.current.includes(id) ? selectedRef.current : [id];
      return withDescendants(seeds, descendantsMap.value).filter((n) => n !== id);
    },
    [descendantsMap]
  );

  const handleNoteDragStart = useCallback(
    (id: string) => {
      activeDragNotes.value = dragSetFor(id);
    },
    [activeDragNotes, dragSetFor]
  );

  const activeGroupDragNotes = useRef<string[]>([]);

  const handleGroupDragStart = useCallback(
    (groupId: string) => {
      const group = groups?.find((g) => g.id === groupId);
      if (!group) return;

      const inside = notesInsideRect(
        { x: group.x, y: group.y, w: group.width, h: group.height },
        displayNotes
      );

      activeGroupDragNotes.current = inside;
      activeDragNotes.value = inside;
    },
    [groups, displayNotes, activeDragNotes]
  );

  const handleMoveGroupEnd = useCallback(
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

  const handleMoveClusterEnd = useCallback(
    (id: string, finalX: number, finalY: number) => {
      const parent = displayNotes.find((n) => n.id === id);
      if (!parent) return;

      const dx = finalX - parent.x;
      const dy = finalY - parent.y;

      const moves = [{ id, x: finalX, y: finalY }];
      const prevPositions = [{ id, x: parent.x, y: parent.y }];

      for (const childId of dragSetFor(id)) {
        const child = displayNotes.find((n) => n.id === childId);
        if (child) {
          moves.push({ id: child.id, x: child.x + dx, y: child.y + dy });
          prevPositions.push({ id: child.id, x: child.x, y: child.y });
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

      undoManager.current.push({
        name: `move ${moves.length} notes`,
        undo: () => {
          if (onMoveCluster && !isDemo) onMoveCluster(prevPositions);
          else {
            setLocalNotes((prev) =>
              prev.map((item) => {
                const p = prevPositions.find((prevP) => prevP.id === item.id);
                return p ? { ...item, x: p.x, y: p.y } : item;
              })
            );
          }
        },
        redo: () => {
          if (onMoveCluster && !isDemo) onMoveCluster(moves);
          else {
            setLocalNotes((prev) =>
              prev.map((item) => {
                const m = moves.find((nextM) => nextM.id === item.id);
                return m ? { ...item, x: m.x, y: m.y } : item;
              })
            );
          }
        },
      });
      syncUndoState();
    },
    [displayNotes, dragSetFor, onMoveCluster, isDemo, syncUndoState]
  );

  // Infinite pan/zoom canvas: shared values on UI thread
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scaleValue = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const pinchStartX = useSharedValue(0);
  const pinchStartY = useSharedValue(0);
  const pinchFocalX = useSharedValue(0);
  const pinchFocalY = useSharedValue(0);
  const startScale = useSharedValue(1);

  // ─── Tool modes ─────────────────────────────────────────────────────────
  const [toolMode, setToolMode] = useState<ToolMode>('pan');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const panEnabled = useSharedValue(true);
  useEffect(() => {
    panEnabled.value = toolMode === 'pan' || toolMode === 'hand';
  }, [toolMode, panEnabled]);

  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);

  const parentOf = React.useMemo(
    () => new Map<string, string | null>(displayNotes.map((n) => [n.id, n.parentId ?? null])),
    [displayNotes]
  );

  const handleNoteTap = useCallback(
    (noteId: string) => {
      if (toolMode === 'write') {
        setEditingNoteId(noteId);
        return;
      }

      if (toolMode === 'select' || toolMode === 'pointer') {
        const next = selectedRef.current.includes(noteId)
          ? selectedRef.current.filter((id) => id !== noteId)
          : [...selectedRef.current, noteId];
        applySelection(next);
        return;
      }

      if (toolMode === 'arrow' || toolMode === 'connect') {
        if (!linkSourceId) {
          setLinkSourceId(noteId);
          return;
        }
        if (noteId === linkSourceId) {
          setLinkSourceId(null);
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
        const sourceId = linkSourceId;
        if (previousParentId !== sourceId) {
          onSetNoteParent?.(noteId, sourceId);
          if (!showChildNotes) onLinkedWhileHidden?.(noteId, sourceId, previousParentId);
          undoManager.current.push({
            name: 'connect note',
            undo: () => onSetNoteParent?.(noteId, previousParentId),
            redo: () => onSetNoteParent?.(noteId, sourceId),
          });
          syncUndoState();
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
      syncUndoState,
    ]
  );

  const handleNoteLongPress = useCallback(
    (noteId: string) => {
      applySelection([noteId]);
    },
    [applySelection]
  );

  const changeMode = useCallback(
    (mode: ToolMode) => {
      setLinkSourceId(null);
      setEditingNoteId(null);
      if (mode !== 'select' && mode !== 'pointer') applySelection([]);
      setToolMode(mode);
    },
    [applySelection]
  );

  // ─── Gesture declarations (§4 of IMPLEMENTATION_REFERENCE.md) ───────────
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
      translateX.value = zoomAbout(pinchFocalX.value, pinchStartX.value, startScale.value, next);
      translateY.value = zoomAbout(pinchFocalY.value, pinchStartY.value, startScale.value, next);
      scaleValue.value = next;
    });

  const canvasGesture = Gesture.Simultaneous(panGesture, pinchGesture);

  const canvasAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scaleValue.value },
    ],
  }));

  const boardSize = useRef({ width: 0, height: 0 });
  const onBoardLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    boardSize.current = { width, height };
  };

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

    const next = {
      x: boardW / 2 - ((minX + maxX) / 2) * scale,
      y: boardH / 2 - ((minY + maxY) / 2) * scale,
    };

    scaleValue.value = withTiming(scale, { duration: 240 });
    translateX.value = withTiming(next.x, { duration: 240 });
    translateY.value = withTiming(next.y, { duration: 240 });
  }, [displayNotes, groups, scaleValue, translateX, translateY]);

  const handleZoomIn = useCallback(() => {
    const { width: boardW, height: boardH } = boardSize.current;
    if (!boardW || !boardH) return;
    const currentScale = scaleValue.value;
    const nextScale = Math.min(MAX_SCALE, currentScale * 1.25);
    if (nextScale === currentScale) return;
    const focalX = boardW / 2;
    const focalY = boardH / 2;
    const nextX = zoomAbout(focalX, translateX.value, currentScale, nextScale);
    const nextY = zoomAbout(focalY, translateY.value, currentScale, nextScale);
    scaleValue.value = withTiming(nextScale, { duration: 200 });
    translateX.value = withTiming(nextX, { duration: 200 });
    translateY.value = withTiming(nextY, { duration: 200 });
  }, [scaleValue, translateX, translateY]);

  const handleZoomOut = useCallback(() => {
    const { width: boardW, height: boardH } = boardSize.current;
    if (!boardW || !boardH) return;
    const currentScale = scaleValue.value;
    const nextScale = Math.max(MIN_SCALE, currentScale / 1.25);
    if (nextScale === currentScale) return;
    const focalX = boardW / 2;
    const focalY = boardH / 2;
    const nextX = zoomAbout(focalX, translateX.value, currentScale, nextScale);
    const nextY = zoomAbout(focalY, translateY.value, currentScale, nextScale);
    scaleValue.value = withTiming(nextScale, { duration: 200 });
    translateX.value = withTiming(nextX, { duration: 200 });
    translateY.value = withTiming(nextY, { duration: 200 });
  }, [scaleValue, translateX, translateY]);

  // ─── Selection Bar Handlers ───────────────────────────────────────────────
  const handleGroupSelection = useCallback(() => {
    const selectedNotes = displayNotes.filter((n) => selectedIds.includes(n.id));
    if (selectedNotes.length === 0 || !onAddGroup) return;

    const minX = Math.min(...selectedNotes.map((n) => n.x));
    const minY = Math.min(...selectedNotes.map((n) => n.y));
    const maxX = Math.max(...selectedNotes.map((n) => n.x + (n.width || 240)));
    const maxY = Math.max(...selectedNotes.map((n) => n.y + (n.height || 200)));
    const PAD = 24;

    onAddGroup(minX - PAD, minY - PAD);
    undoManager.current.push({
      name: 'group selection',
      undo: () => {
        if (groups && groups.length > 0 && onDeleteGroup) {
          onDeleteGroup(groups[groups.length - 1].id);
        }
      },
      redo: () => {
        onAddGroup(minX - PAD, minY - PAD);
      },
    });
    syncUndoState();
    applySelection([]);
  }, [displayNotes, selectedIds, onAddGroup, groups, onDeleteGroup, syncUndoState, applySelection]);

  const handleLinkSelection = useCallback(() => {
    if (selectedIds.length !== 2 || !onSetNoteParent) return;
    const [parentId, childId] = selectedIds;

    if (wouldCycle(childId, parentId, parentOf)) {
      Toast.show({
        type: 'error',
        text1: 'That would make a loop',
        text2: 'A note cannot end up underneath one of its own sub-notes.',
      });
      return;
    }

    const child = displayNotes.find((n) => n.id === childId);
    const prevParent = child?.parentId ?? null;
    onSetNoteParent(childId, parentId);

    undoManager.current.push({
      name: 'link notes',
      undo: () => onSetNoteParent(childId, prevParent),
      redo: () => onSetNoteParent(childId, parentId),
    });
    syncUndoState();
    applySelection([]);
  }, [selectedIds, onSetNoteParent, parentOf, displayNotes, syncUndoState, applySelection]);

  const handleUnlinkSelection = useCallback(() => {
    if (!onSetNoteParent) return;
    const unlinked: Array<{ id: string; prevParent: string }> = [];

    selectedIds.forEach((id) => {
      const note = displayNotes.find((n) => n.id === id);
      if (note?.parentId) {
        unlinked.push({ id, prevParent: note.parentId });
        onSetNoteParent(id, null);
      }
    });

    if (unlinked.length > 0) {
      undoManager.current.push({
        name: 'unlink notes',
        undo: () => unlinked.forEach((u) => onSetNoteParent(u.id, u.prevParent)),
        redo: () => unlinked.forEach((u) => onSetNoteParent(u.id, null)),
      });
      syncUndoState();
    }
  }, [onSetNoteParent, selectedIds, displayNotes, syncUndoState]);

  const handleColorSelection = useCallback(
    (color: string) => {
      const prevColors = new Map<string, string>();
      selectedIds.forEach((id) => {
        const note = displayNotes.find((n) => n.id === id);
        if (note?.color) prevColors.set(id, note.color);
        handleUpdateColor(id, color);
      });

      undoManager.current.push({
        name: 'update color',
        undo: () => {
          prevColors.forEach((c, id) => handleUpdateColor(id, c));
        },
        redo: () => {
          selectedIds.forEach((id) => handleUpdateColor(id, color));
        },
      });
      syncUndoState();
    },
    [selectedIds, displayNotes, handleUpdateColor, syncUndoState]
  );

  const handleTypeSelection = useCallback(
    (type: NoteType) => {
      const prevTypes = new Map<string, NoteType>();
      selectedIds.forEach((id) => {
        const note = displayNotes.find((n) => n.id === id);
        if (note?.type) prevTypes.set(id, note.type);
        handleUpdateType(id, type);
      });

      undoManager.current.push({
        name: 'update type',
        undo: () => {
          prevTypes.forEach((t, id) => handleUpdateType(id, t));
        },
        redo: () => {
          selectedIds.forEach((id) => handleUpdateType(id, type));
        },
      });
      syncUndoState();
    },
    [selectedIds, displayNotes, handleUpdateType, syncUndoState]
  );

  const handleDuplicateSelection = useCallback(() => {
    if (!onAddNote) return;
    selectedIds.forEach((id) => {
      const note = displayNotes.find((n) => n.id === id);
      if (note) {
        onAddNote(note.x + 24, note.y + 24);
      }
    });
    applySelection([]);
  }, [onAddNote, selectedIds, displayNotes, applySelection]);

  const handleDeleteSelection = useCallback(() => {
    const deletedNotes = displayNotes.filter((n) => selectedIds.includes(n.id));
    selectedIds.forEach((id) => {
      onDeleteNote?.(id);
    });

    applySelection([]);
    undoManager.current.push({
      name: 'delete notes',
      undo: () => {
        deletedNotes.forEach((n) => onAddNote?.(n.x, n.y));
      },
      redo: () => {
        deletedNotes.forEach((n) => onDeleteNote?.(n.id));
      },
    });
    syncUndoState();
  }, [displayNotes, selectedIds, onDeleteNote, applySelection, onAddNote, syncUndoState]);

  const hasParentedSelectedNote = selectedIds.some((id) =>
    Boolean(displayNotes.find((n) => n.id === id)?.parentId)
  );

  return (
    <View className="flex-1 bg-board">
      <SafeAreaView className="flex-1">
        {/* Header with Space Name, Undo, Redo, CreditChip, Settings */}
        <View
          className="z-30 mx-3 mt-2 flex-row items-center justify-between px-3 py-2 shadow-sm"
          style={clay({ color: colors.surface, radius: 24 })}
        >
          {/* Space Selector */}
          <TouchableOpacity
            className="flex-1 flex-row items-center min-h-[44px]"
            onPress={onOpenSpaces}
            disabled={!onOpenSpaces}
            activeOpacity={0.7}
          >
            <View className="flex-1">
              <Text className="text-[17px] font-bold text-ink" numberOfLines={1}>
                {spaceName} {onOpenSpaces ? '▾' : ''}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Undo and Redo buttons (min 44x44pt) */}
          <View className="flex-row items-center gap-1 mr-2">
            <TouchableOpacity
              onPress={handleUndo}
              disabled={!canUndo}
              className={`w-11 h-11 items-center justify-center rounded-xl ${
                canUndo ? 'opacity-100' : 'opacity-30'
              }`}
              style={{ backgroundColor: shade(colors.surface, -0.04) }}
              accessibilityLabel="Undo"
              activeOpacity={0.7}
            >
              <Undo2 size={19} color={colors.ink} strokeWidth={2.4} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleRedo}
              disabled={!canRedo}
              className={`w-11 h-11 items-center justify-center rounded-xl ${
                canRedo ? 'opacity-100' : 'opacity-30'
              }`}
              style={{ backgroundColor: shade(colors.surface, -0.04) }}
              accessibilityLabel="Redo"
              activeOpacity={0.7}
            >
              <Redo2 size={19} color={colors.ink} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>

          <CreditChip balance={creditBalance} onPress={onOpenCredits} />

          {onOpenSettings && (
            <TouchableOpacity
              className="ml-2 h-11 w-11 items-center justify-center rounded-xl"
              style={clay({ color: shade(colors.surface, -0.06), radius: 14, depth: 0.6 })}
              onPress={onOpenSettings}
              accessibilityLabel="Settings"
            >
              <Settings size={18} color={colors.ink} strokeWidth={2.5} />
            </TouchableOpacity>
          )}
        </View>

        {/* Infinite pan/zoom board */}
        <GestureDetector gesture={canvasGesture}>
          <View className="flex-1 overflow-hidden" onLayout={onBoardLayout}>
            <CanvasBackground translateX={translateX} translateY={translateY} scale={scaleValue} />
            <Animated.View
              style={[
                { width: '100%', height: '100%', transformOrigin: 'top left' },
                canvasAnimatedStyle,
              ]}
            >
              {/* Groups / Frames */}
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
                  onLongPress={handleNoteLongPress}
                  onSaveContent={onSaveNoteContent}
                  editRequested={note.id === editingNoteId}
                  onEditRequestHandled={() => setEditingNoteId(null)}
                />
              ))}
            </Animated.View>
          </View>
        </GestureDetector>

        {/* Bottom Toolbar & Selection Bar */}
        <CanvasToolbar
          onAddNote={
            onAddNote
              ? () => {
                  const { x, y } = viewportCentre();
                  onAddNote(x - 95, y - 72);
                }
              : undefined
          }
          onAddSubNote={
            onAddNote && selectedIds.length === 1
              ? () => {
                  const parent = displayNotes.find((n) => n.id === selectedIds[0]);
                  if (parent) {
                    onAddNote(parent.x + 40, parent.y + (parent.height || 200) + 20);
                  }
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
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onOpenRecordings={aiEnabled ? onOpenRecordings : undefined}
          onStartRecord={aiEnabled ? onStartRecord : onUpgrade}
          showChildNotes={showChildNotes}
          onToggleChildNotes={() => setShowChildNotes(!showChildNotes)}
          selectedNoteCount={selectedIds.length}
          selectedGroupCount={0}
          hasParentedNote={hasParentedSelectedNote}
          arrowSourceId={linkSourceId}
          onGroupSelection={handleGroupSelection}
          onLinkSelection={handleLinkSelection}
          onUnlinkSelection={handleUnlinkSelection}
          onColorSelection={handleColorSelection}
          onTypeSelection={handleTypeSelection}
          onDuplicateSelection={handleDuplicateSelection}
          onDeleteSelection={handleDeleteSelection}
          onClearSelection={() => applySelection([])}
          onCancelMode={() => changeMode('pan')}
          lang={lang}
        />
      </SafeAreaView>
    </View>
  );
};
