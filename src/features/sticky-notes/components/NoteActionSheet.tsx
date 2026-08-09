import React from 'react';
import { Modal, Pressable, TouchableOpacity, View } from 'react-native';
import { Text } from '../../../shared/ui/Text';
import { useTheme } from '../../../shared/theme';
import { clay, claySurface, shade } from '../../../shared/theme/clay';
import { readableTextOn } from '../../../shared/theme/color';

interface NoteActionSheetProps {
  visible: boolean;
  noteColor: string;
  notePreview: string;
  onChangeColour: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * Tapping a note opens this rather than acting immediately — deleting is
 * destructive and a stray tap on a board you are panning should never throw a
 * thought away.
 */
export const NoteActionSheet: React.FC<NoteActionSheetProps> = ({
  visible,
  noteColor,
  notePreview,
  onChangeColour,
  onDelete,
  onClose,
}) => {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: colors.scrim }}
        onPress={onClose}
      >
        <Pressable
          className="px-5 pb-10 pt-4"
          style={[claySurface(colors, 32), { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View
            className="mb-4 h-1.5 w-12 self-center rounded-full"
            style={{ backgroundColor: shade(colors.surface, -0.18) }}
          />

          <View className="mb-5 flex-row items-center">
            <View
              className="mr-3 h-10 w-10 items-center justify-center"
              style={clay({ color: noteColor, radius: 12, depth: 0.6 })}
            >
              <Text className="text-xs font-bold" style={{ color: readableTextOn(noteColor) }}>
                Aa
              </Text>
            </View>
            <Text className="flex-1 text-sm text-muted" numberOfLines={2}>
              {notePreview}
            </Text>
          </View>

          <TouchableOpacity
            className="mb-3 flex-row items-center px-4 py-3.5"
            style={clay({ color: shade(colors.surface, colors.ink === '#F4E8DC' ? 0.08 : -0.04), radius: 18, depth: 0.7 })}
            activeOpacity={0.85}
            onPress={onChangeColour}
          >
            <Text className="mr-3 text-lg">🎨</Text>
            <Text className="text-base font-semibold text-ink">Change colour</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="flex-row items-center px-4 py-3.5"
            style={clay({ color: '#C6453C', radius: 18, depth: 0.9 })}
            activeOpacity={0.85}
            onPress={onDelete}
          >
            <Text className="mr-3 text-lg">🗑️</Text>
            <Text className="text-base font-bold" style={{ color: '#FFF' }}>
              Delete note
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
