import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Text } from '../../../shared/ui/Text';
import { useTheme } from '../../../shared/theme';
import { clay } from '../../../shared/theme/clay';
import type { ToolMode } from './CanvasToolbar';

interface CanvasHintChipProps {
  toolMode: ToolMode;
  arrowSourceId: string | null;
  selectedCount: number;
  onCancel?: () => void;
  lang?: 'en' | 'ar';
}

export const CanvasHintChip: React.FC<CanvasHintChipProps> = ({
  toolMode,
  arrowSourceId,
  selectedCount,
  onCancel,
  lang = 'en',
}) => {
  const { colors } = useTheme();

  let hintEn: string | null = null;
  let hintAr: string | null = null;

  if (toolMode === 'arrow' || toolMode === 'connect') {
    if (arrowSourceId) {
      hintEn = 'Now tap the child note';
      hintAr = 'الآن المس الملاحظة التابعة';
    } else {
      hintEn = 'Tap the parent note';
      hintAr = 'المس الملاحظة الرئيسية';
    }
  } else if (toolMode === 'write') {
    hintEn = 'Tap a note to write in it';
    hintAr = 'المس ملاحظة للكتابة فيها';
  } else if ((toolMode === 'select' || toolMode === 'pointer') && selectedCount === 0) {
    hintEn = 'Tap notes to select';
    hintAr = 'المس الملاحظات لتحديدها';
  }

  if (!hintEn) return null;

  const hintText = lang === 'ar' ? hintAr : hintEn;

  return (
    <View
      className="absolute bottom-20 inset-x-0 z-30 items-center justify-center pointer-events-box-none"
      pointerEvents="box-none"
    >
      <View
        className="flex-row items-center px-4 py-2 gap-2 shadow-lg"
        style={clay({ color: colors.surface, radius: 24, depth: 0.8 })}
      >
        <Text className="text-xs font-semibold text-ink">{hintText}</Text>
        {onCancel && (
          <TouchableOpacity
            onPress={onCancel}
            activeOpacity={0.7}
            className="px-2 py-0.5 rounded-full bg-line"
            accessibilityLabel="Cancel mode"
          >
            <Text className="text-[10px] font-mono font-bold text-muted">Esc</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};
