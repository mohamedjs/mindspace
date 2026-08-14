import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import type { Note as StickyNoteData } from '../../../core/domain';
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
    
    return [{
      id: note.id,
      fromId: parent.id,
      from: centerOf(parent),
      toId: note.id,
      to: centerOf(note),
      // Half-extents of the child, so the arrowhead can stop at its edge
      // instead of being buried under the card.
      toHalfW: (note.width ?? 190) / 2,
      toHalfH: (note.height ?? 145) / 2,
    }];
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

    // Stop short of the child's edge and point an arrowhead at it. The thread
    // is what says "these two are related"; the head is what says which one is
    // the idea and which one elaborates on it.
    //
    // The curve is axis-aligned where it lands — the last control point shares
    // a coordinate with the endpoint — so the incoming direction is simply
    // ±x or ±y, and the edge crossing is one half-extent back along it.
    const dirX = isHorizontal ? (tx > fx ? 1 : -1) : 0;
    const dirY = isHorizontal ? 0 : ty > fy ? 1 : -1;
    const ex = tx - dirX * edge.toHalfW;
    const ey = ty - dirY * edge.toHalfH;

    const cpOffset = isHorizontal ? Math.abs(ex - fx) / 2 : Math.abs(ey - fy) / 2;

    let d = isHorizontal
      ? `M ${fx} ${fy} C ${fx + dirX * cpOffset} ${fy}, ${ex - dirX * cpOffset} ${ey}, ${ex} ${ey}`
      : `M ${fx} ${fy} C ${fx} ${fy + dirY * cpOffset}, ${ex} ${ey - dirY * cpOffset}, ${ex} ${ey}`;

    // Two strokes back from the tip at ±25°, drawn as part of the same path so
    // they animate with the drag for free. An SVG <Marker> would be tidier, but
    // markers are typed in react-native-svg without a guarantee they render on
    // both platforms, and this costs nothing.
    const HEAD = 11;
    const SPREAD = 0.44; // ~25°
    const angle = Math.atan2(dirY, dirX);
    d += ` M ${ex - HEAD * Math.cos(angle - SPREAD)} ${ey - HEAD * Math.sin(angle - SPREAD)}`;
    d += ` L ${ex} ${ey}`;
    d += ` L ${ex - HEAD * Math.cos(angle + SPREAD)} ${ey - HEAD * Math.sin(angle + SPREAD)}`;

    return { d };
  });

  return (
    <AnimatedPath
      animatedProps={animatedProps}
      stroke={color}
      strokeWidth={3}
      fill="none"
      strokeOpacity={0.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
};
