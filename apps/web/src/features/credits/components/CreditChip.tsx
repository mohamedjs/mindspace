'use client';

import React from 'react';
import { useTheme } from '@/shared/theme';

interface CreditChipProps {
  balance?: number;
  onPress?: () => void;
}

const DANGER = '#E53935';
const OK = '#4CAF50';

export const CreditChip: React.FC<CreditChipProps> = ({ balance = 100, onPress }) => {
  const { colors, scheme } = useTheme();
  const isLow = balance < 50;
  const isZero = balance <= 0;

  const accentColor = isZero ? DANGER : isLow ? colors.warning : OK;
  const textColor = isZero ? DANGER : isLow ? colors.warning : colors.ink;
  const tintAlpha = scheme === 'dark' ? '22' : '18';

  return (
    <button
      type="button"
      className="flex flex-row items-center rounded-full border px-3 py-1.5 transition-all cursor-pointer"
      style={{
        backgroundColor: isZero || isLow ? `${accentColor}${tintAlpha}` : colors.canvas,
        borderColor: isZero || isLow ? accentColor : colors.line,
      }}
      onClick={onPress}
    >
      <span className="mr-1.5 h-2 w-2 rounded-full inline-block" style={{ backgroundColor: accentColor }} />
      <span className="text-[13px] font-semibold" style={{ color: textColor }}>
        {balance}
      </span>
    </button>
  );
};
