'use client';

import React from 'react';
import { useTheme } from '@/shared/theme';
import type { ToolMode } from './CanvasToolbar';

interface CanvasHintChipProps {
  toolMode: ToolMode;
  arrowSourceId: string | null;
  selectedCount: number;
  isMobile?: boolean;
  onCancel?: () => void;
  lang?: 'en' | 'ar';
}

export const CanvasHintChip: React.FC<CanvasHintChipProps> = ({
  toolMode,
  arrowSourceId,
  selectedCount,
  isMobile = false,
  onCancel,
  lang = 'en',
}) => {
  const { colors } = useTheme();

  let hintEn: string | null = null;
  let hintAr: string | null = null;

  if (toolMode === 'arrow' || toolMode === 'connect') {
    if (arrowSourceId) {
      hintEn = 'Now tap or drag to the child note';
      hintAr = 'الآن المس أو اسحب إلى الملاحظة التابعة';
    } else {
      hintEn = isMobile ? 'Tap the parent note' : 'Drag from one note to another';
      hintAr = isMobile ? 'المس الملاحظة الرئيسية' : 'اسحب من ملاحظة لأخرى';
    }
  } else if (toolMode === 'write') {
    hintEn = 'Tap a note to write in it';
    hintAr = 'المس ملاحظة للكتابة فيها';
  } else if (toolMode === 'pointer' && isMobile && selectedCount === 0) {
    hintEn = 'Tap notes to select';
    hintAr = 'المس الملاحظات لتحديدها';
  } else if (toolMode === 'pan' && !isMobile) {
    hintEn = 'Drag moves the board';
    hintAr = 'السحب يحرك اللوحة';
  }

  if (!hintEn) return null;

  const hintText = lang === 'ar' ? hintAr : hintEn;

  return (
    <div
      className={`fixed ${
        isMobile ? 'bottom-20 left-1/2 -translate-x-1/2' : 'bottom-6 left-1/2 -translate-x-1/2'
      } z-30 flex items-center gap-3 px-4 py-2 rounded-full shadow-lg pointer-events-auto transition-all`}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.line,
        borderWidth: 1,
        color: colors.ink,
      }}
      role="status"
      aria-live="polite"
    >
      <span className="text-xs sm:text-sm font-medium">{hintText}</span>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-2 py-0.5 rounded border border-line hover:bg-black/10 transition-colors font-mono cursor-pointer"
          style={{ color: colors.muted }}
          title={lang === 'ar' ? 'إلغاء (Esc)' : 'Cancel (Esc)'}
        >
          Esc
        </button>
      )}
    </div>
  );
};
