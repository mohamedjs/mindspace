import React from 'react';
import { View } from 'react-native';
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
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 5,
      }}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Path d="M 0 0 L 100 0 L 0 100 Z" fill={color} />
      </Svg>
    </View>
  );
};
