'use client';

import React, { useState } from 'react';
import {
  Frame,
  Ungroup,
  Link,
  Unlink,
  Palette,
  Tag,
  LayoutGrid,
  Copy,
  Trash2,
  X,
  MoreHorizontal,
} from 'lucide-react';
import { useTheme } from '@/shared/theme';
import { noteColors, type NoteType } from '@/shared/constants/tokens';

const NOTE_TYPES: Array<{ type: NoteType; labelEn: string; labelAr: string }> = [
  { type: 'idea', labelEn: 'Idea', labelAr: 'فكرة' },
  { type: 'task', labelEn: 'Task', labelAr: 'مهمة' },
  { type: 'question', labelEn: 'Question', labelAr: 'سؤال' },
  { type: 'decision', labelEn: 'Decision', labelAr: 'قرار' },
  { type: 'reference', labelEn: 'Reference', labelAr: 'مرجع' },
  { type: 'thought', labelEn: 'Thought', labelAr: 'خاطرة' },
  { type: 'summary', labelEn: 'Summary', labelAr: 'ملخص' },
];

const SWATCH_PALETTE = [
  '#FFF8BC',
  '#F8BBD0',
  '#C8E6C9',
  '#BBDEFB',
  '#E1BEE7',
  '#FFE0B2',
  '#D7CCC8',
  '#CFD8DC',
];

interface CanvasSelectionBarProps {
  selectedNoteCount: number;
  selectedGroupCount: number;
  hasParentedNote?: boolean;
  onGroup?: () => void;
  onUngroup?: () => void;
  onLink?: () => void;
  onUnlink?: () => void;
  onColor?: (color: string) => void;
  onType?: (type: NoteType) => void;
  onTidy?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onClear?: () => void;
  isMobile?: boolean;
  lang?: 'en' | 'ar';
}

