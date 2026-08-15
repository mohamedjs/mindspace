'use client';

import React from 'react';
import { CalendarDays } from 'lucide-react';
import { useTheme } from '@/shared/theme';
import { clay, shade } from '@/shared/theme/clay';

export const FreeDayEmptyState: React.FC = () => {
  const { colors } = useTheme();

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-20 text-center">
      <div
        className="mb-5 h-20 w-20 flex items-center justify-center"
        style={clay({ color: shade(colors.surface, -0.05), radius: 28, depth: 0.5 })}
      >
        <CalendarDays size={32} color={colors.muted} strokeWidth={1.8} />
      </div>
      <div className="text-lg font-bold text-ink">You have a free day</div>
      <div className="mt-1 text-sm text-muted">Take it easy</div>
    </div>
  );
};
