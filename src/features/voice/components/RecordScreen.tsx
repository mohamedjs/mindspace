import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Text } from '../../../shared/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useAudioRecorder,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { useSharedValue } from 'react-native-reanimated';
import { MicButton, MicButtonState } from './MicButton';
import { Waveform } from './Waveform';
import {
  FREE_MAX_RECORDING_SEC,
  METERING_INTERVAL_MS,
  MINDSPACE_RECORDING_OPTIONS,
  createRecordingRow,
} from '../services/recorder';
import { useRecordingStore } from '../store/recordingStore';
import { useTheme } from '../../../shared/theme';
import { clay } from '../../../shared/theme/clay';

function formatElapsed(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const min = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const sec = String(totalSec % 60).padStart(2, '0');
  return `${min}:${sec}`;
}

interface RecordScreenProps {
  spaceId: string;
  /** Called with the new recordings row id + local file uri once stopped. */
  onRecorded?: (recordingId: string, localUri: string) => void;
  onCancel?: () => void;
}

export const RecordScreen: React.FC<RecordScreenProps> = ({
  spaceId,
  onRecorded,
  onCancel,
}) => {
  const { colors } = useTheme();
  const recorder = useAudioRecorder(MINDSPACE_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, METERING_INTERVAL_MS);
  const [uiState, setUiState] = useState<MicButtonState>('idle');

  // Bar heights animate on the UI thread off this shared value, so the 32 bars
  // don't each re-render. expo-audio only exposes metering through
  // useAudioRecorderState (React state), so the polling tick itself is a
  // re-render of this screen — at METERING_INTERVAL_MS, not per frame.
  const level = useSharedValue(0);
  const hasStoppedRef = useRef(false);

  const setIsRecording = useRecordingStore((s) => s.setIsRecording);
  const resetRecording = useRecordingStore((s) => s.resetRecording);

  const elapsedMs = recorderState.durationMillis ?? 0;

  // Feed the shared value from metering. metering is dBFS (~-160..0).
  useEffect(() => {
    const db = recorderState.metering;
    if (typeof db !== 'number') return;
    const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
    level.value = normalized;
  }, [recorderState.metering, level]);

  const handleStop = useCallback(async () => {
    if (hasStoppedRef.current) return;
    hasStoppedRef.current = true;

    setUiState('processing');
    try {
      await recorder.stop();
      const uri = recorder.uri;
      setIsRecording(false);

      const recordingId = await createRecordingRow({
        spaceId,
        durationMs: elapsedMs,
      });

      if (uri) onRecorded?.(recordingId, uri);
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Could not upload',
        text2: err instanceof Error ? err.message : String(err),
      });
    } finally {
      resetRecording();
      setUiState('idle');
      level.value = 0;
    }
  }, [recorder, elapsedMs, spaceId, onRecorded, setIsRecording, resetRecording, level]);

  // Free tier hard stop at 180s.
  useEffect(() => {
    if (uiState !== 'recording') return;
    if (elapsedMs < FREE_MAX_RECORDING_SEC * 1000) return;

    Toast.show({
      type: 'info',
      text1: 'Recording limit reached',
      text2: `Free recordings stop at ${FREE_MAX_RECORDING_SEC / 60} minutes. We saved what you captured.`,
    });
    handleStop();
  }, [elapsedMs, uiState, handleStop]);

  const handleStart = useCallback(async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Toast.show({
          type: 'error',
          text1: 'Microphone needed',
          text2: 'MindSpace records your voice to turn it into notes. Enable the microphone in Settings to continue.',
        });
        return;
      }

      hasStoppedRef.current = false;
      try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      } catch (_) {
        // Not supported on every platform (e.g. web) — recording still works without it.
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      setUiState('recording');
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Could not start recording',
        text2: err instanceof Error ? err.message : String(err),
      });
      setUiState('idle');
    }
  }, [recorder, setIsRecording]);

  const remainingSec = Math.max(0, FREE_MAX_RECORDING_SEC - Math.floor(elapsedMs / 1000));

  return (
    <SafeAreaView className="flex-1 bg-board">
      <View className="flex-row justify-end px-5 py-4">
        <TouchableOpacity onPress={onCancel} hitSlop={12}>
          <View style={clay({ color: colors.surface, radius: 12 })} className="px-4 py-2">
            <Text className="text-sm font-bold text-muted">
              Cancel
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-6xl font-bold text-ink">{formatElapsed(elapsedMs)}</Text>
        {uiState === 'recording' && (
          <Text className="mt-3 text-sm font-bold uppercase tracking-widest text-warning">
            {remainingSec}s left
          </Text>
        )}

        <View className="mt-16 w-full">
          <Waveform level={level} />
        </View>
      </View>

      <View className="items-center pb-20">
        <MicButton
          state={uiState}
          onPress={uiState === 'recording' ? handleStop : handleStart}
        />
        <Text className="mt-6 text-[15px] font-bold text-muted">
          {uiState === 'recording'
            ? 'Tap to stop'
            : uiState === 'processing'
              ? 'Saving…'
              : 'Tap to record'}
        </Text>
      </View>
    </SafeAreaView>
  );
};
