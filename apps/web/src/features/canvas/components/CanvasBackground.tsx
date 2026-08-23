'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from '@/shared/theme';
import { gridScale, wrapToTile } from '../utils/coords';

const GRID_SIZE = 24;
const SHEET = 3;

interface CanvasBackgroundProps {
  translateX?: number;
  translateY?: number;
  scale?: number;
}

export const CanvasBackground: React.FC<CanvasBackgroundProps> = ({
  translateX = 0,
  translateY = 0,
  scale = 1,
}) => {
  const { colors, scheme, canvasBackgroundEnabled } = useTheme();
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });
  const isDark = scheme === 'dark';

  useEffect(() => {
    const updateSize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  if (!canvasBackgroundEnabled) return null;

  const s = gridScale(scale);
  const tile = GRID_SIZE * s;
  const gridTx = wrapToTile(translateX, tile);
  const gridTy = wrapToTile(translateY, tile);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Ambient orbs fixed to the viewport */}
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <radialGradient id="orbA" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={colors.accent} stopOpacity={isDark ? 0.16 : 0.1} />
            <stop offset="100%" stopColor={colors.accent} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="orbB" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#B388FF" stopOpacity={isDark ? 0.13 : 0.08} />
            <stop offset="100%" stopColor="#B388FF" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="orbC" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#4DD0E1" stopOpacity={isDark ? 0.1 : 0.07} />
            <stop offset="100%" stopColor="#4DD0E1" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="15%" cy="18%" r="180" fill="url(#orbA)" />
        <circle cx="88%" cy="42%" r="210" fill="url(#orbB)" />
        <circle cx="35%" cy="82%" r="240" fill="url(#orbC)" />
      </svg>

      {/* Grid Sheet */}
      <div
        className="absolute top-0 left-0"
        style={{
          width: dimensions.width * SHEET,
          height: dimensions.height * SHEET,
          transform: `translate(${gridTx}px, ${gridTy}px) scale(${s})`,
          transformOrigin: 'top left',
        }}
      >
        <svg width="100%" height="100%">
          <defs>
            <pattern id="grid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
              <rect x="0" y="0" width={GRID_SIZE} height="1" fill={colors.grid} />
              <rect x="0" y="0" width="1" height={GRID_SIZE} fill={colors.grid} />
            </pattern>
          </defs>
          <rect x="0" y="0" width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>
    </div>
  );
};
