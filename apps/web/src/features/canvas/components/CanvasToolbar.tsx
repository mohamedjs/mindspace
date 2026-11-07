'use client';

import React, { useState, useEffect } from 'react';
import type { NotesView } from '@/shared/theme';
import type { NoteType } from '@/shared/constants/tokens';
import { CanvasModeRail } from './CanvasModeRail';
import { CanvasViewBar } from './CanvasViewBar';
import { CanvasSelectionBar } from './CanvasSelectionBar';
import { CanvasHintChip } from './CanvasHintChip';
import { CanvasMobileDock } from './CanvasMobileDock';

export type ToolMode = 'pointer' | 'pan' | 'arrow' | 'write' | 'connect';

interface CanvasToolbarProps {
  toolMode: ToolMode;
  onSetToolMode: (mode: ToolMode) => void;
  spaceName?: string;
  activeView?: NotesView;
  onSelectView?: (view: NotesView) => void;
  scale?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  onFitToView?: () => void;
  onAddNote?: () => void;
  onAddSubNote?: () => void;
  onAddGroup?: () => void;
  onTidy?: () => void;
  onTidyAll?: () => void;
  onOpenRecordings?: () => void;
  onOpenSpaces?: () => void;
  onOpenSettings?: () => void;
  onOpenCredits?: () => void;
  creditBalance?: number;
  showChildNotes: boolean;
  onToggleChildNotes: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  selectedNoteCount?: number;
  selectedGroupCount?: number;
  hasParentedNote?: boolean;
  arrowSourceId?: string | null;
  onGroupSelection?: () => void;
  onUngroupSelection?: () => void;
  onLinkSelection?: () => void;
  onUnlinkSelection?: () => void;
  onColorSelection?: (color: string) => void;
  onTypeSelection?: (type: NoteType) => void;
  onDuplicateSelection?: () => void;
  onDeleteSelection?: () => void;
  onClearSelection?: () => void;
  onStartRecord?: () => void;
  lang?: 'en' | 'ar';
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  toolMode,
  onSetToolMode,
  spaceName = 'My MindSpace',
  activeView = 'canvas',
  onSelectView = () => {},
  scale = 1,
  onZoomIn = () => {},
  onZoomOut = () => {},
  onResetZoom = () => {},
  onFitToView = () => {},
  onAddNote,
  onAddSubNote,
  onAddGroup,
  onTidy,
  onTidyAll,
  onOpenRecordings,
  onOpenSpaces,
  onOpenSettings,
  onOpenCredits,
  creditBalance = 0,
  showChildNotes,
  onToggleChildNotes,
  onUndo,
  onRedo,
  canUndo = true,
  canRedo = true,
  selectedNoteCount = 0,
  selectedGroupCount = 0,
  hasParentedNote = false,
  arrowSourceId = null,
  onGroupSelection,
  onUngroupSelection,
  onLinkSelection,
  onUnlinkSelection,
  onColorSelection,
  onTypeSelection,
  onDuplicateSelection,
  onDeleteSelection,
  onClearSelection,
  onStartRecord,
  lang = 'en',
}) => {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const totalSelected = selectedNoteCount + selectedGroupCount;

  return (
    <>
      {/* Zone 4: Top View Bar */}
      <CanvasViewBar
        spaceName={spaceName}
        activeView={activeView}
        onSelectView={onSelectView}
        scale={scale}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onResetZoom={onResetZoom}
        onFitToView={onFitToView}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        onTidyAll={onTidyAll}
        showChildNotes={showChildNotes}
        onToggleChildNotes={onToggleChildNotes}
        onOpenSpaces={onOpenSpaces}
        onOpenSettings={onOpenSettings}
        onOpenRecordings={onOpenRecordings}
        onOpenCredits={onOpenCredits}
        creditBalance={creditBalance}
        lang={lang}
        isMobile={isMobile}
      />

      {/* Floating Zoom / Fit on Mobile */}
      {isMobile && (
        <div
          className="fixed right-3 bottom-24 z-30 flex flex-col gap-1.5 p-1 rounded-2xl shadow-lg border pointer-events-auto bg-surface"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onFitToView}
            className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-black/10 active:scale-95 text-xs font-semibold"
            aria-label="Fit to view"
          >
            Fit
          </button>
          <button
            type="button"
            onClick={onZoomOut}
            className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-black/10 active:scale-95 text-base font-bold"
            aria-label="Zoom out"
          >
            -
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-black/10 active:scale-95 text-base font-bold"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      )}

      {/* Desktop: Zone 1 Left Mode Rail + Create */}
      {!isMobile && (
        <CanvasModeRail
          toolMode={toolMode}
          onSetToolMode={onSetToolMode}
          selectedCount={totalSelected}
          onAddNote={onAddNote}
          onAddSubNote={onAddSubNote}
          onAddGroup={onAddGroup}
          onStartRecord={onStartRecord}
          lang={lang}
        />
      )}

      {/* Mobile: Bottom Dock OR Selection Bar */}
      {isMobile && totalSelected === 0 && (
        <CanvasMobileDock
          toolMode={toolMode}
          onSetToolMode={onSetToolMode}
          selectedCount={totalSelected}
          onAddNote={onAddNote}
          onAddSubNote={onAddSubNote}
          onAddGroup={onAddGroup}
          onStartRecord={onStartRecord}
          lang={lang}
        />
      )}

      {/* Zone 3: Selection Bar (desktop floating above selection, or mobile bottom replacement) */}
      <CanvasSelectionBar
        selectedNoteCount={selectedNoteCount}
        selectedGroupCount={selectedGroupCount}
        hasParentedNote={hasParentedNote}
        onGroup={onGroupSelection}
        onUngroup={onUngroupSelection}
        onLink={onLinkSelection}
        onUnlink={onUnlinkSelection}
        onColor={onColorSelection}
        onType={onTypeSelection}
        onTidy={onTidy}
        onDuplicate={onDuplicateSelection}
        onDelete={onDeleteSelection}
        onClear={onClearSelection}
        isMobile={isMobile}
        lang={lang}
      />

      {/* Mode Instructions Hint Chip */}
      <CanvasHintChip
        toolMode={toolMode}
        arrowSourceId={arrowSourceId}
        selectedCount={totalSelected}
        isMobile={isMobile}
        onCancel={onClearSelection}
        lang={lang}
      />
    </>
  );
};
