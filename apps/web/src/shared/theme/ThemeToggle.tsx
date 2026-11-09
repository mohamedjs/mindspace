'use client';

import React from 'react';
import { ThemePreference, useTheme } from './index';
import { clay, shade } from './clay';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Auto' },
];

export const ThemeToggle: React.FC = () => {
  const { preference, setPreference, colors } = useTheme();

  return (
    <div
      className="flex flex-row p-1.5"
      style={clay({ color: shade(colors.surface, -0.06), radius: 20, pressed: true })}
    >
      {OPTIONS.map((option) => {
        const isActive = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className="flex-1 min-h-[44px] flex items-center justify-center py-2 cursor-pointer border-0 bg-transparent transition-all"
            style={isActive ? clay({ color: colors.accent, radius: 15, depth: 0.7 }) : undefined}
            onClick={() => setPreference(option.value)}
          >
            <span
              className="text-sm font-semibold"
              style={{ color: isActive ? colors.onAccent : colors.muted }}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
