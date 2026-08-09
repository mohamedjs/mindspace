import { hslToHex, luminance, readableTextOn } from './color';
import { shade } from './clay';

describe('hslToHex', () => {
  it('hits the primaries and the greyscale ends', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
    expect(hslToHex(120, 100, 50)).toBe('#00ff00');
    expect(hslToHex(240, 100, 50)).toBe('#0000ff');
    expect(hslToHex(0, 0, 100)).toBe('#ffffff');
    expect(hslToHex(0, 0, 0)).toBe('#000000');
    expect(hslToHex(0, 0, 50)).toBe('#808080');
  });

  it('wraps hue instead of producing NaN channels', () => {
    expect(hslToHex(360, 100, 50)).toBe('#ff0000');
    expect(hslToHex(-120, 100, 50)).toBe('#0000ff');
    expect(hslToHex(480, 100, 50)).toBe('#00ff00');
  });

  it('always returns a parseable 7-char hex across the spectrum', () => {
    for (let h = 0; h < 360; h += 15) {
      for (const [s, l] of [[85, 90], [65, 68], [55, 42], [100, 50]]) {
        expect(hslToHex(h, s, l)).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

describe('readableTextOn', () => {
  it('puts dark ink on pale paper and light ink on dark paper', () => {
    expect(readableTextOn('#FFF8BC')).toBe('#2A1F16'); // pastel yellow note
    expect(readableTextOn('#241F1B')).toBe('#FFFFFF'); // near-black swatch
    expect(luminance('#FFFFFF')).toBeGreaterThan(luminance('#000000'));
  });
});

describe('shade', () => {
  it('moves toward white and black, and expands 3-digit hex', () => {
    expect(shade('#808080', 1)).toBe('#ffffff');
    expect(shade('#808080', -1)).toBe('#000000');
    expect(shade('#808080', 0)).toBe('#808080');
    expect(shade('#fff', -1)).toBe('#000000');
  });
});
