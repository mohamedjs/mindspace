import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '../../../shared/ui/Text';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-client/keys';
import { fetchSpaceRecordings, signedAudioUrl, type SpaceRecording } from '../api/recordings.api';
import { useTheme } from '../../../shared/theme';
import { clay, claySurface, shade } from '../../../shared/theme/clay';
import { readableTextOn } from '../../../shared/theme/color';
import { Mic, Play, Pause } from 'lucide-react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';

interface RecordingsSheetProps {
  visible: boolean;
  spaceId: string | null;
  spaceName: string;
  onClose: () => void;
}

function formatDuration(ms: number) {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

const STATUS_TEXT: Record<string, string> = {
  recorded: 'Not processed yet',
  uploading: 'Uploading',
  transcribing: 'Transcribing',
  transcribed: 'Done',
  failed: 'Failed',
};

interface CardProps {
  recording: SpaceRecording;
  isPlaying: boolean;
  isLoading: boolean;
  onTogglePlay: () => void;
}

const RecordingCard: React.FC<CardProps> = ({
  recording,
  isPlaying,
  isLoading,
  onTogglePlay,
}) => {
  const { colors } = useTheme();
  const canPlay = recording.storagePath !== null;
  const isDone = recording.status === 'transcribed';
  const isFailed = recording.status === 'failed';
  const statusColor = isFailed ? '#C6453C' : isDone ? '#3F8F4F' : colors.muted;

  return (
    <View className="mb-3 p-4" style={claySurface(colors, 22)}>
      <View className="flex-row items-center">
        <TouchableOpacity
          onPress={canPlay ? onTogglePlay : undefined}
          disabled={!canPlay || isLoading}
          className="mr-3 h-10 w-10 items-center justify-center"
          style={clay({ color: shade(colors.surface, -0.05), radius: 20, depth: 0.5, pressed: isPlaying })}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.ink} />
          ) : isPlaying ? (
            <Pause size={20} color={colors.ink} strokeWidth={2.5} />
          ) : canPlay ? (
            <Play size={20} color={colors.ink} strokeWidth={2.5} style={{ marginLeft: 3 }} />
          ) : (
            <Mic size={20} color={colors.muted} strokeWidth={2.5} />
          )}
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-ink">
            {formatDuration(recording.durationMs)} · {recording.notes.length}{' '}
            {recording.notes.length === 1 ? 'note' : 'notes'}
          </Text>
          <Text className="mt-0.5 text-xs text-muted">
            {formatWhen(recording.createdAt)}
            {!canPlay && recording.status === 'transcribed' ? ' · audio not kept' : ''}
          </Text>
        </View>
        <Text className="text-xs font-bold" style={{ color: statusColor }}>
          {STATUS_TEXT[recording.status] ?? recording.status}
        </Text>
      </View>

      {recording.transcript && (
        <View
          className="mt-3 px-3 py-2"
          style={clay({ color: shade(colors.surface, -0.05), radius: 14, pressed: true })}
        >
          <Text className="text-xs italic leading-4 text-muted">“{recording.transcript}”</Text>
        </View>
      )}

      {isFailed && recording.error && (
        <Text className="mt-2 text-xs" style={{ color: '#C6453C' }}>
          {recording.error}
        </Text>
      )}

      {recording.notes.length > 0 && (
        <View className="mt-3 flex-row flex-wrap">
          {recording.notes.map((note) => {
            const bg = note.color ?? '#FFF8BC';
            return (
              <View
                key={note.id}
                className="mb-2 mr-2 max-w-full px-2.5 py-1.5"
                style={clay({ color: bg, radius: 10, depth: 0.4 })}
              >
                <Text
                  className="text-[11px] font-semibold"
                  numberOfLines={1}
                  style={{ color: readableTextOn(bg) }}
                >
                  {note.title || note.content}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

export const RecordingsSheet: React.FC<RecordingsSheetProps> = ({
  visible,
  spaceId,
  spaceName,
  onClose,
}) => {
  const { colors } = useTheme();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // One player for the whole sheet — starting a second recording should stop
  // the first, not layer two voices on top of each other.
  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);

  const togglePlay = useCallback(
    async (recording: SpaceRecording) => {
      if (!recording.storagePath) return;

      if (playingId === recording.id) {
        status.playing ? player.pause() : player.play();
        return;
      }

      setLoadingId(recording.id);
      try {
        // iOS keeps the session in record mode after a recording, which routes
        // playback to the earpiece at low volume until this is flipped back.
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
        const url = await signedAudioUrl(recording.storagePath);
        player.replace({ uri: url });
        player.play();
        setPlayingId(recording.id);
      } catch {
        setPlayingId(null);
      } finally {
        setLoadingId(null);
      }
    },
    [player, playingId, status.playing]
  );

  const { data: recordings, isLoading } = useQuery({
    queryKey: queryKeys.recordings.bySpace(spaceId ?? ''),
    queryFn: () => fetchSpaceRecordings(spaceId!),
    enabled: visible && Boolean(spaceId),
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        {/* Backdrop – tapping it closes the sheet */}
        <Pressable
          className="absolute inset-0"
          style={{ backgroundColor: colors.scrim }}
          onPress={onClose}
        />

        {/* Sheet body – a plain View so ScrollView/TouchableOpacity get touches */}
        <View
          className="h-[80%] px-5 pt-4 pb-0"
          style={[claySurface(colors, 32), { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}
        >
          <View
            className="mb-4 h-1.5 w-12 self-center rounded-full"
            style={{ backgroundColor: shade(colors.surface, -0.18) }}
          />

          <Text className="text-xl font-bold text-ink">Recordings</Text>
          <Text className="mb-4 mt-0.5 text-xs text-muted">
            Everything said in {spaceName}, and the notes it became.
          </Text>

          {isLoading && <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />}

          {recordings?.length === 0 && (
            <Text className="mt-10 text-center text-sm text-muted">
              No recordings in this space yet. Tap the mic to add one.
            </Text>
          )}

          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
            nestedScrollEnabled
          >
            {recordings?.map((recording) => (
              <RecordingCard
                key={recording.id}
                recording={recording}
                isPlaying={playingId === recording.id && status.playing}
                isLoading={loadingId === recording.id}
                onTogglePlay={() => togglePlay(recording)}
              />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};
