'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTheme } from '@/shared/theme';
import { clay, shade } from '@/shared/theme/clay';
import { readableTextOn, luminance } from '@/shared/theme/color';
import { noteColors, type NoteType } from '@/shared/constants/tokens';
import { placeChild } from '@/features/ai/services/layout';
import {
  useNote,
  useNotes,
  useCreateNote,
  useUpdateNoteContent,
  useUpdateNoteColor,
  useUpdateNoteType,
  useDeleteNote,
} from '../hooks/useNotes';
import { ColorPicker } from './ColorPicker';
import { PeelFlap } from './PeelFlap';
import { useRecordingStatus } from '@/features/voice/hooks/useRecordingStatus';
import {
  ArrowLeft,
  ChevronRight,
  Mic,
  Palette,
  Plus,
  Trash2,
  List,
  Save,
  Tag,
  Lightbulb,
  CheckCircle2,
  HelpCircle,
  Target,
  Paperclip,
  MessageSquare,
  ClipboardList,
} from 'lucide-react';

const CURL = 48;

const NOTE_TYPES: NoteType[] = [
  'idea',
  'task',
  'question',
  'decision',
  'reference',
  'thought',
  'summary',
];

const TYPE_ICON: Record<NoteType, React.ElementType> = {
  idea: Lightbulb,
  task: CheckCircle2,
  question: HelpCircle,
  decision: Target,
  reference: Paperclip,
  thought: MessageSquare,
  summary: ClipboardList,
};

