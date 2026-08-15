'use client';

import React, { useEffect, useRef } from 'react';
import { useTheme } from '@/shared/theme';
import { clay, claySurface, shade } from '@/shared/theme/clay';
import { readableTextOn } from '@/shared/theme/color';

interface NoteActionSheetProps {
  visible: boolean;
  noteColor: string;
  notePreview: string;
  onChangeColour: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export const NoteActionSheet: React.FC<NoteActionSheetProps> = ({
  visible,
  noteColor,
  notePreview,
  onChangeColour,
  onDelete,
  onClose,
}) => {
  const { colors } = useTheme();
  const dialogRef = useRef<HTMLDialogElement>(null);

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
        className="w-full px-5 pb-10 pt-4 rounded-t-3xl md:rounded-3xl shadow-2xl"
        style={claySurface(colors, 32)}
      >
        <div
          className="mb-4 h-1.5 w-12 mx-auto rounded-full"
          style={{ backgroundColor: shade(colors.surface, -0.18) }}
        />

        <div className="mb-5 flex flex-row items-center">
          <div
            className="mr-3 h-10 w-10 flex items-center justify-center rounded-xl shrink-0"
            style={clay({ color: noteColor, radius: 12, depth: 0.6 })}
          >
            <span className="text-xs font-bold" style={{ color: readableTextOn(noteColor) }}>
              Aa
            </span>
          </div>
          <p className="flex-1 text-sm text-muted line-clamp-2">
            {notePreview}
          </p>
        </div>

        <button
          type="button"
          className="mb-3 w-full flex flex-row items-center px-4 py-3.5 cursor-pointer border-0 transition-opacity hover:opacity-90"
          style={clay({ color: shade(colors.surface, -0.04), radius: 18, depth: 0.7 })}
          onClick={onChangeColour}
        >
          <span className="mr-3 text-lg">🎨</span>
          <span className="text-base font-semibold text-ink">Change colour</span>
        </button>

        <button
          type="button"
          className="w-full flex flex-row items-center px-4 py-3.5 cursor-pointer border-0 transition-opacity hover:opacity-90"
          style={clay({ color: '#C6453C', radius: 18, depth: 0.9 })}
          onClick={onDelete}
        >
          <span className="mr-3 text-lg">🗑️</span>
          <span className="text-base font-bold text-white">Delete note</span>
        </button>
      </div>
    </dialog>
  );
};
