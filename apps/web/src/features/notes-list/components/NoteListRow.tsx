'use client';

import React from 'react';
import { ChevronRight, Calendar, Clock, CornerDownRight } from 'lucide-react';
import { useTheme } from '@/shared/theme';
import { clay, shade } from '@/shared/theme/clay';
import { readableTextOn } from '@/shared/theme/color';
import { noteColors } from '@/shared/constants/tokens';
import type { Note as StickyNoteData } from '@/core/domain';
import { dayLabel, startOfDay, timeLabel } from '../services/day';

interface NoteListRowProps {
  note: StickyNoteData;
  depth?: number;
  childrenOf?: Map<string, StickyNoteData[]>;
  dateStyle?: 'full' | 'time-only';
  onPress?: (noteId: string) => void;
}

export const NoteListRow: React.FC<NoteListRowProps> = ({
  note,
  depth = 0,
  childrenOf,
  dateStyle = 'full',
  onPress,
}) => {
  const { colors } = useTheme();
  const paper = note.color || noteColors[note.type]?.bg || '#FFF8BC';
  const kids = childrenOf?.get(note.id) ?? [];

  return (
    <div className="relative" style={{ marginLeft: depth ? depth * 24 : 0 }}>
      {depth > 0 && (
        <div
          className="absolute -left-3 top-0 bottom-3 w-3 border-l-2 border-b-2 rounded-bl-lg pointer-events-none"
          style={{ borderColor: `${colors.muted}40` }}
        />
      )}
      <button
        type="button"
        className="mb-3 w-full flex flex-row items-center p-4 text-left cursor-pointer border-0 transition-all duration-200 hover:-translate-y-0.5 group"
        style={{
          ...clay({ color: shade(colors.surface, depth ? -0.02 : -0.04), radius: 18, depth: depth ? 0.4 : 0.6 }),
          borderLeftWidth: 6,
          borderLeftColor: paper,
          borderLeftStyle: 'solid',
        }}
        onClick={() => onPress?.(note.id)}
      >
        <div className="flex-1 pr-3 min-w-0">
          {Boolean(note.title) && (
            <div className="text-[15px] font-bold text-ink truncate mb-0.5 group-hover:text-amber-600 transition-colors">
              {note.title}
            </div>
          )}
          <div className={`text-xs text-muted leading-relaxed ${depth ? 'line-clamp-2' : 'line-clamp-3'}`}>
            {note.content}
          </div>

          <div className="mt-2.5 flex flex-row items-center gap-2 flex-wrap">
            <span
              className="rounded-md px-2 py-0.5 inline-flex items-center shadow-sm"
              style={{ backgroundColor: paper }}
            >
              <span
                className="text-[10px] font-extrabold uppercase tracking-wider"
                style={{ color: readableTextOn(paper) }}
              >
                {note.type}
              </span>
            </span>

            {Boolean(note.dueAt) && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-md px-2 py-0.5"
                style={{ backgroundColor: `${colors.accent}18`, color: colors.accent }}
              >
                <Clock size={12} strokeWidth={2.5} />
                {dateStyle === 'time-only'
                  ? timeLabel(note.dueAt!)
                  : `${dayLabel(startOfDay(note.dueAt!))} · ${timeLabel(note.dueAt!)}`}
              </span>
            )}

            {kids.length > 0 && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted rounded-md px-2 py-0.5"
                style={{ backgroundColor: shade(colors.surface, -0.08) }}
              >
                <CornerDownRight size={12} strokeWidth={2.5} />
                {kids.length} {kids.length === 1 ? 'sub-note' : 'sub-notes'}
              </span>
            )}
          </div>
        </div>

        <div
          className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:translate-x-0.5"
          style={{ backgroundColor: shade(colors.surface, -0.06) }}
        >
          <ChevronRight size={16} color={colors.muted} strokeWidth={2.5} />
        </div>
      </button>

      {kids.map((child) => (
        <NoteListRow
          key={child.id}
          note={child}
          depth={depth + 1}
          childrenOf={childrenOf}
          dateStyle={dateStyle}
          onPress={onPress}
        />
      ))}
    </div>
  );
};
