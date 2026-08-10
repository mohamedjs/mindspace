import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import type { StickyNoteData } from '../../sticky-notes/components/StickyNoteItem';
import { useTheme } from '../../../shared/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface NoteConnectorsProps {
  notes: StickyNoteData[];
  activeDragState?: SharedValue<{ id: string | null; dx: number; dy: number }>;
  activeDragNotes?: SharedValue<string[]>;
}

const centerOf = (n: StickyNoteData) => ({
  x: n.x + (n.width ?? 190) / 2,
  y: n.y + (n.height ?? 145) / 2,
});

/**
 * Draws the mind-map thread from each sub-note to the idea it elaborates on.
 * Sized to the bounding box of just the edges it draws rather than a fixed
 * giant canvas, since notes can live anywhere in world space (including
 * negative coordinates once a board has been panned/tidied around).
 */
export const NoteConnectors: React.FC<NoteConnectorsProps> = ({ notes, activeDragState, activeDragNotes }) => {
  const { colors } = useTheme();
  const byId = new Map(notes.map((n) => [n.id, n]));

  const edges = notes.flatMap((note) => {
    if (!note.parentId) return [];
    const parent = byId.get(note.parentId);
    if (!parent) return [];
    
    return [{ id: note.id, fromId: parent.id, from: centerOf(parent), toId: note.id, to: centerOf(note) }];
  });

  if (!edges.length) return null;

  const PAD = 1000;
  const xs = edges.flatMap((e) => [e.from.x, e.to.x]);
  const ys = edges.flatMap((e) => [e.from.y, e.to.y]);
  const minX = Math.min(...xs) - PAD;
  const minY = Math.min(...ys) - PAD;
  const width = Math.max(...xs) - minX + PAD;
  const height = Math.max(...ys) - minY + PAD;

  return (
    <View 
      className="absolute" 
      style={{ left: minX, top: minY, width, height }} 
      pointerEvents="none"
    >
      <Svg width={width} height={height}>
        {edges.map((edge) => (
          <AnimatedEdge 
            key={edge.id}
            edge={edge}
            minX={minX}
            minY={minY}
            activeDragState={activeDragState}
            activeDragNotes={activeDragNotes}
            color="#94a3b8"
          />
        ))}
      </Svg>
    </View>
  );
};

const AnimatedEdge = ({ 
  edge, 
  minX,
  minY,
  activeDragState, 
  activeDragNotes, 
  color 
}: { 
  edge: any; 
  minX: number;
  minY: number;
  activeDragState?: SharedValue<{ id: string | null; dx: number; dy: number }>;
  activeDragNotes?: SharedValue<string[]>;
  color: string;
}) => {
  const animatedProps = useAnimatedProps(() => {
    let fromDx = 0;
    let fromDy = 0;
    let toDx = 0;
    let toDy = 0;

    const drag = activeDragState?.value;
    const notes = activeDragNotes?.value;

    if (drag && drag.id && notes) {
      if (edge.fromId === drag.id || notes.includes(edge.fromId)) {
        fromDx = drag.dx;
        fromDy = drag.dy;
      }
      if (edge.toId === drag.id || notes.includes(edge.toId)) {
        toDx = drag.dx;
        toDy = drag.dy;
      }
    }

    const fx = edge.from.x + fromDx - minX;
    const fy = edge.from.y + fromDy - minY;
    const tx = edge.to.x + toDx - minX;
    const ty = edge.to.y + toDy - minY;

    const isHorizontal = Math.abs(tx - fx) > Math.abs(ty - fy);
    const cpOffset = isHorizontal ? Math.abs(tx - fx) / 2 : Math.abs(ty - fy) / 2;

    const d = isHorizontal
      ? `M ${fx} ${fy} C ${fx + (tx > fx ? cpOffset : -cpOffset)} ${fy}, ${tx - (tx > fx ? cpOffset : -cpOffset)} ${ty}, ${tx} ${ty}`
      : `M ${fx} ${fy} C ${fx} ${fy + (ty > fy ? cpOffset : -cpOffset)}, ${tx} ${ty - (ty > fy ? cpOffset : -cpOffset)}, ${tx} ${ty}`;

    return { d };
  });

  return (
    <AnimatedPath
      animatedProps={animatedProps}
      stroke={color}
      strokeWidth={3}
      fill="none"
      strokeOpacity={0.8}
    />
  );
};
