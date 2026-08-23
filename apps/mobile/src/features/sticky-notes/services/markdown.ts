/**
 * GFM task lists inside note content.
 *
 * Notes are stored as Markdown in `sticky_notes.content` — there is no separate
 * checklist table — so ticking a box on the note screen is a text edit: flip
 * `- [ ]` to `- [x]` on the line the reader tapped and save the whole note back
 * through the normal content mutation.
 *
 * The renderer walks the content top to bottom and numbers task lines as it
 * meets them, so a tap identifies itself by *task* index rather than line
 * index. Keeping both sides on that same counter is what makes the toggle land
 * on the right line when prose, headings or bullets sit between the boxes.
 */

/** `- [ ] thing`, `* [x] thing`, `  + [X] nested thing`. */
const TASK_LINE = /^(\s*)([-*+][ \t]+)\[([ xX])\]/;

export function isTaskLine(line: string): boolean {
  return TASK_LINE.test(line);
}

export function isTaskChecked(line: string): boolean {
  const match = line.match(TASK_LINE);
  return match ? match[3] !== ' ' : false;
}

/** Every task line in the note, in reading order — the renderer's numbering. */
export function taskLines(markdown: string): string[] {
  return markdown.split('\n').filter(isTaskLine);
}

/**
 * Flip the nth (0-based) task line between checked and unchecked.
 *
 * Indentation and the original bullet marker are preserved so nested lists and
 * `*`/`+` styles survive a toggle untouched. An index that matches no task
 * returns the content unchanged rather than throwing — a stale tap from a note
 * that changed underneath should be a no-op, not a crash.
 *
 * ponytail: a `- [ ]` line inside a fenced code block counts as a task here.
 * Track fences if someone writes Markdown *about* Markdown in a note.
 */
export function toggleTaskAt(markdown: string, taskIndex: number): string {
  if (taskIndex < 0) return markdown;

  const lines = markdown.split('\n');
  let seen = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(TASK_LINE);
    if (!match) continue;

    seen += 1;
    if (seen !== taskIndex) continue;

    const box = match[3] === ' ' ? '[x]' : '[ ]';
    lines[i] = match[1] + match[2] + box + lines[i].slice(match[0].length);
    return lines.join('\n');
  }

  return markdown;
}

/* ── Rendering ─────────────────────────────────────────────────────────── */

export type Block =
  | { kind: 'markdown'; key: string; text: string }
  | { kind: 'task'; key: string; label: string; checked: boolean; taskIndex: number };

/**
 * Split a note into runs of prose and individual task lines.
 *
 * The renderer draws checkboxes itself rather than handing them to markdown-it,
 * which has no task-list support without a plugin and no way to report which
 * box a finger landed on. Numbering here has to match `toggleTaskAt` exactly —
 * both count task lines top to bottom — or a tap ticks the wrong box.
 *
 * Blank lines between checkboxes are absorbed into the run rather than breaking
 * it, so a loosely-written checklist still reads as one list.
 */
export function splitBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const lines = content.split('\n');

  let prose: string[] = [];
  let taskIndex = 0;
  let inTaskRun = false;

  const flushProse = () => {
    const text = prose.join('\n');
    if (text.trim() !== '') blocks.push({ kind: 'markdown', key: `md-${blocks.length}`, text });
    prose = [];
  };

  for (const line of lines) {
    if (isTaskLine(line)) {
      flushProse();
      blocks.push({
        kind: 'task',
        key: `task-${taskIndex}`,
        label: line.replace(/^\s*[-*+][ \t]+\[[ xX]\][ \t]*/, ''),
        checked: isTaskChecked(line),
        taskIndex,
      });
      taskIndex += 1;
      inTaskRun = true;
      continue;
    }

    if (inTaskRun && line.trim() === '') continue;

    inTaskRun = false;
    prose.push(line);
  }

  flushProse();
  return blocks;
}

/* ── Editing ───────────────────────────────────────────────────────────── */

/** How a toolbar button changes the note. Line prefixes toggle; wrappers append. */
export type Insert = { prefix: string } | { wrap: string } | { block: string };

/**
 * Apply a formatting-toolbar press to the note text.
 *
 * Editing on a phone stays a plain Markdown field — a WYSIWYG surface in React
 * Native means a WebView, which is heavier than this screen needs — so the
 * toolbar writes the syntax instead.
 *
 * It works on the last line, because that is where the caret is in practice on
 * a note you are appending to.
 *
 * ponytail: last-line, not caret-position. Wire up `onSelectionChange` if
 * people start reformatting the middle of long notes.
 */
export function applyInsert(content: string, insert: Insert): string {
  const lines = content.split('\n');
  const last = lines[lines.length - 1] ?? '';

  if ('prefix' in insert) {
    // Strip any other block prefix first so formats replace rather than stack,
    // and toggle back off when the line already carries the one pressed.
    const bare = last.replace(/^\s*(#{1,6} |> |- \[[ xX]\] |[-*+] |\d+\. )/, '');
    lines[lines.length - 1] =
      bare.startsWith(insert.prefix) || last.startsWith(insert.prefix)
        ? bare
        : insert.prefix + bare;
    return lines.join('\n');
  }

  if ('wrap' in insert) {
    // Nothing to wrap yet — leave the marks open for the next thing typed.
    if (last.trim() === '') {
      lines[lines.length - 1] = last + insert.wrap + insert.wrap;
      return lines.join('\n');
    }
    const words = last.split(' ');
    words[words.length - 1] = insert.wrap + words[words.length - 1] + insert.wrap;
    lines[lines.length - 1] = words.join(' ');
    return lines.join('\n');
  }

  const separator = content === '' || last.trim() === '' ? '' : '\n\n';
  return content + separator + insert.block + '\n';
}
