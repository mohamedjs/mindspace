import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'nativewind';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'mindspace:theme';
const HAND_DRAWN_KEY = 'mindspace:handdrawn';
const CANVAS_BG_KEY = 'mindspace:canvasbg';
const SHOW_CHILD_NOTES_KEY = 'mindspace:showchildnotes';

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
  /** Excalidraw-style hand-drawn font for Latin text; Arabic always keeps its own face. */
  handDrawnEnabled: boolean;
  setHandDrawnEnabled: (next: boolean) => void;
  /** Decorative grid + colour orbs on the canvas, vs a plain solid board. */
  canvasBackgroundEnabled: boolean;
  setCanvasBackgroundEnabled: (next: boolean) => void;
  /** Sub-notes as connected cards on the canvas, or just their parent idea. */
  showChildNotes: boolean;
  setShowChildNotes: (next: boolean) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [handDrawnEnabled, setHandDrawnEnabledState] = useState(true);
  const [canvasBackgroundEnabled, setCanvasBackgroundEnabledState] = useState(true);
  const [showChildNotes, setShowChildNotesState] = useState(true);

  // Restore saved choices once on mount. Until they load we stay on the
  // defaults, which match the app's original always-on behaviour.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setPreferenceState(saved);
        setColorScheme(saved);
      }
    });
    AsyncStorage.getItem(HAND_DRAWN_KEY).then((saved) => {
      if (saved != null) setHandDrawnEnabledState(saved === '1');
    });
    AsyncStorage.getItem(CANVAS_BG_KEY).then((saved) => {
      if (saved != null) setCanvasBackgroundEnabledState(saved === '1');
    });
    AsyncStorage.getItem(SHOW_CHILD_NOTES_KEY).then((saved) => {
      if (saved != null) setShowChildNotesState(saved === '1');
    });
  }, [setColorScheme]);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    setColorScheme(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const setHandDrawnEnabled = (next: boolean) => {
    setHandDrawnEnabledState(next);
    AsyncStorage.setItem(HAND_DRAWN_KEY, next ? '1' : '0').catch(() => {});
  };

  const setCanvasBackgroundEnabled = (next: boolean) => {
    setCanvasBackgroundEnabledState(next);
    AsyncStorage.setItem(CANVAS_BG_KEY, next ? '1' : '0').catch(() => {});
  };

  const setShowChildNotes = (next: boolean) => {
    setShowChildNotesState(next);
    AsyncStorage.setItem(SHOW_CHILD_NOTES_KEY, next ? '1' : '0').catch(() => {});
  };

  const scheme = colorScheme === 'light' ? 'light' : 'dark';

  return (
    <ThemeContext.Provider
      value={{
        preference,
        scheme,
        colors: palettes[scheme],
        setPreference,
        handDrawnEnabled,
        setHandDrawnEnabled,
        canvasBackgroundEnabled,
        setCanvasBackgroundEnabled,
        showChildNotes,
        setShowChildNotes,
      }}
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
