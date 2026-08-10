import React, { useMemo } from 'react';
import { FlatList, TouchableOpacity, View } from 'react-native';
import { Text } from '../../../shared/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../shared/theme';
import { clay, clayAccent, shade } from '../../../shared/theme/clay';
import { CreditChip } from '../../credits/components/CreditChip';
import type { StickyNoteData } from '../../sticky-notes/components/StickyNoteItem';
import { NoteListRow } from './NoteListRow';
import { Mic, Settings } from 'lucide-react-native';

interface NotesListViewProps {
  spaceName: string;
  creditBalance: number;
  notes?: StickyNoteData[];
  onPressNote?: (noteId: string) => void;
  onStartRecord?: () => void;
  onOpenCredits?: () => void;
  onOpenSpaces?: () => void;
  onOpenSettings?: () => void;
  onOpenRecordings?: () => void;
}

/**
 * The same notes as the canvas, read top to bottom instead of arranged in
 * space. Sub-notes always nest under their parent here — indentation is the
 * whole point of a list, so the canvas-only "hide sub-notes" setting is
 * deliberately ignored.
 */
export const NotesListView: React.FC<NotesListViewProps> = ({
  spaceName,
  creditBalance,
  notes,
  onPressNote,
  onStartRecord,
  onOpenCredits,
  onOpenSpaces,
  onOpenSettings,
  onOpenRecordings,
}) => {
  const { colors } = useTheme();

  const childrenOf = useMemo(() => {
    const map = new Map<string, StickyNoteData[]>();
    notes?.forEach((n) => {
      if (!n.parentId) return;
      map.set(n.parentId, [...(map.get(n.parentId) ?? []), n]);
    });
    return map;
  }, [notes]);

  // Newest first: the thing you just said should be at the top, not buried
  // under months of older thinking.
  const roots = useMemo(
    () =>
      (notes ?? [])
        .filter((n) => !n.parentId)
        .sort((a, b) => (a.createdAt ?? '') < (b.createdAt ?? '') ? 1 : -1),
    [notes]
  );

  return (
    <View className="flex-1 bg-board">
      <SafeAreaView className="flex-1">
        <View
          className="z-30 mx-3 mt-2 flex-row items-center justify-between px-4 py-3"
          style={clay({ color: colors.surface, radius: 24 })}
        >
          <TouchableOpacity
            className="flex-1"
            onPress={onOpenSpaces}
            disabled={!onOpenSpaces}
            activeOpacity={0.7}
          >
            <Text className="text-[19px] font-bold text-ink">
              {spaceName} {onOpenSpaces ? '▾' : ''}
            </Text>
            <Text className="mt-0.5 text-[11px] font-medium text-muted">Tap a note to open it</Text>
          </TouchableOpacity>
          <CreditChip balance={creditBalance} onPress={onOpenCredits} />
          {onOpenRecordings && (
            <TouchableOpacity
              className="ml-2 h-9 w-9 items-center justify-center"
              style={clay({ color: shade(colors.surface, -0.06), radius: 18, depth: 0.6 })}
              onPress={onOpenRecordings}
            >
              <Mic size={18} color={colors.ink} strokeWidth={2.5} />
            </TouchableOpacity>
          )}
          {onOpenSettings && (
            <TouchableOpacity
              className="ml-2 h-9 w-9 items-center justify-center"
              style={clay({ color: shade(colors.surface, -0.06), radius: 18, depth: 0.6 })}
              onPress={onOpenSettings}
            >
              <Settings size={18} color={colors.ink} strokeWidth={2.5} />
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={roots}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 140 }}
          renderItem={({ item }) => (
            <NoteListRow note={item} childrenOf={childrenOf} onPress={onPressNote} />
          )}
          ListEmptyComponent={
            <Text className="px-4 py-16 text-center text-sm text-muted">
              No notes yet. Tap the mic and start thinking out loud.
            </Text>
          }
        />

        <View className="absolute inset-x-0 bottom-[30px] z-40 items-center">
          <TouchableOpacity
            className="h-[74px] w-[74px] items-center justify-center"
            style={[clayAccent(colors, 37), { shadowColor: colors.accent, shadowOpacity: 0.45 }]}
            activeOpacity={0.85}
            onPress={onStartRecord}
          >
            <View
              className="absolute h-[92px] w-[92px] rounded-full"
              style={{ backgroundColor: `${colors.accent}2E` }}
            />
            <Mic size={32} color="#FFF" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
};
