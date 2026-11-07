import React from 'react';
import { Modal, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { Text } from '../../../shared/ui/Text';
import { useTheme } from '../../../shared/theme';
import { clay, shade } from '../../../shared/theme/clay';
import {
  Mic,
  StickyNote,
  CornerDownRight,
  Frame,
  X,
} from 'lucide-react-native';

interface CanvasCreateSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onAddVoiceNote?: () => void;
  onAddStickyNote?: () => void;
  onAddSubNote?: () => void;
  onAddGroup?: () => void;
  selectedNoteCount?: number;
  lang?: 'en' | 'ar';
}

export const CanvasCreateSheet: React.FC<CanvasCreateSheetProps> = ({
  isOpen,
  onClose,
  onAddVoiceNote,
  onAddStickyNote,
  onAddSubNote,
  onAddGroup,
  selectedNoteCount = 0,
  lang = 'en',
}) => {
  const { colors } = useTheme();

  if (!isOpen) return null;

  const canSubNote = selectedNoteCount === 1;

  return (
    <Modal
      transparent
      visible={isOpen}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 justify-end bg-black/40">
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View
              className="rounded-t-3xl p-5 pb-9 shadow-2xl gap-3"
              style={{ backgroundColor: colors.surface }}
            >
              {/* Header */}
              <View className="flex-row items-center justify-between pb-2 border-b border-line">
                <Text className="text-base font-bold text-ink">
                  {lang === 'ar' ? 'إضافة عنصر جديد' : 'Create new item'}
                </Text>
                <TouchableOpacity
                  onPress={onClose}
                  className="h-11 w-11 items-center justify-center rounded-full"
                  accessibilityLabel="Close sheet"
                >
                  <X size={20} color={colors.muted} />
                </TouchableOpacity>
              </View>

              {/* Voice note */}
              {onAddVoiceNote && (
                <TouchableOpacity
                  onPress={() => {
                    onClose();
                    onAddVoiceNote();
                  }}
                  activeOpacity={0.8}
                  className="min-h-[52px] flex-row items-center gap-3.5 px-4 py-3 rounded-2xl"
                  style={{ backgroundColor: colors.accent }}
                  accessibilityLabel="Voice note"
                >
                  <Mic size={22} color={colors.onAccent} />
                  <View className="flex-1">
                    <Text className="text-sm font-bold" style={{ color: colors.onAccent }}>
                      {lang === 'ar' ? 'ملاحظة صوتية' : 'Voice note'}
                    </Text>
                    <Text className="text-[11px] opacity-80" style={{ color: colors.onAccent }}>
                      {lang === 'ar'
                        ? 'تحدث وسيقوم الذكاء الاصطناعي بتنظيم أفكارك'
                        : 'Speak and AI organizes your thoughts'}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Sticky note */}
              {onAddStickyNote && (
                <TouchableOpacity
                  onPress={() => {
                    onClose();
                    onAddStickyNote();
                  }}
                  activeOpacity={0.8}
                  className="min-h-[52px] flex-row items-center gap-3.5 px-4 py-3 rounded-2xl border border-line"
                  style={{ backgroundColor: shade(colors.surface, -0.03) }}
                  accessibilityLabel="Sticky note"
                >
                  <StickyNote size={22} color={colors.accent} />
                  <Text className="text-sm font-semibold text-ink">
                    {lang === 'ar' ? 'ملاحظة جديدة' : 'Sticky note'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Sub-note */}
              {onAddSubNote && (
                <TouchableOpacity
                  onPress={() => {
                    if (canSubNote) {
                      onClose();
                      onAddSubNote();
                    }
                  }}
                  disabled={!canSubNote}
                  activeOpacity={0.8}
                  className={`min-h-[52px] flex-row items-center gap-3.5 px-4 py-3 rounded-2xl border border-line ${
                    canSubNote ? 'opacity-100' : 'opacity-40'
                  }`}
                  style={{ backgroundColor: shade(colors.surface, -0.03) }}
                  accessibilityLabel="Sub-note"
                >
                  <CornerDownRight size={22} color={colors.accent} />
                  <View className="flex-1 flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-ink">
                      {lang === 'ar' ? 'ملاحظة فرعية' : 'Sub-note'}
                    </Text>
                    {!canSubNote && (
                      <Text className="text-[11px] text-muted">
                        {lang === 'ar' ? 'حدد ملاحظة واحدة أولاً' : 'Select 1 note first'}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}

              {/* Group */}
              {onAddGroup && (
                <TouchableOpacity
                  onPress={() => {
                    onClose();
                    onAddGroup();
                  }}
                  activeOpacity={0.8}
                  className="min-h-[52px] flex-row items-center gap-3.5 px-4 py-3 rounded-2xl border border-line"
                  style={{ backgroundColor: shade(colors.surface, -0.03) }}
                  accessibilityLabel="Group"
                >
                  <Frame size={22} color={colors.accent} />
                  <Text className="text-sm font-semibold text-ink">
                    {lang === 'ar' ? 'مجموعة' : 'Group'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};
