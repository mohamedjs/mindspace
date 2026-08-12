'use client';

import React, { Suspense, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { NoteEditor } from '@/features/sticky-notes/components/NoteEditor';

function NotePageContent({ paramsPromise }: { paramsPromise: Promise<{ id: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = use(paramsPromise);

  const spaceId = searchParams.get('spaceId') ?? undefined;
  const recordingId = searchParams.get('recordingId') ?? undefined;

  return (
    <NoteEditor
      noteId={params.id}
      spaceId={spaceId}
      recordingId={recordingId}
      onBack={() => router.back()}
    />
  );
}

export default function NotePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <NotePageContent paramsPromise={params} />
    </Suspense>
  );
}
