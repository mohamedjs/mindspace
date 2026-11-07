'use client';

import React, { Suspense, use } from 'react';
import { CanvasToolbar, type ToolMode } from '@/features/canvas/components/CanvasToolbar';
import { CanvasBackground } from '@/features/canvas/components/CanvasBackground';
import { StickyNoteItem } from '@/features/sticky-notes/components/StickyNoteItem';
import type { Note as StickyNoteData } from '@/core/domain';

interface PreviewProps {
  searchParams: Promise<{
    state?: string;
    lang?: string;
  }>;
}

const SAMPLE_NOTES: StickyNoteData[] = [
  { id: '1', title: 'Onboarding Flow', content: 'Design simple voice flow.', type: 'idea', color: '#FFF8BC', x: 80, y: 160 },
  { id: '2', title: 'Action Items', content: 'Review shortcuts table.', type: 'task', color: '#BBDEFB', x: 320, y: 160 },
  { id: '3', title: 'Decisions', content: 'Support EN and AR RTL layouts.', type: 'decision', color: '#C8E6C9', x: 560, y: 160 },
];

function PreviewContent({ searchParams }: { searchParams: Promise<{ state?: string; lang?: string }> }) {
  const params = use(searchParams);
  const state = params.state || 'idle';
  const lang = (params.lang === 'ar' ? 'ar' : 'en') as 'en' | 'ar';

  const [toolMode, setToolMode] = React.useState<ToolMode>(
    state === 'connect' ? 'arrow' : state === 'write' ? 'write' : state === 'hand' ? 'pan' : 'pointer'
  );
  const [selectedIds, setSelectedIds] = React.useState<string[]>(
    state === 'selected' ? ['1', '2'] : []
  );
  const [showChildren, setShowChildren] = React.useState(true);

  const isRTL = lang === 'ar';

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      lang={lang}
      className="relative w-full h-screen overflow-hidden bg-[#FAF8F5] select-none"
    >
      <CanvasBackground
        translateX={0}
        translateY={0}
        scale={1}
      />

      {/* Render sample notes */}
      <div className="absolute inset-0 pointer-events-none">
        {SAMPLE_NOTES.map((note) => (
          <div
            key={note.id}
            style={{
              position: 'absolute',
              left: `${note.x}px`,
              top: `${note.y}px`,
              pointerEvents: 'auto',
            }}
          >
            <StickyNoteItem
              note={note}
              outlineState={selectedIds.includes(note.id) ? 'accent' : null}
              onPressNote={(id) => {
                setSelectedIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                );
              }}
            />
          </div>
        ))}
      </div>

      {/* Rebuilt Toolbar (Zones 1, 2, 3, 4 + Hint + Mobile Dock) */}
      <CanvasToolbar
        toolMode={toolMode}
        onSetToolMode={setToolMode}
        spaceName={isRTL ? 'مساحة العمل' : 'Product Space'}
        activeView="canvas"
        scale={1}
        creditBalance={140}
        showChildNotes={showChildren}
        onToggleChildNotes={() => setShowChildren((v) => !v)}
        canUndo={true}
        canRedo={false}
        selectedNoteCount={selectedIds.length}
        selectedGroupCount={0}
        hasParentedNote={false}
        arrowSourceId={state === 'connect' ? '1' : null}
        onClearSelection={() => setSelectedIds([])}
        lang={lang}
      />
    </div>
  );
}

export default function ToolbarPreviewPage({ searchParams }: PreviewProps) {
  return (
    <Suspense fallback={null}>
      <PreviewContent searchParams={searchParams} />
    </Suspense>
  );
}
