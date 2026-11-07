'use client';

import React, { useState } from 'react';
import {
  Hand,
  MousePointer2,
  Plus,
  Waypoints,
  Pencil,
  Mic,
  StickyNote,
  CornerDownRight,
  Frame,
  X,
} from 'lucide-react';
import { useTheme } from '@/shared/theme';
import { shade } from '@/shared/theme/clay';
import type { ToolMode } from './CanvasToolbar';

interface CanvasMobileDockProps {
  toolMode: ToolMode;
  onSetToolMode: (mode: ToolMode) => void;
  selectedCount: number;
  onAddNote?: () => void;
  onAddSubNote?: () => void;
  onAddGroup?: () => void;
  onStartRecord?: () => void;
  lang?: 'en' | 'ar';
}

export const CanvasMobileDock: React.FC<CanvasMobileDockProps> = ({
  toolMode,
  onSetToolMode,
  selectedCount,
  onAddNote,
  onAddSubNote,
  onAddGroup,
  onStartRecord,
  lang = 'en',
}) => {
  const { colors } = useTheme();
  const [createSheetOpen, setCreateSheetOpen] = useState(false);

  return (
    <>
      {/* Create Bottom Sheet */}
      {createSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 pointer-events-auto animate-in fade-in duration-200"
          onClick={() => setCreateSheetOpen(false)}
        >
          <div
            className="w-full rounded-t-3xl p-5 pb-8 shadow-2xl flex flex-col gap-3 animate-in slide-in-from-bottom duration-200"
            style={{ backgroundColor: colors.surface }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: colors.line }}>
              <span className="text-sm font-bold text-ink">
                {lang === 'ar' ? 'إضافة عنصر جديد' : 'Create new item'}
              </span>
              <button
                type="button"
                onClick={() => setCreateSheetOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-black/10 text-muted"
              >
                <X size={18} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setCreateSheetOpen(false);
                onStartRecord?.();
              }}
              className="flex items-center gap-3 p-3 rounded-2xl border font-semibold text-sm active:scale-98 transition-transform cursor-pointer"
              style={{
                backgroundColor: shade(colors.accent, -0.05),
                color: colors.onAccent,
                borderColor: 'transparent',
              }}
            >
              <Mic size={20} />
              <div className="flex flex-col text-left">
                <span>{lang === 'ar' ? 'ملاحظة صوتية' : 'Voice note'}</span>
                <span className="text-[11px] opacity-80">
                  {lang === 'ar' ? 'تحدث وسيقوم الذكاء الاصطناعي بتنظيم أفكارك' : 'Speak and AI organizes your thoughts'}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setCreateSheetOpen(false);
                onAddNote?.();
              }}
              className="flex items-center gap-3 p-3 rounded-2xl border font-medium text-sm text-ink active:scale-98 transition-transform cursor-pointer"
              style={{ backgroundColor: colors.surface, borderColor: colors.line }}
            >
              <StickyNote size={20} color={colors.accent} />
              <span>{lang === 'ar' ? 'ملاحظة جديدة' : 'Sticky note'}</span>
            </button>

            <button
              type="button"
              disabled={selectedCount !== 1}
              onClick={() => {
                if (selectedCount === 1) {
                  setCreateSheetOpen(false);
                  onAddSubNote?.();
                }
              }}
              className={`flex items-center gap-3 p-3 rounded-2xl border font-medium text-sm text-ink active:scale-98 transition-transform ${
                selectedCount === 1 ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'
              }`}
              style={{ backgroundColor: colors.surface, borderColor: colors.line }}
            >
              <CornerDownRight size={20} color={colors.accent} />
              <span>{lang === 'ar' ? 'ملاحظة فرعية' : 'Sub-note'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCreateSheetOpen(false);
                onAddGroup?.();
              }}
              className="flex items-center gap-3 p-3 rounded-2xl border font-medium text-sm text-ink active:scale-98 transition-transform cursor-pointer"
              style={{ backgroundColor: colors.surface, borderColor: colors.line }}
            >
              <Frame size={20} color={colors.accent} />
              <span>{lang === 'ar' ? 'مجموعة' : 'Group'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Bottom Dock (64pt tall, min 44x44 targets) */}
      <nav
        className="fixed bottom-0 inset-x-0 h-16 z-30 px-2 flex items-center justify-around shadow-2xl border-t pointer-events-auto transition-transform"
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.line,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        role="toolbar"
        aria-label="Mobile canvas dock"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Hand */}
        <button
          type="button"
          onClick={() => onSetToolMode('pan')}
          className="min-w-[48px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-transform active:scale-95"
          style={{
            color: toolMode === 'pan' ? colors.accent : colors.muted,
          }}
          aria-label="Hand mode"
        >
          <Hand size={20} strokeWidth={toolMode === 'pan' ? 2.5 : 1.8} />
          <span className="text-[10px] font-semibold">{lang === 'ar' ? 'تحريك' : 'Hand'}</span>
        </button>

        {/* Select */}
        <button
          type="button"
          onClick={() => onSetToolMode('pointer')}
          className="min-w-[48px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-transform active:scale-95"
          style={{
            color: toolMode === 'pointer' ? colors.accent : colors.muted,
          }}
          aria-label="Select mode"
        >
          <MousePointer2 size={20} strokeWidth={toolMode === 'pointer' ? 2.5 : 1.8} />
          <span className="text-[10px] font-semibold">{lang === 'ar' ? 'تحديد' : 'Select'}</span>
        </button>

        {/* Raised (+) Create button */}
        <div className="relative -top-4 flex items-center justify-center">
          <button
            type="button"
            onClick={() => setCreateSheetOpen(true)}
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform active:scale-95 cursor-pointer border-2"
            style={{
              backgroundColor: colors.accent,
              borderColor: colors.surface,
              color: colors.onAccent,
            }}
            aria-label="Create item"
          >
            <Plus size={26} strokeWidth={2.8} />
          </button>
        </div>

        {/* Connect */}
        <button
          type="button"
          onClick={() => onSetToolMode('arrow')}
          className="min-w-[48px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-transform active:scale-95"
          style={{
            color: toolMode === 'arrow' ? colors.accent : colors.muted,
          }}
          aria-label="Connect mode"
        >
          <Waypoints size={20} strokeWidth={toolMode === 'arrow' ? 2.5 : 1.8} />
          <span className="text-[10px] font-semibold">{lang === 'ar' ? 'ربط' : 'Link'}</span>
        </button>

        {/* Edit / Write */}
        <button
          type="button"
          onClick={() => onSetToolMode(toolMode === 'write' ? 'pointer' : 'write')}
          className="min-w-[48px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-transform active:scale-95"
          style={{
            color: toolMode === 'write' ? colors.accent : colors.muted,
          }}
          aria-label="Write mode"
        >
          <Pencil size={20} strokeWidth={toolMode === 'write' ? 2.5 : 1.8} />
          <span className="text-[10px] font-semibold">{lang === 'ar' ? 'كتابة' : 'Edit'}</span>
        </button>
      </nav>
    </>
  );
};
