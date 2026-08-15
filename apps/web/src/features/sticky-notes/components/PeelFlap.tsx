'use client';

import React from 'react';

interface PeelFlapProps {
  size: number;
  color: string;
}

export const PeelFlap: React.FC<PeelFlapProps> = ({ size, color }) => {
  return (
    <div
      className="absolute bottom-0 right-0 pointer-events-none"
      style={{
        width: size,
        height: size,
        filter: 'drop-shadow(-2px -2px 3px rgba(0,0,0,0.25))',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path
          d="M 100 0 C 70 30, 20 40, 0 100 C 30 90, 80 80, 100 0 Z"
          fill={color}
        />
      </svg>
    </div>
  );
};
