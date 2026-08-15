'use client';

import React from 'react';
import { Mic } from 'lucide-react';
import { useTheme } from '@/shared/theme';
import { clayAccent } from '@/shared/theme/clay';

interface RecordFabProps {
  onPress?: () => void;
}

export const RecordFab: React.FC<RecordFabProps> = ({ onPress }) => {
  const { colors } = useTheme();

  return (
    <div className="fixed inset-x-0 bottom-8 z-40 flex items-center justify-center pointer-events-none">
      <button
        type="button"
        className="relative h-[74px] w-[74px] flex items-center justify-center rounded-full pointer-events-auto cursor-pointer transition-transform hover:scale-105 active:scale-95 border-0"
        style={{
          ...clayAccent(colors, 37),
          boxShadow: `0 8px 16px ${colors.accent}66`,
        }}
        onClick={onPress}
        aria-label="Record a new note"
      >
        <span
          className="absolute h-[92px] w-[92px] rounded-full pointer-events-none"
          style={{ backgroundColor: `${colors.accent}2E` }}
        />
        <Mic size={32} color="#FFF" strokeWidth={2.5} className="z-10" />
      </button>
    </div>
  );
};
