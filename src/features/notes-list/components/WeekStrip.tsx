import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Text } from '../../../shared/ui/Text';
import { useTheme } from '../../../shared/theme';

interface WeekStripProps {
  /** Seven day-start timestamps, Sunday first. */
  week: number[];
  selectedDay: number;
  today: number;
  /** Day-start -> how many notes sit on it, for the dot under each pill. */
  countFor: (day: number) => number;
  onSelectDay: (day: number) => void;
  onShiftWeek: (direction: -1 | 1) => void;
}

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** The row of day pills. Presentational — all the date maths lives in day.ts. */
export const WeekStrip: React.FC<WeekStripProps> = ({
  week,
  selectedDay,
  today,
  countFor,
  onSelectDay,
  onShiftWeek,
}) => {
  const { colors } = useTheme();

  return (
    <View className="mx-3 mt-3 flex-row items-center px-1 py-2">
      <TouchableOpacity onPress={() => onShiftWeek(-1)} hitSlop={12} className="px-1">
        <ChevronLeft size={18} color={colors.muted} strokeWidth={2.5} />
      </TouchableOpacity>

      <View className="flex-1 flex-row justify-between px-1">
        {week.map((day, i) => {
          const isSelected = day === selectedDay;
          const isToday = day === today;
          const hasNotes = countFor(day) > 0;

          return (
            <TouchableOpacity
              key={day}
              className="items-center px-1"
              onPress={() => onSelectDay(day)}
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
                    color: isSelected ? colors.onAccent : isToday ? colors.accent : colors.ink,
                  }}
                >
                  {new Date(day).getDate()}
                </Text>
              </View>

              {/* A dot says "something is here" without crowding in a number. */}
              <View
                className="mt-1 h-1 w-1 rounded-full"
                style={{
                  backgroundColor: hasNotes
                    ? isSelected
                      ? colors.accent
                      : colors.muted
                    : 'transparent',
                }}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity onPress={() => onShiftWeek(1)} hitSlop={12} className="px-1">
        <ChevronRight size={18} color={colors.muted} strokeWidth={2.5} />
      </TouchableOpacity>
    </View>
  );
};
