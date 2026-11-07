import React, { useEffect, useState } from 'react';
import { Keyboard, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../shared/ui/Text';
import { useTheme } from '../../../shared/theme';
import {
  Hand,
  MousePointer2,
  Plus,
  Waypoints,
  Pencil,
} from 'lucide-react-native';
import type { ToolMode } from './CanvasToolbar';
import { CanvasCreateSheet } from './CanvasCreateSheet';

interface CanvasMobileDockProps {
  toolMode: ToolMode;
  onSetToolMode: (mode: ToolMode) => void;
  selectedCount: number;
  onAddNote?: () => void;
  onAddSubNote?: () => void;
  onAddGroup?: () => void;
  onStartRecord?: () => void;
  canConnect?: boolean;
  lang?: 'en' | 'ar';
}

export const CanvasMobileDock: React.FC<CanvasMobileDockProps> = ({
  toolMode,
  onSetToolMode,
  selectedCount,
  onAddNote,
  onAddSubNote,
  onAddGroup,
  onStartRecord,
  canConnect = true,
  lang = 'en',
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (keyboardVisible) return null;

  const isHand = toolMode === 'pan' || toolMode === 'hand';
  const isSelect = toolMode === 'select' || toolMode === 'pointer';
  const isConnect = toolMode === 'arrow' || toolMode === 'connect';
  const isWrite = toolMode === 'write';

  return (
    <>
      <CanvasCreateSheet
        isOpen={createSheetOpen}
        onClose={() => setCreateSheetOpen(false)}
        onAddVoiceNote={onStartRecord}
        onAddStickyNote={onAddNote}
        onAddSubNote={onAddSubNote}
        onAddGroup={onAddGroup}
        selectedNoteCount={selectedCount}
        lang={lang}
      />

      {/* Labelled bottom dock: 64pt tall, min 44x44pt targets, clears safe area */}
      <View
        className="absolute bottom-0 inset-x-0 z-30 border-t border-line shadow-2xl"
        style={{
          backgroundColor: colors.surface,
          paddingBottom: insets.bottom,
        }}
        accessibilityRole="toolbar"
        aria-label="Mobile canvas dock"
      >
        <View className="h-16 px-4 flex-row items-center justify-around">
          {/* Hand mode */}
          <TouchableOpacity
            onPress={() => onSetToolMode('pan')}
            className="min-w-[48px] min-h-[44px] items-center justify-center gap-0.5 rounded-xl"
            activeOpacity={0.7}
            accessibilityLabel="Hand mode"
          >
            <Hand
              size={20}
              color={isHand ? colors.accent : colors.muted}
              strokeWidth={isHand ? 2.5 : 1.8}
            />
            <Text
              className="text-[10px] font-semibold"
              style={{ color: isHand ? colors.accent : colors.muted }}
            >
              {lang === 'ar' ? 'تحريك' : 'Hand'}
            </Text>
          </TouchableOpacity>

          {/* Select mode */}
          <TouchableOpacity
            onPress={() => onSetToolMode('select')}
            className="min-w-[48px] min-h-[44px] items-center justify-center gap-0.5 rounded-xl"
            activeOpacity={0.7}
            accessibilityLabel="Select mode"
          >
            <MousePointer2
              size={20}
              color={isSelect ? colors.accent : colors.muted}
              strokeWidth={isSelect ? 2.5 : 1.8}
            />
            <Text
              className="text-[10px] font-semibold"
              style={{ color: isSelect ? colors.accent : colors.muted }}
            >
              {lang === 'ar' ? 'تحديد' : 'Select'}
            </Text>
          </TouchableOpacity>

          {/* Centred and raised (+) Create button */}
          <View className="relative -top-4 items-center justify-center">
            <TouchableOpacity
              onPress={() => setCreateSheetOpen(true)}
              className="w-14 h-14 rounded-full items-center justify-center shadow-xl border-2"
              style={{
                backgroundColor: colors.accent,
                borderColor: colors.surface,
              }}
              activeOpacity={0.85}
              accessibilityLabel="Create item"
            >
              <Plus size={28} color={colors.onAccent} strokeWidth={2.8} />
            </TouchableOpacity>
          </View>

          {/* Link / Connect mode */}
          {canConnect && (
            <TouchableOpacity
              onPress={() => onSetToolMode('arrow')}
              className="min-w-[48px] min-h-[44px] items-center justify-center gap-0.5 rounded-xl"
              activeOpacity={0.7}
              accessibilityLabel="Link mode"
            >
              <Waypoints
                size={20}
                color={isConnect ? colors.accent : colors.muted}
                strokeWidth={isConnect ? 2.5 : 1.8}
              />
              <Text
                className="text-[10px] font-semibold"
                style={{ color: isConnect ? colors.accent : colors.muted }}
              >
                {lang === 'ar' ? 'ربط' : 'Link'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Write / Edit mode */}
          <TouchableOpacity
            onPress={() => onSetToolMode(isWrite ? 'pan' : 'write')}
            className="min-w-[48px] min-h-[44px] items-center justify-center gap-0.5 rounded-xl"
            activeOpacity={0.7}
            accessibilityLabel="Write mode"
          >
            <Pencil
              size={20}
              color={isWrite ? colors.accent : colors.muted}
              strokeWidth={isWrite ? 2.5 : 1.8}
            />
            <Text
              className="text-[10px] font-semibold"
              style={{ color: isWrite ? colors.accent : colors.muted }}
            >
              {lang === 'ar' ? 'كتابة' : 'Edit'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
};