export const CanvasSelectionBar: React.FC<CanvasSelectionBarProps> = ({
  selectedNoteCount,
  selectedGroupCount,
  hasParentedNote = false,
  onGroup,
  onUngroup,
  onLink,
  onUnlink,
  onColor,
  onType,
  onTidy,
  onDuplicate,
  onDelete,
  onClear,
  isMobile = false,
  lang = 'en',
}) => {
  const { colors } = useTheme();
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);

  const totalSelected = selectedNoteCount + selectedGroupCount;
  if (totalSelected === 0) return null;

  const countLabel =
    lang === 'ar'
      ? `${totalSelected} محدد`
      : `${totalSelected} selected`;

  if (isMobile) {
    return (
      <div
        className="fixed bottom-0 inset-x-0 h-16 z-40 px-4 flex items-center justify-between shadow-2xl border-t animate-in slide-in-from-bottom duration-200"
        style={{ backgroundColor: colors.surface, borderColor: colors.line }}
        role="toolbar"
        aria-label="Selection commands"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 cursor-pointer"
            aria-label="Clear selection (Esc)"
          >
            <X size={18} color={colors.ink} />
          </button>
          <span className="text-xs font-semibold text-ink">{countLabel}</span>
        </div>

        <div className="flex items-center gap-1">
          {selectedNoteCount >= 1 && onGroup && (
            <button
              type="button"
              onClick={onGroup}
              className="h-11 px-3 flex items-center gap-1.5 rounded-xl border text-xs font-medium active:scale-95 cursor-pointer"
              style={{ backgroundColor: colors.surface, borderColor: colors.line }}
            >
              <Frame size={16} color={colors.ink} />
              <span>{lang === 'ar' ? 'تجميع' : 'Group'}</span>
            </button>
          )}

          {selectedNoteCount === 2 && onLink && (
            <button
              type="button"
              onClick={onLink}
              className="h-11 px-3 flex items-center gap-1.5 rounded-xl border text-xs font-medium active:scale-95 cursor-pointer"
              style={{ backgroundColor: colors.surface, borderColor: colors.line }}
            >
              <Link size={16} color={colors.ink} />
              <span>{lang === 'ar' ? 'ربط' : 'Link'}</span>
            </button>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setColorMenuOpen((v) => !v)}
              className="h-11 w-11 flex items-center justify-center rounded-xl border active:scale-95 cursor-pointer"
              style={{ backgroundColor: colors.surface, borderColor: colors.line }}
              aria-label="Color"
            >
              <Palette size={16} color={colors.ink} />
            </button>
            {colorMenuOpen && (
              <div
                className="absolute bottom-14 right-0 p-2 rounded-2xl shadow-xl grid grid-cols-4 gap-2 border bg-surface z-50"
                style={{ backgroundColor: colors.surface, borderColor: colors.line }}
              >
                {SWATCH_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      onColor?.(color);
                      setColorMenuOpen(false);
                    }}
                    className="w-7 h-7 rounded-full shadow border border-black/10 active:scale-90"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            )}
          </div>

          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="h-11 w-11 flex items-center justify-center rounded-xl border active:scale-95 cursor-pointer text-red-500"
              style={{ backgroundColor: colors.surface, borderColor: colors.line }}
              aria-label="Delete"
            >
              <Trash2 size={16} />
            </button>
          )}

          {/* Mobile Overflow Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOverflowMenuOpen((v) => !v)}
              className="h-11 w-11 flex items-center justify-center rounded-xl border active:scale-95 cursor-pointer"
              style={{ backgroundColor: colors.surface, borderColor: colors.line }}
              aria-label="More"
            >
              <MoreHorizontal size={18} color={colors.ink} />
            </button>
            {overflowMenuOpen && (
              <div
                className="absolute bottom-14 right-0 w-44 rounded-xl shadow-2xl p-1.5 flex flex-col gap-1 border bg-surface z-50"
                style={{ backgroundColor: colors.surface, borderColor: colors.line }}
              >
                {selectedGroupCount > 0 && onUngroup && (
                  <button
                    type="button"
                    onClick={() => {
                      onUngroup();
                      setOverflowMenuOpen(false);
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <Ungroup size={15} />
                    <span>{lang === 'ar' ? 'فك التجميع' : 'Ungroup'}</span>
                  </button>
                )}
                {hasParentedNote && onUnlink && (
                  <button
                    type="button"
                    onClick={() => {
                      onUnlink();
                      setOverflowMenuOpen(false);
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <Unlink size={15} />
                    <span>{lang === 'ar' ? 'إلغاء الربط' : 'Unlink'}</span>
                  </button>
                )}
                {selectedNoteCount >= 2 && onTidy && (
                  <button
                    type="button"
                    onClick={() => {
                      onTidy();
                      setOverflowMenuOpen(false);
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <LayoutGrid size={15} />
                    <span>{lang === 'ar' ? 'ترتيب' : 'Tidy'}</span>
                  </button>
                )}
                {onDuplicate && (
                  <button
                    type="button"
                    onClick={() => {
                      onDuplicate();
                      setOverflowMenuOpen(false);
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <Copy size={15} />
                    <span>{lang === 'ar' ? 'نسخ' : 'Duplicate'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Desktop Selection Bar
  return (
    <div
      className="fixed top-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-2 rounded-2xl shadow-2xl border pointer-events-auto animate-in fade-in zoom-in-95 duration-150"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.line,
      }}
      role="toolbar"
      aria-label="Selection toolbar"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="text-xs font-bold px-2 py-1 rounded bg-black/5 dark:bg-white/10" style={{ color: colors.ink }}>
        {countLabel}
      </span>

      <div className="w-[1px] h-5" style={{ backgroundColor: colors.line }} />

      {/* Group */}
      {selectedNoteCount >= 1 && onGroup && (
        <button
          type="button"
          onClick={onGroup}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-xs font-medium transition-transform active:scale-95 cursor-pointer"
          style={{ color: colors.ink }}
          title="Group · G"
        >
          <Frame size={15} />
          <span>{lang === 'ar' ? 'تجميع' : 'Group'}</span>
        </button>
      )}

      {/* Ungroup */}
      {selectedGroupCount > 0 && onUngroup && (
        <button
          type="button"
          onClick={onUngroup}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-xs font-medium transition-transform active:scale-95 cursor-pointer"
          style={{ color: colors.ink }}
          title="Ungroup · Shift+G"
        >
          <Ungroup size={15} />
          <span>{lang === 'ar' ? 'فك التجميع' : 'Ungroup'}</span>
        </button>
      )}

      {/* Link */}
      {selectedNoteCount === 2 && onLink && (
        <button
          type="button"
          onClick={onLink}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-xs font-medium transition-transform active:scale-95 cursor-pointer"
          style={{ color: colors.ink }}
          title="Link · L"
        >
          <Link size={15} />
          <span>{lang === 'ar' ? 'ربط' : 'Link'}</span>
        </button>
      )}

      {/* Unlink */}
      {hasParentedNote && onUnlink && (
        <button
          type="button"
          onClick={onUnlink}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-xs font-medium transition-transform active:scale-95 cursor-pointer"
          style={{ color: colors.ink }}
          title="Unlink · Shift+L"
        >
          <Unlink size={15} />
          <span>{lang === 'ar' ? 'إلغاء الربط' : 'Unlink'}</span>
        </button>
      )}

      {/* Color Swatches Popover */}
      {selectedNoteCount >= 1 && onColor && (
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setColorMenuOpen((v) => !v);
              setTypeMenuOpen(false);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-xs font-medium transition-transform active:scale-95 cursor-pointer"
            style={{ color: colors.ink }}
            title="Color swatches"
          >
            <Palette size={15} />
            <span>{lang === 'ar' ? 'لون' : 'Color'}</span>
          </button>
          {colorMenuOpen && (
            <div
              className="absolute top-10 left-0 p-2 rounded-2xl shadow-2xl grid grid-cols-4 gap-2 border z-50 animate-in fade-in zoom-in-95"
              style={{ backgroundColor: colors.surface, borderColor: colors.line }}
            >
              {SWATCH_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    onColor(color);
                    setColorMenuOpen(false);
                  }}
                  className="w-7 h-7 rounded-full shadow border border-black/10 hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Type Popover */}
      {selectedNoteCount >= 1 && onType && (
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setTypeMenuOpen((v) => !v);
              setColorMenuOpen(false);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-xs font-medium transition-transform active:scale-95 cursor-pointer"
            style={{ color: colors.ink }}
            title="Note type"
          >
            <Tag size={15} />
            <span>{lang === 'ar' ? 'نوع' : 'Type'}</span>
          </button>
          {typeMenuOpen && (
            <div
              className="absolute top-10 left-0 w-40 p-1.5 rounded-xl shadow-2xl flex flex-col gap-1 border z-50 animate-in fade-in zoom-in-95"
              style={{ backgroundColor: colors.surface, borderColor: colors.line }}
            >
              {NOTE_TYPES.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => {
                    onType(t.type);
                    setTypeMenuOpen(false);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5 text-left transition-colors cursor-pointer"
                  style={{ color: colors.ink }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: noteColors[t.type]?.bg ?? '#FFF8BC' }}
                  />
                  <span>{lang === 'ar' ? t.labelAr : t.labelEn}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tidy */}
      {selectedNoteCount >= 2 && onTidy && (
        <button
          type="button"
          onClick={onTidy}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-xs font-medium transition-transform active:scale-95 cursor-pointer"
          style={{ color: colors.ink }}
          title="Tidy selection · T"
        >
          <LayoutGrid size={15} />
          <span>{lang === 'ar' ? 'ترتيب' : 'Tidy'}</span>
        </button>
      )}

      {/* Duplicate */}
      {selectedNoteCount >= 1 && onDuplicate && (
        <button
          type="button"
          onClick={onDuplicate}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-xs font-medium transition-transform active:scale-95 cursor-pointer"
          style={{ color: colors.ink }}
          title="Duplicate · Ctrl+D"
        >
          <Copy size={15} />
          <span>{lang === 'ar' ? 'نسخ' : 'Duplicate'}</span>
        </button>
      )}

      {/* Delete */}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-red-500/10 text-xs font-medium transition-transform active:scale-95 text-red-500 cursor-pointer"
          title="Delete · Del"
        >
          <Trash2 size={15} />
          <span>{lang === 'ar' ? 'حذف' : 'Delete'}</span>
        </button>
      )}

      <div className="w-[1px] h-5" style={{ backgroundColor: colors.line }} />

      {/* Clear (Esc) */}
      <button
        type="button"
        onClick={onClear}
        className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-transform active:scale-95 cursor-pointer"
        aria-label="Clear selection (Esc)"
        title="Clear selection · Esc"
      >
        <X size={16} color={colors.ink} />
      </button>
    </div>
  );
};
