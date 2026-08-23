'use client';

import React from 'react';
import { CalendarDays, List, type LucideIcon } from 'lucide-react';
import { useTheme } from '@/shared/theme';
import { clay, shade } from '@/shared/theme/clay';

export type NotesTab = 'list' | 'calendar';

interface ViewTabsProps {
  value: NotesTab;
  onChange: (next: NotesTab) => void;
}

const TABS: { value: NotesTab; icon: LucideIcon; label: string }[] = [
  { value: 'list', icon: List, label: 'All notes' },
  { value: 'calendar', icon: CalendarDays, label: 'Calendar' },
];

export const ViewTabs: React.FC<ViewTabsProps> = ({ value, onChange }) => {
  const { colors } = useTheme();

  return (
    <div
      className="w-full flex flex-row p-1.5 transition-all"
      style={clay({ color: shade(colors.surface, -0.06), radius: 20, pressed: true })}
    >
      {TABS.map(({ value: tab, icon: Icon, label }) => {
        const active = value === tab;
        return (
          <button
            key={tab}
            type="button"
            className="flex-1 flex flex-row items-center justify-center py-2.5 px-3 transition-all duration-200 cursor-pointer border-0 bg-transparent"
            style={
              active
                ? {
                    ...clay({ color: colors.accent, radius: 14, depth: 0.6 }),
                    boxShadow: `0 4px 12px ${colors.accent}40`,
                  }
                : undefined
            }
            onClick={() => onChange(tab)}
          >
            <Icon
              size={15}
              color={active ? colors.onAccent : colors.muted}
              strokeWidth={2.5}
              className="mr-2 transition-colors"
            />
            <span
              className="text-xs font-bold tracking-wide transition-colors"
              style={{ color: active ? colors.onAccent : colors.muted }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
