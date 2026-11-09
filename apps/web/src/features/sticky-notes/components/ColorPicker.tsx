'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, Check, Palette } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import { useTheme } from '@/shared/theme';
import { clay, claySurface, shade } from '@/shared/theme/clay';
import { colorPickerTokens } from '@/shared/constants/tokens';

interface ColorPickerProps {
  visible: boolean;
  currentColor: string;
  onSelectColor: (color: string) => void;
  onClose: () => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  visible,
  currentColor,
  onSelectColor,
  onClose,
}) => {
  const { colors } = useTheme();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedColor, setSelectedColor] = useState(currentColor || '#FFF8BC');
  const [mode, setMode] = useState<'presets' | 'custom'>('presets');

  useEffect(() => {
    if (currentColor) setSelectedColor(currentColor);
  }, [currentColor]);

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

  const handleApply = (color: string) => {
    onSelectColor(color);
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="backdrop:bg-black/65 bg-transparent border-0 p-0 m-0 w-full sm:m-auto fixed inset-x-0 bottom-0 sm:inset-0 z-50 flex items-end sm:items-center justify-center select-none"
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      onCancel={onClose}
    >
      <div
        className="w-full sm:max-w-[340px] p-5 shadow-2xl rounded-t-3xl sm:rounded-3xl flex flex-col gap-4"
        style={{
          ...claySurface(colors, 28),
          paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="sm:hidden mb-1 h-1.5 w-12 mx-auto rounded-full bg-muted/40" />

        {/* Header */}
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="w-5 h-5 rounded-full border border-black/20 shadow-inner inline-block transition-colors"
              style={{ backgroundColor: selectedColor }}
            />
            <span className="text-base font-bold text-ink">Note color</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMode(mode === 'presets' ? 'custom' : 'presets')}
              className="min-h-[44px] px-3 rounded-xl text-sm font-bold flex items-center gap-1 cursor-pointer border-0 transition-transform active:scale-95"
              style={{
                ...clay({
                  color: mode === 'custom' ? colors.accent : shade(colors.surface, -0.06),
                  radius: 12,
                  depth: 0.4,
                }),
                color: mode === 'custom' ? colors.onAccent : colors.ink,
              }}
            >
              <Palette size={16} />
              <span>{mode === 'presets' ? 'Custom' : 'Presets'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer border-0 rounded-xl"
              style={clay({ color: shade(colors.surface, -0.06), radius: 12, depth: 0.4 })}
              aria-label="Close"
            >
              <X size={18} color={colors.muted} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Content based on Mode */}
        {mode === 'presets' ? (
          <div className="grid grid-cols-4 gap-3 py-1">
            {colorPickerTokens.presets.map((preset) => {
              const isSelected = selectedColor.toLowerCase() === preset.toLowerCase();
              return (
                <button
                  key={preset}
                  type="button"
                  className="h-12 w-12 rounded-2xl flex items-center justify-center cursor-pointer transition-all hover:scale-105 active:scale-95 border border-black/10 shadow-sm"
                  style={{ backgroundColor: preset }}
                  onClick={() => {
                    setSelectedColor(preset);
                    handleApply(preset);
                  }}
                >
                  {isSelected && <Check size={20} color="#2A1F16" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-1 w-full">
            <div className="w-full flex justify-center [&_.react-colorful]:w-full [&_.react-colorful]:h-44 [&_.react-colorful]:rounded-2xl">
              <HexColorPicker color={selectedColor} onChange={setSelectedColor} />
            </div>

            <div className="w-full flex flex-row items-center gap-2 mt-1">
              <div
                className="flex-1 px-3 py-2.5 rounded-xl flex items-center justify-between text-sm font-mono font-bold"
                style={clay({ color: shade(colors.surface, -0.06), radius: 12, pressed: true })}
              >
                <span className="text-muted">HEX</span>
                <span className="text-ink uppercase">{selectedColor}</span>
              </div>

              <button
                type="button"
                className="min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-extrabold cursor-pointer border-0 transition-transform active:scale-95 shadow-md"
                style={{
                  ...clay({ color: colors.accent, radius: 12, depth: 0.6 }),
                  color: colors.onAccent,
                }}
                onClick={() => handleApply(selectedColor)}
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
};
