import React from 'react';
import { View } from 'react-native';
import type { NoteType } from '../../../core/domain';
import { CanvasMobileDock } from './CanvasMobileDock';
import { CanvasSelectionBar } from './CanvasSelectionBar';
import { CanvasHintChip } from './CanvasHintChip';
import { CanvasZoomControls } from './CanvasZoomControls';

export type ToolMode = 'pan' | 'select' | 'arrow' | 'write' | 'hand' | 'connect' | 'pointer';

export interface CanvasToolbarProps {
  onAddNote?: () => void;
  onAddSubNote?: () => void;
  onAddGroup?: () => void;
  toolMode: ToolMode;
  onSetToolMode: (mode: ToolMode) => void;
  canConnect?: boolean;
  onTidy?: () => void;
  onFitToView?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onOpenRecordings?: () => void;
  onStartRecord?: () => void;
  showChildNotes: boolean;
  onToggleChildNotes: () => void;
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
  onCancelMode?: () => void;
  lang?: 'en' | 'ar';
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  onAddNote,
  onAddSubNote,
  onAddGroup,
  toolMode,
  onSetToolMode,
  canConnect = true,
  onTidy,
  onFitToView,
  onZoomIn,
  onZoomOut,
  onStartRecord,
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
  onCancelMode,
  lang = 'en',
}) => {
  const totalSelected = selectedNoteCount + selectedGroupCount;

  return (
    <View pointerEvents="box-none" className="absolute inset-0 z-30">
      {/* Floating Zoom / Fit Controls */}
      <CanvasZoomControls
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onFitToView={onFitToView}
        lang={lang}
      />

      {/* Mode hint chip */}
      <CanvasHintChip
        toolMode={toolMode}
        arrowSourceId={arrowSourceId}
        selectedCount={totalSelected}
        onCancel={onCancelMode ?? (() => onSetToolMode('pan'))}
        lang={lang}
      />

      {/* Bottom Area: Dock OR Selection Bar */}
      {totalSelected > 0 ? (
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
          lang={lang}
        />
      ) : (
        <CanvasMobileDock
          toolMode={toolMode}
          onSetToolMode={onSetToolMode}
          selectedCount={totalSelected}
          onAddNote={onAddNote}
          onAddSubNote={onAddSubNote}
          onAddGroup={onAddGroup}
          onStartRecord={onStartRecord}
          canConnect={canConnect}
          lang={lang}
        />
      )}
    </View>
  );
};
