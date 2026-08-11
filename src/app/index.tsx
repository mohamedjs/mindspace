import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Text } from '../shared/ui/Text';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CanvasRoot } from '../features/canvas/components/CanvasRoot';
import { NotesListView } from '../features/notes-list/components/NotesListView';
import { syncNoteReminders } from '../features/notes-list/services/reminders';
import { SpacesSheet } from '../features/canvas/components/SpacesSheet';
import { RecordingsSheet } from '../features/voice/components/RecordingsSheet';
import { createSpace, deleteSpace, fetchSpaces, updateSpace } from '../features/canvas/api/spaces.api';
import { queryKeys } from '../lib/query-client/keys';
import {
  useNotes,
  useCreateNote,
  useUpdateNoteColor,
  useMoveNote,
  useDeleteNote,
  useTidyNotes,
  useMoveCluster,
} from '../features/sticky-notes/hooks/useNotes';
import {
  useGroups,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
} from '../features/canvas/hooks/useGroups';
import { useBalance } from '../features/credits/hooks/useCredits';
import { useRecordingStatus } from '../features/voice/hooks/useRecordingStatus';
import { runThinkingPipeline } from '../features/voice/services/pipeline';
import { describeFailure, describeStoredFailure } from '../features/voice/services/pipelineErrors';
import { OutOfCreditsSheet } from '../features/credits/components/OutOfCreditsSheet';
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
  const { colors, showChildNotes, notesView } = useTheme();
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
  const moveCluster = useMoveCluster(spaceId);
  const removeNote = useDeleteNote(spaceId);
  const addNote = useCreateNote(spaceId);
  const tidyNotes = useTidyNotes(spaceId);
  const { data: groups } = useGroups(spaceId);
  const addGroup = useCreateGroup(spaceId);
  const editGroup = useUpdateGroup(spaceId);
  const removeGroup = useDeleteGroup(spaceId);
  const { status: recordingStatus, error: recordingError } = useRecordingStatus(recordingId ?? null);
  const [outOfCreditsOpen, setOutOfCreditsOpen] = useState(false);

  // Tallied from the full list regardless of the visibility setting below —
  // the badge should still say "3 sub-notes" even while they're hidden.
  const childCounts = useMemo(() => {
    const counts = new Map<string, number>();
    notes?.forEach((n) => {
      if (n.parentId) counts.set(n.parentId, (counts.get(n.parentId) ?? 0) + 1);
    });
    return counts;
  }, [notes]);

  // Keep the OS reminder queue in step with whatever the notes now say. Safe
  // to run on every refetch: syncNoteReminders keys each reminder off its note
  // id and cancels before rescheduling, so nothing stacks up.
  useEffect(() => {
    if (!notes?.length) return;
    syncNoteReminders(notes).catch(() => {});
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
    onError: (err) => {
      const copy = describeFailure(err);
      Toast.show({ type: 'error', text1: copy.title, text2: copy.message });
    },
  });

  useEffect(() => {
    // We only take action when the pipeline reaches a terminal state
    if (recordingStatus !== 'completed' && recordingStatus !== 'failed') return;

    if (recordingStatus === 'completed') {
      Toast.show({ type: 'success', text1: 'Success', text2: 'MindSpace finished turning your thoughts into sticky notes!' });
    } else {
      // recordings.error carries the real code, so the user gets "out of
      // credits" with a top-up path rather than one generic apology.
      const copy = describeStoredFailure(recordingError);
      if (copy.action === 'buy_credits') {
        setOutOfCreditsOpen(true);
      } else {
        Toast.show({
          type: 'error',
          text1: copy.title,
          text2: copy.message,
          props: copy.action === 'retry' ? { onRetry: () => retryPipeline.mutate() } : undefined,
        });
      }
    }

    qc.invalidateQueries({ queryKey: queryKeys.notes.bySpace(spaceId ?? '') });
    router.setParams({ recordingId: undefined });
  }, [recordingStatus, recordingError, router, qc, spaceId, retryPipeline]);

  const handleUpdateColor = useCallback(
    (noteId: string, color: string) => recolor.mutate({ noteId, color }),
    [recolor]
  );

  const handleMoveNote = useCallback(
    (noteId: string, x: number, y: number) => moveNote.mutate({ noteId, x, y }),
    [moveNote]
  );

  const handleMoveCluster = useCallback(
    (moves: { id: string; x: number; y: number }[]) => moveCluster.mutate(moves),
    [moveCluster]
  );

  // Soft delete, so the recordings sheet still shows what the recording produced
  // and the row survives for undo.
  const handleDeleteNote = useCallback(
    (noteId: string) => removeNote.mutate(noteId),
    [removeNote]
  );

  // Straight into the editor — an empty card sitting on the board with no
  // keyboard up is a dead end, and the point of tapping "add" is to write.
  const handleAddNote = useCallback(
    (x: number, y: number) =>
      addNote.mutate(
        { content: 'New note', x, y },
        {
          onSuccess: (note) =>
            router.push({
              pathname: '/note/[id]',
              params: { id: note.id, spaceId: spaceId ?? '' },
            }),
          onError: (err) =>
            Toast.show({ type: 'error', text1: 'Could not add a note', text2: err.message }),
        }
      ),
    [addNote, router, spaceId]
  );

  const handleAddGroup = useCallback(
    (x: number, y: number) => addGroup.mutate({ x, y }),
    [addGroup]
  );

  const handleRenameGroup = useCallback(
    (groupId: string, title: string) => editGroup.mutate({ groupId, title }),
    [editGroup]
  );

  const handleMoveGroup = useCallback(
    (groupId: string, x: number, y: number) => editGroup.mutate({ groupId, x, y }),
    [editGroup]
  );

  const handleResizeGroup = useCallback(
    (groupId: string, width: number, height: number) => editGroup.mutate({ groupId, width, height }),
    [editGroup]
  );

  const handleDeleteGroup = useCallback(
    (groupId: string) => removeGroup.mutate(groupId),
    [removeGroup]
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
  // 'transcribed' is mid-pipeline (extraction still to run) so it stays on the
  // banner; the terminal states are what clear it.
  const showStatusBanner =
    recordingStatus && recordingStatus !== 'completed' && recordingStatus !== 'failed';

  const openNote = (noteId: string) =>
    router.push({ pathname: '/note/[id]', params: { id: noteId, spaceId: spaceId ?? '' } });
  const startRecord = () => {
    if (spaceId) router.push({ pathname: '/record', params: { spaceId } });
  };

  return (
    <View className="flex-1 bg-canvas">
      {notesView === 'list' ? (
        <NotesListView
          spaceName={activeSpace?.name ?? 'My MindSpace'}
          creditBalance={available}
          notes={notes}
          onPressNote={openNote}
          onStartRecord={startRecord}
          onOpenCredits={() => router.push('/credits')}
          onOpenSpaces={() => setSpacesSheetOpen(true)}
          onOpenSettings={() => router.push('/settings')}
          onOpenRecordings={() => setRecordingsSheetOpen(true)}
        />
      ) : (
        <CanvasRoot
          spaceName={activeSpace?.name ?? 'My MindSpace'}
          creditBalance={available}
          notes={visibleNotes}
          groups={groups}
          childCounts={childCounts}
          onAddNote={handleAddNote}
          onAddGroup={handleAddGroup}
          onRenameGroup={handleRenameGroup}
          onMoveGroup={handleMoveGroup}
          onResizeGroup={handleResizeGroup}
          onDeleteGroup={handleDeleteGroup}
          onUpdateNoteColor={handleUpdateColor}
          onDeleteNote={handleDeleteNote}
          onMoveNote={handleMoveNote}
          onMoveCluster={handleMoveCluster}
          onOpenCredits={() => router.push('/credits')}
          onOpenSpaces={() => setSpacesSheetOpen(true)}
          onOpenSettings={() => router.push('/settings')}
          onOpenRecordings={() => setRecordingsSheetOpen(true)}
          onTidy={notes?.length ? () => tidyNotes.mutate(notes) : undefined}
          onPressNote={openNote}
          onStartRecord={startRecord}
        />
      )}
      <OutOfCreditsSheet
        visible={outOfCreditsOpen}
        requiredCredits={Math.max(0, 14 - available)}
        availableCredits={available}
        actionLabel="turn that recording into notes"
        onClose={() => setOutOfCreditsOpen(false)}
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
          {/* The banner only shows mid-pipeline states, so it is always
              working on something — a spinner is unconditional here. */}
          <ActivityIndicator size="small" color={colors.accent} style={{ marginRight: 8 }} />
          <Text className="flex-1 text-sm text-ink">
            {STATUS_LABEL[recordingStatus] ?? recordingStatus}
          </Text>
        </View>
      )}
    </View>
  );
}
