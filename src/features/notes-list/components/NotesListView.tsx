import React, { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RecordFab } from '../../../shared/ui/RecordFab';
import type { Note as StickyNoteData } from '../../../core/domain';
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

/**
 * The same notes as the canvas, read top to bottom instead of arranged in
 * space, with a calendar tab for reading them a day at a time.
 *
 * This component is only the shell — header, tabs, record button. Each tab is
 * its own pane and the date maths lives in hooks, so any one piece can be
 * changed without reading the rest.
 *
 * Sub-notes always nest under their parent here; indentation is the whole
 * point of a list, so the canvas-only "hide sub-notes" setting is ignored.
 */
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
    <View className="flex-1 bg-board">
      <SafeAreaView className="flex-1">
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

        <ViewTabs value={tab} onChange={setTab} />

        {isCalendar ? (
          <CalendarPane calendar={calendar} tree={tree} onPressNote={onPressNote} />
        ) : (
          <ListPane tree={tree} onPressNote={onPressNote} />
        )}

        <RecordFab onPress={onStartRecord} />
      </SafeAreaView>
    </View>
  );
};
