import React from 'react';
import { ScrollView, TouchableOpacity } from 'react-native';
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Strikethrough,
} from 'lucide-react-native';
import { clay, shade } from '../../../shared/theme/clay';
import type { Insert } from '../services/markdown';

/**
 * Formatting for the mobile note editor.
 *
 * Editing on a phone stays a plain Markdown text field — a WYSIWYG surface in
 * React Native means a WebView, and that is a heavier thing than this screen
 * needs. So the toolbar writes the syntax instead: a line prefix for block
 * formats, a wrapper for inline ones. Reading the note back is where the
 * formatting actually shows (see MarkdownView).
 */

export interface MarkdownToolbarProps {
  onInsert: (insert: Insert) => void;
  paperBg: string;
  textColor: string;
}

const BUTTONS: { icon: React.ElementType; label: string; insert: Insert }[] = [
  { icon: Heading1, label: 'Heading', insert: { prefix: '# ' } },
  { icon: Heading2, label: 'Subheading', insert: { prefix: '## ' } },
  { icon: Bold, label: 'Bold', insert: { wrap: '**' } },
  { icon: Italic, label: 'Italic', insert: { wrap: '*' } },
  { icon: Strikethrough, label: 'Strikethrough', insert: { wrap: '~~' } },
  { icon: ListTodo, label: 'To-do', insert: { prefix: '- [ ] ' } },
  { icon: List, label: 'Bullet', insert: { prefix: '- ' } },
  { icon: ListOrdered, label: 'Numbered', insert: { prefix: '1. ' } },
  { icon: Quote, label: 'Quote', insert: { prefix: '> ' } },
  { icon: Code2, label: 'Code block', insert: { block: '```\n\n```' } },
  { icon: Link2, label: 'Link', insert: { block: '[text](https://)' } },
  { icon: Minus, label: 'Divider', insert: { block: '---' } },
];

export const MarkdownToolbar: React.FC<MarkdownToolbarProps> = ({
  onInsert,
  paperBg,
  textColor,
}) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    keyboardShouldPersistTaps="always"
    contentContainerStyle={{ gap: 8, paddingVertical: 8, paddingHorizontal: 2 }}
  >
    {BUTTONS.map(({ icon: Icon, label, insert }) => (
      <TouchableOpacity
        key={label}
        onPress={() => onInsert(insert)}
        activeOpacity={0.8}
        accessibilityLabel={label}
        hitSlop={4}
        style={{
          ...clay({ color: shade(paperBg, -0.08), radius: 14, depth: 0.5 }),
          height: 44,
          width: 44,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={17} color={textColor} strokeWidth={2.4} />
      </TouchableOpacity>
    ))}
  </ScrollView>
);
