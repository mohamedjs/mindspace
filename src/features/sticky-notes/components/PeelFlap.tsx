import React from 'react';
import { View, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface PeelFlapProps {
  size: number;
  color: string;
}

export const PeelFlap: React.FC<PeelFlapProps> = ({ size, color }) => {
  return (
    <View
      className="absolute bottom-0 right-0"
      style={{
        width: size,
        height: size,
        shadowColor: '#000',
        shadowOffset: { width: -2, height: -2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Path
          d="M 100 0 L 0 100 C 20 80, 80 20, 100 0 Z"
          fill={color}
        />
      </Svg>
    </View>
  );
};
