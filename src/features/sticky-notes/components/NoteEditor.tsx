import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../../../shared/ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../shared/theme';
import { clay, shade } from '../../../shared/theme/clay';
import { readableTextOn, luminance } from '../../../shared/theme/color';
import { noteColors, type NoteType } from '../../../shared/constants/tokens';
import {
  useNote,
  useUpdateNoteContent,
  useUpdateNoteColor,
  useUpdateNoteType,
  useDeleteNote,
} from '../hooks/useNotes';
import { ColorPicker } from './ColorPicker';
import { PeelFlap } from './PeelFlap';
import {
  ArrowLeft,
  Check,
  Palette,
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
} from 'lucide-react-native';

/** Size of the peeled bottom-right corner, in px. */
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
  onBack: () => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({ noteId, spaceId, onBack }) => {
  const insets = useSafeAreaInsets();
  const { colors, scheme } = useTheme();

  const { data: note, isLoading } = useNote(noteId);
  const updateContent = useUpdateNoteContent();
  const updateColor = useUpdateNoteColor(spaceId ?? null);
  const updateType = useUpdateNoteType();
  const deleteNote = useDeleteNote(spaceId ?? null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [typePickerVisible, setTypePickerVisible] = useState(false);

  const contentRef = useRef<TextInput>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed state from fetched data
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
      updateContent.mutate({ noteId: noteId, title: title || null, content });
      setDirty(false);
    }
  }, [noteId, title, content, updateContent]);

  const handleTitleChange = (text: string) => {
    setTitle(text);
    setDirty(true);
  };

  const handleContentChange = (text: string) => {
    setContent(text);
    setDirty(true);
  };



  // Save immediately before leaving
  const handleBack = useCallback(() => {
    if (dirty && noteId) {
      updateContent.mutate({ noteId: noteId, title: title || null, content });
    }
    onBack();
  }, [dirty, noteId, title, content, updateContent, onBack]);

  const handleDelete = useCallback(() => {
    Alert.alert('Delete Note', 'This note will be removed from your board.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (noteId) {
            deleteNote.mutate(noteId);
            onBack();
          }
        },
      },
    ]);
  }, [noteId, deleteNote, onBack]);

  const handleColorSelect = useCallback(
    (color: string) => {
      if (noteId) updateColor.mutate({ noteId: noteId, color });
      setColorPickerVisible(false);
    },
    [noteId, updateColor]
  );

  const handleTypeSelect = useCallback(
    (type: NoteType) => {
      if (noteId) updateType.mutate({ noteId: noteId, type });
      setTypePickerVisible(false);
    },
    [noteId, updateType]
  );

  /** Insert a bullet point prefix at the cursor position. */
  const insertBullet = useCallback(() => {
    const lines = content.split('\n');
    // If the last line is empty or the whole content is empty, add a bullet there
    const lastLine = lines[lines.length - 1];
    if (!lastLine || lastLine.trim() === '') {
      lines[lines.length - 1] = '• ';
    } else {
      lines.push('• ');
    }
    const next = lines.join('\n');
    setContent(next);
    setDirty(true);
    // Focus the content input
    setTimeout(() => contentRef.current?.focus(), 50);
  }, [content]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        <View
          style={{
            paddingTop: insets.top + 8,
            paddingBottom: 10,
            paddingHorizontal: 16,
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: shade(colors.surface, -0.14),
          }}
        >
          <View className="flex-row items-center justify-between">
            <TouchableOpacity
              onPress={onBack}
              className="h-10 w-10 items-center justify-center"
              style={clay({ color: shade(colors.surface, -0.08), radius: 14, depth: 0.5 })}
              hitSlop={8}
            >
              <ArrowLeft size={20} color={colors.ink} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </View>
    );
  }

  if (!note) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.canvas }}>
        <Text className="text-muted">Note not found</Text>
        <TouchableOpacity onPress={onBack} className="mt-4">
          <Text className="text-accent font-bold">Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* ─── Header toolbar ─── */}
        <View
          style={{
            paddingTop: insets.top + 8,
            paddingBottom: 10,
            paddingHorizontal: 16,
            backgroundColor: paperBg,
            borderBottomWidth: 1,
            borderBottomColor: shade(paperBg, -0.14),
          }}
        >
          {/* Top decorative "glue strip" bar */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: insets.top + 6,
              backgroundColor: shade(paperBg, 0.16),
            }}
          />

          <View className="flex-row items-center justify-between">
            {/* Back button */}
            <TouchableOpacity
              onPress={handleBack}
              className="h-10 w-10 items-center justify-center"
              style={clay({ color: shade(paperBg, -0.08), radius: 14, depth: 0.5 })}
              hitSlop={8}
            >
              <ArrowLeft size={20} color={textColor} strokeWidth={2.5} />
            </TouchableOpacity>

            {/* Action buttons */}
            <View className="flex-row items-center">
              {/* Bullet list */}
              <TouchableOpacity
                onPress={insertBullet}
                className="mr-2 h-10 w-10 items-center justify-center"
                style={clay({ color: shade(paperBg, -0.08), radius: 14, depth: 0.5 })}
                hitSlop={4}
              >
                <List size={18} color={textColor} strokeWidth={2.5} />
              </TouchableOpacity>

              {/* Type tag */}
              <TouchableOpacity
                onPress={() => setTypePickerVisible(!typePickerVisible)}
                className="mr-2 h-10 w-10 items-center justify-center"
                style={clay({
                  color: typePickerVisible ? shade(paperBg, -0.18) : shade(paperBg, -0.08),
                  radius: 14,
                  depth: 0.5,
                  pressed: typePickerVisible,
                })}
                hitSlop={4}
              >
                <Tag size={18} color={textColor} strokeWidth={2.5} />
              </TouchableOpacity>

              {/* Color picker */}
              <TouchableOpacity
                onPress={() => setColorPickerVisible(true)}
                className="mr-2 h-10 w-10 items-center justify-center"
                style={clay({ color: shade(paperBg, -0.08), radius: 14, depth: 0.5 })}
                hitSlop={4}
              >
                <Palette size={18} color={textColor} strokeWidth={2.5} />
              </TouchableOpacity>

              {/* Delete */}
              <TouchableOpacity
                onPress={handleDelete}
                className="h-10 w-10 items-center justify-center"
                style={clay({ color: '#C6453C', radius: 14, depth: 0.6 })}
                hitSlop={4}
              >
                <Trash2 size={18} color="#FFF" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Save button */}
          {dirty && (
            <View className="mt-4 flex-row items-center self-end">
              <TouchableOpacity
                onPress={handleSave}
                disabled={updateContent.isPending}
                className="flex-row items-center px-4 py-2"
                style={clay({ color: colors.accent, radius: 16, depth: 0.8 })}
              >
                {updateContent.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 6 }} />
                ) : (
                  <Save size={16} color="#FFF" strokeWidth={2.5} style={{ marginRight: 6 }} />
                )}
                <Text className="text-sm font-bold text-white">Save</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ─── Type tag picker row (collapsible) ─── */}
        {typePickerVisible && (
          <View
            style={{
              backgroundColor: shade(paperBg, scheme === 'dark' ? -0.12 : 0.05),
              borderBottomWidth: 1,
              borderBottomColor: shade(paperBg, -0.14),
            }}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
            >
              {NOTE_TYPES.map((type) => {
                const active = note.type === type;
                const typeBg = noteColors[type].bg;
                return (
                  <TouchableOpacity
                    key={type}
                    onPress={() => handleTypeSelect(type)}
                    className="flex-row items-center px-3 py-2"
                    style={clay({
                      color: active ? typeBg : shade(paperBg, -0.06),
                      radius: 12,
                      depth: active ? 0.8 : 0.3,
                    })}
                  >
                    {(() => {
                      const IconComp = TYPE_ICON[type];
                      return (
                        <IconComp
                          size={14}
                          color={active ? readableTextOn(typeBg) : textColor}
                          className="mr-1.5"
                          strokeWidth={2.5}
                        />
                      );
                    })()}
                    <Text
                      className="text-xs font-bold uppercase tracking-wide"
                      style={{ color: active ? readableTextOn(typeBg) : textColor }}
                    >
                      {type}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ─── Editor body ─── */}
        <ScrollView
          className="flex-1"
          style={{ backgroundColor: paperBg, borderBottomRightRadius: CURL }}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 24,
            paddingBottom: 120,
          }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          {/* Type badge */}
          <View className="mb-4 flex-row">
            <View
              className="flex-row items-center rounded-lg px-2.5 py-1"
              style={{ backgroundColor: shade(paperBg, -0.1) }}
            >
              {(() => {
                const BadgeIcon = TYPE_ICON[note.type];
                return (
                  <BadgeIcon
                    size={12}
                    color={textColor}
                    className="mr-1.5"
                    strokeWidth={2.5}
                  />
                );
              })()}
              <Text
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: textColor }}
              >
                {note.type}
              </Text>
            </View>
          </View>

          {/* Title input */}
          <TextInput
            value={title}
            onChangeText={handleTitleChange}
            placeholder="Title"
            placeholderTextColor={mutedTextColor}
            style={{
              fontSize: 28,
              fontWeight: '700',
              color: textColor,
              letterSpacing: -0.5,
              marginBottom: 16,
              padding: 0,
            }}
            multiline
            scrollEnabled={false}
            returnKeyType="next"
            onSubmitEditing={() => contentRef.current?.focus()}
            blurOnSubmit
          />

          {/* Subtle divider */}
          <View
            style={{
              height: 2,
              backgroundColor: shade(paperBg, -0.1),
              borderRadius: 1,
              marginBottom: 20,
            }}
          />

          {/* Content input */}
          <TextInput
            ref={contentRef}
            value={content}
            onChangeText={handleContentChange}
            placeholder="Start writing your note…"
            placeholderTextColor={mutedTextColor}
            style={{
              fontSize: 17,
              lineHeight: 28,
              color: textColor,
              fontWeight: '400',
              padding: 0,
              minHeight: 200,
              textAlignVertical: 'top',
            }}
            multiline
            scrollEnabled={false}
            textAlignVertical="top"
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ─── Peeled Corner Effect ─── */}
      <View pointerEvents="none" className="absolute bottom-0 right-0">
        <PeelFlap size={CURL} color={shade(paperBg, -0.24)} />
      </View>

      {/* ─── Color Picker Modal ─── */}
      <ColorPicker
        visible={colorPickerVisible}
        currentColor={paperBg}
        onSelectColor={handleColorSelect}
        onClose={() => setColorPickerVisible(false)}
      />
    </View>
  );
};
