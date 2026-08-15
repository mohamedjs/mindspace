'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Settings, Menu, LogOut, Coins } from 'lucide-react';
import { toast } from 'sonner';
import { CreditChip } from '@/features/credits/components/CreditChip';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/shared/theme';
import { CanvasBackground } from './CanvasBackground';
import { NoteConnectors } from './NoteConnectors';
import { NoteGroupFrame } from './NoteGroupFrame';
import { CanvasToolbar, type ToolMode } from './CanvasToolbar';
import { screenToWorld, zoomAbout } from '../utils/coords';
import { wouldCycle } from '../utils/graph';
import type { NoteGroup } from '../api/groups.api';
import { clay, clayAccent, shade } from '@/shared/theme/clay';
import { StickyNoteItem } from '@/features/sticky-notes/components/StickyNoteItem';
import type { Note as StickyNoteData } from '@/core/domain';
import { useSetNoteParent, useUpdateNoteContent } from '@/features/sticky-notes/hooks/useNotes';

interface CanvasRootProps {
  spaceId?: string | null;
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
  onPressNote?: (noteId: string, e?: React.PointerEvent) => void;
  onAddNote?: (x: number, y: number) => void;
  onAddGroup?: (x: number, y: number) => void;
  onRenameGroup?: (groupId: string, title: string) => void;
  onMoveGroup?: (groupId: string, x: number, y: number) => void;
  onResizeGroup?: (groupId: string, width: number, height: number) => void;
  onDeleteGroup?: (groupId: string) => void;
  childCounts?: Map<string, number>;
}

const DEMO_FALLBACK_NOTES: StickyNoteData[] = [
  { id: '1', title: 'Onboarding Flow', content: 'Sketch wireframes for onboarding flow and clean voice prompt.', type: 'idea', color: '#FFF8BC', x: 40, y: 80 },
  { id: '2', title: 'Competitor Specs', content: 'Research competitor audio features in Figma & Miro.', type: 'task', color: '#F8BBD0', x: 250, y: 110 },
  { id: '3', title: 'User Feedback', content: 'Review user feedback on sticky note colors and push pin physics.', type: 'decision', color: '#C8E6C9', x: 30, y: 280 },
  { id: '4', title: 'Testing Sessions', content: 'Schedule user testing sessions (N=5) for voice-first canvas.', type: 'question', color: '#BBDEFB', x: 240, y: 310 },
  { id: '5', title: 'Color Palette', content: 'Finalize realistic paper color palette & typography.', type: 'reference', color: '#E1BEE7', x: 40, y: 500 },
];

const MIN_SCALE = 0.12;
const MAX_SCALE = 2.5;

