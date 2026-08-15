import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Mic } from 'lucide-react-native';
import { useTheme } from '../theme';
import { clayAccent } from '../theme/clay';

interface RecordFabProps {
  onPress?: () => void;
}

/** The one button every view of the notes has: start talking. */
export const RecordFab: React.FC<RecordFabProps> = ({ onPress }) => {
  const { colors } = useTheme();

  return (
    <View className="absolute inset-x-0 bottom-[30px] z-40 items-center">
      <TouchableOpacity
        className="h-[74px] w-[74px] items-center justify-center"
        style={[clayAccent(colors, 37), { shadowColor: colors.accent, shadowOpacity: 0.45 }]}
        activeOpacity={0.85}
        onPress={onPress}
        accessibilityLabel="Record a new note"
      >
        <View
          className="absolute h-[92px] w-[92px] rounded-full"
          style={{ backgroundColor: `${colors.accent}2E` }}
        />
        <Mic size={32} color="#FFF" strokeWidth={2.5} />
      </TouchableOpacity>
    </View>
  );
};
