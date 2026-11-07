import React, { useState } from 'react';
import { Modal, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../shared/ui/Text';
import { useTheme } from '../../../shared/theme';
import { clay, shade } from '../../../shared/theme/clay';
import type { NoteType } from '../../../core/domain';
import {
  Frame,
  Link,
  Palette,
  Trash2,
  X,
  MoreHorizontal,
  LayoutGrid,
  Copy,
  Tag,
  Ungroup,
  Unlink,
} from 'lucide-react-native';

const SWATCH_PALETTE = [
  '#FFF8BC',
  '#F8BBD0',
  '#C8E6C9',
  '#BBDEFB',
  '#E1BEE7',
  '#FFE0B2',
  '#D7CCC8',
  '#CFD8DC',
];

const NOTE_TYPES: Array<{ type: NoteType; labelEn: string; labelAr: string }> = [
  { type: 'idea', labelEn: 'Idea', labelAr: 'فكرة' },
  { type: 'task', labelEn: 'Task', labelAr: 'مهمة' },
  { type: 'question', labelEn: 'Question', labelAr: 'سؤال' },
  { type: 'decision', labelEn: 'Decision', labelAr: 'قرار' },
  { type: 'reference', labelEn: 'Reference', labelAr: 'مرجع' },
  { type: 'thought', labelEn: 'Thought', labelAr: 'خاطرة' },
  { type: 'summary', labelEn: 'Summary', labelAr: 'ملخص' },
];

interface CanvasSelectionBarProps {
  selectedNoteCount: number;
  selectedGroupCount: number;
  hasParentedNote?: boolean;
  onGroup?: () => void;
  onUngroup?: () => void;
  onLink?: () => void;
  onUnlink?: () => void;
  onColor?: (color: string) => void;
  onType?: (type: NoteType) => void;
  onTidy?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onClear?: () => void;
  lang?: 'en' | 'ar';
}

export const CanvasSelectionBar: React.FC<CanvasSelectionBarProps> = ({
  selectedNoteCount,
  selectedGroupCount,
  hasParentedNote = false,
  onGroup,
  onUngroup,
  onLink,
  onUnlink,
  onColor,
  onType,
  onTidy,
  onDuplicate,
  onDelete,
  onClear,
  lang = 'en',
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const totalSelected = selectedNoteCount + selectedGroupCount;
  if (totalSelected === 0) return null;

  const countLabel =
    lang === 'ar'
      ? `${totalSelected} محدد`
      : `${totalSelected} selected`;

  const canGroup = selectedNoteCount >= 1;
  const canLink = selectedNoteCount === 2;
  const canUngroup = selectedGroupCount > 0;
  const canUnlink = hasParentedNote;
  const canTidy = selectedNoteCount >= 2;

  return (
    <>
      <View
        className="absolute bottom-0 inset-x-0 z-40 border-t border-line shadow-2xl"
        style={{
          backgroundColor: colors.surface,
          paddingBottom: insets.bottom,
        }}
      >
        <View className="h-16 px-3 flex-row items-center justify-between">
          {/* Left: Clear button + Selection count */}
          <View className="flex-row items-center gap-1.5">
            <TouchableOpacity
              onPress={onClear}
              className="h-11 w-11 items-center justify-center rounded-xl"
              accessibilityLabel="Clear selection"
            >
              <X size={20} color={colors.ink} />
            </TouchableOpacity>
            <Text className="text-xs font-bold text-ink mr-2">{countLabel}</Text>
          </View>

          {/* Right: Primary action buttons (touch target >= 44x44 pt) */}
          <View className="flex-row items-center gap-1">
            {canGroup && onGroup && (
              <TouchableOpacity
                onPress={onGroup}
                className="min-w-[44px] h-11 px-2.5 items-center justify-center rounded-xl flex-row gap-1"
                style={clay({ color: shade(colors.surface, -0.04), radius: 12, depth: 0.5 })}
                accessibilityLabel="Group"
              >
                <Frame size={18} color={colors.ink} />
                <Text className="text-xs font-semibold text-ink">
                  {lang === 'ar' ? 'تجميع' : 'Group'}
                </Text>
              </TouchableOpacity>
            )}

            {canLink && onLink && (
              <TouchableOpacity
                onPress={onLink}
                className="min-w-[44px] h-11 px-2.5 items-center justify-center rounded-xl flex-row gap-1"
                style={clay({ color: shade(colors.surface, -0.04), radius: 12, depth: 0.5 })}
                accessibilityLabel="Link"
              >
                <Link size={18} color={colors.ink} />
                <Text className="text-xs font-semibold text-ink">
                  {lang === 'ar' ? 'ربط' : 'Link'}
                </Text>
              </TouchableOpacity>
            )}

            {onColor && (
              <TouchableOpacity
                onPress={() => setColorMenuOpen(true)}
                className="min-w-[44px] h-11 px-2.5 items-center justify-center rounded-xl flex-row gap-1"
                style={clay({ color: shade(colors.surface, -0.04), radius: 12, depth: 0.5 })}
                accessibilityLabel="Color"
              >
                <Palette size={18} color={colors.ink} />
                <Text className="text-xs font-semibold text-ink">
                  {lang === 'ar' ? 'لون' : 'Color'}
                </Text>
              </TouchableOpacity>
            )}

            {onDelete && (
              <TouchableOpacity
                onPress={onDelete}
                className="h-11 w-11 items-center justify-center rounded-xl"
                style={clay({ color: shade(colors.surface, -0.04), radius: 12, depth: 0.5 })}
                accessibilityLabel="Delete"
              >
                <Trash2 size={18} color={colors.warning} />
              </TouchableOpacity>
            )}

            {/* More button */}
            <TouchableOpacity
              onPress={() => setMoreMenuOpen(true)}
              className="h-11 w-11 items-center justify-center rounded-xl"
              style={clay({ color: shade(colors.surface, -0.04), radius: 12, depth: 0.5 })}
              accessibilityLabel="More options"
            >
              <MoreHorizontal size={20} color={colors.ink} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Color Palette Modal */}
      <Modal
        transparent
        visible={colorMenuOpen}
        animationType="fade"
        onRequestClose={() => setColorMenuOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setColorMenuOpen(false)}>
          <View className="flex-1 justify-end bg-black/40">
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View
                className="rounded-t-3xl p-5 pb-9 shadow-2xl gap-3"
                style={{ backgroundColor: colors.surface }}
              >
                <View className="flex-row items-center justify-between pb-2 border-b border-line">
                  <Text className="text-base font-bold text-ink">
                    {lang === 'ar' ? 'اختر اللون' : 'Choose color'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setColorMenuOpen(false)}
                    className="h-11 w-11 items-center justify-center rounded-full"
                  >
                    <X size={20} color={colors.muted} />
                  </TouchableOpacity>
                </View>
                <View className="flex-row flex-wrap gap-3 py-2 justify-center">
                  {SWATCH_PALETTE.map((color) => (
                    <TouchableOpacity
                      key={color}
                      onPress={() => {
                        onColor?.(color);
                        setColorMenuOpen(false);
                      }}
                      className="h-12 w-12 rounded-2xl border-2 border-black/10 shadow-sm items-center justify-center"
                      style={{ backgroundColor: color }}
                      accessibilityLabel={`Color ${color}`}
                    />
                  ))}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* More Options Modal */}
      <Modal
        transparent
        visible={moreMenuOpen}
        animationType="fade"
        onRequestClose={() => setMoreMenuOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setMoreMenuOpen(false)}>
          <View className="flex-1 justify-end bg-black/40">
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View
                className="rounded-t-3xl p-5 pb-9 shadow-2xl gap-2.5"
                style={{ backgroundColor: colors.surface }}
              >
                <View className="flex-row items-center justify-between pb-2 border-b border-line">
                  <Text className="text-base font-bold text-ink">
                    {lang === 'ar' ? 'خيارات إضافية' : 'More options'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setMoreMenuOpen(false)}
                    className="h-11 w-11 items-center justify-center rounded-full"
                  >
                    <X size={20} color={colors.muted} />
                  </TouchableOpacity>
                </View>

                {/* Tidy */}
                {canTidy && onTidy && (
                  <TouchableOpacity
                    onPress={() => {
                      setMoreMenuOpen(false);
                      onTidy();
                    }}
                    className="min-h-[48px] flex-row items-center gap-3 px-3 py-2.5 rounded-2xl"
                  >
                    <LayoutGrid size={20} color={colors.accent} />
                    <Text className="text-sm font-semibold text-ink">
                      {lang === 'ar' ? 'ترتيب الملاحظات' : 'Tidy notes'}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Duplicate */}
                {onDuplicate && (
                  <TouchableOpacity
                    onPress={() => {
                      setMoreMenuOpen(false);
                      onDuplicate();
                    }}
                    className="min-h-[48px] flex-row items-center gap-3 px-3 py-2.5 rounded-2xl"
                  >
                    <Copy size={20} color={colors.accent} />
                    <Text className="text-sm font-semibold text-ink">
                      {lang === 'ar' ? 'نسخ' : 'Duplicate'}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Ungroup */}
                {canUngroup && onUngroup && (
                  <TouchableOpacity
                    onPress={() => {
                      setMoreMenuOpen(false);
                      onUngroup();
                    }}
                    className="min-h-[48px] flex-row items-center gap-3 px-3 py-2.5 rounded-2xl"
                  >
                    <Ungroup size={20} color={colors.accent} />
                    <Text className="text-sm font-semibold text-ink">
                      {lang === 'ar' ? 'فك التجميع' : 'Ungroup'}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Unlink */}
                {canUnlink && onUnlink && (
                  <TouchableOpacity
                    onPress={() => {
                      setMoreMenuOpen(false);
                      onUnlink();
                    }}
                    className="min-h-[48px] flex-row items-center gap-3 px-3 py-2.5 rounded-2xl"
                  >
                    <Unlink size={20} color={colors.accent} />
                    <Text className="text-sm font-semibold text-ink">
                      {lang === 'ar' ? 'إلغاء الربط' : 'Unlink'}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Note Type Picker */}
                {onType && selectedNoteCount > 0 && (
                  <View className="pt-2 border-t border-line">
                    <Text className="text-xs font-bold text-muted mb-2 px-3">
                      {lang === 'ar' ? 'تغيير النوع' : 'Change type'}
                    </Text>
                    <View className="flex-row flex-wrap gap-2 px-1">
                      {NOTE_TYPES.map((nt) => (
                        <TouchableOpacity
                          key={nt.type}
                          onPress={() => {
                            onType(nt.type);
                            setMoreMenuOpen(false);
                          }}
                          className="min-h-[44px] px-3.5 py-2 rounded-xl border border-line items-center justify-center"
                          style={{ backgroundColor: shade(colors.surface, -0.04) }}
                        >
                          <Text className="text-xs font-semibold text-ink">
                            {lang === 'ar' ? nt.labelAr : nt.labelEn}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
};
