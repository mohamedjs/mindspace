'use client';

import React from 'react';
import { useTheme } from '@/shared/theme';

const BAR_COUNT = 32;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 90;

interface WaveformProps {
  level: number;
}

function Bar({ level, index }: { level: number; index: number }) {
  const { colors } = useTheme();
  const falloff = 1 - Math.abs(index - BAR_COUNT / 2) / (BAR_COUNT / 2);
  const weight = 0.35 + falloff * 0.65;
  const height = MIN_HEIGHT + level * weight * (MAX_HEIGHT - MIN_HEIGHT);

  return (
    <div
      className="mx-0.5 flex-1 rounded-full transition-all duration-75"
      style={{
        backgroundColor: colors.accent,
        height: `${height}px`,
      }}
    />
  );
}

export const Waveform: React.FC<WaveformProps> = ({ level }) => {
  return (
    <div
      className="w-full flex flex-row items-center justify-center"
      style={{ height: `${MAX_HEIGHT}px` }}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <Bar key={i} level={level} index={i} />
      ))}
    </div>
  );
};
