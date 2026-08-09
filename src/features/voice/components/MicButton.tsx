import React from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../shared/theme';
import { clay, shade } from '../../../shared/theme/clay';
import { Mic, Square } from 'lucide-react-native';

export type MicButtonState = 'idle' | 'recording' | 'processing';

interface MicButtonProps {
  state: MicButtonState;
  onPress?: () => void;
}

export const MicButton: React.FC<MicButtonProps> = ({ state, onPress }) => {
  const { colors, scheme } = useTheme();
  const isProcessing = state === 'processing';
  const isRecording = state === 'recording';

  // To match the mockup, the idle state is a dark circle in light mode and a light circle in dark mode.
  const idleColor = scheme === 'dark' ? '#E8EAED' : '#3F2E23';
  const iconColor = scheme === 'dark' ? '#17181A' : '#F5EDE3';
  const activeColor = isRecording ? '#FF453A' : idleColor;

  return (
    <TouchableOpacity
      className="h-24 w-24 items-center justify-center rounded-full"
      style={clay({ color: shade(colors.surface, -0.03), radius: 48, depth: 1 })}
      activeOpacity={0.85}
      disabled={isProcessing}
      onPress={onPress}
    >
      <View
        className="h-16 w-16 items-center justify-center rounded-full"
        style={{
          backgroundColor: activeColor,
          shadowColor: activeColor,
          shadowOpacity: 0.4,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        {isProcessing ? (
          <ActivityIndicator color={iconColor} />
        ) : isRecording ? (
          <Square size={26} color="#FFF" fill="#FFF" />
        ) : (
          <Mic size={28} color={iconColor} strokeWidth={2.5} />
        )}
      </View>
    </TouchableOpacity>
  );
};
