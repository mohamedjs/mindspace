'use client';

import React, { useEffect, useState, useRef } from 'react';
import { X, GripHorizontal } from 'lucide-react';
import { useTheme } from '@/shared/theme';
import { shade } from '@/shared/theme/clay';
import type { NoteGroup } from '../api/groups.api';

interface NoteGroupFrameProps {
  group: NoteGroup;
  selected?: boolean;
  onSelect?: (id: string, e: React.PointerEvent) => void;
  onRename?: (id: string, title: string) => void;
  onMoveStart?: (id: string) => void;
  onPointerDragMove?: (id: string, dx: number, dy: number) => void;
  onMoveEnd?: (id: string, x: number, y: number) => void;
  onResize?: (id: string, width: number, height: number) => void;
  onDelete?: (id: string) => void;
  canvasScale?: number;
}

export const NoteGroupFrame: React.FC<NoteGroupFrameProps> = ({
  group,
  selected = false,
  onSelect,
  onRename,
  onMoveStart,
  onPointerDragMove,
  onMoveEnd,
  onResize,
  onDelete,
  canvasScale = 1,
}) => {
  const { colors, scheme } = useTheme();
  const [title, setTitle] = useState(group.title ?? '');
  const [currentPos, setCurrentPos] = useState({ x: group.x, y: group.y });
  const [currentSize, setCurrentSize] = useState({ width: group.width, height: group.height });

  useEffect(() => setTitle(group.title ?? ''), [group.title]);
  useEffect(() => {
    setCurrentPos({ x: group.x, y: group.y });
  }, [group.x, group.y]);
  useEffect(() => {
    setCurrentSize({ width: group.width, height: group.height });
  }, [group.width, group.height]);

  const pointerDownRef = useRef<{
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    mode: 'drag' | 'resize';
    initialWidth: number;
    initialHeight: number;
  } | null>(null);

  const handleDragStart = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    onSelect?.(group.id, e);

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    pointerDownRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: group.x,
      initialY: group.y,
      mode: 'drag',
      initialWidth: group.width,
      initialHeight: group.height,
    };

    onMoveStart?.(group.id);
  };

  const handleResizeStart = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    pointerDownRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: group.x,
      initialY: group.y,
      mode: 'resize',
      initialWidth: group.width,
      initialHeight: group.height,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const info = pointerDownRef.current;
    if (!info) return;

    const dxWorld = (e.clientX - info.startX) / canvasScale;
    const dyWorld = (e.clientY - info.startY) / canvasScale;

    if (info.mode === 'drag') {
      setCurrentPos({
        x: info.initialX + dxWorld,
        y: info.initialY + dyWorld,
      });
      onPointerDragMove?.(group.id, dxWorld, dyWorld);
    } else if (info.mode === 'resize') {
      setCurrentSize({
        width: Math.max(150, info.initialWidth + dxWorld),
        height: Math.max(100, info.initialHeight + dyWorld),
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const info = pointerDownRef.current;
    if (!info) return;

    pointerDownRef.current = null;
    const target = e.currentTarget as HTMLElement;
    try {
      target.releasePointerCapture(e.pointerId);
    } catch {}

    const dxWorld = (e.clientX - info.startX) / canvasScale;
    const dyWorld = (e.clientY - info.startY) / canvasScale;

    if (info.mode === 'drag') {
      const finalX = info.initialX + dxWorld;
      const finalY = info.initialY + dyWorld;
      onMoveEnd?.(group.id, finalX, finalY);
    } else if (info.mode === 'resize') {
      const finalW = Math.max(150, info.initialWidth + dxWorld);
      const finalH = Math.max(100, info.initialHeight + dyWorld);
      onResize?.(group.id, finalW, finalH);
    }
  };

  const frameColor = group.color ?? colors.accent;
  const tint = scheme === 'dark' ? '14' : '10';

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: currentPos.x,
        top: currentPos.y,
        width: currentSize.width,
        height: currentSize.height,
      }}
    >
      <div
        className="absolute inset-0 rounded-3xl border-2 border-dashed pointer-events-none"
        style={{
          borderColor: selected ? colors.accent : `${frameColor}66`,
          backgroundColor: `${frameColor}${tint}`,
        }}
      />

      {/* Header bar */}
      <div
        className="absolute -top-5 left-4 flex flex-row items-center rounded-xl px-3 py-1.5 shadow-sm pointer-events-auto cursor-grab active:cursor-grabbing select-none"
        style={{
          backgroundColor: shade(colors.surface, scheme === 'dark' ? 0.06 : -0.04),
          transform: `scale(${1 / Math.max(0.1, canvasScale)})`,
          transformOrigin: 'top left',
        }}
        onPointerDown={handleDragStart}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <GripHorizontal size={14} color={colors.muted} className="mr-1.5 shrink-0" />
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => onRename?.(group.id, title.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRename?.(group.id, title.trim());
          }}
          placeholder="Group name"
          className="min-w-[90px] py-0.5 text-xs font-bold bg-transparent border-0 outline-none"
          style={{ color: colors.ink }}
          onPointerDown={(e) => e.stopPropagation()} // Stop drag pointer capture on text input
        />
        {onDelete && (
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(group.id);
            }}
            className="ml-3 cursor-pointer border-0 bg-transparent flex items-center justify-center p-1 rounded-md hover:bg-black/10 transition-colors"
            title="Delete group frame"
          >
            <X size={14} color={colors.muted} strokeWidth={3} />
          </button>
        )}
      </div>

      {/* Resize Handle */}
      {onResize && (
        <div
          className="absolute bottom-[-10px] right-[-10px] h-12 w-12 flex items-center justify-center p-2 pointer-events-auto cursor-se-resize select-none"
          style={{
            transform: `scale(${1 / Math.max(0.1, canvasScale)})`,
            transformOrigin: 'bottom right',
            touchAction: 'none',
          }}
          onPointerDown={handleResizeStart}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div
            className="h-5 w-5 rounded-br-md border-b-[5px] border-r-[5px]"
            style={{ borderColor: `${frameColor}88` }}
          />
        </div>
      )}
    </div>
  );
};
