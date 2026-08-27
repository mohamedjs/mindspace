import { resolveShortcut } from './shortcuts';

describe('resolveShortcut', () => {
  it('maps each digit to its tool', () => {
    const expected = {
      '1': 'pan',
      '2': 'pointer',
      '3': 'write',
      '4': 'arrow',
      '5': 'addNote',
      '6': 'addGroup',
      '7': 'tidy',
      '8': 'fitToView',
      '9': 'recordings',
    } as const;
    for (const [key, action] of Object.entries(expected)) {
      expect(resolveShortcut({ key })).toBe(action);
    }
  });

  it('maps H to sub-note visibility, either case', () => {
    expect(resolveShortcut({ key: 'h' })).toBe('toggleChildNotes');
    expect(resolveShortcut({ key: 'H', shiftKey: true })).toBe('toggleChildNotes');
  });

  it('leaves 0 and zoom keys to the existing handler', () => {
    expect(resolveShortcut({ key: '0' })).toBeNull();
    expect(resolveShortcut({ key: '+' })).toBeNull();
    expect(resolveShortcut({ key: '-' })).toBeNull();
    expect(resolveShortcut({ key: 'Escape' })).toBeNull();
  });

  it('ignores digits typed into inputs, textareas and contenteditables', () => {
    expect(resolveShortcut({ key: '5', targetTag: 'INPUT' })).toBeNull();
    expect(resolveShortcut({ key: '5', targetTag: 'TEXTAREA' })).toBeNull();
    expect(resolveShortcut({ key: '5', targetTag: 'DIV', isContentEditable: true })).toBeNull();
    expect(resolveShortcut({ key: 'h', targetTag: 'INPUT' })).toBeNull();
  });

  it('ignores tool keys when a modifier is held', () => {
    expect(resolveShortcut({ key: '1', ctrlKey: true })).toBeNull();
    expect(resolveShortcut({ key: '1', metaKey: true })).toBeNull();
    expect(resolveShortcut({ key: '1', altKey: true })).toBeNull();
    expect(resolveShortcut({ key: 'h', ctrlKey: true })).toBeNull();
  });

  it('resolves undo and redo chords', () => {
    expect(resolveShortcut({ key: 'z', ctrlKey: true })).toBe('undo');
    expect(resolveShortcut({ key: 'z', metaKey: true })).toBe('undo');
    expect(resolveShortcut({ key: 'z', ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(resolveShortcut({ key: 'Z', metaKey: true, shiftKey: true })).toBe('redo');
    expect(resolveShortcut({ key: 'z' })).toBeNull();
  });

  it('does not fire undo inside a contenteditable (the editor owns it)', () => {
    expect(resolveShortcut({ key: 'z', ctrlKey: true, isContentEditable: true })).toBeNull();
  });
});
