import { FONTS, fontFor, hasArabic, textOf } from './fonts';

describe('script detection', () => {
  it('spots Arabic, including the text this app actually produces', () => {
    expect(hasArabic('بص انا بحاول افكر اعمل مشروع جديد')).toBe(true);
    expect(hasArabic('مشروع AI')).toBe(true);
    expect(hasArabic('How do you like this?')).toBe(false);
    expect(hasArabic('')).toBe(false);
    expect(hasArabic('123 !?')).toBe(false);
  });

  it('gives mixed text the Arabic face, because it also carries Latin', () => {
    // Architects Daughter has no Arabic block, so choosing it for a mixed
    // string would drop glyphs. Baloo covers both.
    expect(fontFor('مشروع AI')).toBe(FONTS.arabic);
    expect(fontFor('Onboarding Flow')).toBe(FONTS.hand);
  });
});

describe('textOf', () => {
  it('flattens the child shapes a Text node can receive', () => {
    expect(textOf('hi')).toBe('hi');
    expect(textOf(42)).toBe('42');
    expect(textOf(['a', 'b'])).toBe('ab');
    expect(textOf(null)).toBe('');
    expect(textOf(false)).toBe('');
    expect(textOf([{ props: { children: 'نص' } }, ' x'])).toBe('نص x');
  });

  it('detects Arabic nested inside interpolated children', () => {
    expect(fontFor(textOf(['قال ', { props: { children: 'المستخدم' } }]))).toBe(FONTS.arabic);
  });
});
