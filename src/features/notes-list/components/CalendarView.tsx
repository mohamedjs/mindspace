import React, { useMemo, useState } from 'react';
import { FlatList, TouchableOpacity, View } from 'react-native';
import { Text } from '../../../shared/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../shared/theme';
import { clay, clayAccent, shade } from '../../../shared/theme/clay';
import { CreditChip } from '../../credits/components/CreditChip';
import type { StickyNoteData } from '../../sticky-notes/components/StickyNoteItem';
import { NoteListRow } from './NoteListRow';
import { DAY_MS, dayLabel, noteDay, startOfDay, weekOf } from '../services/day';
import { CalendarDays, ChevronLeft, ChevronRight, Mic, Settings } from 'lucide-react-native';

interface CalendarViewProps {
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

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Notes a day at a time.
 *
 * A note lands on the day the speaker gave it ("send the deck tomorrow at 3")
 * and otherwise on the day it was written — see noteDay(). That fallback is
 * what makes the calendar useful before anyone has said a deadline out loud.
 */
export const CalendarView: React.FC<CalendarViewProps> = ({
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
  const { colors } = useTheme();
  const today = startOfDay(new Date());
  const [selectedDay, setSelectedDay] = useState(today);
  const [weekAnchor, setWeekAnchor] = useState(today);

  const week = useMemo(() => weekOf(weekAnchor), [weekAnchor]);

  // Every note bucketed by the day it belongs to, so the strip can show which
  // days have anything and the list below is a straight lookup.
  const byDay = useMemo(() => {
    const map = new Map<number, StickyNoteData[]>();
    notes?.forEach((note) => {
      const day = noteDay(note);
      if (day === null) return;
      map.set(day, [...(map.get(day) ?? []), note]);
    });
    return map;
  }, [notes]);

  const childrenOf = useMemo(() => {
    const map = new Map<string, StickyNoteData[]>();
    notes?.forEach((n) => {
      if (!n.parentId) return;
      map.set(n.parentId, [...(map.get(n.parentId) ?? []), n]);
    });
    return map;
  }, [notes]);

  // A sub-note whose parent is on the same day is already rendered nested
  // under it — listing it again at top level would duplicate it.
  const dayNotes = useMemo(() => {
    const all = byDay.get(selectedDay) ?? [];
    const ids = new Set(all.map((n) => n.id));
    return all
      .filter((n) => !n.parentId || !ids.has(n.parentId))
      .sort((a, b) => ((a.dueAt ?? a.createdAt ?? '') < (b.dueAt ?? b.createdAt ?? '') ? -1 : 1));
  }, [byDay, selectedDay]);

  const monthLabel = new Date(selectedDay).toLocaleDateString(undefined, {
    month: 'long',
    ...(new Date(selectedDay).getFullYear() !== new Date().getFullYear()
      ? { year: 'numeric' }
      : {}),
  });

  const shiftWeek = (direction: -1 | 1) => {
    // Half-day offset so a DST boundary can't land the anchor on the wrong day.
    const next = startOfDay(new Date(weekAnchor + direction * 7 * DAY_MS + DAY_MS / 2));
    setWeekAnchor(next);
    setSelectedDay(next);
  };

  return (
    <View className="flex-1 bg-board">
      <SafeAreaView className="flex-1">
        <View
          className="z-30 mx-3 mt-2 flex-row items-center justify-between px-4 py-3"
          style={clay({ color: colors.surface, radius: 24 })}
        >
          <TouchableOpacity
            className="flex-1"
            onPress={onOpenSpaces}
            disabled={!onOpenSpaces}
            activeOpacity={0.7}
          >
            <Text className="text-[11px] font-medium text-muted">{monthLabel}</Text>
            <Text className="text-[19px] font-bold text-ink">
              {dayLabel(selectedDay)} {onOpenSpaces ? '▾' : ''}
            </Text>
          </TouchableOpacity>
          <CreditChip balance={creditBalance} onPress={onOpenCredits} />
          {onOpenRecordings && (
            <TouchableOpacity
              className="ml-2 h-9 w-9 items-center justify-center"
              style={clay({ color: shade(colors.surface, -0.06), radius: 18, depth: 0.6 })}
              onPress={onOpenRecordings}
            >
              <Mic size={18} color={colors.ink} strokeWidth={2.5} />
            </TouchableOpacity>
          )}
          {onOpenSettings && (
            <TouchableOpacity
              className="ml-2 h-9 w-9 items-center justify-center"
              style={clay({ color: shade(colors.surface, -0.06), radius: 18, depth: 0.6 })}
              onPress={onOpenSettings}
            >
              <Settings size={18} color={colors.ink} strokeWidth={2.5} />
            </TouchableOpacity>
          )}
        </View>

        {/* Week strip */}
        <View className="mx-3 mt-3 flex-row items-center px-1 py-2">
          <TouchableOpacity onPress={() => shiftWeek(-1)} hitSlop={12} className="px-1">
            <ChevronLeft size={18} color={colors.muted} strokeWidth={2.5} />
          </TouchableOpacity>

          <View className="flex-1 flex-row justify-between px-1">
            {week.map((day, i) => {
              const isSelected = day === selectedDay;
              const isToday = day === today;
              const count = byDay.get(day)?.length ?? 0;

              return (
                <TouchableOpacity
                  key={day}
                  className="items-center px-1"
                  onPress={() => setSelectedDay(day)}
                  activeOpacity={0.7}
                >
                  <Text
                    className="mb-1.5 text-[11px] font-semibold"
                    style={{ color: isToday ? colors.accent : colors.muted }}
                  >
                    {WEEKDAY_INITIALS[i]}
                  </Text>
                  <View
                    className="h-9 w-9 items-center justify-center rounded-full"
                    style={
                      isSelected
                        ? { backgroundColor: colors.accent }
                        : isToday
                          ? { borderWidth: 1.5, borderColor: colors.accent }
                          : undefined
                    }
                  >
                    <Text
                      className="text-[15px] font-bold"
                      style={{
                        color: isSelected
                          ? colors.onAccent
                          : isToday
                            ? colors.accent
                            : colors.ink,
                      }}
                    >
                      {new Date(day).getDate()}
                    </Text>
                  </View>
                  {/* Dot means "something is here" without needing a number. */}
                  <View
                    className="mt-1 h-1 w-1 rounded-full"
                    style={{
                      backgroundColor: count ? (isSelected ? colors.accent : colors.muted) : 'transparent',
                    }}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity onPress={() => shiftWeek(1)} hitSlop={12} className="px-1">
            <ChevronRight size={18} color={colors.muted} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {selectedDay !== today && (
          <TouchableOpacity
            className="mx-3 mb-1 self-start px-3 py-1.5"
            style={clay({ color: shade(colors.surface, -0.06), radius: 12, depth: 0.4 })}
            onPress={() => {
              setSelectedDay(today);
              setWeekAnchor(today);
            }}
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
              childrenOf={childrenOf}
              dateStyle="time-only"
              onPress={onPressNote}
            />
          )}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-8 py-20">
              <View
                className="mb-5 h-20 w-20 items-center justify-center"
                style={clay({ color: shade(colors.surface, -0.05), radius: 28, depth: 0.5 })}
              >
                <CalendarDays size={32} color={colors.muted} strokeWidth={1.8} />
              </View>
              <Text className="text-lg font-bold text-ink">You have a free day</Text>
              <Text className="mt-1 text-sm text-muted">Take it easy</Text>
            </View>
          }
        />

        <View className="absolute inset-x-0 bottom-[30px] z-40 items-center">
          <TouchableOpacity
            className="h-[74px] w-[74px] items-center justify-center"
            style={[clayAccent(colors, 37), { shadowColor: colors.accent, shadowOpacity: 0.45 }]}
            activeOpacity={0.85}
            onPress={onStartRecord}
          >
            <View
              className="absolute h-[92px] w-[92px] rounded-full"
              style={{ backgroundColor: `${colors.accent}2E` }}
            />
            <Mic size={32} color="#FFF" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
};
