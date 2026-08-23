import {
  applyInsert,
  isTaskChecked,
  isTaskLine,
  splitBlocks,
  taskLines,
  toggleTaskAt,
} from './markdown';


const NOTE = [
  '# Shipping list',
  '',
  'Some prose that is not a task at all.',
  '',
  '- [ ] draft the spec',
  '- [x] book the room',
  '- plain bullet, not a task',
  '  - [ ] nested follow-up',
  '',
  '> a quote',
].join('\n');

describe('isTaskLine', () => {
  it('recognises the GFM forms and rejects plain bullets', () => {
    expect(isTaskLine('- [ ] todo')).toBe(true);
    expect(isTaskLine('* [x] done')).toBe(true);
    expect(isTaskLine('  + [X] shouted')).toBe(true);
    expect(isTaskLine('- just a bullet')).toBe(false);
    expect(isTaskLine('[ ] no bullet')).toBe(false);
    expect(isTaskLine('')).toBe(false);
  });
});

describe('isTaskChecked', () => {
  it('treats both x and X as done', () => {
    expect(isTaskChecked('- [ ] todo')).toBe(false);
    expect(isTaskChecked('- [x] done')).toBe(true);
    expect(isTaskChecked('- [X] done')).toBe(true);
  });
});

describe('taskLines', () => {
  it('numbers tasks in reading order, skipping prose and plain bullets', () => {
    expect(taskLines(NOTE)).toEqual([
      '- [ ] draft the spec',
      '- [x] book the room',
      '  - [ ] nested follow-up',
    ]);
  });
});

describe('toggleTaskAt', () => {
  it('ticks the nth task and leaves everything else byte-identical', () => {
    const next = toggleTaskAt(NOTE, 0);
    expect(next).toBe(NOTE.replace('- [ ] draft the spec', '- [x] draft the spec'));
  });

  it('unticks a done task', () => {
    expect(toggleTaskAt(NOTE, 1)).toContain('- [ ] book the room');
  });

  it('indexes by task, not by line', () => {
    // The nested task is the third *task* but the eighth line — a line-indexed
    // implementation would flip the wrong thing here.
    const next = toggleTaskAt(NOTE, 2);
    expect(next).toContain('  - [x] nested follow-up');
    expect(next).toContain('- [ ] draft the spec');
  });

  it('preserves indentation and the original bullet marker', () => {
    expect(toggleTaskAt('   * [ ] keep my star', 0)).toBe('   * [x] keep my star');
    expect(toggleTaskAt('+ [X] keep my plus', 0)).toBe('+ [ ] keep my plus');
  });

  it('round-trips: toggling twice restores the original content', () => {
    expect(toggleTaskAt(toggleTaskAt(NOTE, 0), 0)).toBe(NOTE);
    expect(toggleTaskAt(toggleTaskAt(NOTE, 2), 2)).toBe(NOTE);
  });

  it('is a no-op for an index no task matches', () => {
    expect(toggleTaskAt(NOTE, 99)).toBe(NOTE);
    expect(toggleTaskAt(NOTE, -1)).toBe(NOTE);
    expect(toggleTaskAt('no tasks here', 0)).toBe('no tasks here');
  });

  it('leaves plain-text notes — which are already valid Markdown — untouched', () => {
    const plain = 'Just a thought I had.\nAnd a second line.';
    expect(toggleTaskAt(plain, 0)).toBe(plain);
  });
});

describe('splitBlocks', () => {
  it('pulls task lines out and leaves the prose to the Markdown renderer', () => {
    const blocks = splitBlocks(NOTE);
    expect(blocks.filter((b) => b.kind === 'task')).toHaveLength(3);
    expect(blocks.map((b) => b.kind)).toContain('markdown');
  });

  it('strips the marker off the label and reads the checked state', () => {
    const [task] = splitBlocks('- [x] book the room').filter((b) => b.kind === 'task');
    expect(task).toMatchObject({ label: 'book the room', checked: true, taskIndex: 0 });
  });

  it('keeps a checklist together across the blank lines a loose list has', () => {
    const blocks = splitBlocks('- [ ] one\n\n- [ ] two');
    expect(blocks.every((b) => b.kind === 'task')).toBe(true);
  });

  /**
   * The invariant the whole checkbox feature rests on: the index the renderer
   * hands to a tap is the index toggleTaskAt counts to. If these ever drift,
   * tapping one box silently ticks a different one.
   */
  it('numbers tasks the same way toggleTaskAt does', () => {
    const tasks = splitBlocks(NOTE).filter((b) => b.kind === 'task');
    const lines = taskLines(NOTE);

    expect(tasks).toHaveLength(lines.length);
    tasks.forEach((task, i) => {
      expect(task.taskIndex).toBe(i);
      const toggled = toggleTaskAt(NOTE, task.taskIndex);
      const toggledLines = taskLines(toggled);
      // Exactly the tapped task changed.
      toggledLines.forEach((line, j) => {
        expect(line === lines[j]).toBe(j !== i);
      });
    });
  });
});

describe('applyInsert', () => {
  it('prefixes the line being written', () => {
    expect(applyInsert('groceries', { prefix: '# ' })).toBe('# groceries');
    expect(applyInsert('milk', { prefix: '- [ ] ' })).toBe('- [ ] milk');
  });

  it('toggles a prefix back off and replaces one block format with another', () => {
    expect(applyInsert('# groceries', { prefix: '# ' })).toBe('groceries');
    expect(applyInsert('- milk', { prefix: '- [ ] ' })).toBe('- [ ] milk');
  });

  it('leaves earlier lines alone', () => {
    expect(applyInsert('first\nsecond', { prefix: '> ' })).toBe('first\n> second');
  });

  it('wraps the last word for inline marks, and opens empty marks on a blank line', () => {
    expect(applyInsert('make it loud', { wrap: '**' })).toBe('make it **loud**');
    expect(applyInsert('', { wrap: '*' })).toBe('**');
  });

  it('appends block inserts on their own', () => {
    expect(applyInsert('a thought', { block: '---' })).toBe('a thought\n\n---\n');
    expect(applyInsert('', { block: '---' })).toBe('---\n');
  });
});
