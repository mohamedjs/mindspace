import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../shared/theme';
import { clay, shade } from '../../../shared/theme/clay';
import { Plus, Minus, Scan } from 'lucide-react-native';

interface CanvasZoomControlsProps {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitToView?: () => void;
  lang?: 'en' | 'ar';
}

export const CanvasZoomControls: React.FC<CanvasZoomControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onFitToView,
}) => {
  const { colors } = useTheme();

  return (
    <View
      className="absolute right-3 bottom-24 z-30 flex-col gap-2 pointer-events-box-none"
      pointerEvents="box-none"
    >
      <View
        className="p-1 gap-1.5 shadow-xl border border-line"
        style={clay({ color: colors.surface, radius: 20, depth: 0.8 })}
      >
        {onFitToView && (
          <TouchableOpacity
            onPress={onFitToView}
            className="w-11 h-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: shade(colors.surface, -0.04) }}
            accessibilityLabel="Fit to view"
            activeOpacity={0.7}
          >
            <Scan size={18} color={colors.ink} strokeWidth={2.4} />
          </TouchableOpacity>
        )}

        {onZoomOut && (
          <TouchableOpacity
            onPress={onZoomOut}
            className="w-11 h-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: shade(colors.surface, -0.04) }}
            accessibilityLabel="Zoom out"
            activeOpacity={0.7}
          >
            <Minus size={18} color={colors.ink} strokeWidth={2.4} />
          </TouchableOpacity>
        )}

        {onZoomIn && (
          <TouchableOpacity
            onPress={onZoomIn}
            className="w-11 h-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: shade(colors.surface, -0.04) }}
            accessibilityLabel="Zoom in"
            activeOpacity={0.7}
          >
            <Plus size={18} color={colors.ink} strokeWidth={2.4} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};
