import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Text } from '../shared/ui/Text';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CanvasRoot } from '../features/canvas/components/CanvasRoot';
import { SpacesSheet } from '../features/canvas/components/SpacesSheet';
import { RecordingsSheet } from '../features/voice/components/RecordingsSheet';
import { createSpace, deleteSpace, fetchSpaces, updateSpace } from '../features/canvas/api/spaces.api';
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
  const { colors, showChildNotes } = useTheme();
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

  // Auto-select the very first space (spaces[0]) whenever spaces load
  // and no space is currently selected. The backend auto-creates one on signup.
  useEffect(() => {
    if (!user || spacesLoading || spaceId) return;

    if (spaces?.length) {
      setSpaceId(spaces[0].id);
    }
  }, [user, spaces, spacesLoading, spaceId]);

  const { data: notes } = useNotes(spaceId);
  const { data: balance } = useBalance();
  const recolor = useUpdateNoteColor(spaceId);
  const moveNote = useMoveNote(spaceId);
  const removeNote = useDeleteNote(spaceId);
  const tidyNotes = useTidyNotes(spaceId);
  const { status: recordingStatus } = useRecordingStatus(recordingId ?? null);

  // Tallied from the full list regardless of the visibility setting below —
  // the badge should still say "3 sub-notes" even while they're hidden.
  const childCounts = useMemo(() => {
    const counts = new Map<string, number>();
    notes?.forEach((n) => {
      if (n.parentId) counts.set(n.parentId, (counts.get(n.parentId) ?? 0) + 1);
    });
    return counts;
  }, [notes]);

  // The "sub-notes on canvas" setting only affects what's drawn — tidy and
  // the badge count still need the full list (including hidden children) so
  // clusters keep moving together and counts stay accurate either way.
  const visibleNotes = useMemo(
    () => (showChildNotes ? notes : notes?.filter((n) => !n.parentId)),
    [notes, showChildNotes]
  );

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

  const updateSpaceMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateSpace(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.spaces.all });
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
    onError: (err) => Toast.show({ type: 'error', text1: 'Still not working', text2: err.message }),
  });

  useEffect(() => {
    // We only take action when the pipeline reaches a terminal state
    if (recordingStatus !== 'completed' && recordingStatus !== 'transcribed' && recordingStatus !== 'failed') return;
    
    if (recordingStatus === 'completed') {
      Toast.show({ type: 'success', text1: 'Success', text2: 'MindSpace finished turning your thoughts into sticky notes!' });
    } else if (recordingStatus === 'failed') {
      Toast.show({
        type: 'error',
        text1: 'Something went wrong',
        text2: 'Audio is safe on your device.',
        props: {
          onRetry: () => retryPipeline.mutate()
        }
      });
    }
    
    qc.invalidateQueries({ queryKey: queryKeys.notes.bySpace(spaceId ?? '') });
    router.setParams({ recordingId: undefined });
  }, [recordingStatus, router, qc, spaceId, retryPipeline]);

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
  const showStatusBanner = recordingStatus && recordingStatus !== 'completed' && recordingStatus !== 'transcribed' && recordingStatus !== 'failed';

  return (
    <View className="flex-1 bg-canvas">
      <CanvasRoot
        spaceName={activeSpace?.name ?? 'My MindSpace'}
        creditBalance={available}
        notes={visibleNotes}
        childCounts={childCounts}
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
        onRename={(id, name) => updateSpaceMutation.mutate({ id, name })}
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
        </View>
      )}
    </View>
  );
}
