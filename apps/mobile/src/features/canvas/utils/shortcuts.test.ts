import { resolveShortcut } from './shortcuts';
import { CANVAS_TOOLS, type SelectionState } from '@mindspace/contracts';

describe('shortcuts and tool table', () => {
  it('has no duplicate single-key shortcuts in CANVAS_TOOLS', () => {
    // Modifiers or distinct contexts can reuse G (Create group vs Sel group),
    // but within a zone each key must be unique.
    const byZone: Record<string, string[]> = {};
    for (const tool of CANVAS_TOOLS) {
      if (!tool.key) continue;
      if (!byZone[tool.zone]) byZone[tool.zone] = [];
      expect(byZone[tool.zone]).not.toContain(tool.key);
      byZone[tool.zone].push(tool.key);
    }
  });

  it('maps letter keys to mode tools', () => {
    expect(resolveShortcut({ key: 'v' })).toBe('select');
    expect(resolveShortcut({ key: 'V' })).toBe('select');
    expect(resolveShortcut({ key: 'h' })).toBe('hand');
    expect(resolveShortcut({ key: 'c' })).toBe('connect');
    expect(resolveShortcut({ key: 'w' })).toBe('write');
  });

  it('maps create keys', () => {
    expect(resolveShortcut({ key: 'r' })).toBe('create_voice');
    expect(resolveShortcut({ key: 'n' })).toBe('create_note');
    expect(resolveShortcut({ key: 'N', shiftKey: true })).toBe('create_subnote');
    expect(resolveShortcut({ key: 'g' })).toBe('sel_group');
    expect(resolveShortcut({ key: 'G', shiftKey: true })).toBe('sel_ungroup');
  });

  it('maps selection keys', () => {
    expect(resolveShortcut({ key: 'l' })).toBe('sel_link');
    expect(resolveShortcut({ key: 'L', shiftKey: true })).toBe('sel_unlink');
    expect(resolveShortcut({ key: 't' })).toBe('sel_tidy');
    expect(resolveShortcut({ key: 'T', shiftKey: true })).toBe('view_tidy_all');
    expect(resolveShortcut({ key: 'd', ctrlKey: true })).toBe('sel_duplicate');
    expect(resolveShortcut({ key: 'd', metaKey: true })).toBe('sel_duplicate');
    expect(resolveShortcut({ key: 'Delete' })).toBe('sel_delete');
    expect(resolveShortcut({ key: 'Backspace' })).toBe('sel_delete');
    expect(resolveShortcut({ key: 'Escape' })).toBe('sel_clear');
  });

  it('maps view keys', () => {
    expect(resolveShortcut({ key: 'f' })).toBe('view_fit');
    expect(resolveShortcut({ key: 's' })).toBe('view_subnotes');
    expect(resolveShortcut({ key: '+' })).toBe('view_zoom_in');
    expect(resolveShortcut({ key: '-' })).toBe('view_zoom_out');
    expect(resolveShortcut({ key: '0' })).toBe('view_zoom_reset');
  });

  it('resolves undo and redo chords', () => {
    expect(resolveShortcut({ key: 'z', ctrlKey: true })).toBe('view_undo');
    expect(resolveShortcut({ key: 'z', metaKey: true })).toBe('view_undo');
    expect(resolveShortcut({ key: 'z', ctrlKey: true, shiftKey: true })).toBe('view_redo');
    expect(resolveShortcut({ key: 'Z', metaKey: true, shiftKey: true })).toBe('view_redo');
    expect(resolveShortcut({ key: 'z' })).toBeNull();
  });

  it('ignores shortcuts when typing in inputs, textareas, or contenteditables', () => {
    expect(resolveShortcut({ key: 'v', targetTag: 'INPUT' })).toBeNull();
    expect(resolveShortcut({ key: 'w', targetTag: 'TEXTAREA' })).toBeNull();
    expect(resolveShortcut({ key: 'n', targetTag: 'DIV', isContentEditable: true })).toBeNull();
    expect(resolveShortcut({ key: 'z', ctrlKey: true, isContentEditable: true })).toBeNull();
    expect(resolveShortcut({ key: 'Delete', targetTag: 'INPUT' })).toBeNull();
  });

  it('ignores tool keys when modifier (ctrl/alt) is held without matching chord', () => {
    expect(resolveShortcut({ key: 'v', ctrlKey: true })).toBeNull();
    expect(resolveShortcut({ key: 'w', altKey: true })).toBeNull();
    expect(resolveShortcut({ key: 'h', metaKey: true })).toBeNull();
  });
});

describe('isAvailable rules from CANVAS_TOOLS', () => {
  const emptySel: SelectionState = { selectedNoteIds: [] };
  const oneNoteSel: SelectionState = {
    selectedNoteIds: ['n1'],
    notes: [{ id: 'n1', parentId: null }],
  };
  const twoNotesSel: SelectionState = {
    selectedNoteIds: ['n1', 'n2'],
    notes: [{ id: 'n1' }, { id: 'n2' }],
  };
  const noteWithParentSel: SelectionState = {
    selectedNoteIds: ['n2'],
    notes: [{ id: 'n2', parentId: 'n1' }],
  };
  const frameSel: SelectionState = {
    selectedNoteIds: [],
    selectedGroupIds: ['g1'],
  };

  const getToolAvail = (id: string, sel: SelectionState) => {
    const tool = CANVAS_TOOLS.find((t) => t.id === id);
    return tool ? tool.isAvailable(sel) : false;
  };

  it('validates sub-note creation only available with 1 selected note', () => {
    expect(getToolAvail('create_subnote', emptySel)).toBe(false);
    expect(getToolAvail('create_subnote', oneNoteSel)).toBe(true);
    expect(getToolAvail('create_subnote', twoNotesSel)).toBe(false);
  });

  it('validates link only available with exactly 2 selected notes', () => {
    expect(getToolAvail('sel_link', emptySel)).toBe(false);
    expect(getToolAvail('sel_link', oneNoteSel)).toBe(false);
    expect(getToolAvail('sel_link', twoNotesSel)).toBe(true);
  });

  it('validates unlink only available when a selected note has a parent', () => {
    expect(getToolAvail('sel_unlink', oneNoteSel)).toBe(false);
    expect(getToolAvail('sel_unlink', noteWithParentSel)).toBe(true);
  });

  it('validates ungroup only available when a group is selected', () => {
    expect(getToolAvail('sel_ungroup', emptySel)).toBe(false);
    expect(getToolAvail('sel_ungroup', oneNoteSel)).toBe(false);
    expect(getToolAvail('sel_ungroup', frameSel)).toBe(true);
  });

  it('validates tidy available only with 2 or more selected notes', () => {
    expect(getToolAvail('sel_tidy', emptySel)).toBe(false);
    expect(getToolAvail('sel_tidy', oneNoteSel)).toBe(false);
    expect(getToolAvail('sel_tidy', twoNotesSel)).toBe(true);
  });

  it('validates delete and clear available with notes or groups selected', () => {
    expect(getToolAvail('sel_delete', emptySel)).toBe(false);
    expect(getToolAvail('sel_delete', oneNoteSel)).toBe(true);
    expect(getToolAvail('sel_delete', frameSel)).toBe(true);
  });
});
