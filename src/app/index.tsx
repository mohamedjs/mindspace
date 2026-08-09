import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, TouchableOpacity, View } from 'react-native';
import { Text } from '../shared/ui/Text';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CanvasRoot } from '../features/canvas/components/CanvasRoot';
import { SpacesSheet } from '../features/canvas/components/SpacesSheet';
import { RecordingsSheet } from '../features/voice/components/RecordingsSheet';
import { createSpace, deleteSpace, fetchSpaces } from '../features/canvas/api/spaces.api';
import { queryKeys } from '../lib/query-client/keys';
import {
  useNotes,
  useUpdateNoteColor,
  useMoveNote,
  useDeleteNote,
  useTidyNotes,
} from '../features/sticky-notes/hooks/useNotes';
import { useBalance } from '../features/credits/hooks/useCredits';
import { useRecordingStatus } from '../features/voice/hooks/useRecordingStatus';
import { runThinkingPipeline } from '../features/voice/services/pipeline';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../shared/theme';

const STATUS_LABEL: Record<string, string> = {
  recorded: 'Saved on device…',
  uploading: 'Uploading…',
  transcribing: 'Listening to what you said…',
  transcribed: 'Turning that into notes…',
  extracting: 'Turning that into notes…',
  completed: 'Notes created!',
  failed: 'Something went wrong — audio is safe on your device.',
};

/** Statuses that are terminal-but-unfinished: nothing will move them on its own. */
const RETRYABLE: string[] = ['failed', 'recorded'];

const LAST_SPACE_KEY = 'mindspace:lastSpaceId';

