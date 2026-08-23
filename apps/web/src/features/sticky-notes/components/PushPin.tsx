'use client';

import React from 'react';
import { pushPinTokens } from '@/shared/constants/tokens';

interface PushPinProps {
  isLifted?: boolean;
}

export const PushPin: React.FC<PushPinProps> = ({ isLifted = false }) => {
  const pinSize = pushPinTokens.size;

  return (
    <div className="z-10 flex items-center justify-center relative">
      {/* Pin Shadow */}
      <div
        className="absolute rounded-full transition-all duration-150"
        style={{
          width: pinSize,
          height: pinSize,
          backgroundColor: pushPinTokens.shadowColor,
          transform: `translateY(${isLifted ? 4 : 2}px) scale(${isLifted ? 1.4 : 1.0})`,
          opacity: isLifted ? 0.3 : 0.5,
        }}
      />
      {/* Pin Metallic Head */}
      <div
        className="flex items-start justify-start border p-0.5 rounded-full shadow-md transition-transform duration-150"
        style={{
          width: pinSize,
          height: pinSize,
          backgroundColor: pushPinTokens.headColor,
          borderColor: '#6E5940',
          transform: `scale(${isLifted ? 1.25 : 1.0})`,
        }}
      >
        {/* Specular Highlight */}
        <div
          className="rounded-full"
          style={{
            width: pinSize * 0.35,
            height: pinSize * 0.35,
            backgroundColor: pushPinTokens.headHighlight,
            opacity: 0.85,
          }}
        />
      </div>
    </div>
  );
};
