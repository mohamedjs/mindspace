'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchSpaces, createSpace, updateSpace, deleteSpace } from '@/features/canvas/api/spaces.api';
import { queryKeys } from '@/lib/query-client/keys';
import {
  useNotes,
  useCreateNote,
  useUpdateNoteColor,
  useMoveNote,
  useDeleteNote,
  useTidyNotes,
  useMoveCluster,
} from '@/features/sticky-notes/hooks/useNotes';
import {
  useGroups,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
} from '@/features/canvas/hooks/useGroups';
import { useBalance } from '@/features/credits/hooks/useCredits';
import { useRecordingStatus } from '@/features/voice/hooks/useRecordingStatus';
import { finishRecording } from '@/features/voice/api/recordings.api';
import { describeFailure, describeStoredFailure } from '@/features/voice/services/pipelineErrors';
import { CanvasRoot } from '@/features/canvas/components/CanvasRoot';
import { NotesListView } from '@/features/notes-list/components/NotesListView';
import { SpacesSheet } from '@/features/canvas/components/SpacesSheet';
import { RecordingsSheet } from '@/features/voice/components/RecordingsSheet';
import { OutOfCreditsSheet } from '@/features/credits/components/OutOfCreditsSheet';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme, type NotesView } from '@/shared/theme';
import { useMindMap } from '@/features/canvas/hooks/useMindMap';

const STATUS_LABEL: Record<string, string> = {
  recorded: 'Saved on device…',
  uploading: 'Uploading…',
  transcribing: 'Listening to what you said…',
  transcribed: 'Turning that into notes…',
  extracting: 'Turning that into notes…',
  completed: 'Notes created!',
  failed: 'Something went wrong — audio is safe on your device.',
};

const LAST_SPACE_KEY = 'mindspace:lastSpaceId';

