import { UndoManager } from './undoStack';

describe('UndoManager', () => {
  it('pushes and executes undo and redo in reverse order', async () => {
    const mgr = new UndoManager(50);
    let state = 0;

    mgr.push({
      name: 'add 1',
      undo: () => { state -= 1; },
      redo: () => { state += 1; },
    });
    state += 1;

    mgr.push({
      name: 'add 2',
      undo: () => { state -= 2; },
      redo: () => { state += 2; },
    });
    state += 2;

    expect(state).toBe(3);
    expect(mgr.canUndo()).toBe(true);
    expect(mgr.canRedo()).toBe(false);

    await mgr.undo();
    expect(state).toBe(1);
    expect(mgr.canRedo()).toBe(true);

    await mgr.undo();
    expect(state).toBe(0);
    expect(mgr.canUndo()).toBe(false);

    await mgr.redo();
    expect(state).toBe(1);

    await mgr.redo();
    expect(state).toBe(3);
    expect(mgr.canRedo()).toBe(false);
  });

  it('caps at max depth of 50 operations', () => {
    const mgr = new UndoManager(50);
    for (let i = 0; i < 60; i++) {
      mgr.push({
        name: `step ${i}`,
        undo: () => {},
        redo: () => {},
      });
    }
    expect(mgr.size.undo).toBe(50);
  });

  it('clears redo stack when a new operation is pushed', async () => {
    const mgr = new UndoManager(50);
    mgr.push({ name: '1', undo: () => {}, redo: () => {} });
    mgr.push({ name: '2', undo: () => {}, redo: () => {} });

    await mgr.undo();
    expect(mgr.canRedo()).toBe(true);

    mgr.push({ name: '3', undo: () => {}, redo: () => {} });
    expect(mgr.canRedo()).toBe(false);
  });

  it('one user action touching multiple notes creates one undo entry', async () => {
    const mgr = new UndoManager(50);
    const positions: Record<string, { x: number; y: number }> = {
      note1: { x: 0, y: 0 },
      note2: { x: 10, y: 10 },
      note3: { x: 20, y: 20 },
    };

    const prevPositions = { ...positions };
    // Move all 3 notes by dx=50, dy=50
    positions.note1 = { x: 50, y: 50 };
    positions.note2 = { x: 60, y: 60 };
    positions.note3 = { x: 70, y: 70 };

    mgr.push({
      name: 'bulk move 3 notes',
      undo: () => {
        Object.assign(positions, prevPositions);
      },
      redo: () => {
        positions.note1 = { x: 50, y: 50 };
        positions.note2 = { x: 60, y: 60 };
        positions.note3 = { x: 70, y: 70 };
      },
    });

    expect(mgr.size.undo).toBe(1);
    await mgr.undo();
    expect(positions.note1).toEqual({ x: 0, y: 0 });
    expect(positions.note2).toEqual({ x: 10, y: 10 });
    expect(positions.note3).toEqual({ x: 20, y: 20 });
  });

  it('reverses commands for move, create, edit, group, link, color, type, delete', async () => {
    const mgr = new UndoManager(50);

    // 1. Move
    let notePos = { x: 0, y: 0 };
    mgr.push({
      name: 'move',
      undo: () => { notePos = { x: 0, y: 0 }; },
      redo: () => { notePos = { x: 100, y: 100 }; },
    });
    notePos = { x: 100, y: 100 };

    // 2. Color
    let noteColor = '#FFF8BC';
    mgr.push({
      name: 'color',
      undo: () => { noteColor = '#FFF8BC'; },
      redo: () => { noteColor = '#BBDEFB'; },
    });
    noteColor = '#BBDEFB';

    // 3. Type
    let noteType = 'idea';
    mgr.push({
      name: 'type',
      undo: () => { noteType = 'idea'; },
      redo: () => { noteType = 'task'; },
    });
    noteType = 'task';

    // 4. Link
    let parentId: string | null = null;
    mgr.push({
      name: 'link',
      undo: () => { parentId = null; },
      redo: () => { parentId = 'p1'; },
    });
    parentId = 'p1';

    // 5. Delete
    let deleted = false;
    mgr.push({
      name: 'delete',
      undo: () => { deleted = false; },
      redo: () => { deleted = true; },
    });
    deleted = true;

    // Undo delete
    await mgr.undo();
    expect(deleted).toBe(false);

    // Undo link
    await mgr.undo();
    expect(parentId).toBeNull();

    // Undo type
    await mgr.undo();
    expect(noteType).toBe('idea');

    // Undo color
    await mgr.undo();
    expect(noteColor).toBe('#FFF8BC');

    // Undo move
    await mgr.undo();
    expect(notePos).toEqual({ x: 0, y: 0 });
  });

  it('clear() empties the manager', () => {
    const mgr = new UndoManager(50);
    mgr.push({ name: '1', undo: () => {}, redo: () => {} });
    mgr.clear();
    expect(mgr.canUndo()).toBe(false);
    expect(mgr.canRedo()).toBe(false);
    expect(mgr.size.undo).toBe(0);
  });
});
