'use client';

import React from 'react';
import { Mic, Settings } from 'lucide-react';
import { useTheme } from '@/shared/theme';
import { clay, shade } from '@/shared/theme/clay';
import { CreditChip } from '@/features/credits/components/CreditChip';

interface NotesHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  creditBalance: number;
  onOpenCredits?: () => void;
  onOpenSpaces?: () => void;
  onOpenSettings?: () => void;
  onOpenRecordings?: () => void;
}

export const NotesHeader: React.FC<NotesHeaderProps> = ({
  eyebrow,
  title,
  subtitle,
  creditBalance,
  onOpenCredits,
  onOpenSpaces,
  onOpenSettings,
  onOpenRecordings,
}) => {
  const { colors } = useTheme();
  const iconButton = clay({ color: shade(colors.surface, -0.06), radius: 18, depth: 0.6 });

  return (
    <div
      className="z-30 mx-3 mt-2 flex flex-row items-center justify-between px-4 py-3"
      style={clay({ color: colors.surface, radius: 24 })}
    >
      <button
        type="button"
        className="flex-1 text-left cursor-pointer bg-transparent border-0 p-0 disabled:cursor-default"
        onClick={onOpenSpaces}
        disabled={!onOpenSpaces}
      >
        {Boolean(eyebrow) && <div className="text-[11px] font-medium text-muted">{eyebrow}</div>}
        <div className="text-[19px] font-bold text-ink flex items-center gap-1">
          <span>{title}</span>
          {onOpenSpaces && <span className="text-xs">▾</span>}
        </div>
        {Boolean(subtitle) && (
          <div className="mt-0.5 text-[11px] font-medium text-muted">{subtitle}</div>
        )}
      </button>

      <CreditChip balance={creditBalance} onPress={onOpenCredits} />

      {onOpenRecordings && (
        <button
          type="button"
          className="ml-2 h-9 w-9 flex items-center justify-center cursor-pointer transition-opacity"
          style={iconButton}
          onClick={onOpenRecordings}
          aria-label="Recordings in this space"
        >
          <Mic size={18} color={colors.ink} strokeWidth={2.5} />
        </button>
      )}

      {onOpenSettings && (
        <button
          type="button"
          className="ml-2 h-9 w-9 flex items-center justify-center cursor-pointer transition-opacity"
          style={iconButton}
          onClick={onOpenSettings}
          aria-label="Settings"
        >
          <Settings size={18} color={colors.ink} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
};