export const CanvasRoot: React.FC<CanvasRootProps> = ({
  spaceId,
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
}) => {
  const { colors, showChildNotes, setShowChildNotes } = useTheme();
  const { user, signOut } = useAuth();
  const [localNotes, setLocalNotes] = useState<StickyNoteData[]>(DEMO_FALLBACK_NOTES);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const isDemo = propNotes === undefined;
  const displayNotes = isDemo ? localNotes : propNotes;

  const setParentMutation = useSetNoteParent(spaceId ?? null);

  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const translateRef = useRef(translate);
  translateRef.current = translate;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const boardRef = useRef<HTMLDivElement>(null);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeDragDelta, setActiveDragDelta] = useState({ dx: 0, dy: 0 });
  const [activeDragClusterIds, setActiveDragClusterIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Selection Box
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Tool Mode State
  const [toolMode, setToolMode] = useState<ToolMode>('pointer');
  /** Which note the pencil tool has asked to open for typing. */
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const isArrowArmed = toolMode === 'arrow';
  const isPanMode = toolMode === 'pan';

  const [arrowSourceId, setArrowSourceId] = useState<string | null>(null);
  const [arrowPointerWorld, setArrowPointerWorld] = useState<{ x: number; y: number } | null>(null);
  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);
  const [selectedConnectorChildId, setSelectedConnectorChildId] = useState<string | null>(null);
  const [connectorContextMenu, setConnectorContextMenu] = useState<{ childId: string; x: number; y: number } | null>(null);

  // Build parent lookup map for cycle checks
  const parentOfMap = new Map<string, string | null>(
    displayNotes.map((n) => [n.id, n.parentId ?? null])
  );

  const isHoveredValid =
    Boolean(arrowSourceId && hoveredTargetId) &&
    !wouldCycle(hoveredTargetId!, arrowSourceId!, parentOfMap);

  // Cycle-proof descendants computation (11.1.3 Guard 2)
  const descendantsMap = useRef<Record<string, string[]>>({});
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
    descendantsMap.current = map;
  }, [displayNotes]);

  const saveContentMutation = useUpdateNoteContent();
  const handleSaveNoteContent = useCallback(
    (noteId: string, fields: { title: string | null; content: string }) => {
      if (isDemo) {
        setLocalNotes((prev) =>
          prev.map((n) => (n.id === noteId ? { ...n, ...fields } : n))
        );
        return;
      }
      saveContentMutation.mutate({ noteId, ...fields });
    },
    [isDemo, saveContentMutation]
  );

  const handleSetNoteParent = useCallback(
    (noteId: string, parentId: string | null) => {
      if (!isDemo) {
        setParentMutation.mutate({ noteId, parentId });
      } else {
        setLocalNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, parentId } : n)));
      }
    },
    [isDemo, setParentMutation]
  );

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

  /**
   * Everything that travels with `id`.
   *
   * Union of the selection (when the dragged note is in it) and every
   * descendant of everything in that set. descendantsMap was being computed and
   * never read, so dragging a parent left its sub-notes behind — the one
   * spatial invariant the board has always had. The union restores it and keeps
   * multi-select working.
   */
  const dragSetFor = (id: string) => {
    const seeds = selectedIds.includes(id) ? selectedIds : [id];
    const out = new Set<string>();
    for (const seed of seeds) {
      out.add(seed);
      for (const d of descendantsMap.current[seed] ?? []) out.add(d);
    }
    return [...out];
  };

  const handlePointerDragStart = (id: string) => {
    setActiveDragId(id);
    setActiveDragDelta({ dx: 0, dy: 0 });

    if (!selectedIds.includes(id)) setSelectedIds([id]);
    setActiveDragClusterIds(dragSetFor(id));
  };

  const handlePointerDragMove = (id: string, dx: number, dy: number) => {
    setActiveDragDelta({ dx, dy });
  };

  const handlePointerDragEnd = (id: string, finalX: number, finalY: number) => {
    setActiveDragId(null);
    setActiveDragDelta({ dx: 0, dy: 0 });
    setActiveDragClusterIds([]);

    const parent = displayNotes.find((n) => n.id === id);
    if (!parent) return;

    const dx = finalX - parent.x;
    const dy = finalY - parent.y;

    const moves = [{ id, x: finalX, y: finalY }];

    for (const childId of dragSetFor(id)) {
      if (childId === id) continue; // Skip parent which is already in moves
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
  };

  // Group drag handlers
  const activeGroupDragNotes = useRef<string[]>([]);
  const handleGroupMoveStart = (groupId: string) => {
    const group = groups?.find((g) => g.id === groupId);
    if (!group) return;

    const inside = displayNotes
      .filter(
        (n) =>
          n.x >= group.x &&
          n.y >= group.y &&
          n.x + (n.width ?? 250) <= group.x + group.width &&
          n.y + (n.height ?? 190) <= group.y + group.height
      )
      .map((n) => n.id);

    activeGroupDragNotes.current = inside;
    setActiveDragId(groupId);
    setActiveDragClusterIds(inside);
  };

  const handleGroupMoveEnd = (groupId: string, finalX: number, finalY: number) => {
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
    setActiveDragId(null);
    setActiveDragClusterIds([]);
  };

  // Zoom function pinning focal point
  const zoomTo = useCallback((nextScale: number, focalX: number, focalY: number) => {
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    const currentT = translateRef.current;
    const currentS = scaleRef.current;

    setTranslate({
      x: zoomAbout(focalX, currentT.x, currentS, s),
      y: zoomAbout(focalY, currentT.y, currentS, s),
    });
    setScale(s);
  }, []);

  // Wheel listener for zoom
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const step = e.ctrlKey ? 0.01 : 0.0015;
      const focalX = e.clientX - rect.left;
      const focalY = e.clientY - rect.top;

      zoomTo(scaleRef.current * Math.exp(-e.deltaY * step), focalX, focalY);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomTo]);

  // Touch listener for pinch-to-zoom
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;

    let initialDist: number | null = null;
    let initialScale: number | null = null;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialDist = Math.hypot(dx, dy);
        initialScale = scaleRef.current;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialDist && initialScale) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        
        const rect = el.getBoundingClientRect();
        const focalX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const focalY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

        // Apply scale delta to the initial scale at start of pinch
        const scaleFactor = dist / initialDist;
        zoomTo(initialScale * scaleFactor, focalX, focalY);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialDist = null;
        initialScale = null;
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });
    el.addEventListener('touchcancel', onTouchEnd, { passive: false });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [zoomTo]);

  // Keyboard navigation, shortcuts, Escape & Delete detaching
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

          if (e.key === 'Escape') {
        setToolMode('pointer');
        setArrowSourceId(null);
        setArrowPointerWorld(null);
        setHoveredTargetId(null);
        setSelectedConnectorChildId(null);
        setConnectorContextMenu(null);
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedConnectorChildId) {
        e.preventDefault();
        handleSetNoteParent(selectedConnectorChildId, null);
        setSelectedConnectorChildId(null);
        toast.success('Disconnected sub-note');
        return;
      }

      if (e.key === '+' || e.key === '=') {
        const board = boardRef.current;
        if (!board) return;
        const rect = board.getBoundingClientRect();
        zoomTo(scaleRef.current * 1.2, rect.width / 2, rect.height / 2);
      } else if (e.key === '-') {
        const board = boardRef.current;
        if (!board) return;
        const rect = board.getBoundingClientRect();
        zoomTo(scaleRef.current / 1.2, rect.width / 2, rect.height / 2);
      } else if (e.key === '0') {
        setScale(1);
        setTranslate({ x: 0, y: 0 });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomTo, selectedConnectorChildId, handleSetNoteParent]);

  // Pointer events for Canvas Pan & Arrow Tool
  const panPointerRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);

  const handleArrowPointerDown = (sourceId: string, e: React.PointerEvent) => {
    e.stopPropagation();
    setArrowSourceId(sourceId);
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const world = screenToWorld(
      e.clientX - rect.left,
      e.clientY - rect.top,
      translateRef.current,
      scaleRef.current
    );
    setArrowPointerWorld(world);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setSelectedConnectorChildId(null);
    setConnectorContextMenu(null);

    if (isArrowArmed) {
      if (!arrowSourceId) return;
    }

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    if (isPanMode) {
      panPointerRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startTx: translate.x,
        startTy: translate.y,
      };
    } else if (toolMode === 'pointer') {
      const board = boardRef.current;
      if (board) {
        const rect = board.getBoundingClientRect();
        const worldPos = screenToWorld(
          e.clientX - rect.left,
          e.clientY - rect.top,
          translateRef.current,
          scaleRef.current
        );
        setSelectionBox({
          startX: worldPos.x,
          startY: worldPos.y,
          currentX: worldPos.x,
          currentY: worldPos.y,
        });
        setSelectedIds([]); // clicking canvas clears selection
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const board = boardRef.current;
    if (board && isArrowArmed && arrowSourceId) {
      const rect = board.getBoundingClientRect();
      const world = screenToWorld(
        e.clientX - rect.left,
        e.clientY - rect.top,
        translateRef.current,
        scaleRef.current
      );
      setArrowPointerWorld(world);

      // Hit-test element under pointer for note target
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const noteEl = el?.closest('[data-note-id]');
      const targetId = noteEl?.getAttribute('data-note-id') ?? null;
      if (targetId !== arrowSourceId) {
        setHoveredTargetId(targetId);
      } else {
        setHoveredTargetId(null);
      }
      return;
    }

    if (panPointerRef.current && isPanMode) {
      const dx = e.clientX - panPointerRef.current.startX;
      const dy = e.clientY - panPointerRef.current.startY;
      setTranslate({
        x: panPointerRef.current.startTx + dx,
        y: panPointerRef.current.startTy + dy,
      });
      return;
    }

    if (selectionBox && toolMode === 'pointer') {
      const board = boardRef.current;
      if (board) {
        const rect = board.getBoundingClientRect();
        const worldPos = screenToWorld(
          e.clientX - rect.left,
          e.clientY - rect.top,
          translateRef.current,
          scaleRef.current
        );
        setSelectionBox({
          ...selectionBox,
          currentX: worldPos.x,
          currentY: worldPos.y,
        });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isArrowArmed && arrowSourceId) {
      if (hoveredTargetId && isHoveredValid) {
        const sourceNote = displayNotes.find((n) => n.id === arrowSourceId);
        const targetNote = displayNotes.find((n) => n.id === hoveredTargetId);

        if (sourceNote && targetNote) {
          const previousParentId = targetNote.parentId ?? null;
          handleSetNoteParent(targetNote.id, sourceNote.id);
          setToolMode('pointer');

          if (!showChildNotes) {
            toast(`Now a sub-note of «${sourceNote.title || 'parent'}»`, {
              action: {
                label: 'Show sub-notes',
                onClick: () => setShowChildNotes(true),
              },
            });
          }
        }
      }
      setArrowSourceId(null);
      setArrowPointerWorld(null);
      setHoveredTargetId(null);
      return;
    }

    if (panPointerRef.current) {
      panPointerRef.current = null;
    }

    if (selectionBox && toolMode === 'pointer') {
      const minX = Math.min(selectionBox.startX, selectionBox.currentX);
      const maxX = Math.max(selectionBox.startX, selectionBox.currentX);
      const minY = Math.min(selectionBox.startY, selectionBox.currentY);
      const maxY = Math.max(selectionBox.startY, selectionBox.currentY);

      if (maxX - minX > 5 && maxY - minY > 5) {
        const selected = displayNotes.filter((n) => {
          const nw = n.width ?? 250;
          const nh = n.height ?? 190;
          return n.x < maxX && n.x + nw > minX && n.y < maxY && n.y + nh > minY;
        });
        setSelectedIds(selected.map((s) => s.id));
      }
      setSelectionBox(null);
    }
    const target = e.currentTarget as HTMLElement;
    try {
      target.releasePointerCapture(e.pointerId);
    } catch {}
  };

  // Viewport center helper
  const viewportCentre = useCallback(() => {
    const el = boardRef.current;
    const w = el ? el.clientWidth : window.innerWidth;
    const h = el ? el.clientHeight : window.innerHeight;
    return screenToWorld(w / 2, h / 2, translateRef.current, scaleRef.current);
  }, []);

  // Fit to view
  const handleFitToView = useCallback(() => {
    const boxes = [
      ...displayNotes.map((n) => ({
        x: n.x,
        y: n.y,
        width: n.width ?? 250,
        height: n.height ?? 190,
      })),
      ...(groups ?? []),
    ];
    const el = boardRef.current;
    const boardW = el ? el.clientWidth : window.innerWidth;
    const boardH = el ? el.clientHeight : window.innerHeight;

    if (!boxes.length || !boardW || !boardH) return;

    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.width));
    const maxY = Math.max(...boxes.map((b) => b.y + b.height));

    const PAD = 48;
    const targetScale = Math.min(
      MAX_SCALE,
      Math.max(
        MIN_SCALE,
        Math.min(boardW / (maxX - minX + PAD * 2), boardH / (maxY - minY + PAD * 2))
      )
    );

    const nextTranslate = {
      x: boardW / 2 - ((minX + maxX) / 2) * targetScale,
      y: boardH / 2 - ((minY + maxY) / 2) * targetScale,
    };

    setIsTransitioning(true);
    setScale(targetScale);
    setTranslate(nextTranslate);

    setTimeout(() => {
      setIsTransitioning(false);
    }, 250);
  }, [displayNotes, groups]);

  // Compute rubberband line source center
  const sourceNote = displayNotes.find((n) => n.id === arrowSourceId);
  const sourceCenter = sourceNote
    ? {
        x: sourceNote.x + (sourceNote.width ?? 250) / 2,
        y: sourceNote.y + (sourceNote.height ?? 190) / 2,
      }
    : null;

  const userChar = user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <div className="flex flex-col flex-1 h-screen w-screen overflow-hidden bg-board select-none">
      {/* Mobile Sidebar Toggle */}
      <div className="fixed top-4 left-4 z-30 lg:hidden">
        <button
          type="button"
          className="h-10 w-10 flex items-center justify-center cursor-pointer border-0 transition-opacity"
          style={clay({ color: colors.surface, radius: 14, depth: 0.6 })}
          onClick={onOpenSpaces}
          aria-label="Menu"
        >
          <Menu size={20} color={colors.ink} strokeWidth={2.5} />
        </button>
      </div>

      {/* Mobile User Avatar */}
      <div className="fixed top-4 right-4 z-30 lg:hidden">
        <div className="relative">
          <button
            type="button"
            className="h-10 w-10 flex items-center justify-center cursor-pointer border-0 font-bold transition-transform active:scale-95"
            style={clay({ color: colors.accent, radius: 14, depth: 0.8 })}
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            aria-label="User Menu"
          >
            <span className="text-white text-sm">{userChar}</span>
          </button>

          {userMenuOpen && (
            <div
              className="absolute top-full right-0 mt-2 w-48 py-1.5 px-1 rounded-2xl shadow-xl border border-line flex flex-col"
              style={{ backgroundColor: colors.surface }}
            >
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  onOpenSettings?.();
                }}
                className="flex flex-row items-center px-3 py-2 text-xs font-semibold hover:bg-black/5 rounded-xl border-0 bg-transparent cursor-pointer transition-colors"
                style={{ color: colors.ink }}
              >
                <Settings size={14} className="mr-2" />
                Settings
              </button>
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  onOpenCredits?.();
                }}
                className="flex flex-row items-center px-3 py-2 text-xs font-semibold text-amber-500 hover:bg-amber-50 rounded-xl border-0 bg-transparent cursor-pointer transition-colors"
              >
                <Coins size={14} className="mr-2" />
                Credits ({creditBalance})
              </button>
              <div className="h-[1px] my-1 mx-2" style={{ backgroundColor: shade(colors.surface, -0.1) }} />
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  if (confirm('Sign out?')) signOut();
                }}
                className="flex flex-row items-center px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-xl border-0 bg-transparent cursor-pointer transition-colors"
              >
                <LogOut size={14} className="mr-2" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Infinite Canvas Viewport */}
      <div
        ref={boardRef}
        className={`relative flex-1 overflow-hidden ${
          isArrowArmed ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
        }`}
        style={{ touchAction: 'none', overscrollBehavior: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <CanvasBackground translateX={translate.x} translateY={translate.y} scale={scale} />

        <div
          className="absolute inset-0 w-full h-full"
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: 'top left',
            transition: isTransitioning ? 'transform 240ms ease-out' : 'none',
          }}
        >
          {/* Note Groups */}
          {groups?.map((group) => (
            <NoteGroupFrame
              key={group.id}
              group={group}
              onRename={onRenameGroup}
              onMoveStart={handleGroupMoveStart}
              onPointerDragMove={handlePointerDragMove}
              onMoveEnd={handleGroupMoveEnd}
              onResize={onResizeGroup}
              onDelete={onDeleteGroup}
              canvasScale={scale}
            />
          ))}

          {/* Render Selection Box */}
          {selectionBox && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: Math.min(selectionBox.startX, selectionBox.currentX),
                top: Math.min(selectionBox.startY, selectionBox.currentY),
                width: Math.abs(selectionBox.startX - selectionBox.currentX),
                height: Math.abs(selectionBox.startY - selectionBox.currentY),
                backgroundColor: `${colors.accent}15`,
                border: `1px solid ${colors.accent}40`,
                borderRadius: 4,
              }}
            />
          )}

          {/* Connectors */}
          <NoteConnectors
            notes={displayNotes}
            activeDragId={activeDragId}
            activeDragDx={activeDragDelta.dx}
            activeDragDy={activeDragDelta.dy}
            activeDragClusterIds={activeDragClusterIds}
            selectedChildId={selectedConnectorChildId}
            onSelectConnector={(childId) => setSelectedConnectorChildId(childId)}
            onContextMenuConnector={(childId, e) => {
              setSelectedConnectorChildId(childId);
              setConnectorContextMenu({ childId, x: e.clientX, y: e.clientY });
            }}
          />

          {/* Rubber-band Arrow Line during drag */}
          {sourceCenter && arrowPointerWorld && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-30">
              <defs>
                <marker
                  id="arrowhead-rubber"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M 0 0 L 10 5 L 0 10 z"
                    fill={hoveredTargetId ? (isHoveredValid ? '#f59e0b' : '#ef4444') : '#f59e0b'}
                  />
                </marker>
              </defs>
              <line
                x1={sourceCenter.x}
                y1={sourceCenter.y}
                x2={arrowPointerWorld.x}
                y2={arrowPointerWorld.y}
                stroke={hoveredTargetId ? (isHoveredValid ? '#f59e0b' : '#ef4444') : '#f59e0b'}
                strokeWidth={3}
                strokeDasharray="6 4"
                markerEnd="url(#arrowhead-rubber)"
              />
            </svg>
          )}

          {/* Sticky Notes */}
          {displayNotes.map((note) => {
            let outline: 'accent' | 'warning' | null = null;
            if (hoveredTargetId === note.id) {
              outline = isHoveredValid ? 'accent' : 'warning';
            } else if (selectedIds.includes(note.id)) {
              outline = 'accent';
            }
            return (
              <StickyNoteItem
                key={note.id}
                note={note}
                onUpdateColor={handleUpdateColor}
                onDelete={onDeleteNote}
                onPressNote={(id, e) => {
                  // Pencil tool: a click opens the note for typing in place
                  // rather than navigating away from the board.
                  if (toolMode === 'write') {
                    setEditingNoteId(id);
                    return;
                  }
                  if (e?.shiftKey) {
                    setSelectedIds((prev) => 
                      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
                    );
                  } else {
                    onPressNote?.(id, e);
                  }
                }}
              canvasScale={scale}
              childCount={childCounts?.get(note.id)}
              activeDragId={activeDragId}
              activeDragDx={activeDragDelta.dx}
              activeDragDy={activeDragDelta.dy}
              activeDragClusterIds={activeDragClusterIds}
              onPointerDragStart={handlePointerDragStart}
              onPointerDragMove={handlePointerDragMove}
              onPointerDragEnd={handlePointerDragEnd}
              isDragDisabled={isArrowArmed || toolMode === 'write'}
              onSaveContent={handleSaveNoteContent}
              editRequested={note.id === editingNoteId}
              onEditRequestHandled={() => setEditingNoteId(null)}
              isPanMode={isPanMode}
              outlineState={outline}
              onArrowPointerDown={(id, e) => {
                if (toolMode === 'pointer' && !selectedIds.includes(id)) {
                  setSelectedIds([id]);
                }
                if (isArrowArmed) handleArrowPointerDown(id, e);
              }}
              onArrowPointerEnter={
                isArrowArmed ? (id) => setHoveredTargetId(id) : undefined
              }
              onArrowPointerLeave={
                isArrowArmed ? () => setHoveredTargetId(null) : undefined
              }
            />
            );
          })}
        </div>
      </div>

      {/* Floating Context Menu for Connector Detach */}
      {connectorContextMenu && (
        <div
          className="fixed z-50 py-1 px-1 rounded-xl shadow-xl border border-line"
          style={{
            left: connectorContextMenu.x,
            top: connectorContextMenu.y,
            backgroundColor: colors.surface,
          }}
        >
          <button
            type="button"
            onClick={() => {
              handleSetNoteParent(connectorContextMenu.childId, null);
              setSelectedConnectorChildId(null);
              setConnectorContextMenu(null);
              toast.success('Disconnected sub-note');
            }}
            className="flex flex-row items-center px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg border-0 bg-transparent cursor-pointer"
          >
            Detach sub-note
          </button>
        </div>
      )}

      <CanvasToolbar
        toolMode={toolMode}
        onSetToolMode={setToolMode}
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
        onTidy={onTidy}
        onFitToView={displayNotes.length ? handleFitToView : undefined}
        onOpenRecordings={onOpenRecordings}
        showChildNotes={showChildNotes}
        onToggleChildNotes={() => setShowChildNotes(!showChildNotes)}
        onUndo={() => toast('Undo coming soon')}
        onRedo={() => toast('Redo coming soon')}
      />

      {/* Floating Record FAB */}
      <div className="fixed inset-x-0 bottom-8 z-40 flex items-center justify-center pointer-events-none">
        <button
          type="button"
          className="relative h-[74px] w-[74px] flex items-center justify-center rounded-full pointer-events-auto cursor-pointer transition-transform hover:scale-105 active:scale-95 border-0"
          style={{
            ...clayAccent(colors, 37),
            boxShadow: `0 8px 16px ${colors.accent}66`,
          }}
          onClick={onStartRecord}
          aria-label="Record a new note"
        >
          <span
            className="absolute h-[92px] w-[92px] rounded-full pointer-events-none"
            style={{ backgroundColor: `${colors.accent}2E` }}
          />
          <Mic size={32} color="#FFF" strokeWidth={2.5} className="z-10" />
        </button>
      </div>
    </div>
  );
};
