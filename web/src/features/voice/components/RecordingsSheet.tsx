'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-client/keys';
import { fetchSpaceRecordings, signedAudioUrl, type SpaceRecording } from '../api/recordings.api';
import { useTheme } from '@/shared/theme';
import { clay, claySurface, shade } from '@/shared/theme/clay';
import { readableTextOn } from '@/shared/theme/color';
import { Mic, Play, Pause, X } from 'lucide-react';

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
    <div className="mb-3 p-4 rounded-2xl" style={claySurface(colors, 22)}>
      <div className="flex flex-row items-center">
        <button
          type="button"
          onClick={canPlay ? onTogglePlay : undefined}
          disabled={!canPlay || isLoading}
          className="mr-3 h-10 w-10 flex items-center justify-center rounded-full cursor-pointer border-0 disabled:cursor-default disabled:opacity-50"
          style={clay({ color: shade(colors.surface, -0.05), radius: 20, depth: 0.5, pressed: isPlaying })}
        >
          {isLoading ? (
            <div
              className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: `${colors.ink} transparent ${colors.ink} ${colors.ink}` }}
            />
          ) : isPlaying ? (
            <Pause size={20} color={colors.ink} strokeWidth={2.5} />
          ) : canPlay ? (
            <Play size={20} color={colors.ink} strokeWidth={2.5} className="ml-0.5" />
          ) : (
            <Mic size={20} color={colors.muted} strokeWidth={2.5} />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink">
            {formatDuration(recording.durationMs)} · {recording.notes.length}{' '}
            {recording.notes.length === 1 ? 'note' : 'notes'}
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {formatWhen(recording.createdAt)}
            {!canPlay && recording.status === 'transcribed' ? ' · audio not kept' : ''}
          </div>
        </div>
        <div className="text-xs font-bold shrink-0" style={{ color: statusColor }}>
          {STATUS_TEXT[recording.status] ?? recording.status}
        </div>
      </div>

      {recording.transcript && (
        <div
          className="mt-3 px-3 py-2 rounded-xl"
          style={clay({ color: shade(colors.surface, -0.05), radius: 14, pressed: true })}
        >
          <p className="text-xs italic leading-4 text-muted">“{recording.transcript}”</p>
        </div>
      )}

      {isFailed && recording.error && (
        <div className="mt-2 text-xs" style={{ color: '#C6453C' }}>
          {recording.error}
        </div>
      )}

      {recording.notes.length > 0 && (
        <div className="mt-3 flex flex-row flex-wrap gap-2">
          {recording.notes.map((note) => {
            const bg = note.color ?? '#FFF8BC';
            return (
              <div
                key={note.id}
                className="max-w-full px-2.5 py-1.5 rounded-lg"
                style={clay({ color: bg, radius: 10, depth: 0.4 })}
              >
                <span
                  className="text-[11px] font-semibold truncate block"
                  style={{ color: readableTextOn(bg) }}
                >
                  {note.title || note.content}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (visible) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [visible]);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    audio.onpause = () => setPlayingId(null);
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  const togglePlay = useCallback(
    async (recording: SpaceRecording) => {
      if (!recording.storagePath || !audioRef.current) return;

      if (playingId === recording.id) {
        audioRef.current.pause();
        setPlayingId(null);
        return;
      }

      setLoadingId(recording.id);
      try {
        const url = await signedAudioUrl(recording.storagePath);
        audioRef.current.src = url;
        await audioRef.current.play();
        setPlayingId(recording.id);
      } catch {
        setPlayingId(null);
      } finally {
        setLoadingId(null);
      }
    },
    [playingId]
  );

  const { data: recordings, isLoading } = useQuery({
    queryKey: queryKeys.recordings.bySpace(spaceId ?? ''),
    queryFn: () => fetchSpaceRecordings(spaceId!),
    enabled: visible && Boolean(spaceId),
  });

  if (!visible) return null;

  return (
    <dialog
      ref={dialogRef}
      className="backdrop:bg-black/65 bg-transparent border-0 p-0 m-0 w-full max-w-lg md:m-auto fixed inset-x-0 bottom-0 md:inset-0 z-50 flex items-end md:items-center justify-center"
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      onCancel={onClose}
    >
      <div
        className="w-full max-h-[85vh] flex flex-col px-6 pb-6 pt-4 rounded-t-3xl md:rounded-3xl shadow-2xl"
        style={claySurface(colors, 32)}
      >
        <div
          className="mb-4 h-1.5 w-12 mx-auto rounded-full shrink-0"
          style={{ backgroundColor: shade(colors.surface, -0.18) }}
        />

        <div className="mb-1 flex flex-row items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-ink">Recordings</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center cursor-pointer border-0 bg-transparent text-muted hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>
        <p className="mb-4 text-xs text-muted shrink-0">
          Everything said in {spaceName}, and the notes it became.
        </p>

        {isLoading && (
          <div className="py-8 flex justify-center shrink-0">
            <div
              className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: `${colors.accent} transparent ${colors.accent} ${colors.accent}` }}
            />
          </div>
        )}

        {recordings?.length === 0 && (
          <div className="py-10 text-center text-sm text-muted shrink-0">
            No recordings in this space yet. Tap the mic to add one.
          </div>
        )}

        <div className="flex-1 overflow-y-auto pr-1 space-y-3">
          {recordings?.map((recording) => (
            <RecordingCard
              key={recording.id}
              recording={recording}
              isPlaying={playingId === recording.id}
              isLoading={loadingId === recording.id}
              onTogglePlay={() => togglePlay(recording)}
            />
          ))}
        </div>
      </div>
    </dialog>
  );
};
