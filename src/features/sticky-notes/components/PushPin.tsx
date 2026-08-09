import React from 'react';
import { View } from 'react-native';
import { pushPinTokens } from '../../../shared/constants/tokens';

interface PushPinProps {
  isLifted?: boolean;
}

export const PushPin: React.FC<PushPinProps> = ({ isLifted = false }) => {
  const pinSize = pushPinTokens.size;

  return (
    <View className="z-10 items-center justify-center">
      {/* Pin Shadow on the board / paper */}
      <View
        className="absolute"
        style={{
          width: pinSize,
          height: pinSize,
          borderRadius: pinSize / 2,
          backgroundColor: pushPinTokens.shadowColor,
          transform: [
            { translateY: isLifted ? 4 : 2 },
            { scale: isLifted ? 1.4 : 1.0 },
          ],
          opacity: isLifted ? 0.3 : 0.5,
        }}
      />
      {/* Pin Metallic Head */}
      <View
        className="items-start justify-start border p-0.5"
        style={{
          width: pinSize,
          height: pinSize,
          borderRadius: pinSize / 2,
          backgroundColor: pushPinTokens.headColor,
          borderColor: '#6E5940',
          transform: [{ scale: isLifted ? 1.25 : 1.0 }],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.4,
          shadowRadius: 3,
          elevation: 4,
        }}
      >
        {/* Specular Highlight */}
        <View
          style={{
            width: pinSize * 0.35,
            height: pinSize * 0.35,
            borderRadius: (pinSize * 0.35) / 2,
            backgroundColor: pushPinTokens.headHighlight,
            opacity: 0.85,
          }}
        />
      </View>
    </View>
  );
};
