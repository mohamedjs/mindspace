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
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from '@/shared/theme';
import { clay, shade } from '@/shared/theme/clay';

interface CanvasToolbarProps {
  toolMode: 'pointer' | 'pan' | 'arrow';
  onSetToolMode: (mode: 'pointer' | 'pan' | 'arrow') => void;
  onAddNote?: () => void;
  onAddGroup?: () => void;
  onTidy?: () => void;
  onFitToView?: () => void;
  onOpenRecordings?: () => void;
  showChildNotes: boolean;
  onToggleChildNotes: () => void;
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

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center pointer-events-none">
      <div
        className="flex flex-row gap-2 p-1.5 pointer-events-auto shadow-xl"
        style={clay({ color: colors.surface, radius: 16, depth: 0.8 })}
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
          icon={ArrowRight}
          label="Connect notes (Arrow)"
          onPress={() => onSetToolMode('arrow')}
          active={toolMode === 'arrow'}
        />
        <div className="w-[1px] h-10 mx-1 rounded-full" style={{ backgroundColor: shade(colors.surface, -0.1) }} />
        <Tool icon={StickyNote} label="Add a note" onPress={onAddNote} />
        <Tool icon={Frame} label="Add a group frame" onPress={onAddGroup} />
        <Tool icon={LayoutGrid} label="Tidy notes into a grid" onPress={onTidy} />
        <div className="w-[1px] h-10 mx-1 rounded-full" style={{ backgroundColor: shade(colors.surface, -0.1) }} />
        <Tool icon={Scan} label="Fit everything on screen" onPress={onFitToView} />
        <Tool icon={Mic} label="Recordings in this space" onPress={onOpenRecordings} />
        <Tool
          icon={showChildNotes ? Eye : EyeOff}
          label={showChildNotes ? 'Hide sub-notes' : 'Show sub-notes'}
          onPress={onToggleChildNotes}
          active={!showChildNotes}
        />
      </div>
    </div>
  );
};
