import React, { useState, useEffect } from 'react';
import { Modal, Pressable, TouchableOpacity, View } from 'react-native';
import { Text } from '../../../shared/ui/Text';
import { useTheme } from '../../../shared/theme';
import { clay, claySurface, shade } from '../../../shared/theme/clay';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ReanimatedColorPicker, { Panel1, HueSlider } from 'reanimated-color-picker';
import { X } from 'lucide-react-native';

interface ColorPickerProps {
  visible: boolean;
  currentColor: string;
  onSelectColor: (color: string) => void;
  onClose: () => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  visible,
  currentColor,
  onSelectColor,
  onClose,
}) => {
  const { colors } = useTheme();
  const [localColor, setLocalColor] = useState(currentColor);

  useEffect(() => {
    if (visible) {
      setLocalColor(currentColor);
    }
  }, [visible, currentColor]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable
          className="flex-1 items-center justify-center px-6"
          style={{ backgroundColor: colors.scrim }}
          onPress={onClose}
        >
          <View
            className="w-full max-w-[280px] p-4"
            style={claySurface(colors, 28)}
            onStartShouldSetResponder={() => true}
          >
            <View className="mb-5 flex-row items-center justify-between">
              <Text className="text-sm font-bold text-ink">Note colour</Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={8}
                className="h-7 w-7 items-center justify-center"
                style={clay({ color: shade(colors.surface, -0.06), radius: 14, depth: 0.5, pressed: true })}
              >
                <X size={16} color={colors.muted} strokeWidth={3} />
              </TouchableOpacity>
            </View>

            {/*
              onCompleteJS, not onComplete: the library calls onComplete inside
              its `'worklet'` gesture-end handler, i.e. on the UI thread, so
              touching React state or a react-query mutation from there crashes.
              onCompleteJS is the same callback wrapped in runOnJS.
            */}
            <ReanimatedColorPicker
              value={localColor}
              onCompleteJS={(color) => setLocalColor(color.hex)}
              sliderThickness={20}
              thumbSize={24}
            >
              <Panel1 style={{ borderRadius: 12, marginBottom: 16, height: 140 }} />
              <HueSlider style={{ borderRadius: 10 }} />
            </ReanimatedColorPicker>

            <View className="mt-5 flex-row items-center justify-end">
              <TouchableOpacity
                onPress={onClose}
                className="mr-3 px-4 py-2 rounded-xl"
                style={clay({ color: shade(colors.surface, -0.06), radius: 12, depth: 0.5 })}
              >
                <Text className="text-sm font-semibold text-ink">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onSelectColor(localColor)}
                className="px-4 py-2 rounded-xl"
                style={clay({ color: colors.accent, radius: 12, depth: 0.8 })}
              >
                <Text className="text-sm font-bold text-white">Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
};
