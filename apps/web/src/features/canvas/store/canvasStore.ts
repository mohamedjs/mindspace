'use client';
import { create } from 'zustand';

interface Point {
  x: number;
  y: number;
}

interface CanvasState {
  scale: number;
  offset: Point;
  selectedNoteIds: string[];
  draggingNoteId: string | null;
  connectingFromNoteId: string | null;
  colorPickerNoteId: string | null;
  
  // Actions
  setScale: (scale: number) => void;
  setOffset: (offset: Point) => void;
  setSelectedNoteIds: (ids: string[]) => void;
  selectNote: (id: string, multiSelect?: boolean) => void;
  clearSelection: () => void;
  setDraggingNoteId: (id: string | null) => void;
  setConnectingFromNoteId: (id: string | null) => void;
  setColorPickerNoteId: (id: string | null) => void;
  resetCanvas: () => void;
}

export const useCanvasStore = create<CanvasState>()((set) => ({
  scale: 1,
  offset: { x: 0, y: 0 },
  selectedNoteIds: [],
  draggingNoteId: null,
  connectingFromNoteId: null,
  colorPickerNoteId: null,

  setScale: (scale: number) => set({ scale }),
  setOffset: (offset: Point) => set({ offset }),
  setSelectedNoteIds: (selectedNoteIds: string[]) => set({ selectedNoteIds }),
  selectNote: (id: string, multiSelect: boolean = false) =>
    set((state: CanvasState) => ({
      selectedNoteIds: multiSelect
        ? state.selectedNoteIds.includes(id)
          ? state.selectedNoteIds.filter((item: string) => item !== id)
          : [...state.selectedNoteIds, id]
        : [id],
    })),
  clearSelection: () => set({ selectedNoteIds: [] }),
  setDraggingNoteId: (draggingNoteId: string | null) => set({ draggingNoteId }),
  setConnectingFromNoteId: (connectingFromNoteId: string | null) => set({ connectingFromNoteId }),
  setColorPickerNoteId: (colorPickerNoteId: string | null) => set({ colorPickerNoteId }),
  resetCanvas: () =>
    set({
      scale: 1,
      offset: { x: 0, y: 0 },
      selectedNoteIds: [],
      draggingNoteId: null,
      connectingFromNoteId: null,
      colorPickerNoteId: null,
    }),
}));
