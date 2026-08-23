'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTheme } from '@/shared/theme';
import { clay } from '@/shared/theme/clay';
import { MicButton, type MicButtonState } from './MicButton';
import { Waveform } from './Waveform';
import {
  FREE_MAX_RECORDING_MIN,
  MEDIA_CONSTRAINTS,
  pickMimeType,
} from '../services/recorder';
import { useActiveSubscription, usePlans } from '@/features/billing/hooks/useBilling';
import { useRecordingStore } from '../store/recordingStore';
import { useRepositories } from '@/providers/RepositoryProvider';

function formatElapsed(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const min = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const sec = String(totalSec % 60).padStart(2, '0');
  return `${min}:${sec}`;
}

interface RecordScreenProps {
  spaceId: string;
  onRecorded?: (recordingId: string, localUri: string) => void;
  onCancel?: () => void;
}

export const RecordScreen: React.FC<RecordScreenProps> = ({
  spaceId,
  onRecorded,
  onCancel,
}) => {
  const { colors } = useTheme();
  const repos = useRepositories();

  const { data: subscription } = useActiveSubscription();
  const { data: plans } = usePlans();
  const activePlan = plans?.find((p) => p.id === subscription?.planId);
  const maxRecordingSec = (activePlan?.maxRecordingMinutes ?? FREE_MAX_RECORDING_MIN) * 60;

  const [uiState, setUiState] = useState<MicButtonState>('idle');
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const hasStoppedRef = useRef(false);

  const setIsRecording = useRecordingStore((s) => s.setIsRecording);
  const resetRecording = useRecordingStore((s) => s.resetRecording);

  const cleanupAudio = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const handleStop = useCallback(async () => {
    if (hasStoppedRef.current) return;
    hasStoppedRef.current = true;

    setUiState('processing');
    const duration = Date.now() - startTimeRef.current;

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cleanupAudio();
      setUiState('idle');
      return;
    }

    const stopPromise = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        resolve(blob);
      };
    });

    recorder.stop();
    const audioBlob = await stopPromise;
    cleanupAudio();
    setIsRecording(false);

    try {
      const recordingId = await repos.recordings.create({
        spaceId,
        durationMs: duration,
      });

      const blobUrl = URL.createObjectURL(audioBlob);
      if (onRecorded) {
        onRecorded(recordingId, blobUrl);
      }
    } catch (err) {
      toast.error('Could not upload', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      resetRecording();
      setUiState('idle');
      setLevel(0);
    }
  }, [repos, spaceId, onRecorded, setIsRecording, resetRecording, cleanupAudio]);

  // Hard stop at plan limit
  useEffect(() => {
    if (uiState !== 'recording') return;
    if (elapsedMs < maxRecordingSec * 1000) return;

    toast.info('Recording limit reached', {
      description: activePlan
        ? `${activePlan.name} recordings stop at ${maxRecordingSec / 60} minutes. We saved what you captured.`
        : `Free recordings stop at ${maxRecordingSec / 60} minutes. Subscribe for longer ones — we saved what you captured.`,
    });
    handleStop();
  }, [elapsedMs, uiState, handleStop, maxRecordingSec, activePlan]);

  const handleStart = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      // Audio Context for Level Meter
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateMeter = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const norm = Math.min(1, avg / 128);
        setLevel(norm);
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();

      hasStoppedRef.current = false;
      startTimeRef.current = Date.now();
      recorder.start(100);
      setIsRecording(true);
      setUiState('recording');

      timerIntervalRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 100);
    } catch (err) {
      toast.error('Could not start recording', {
        description: err instanceof Error ? err.message : 'Microphone permission denied or unavailable.',
      });
      setUiState('idle');
    }
  }, [setIsRecording]);

  useEffect(() => {
    return () => cleanupAudio();
  }, [cleanupAudio]);

  const remainingSec = Math.max(0, maxRecordingSec - Math.floor(elapsedMs / 1000));

  return (
    <div className="flex flex-col flex-1 min-h-screen bg-board">
      <div className="flex justify-end px-5 py-4">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer border-0 bg-transparent p-0"
        >
          <div style={clay({ color: colors.surface, radius: 12 })} className="px-4 py-2">
            <span className="text-sm font-bold text-muted">Cancel</span>
          </div>
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="text-6xl font-bold text-ink">{formatElapsed(elapsedMs)}</div>
        {uiState === 'recording' && (
          <div className="mt-3 text-sm font-bold uppercase tracking-widest text-warning">
            {remainingSec}s left
          </div>
        )}

        <div className="mt-16 w-full max-w-md">
          <Waveform level={level} />
        </div>
      </div>

      <div className="flex flex-col items-center pb-20">
        <MicButton
          state={uiState}
          onPress={uiState === 'recording' ? handleStop : handleStart}
        />
        <div className="mt-6 text-[15px] font-bold text-muted">
          {uiState === 'recording'
            ? 'Tap to stop'
            : uiState === 'processing'
              ? 'Saving…'
              : 'Tap to record'}
        </div>
      </div>
    </div>
  );
};
