import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Text } from '../../../shared/ui/Text';
import type { Space } from '../api/spaces.api';
import { useTheme } from '../../../shared/theme';
import { clay, claySurface, shade } from '../../../shared/theme/clay';
import { Trash2, Sun, Moon, Sunrise, Lightbulb, Target, Book, Rocket, Palette, Brain, Briefcase, Sprout, Folder, Plus } from 'lucide-react-native';
import { useAuth } from '../../../providers/AuthProvider';

const ICON_CHOICES = [
  { id: 'lightbulb', icon: Lightbulb },
  { id: 'target', icon: Target },
  { id: 'book', icon: Book },
  { id: 'rocket', icon: Rocket },
  { id: 'palette', icon: Palette },
  { id: 'brain', icon: Brain },
  { id: 'briefcase', icon: Briefcase },
  { id: 'sprout', icon: Sprout },
];

export const getSpaceIcon = (idOrEmoji: string) => {
  return ICON_CHOICES.find((c) => c.id === idOrEmoji)?.icon || Folder;
};

interface SpacesSheetProps {
  visible: boolean;
  spaces: Space[] | undefined;
  activeSpaceId: string | null;
  creating: boolean;
  onSelect: (spaceId: string) => void;
  onCreate: (name: string, emoji: string) => void;
  onDelete: (spaceId: string) => void;
  onClose: () => void;
}

export const SpacesSheet: React.FC<SpacesSheetProps> = ({
  visible,
  spaces,
  activeSpaceId,
  creating,
  onSelect,
  onCreate,
  onDelete,
  onClose,
}) => {
  const { colors, scheme } = useTheme();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(ICON_CHOICES[0].id);

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed, emoji);
    setName('');
  };

  const hour = new Date().getHours();
  const timeIcon = hour < 12 ? <Sunrise size={20} color={colors.warning} /> : hour < 18 ? <Sun size={20} color={colors.warning} /> : <Moon size={20} color={colors.accent} />;
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const displayName = user?.user_metadata?.full_name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
      >
        <Pressable className="flex-1 justify-end" style={{ backgroundColor: colors.scrim }} onPress={onClose}>
          <Pressable
            className="max-h-[85%] px-5 pb-10 pt-4"
            style={[claySurface(colors, 32), { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View
            className="mb-6 h-1.5 w-12 self-center rounded-full"
            style={{ backgroundColor: shade(colors.surface, -0.18) }}
          />

          <View className="mb-2 flex-row items-center">
            <Text className="text-2xl font-bold text-ink mr-2">
              {greeting}, {displayName}
            </Text>
            {timeIcon}
          </View>
          <Text className="mb-8 text-sm font-medium text-muted">
            What's on your mind today?
          </Text>

          <Text className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">
            My Spaces
          </Text>

          <View className="mt-4">
            {!spaces && (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
            )}
            {spaces?.map((space) => {
              const isActive = space.id === activeSpaceId;
              return (
                <View
                  key={space.id}
                  className="mb-2.5 flex-row items-center px-4 py-3"
                  style={clay({
                    color: isActive ? shade(colors.accent, scheme === 'dark' ? -0.75 : 0.72) : shade(colors.surface, -0.05),
                    radius: 18,
                    depth: isActive ? 0.9 : 0.5,
                  })}
                >
                  <TouchableOpacity
                    className="flex-1 flex-row items-center"
                    onPress={() => onSelect(space.id)}
                  >
                    <View className="mr-3">
                      {(() => {
                        const IconComp = getSpaceIcon(space.emoji);
                        return <IconComp size={22} color={colors.ink} />;
                      })()}
                    </View>
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-ink">{space.name}</Text>
                      <Text className="mt-0.5 text-xs text-muted">
                        {space.noteCount} {space.noteCount === 1 ? 'note' : 'notes'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {spaces.length > 1 && (
                    <TouchableOpacity hitSlop={8} onPress={() => onDelete(space.id)}>
                      <Trash2 size={20} color={colors.muted} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>

          <View className="mt-4 flex-row flex-wrap">
            {ICON_CHOICES.map((choice) => {
              const IconComp = choice.icon;
              return (
                <TouchableOpacity
                  key={choice.id}
                  onPress={() => setEmoji(choice.id)}
                  className="mb-2 mr-2 h-11 w-11 items-center justify-center"
                  style={clay({
                    color: emoji === choice.id ? shade(colors.accent, scheme === 'dark' ? -0.75 : 0.6) : shade(colors.surface, -0.05),
                    radius: 16,
                    depth: emoji === choice.id ? 1 : 0.4,
                  })}
                >
                  <IconComp size={20} color={colors.ink} />
                </TouchableOpacity>
              );
            })}
          </View>

          <View
            className="flex-row items-center px-4"
            style={clay({ color: shade(colors.surface, -0.06), radius: 18, pressed: true })}
          >
            <View className="mr-2">
              {(() => {
                const SelectedIcon = getSpaceIcon(emoji);
                return <SelectedIcon size={20} color={colors.ink} />;
              })()}
            </View>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="New space name…"
              placeholderTextColor={colors.muted}
              className="flex-1 py-3 text-base text-ink"
              onSubmitEditing={handleCreate}
              returnKeyType="done"
              editable={!creating}
            />
            <TouchableOpacity onPress={handleCreate} disabled={creating || !name.trim()} hitSlop={8}>
              {creating ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Plus size={24} color={name.trim() ? colors.accent : colors.line} />
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
};
