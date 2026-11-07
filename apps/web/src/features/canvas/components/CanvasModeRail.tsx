'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  MousePointer2,
  Hand,
  Waypoints,
  Pencil,
  Plus,
  Mic,
  StickyNote,
  CornerDownRight,
  Frame,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from '@/shared/theme';
import { clay, shade } from '@/shared/theme/clay';
import type { ToolMode } from './CanvasToolbar';

interface CanvasModeRailProps {
  toolMode: ToolMode;
  onSetToolMode: (mode: ToolMode) => void;
  selectedCount: number;
  onAddNote?: () => void;
  onAddSubNote?: () => void;
  onAddGroup?: () => void;
  onStartRecord?: () => void;
  lang?: 'en' | 'ar';
}

const MODES: Array<{
  id: ToolMode;
  icon: LucideIcon;
  labelEn: string;
  labelAr: string;
  shortcut: string;
}> = [
  { id: 'pointer', icon: MousePointer2, labelEn: 'Select', labelAr: 'تحديد', shortcut: 'V' },
  { id: 'pan', icon: Hand, labelEn: 'Hand', labelAr: 'تحريك اللوحة', shortcut: 'H' },
  { id: 'arrow', icon: Waypoints, labelEn: 'Connect', labelAr: 'ربط', shortcut: 'C' },
  { id: 'write', icon: Pencil, labelEn: 'Write', labelAr: 'كتابة', shortcut: 'W' },
];

export const CanvasModeRail: React.FC<CanvasModeRailProps> = ({
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
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close create menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setCreateMenuOpen(false);
      }
    }
    if (createMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [createMenuOpen]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const next = (index + 1) % MODES.length;
      onSetToolMode(MODES[next].id);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = (index - 1 + MODES.length) % MODES.length;
      onSetToolMode(MODES[prev].id);
    }
  };

  return (
    <div
      className="fixed left-4 top-1/2 -translate-y-1/2 z-30 flex items-center pointer-events-none"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Mode Rail */}
      <div
        className="flex flex-col gap-1.5 p-2 rounded-2xl shadow-xl pointer-events-auto border"
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.line,
        }}
        role="radiogroup"
        aria-label={lang === 'ar' ? 'أدوات اللوحة' : 'Canvas tools'}
      >
        {MODES.map((mode, i) => {
          const Icon = mode.icon;
          const isActive = toolMode === mode.id;
          const label = lang === 'ar' ? mode.labelAr : mode.labelEn;
          return (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              tabIndex={isActive ? 0 : -1}
              onKeyDown={(e) => handleKeyDown(e, i)}
              onClick={() => onSetToolMode(mode.id)}
              className="h-10 w-10 flex items-center justify-center rounded-xl cursor-pointer border-0 transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-accent outline-none relative group"
              style={clay({
                color: isActive ? shade(colors.accent, -0.1) : shade(colors.surface, -0.05),
                radius: 12,
                depth: isActive ? 0.7 : 0.4,
                pressed: isActive,
              })}
              aria-label={`${label} (${mode.shortcut})`}
              title={`${label} · ${mode.shortcut}`}
            >
              <Icon
                size={18}
                color={isActive ? colors.onAccent : colors.ink}
                strokeWidth={isActive ? 2.5 : 2}
              />
            </button>
          );
        })}

        <div className="w-6 h-[1px] my-1 mx-auto rounded-full" style={{ backgroundColor: colors.line }} />

        {/* Create (+) button */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setCreateMenuOpen((v) => !v)}
            className="h-10 w-10 flex items-center justify-center rounded-xl cursor-pointer border-0 transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-accent outline-none"
            style={clay({
              color: createMenuOpen ? shade(colors.accent, -0.1) : shade(colors.surface, -0.05),
              radius: 12,
              depth: 0.5,
              pressed: createMenuOpen,
            })}
            aria-label={lang === 'ar' ? 'إضافة عنصر جديد' : 'Create new item'}
            title={lang === 'ar' ? 'إضافة (+)' : 'Create (+)'}
            aria-expanded={createMenuOpen}
            aria-haspopup="true"
          >
            <Plus
              size={19}
              color={createMenuOpen ? colors.onAccent : colors.ink}
              strokeWidth={2.4}
              className={`transition-transform duration-200 ${createMenuOpen ? 'rotate-45' : ''}`}
            />
          </button>

          {/* Create Menu Popover */}
          {createMenuOpen && (
            <div
              className="absolute left-14 top-0 w-48 rounded-xl shadow-2xl p-1.5 flex flex-col gap-1 border pointer-events-auto animate-in fade-in zoom-in-95 duration-150 z-50"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.line,
              }}
              role="menu"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setCreateMenuOpen(false);
                  onStartRecord?.();
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-black/10 dark:hover:bg-white/10 text-left transition-colors cursor-pointer w-full"
                style={{ color: colors.ink }}
              >
                <Mic size={16} color={colors.accent} strokeWidth={2.2} />
                <span className="flex-1">{lang === 'ar' ? 'ملاحظة صوتية' : 'Voice note'}</span>
                <span className="text-[10px] font-mono text-muted">R</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setCreateMenuOpen(false);
                  onAddNote?.();
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-black/10 dark:hover:bg-white/10 text-left transition-colors cursor-pointer w-full"
                style={{ color: colors.ink }}
              >
                <StickyNote size={16} color={colors.ink} strokeWidth={2} />
                <span className="flex-1">{lang === 'ar' ? 'ملاحظة جديدة' : 'Sticky note'}</span>
                <span className="text-[10px] font-mono text-muted">N</span>
              </button>

              <button
                type="button"
                role="menuitem"
                disabled={selectedCount !== 1}
                onClick={() => {
                  if (selectedCount === 1) {
                    setCreateMenuOpen(false);
                    onAddSubNote?.();
                  }
                }}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-left transition-colors w-full ${
                  selectedCount === 1
                    ? 'hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer'
                    : 'opacity-40 cursor-not-allowed'
                }`}
                style={{ color: colors.ink }}
              >
                <CornerDownRight size={16} color={colors.ink} strokeWidth={2} />
                <span className="flex-1">{lang === 'ar' ? 'ملاحظة فرعية' : 'Sub-note'}</span>
                <span className="text-[10px] font-mono text-muted">Shift+N</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setCreateMenuOpen(false);
                  onAddGroup?.();
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-black/10 dark:hover:bg-white/10 text-left transition-colors cursor-pointer w-full"
                style={{ color: colors.ink }}
              >
                <Frame size={16} color={colors.ink} strokeWidth={2} />
                <span className="flex-1">{lang === 'ar' ? 'مجموعة' : 'Group'}</span>
                <span className="text-[10px] font-mono text-muted">G</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
