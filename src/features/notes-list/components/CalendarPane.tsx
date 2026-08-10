import React from 'react';
import { FlatList, TouchableOpacity } from 'react-native';
import { Text } from '../../../shared/ui/Text';
import { useTheme } from '../../../shared/theme';
import { clay, shade } from '../../../shared/theme/clay';
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

/**
 * Notes a day at a time. A note lands on the day it was given ("send the deck
 * tomorrow at 3") and otherwise on the day it was written — see noteDay().
 */
export const CalendarPane: React.FC<CalendarPaneProps> = ({ calendar, tree, onPressNote }) => {
  const { colors } = useTheme();
  const { today, selectedDay, setSelectedDay, week, dayNotes, countFor, shiftWeek, jumpToToday } =
    calendar;

  return (
    <>
      <WeekStrip
        week={week}
        selectedDay={selectedDay}
        today={today}
        countFor={countFor}
        onSelectDay={setSelectedDay}
        onShiftWeek={shiftWeek}
      />

      {selectedDay !== today && (
        <TouchableOpacity
          className="mx-3 mb-1 self-start px-3 py-1.5"
          style={clay({ color: shade(colors.surface, -0.06), radius: 12, depth: 0.4 })}
          onPress={jumpToToday}
        >
          <Text className="text-[11px] font-bold" style={{ color: colors.accent }}>
            Jump to today
          </Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={dayNotes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 140, flexGrow: 1 }}
        renderItem={({ item }) => (
          <NoteListRow
            note={item}
            childrenOf={tree.childrenOf}
            dateStyle="time-only"
            onPress={onPressNote}
          />
        )}
        ListEmptyComponent={<FreeDayEmptyState />}
      />
    </>
  );
};
