import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'nativewind';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'mindspace:theme';

/**
 * JS mirror of the CSS variables in global.css. Needed because a fair number of
 * RN props take colours as values, not classNames — ActivityIndicator's
 * `color`, shadowColor, placeholderTextColor, Skia paints. Keep both in sync.
 */
export interface Palette {
  canvas: string;
  board: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  onAccent: string;
  line: string;
  warning: string;
  grid: string;
  scrim: string;
  overlay: string;
}

export const palettes: Record<'light' | 'dark', Palette> = {
  dark: {
    canvas: '#202124',
    board: '#17181A',
    surface: '#292A2D',
    ink: '#F8F9FA',
    muted: '#9AA0A6',
    accent: '#8AB4F8',
    onAccent: '#202124',
    line: '#3C4043',
    warning: '#FDE293',
    grid: 'rgba(255, 255, 255, 0.025)',
    scrim: 'rgba(0, 0, 0, 0.65)',
    overlay: 'rgba(41, 42, 45, 0.94)',
  },
  light: {
    canvas: '#F5EDE3',
    board: '#EFE4D6',
    surface: '#FBF6F0',
    ink: '#2C1E14',
    muted: '#7A6552',
    accent: '#B8620F',
    onAccent: '#FFFFFF',
    line: '#E0D2C0',
    warning: '#B06A00',
    grid: 'rgba(44, 30, 20, 0.08)',
    scrim: 'rgba(44, 30, 20, 0.35)',
    overlay: 'rgba(251, 246, 240, 0.96)',
  },
};

interface ThemeValue {
  /** What the user picked — 'system' follows the OS. */
  preference: ThemePreference;
  /** What is actually rendering right now. */
  scheme: 'light' | 'dark';
  colors: Palette;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  // Restore the saved choice once on mount. Until it loads we stay on
  // 'system', which is also the sensible default for a first run.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setPreferenceState(saved);
        setColorScheme(saved);
      }
    });
  }, [setColorScheme]);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    setColorScheme(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const scheme = colorScheme === 'light' ? 'light' : 'dark';

  return (
    <ThemeContext.Provider
      value={{ preference, scheme, colors: palettes[scheme], setPreference }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
