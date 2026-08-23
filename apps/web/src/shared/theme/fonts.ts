/**
 * Excalidraw's hand-drawn look, without breaking Arabic.
 *
 * Architects Daughter is the closest OFL face to Excalidraw's Virgil, but it
 * ships Latin only (348 glyphs, no Arabic block). Baloo Bhaijaan 2 covers both
 * Arabic and Latin in a rounded hand that suits the clay styling.
 *
 * React Native does not do reliable per-glyph font fallback — a missing glyph
 * is a box on Android rather than a substitution — so the family is chosen per
 * string instead, by looking at which script the text is actually written in.
 */

export const FONTS = {
  /** Latin hand-drawn (Excalidraw-like). */
  hand: 'ArchitectsDaughter',
  /** Arabic + Latin rounded. */
  arabic: 'BalooBhaijaan2',
} as const;

/** Arabic, Arabic Supplement/Extended, and the presentation-form blocks. */
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export function hasArabic(text: string): boolean {
  return ARABIC.test(text);
}

/**
 * Font family for a piece of text. Mixed strings get the Arabic face, since it
 * carries Latin too — the reverse would drop glyphs.
 */
export function fontFor(text: string): string {
  return hasArabic(text) ? FONTS.arabic : FONTS.hand;
}

/** Flattens React children into the string used for script detection. */
export function textOf(children: unknown): string {
  if (children == null || typeof children === 'boolean') return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(textOf).join('');
  const el = children as { props?: { children?: unknown } };
  return el?.props?.children != null ? textOf(el.props.children) : '';
}