export default function HomeScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const { colors } = useTheme();
  const { recordingId } = useLocalSearchParams<{ recordingId?: string }>();
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [spacesSheetOpen, setSpacesSheetOpen] = useState(false);
  const [recordingsSheetOpen, setRecordingsSheetOpen] = useState(false);

  const { data: spaces, isLoading: spacesLoading } = useQuery({
    queryKey: queryKeys.spaces.all,
    queryFn: fetchSpaces,
    enabled: Boolean(user),
  });

  const selectSpace = useCallback((id: string) => {
    setSpaceId(id);
    AsyncStorage.setItem(LAST_SPACE_KEY, id).catch(() => {});
  }, []);

  // Every user needs somewhere to put their first thought — make one rather
  // than showing an empty screen with no way forward. Prefer the space the
  // user was last on so switching spaces survives an app restart.
  useEffect(() => {
    if (!user || spacesLoading || spaceId) return;

    if (spaces?.length) {
      AsyncStorage.getItem(LAST_SPACE_KEY).then((lastId) => {
        const stillExists = lastId && spaces.some((s) => s.id === lastId);
        setSpaceId(stillExists ? lastId! : spaces[0].id);
      });
      return;
    }

    if (spaces) {
      createSpace('My MindSpace')
        .then((space) => selectSpace(space.id))
        .catch(() => {});
    }
  }, [user, spaces, spacesLoading, spaceId, selectSpace]);

  const { data: notes } = useNotes(spaceId);
  const { data: balance } = useBalance();
  const recolor = useUpdateNoteColor(spaceId);
  const moveNote = useMoveNote(spaceId);
  const removeNote = useDeleteNote(spaceId);
  const tidyNotes = useTidyNotes(spaceId);
  const { status: recordingStatus } = useRecordingStatus(recordingId ?? null);

  const createSpaceMutation = useMutation({
    mutationFn: ({ name, emoji }: { name: string; emoji: string }) => createSpace(name, emoji),
    onSuccess: (space) => {
      qc.invalidateQueries({ queryKey: queryKeys.spaces.all });
      selectSpace(space.id);
      setSpacesSheetOpen(false);
    },
  });

  const deleteSpaceMutation = useMutation({
    mutationFn: (id: string) => deleteSpace(id),
    onSuccess: (_data, deletedId) => {
      qc.invalidateQueries({ queryKey: queryKeys.spaces.all });
      if (deletedId === spaceId) {
        setSpaceId(null);
        AsyncStorage.removeItem(LAST_SPACE_KEY).catch(() => {});
      }
    },
  });

  // The audio is already in Storage by the time a row reaches failed/recorded,
  // so re-running the pipeline is enough — no re-upload, no local file needed.
  const retryPipeline = useMutation({
    mutationFn: () => runThinkingPipeline(recordingId!, spaceId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notes.bySpace(spaceId!) });
      qc.invalidateQueries({ queryKey: queryKeys.credits.balance });
    },
    onError: (err) => Alert.alert('Still not working', err.message),
  });

  // Drop the recordingId once the pipeline is done. Without this the param
  // lives in the route forever, so the banner reappears on every later visit to
  // this screen, and it can only ever be dismissed by recording again.
  useEffect(() => {
    // Also accept 'transcribed' for backward compatibility with older recordings
    if (recordingStatus !== 'completed' && recordingStatus !== 'transcribed') return;
    
    // Provide explicit feedback when creating notes completes
    if (recordingStatus === 'completed') {
      Alert.alert('Success', 'MindSpace finished turning your thoughts into sticky notes!');
    }
    
    qc.invalidateQueries({ queryKey: queryKeys.notes.bySpace(spaceId ?? '') });
    router.setParams({ recordingId: undefined });
  }, [recordingStatus, router, qc, spaceId]);

  const handleUpdateColor = useCallback(
    (noteId: string, color: string) => recolor.mutate({ noteId, color }),
    [recolor]
  );

  const handleMoveNote = useCallback(
    (noteId: string, x: number, y: number) => moveNote.mutate({ noteId, x, y }),
    [moveNote]
  );

  // Soft delete, so the recordings sheet still shows what the recording produced
  // and the row survives for undo.
  const handleDeleteNote = useCallback(
    (noteId: string) => removeNote.mutate(noteId),
    [removeNote]
  );

  if (authLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const activeSpace = spaces?.find((s) => s.id === spaceId);
  const available = balance ? balance.creditsBalance - balance.creditsReserved : 0;
  const showStatusBanner = recordingStatus && recordingStatus !== 'completed' && recordingStatus !== 'transcribed';

  return (
    <View className="flex-1 bg-canvas">
      <CanvasRoot
        spaceName={activeSpace?.name ?? 'My MindSpace'}
        creditBalance={available}
        notes={notes}
        onUpdateNoteColor={handleUpdateColor}
        onDeleteNote={handleDeleteNote}
        onMoveNote={handleMoveNote}
        onOpenCredits={() => router.push('/credits')}
        onOpenSpaces={() => setSpacesSheetOpen(true)}
        onOpenSettings={() => router.push('/settings')}
        onOpenRecordings={() => setRecordingsSheetOpen(true)}
        onTidy={notes?.length ? () => tidyNotes.mutate(notes) : undefined}
        onPressNote={(noteId) => {
          router.push({ pathname: '/note/[id]', params: { id: noteId, spaceId: spaceId ?? '' } });
        }}
        onStartRecord={() => {
          if (spaceId) router.push({ pathname: '/record', params: { spaceId } });
        }}
      />
      <RecordingsSheet
        visible={recordingsSheetOpen}
        spaceId={spaceId}
        spaceName={activeSpace?.name ?? 'this space'}
        onClose={() => setRecordingsSheetOpen(false)}
      />
      <SpacesSheet
        visible={spacesSheetOpen}
        spaces={spaces}
        activeSpaceId={spaceId}
        creating={createSpaceMutation.isPending}
        onSelect={(id) => {
          selectSpace(id);
          setSpacesSheetOpen(false);
        }}
        onCreate={(name, emoji) => createSpaceMutation.mutate({ name, emoji })}
        onDelete={(id) => deleteSpaceMutation.mutate(id)}
        onClose={() => setSpacesSheetOpen(false)}
      />
      {!spaceId && (
        <View className="absolute inset-x-0 top-1/2 items-center">
          <Text className="text-sm text-muted">
            Preparing your board…
          </Text>
        </View>
      )}
      {showStatusBanner && (
        <View
          className="absolute inset-x-0 top-16 mx-6 flex-row items-center rounded-full px-4 py-2.5"
          style={{ backgroundColor: colors.overlay, borderWidth: 1, borderColor: colors.line }}
        >
          {(recordingStatus !== 'failed' || retryPipeline.isPending) && (
            <ActivityIndicator size="small" color={colors.accent} style={{ marginRight: 8 }} />
          )}
          <Text className="flex-1 text-sm text-ink">
            {STATUS_LABEL[recordingStatus] ?? recordingStatus}
          </Text>
          {RETRYABLE.includes(recordingStatus) && !retryPipeline.isPending && spaceId && (
            <TouchableOpacity onPress={() => retryPipeline.mutate()} hitSlop={10}>
              <Text className="ml-3 text-sm font-bold text-accent">
                Retry
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}
