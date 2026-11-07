'use client';

import React from 'react';
import {
  Undo2,
  Redo2,
  Minus,
  Plus,
  Scan,
  LayoutGrid,
  Eye,
  EyeOff,
  Mic,
  Settings,
  Folder,
  Layers,
  Network,
  List,
  Calendar,
  type LucideIcon,
} from 'lucide-react';
import { useTheme, type NotesView } from '@/shared/theme';
import { shade } from '@/shared/theme/clay';
import { CreditChip } from '@/features/credits/components/CreditChip';

interface CanvasViewBarProps {
  spaceName: string;
  activeView: NotesView;
  onSelectView: (view: NotesView) => void;
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitToView: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onTidyAll?: () => void;
  showChildNotes: boolean;
  onToggleChildNotes: () => void;
  onOpenSpaces?: () => void;
  onOpenSettings?: () => void;
  onOpenRecordings?: () => void;
  onOpenCredits?: () => void;
  creditBalance: number;
  lang?: 'en' | 'ar';
  isMobile?: boolean;
}

export const CanvasViewBar: React.FC<CanvasViewBarProps> = ({
  spaceName,
  activeView,
  onSelectView,
  scale,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitToView,
  canUndo = true,
  canRedo = true,
  onUndo,
  onRedo,
  onTidyAll,
  showChildNotes,
  onToggleChildNotes,
  onOpenSpaces,
  onOpenSettings,
  onOpenRecordings,
  onOpenCredits,
  creditBalance,
  lang = 'en',
  isMobile = false,
}) => {
  const { colors } = useTheme();
  const zoomPercent = Math.round(scale * 100);

  const VIEWS: Array<{ id: NotesView; labelEn: string; labelAr: string; icon: LucideIcon }> = [
    { id: 'canvas', labelEn: 'Canvas', labelAr: 'اللوحة', icon: Layers },
    { id: 'mindmap', labelEn: 'Mind Map', labelAr: 'خريطة ذهنية', icon: Network },
    { id: 'list', labelEn: 'List', labelAr: 'قائمة', icon: List },
    { id: 'calendar', labelEn: 'Calendar', labelAr: 'تقويم', icon: Calendar },
  ];

  if (isMobile) {
    return (
      <header
        className="fixed top-0 inset-x-0 h-14 z-30 px-3 flex items-center justify-between pointer-events-none"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={onOpenSpaces}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-sm text-xs font-semibold"
            style={{ backgroundColor: colors.surface, borderColor: colors.line, color: colors.ink }}
          >
            <Folder size={14} color={colors.accent} />
            <span className="truncate max-w-[120px]">{spaceName}</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="h-9 w-9 flex items-center justify-center rounded-xl border transition-transform active:scale-95 disabled:opacity-40"
            style={{ backgroundColor: colors.surface, borderColor: colors.line }}
            aria-label="Undo"
          >
            <Undo2 size={16} color={colors.ink} />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="h-9 w-9 flex items-center justify-center rounded-xl border transition-transform active:scale-95 disabled:opacity-40"
            style={{ backgroundColor: colors.surface, borderColor: colors.line }}
            aria-label="Redo"
          >
            <Redo2 size={16} color={colors.ink} />
          </button>
          <CreditChip balance={creditBalance} onPress={onOpenCredits} />
        </div>
      </header>
    );
  }

  return (
    <header
      className="fixed top-3 inset-x-4 h-12 z-30 flex items-center justify-between pointer-events-none"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Left: Space Name & View Tabs */}
      <div className="flex items-center gap-3 pointer-events-auto">
        <button
          type="button"
          onClick={onOpenSpaces}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border shadow-sm text-sm font-semibold transition-all hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          style={{ backgroundColor: colors.surface, borderColor: colors.line, color: colors.ink }}
          title={lang === 'ar' ? 'تغيير المساحة' : 'Change space'}
        >
          <Folder size={16} color={colors.accent} />
          <span className="max-w-[160px] truncate">{spaceName}</span>
        </button>

        {/* View Switch Tabs */}
        <nav
          className="flex items-center p-1 rounded-xl border shadow-sm"
          style={{ backgroundColor: colors.surface, borderColor: colors.line }}
          role="tablist"
        >
          {VIEWS.map((tab) => {
            const isActive = activeView === tab.id;
            const Icon = tab.icon;
            const label = lang === 'ar' ? tab.labelAr : tab.labelEn;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelectView(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  isActive ? 'shadow-sm' : 'hover:opacity-80'
                }`}
                style={{
                  backgroundColor: isActive ? shade(colors.accent, -0.05) : 'transparent',
                  color: isActive ? colors.onAccent : colors.ink,
                }}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right: Undo/Redo, Zoom, Fit, Extras, Profile */}
      <div className="flex items-center gap-2 pointer-events-auto">
        {/* Undo / Redo */}
        <div
          className="flex items-center p-1 rounded-xl border shadow-sm"
          style={{ backgroundColor: colors.surface, borderColor: colors.line }}
        >
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-transform active:scale-95 disabled:opacity-30 cursor-pointer"
            aria-label="Undo (Ctrl+Z)"
            title="Undo · Ctrl+Z"
          >
            <Undo2 size={16} color={colors.ink} />
          </button>
          <div className="w-[1px] h-4 mx-0.5" style={{ backgroundColor: colors.line }} />
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-transform active:scale-95 disabled:opacity-30 cursor-pointer"
            aria-label="Redo (Ctrl+Shift+Z)"
            title="Redo · Ctrl+Shift+Z"
          >
            <Redo2 size={16} color={colors.ink} />
          </button>
        </div>

        {/* Zoom Controls */}
        <div
          className="flex items-center p-1 rounded-xl border shadow-sm"
          style={{ backgroundColor: colors.surface, borderColor: colors.line }}
        >
          <button
            type="button"
            onClick={onZoomOut}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-transform active:scale-95 cursor-pointer"
            aria-label="Zoom out (-)"
            title="Zoom out · -"
          >
            <Minus size={15} color={colors.ink} />
          </button>
          <button
            type="button"
            onClick={onResetZoom}
            className="px-2 text-xs font-mono font-medium hover:opacity-80 transition-opacity"
            style={{ color: colors.ink }}
            title="Reset zoom · 0"
          >
            {zoomPercent}%
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-transform active:scale-95 cursor-pointer"
            aria-label="Zoom in (+)"
            title="Zoom in · +"
          >
            <Plus size={15} color={colors.ink} />
          </button>
          <div className="w-[1px] h-4 mx-1" style={{ backgroundColor: colors.line }} />
          <button
            type="button"
            onClick={onFitToView}
            className="h-8 px-2.5 flex items-center gap-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-xs font-medium cursor-pointer"
            style={{ color: colors.ink }}
            title="Fit to view · F"
          >
            <Scan size={14} />
            <span>Fit</span>
          </button>
        </div>

        {/* View Actions: Tidy, Subnotes, Recordings */}
        <div
          className="flex items-center p-1 rounded-xl border shadow-sm"
          style={{ backgroundColor: colors.surface, borderColor: colors.line }}
        >
          {onTidyAll && (
            <button
              type="button"
              onClick={onTidyAll}
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              title="Tidy all · Shift+T"
              aria-label="Tidy all"
            >
              <LayoutGrid size={15} color={colors.ink} />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleChildNotes}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
            title={showChildNotes ? 'Hide sub-notes · S' : 'Show sub-notes · S'}
            aria-label="Toggle sub-notes"
          >
            {showChildNotes ? (
              <Eye size={15} color={colors.ink} />
            ) : (
              <EyeOff size={15} color={colors.muted} />
            )}
          </button>
          {onOpenRecordings && (
            <button
              type="button"
              onClick={onOpenRecordings}
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              title="Recordings in this space"
              aria-label="Recordings"
            >
              <Mic size={15} color={colors.ink} />
            </button>
          )}
        </div>

        {/* Credits & Settings */}
        <CreditChip balance={creditBalance} onPress={onOpenCredits} />
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="h-10 w-10 flex items-center justify-center rounded-xl border shadow-sm hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
            style={{ backgroundColor: colors.surface, borderColor: colors.line }}
            title="Settings"
            aria-label="Settings"
          >
            <Settings size={18} color={colors.ink} />
          </button>
        )}
      </div>
    </header>
  );
};
