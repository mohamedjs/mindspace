'use client';
import { create } from 'zustand';

interface RecordingState {
  isRecording: boolean;
  recordingId: string | null;
  spaceId: string | null;
  elapsedMs: number;
  meterLevel: number;

  setIsRecording: (isRecording: boolean) => void;
  setRecordingId: (id: string | null) => void;
  setSpaceId: (id: string | null) => void;
  setElapsedMs: (ms: number) => void;
  setMeterLevel: (level: number) => void;
  resetRecording: () => void;
}

export const useRecordingStore = create<RecordingState>()((set) => ({
  isRecording: false,
  recordingId: null,
  spaceId: null,
  elapsedMs: 0,
  meterLevel: 0,

  setIsRecording: (isRecording: boolean) => set({ isRecording }),
  setRecordingId: (recordingId: string | null) => set({ recordingId }),
  setSpaceId: (spaceId: string | null) => set({ spaceId }),
  setElapsedMs: (elapsedMs: number) => set({ elapsedMs }),
  setMeterLevel: (meterLevel: number) => set({ meterLevel }),
  resetRecording: () =>
    set({
      isRecording: false,
      recordingId: null,
      spaceId: null,
      elapsedMs: 0,
      meterLevel: 0,
    }),
}));
