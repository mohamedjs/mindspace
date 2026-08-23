'use client';

import React from 'react';
import { useTheme } from '@/shared/theme';
import { clay, shade } from '@/shared/theme/clay';
import type { NoteTree } from '../hooks/useNoteTree';
import type { useCalendarDays } from '../hooks/useCalendarDays';
import { NoteListRow } from './NoteListRow';
import { WeekStrip } from './WeekStrip';
import { FreeDayEmptyState } from './FreeDayEmptyState';

interface CalendarPaneProps {
  calendar: ReturnType<typeof useCalendarDays>;
  tree: NoteTree;
  onPressNote?: (noteId: string) => void;
}

export const CalendarPane: React.FC<CalendarPaneProps> = ({ calendar, tree, onPressNote }) => {
  const { colors } = useTheme();
  const { today, selectedDay, setSelectedDay, week, dayNotes, countFor, shiftWeek, jumpToToday } =
    calendar;

  const dateObj = new Date(selectedDay);
  const formattedDayTitle = dateObj.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="flex flex-col flex-1 w-full pb-24">
      <WeekStrip
        week={week}
        selectedDay={selectedDay}
        today={today}
        countFor={countFor}
        onSelectDay={setSelectedDay}
        onShiftWeek={shiftWeek}
      />

      <div className="flex flex-row items-center justify-between px-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-extrabold text-ink">{formattedDayTitle}</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${colors.accent}20`, color: colors.accent }}>
            {dayNotes.length} {dayNotes.length === 1 ? 'note' : 'notes'}
          </span>
        </div>

        {selectedDay !== today && (
          <button
            type="button"
            className="px-3 py-1 cursor-pointer border-0 transition-transform hover:scale-105 active:scale-95"
            style={{ ...clay({ color: shade(colors.surface, -0.06), radius: 14, depth: 0.4 }) }}
            onClick={jumpToToday}
          >
            <span className="text-[11px] font-extrabold tracking-wide" style={{ color: colors.accent }}>
              Jump to today
            </span>
          </button>
        )}
      </div>

      {dayNotes.length === 0 ? (
        <FreeDayEmptyState />
      ) : (
        <div className="space-y-3">
          {dayNotes.map((item) => (
            <NoteListRow
              key={item.id}
              note={item}
              childrenOf={tree.childrenOf}
              dateStyle="time-only"
              onPress={onPressNote}
            />
          ))}
        </div>
      )}
    </div>
  );
};
