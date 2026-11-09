'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Check, Pencil } from 'lucide-react';
import { PushPin } from './PushPin';
import { ColorPicker } from './ColorPicker';
import { PeelFlap } from './PeelFlap';
import { useTheme, NOTE_SIZE_CONFIG } from '@/shared/theme';
import { noteColors } from '@/shared/constants/tokens';
import { shade } from '@/shared/theme/clay';
import { readableTextOn } from '@/shared/theme/color';
import type { Note } from '@/core/domain';

const CURL = 38;

export type StickyNoteData = Note;

interface StickyNoteItemProps {
  note: StickyNoteData;
  onUpdateColor?: (id: string, color: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onMoveClusterEnd?: (id: string, finalX: number, finalY: number) => void;
  onDelete?: (id: string) => void;
  onDragStart?: (id: string) => void;
  onPressNote?: (id: string, e?: React.PointerEvent) => void;
  onLongPressNote?: (id: string) => void;
  canvasScale?: number;
  childCount?: number;
  activeDragId?: string | null;
  activeDragDx?: number;
  activeDragDy?: number;
  activeDragClusterIds?: string[];
  onPointerDragStart?: (id: string) => void;
  onPointerDragMove?: (id: string, dx: number, dy: number) => void;
  onPointerDragEnd?: (id: string, finalX: number, finalY: number) => void;
  isDragDisabled?: boolean;
  isPanMode?: boolean;
  outlineState?: 'accent' | 'warning' | null;
  onArrowPointerDown?: (id: string, e: React.PointerEvent) => void;
  onArrowPointerEnter?: (id: string) => void;
  onArrowPointerLeave?: (id: string) => void;
  /** Save an inline edit made on the board, without opening the note. */
  onSaveContent?: (id: string, fields: { title: string | null; content: string }) => void;
  /** The canvas is asking this note to open for typing — the pencil tool. */
  editRequested?: boolean;
  onEditRequestHandled?: () => void;
}

export const StickyNoteItem = React.memo<StickyNoteItemProps>(function StickyNoteItem({
  note,
  onUpdateColor,
  onMove,
  onMoveClusterEnd,
  onDragStart,
  onPressNote,
  onLongPressNote,
  canvasScale = 1,
  childCount,
  activeDragId,
  activeDragDx = 0,
  activeDragDy = 0,
  activeDragClusterIds = [],
  onPointerDragStart,
  onPointerDragMove,
  onPointerDragEnd,
  isDragDisabled = false,
  isPanMode = false,
  outlineState = null,
  onArrowPointerDown,
  onArrowPointerEnter,
  onArrowPointerLeave,
  onSaveContent,
  editRequested,
  onEditRequestHandled,
}) {
  const [colorPickerVisible, setColorPickerVisible] = useState(false);

  /**
   * Inline editing, right on the board.
   *
   * Opening the full editor to fix a word was the commonest reason to leave the
   * canvas, and leaving the canvas loses your place on it. The draft is local
   * until saved, so a background refetch cannot overwrite what is being typed.
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

  useEffect(() => {
    if (editRequested && !editing) {
      beginEdit();
      onEditRequestHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequested]);
  const [isLifted, setIsLifted] = useState(false);

  const tilt = note.rotation ?? (((note.id.charCodeAt(0) || 0) % 5) - 2) * 1.2;

  const { noteSize } = useTheme();
  const sizeConfig = NOTE_SIZE_CONFIG[noteSize || 'medium'];

  const defaultScheme = noteColors[note.type] || noteColors.idea;
  const paperBg = note.color || defaultScheme.bg;
  const textColor = note.color ? readableTextOn(paperBg) : defaultScheme.text;

  const pointerDownRef = useRef<{
    startX: number;
    startY: number;
    initialNoteX: number;
    initialNoteY: number;
    pointerType: string;
    startTime: number;
    isDragging: boolean;
    longPressed: boolean;
    timer?: ReturnType<typeof setTimeout>;
  } | null>(null);

  const isClusterDragging =
    activeDragId &&
    activeDragId !== note.id &&
    activeDragClusterIds.includes(note.id);

  const currentX = note.x + (activeDragId === note.id ? activeDragDx : isClusterDragging ? activeDragDx : 0);
  const currentY = note.y + (activeDragId === note.id ? activeDragDy : isClusterDragging ? activeDragDy : 0);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;

    if (isPanMode) {
      // Let it bubble up to the canvas for panning
      return;
    }

    e.stopPropagation();

    if (isDragDisabled) {
      onArrowPointerDown?.(note.id, e);
      return;
    }

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const pointerType = e.pointerType;
    const startX = e.clientX;
    const startY = e.clientY;
    const startTime = Date.now();

    const info = {
      startX,
      startY,
      initialNoteX: note.x,
      initialNoteY: note.y,
      pointerType,
      startTime,
      isDragging: false,
      longPressed: false,
      timer: undefined as ReturnType<typeof setTimeout> | undefined,
    };
    pointerDownRef.current = info;

    if (pointerType === 'touch') {
      // A held finger selects. Dragging starts only once the finger actually moves.
      info.timer = setTimeout(() => {
        if (pointerDownRef.current && !pointerDownRef.current.isDragging) {
          pointerDownRef.current.longPressed = true;
          onLongPressNote?.(note.id);
        }
      }, 500);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const info = pointerDownRef.current;
    if (!info) return;

    const dxScreen = e.clientX - info.startX;
    const dyScreen = e.clientY - info.startY;
    const distance = Math.hypot(dxScreen, dyScreen);

    if (!info.isDragging) {
      if (distance > (info.pointerType === 'touch' ? 8 : 4)) {
        if (info.timer) clearTimeout(info.timer);
        info.isDragging = true;
        setIsLifted(true);
        onDragStart?.(note.id);
        onPointerDragStart?.(note.id);
      }
    }

    if (info.isDragging) {
      const worldDx = dxScreen / canvasScale;
      const worldDy = dyScreen / canvasScale;
      onPointerDragMove?.(note.id, worldDx, worldDy);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const info = pointerDownRef.current;
    if (!info) return;

    if (info.timer) clearTimeout(info.timer);
    pointerDownRef.current = null;

    const target = e.currentTarget as HTMLElement;
    try {
      target.releasePointerCapture(e.pointerId);
    } catch {}

    if (info.isDragging) {
      setIsLifted(false);
      const dxScreen = e.clientX - info.startX;
      const dyScreen = e.clientY - info.startY;
      const finalX = info.initialNoteX + dxScreen / canvasScale;
      const finalY = info.initialNoteY + dyScreen / canvasScale;

      if (onPointerDragEnd) {
        onPointerDragEnd(note.id, finalX, finalY);
      } else if (onMoveClusterEnd) {
        onMoveClusterEnd(note.id, finalX, finalY);
      } else {
        onMove?.(note.id, finalX, finalY);
      }
    } else {
      if (!info.longPressed) onPressNote?.(note.id, e);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setColorPickerVisible(true);
  };

  let outlineStyle = '';
  if (outlineState === 'accent') {
    outlineStyle = '0 0 0 3px #f59e0b, 0 0 12px rgba(245,158,11,0.5)';
  } else if (outlineState === 'warning') {
    outlineStyle = '0 0 0 3px #ef4444, 0 0 12px rgba(239,68,68,0.5)';
  }

  return (
    <div
      data-note-id={note.id}
      className={`absolute select-none ${isPanMode ? 'cursor-grab active:cursor-grabbing' : isDragDisabled ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
      style={{
        left: currentX,
        top: currentY,
        width: sizeConfig.width,
        minHeight: sizeConfig.height,
        transform: `rotate(${tilt}deg) scale(${isLifted ? 1.06 : 1})`,
        transition: isLifted ? 'transform 0.15s ease-out' : 'transform 0.2s ease-in-out',
        touchAction: 'none',
        boxShadow: outlineStyle || undefined,
        borderRadius: 4,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={handleContextMenu}
      onPointerEnter={() => onArrowPointerEnter?.(note.id)}
      onPointerLeave={() => onArrowPointerLeave?.(note.id)}
    >
      {/* Cast Shadow */}
      <div
        className="absolute inset-x-1 bottom-0 top-1 rounded-sm pointer-events-none transition-all duration-150"
        style={{
          backgroundColor: '#000',
          opacity: isLifted ? 0.34 : 0.2,
          boxShadow: isLifted
            ? '0 16px 20px rgba(0,0,0,0.5)'
            : '0 7px 9px rgba(0,0,0,0.3)',
          borderBottomRightRadius: CURL,
        }}
      />

      {/* Paper */}
      <div
        className="absolute inset-0 p-3.5 pt-[22px] flex flex-col justify-between"
        style={{
          backgroundColor: paperBg,
          borderTopLeftRadius: 3,
          borderTopRightRadius: 3,
          borderBottomLeftRadius: 3,
          borderBottomRightRadius: CURL,
        }}
      >
        {/*
          Pencil to start, check to commit — an explicit save rather than a
          silent one. On a board you glance at, a note that quietly rewrote
          itself would be worse than one extra click. The button doubles as the
          unsaved-changes indicator.
        */}
        {Boolean(onSaveContent) && (
          <button
            type="button"
            className="absolute right-1.5 top-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-full border-0 cursor-pointer"
            style={{ background: shade(paperBg, editing && dirty ? -0.3 : -0.12) }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (editing) {
                saveEdit();
              } else {
                beginEdit();
              }
            }}
            aria-label={editing ? 'Save note' : 'Write in this note'}
            title={editing ? 'Save note' : 'Write in this note'}
          >
            {editing ? (
              <Check size={15} color={textColor} strokeWidth={3} />
            ) : (
              <Pencil size={12} color={textColor} strokeWidth={2.5} />
            )}
          </button>
        )}

