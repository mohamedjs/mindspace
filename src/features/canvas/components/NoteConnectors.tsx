import React from 'react';
import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import type { StickyNoteData } from '../../sticky-notes/components/StickyNoteItem';
import { useTheme } from '../../../shared/theme';

interface NoteConnectorsProps {
  notes: StickyNoteData[];
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
export const NoteConnectors: React.FC<NoteConnectorsProps> = ({ notes }) => {
  const { colors } = useTheme();
  const byId = new Map(notes.map((n) => [n.id, n]));

  const edges = notes.flatMap((note) => {
    if (!note.parentId) return [];
    const parent = byId.get(note.parentId);
    return parent ? [{ id: note.id, from: centerOf(parent), to: centerOf(note) }] : [];
  });

  if (!edges.length) return null;

  const xs = edges.flatMap((e) => [e.from.x, e.to.x]);
  const ys = edges.flatMap((e) => [e.from.y, e.to.y]);
  const minX = Math.min(...xs) - 20;
  const minY = Math.min(...ys) - 20;
  const width = Math.max(...xs) - minX + 20;
  const height = Math.max(...ys) - minY + 20;

  return (
    <View className="absolute" style={{ left: minX, top: minY, width, height }} pointerEvents="none">
      <Svg width={width} height={height}>
        {edges.map(({ id, from, to }) => (
          <Line
            key={id}
            x1={from.x - minX}
            y1={from.y - minY}
            x2={to.x - minX}
            y2={to.y - minY}
            stroke={colors.muted}
            strokeWidth={2}
            strokeDasharray="6,5"
            strokeOpacity={0.55}
          />
        ))}
      </Svg>
    </View>
  );
};
