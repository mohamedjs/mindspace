import React from 'react';
import { render } from '@testing-library/react-native';
import { CanvasRoot } from './CanvasRoot';
import { ThemeProvider } from '../../../shared/theme';

/**
 * Does the canvas mount at all?
 *
 * Nothing clever — but the whole reason this file exists is a crash `tsc` and
 * the unit tests both waved through: the pan gesture's worklets referenced
 * callbacks declared further down the component, and Reanimated's babel plugin
 * evaluates a worklet's closure at the point the worklet is built. Reading a
 * `const` from its temporal dead zone throws
 * "Cannot access 'X' before initialization" the first time CanvasRoot renders.
 *
 * Type-checking cannot see it (the reference is legal TypeScript) and the pure
 * unit tests never render anything. One mount does.
 */
describe('CanvasRoot mounts', () => {
  const renderCanvas = (props = {}) =>
    render(
      <ThemeProvider>
        <CanvasRoot notes={[]} groups={[]} {...props} />
      </ThemeProvider>
    );

  it('renders an empty board without throwing', () => {
    expect(() => renderCanvas()).not.toThrow();
  });

  it('renders notes, a group, and a parent/child pair', () => {
    expect(() =>
      renderCanvas({
        notes: [
          { id: 'a', content: 'parent', type: 'idea', x: 0, y: 0 },
          { id: 'b', content: 'child', type: 'task', x: 300, y: 200, parentId: 'a' },
        ],
        groups: [{ id: 'g', title: 'Group', x: -50, y: -50, width: 500, height: 400, color: null }],
      })
    ).not.toThrow();
  });

  it('renders with the arrow tool wired up', () => {
    expect(() => renderCanvas({ onSetNoteParent: () => {} })).not.toThrow();
  });
});
