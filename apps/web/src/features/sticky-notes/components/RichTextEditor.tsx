'use client';

import React, { useEffect, useRef } from 'react';
import { Extension } from '@tiptap/core';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from 'tiptap-markdown';
import { clay, shade } from '@/shared/theme/clay';
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
} from 'lucide-react';

/**
 * The note body, edited as a document rather than a textarea.
 *
 * What lands in `sticky_notes.content` is still Markdown — the same column,
 * the same plain text — so nothing had to migrate and every note written
 * before this existed is already valid input. TipTap holds a ProseMirror
 * document while you edit; `tiptap-markdown` is what serialises it back out,
 * and it is the reason this is not storing HTML or ProseMirror JSON.
 *
 * Checkboxes are GFM task lists (`- [ ] thing`), which TipTap's TaskItem ticks
 * natively on the web — the mobile app reaches the same lines through its own
 * text-level toggle.
 */

interface RichTextEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  /** The note's paper colour — every surface here is derived from it. */
  paperBg: string;
  textColor: string;
  mutedColor: string;
  accent: string;
  onAccent: string;
  placeholder?: string;
}

/**
 * Keep to-do lists tight on the way out.
 *
 * `tiptap-markdown` marks bullet and ordered lists as tight but not task
 * lists, so a checklist would serialise with a blank line between every box.
 * That is still valid GFM and still re-parses identically — but the raw text
 * is what the canvas and the mobile editor show, and double-spaced boxes read
 * as a mistake there.
 */
const TightTaskList = Extension.create({
  name: 'tightTaskList',
  addGlobalAttributes() {
    return [
      {
        types: ['taskList'],
        attributes: {
          tight: { default: true, parseHTML: () => true, renderHTML: () => ({}) },
        },
      },
    ];
  },
});

/**
 * The Markdown the note gets saved as. `tiptap-markdown` registers its
 * serialiser on the editor's storage bag but ships no type for it against
 * TipTap 3, so the shape is asserted here rather than in every call site.
 */
function serialize(editor: Editor): string {
  const storage = editor.storage as unknown as {
    markdown: { getMarkdown: () => string };
  };
  return storage.markdown.getMarkdown();
}

interface ToolbarAction {
  icon: React.ElementType;
  label: string;
  run: (editor: Editor) => void;
  active: (editor: Editor) => boolean;
}

