'use client';

import React from 'react';
import type { Note as StickyNoteData } from '@/core/domain';

interface NoteConnectorsProps {
  notes: StickyNoteData[];
  activeDragId?: string | null;
  activeDragDx?: number;
  activeDragDy?: number;
  activeDragClusterIds?: string[];
  selectedChildId?: string | null;
  onSelectConnector?: (childId: string) => void;
  onContextMenuConnector?: (childId: string, e: React.MouseEvent) => void;
}

const centerOf = (n: StickyNoteData, dx = 0, dy = 0) => ({
  x: n.x + dx + (n.width ?? 250) / 2,
  y: n.y + dy + (n.height ?? 190) / 2,
});

/**
 * Calculates the point on the border of a rectangle (width, height)
 * where the line connecting (fx, fy) to (tx, ty) intersects it.
 */
function getTargetBorderPoint(
  fx: number,
  fy: number,
  tx: number,
  ty: number,
  w: number,
  h: number
) {
  const dx = tx - fx;
  const dy = ty - fy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return { x: tx, y: ty };

  const ux = dx / dist;
  const uy = dy / dist;

  const pad = 4;
  const hw = w / 2 + pad;
  const hh = h / 2 + pad;

  const scaleX = Math.abs(ux) > 0.0001 ? hw / Math.abs(ux) : Infinity;
  const scaleY = Math.abs(uy) > 0.0001 ? hh / Math.abs(uy) : Infinity;
  const scale = Math.min(scaleX, scaleY);

  return {
    x: tx - ux * scale,
    y: ty - uy * scale,
  };
}

export const NoteConnectors: React.FC<NoteConnectorsProps> = ({
  notes,
  activeDragId,
  activeDragDx = 0,
  activeDragDy = 0,
  activeDragClusterIds = [],
  selectedChildId,
  onSelectConnector,
  onContextMenuConnector,
}) => {
  const byId = new Map(notes.map((n) => [n.id, n]));

  const edges = notes.flatMap((note) => {
    if (!note.parentId) return [];
    const parent = byId.get(note.parentId);
    if (!parent) return [];

    const parentDx =
      activeDragId === parent.id || activeDragClusterIds.includes(parent.id)
        ? activeDragDx
        : 0;
    const parentDy =
      activeDragId === parent.id || activeDragClusterIds.includes(parent.id)
        ? activeDragDy
        : 0;

    const childDx =
      activeDragId === note.id || activeDragClusterIds.includes(note.id)
        ? activeDragDx
        : 0;
    const childDy =
      activeDragId === note.id || activeDragClusterIds.includes(note.id)
        ? activeDragDy
        : 0;

    const fromCenter = centerOf(parent, parentDx, parentDy);
    const toCenter = centerOf(note, childDx, childDy);
    const childW = note.width ?? 250;
    const childH = note.height ?? 190;

    const borderPoint = getTargetBorderPoint(
      fromCenter.x,
      fromCenter.y,
      toCenter.x,
      toCenter.y,
      childW,
      childH
    );

    return [
      {
        id: note.id,
        fromId: parent.id,
        from: fromCenter,
        toId: note.id,
        to: borderPoint,
      },
    ];
  });

  if (!edges.length) return null;

  const PAD = 1000;
  const xs = edges.flatMap((e) => [e.from.x, e.to.x]);
  const ys = edges.flatMap((e) => [e.from.y, e.to.y]);
  const minX = Math.min(...xs) - PAD;
  const minY = Math.min(...ys) - PAD;
  const width = Math.max(...xs) - minX + PAD;
  const height = Math.max(...ys) - minY + PAD;

  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: minX, top: minY, width, height }}
    >
      <svg width={width} height={height} className="w-full h-full overflow-visible">
        <defs>
          <marker
            id="arrowhead-default"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
          <marker
            id="arrowhead-selected"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
          </marker>
        </defs>

        {edges.map((edge) => {
          const fx = edge.from.x - minX;
          const fy = edge.from.y - minY;
          const tx = edge.to.x - minX;
          const ty = edge.to.y - minY;

          const isHorizontal = Math.abs(tx - fx) > Math.abs(ty - fy);
          const cpOffset = isHorizontal ? Math.abs(tx - fx) / 2 : Math.abs(ty - fy) / 2;

          const d = isHorizontal
            ? `M ${fx} ${fy} C ${fx + (tx > fx ? cpOffset : -cpOffset)} ${fy}, ${tx - (tx > fx ? cpOffset : -cpOffset)} ${ty}, ${tx} ${ty}`
            : `M ${fx} ${fy} C ${fx} ${fy + (ty > fy ? cpOffset : -cpOffset)}, ${tx} ${ty - (ty > fy ? cpOffset : -cpOffset)}, ${tx} ${ty}`;

          const isSelected = selectedChildId === edge.toId;

          return (
            <g key={edge.id}>
              {/* Wide hit area for clicking */}
              <path
                d={d}
                stroke="transparent"
                strokeWidth={20}
                fill="none"
                style={{ pointerEvents: 'stroke' }}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectConnector?.(edge.toId);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onContextMenuConnector?.(edge.toId, e);
                }}
              />
              {/* Visible path */}
              <path
                d={d}
                stroke={isSelected ? '#f59e0b' : '#94a3b8'}
                strokeWidth={isSelected ? 4 : 2.5}
                fill="none"
                strokeOpacity={isSelected ? 1 : 0.85}
                markerEnd={isSelected ? 'url(#arrowhead-selected)' : 'url(#arrowhead-default)'}
                className="pointer-events-none transition-all duration-150"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
