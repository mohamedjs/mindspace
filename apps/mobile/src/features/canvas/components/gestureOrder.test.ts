import fs from 'fs';
import path from 'path';

/**
 * Gesture worklets must not reference bindings declared below them.
 *
 * Reanimated's babel plugin builds a worklet's closure **at the point the
 * worklet is created**, emitting something like
 * `fn.__closure = { modeSV, beginLink, … }`. That object literal is evaluated
 * during render, so naming a `const` that appears further down the component
 * throws "Cannot access 'X' before initialization" the moment the canvas
 * mounts — a hard crash on a blank screen.
 *
 * TypeScript cannot see it: the reference is perfectly legal, just ordered
 * wrong. It shipped once. A rendering test would catch it too, but the RN
 * testing stack needs a working native-module mock chain for worklets,
 * gesture-handler, SVG and the icon set; reading the file costs nothing and
 * catches the exact mistake.
 */
const SOURCE = path.join(__dirname, 'CanvasRoot.tsx');

describe('CanvasRoot gesture declaration order', () => {
  const src = fs.readFileSync(SOURCE, 'utf8');
  const lines = src.split('\n');

  /** Line index of every top-level `const <name>` inside the component. */
  const declaredAt = new Map<string, number>();
  lines.forEach((line, i) => {
    const m = /^ {2}const (?:\{ [^}]+ \}|([A-Za-z_$][\w$]*))\s*[=:]/.exec(line);
    if (m?.[1] && !declaredAt.has(m[1])) declaredAt.set(m[1], i);
  });

  /** The `const <name> = Gesture.…` chains, with their line spans. */
  const gestures = [...declaredAt.entries()].filter(([name]) =>
    new RegExp(`^ {2}const ${name} = Gesture\\.`).test(lines[declaredAt.get(name)!])
  );

  it('finds the gesture definitions it is meant to police', () => {
    expect(gestures.map(([n]) => n).sort()).toEqual(['canvasGesture', 'panGesture', 'pinchGesture']);
  });

  it.each([['panGesture'], ['pinchGesture']])(
    '%s only closes over bindings declared above it',
    (name) => {
      const start = declaredAt.get(name)!;
      let end = start;
      while (end < lines.length && lines[end].trimEnd() !== '    });') end++;
      const body = lines.slice(start, end + 1).join('\n');

      const late = [...declaredAt.entries()]
        .filter(([ident, at]) => at > start && new RegExp(`\\b${ident}\\b`).test(body))
        .map(([ident]) => ident);

      expect(late).toEqual([]);
    }
  );
});
