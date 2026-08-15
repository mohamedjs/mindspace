import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../shared/theme';
import { clay, shade } from '../../../shared/theme/clay';
import {
  Eye,
  EyeOff,
  Frame,
  Hand,
  MousePointer2,
  MoveRight,
  LayoutGrid,
  Mic,
  Scan,
  StickyNote,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react-native';
import Animated, { LinearTransition, FadeIn, FadeOut } from 'react-native-reanimated';
import { useState } from 'react';

export type ToolMode = 'pan' | 'select' | 'arrow';

interface CanvasToolbarProps {
  onAddNote?: () => void;
  onAddGroup?: () => void;
  /** What a one-finger drag on the board does. */
  toolMode: ToolMode;
  onSetToolMode: (mode: ToolMode) => void;
  /** False in previews with no persistence — the arrow tool is hidden. */
  canConnect?: boolean;
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

/**
 * Tools that act on the board, docked beside it. Kept deliberately short — a
 * phone canvas has no room for a full editor palette, and every extra icon is
 * one more thing covering the notes.
 *
 * Three mode buttons stay pinned — they decide what a drag does, so reaching
 * them must never cost a tap — and the six actions live behind the chevron.
 * Nine at once is ~470px of rail, taller than a 667px phone has to spare once
 * the header and the record button are in.
 */
export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  onAddNote,
  onAddGroup,
  toolMode,
  onSetToolMode,
  canConnect,
  onTidy,
  onFitToView,
  onOpenRecordings,
  showChildNotes,
  onToggleChildNotes,
}) => {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(true);

  const Divider = () => (
    <View
      className="mx-auto h-px w-6 rounded-full"
      style={{ backgroundColor: shade(colors.surface, -0.14) }}
    />
  );

  const Tool: React.FC<ToolProps> = ({ icon: Icon, label, onPress, active }) => (
    <TouchableOpacity
      className="h-10 w-10 items-center justify-center"
      style={clay({
        color: active ? colors.accent : shade(colors.surface, -0.05),
        radius: 14,
        depth: 0.5,
      })}
      onPress={onPress}
      disabled={!onPress}
      accessibilityLabel={label}
      activeOpacity={0.8}
    >
      <Icon
        size={17}
        color={active ? colors.onAccent : onPress ? colors.ink : colors.muted}
        strokeWidth={2.4}
      />
    </TouchableOpacity>
  );

  return (
    // Full-height wrapper centres the strip without a percentage transform
    // (unreliable in RN); box-none keeps canvas pans working around it.
    <View
      className="absolute bottom-0 left-3 top-0 z-30 justify-center"
      pointerEvents="box-none"
    >
      <Animated.View 
        layout={LinearTransition.springify().damping(18).stiffness(200)}
        className="gap-2 p-2" 
        style={clay({ color: colors.surface, radius: 20, depth: 0.8 })}
      >
        {/* Modes: always reachable. */}
        <Tool
          icon={Hand}
          label="Pan the board"
          onPress={() => onSetToolMode('pan')}
          active={toolMode === 'pan'}
        />
        <Tool
          icon={MousePointer2}
          label="Select notes"
          onPress={() => onSetToolMode('select')}
          active={toolMode === 'select'}
        />
        {canConnect && (
          <Tool
            icon={MoveRight}
            label="Connect two notes"
            onPress={() => onSetToolMode(toolMode === 'arrow' ? 'pan' : 'arrow')}
            active={toolMode === 'arrow'}
          />
        )}

        <Divider />

        <Tool
          icon={isOpen ? ChevronLeft : ChevronRight}
          label={isOpen ? 'Hide tools' : 'Show tools'}
          onPress={() => setIsOpen(!isOpen)}
        />

        {isOpen && (
          <Animated.View 
            layout={LinearTransition.springify().damping(18).stiffness(200)}
            entering={FadeIn.duration(200)} 
            exiting={FadeOut.duration(200)} 
            className="gap-2"
          >
            <Tool icon={StickyNote} label="Add a note" onPress={onAddNote} />
            <Tool icon={Frame} label="Add a group frame" onPress={onAddGroup} />
            <Tool icon={LayoutGrid} label="Tidy notes into a grid" onPress={onTidy} />
            <Divider />
            <Tool icon={Scan} label="Fit everything on screen" onPress={onFitToView} />
            <Tool icon={Mic} label="Recordings in this space" onPress={onOpenRecordings} />
            <Tool
              icon={showChildNotes ? Eye : EyeOff}
              label={showChildNotes ? 'Hide sub-notes' : 'Show sub-notes'}
              onPress={onToggleChildNotes}
              active={!showChildNotes}
            />
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
};
