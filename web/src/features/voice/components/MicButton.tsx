'use client';

import React from 'react';
import { useTheme } from '@/shared/theme';
import { clay, shade } from '@/shared/theme/clay';
import { Mic, Square } from 'lucide-react';

export type MicButtonState = 'idle' | 'recording' | 'processing';

interface MicButtonProps {
  state: MicButtonState;
  onPress?: () => void;
}

export const MicButton: React.FC<MicButtonProps> = ({ state, onPress }) => {
  const { colors, scheme } = useTheme();
  const isProcessing = state === 'processing';
  const isRecording = state === 'recording';

  const idleColor = scheme === 'dark' ? '#E8EAED' : '#3F2E23';
  const iconColor = scheme === 'dark' ? '#17181A' : '#F5EDE3';
  const activeColor = isRecording ? '#FF453A' : idleColor;

  return (
    <button
      type="button"
      className="h-24 w-24 flex items-center justify-center rounded-full cursor-pointer border-0 transition-transform active:scale-95 disabled:cursor-default disabled:opacity-50"
      style={clay({ color: shade(colors.surface, -0.03), radius: 48, depth: 1 })}
      disabled={isProcessing}
      onClick={onPress}
      aria-label={isRecording ? 'Stop recording' : 'Start recording'}
    >
      <div
        className="h-16 w-16 flex items-center justify-center rounded-full transition-all"
        style={{
          backgroundColor: activeColor,
          boxShadow: `0 4px 10px ${activeColor}66`,
        }}
      >
        {isProcessing ? (
          <div
            className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: `${iconColor} transparent ${iconColor} ${iconColor}` }}
          />
        ) : isRecording ? (
          <Square size={26} color="#FFF" fill="#FFF" />
        ) : (
          <Mic size={28} color={iconColor} strokeWidth={2.5} />
        )}
      </div>
    </button>
  );
};