        <div className="mt-0.5 flex-1 overflow-hidden">
          {editing ? (
            <div
              // Typing must not reach the canvas: a pointerdown here is a caret
              // placement, not the start of a drag.
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') setEditing(false);
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit();
              }}
            >
              <input
                className="mb-1 w-full border-0 bg-transparent p-0 text-base font-bold tracking-[-0.2px] outline-none"
                style={{ color: textColor }}
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Title"
                autoFocus
              />
              <textarea
                className={`w-full resize-none border-0 bg-transparent p-0 outline-none ${sizeConfig.textClass}`}
                style={{ color: textColor, minHeight: 64 }}
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                placeholder="What is this about?"
                rows={3}
              />
            </div>
          ) : (
            <>
              {Boolean(note.title) && (
                <div
                  className="mb-1 text-base font-bold tracking-[-0.2px] truncate"
                  style={{ color: textColor }}
                >
                  {note.title}
                </div>
              )}
              <div
                className={`${sizeConfig.textClass} ${sizeConfig.clampClass}`}
                style={{ color: textColor }}
              >
                {note.content}
              </div>
            </>
          )}
        </div>

        <div className="mt-2.5 flex flex-row justify-start">
          <span
            className="rounded-md px-2 py-0.5 inline-block"
            style={{ backgroundColor: shade(paperBg, -0.12) }}
          >
            <span
              className="text-[10px] font-bold uppercase tracking-wide inline-block"
              style={{ color: textColor }}
            >
              {note.type}
            </span>
          </span>
        </div>
      </div>

      <PeelFlap size={CURL + 4} color={shade(paperBg, -0.15)} />

      {/* Metallic push pin */}
      <div className="absolute -top-[9px] left-0 right-0 z-20 flex justify-center pointer-events-none">
        <PushPin isLifted={isLifted} />
      </div>

      {Boolean(childCount) && (
        <div
          className="absolute -right-2 -top-2 z-20 h-6 min-w-6 flex items-center justify-center rounded-full px-1.5 shadow-md pointer-events-none"
          style={{ backgroundColor: shade(paperBg, -0.35) }}
        >
          <span className="text-[11px] font-bold" style={{ color: textColor }}>
            {childCount}
          </span>
        </div>
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
    </div>
  );
});
