'use client';

import React, { useState } from 'react';
import { RecordFab } from '@/shared/ui/RecordFab';
import type { Note as StickyNoteData } from '@/core/domain';
import { useNoteTree } from '../hooks/useNoteTree';
import { useCalendarDays } from '../hooks/useCalendarDays';
import { dayLabel } from '../services/day';
import { NotesHeader } from './NotesHeader';
import { ViewTabs, type NotesTab } from './ViewTabs';
import { ListPane } from './ListPane';
import { CalendarPane } from './CalendarPane';

interface NotesListViewProps {
  spaceName: string;
  creditBalance: number;
  notes?: StickyNoteData[];
  onPressNote?: (noteId: string) => void;
  onStartRecord?: () => void;
  onOpenCredits?: () => void;
  onOpenSpaces?: () => void;
  onOpenSettings?: () => void;
  onOpenRecordings?: () => void;
}

export const NotesListView: React.FC<NotesListViewProps> = ({
  spaceName,
  creditBalance,
  notes,
  onPressNote,
  onStartRecord,
  onOpenCredits,
  onOpenSpaces,
  onOpenSettings,
  onOpenRecordings,
}) => {
  const [tab, setTab] = useState<NotesTab>('list');
  const tree = useNoteTree(notes);
  const calendar = useCalendarDays(notes);

  const isCalendar = tab === 'calendar';
  const selectedDate = new Date(calendar.selectedDay);

  return (
    <div className="flex flex-col flex-1 h-full w-full overflow-hidden bg-board relative">
      <div className="flex flex-col flex-1 h-full w-full overflow-hidden">
        <div className="shrink-0 w-full px-2 lg:px-6 pt-2">
          <div className="lg:hidden">
            <NotesHeader
              eyebrow={
                isCalendar
                  ? selectedDate.toLocaleDateString(undefined, {
                      month: 'long',
                      ...(selectedDate.getFullYear() !== new Date().getFullYear()
                        ? { year: 'numeric' }
                        : {}),
                    })
                  : undefined
              }
              title={isCalendar ? dayLabel(calendar.selectedDay) : spaceName}
              subtitle={isCalendar ? undefined : 'Tap a note to open it'}
              creditBalance={creditBalance}
              onOpenCredits={onOpenCredits}
              onOpenSpaces={onOpenSpaces}
              onOpenSettings={onOpenSettings}
              onOpenRecordings={onOpenRecordings}
            />
          </div>

          <ViewTabs value={tab} onChange={setTab} />
        </div>

        <div className="flex-1 overflow-y-auto w-full px-2 lg:px-6 py-4 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-black/10 dark:[&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-black/20 dark:hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
          {isCalendar ? (
            <CalendarPane calendar={calendar} tree={tree} onPressNote={onPressNote} />
          ) : (
            <ListPane tree={tree} onPressNote={onPressNote} />
          )}
        </div>

        <RecordFab onPress={onStartRecord} />
      </div>
    </div>
  );
};
