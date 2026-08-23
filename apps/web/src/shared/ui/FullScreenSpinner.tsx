'use client';

import React from 'react';
import { useTheme } from '../theme';

export function FullScreenSpinner() {
  const { colors } = useTheme();

  return (
    <div
      className="flex flex-1 items-center justify-center min-h-screen"
      style={{ backgroundColor: colors.canvas }}
      suppressHydrationWarning
    >
      <div
        className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: `${colors.accent} transparent ${colors.accent} ${colors.accent}` }}
        suppressHydrationWarning
      />
    </div>
  );
}
