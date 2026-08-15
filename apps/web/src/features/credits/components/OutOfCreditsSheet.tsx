'use client';

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { creditsToEgp } from '../hooks/useCredits';
import { useTheme } from '@/shared/theme';
import { clay, claySurface, shade } from '@/shared/theme/clay';

interface OutOfCreditsSheetProps {
  visible: boolean;
  requiredCredits: number;
  availableCredits: number;
  actionLabel?: string;
  onClose: () => void;
}

export const OutOfCreditsSheet: React.FC<OutOfCreditsSheetProps> = ({
  visible,
  requiredCredits,
  availableCredits,
  actionLabel = 'continue',
  onClose,
}) => {
  const router = useRouter();
  const { colors } = useTheme();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const shortfall = Math.max(0, requiredCredits - availableCredits);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (visible) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <dialog
      ref={dialogRef}
      className="backdrop:bg-black/65 bg-transparent border-0 p-0 m-0 w-full max-w-lg md:m-auto fixed inset-x-0 bottom-0 md:inset-0 z-50 flex items-end md:items-center justify-center"
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      onCancel={onClose}
    >
      <div
        className="w-full px-6 pb-10 pt-5 rounded-t-3xl md:rounded-3xl shadow-2xl"
        style={claySurface(colors, 32)}
      >
        <div
          className="mb-4 h-1 w-10 mx-auto rounded-full"
          style={{ backgroundColor: shade(colors.surface, -0.18) }}
        />

        <h3 className="text-xl font-bold text-ink">Not enough credits</h3>
        <p className="mt-2 text-sm leading-5 text-muted">
          You need {requiredCredits} credits to {actionLabel}, but you have {availableCredits}.
        </p>

        <div className="mt-5 rounded-xl border p-4 space-y-2" style={{ borderColor: colors.line }}>
          <div className="flex flex-row items-center justify-between text-sm">
            <span className="text-muted">Needed</span>
            <span className="font-semibold text-ink">{requiredCredits}</span>
          </div>
          <div className="flex flex-row items-center justify-between text-sm">
            <span className="text-muted">You have</span>
            <span className="font-semibold text-ink">{availableCredits}</span>
          </div>
          <div className="flex flex-row items-center justify-between text-sm border-t pt-2" style={{ borderColor: colors.line }}>
            <span className="font-semibold text-warning">Short by</span>
            <span className="font-bold text-warning">
              {shortfall} · {creditsToEgp(shortfall)} EGP
            </span>
          </div>
        </div>

        <button
          type="button"
          className="mt-5 w-full flex items-center justify-center py-4 rounded-xl text-base font-bold text-on-accent cursor-pointer border-0 transition-opacity hover:opacity-90"
          style={{ backgroundColor: colors.accent }}
          onClick={() => {
            onClose();
            router.push('/plans');
          }}
        >
          Buy credits
        </button>

        <button
          type="button"
          className="mt-3 w-full text-center py-2 text-sm text-muted hover:text-ink cursor-pointer border-0 bg-transparent"
          onClick={onClose}
        >
          Not now
        </button>
      </div>
    </dialog>
  );
};
