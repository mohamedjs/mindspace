'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '@/shared/theme';
import { clay, shade } from '@/shared/theme/clay';

interface WeekStripProps {
  week: number[];
  selectedDay: number;
  today: number;
  countFor: (day: number) => number;
  onSelectDay: (day: number) => void;
  onShiftWeek: (direction: -1 | 1) => void;
}

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

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
    <div
      className="w-full flex flex-row items-center p-3 mb-4 transition-all"
      style={clay({ color: shade(colors.surface, -0.04), radius: 24, depth: 0.5 })}
    >
      <button
        type="button"
        className="h-9 w-9 flex items-center justify-center rounded-full cursor-pointer border-0 transition-transform active:scale-90"
        style={{ ...clay({ color: shade(colors.surface, -0.06), radius: 18, depth: 0.4 }) }}
        onClick={() => onShiftWeek(-1)}
        aria-label="Previous week"
      >
        <ChevronLeft size={18} color={colors.muted} strokeWidth={2.5} />
      </button>

      <div className="flex-1 flex flex-row justify-around px-2">
        {week.map((day, i) => {
          const isSelected = day === selectedDay;
          const isToday = day === today;
          const noteCount = countFor(day);

          return (
            <button
              key={day}
              type="button"
              className="flex flex-col items-center px-1.5 py-1 cursor-pointer bg-transparent border-0 group"
              onClick={() => onSelectDay(day)}
            >
              <span
                className="mb-1 text-[11px] font-bold tracking-wider uppercase"
                style={{ color: isSelected ? colors.accent : isToday ? colors.accent : colors.muted }}
              >
                {WEEKDAY_INITIALS[i]}
              </span>

              <span
                className="h-9 w-9 flex items-center justify-center rounded-2xl transition-all duration-200"
                style={
                  isSelected
                    ? {
                        ...clay({ color: colors.accent, radius: 14, depth: 0.6 }),
                        boxShadow: `0 4px 12px ${colors.accent}40`,
                      }
                    : isToday
                      ? {
                          borderWidth: 2,
                          borderColor: colors.accent,
                          borderStyle: 'solid',
                          backgroundColor: `${colors.accent}12`,
                        }
                      : {
                          backgroundColor: shade(colors.surface, -0.02),
                        }
                }
              >
                <span
                  className="text-[14px] font-extrabold"
                  style={{
                    color: isSelected ? colors.onAccent : isToday ? colors.accent : colors.ink,
                  }}
                >
                  {new Date(day).getDate()}
                </span>
              </span>

              <div className="mt-1 h-2 flex items-center justify-center gap-0.5">
                {noteCount > 0 && (
                  <span
                    className="h-1.5 w-1.5 rounded-full transition-transform group-hover:scale-125"
                    style={{
                      backgroundColor: isSelected ? colors.accent : '#f59e0b',
                    }}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="h-9 w-9 flex items-center justify-center rounded-full cursor-pointer border-0 transition-transform active:scale-90"
        style={{ ...clay({ color: shade(colors.surface, -0.06), radius: 18, depth: 0.4 }) }}
        onClick={() => onShiftWeek(1)}
        aria-label="Next week"
      >
        <ChevronRight size={18} color={colors.muted} strokeWidth={2.5} />
      </button>
    </div>
  );
};
