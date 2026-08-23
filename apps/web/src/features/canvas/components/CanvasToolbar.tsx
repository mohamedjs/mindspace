'use client';

import React from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Frame,
  LayoutGrid,
  Mic,
  Scan,
  StickyNote,
  Hand,
  MousePointer2,
  Pencil,
  Undo2,
  Redo2,
  ChevronDown,
  ChevronUp,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from '@/shared/theme';
import { clay, shade } from '@/shared/theme/clay';

export type ToolMode = 'pointer' | 'pan' | 'arrow' | 'write';

interface CanvasToolbarProps {
  toolMode: ToolMode;
  onSetToolMode: (mode: ToolMode) => void;
  onAddNote?: () => void;
  onAddGroup?: () => void;
  onTidy?: () => void;
  onFitToView?: () => void;
  onOpenRecordings?: () => void;
  showChildNotes: boolean;
  onToggleChildNotes: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

interface ToolProps {
  icon: LucideIcon;
  label: string;
  onPress?: () => void;
  active?: boolean;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  toolMode,
  onSetToolMode,
  onAddNote,
  onAddGroup,
  onTidy,
  onFitToView,
  onOpenRecordings,
  showChildNotes,
  onToggleChildNotes,
  onUndo,
  onRedo,
}) => {
  const { colors } = useTheme();

  const Tool: React.FC<ToolProps> = ({ icon: Icon, label, onPress, active }) => (
    <button
      type="button"
      className="h-10 w-10 flex items-center justify-center cursor-pointer border-0 transition-transform active:scale-95 disabled:cursor-default"
      style={clay({
        color: active ? shade(colors.accent, -0.1) : shade(colors.surface, -0.05),
        radius: 12,
        depth: active ? 0.7 : 0.5,
        pressed: active,
      })}
      onClick={onPress}
      disabled={!onPress}
      aria-label={label}
      title={label}
    >
      <Icon
        size={17}
        color={active ? colors.onAccent : onPress ? colors.ink : colors.muted}
        strokeWidth={2.4}
      />
    </button>
  );

  const [isExpanded, setIsExpanded] = React.useState(false);

  return (
    <div className="fixed top-1/2 -translate-y-1/2 left-4 lg:top-4 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-0 z-30 flex flex-col lg:flex-row items-start lg:items-center pointer-events-none pb-4 lg:pb-0">
      <div
        className="flex flex-col lg:flex-row gap-2 p-1.5 pointer-events-auto shadow-xl max-h-[60vh] lg:max-h-none overflow-y-auto lg:overflow-visible [&::-webkit-scrollbar]:hidden"
        style={clay({ color: colors.surface, radius: 16, depth: 0.8 })}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <Tool
          icon={Hand}
          label="Pan canvas (Hand)"
          onPress={() => onSetToolMode('pan')}
          active={toolMode === 'pan'}
        />
        <Tool
          icon={MousePointer2}
          label="Select (Pointer)"
          onPress={() => onSetToolMode('pointer')}
          active={toolMode === 'pointer'}
        />
        <Tool
          icon={Pencil}
          label="Write in a note (Pencil)"
          onPress={() => onSetToolMode(toolMode === 'write' ? 'pointer' : 'write')}
          active={toolMode === 'write'}
        />
        <Tool
          icon={ArrowRight}
          label="Connect notes (Arrow)"
          onPress={() => onSetToolMode('arrow')}
          active={toolMode === 'arrow'}
        />

        <div className={`flex-col lg:flex-row gap-2 ${!isExpanded ? 'hidden lg:flex' : 'flex'}`}>
          <div className="w-10 h-[1px] lg:w-[1px] lg:h-10 my-0.5 lg:my-0 lg:mx-1 shrink-0 rounded-full" style={{ backgroundColor: shade(colors.surface, -0.1) }} />
          <Tool icon={StickyNote} label="Add a note" onPress={onAddNote} />
          <Tool icon={Frame} label="Add a group frame" onPress={onAddGroup} />
          <Tool icon={LayoutGrid} label="Tidy notes into a grid" onPress={onTidy} />
          <div className="w-10 h-[1px] lg:w-[1px] lg:h-10 my-0.5 lg:my-0 lg:mx-1 shrink-0 rounded-full" style={{ backgroundColor: shade(colors.surface, -0.1) }} />
          <Tool icon={Undo2} label="Undo" onPress={onUndo} />
          <Tool icon={Redo2} label="Redo" onPress={onRedo} />
          <div className="w-10 h-[1px] lg:w-[1px] lg:h-10 my-0.5 lg:my-0 lg:mx-1 shrink-0 rounded-full" style={{ backgroundColor: shade(colors.surface, -0.1) }} />
          <Tool icon={Scan} label="Fit everything on screen" onPress={onFitToView} />
          <Tool icon={Mic} label="Recordings in this space" onPress={onOpenRecordings} />
          <Tool
            icon={showChildNotes ? Eye : EyeOff}
            label={showChildNotes ? 'Hide sub-notes' : 'Show sub-notes'}
            onPress={onToggleChildNotes}
            active={!showChildNotes}
          />
        </div>

        <div className={`lg:hidden flex flex-col gap-2`}>
          <div className="w-10 h-[1px] my-0.5 shrink-0 rounded-full" style={{ backgroundColor: shade(colors.surface, -0.1) }} />
          <Tool
            icon={isExpanded ? ChevronUp : ChevronDown}
            label={isExpanded ? "Collapse tools" : "Expand tools"}
            onPress={() => setIsExpanded(!isExpanded)}
          />
        </div>
      </div>
    </div>
  );
};