interface NoteEditorProps {
  noteId: string;
  spaceId?: string;
  recordingId?: string;
  onBack: () => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  noteId,
  spaceId,
  recordingId,
  onBack,
}) => {
  const router = useRouter();
  const { colors, scheme } = useTheme();

  const { data: note, isLoading } = useNote(noteId);
  const effectiveSpaceId = note?.spaceId ?? spaceId ?? null;

  const updateContent = useUpdateNoteContent();
  const updateColor = useUpdateNoteColor(effectiveSpaceId);
  const updateType = useUpdateNoteType();
  const deleteNote = useDeleteNote(effectiveSpaceId);
  const createSubNote = useCreateNote(effectiveSpaceId);
  const { data: spaceNotes } = useNotes(effectiveSpaceId);
  const children = spaceNotes?.filter((n) => n.parentId === noteId) ?? [];

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [typePickerVisible, setTypePickerVisible] = useState(false);
  const [subNoteText, setSubNoteText] = useState('');

  const contentRef = useRef<HTMLTextAreaElement>(null);

  const qc = useQueryClient();
  const { status: recordingStatus } = useRecordingStatus(recordingId ?? null);
  const isThinking =
    Boolean(recordingStatus) &&
    recordingStatus !== 'completed' &&
    recordingStatus !== 'failed';

  useEffect(() => {
    if (recordingStatus !== 'completed' && recordingStatus !== 'failed') return;
    qc.invalidateQueries({ queryKey: ['notes'] });
    if (recordingStatus === 'failed') {
      toast.error('Could not turn that into sub-notes', {
        description: 'Your audio is safe. Try recording again.',
      });
    }
  }, [recordingStatus, qc]);

  useEffect(() => {
    if (note) {
      setTitle(note.title ?? '');
      setContent(note.content ?? '');
    }
  }, [note]);

  const paperBg = note?.color || noteColors[note?.type ?? 'idea']?.bg || '#FFF8BC';
  const isDarkPaper = luminance(paperBg) < 0.45;
  const textColor = readableTextOn(paperBg);
  const mutedTextColor = isDarkPaper ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.35)';

  const handleSave = useCallback(() => {
    if (noteId) {
      updateContent.mutate({ noteId, title: title || null, content });
      setDirty(false);
    }
  }, [noteId, title, content, updateContent]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    setDirty(true);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setDirty(true);
  };

  const handleBack = useCallback(() => {
    if (dirty && noteId) {
      updateContent.mutate({ noteId, title: title || null, content });
    }
    onBack();
  }, [dirty, noteId, title, content, updateContent, onBack]);

  const handleDelete = useCallback(() => {
    if (confirm('This note will be removed from your board.')) {
      if (noteId) {
        deleteNote.mutate(noteId);
        onBack();
      }
    }
  }, [noteId, deleteNote, onBack]);

  const handleColorSelect = useCallback(
    (color: string) => {
      if (noteId) updateColor.mutate({ noteId, color });
      setColorPickerVisible(false);
    },
    [noteId, updateColor]
  );

  const handleTypeSelect = useCallback(
    (type: NoteType) => {
      if (noteId) updateType.mutate({ noteId, type });
      setTypePickerVisible(false);
    },
    [noteId, updateType]
  );

  const handleAddSubNote = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = subNoteText.trim();
      if (!text || !note) return;
      const occupied = (spaceNotes ?? [])
        .filter((n) => n.id !== noteId)
        .map((n) => ({ x: n.x, y: n.y, width: n.width ?? 190, height: n.height ?? 145 }));
      const rect = placeChild(
        { x: note.x, y: note.y, width: note.width ?? 190, height: note.height ?? 145 },
        children.length,
        occupied
      );
      createSubNote.mutate(
        { content: text, x: rect.x, y: rect.y, parentId: noteId },
        { onSuccess: () => setSubNoteText('') }
      );
    },
    [subNoteText, note, noteId, createSubNote, children.length, spaceNotes]
  );

  const openChildNote = useCallback(
    (childId: string) => {
      router.push(`/note/${childId}?spaceId=${effectiveSpaceId ?? ''}`);
    },
    [router, effectiveSpaceId]
  );

  const startVoiceSubNotes = useCallback(() => {
    if (dirty) updateContent.mutate({ noteId, title: title || null, content });
    if (!effectiveSpaceId) return;
    router.push(`/record?spaceId=${effectiveSpaceId}&parentNoteId=${noteId}`);
  }, [dirty, updateContent, noteId, title, content, effectiveSpaceId, router]);

  const startVoiceIntoNote = useCallback(() => {
    if (dirty) updateContent.mutate({ noteId, title: title || null, content });
    if (!effectiveSpaceId) return;
    router.push(`/record?spaceId=${effectiveSpaceId}&fillNoteId=${noteId}`);
  }, [dirty, updateContent, noteId, title, content, effectiveSpaceId, router]);

  const insertBullet = useCallback(() => {
    const lines = content.split('\n');
    const lastLine = lines[lines.length - 1];
    if (!lastLine || lastLine.trim() === '') {
      lines[lines.length - 1] = '• ';
    } else {
      lines.push('• ');
    }
    const next = lines.join('\n');
    setContent(next);
    setDirty(true);
    setTimeout(() => contentRef.current?.focus(), 50);
  }, [content]);

  if (isLoading) {
    return (
      <div className="flex flex-col flex-1 min-h-screen bg-canvas">
        <div className="flex flex-1 items-center justify-center">
          <div
            className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: `${colors.accent} transparent ${colors.accent} ${colors.accent}` }}
          />
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex flex-col flex-1 min-h-screen items-center justify-center bg-canvas">
        <p className="text-muted">Note not found</p>
        <button type="button" onClick={onBack} className="mt-4 font-bold text-accent cursor-pointer border-0 bg-transparent">
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-screen relative bg-canvas">
      <div className="flex flex-col flex-1 w-full mx-auto relative shadow-2xl">
        {/* Top Header */}
        <header
          className="px-4 py-3 flex flex-col gap-2 shrink-0 border-b"
          style={{
            backgroundColor: paperBg,
            borderColor: shade(paperBg, -0.14),
          }}
        >
          <div className="flex flex-row items-center justify-between">
            <button
              type="button"
              onClick={handleBack}
              className="h-10 w-10 flex items-center justify-center rounded-xl cursor-pointer border-0 transition-opacity"
              style={clay({ color: shade(paperBg, -0.08), radius: 14, depth: 0.5 })}
            >
              <ArrowLeft size={20} color={textColor} strokeWidth={2.5} />
            </button>

            <div className="flex flex-row items-center gap-2">
              <button
                type="button"
                onClick={insertBullet}
                className="h-10 w-10 flex items-center justify-center rounded-xl cursor-pointer border-0 transition-opacity"
                style={clay({ color: shade(paperBg, -0.08), radius: 14, depth: 0.5 })}
                title="Insert Bullet"
              >
                <List size={18} color={textColor} strokeWidth={2.5} />
              </button>

              <button
                type="button"
                onClick={() => setTypePickerVisible(!typePickerVisible)}
                className="h-10 w-10 flex items-center justify-center rounded-xl cursor-pointer border-0 transition-opacity"
                style={clay({
                  color: typePickerVisible ? shade(paperBg, -0.18) : shade(paperBg, -0.08),
                  radius: 14,
                  depth: 0.5,
                  pressed: typePickerVisible,
                })}
                title="Change Type"
              >
                <Tag size={18} color={textColor} strokeWidth={2.5} />
              </button>

              <button
                type="button"
                onClick={() => setColorPickerVisible(true)}
                className="h-10 w-10 flex items-center justify-center rounded-xl cursor-pointer border-0 transition-opacity"
                style={clay({ color: shade(paperBg, -0.08), radius: 14, depth: 0.5 })}
                title="Change Color"
              >
                <Palette size={18} color={textColor} strokeWidth={2.5} />
              </button>

              <button
                type="button"
                onClick={startVoiceIntoNote}
                disabled={isThinking}
                className="h-10 w-10 flex items-center justify-center rounded-xl cursor-pointer border-0 transition-opacity disabled:opacity-50"
                style={clay({ color: colors.accent, radius: 14, depth: isThinking ? 0.2 : 0.6 })}
                title="Speak into this note"
              >
                <Mic size={18} color={colors.onAccent} strokeWidth={2.5} />
              </button>

              <button
                type="button"
                onClick={handleDelete}
                className="h-10 w-10 flex items-center justify-center rounded-xl cursor-pointer border-0 transition-opacity"
                style={clay({ color: '#C6453C', radius: 14, depth: 0.6 })}
                title="Delete note"
              >
                <Trash2 size={18} color="#FFF" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {dirty && (
            <div className="flex flex-row justify-end mt-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={updateContent.isPending}
                className="flex flex-row items-center px-4 py-2 rounded-xl text-sm font-bold text-white cursor-pointer border-0 transition-opacity"
                style={clay({ color: colors.accent, radius: 16, depth: 0.8 })}
              >
                {updateContent.isPending ? (
                  <div className="w-4 h-4 mr-1.5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'white transparent white white' }} />
                ) : (
                  <Save size={16} color="#FFF" strokeWidth={2.5} className="mr-1.5" />
                )}
                Save
              </button>
            </div>
          )}
        </header>

        {/* Collapsible type picker strip */}
        {typePickerVisible && (
          <div
            className="px-4 py-2 border-b flex flex-row gap-2 overflow-x-auto"
            style={{
              backgroundColor: shade(paperBg, scheme === 'dark' ? -0.12 : 0.05),
              borderColor: shade(paperBg, -0.14),
            }}
          >
            {NOTE_TYPES.map((type) => {
              const active = note.type === type;
              const typeBg = noteColors[type].bg;
              const IconComp = TYPE_ICON[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTypeSelect(type)}
                  className="flex flex-row items-center px-3 py-2 rounded-xl cursor-pointer border-0 shrink-0 transition-all"
                  style={clay({
                    color: active ? typeBg : shade(paperBg, -0.06),
                    radius: 12,
                    depth: active ? 0.8 : 0.3,
                  })}
                >
                  <IconComp
                    size={14}
                    color={active ? readableTextOn(typeBg) : textColor}
                    className="mr-1.5"
                    strokeWidth={2.5}
                  />
                  <span
                    className="text-xs font-bold uppercase tracking-wide"
                    style={{ color: active ? readableTextOn(typeBg) : textColor }}
                  >
                    {type}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Editor Body */}
        <div
          className="flex-1 px-5 pt-6 pb-32 overflow-y-auto relative"
          style={{ backgroundColor: paperBg, borderBottomRightRadius: CURL }}
        >
          {/* Type Badge */}
          <div className="mb-4 flex flex-row">
            <span
              className="flex flex-row items-center rounded-lg px-2.5 py-1"
              style={{ backgroundColor: shade(paperBg, -0.1) }}
            >
              {(() => {
                const BadgeIcon = TYPE_ICON[note.type];
                return (
                  <BadgeIcon size={12} color={textColor} className="mr-1.5" strokeWidth={2.5} />
                );
              })()}
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: textColor }}
              >
                {note.type}
              </span>
            </span>
          </div>

          {/* Title Input */}
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            placeholder="Title"
            className="w-full text-3xl font-bold bg-transparent border-0 outline-none mb-4 p-0 placeholder:opacity-50"
            style={{ color: textColor, letterSpacing: '-0.5px' }}
          />

          <div
            className="h-0.5 rounded mb-5"
            style={{ backgroundColor: shade(paperBg, -0.1) }}
          />

          {/* Content Area */}
          <textarea
            ref={contentRef}
            value={content}
            onChange={handleContentChange}
            placeholder="Start writing your note…"
            className="w-full min-h-[220px] text-lg leading-7 bg-transparent border-0 outline-none p-0 resize-none placeholder:opacity-50 font-normal"
            style={{ color: textColor }}
          />

          {/* Sub-notes Section */}
          {effectiveSpaceId && (
            <div className="mt-8">
              <div
                className="mb-3 text-xs font-bold uppercase tracking-wider"
                style={{ color: mutedTextColor }}
              >
                Sub-notes{children.length ? ` (${children.length})` : ''}
              </div>

              <div className="space-y-2">
                {children.map((child) => {
                  const childBg = child.color || noteColors[child.type]?.bg || '#FFF8BC';
                  return (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => openChildNote(child.id)}
                      className="w-full flex flex-row items-center px-3 py-3 rounded-xl cursor-pointer border-0 text-left transition-all"
                      style={{
                        backgroundColor: shade(paperBg, -0.08),
                        borderLeftWidth: 4,
                        borderLeftColor: childBg,
                        borderLeftStyle: 'solid',
                      }}
                    >
                      <div className="flex-1 pr-2 min-w-0">
                        {Boolean(child.title) && (
                          <div className="text-sm font-bold truncate" style={{ color: textColor }}>
                            {child.title}
                          </div>
                        )}
                        <div className="text-xs line-clamp-2" style={{ color: mutedTextColor }}>
                          {child.content}
                        </div>
                      </div>
                      <ChevronRight size={16} color={mutedTextColor} strokeWidth={2.5} className="shrink-0" />
                    </button>
                  );
                })}

                {isThinking && (
                  <div
                    className="flex flex-row items-center px-3 py-3 rounded-xl"
                    style={{ backgroundColor: shade(paperBg, -0.08) }}
                  >
                    <div
                      className="w-4 h-4 mr-2.5 border-2 border-t-transparent rounded-full animate-spin shrink-0"
                      style={{ borderColor: `${colors.accent} transparent ${colors.accent} ${colors.accent}` }}
                    />
                    <span className="text-xs" style={{ color: mutedTextColor }}>
                      {recordingStatus === 'transcribing'
                        ? 'Listening to what you said…'
                        : 'Writing up what you said…'}
                    </span>
                  </div>
                )}

                <form onSubmit={handleAddSubNote} className="mt-2 flex flex-row items-center gap-2">
                  <input
                    type="text"
                    value={subNoteText}
                    onChange={(e) => setSubNoteText(e.target.value)}
                    placeholder="Add a sub-note…"
                    className="flex-1 px-3.5 py-3 text-sm rounded-xl border-0 outline-none"
                    style={{ backgroundColor: shade(paperBg, -0.08), color: textColor }}
                  />
                  <button
                    type="submit"
                    disabled={!subNoteText.trim() || createSubNote.isPending}
                    className="h-11 w-11 flex items-center justify-center rounded-xl cursor-pointer border-0 disabled:opacity-40"
                    style={clay({
                      color: colors.accent,
                      radius: 14,
                      depth: subNoteText.trim() ? 0.7 : 0.3,
                    })}
                  >
                    {createSubNote.isPending ? (
                      <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'white transparent white white' }} />
                    ) : (
                      <Plus size={18} color="#FFF" strokeWidth={2.5} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={startVoiceSubNotes}
                    disabled={isThinking}
                    className="h-11 w-11 flex items-center justify-center rounded-xl cursor-pointer border-0 disabled:opacity-40"
                    style={clay({ color: shade(paperBg, -0.16), radius: 14, depth: isThinking ? 0.2 : 0.7 })}
                    title="Record sub-notes with your voice"
                  >
                    <Mic size={18} color={textColor} strokeWidth={2.5} />
                  </button>
                </form>
              </div>
            </div>
          )}

          <div className="absolute bottom-0 right-0 pointer-events-none">
            <PeelFlap size={CURL} color={shade(paperBg, -0.24)} />
          </div>
        </div>

        <ColorPicker
          visible={colorPickerVisible}
          currentColor={paperBg}
          onSelectColor={handleColorSelect}
          onClose={() => setColorPickerVisible(false)}
        />
      </div>
    </div>
  );
};
