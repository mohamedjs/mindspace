'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type NoteSize = 'small' | 'medium' | 'large';

const STORAGE_KEY = 'mindspace:theme';
const HAND_DRAWN_KEY = 'mindspace:handdrawn';
const CANVAS_BG_KEY = 'mindspace:canvasbg';
const SHOW_CHILD_NOTES_KEY = 'mindspace:showchildnotes';
const NOTES_VIEW_KEY = 'mindspace:notesview';
const NOTE_SIZE_KEY = 'mindspace:notesize';

export const NOTE_SIZE_CONFIG: Record<NoteSize, { width: number; height: number; clampClass: string; textClass: string }> = {
  small: { width: 190, height: 140, clampClass: 'line-clamp-2', textClass: 'text-xs leading-4 font-medium' },
  medium: { width: 250, height: 190, clampClass: 'line-clamp-4', textClass: 'text-xs leading-5 font-medium' },
  large: { width: 320, height: 240, clampClass: 'line-clamp-8', textClass: 'text-sm leading-6 font-medium' },
};

export type NotesView = 'canvas' | 'mindmap' | 'list' | 'calendar';

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
  preference: ThemePreference;
  scheme: 'light' | 'dark';
  colors: Palette;
  setPreference: (next: ThemePreference) => void;
  handDrawnEnabled: boolean;
  setHandDrawnEnabled: (next: boolean) => void;
  canvasBackgroundEnabled: boolean;
  setCanvasBackgroundEnabled: (next: boolean) => void;
  showChildNotes: boolean;
  setShowChildNotes: (next: boolean) => void;
  notesView: NotesView;
  setNotesView: (next: NotesView) => void;
  noteSize: NoteSize;
  setNoteSize: (next: NoteSize) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

function getSystemScheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveScheme(pref: ThemePreference): 'light' | 'dark' {
  return pref === 'system' ? getSystemScheme() : pref;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    if (typeof window === 'undefined') return 'system';
    const saved = localStorage.getItem(STORAGE_KEY);
    return (saved === 'light' || saved === 'dark' || saved === 'system') ? saved : 'system';
  });

  const [systemScheme, setSystemScheme] = useState<'light' | 'dark'>(getSystemScheme);

  const [handDrawnEnabled, setHandDrawnEnabledState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem(HAND_DRAWN_KEY);
    return saved != null ? saved === '1' : true;
  });

  const [canvasBackgroundEnabled, setCanvasBackgroundEnabledState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem(CANVAS_BG_KEY);
    return saved != null ? saved === '1' : true;
  });

  const [showChildNotes, setShowChildNotesState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem(SHOW_CHILD_NOTES_KEY);
    return saved != null ? saved === '1' : true;
  });

  const [notesView, setNotesViewState] = useState<NotesView>(() => {
    if (typeof window === 'undefined') return 'canvas';
    const saved = localStorage.getItem(NOTES_VIEW_KEY);
    return (saved === 'canvas' || saved === 'mindmap' || saved === 'list' || saved === 'calendar') ? saved : 'canvas';
  });

  const [noteSize, setNoteSizeState] = useState<NoteSize>(() => {
    if (typeof window === 'undefined') return 'medium';
    const saved = localStorage.getItem(NOTE_SIZE_KEY);
    return (saved === 'small' || saved === 'medium' || saved === 'large') ? saved : 'medium';
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemScheme(e.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const scheme = preference === 'system' ? systemScheme : preference;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', scheme);
  }, [scheme]);

  useEffect(() => {
    if (handDrawnEnabled) {
      document.documentElement.setAttribute('data-hand', '1');
    } else {
      document.documentElement.removeAttribute('data-hand');
    }
  }, [handDrawnEnabled]);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  const setHandDrawnEnabled = (next: boolean) => {
    setHandDrawnEnabledState(next);
    localStorage.setItem(HAND_DRAWN_KEY, next ? '1' : '0');
  };

  const setCanvasBackgroundEnabled = (next: boolean) => {
    setCanvasBackgroundEnabledState(next);
    localStorage.setItem(CANVAS_BG_KEY, next ? '1' : '0');
  };

  const setShowChildNotes = (next: boolean) => {
    setShowChildNotesState(next);
    localStorage.setItem(SHOW_CHILD_NOTES_KEY, next ? '1' : '0');
  };

  const setNotesView = (next: NotesView) => {
    setNotesViewState(next);
    localStorage.setItem(NOTES_VIEW_KEY, next);
  };

  const setNoteSize = (next: NoteSize) => {
    setNoteSizeState(next);
    localStorage.setItem(NOTE_SIZE_KEY, next);
  };

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
        notesView,
        setNotesView,
        noteSize,
        setNoteSize,
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
