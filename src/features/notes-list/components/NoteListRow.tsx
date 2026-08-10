import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Text } from '../../../shared/ui/Text';
import { useTheme } from '../../../shared/theme';
import { clay, shade } from '../../../shared/theme/clay';
import { readableTextOn } from '../../../shared/theme/color';
import { noteColors } from '../../../shared/constants/tokens';
import type { StickyNoteData } from '../../sticky-notes/components/StickyNoteItem';
import { dayLabel, startOfDay, timeLabel } from '../services/day';
import { ChevronRight } from 'lucide-react-native';

interface NoteListRowProps {
  note: StickyNoteData;
  /** Indent level; children render one step in from their parent. */
  depth?: number;
  /** Sub-notes to render nested underneath. Omit to render the row alone. */
  childrenOf?: Map<string, StickyNoteData[]>;
  /** Inside a day already labelled by its header, only the time is worth showing. */
  dateStyle?: 'full' | 'time-only';
  onPress?: (noteId: string) => void;
}

/** One note as a row. Shared by the list view and the calendar's day list. */
export const NoteListRow: React.FC<NoteListRowProps> = ({
  note,
  depth = 0,
  childrenOf,
  dateStyle = 'full',
  onPress,
}) => {
  const { colors } = useTheme();
  const paper = note.color || noteColors[note.type]?.bg || '#FFF8BC';
  const kids = childrenOf?.get(note.id) ?? [];

  return (
    <View style={{ marginLeft: depth * 16 }}>
      <TouchableOpacity
        className="mb-2 flex-row items-center px-4 py-3"
        style={[
          clay({ color: shade(colors.surface, -0.04), radius: 16, depth: depth ? 0.3 : 0.55 }),
          { borderLeftWidth: 5, borderLeftColor: paper },
        ]}
        activeOpacity={0.75}
        onPress={() => onPress?.(note.id)}
      >
        <View className="flex-1 pr-2">
          {Boolean(note.title) && (
            <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
              {note.title}
            </Text>
          )}
          <Text className="text-xs text-muted" numberOfLines={depth ? 2 : 3}>
            {note.content}
          </Text>

          <View className="mt-1.5 flex-row items-center">
            <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: paper }}>
              <Text
                className="text-[9px] font-bold uppercase tracking-wide"
                style={{ color: readableTextOn(paper) }}
              >
                {note.type}
              </Text>
            </View>
            {Boolean(note.dueAt) && (
              <Text className="ml-2 text-[10px] font-semibold" style={{ color: colors.accent }}>
                {dateStyle === 'time-only'
                  ? timeLabel(note.dueAt!)
                  : `${dayLabel(startOfDay(note.dueAt!))} · ${timeLabel(note.dueAt!)}`}
              </Text>
            )}
            {kids.length > 0 && (
              <Text className="ml-2 text-[10px] font-semibold text-muted">
                {kids.length} sub-{kids.length === 1 ? 'note' : 'notes'}
              </Text>
            )}
          </View>
        </View>
        <ChevronRight size={16} color={colors.muted} strokeWidth={2.5} />
      </TouchableOpacity>

      {kids.map((child) => (
        <NoteListRow
          key={child.id}
          note={child}
          depth={depth + 1}
          childrenOf={childrenOf}
          dateStyle={dateStyle}
          onPress={onPress}
        />
      ))}
    </View>
  );
};