const ACTIONS: ToolbarAction[] = [
  {
    icon: Heading1,
    label: 'Heading',
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
    active: (e) => e.isActive('heading', { level: 1 }),
  },
  {
    icon: Heading2,
    label: 'Subheading',
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    active: (e) => e.isActive('heading', { level: 2 }),
  },
  {
    icon: Bold,
    label: 'Bold',
    run: (e) => e.chain().focus().toggleBold().run(),
    active: (e) => e.isActive('bold'),
  },
  {
    icon: Italic,
    label: 'Italic',
    run: (e) => e.chain().focus().toggleItalic().run(),
    active: (e) => e.isActive('italic'),
  },
  {
    icon: Strikethrough,
    label: 'Strikethrough',
    run: (e) => e.chain().focus().toggleStrike().run(),
    active: (e) => e.isActive('strike'),
  },
  {
    icon: ListTodo,
    label: 'To-do list',
    run: (e) => e.chain().focus().toggleTaskList().run(),
    active: (e) => e.isActive('taskList'),
  },
  {
    icon: List,
    label: 'Bullet list',
    run: (e) => e.chain().focus().toggleBulletList().run(),
    active: (e) => e.isActive('bulletList'),
  },
  {
    icon: ListOrdered,
    label: 'Numbered list',
    run: (e) => e.chain().focus().toggleOrderedList().run(),
    active: (e) => e.isActive('orderedList'),
  },
  {
    icon: Quote,
    label: 'Quote',
    run: (e) => e.chain().focus().toggleBlockquote().run(),
    active: (e) => e.isActive('blockquote'),
  },
  {
    icon: Code2,
    label: 'Code block',
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
    active: (e) => e.isActive('codeBlock'),
  },
  {
    icon: Link2,
    label: 'Link',
    run: (e) => {
      const previous = e.getAttributes('link').href as string | undefined;
      const href = window.prompt('Link to', previous ?? 'https://');
      if (href === null) return;
      if (href.trim() === '') {
        e.chain().focus().unsetLink().run();
        return;
      }
      e.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run();
    },
    active: (e) => e.isActive('link'),
  },
  {
    icon: Minus,
    label: 'Divider',
    run: (e) => e.chain().focus().setHorizontalRule().run(),
    active: () => false,
  },
];

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  paperBg,
  textColor,
  mutedColor,
  accent,
  onAccent,
  placeholder = 'Start writing your note…',
}) => {
  // What we last handed upward. The note also arrives from the server, and
  // without this the round-trip through the serialiser (which re-wraps and
  // re-spaces the Markdown it emits) would look like an external change and
  // reset the cursor on every keystroke.
  const emitted = useRef(value);

  const editor = useEditor({
    // Next renders this on the server first; TipTap needs a DOM to mount into.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown.configure({ html: false, transformPastedText: true }),
      TightTaskList,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: { attributes: { class: 'ms-rte-content', dir: 'auto' } },
    onUpdate: ({ editor: instance }) => {
      const markdown = serialize(instance);
      emitted.current = markdown;
      onChange(markdown);
    },
  });

  // Seed the document once the note finishes loading, and follow any later
  // change that did not come from typing here (a voice fill, a different note).
  useEffect(() => {
    if (!editor || value === emitted.current) return;
    emitted.current = value;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  const chipBg = shade(paperBg, -0.08);

  return (
    <div className="ms-rte">
      <style>{editorCss(paperBg, textColor, mutedColor, accent)}</style>

      <div
        className="mb-4 flex flex-row flex-wrap items-center gap-1.5 px-2 py-2"
        style={clay({ color: shade(paperBg, -0.05), radius: 20, depth: 0.8 })}
        role="toolbar"
        aria-label="Formatting"
      >
        {ACTIONS.map(({ icon: Icon, label, run, active }) => {
          const on = editor ? active(editor) : false;
          return (
            <button
              key={label}
              type="button"
              aria-label={label}
              aria-pressed={on}
              title={label}
              disabled={!editor}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor && run(editor)}
              className="h-11 w-11 flex items-center justify-center rounded-xl cursor-pointer border-0 transition-transform active:scale-95 disabled:opacity-40"
              style={clay({ color: on ? accent : chipBg, radius: 14, depth: 0.5 })}
            >
              <Icon size={17} color={on ? onAccent : textColor} strokeWidth={2.4} />
            </button>
          );
        })}
      </div>

      <EditorContent editor={editor} />
    </div>
  );
};

/**
 * ProseMirror renders bare tags, so the document's own typography lives here
 * rather than in Tailwind classes. Scoped under `.ms-rte`, and every colour is
 * derived from the paper so a user-picked note colour carries through.
 */
function editorCss(paperBg: string, ink: string, muted: string, accent: string): string {
  const rule = shade(paperBg, -0.14);
  const well = shade(paperBg, -0.08);

  return `
.ms-rte .ms-rte-content { outline: none; min-height: 220px; font-size: 1.0625rem; line-height: 1.75; color: ${ink}; }
.ms-rte .ms-rte-content p.is-editor-empty:first-child::before {
  content: attr(data-placeholder); color: ${muted}; float: inline-start; height: 0; pointer-events: none;
}
.ms-rte .ms-rte-content > * + * { margin-top: 0.75em; }
.ms-rte .ms-rte-content h1 { font-size: 1.75rem; font-weight: 700; letter-spacing: -0.5px; line-height: 1.25; }
.ms-rte .ms-rte-content h2 { font-size: 1.4rem; font-weight: 700; line-height: 1.3; }
.ms-rte .ms-rte-content h3 { font-size: 1.15rem; font-weight: 700; }
.ms-rte .ms-rte-content ul, .ms-rte .ms-rte-content ol { padding-inline-start: 1.5em; }
.ms-rte .ms-rte-content ul { list-style: disc; }
.ms-rte .ms-rte-content ol { list-style: decimal; }
.ms-rte .ms-rte-content li > p { margin: 0; }
.ms-rte .ms-rte-content li + li { margin-top: 0.25em; }
.ms-rte .ms-rte-content blockquote { border-inline-start: 4px solid ${rule}; padding-inline-start: 0.9em; color: ${muted}; }
.ms-rte .ms-rte-content hr { border: none; border-top: 2px solid ${rule}; margin: 1.4em 0; }
.ms-rte .ms-rte-content a { color: ${accent}; text-decoration: underline; text-underline-offset: 2px; }
.ms-rte .ms-rte-content code { background: ${well}; border-radius: 6px; padding: 0.1em 0.35em; font-size: 0.9em; }
.ms-rte .ms-rte-content pre { background: ${well}; border-radius: 14px; padding: 0.9em 1em; overflow-x: auto; }
.ms-rte .ms-rte-content pre code { background: none; padding: 0; }
.ms-rte .ms-rte-content ul[data-type="taskList"] { list-style: none; padding-inline-start: 0; }
.ms-rte .ms-rte-content ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.6em; }
.ms-rte .ms-rte-content ul[data-type="taskList"] li > label { margin-top: 0.35em; }
.ms-rte .ms-rte-content ul[data-type="taskList"] input[type="checkbox"] {
  appearance: none; width: 1.15em; height: 1.15em; border-radius: 6px;
  background: ${well}; border: 1.5px solid ${rule}; cursor: pointer; display: grid; place-content: center;
}
.ms-rte .ms-rte-content ul[data-type="taskList"] input[type="checkbox"]::after {
  content: ''; width: 0.55em; height: 0.3em; border-inline-start: 2.5px solid ${paperBg};
  border-bottom: 2.5px solid ${paperBg}; transform: rotate(-45deg) translate(1px, -1px); opacity: 0;
}
.ms-rte .ms-rte-content ul[data-type="taskList"] input[type="checkbox"]:checked { background: ${accent}; border-color: ${accent}; }
.ms-rte .ms-rte-content ul[data-type="taskList"] input[type="checkbox"]:checked::after { opacity: 1; }
.ms-rte .ms-rte-content ul[data-type="taskList"] li[data-checked="true"] > div { color: ${muted}; }
@media (prefers-reduced-motion: reduce) { .ms-rte * { transition: none !important; } }
`;
}
