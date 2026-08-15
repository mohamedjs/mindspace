/**
 * Colour maths for notes. The picker itself is reanimated-color-picker, so the
 * job here is what happens *after* a colour is chosen: the user can now land on
 * any hue, including near-black, and the note's text has to stay readable on it.
 */

/** h 0-360, s 0-100, l 0-100 -> #rrggbb */
export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;

  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));

  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];

  const m = lig - c / 2;
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

/**
 * Relative luminance (WCAG). Used to decide whether note text should be dark or
 * light once the user picks an arbitrary colour — a saturated blue needs white
 * text, a pale yellow needs near-black.
 */
export function luminance(hex: string): number {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;

  const channels = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Readable ink for an arbitrary paper colour. */
export function readableTextOn(hex: string): string {
  return luminance(hex) > 0.45 ? '#2A1F16' : '#FFFFFF';
}