export function HomeScreen({
  spaceId,
  initialView,
}: {
  spaceId: string;
  initialView?: NotesView;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recordingId = searchParams.get('recordingId');
  const qc = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const { colors, showChildNotes, notesView, setNotesView } = useTheme();

  useEffect(() => {
    if (initialView) {
      setNotesView(initialView);
    }
  }, [initialView, setNotesView]);

  const [spacesSheetOpen, setSpacesSheetOpen] = useState(false);
  const [recordingsSheetOpen, setRecordingsSheetOpen] = useState(false);
  const [outOfCreditsOpen, setOutOfCreditsOpen] = useState(false);

  const { data: spaces, isLoading: spacesLoading } = useQuery({
    queryKey: queryKeys.spaces.all,
    queryFn: fetchSpaces,
    enabled: Boolean(user),
  });

  const selectSpace = useCallback((id: string) => {
    try {
      localStorage.setItem(LAST_SPACE_KEY, id);
    } catch {}
    router.push(`/space/${id}`);
  }, [router]);

  useEffect(() => {
    if (spaceId) {
      try {
        localStorage.setItem(LAST_SPACE_KEY, spaceId);
      } catch {}
    }
  }, [spaceId]);

  const { data: notes } = useNotes(spaceId);
  const { data: mindMapData } = useMindMap(notesView === 'mindmap' ? spaceId : null);
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

  const childCounts = useMemo(() => {
    const counts = new Map<string, number>();
    notes?.forEach((n) => {
      if (n.parentId) counts.set(n.parentId, (counts.get(n.parentId) ?? 0) + 1);
    });
    return counts;
  }, [notes]);

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
        try {
          localStorage.removeItem(LAST_SPACE_KEY);
        } catch {}
        router.push('/');
      }
    },
  });

  const updateSpaceMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateSpace(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.spaces.all });
    },
  });

  const retryPipeline = useMutation({
    mutationFn: () => finishRecording(recordingId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notes.bySpace(spaceId!) });
      qc.invalidateQueries({ queryKey: queryKeys.credits.balance });
    },
    onError: (err) => {
      const copy = describeFailure(err);
      toast.error(copy.title, { description: copy.message });
    },
  });

  useEffect(() => {
    if (recordingStatus !== 'completed' && recordingStatus !== 'failed') return;

    if (recordingStatus === 'completed') {
      toast.success('Success', { description: 'MindSpace finished turning your thoughts into sticky notes!' });
    } else {
      const copy = describeStoredFailure(recordingError);
      if (copy.action === 'buy_credits') {
        setOutOfCreditsOpen(true);
      } else {
        toast.error(copy.title, { description: copy.message });
      }
    }

    qc.invalidateQueries({ queryKey: queryKeys.notes.bySpace(spaceId ?? '') });
    router.replace('/');
  }, [recordingStatus, recordingError, router, qc, spaceId]);

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

  const handleDeleteNote = useCallback(
    (noteId: string) => removeNote.mutate(noteId),
    [removeNote]
  );

  const handleAddNote = useCallback(
    (x: number, y: number, parentId?: string | null) =>
      addNote.mutate(
        { content: 'New note', x, y, parentId: parentId ?? null },
        {
          onSuccess: (note) =>
            router.push(`/note/${note.id}?spaceId=${spaceId ?? ''}`),
          onError: (err) =>
            toast.error('Could not add a note', { description: err.message }),
        }
      ),
    [addNote, router, spaceId]
  );

  const handleAddGroup = useCallback(
    (
      x: number,
      y: number,
      width?: number,
      height?: number,
      title?: string | null,
      color?: string | null
    ) => addGroup.mutateAsync({ x, y, width, height, title, color }),
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
      <div className="flex flex-1 items-center justify-center min-h-screen bg-canvas">
        <div
          className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: `${colors.accent} transparent ${colors.accent} ${colors.accent}` }}
        />
      </div>
    );
  }

  const activeSpace = spaces?.find((s) => s.id === spaceId);
  const available = balance ? balance.creditsBalance - balance.creditsReserved : 0;
  const showStatusBanner =
    recordingStatus && recordingStatus !== 'completed' && recordingStatus !== 'failed';

  const openNote = (noteId: string) =>
    router.push(`/note/${noteId}?spaceId=${spaceId ?? ''}`);
  const startRecord = () => {
    if (spaceId) router.push(`/record?spaceId=${spaceId}`);
  };

  return (
    <div className="flex flex-1 flex-col h-full w-full overflow-hidden bg-canvas relative">
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
      ) : notesView === 'mindmap' ? (
        <CanvasRoot
          spaceId={spaceId}
          spaceName={activeSpace?.name ?? 'My MindSpace'}
          creditBalance={available}
          notes={mindMapData?.nodes ?? []}
          groups={[]}
          childCounts={childCounts}
          readOnly={true}
          activeView="mindmap"
          onSelectView={(v) => {
            setNotesView(v);
            if (v === 'canvas') router.push(`/space/${spaceId}`);
          }}
          onOpenCredits={() => router.push('/credits')}
          onOpenSpaces={() => setSpacesSheetOpen(true)}
          onOpenSettings={() => router.push('/settings')}
          onOpenRecordings={() => setRecordingsSheetOpen(true)}
          onPressNote={openNote}
        />
      ) : (
        <CanvasRoot
          spaceId={spaceId}
          spaceName={activeSpace?.name ?? 'My MindSpace'}
          creditBalance={available}
          notes={visibleNotes}
          groups={groups}
          childCounts={childCounts}
          readOnly={false}
          activeView="canvas"
          onSelectView={(v) => {
            setNotesView(v);
            if (v === 'mindmap') router.push(`/space/${spaceId}/mind-map`);
          }}
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
          onTidy={
            notes?.length
              ? (subsetIds?: string[]) => {
                  const target = subsetIds?.length
                    ? notes.filter((n) => subsetIds.includes(n.id))
                    : notes;
                  if (target.length) tidyNotes.mutate(target);
                }
              : undefined
          }
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

      {authLoading && (
        <div className="absolute inset-x-0 top-1/2 flex justify-center pointer-events-none">
          <span className="text-sm text-muted">Preparing your board…</span>
        </div>
      )}

      {showStatusBanner && (
        <div
          className="absolute inset-x-0 top-16 mx-auto max-w-md flex flex-row items-center rounded-full px-4 py-2.5 z-50 shadow-lg"
          style={{ backgroundColor: colors.overlay, borderWidth: 1, borderColor: colors.line }}
        >
          <div
            className="w-4 h-4 mr-2 border-2 border-t-transparent rounded-full animate-spin shrink-0"
            style={{ borderColor: `${colors.accent} transparent ${colors.accent} ${colors.accent}` }}
          />
          <span className="flex-1 text-sm text-ink truncate">
            {STATUS_LABEL[recordingStatus] ?? recordingStatus}
          </span>
        </div>
      )}
    </div>
  );
}
