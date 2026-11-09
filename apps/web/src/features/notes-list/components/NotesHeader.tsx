'use client';

import React from 'react';
import { CreditChip } from '@/features/credits/components/CreditChip';
import { AppHeader } from '@/components/AppHeader';

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
}) => {
  return (
    <AppHeader
      title={title}
      subtitle={eyebrow || subtitle}
      showBack={true}
      actions={<CreditChip balance={creditBalance} onPress={onOpenCredits} />}
      showMenu={true}
      onOpenSpaces={onOpenSpaces}
    />
  );
};
