---
name: mindspace-ui
description: MindSpace's claymorphism design system — palette, clay() surfaces, shade(), fonts, sticky-note colours, and the RN↔web translation. Use when building or restyling any UI in apps/mobile or apps/web: screens, components, sheets, buttons, toolbars, sticky notes, theming, dark mode, or when a design looks off and you need the house rules.
---

# MindSpace design system

The look is **claymorphism**: soft objects pressed out of a warm paper board.
Not flat, not glassy — every panel reads as a physical thing with light falling
on it from the top-left.

Two apps share this system exactly: `apps/mobile` (React Native) and
`apps/web` (Next.js). The tokens are identical; only the style object differs.

---

## The four rules

**1. Never write a hex literal in a component.**
Colours come from the theme, always. A hardcoded colour is invisible in one of
the two schemes, and the palette is genuinely different between them — light is
warm brown-on-paper, dark is cool grey-on-charcoal. They are not inversions of
each other.

```tsx
// mobile
const { colors } = useTheme();
<View style={{ backgroundColor: colors.surface }} />
```
```tsx
// web — prefer the Tailwind token, which reads the CSS variable
<div className="bg-surface text-ink" />
```

**2. Every raised or inset surface is `clay()`.** Never hand-roll a shadow.

**3. Every derived tone is `shade()`.** Never eyeball a lighter/darker variant.

**4. Text goes through the font rule.** Arabic is first-class content here; a
Latin-only face turns it into boxes on Android. See §5.

---

## 1. Palette

`Palette` in `shared/theme/index.tsx` (mobile) and `app/globals.css` (web).
Both schemes are complete — nothing is computed from the other.

| Token | Light | Dark | Use for |
|---|---|---|---|
| `canvas` | `#F5EDE3` | `#202124` | App background behind everything |
| `board` | `#EFE4D6` | `#17181A` | The note board itself; screen backgrounds |
| `surface` | `#FBF6F0` | `#292A2D` | Cards, sheets, headers, toolbars |
| `ink` | `#2C1E14` | `#F8F9FA` | Primary text |
| `muted` | `#7A6552` | `#9AA0A6` | Secondary text, placeholders, inactive icons |
| `accent` | `#B8620F` | `#8AB4F8` | Primary actions, active states, selection |
| `onAccent` | `#FFFFFF` | `#202124` | Text/icons **on** accent |
| `line` | `#E0D2C0` | `#3C4043` | Borders, dividers |
| `warning` | `#B06A00` | `#FDE293` | Destructive-adjacent, invalid states, negative amounts |
| `grid` | `rgba(44,30,20,.08)` | `rgba(255,255,255,.025)` | Canvas grid rules |
| `scrim` | `rgba(44,30,20,.35)` | `rgba(0,0,0,.65)` | Behind modals |
| `overlay` | `rgba(251,246,240,.96)` | `rgba(41,42,45,.94)` | Sheet backgrounds |

Light's accent is **burnt orange**, dark's is **blue**. Do not assume one hue.

---

## 2. `clay()` — the whole visual language

```ts
clay({ color, radius = 22, pressed = false, depth = 1 })
```

| Param | Meaning |
|---|---|
| `color` | The surface the object is moulded from — usually `colors.surface` |
| `radius` | Corner radius. Bigger for bigger objects |
| `pressed` | Inset instead of raised: **inverts the rim lighting** and flattens the shadow |
| `depth` | Shadow multiplier. Raise for things that float |

It produces a background, a radius, a 1.5px border whose **four sides differ**,
and a drop shadow. The asymmetric border is the trick: light catches the top
edge of a raised object and the bottom edge of a hollow one, and that inversion
is what sells "pressed in". React Native has no cross-platform inset shadow, so
the inner lighting is faked this way — and the web version matches it exactly so
the two apps look the same.

Two shorthands:

```ts
clayAccent(colors, radius = 20)   // clay({ color: colors.accent, radius, depth: 1.2 })
claySurface(colors, radius = 24)  // clay({ color: colors.surface, radius })
```

### Conventions in use

| Element | Recipe |
|---|---|
| Screen header bar | `clay({ color: colors.surface, radius: 24 })` |
| Card / sheet | `clay({ color: colors.surface, radius: 22–28, depth: .6–.8 })` |
| Toolbar strip | `clay({ color: colors.surface, radius: 20, depth: .8 })` |
| Toolbar button | `clay({ color: shade(colors.surface, -0.05), radius: 14, depth: .5 })` |
| Toolbar button, **active** | `clay({ color: colors.accent, radius: 14, depth: .5 })` + `colors.onAccent` icon |
| Primary button | `clayAccent(colors, 20)` |
| Text input | `clay({ color: shade(colors.surface, -0.03), radius: 20, pressed: true })` |
| Pressed container (row, swatch, toggle) | `clay({ color: shade(colors.surface, -0.05…-0.06), radius: 14–20, pressed: true })` |
| Segmented control track | `clay({ color: shade(colors.surface, -0.12), radius: 16, pressed: true })` |
| Segment, selected | `clay({ color: colors.accent, radius: 12, depth: .7 })` |
| Floating action button | `clayAccent(colors, 37)` + `shadowColor: colors.accent` |

**Inputs and tracks are `pressed: true`.** Anything you type into or drop
something onto is a hollow, not a bump.

### Platform

| | Mobile | Web |
|---|---|---|
| Returns | `ViewStyle` | `CSSProperties` |
| Shadow | `shadowOffset/Opacity/Radius` + `elevation` | `box-shadow` |
| Applied via | `style={clay({...})}` | `style={clay({...})}` |

`shade()` is byte-identical in both and has tests — do not fork it.

---

## 3. `shade(hex, amount)`

Blends toward white (`> 0`) or black (`< 0`). `-0.05` is a whisper; `-0.35` is a
clear step.

```ts
shade(colors.surface, -0.05)   // a button sitting on a panel
shade(colors.surface, -0.12)   // a recessed track
shade(paperBg,        -0.12)   // a tag chip on a sticky note
shade(paperBg,        -0.35)   // the sub-note count badge
```

Use it for **every** derived tone. It keeps hue and saturation consistent across
both schemes, which a hand-picked hex will not.

---

## 4. Sticky notes

Note colours are **not** theme colours — they are paper, and they stay the same
in light and dark. `noteColors` in `shared/constants/tokens.ts`, keyed by
`NoteType`:

| Type | Paper |
|---|---|
| `idea` | `#FFF8BC` yellow |
| `task` | `#C8E6C9` green |
| `question` | `#BBDEFB` blue |
| `decision` | `#F8BBD0` pink |
| `reference` | `#E1BEE7` purple |
| `thought` | `#FFE0B2` orange |
| `summary` | `#B2EBF2` cyan |

```tsx
const scheme  = noteColors[note.type] || noteColors.idea;
const paperBg = note.color || scheme.bg;
// A user-picked colour can be any luminance, so derive ink from the paper
// rather than from the type.
const textColor = note.color ? readableTextOn(paperBg) : scheme.text;
```

Geometry: the peeled corner is `CURL` — **38** on a board note
(`StickyNoteItem`), **48** in the full editor (`NoteEditor`), because the fold
scales with the card. The cast shadow lives on **its own layer behind the
paper**: a shadow on the paper itself gets clipped by the fold.

---

## 5. Typography

Two families, and the choice is about script coverage, not taste.

| Family | Covers | Role |
|---|---|---|
| `ArchitectsDaughter` | Latin only | The hand-drawn Excalidraw look |
| `BalooBhaijaan2` | **Arabic + Latin** | Default, and always for Arabic |

**Mobile:** React Native does not do reliable per-glyph fallback — a missing
glyph is a box on Android. So the family is chosen per string by
`fontFor(text)` / `hasArabic(text)`, and all text goes through
`shared/ui/Text.tsx`. Never use bare `<Text>` from `react-native`.

**Web:** CSS inherits and falls back per character, so the stack does it:
Architects Daughter first, Baloo after. Arabic automatically lands on Baloo.

Either way: **mixed strings get the Arabic face**, because it carries Latin too.
The reverse drops glyphs.

Sizes in use: `19px/bold` screen titles, `16px/bold` note titles,
`14px` body, `13px` secondary, `11–12px` captions and hints.

---

## 6. Touch and interaction

- Minimum touch target **44px**. Toolbar buttons are 40px with `hitSlop`.
- Icons: `lucide-react-native` (mobile) / `lucide-react` (web). Same names.
  `size={17}` in toolbars, `18` in headers, `size={13–16}` inline,
  `strokeWidth={2.4–3}`.
- Icon colour: `colors.ink` when active, `colors.muted` when disabled,
  `colors.onAccent` on an accent background.
- `activeOpacity={0.8}` on `TouchableOpacity`; web uses `active:scale-95`.
- Every icon-only control needs `accessibilityLabel` (mobile) / `aria-label`
  **and** `title` (web).
- Honour `prefers-reduced-motion` on the web.

---

## 7. Writing a new component — checklist

- [ ] Colours from `useTheme().colors` or Tailwind tokens; **no hex literals**
- [ ] Surfaces via `clay()` / `clayAccent()` / `claySurface()`; no manual shadows
- [ ] Derived tones via `shade()`
- [ ] Text via `shared/ui/Text` (mobile) so the font rule applies
- [ ] Checked in **both** light and dark — they are different palettes, not inverses
- [ ] Touch targets ≥ 44px; accessible label on every icon-only control
- [ ] Inputs and tracks use `pressed: true`
- [ ] Long or user-supplied text: `numberOfLines` / `truncate`, and `dir="auto"`
      on the web so Arabic lays out correctly

## 8. Common mistakes

| Mistake | Instead |
|---|---|
| `backgroundColor: '#FBF6F0'` | `colors.surface` |
| A `shadowOffset` written by hand | `clay({ depth })` |
| `'#f0f0f0'` for a slightly darker panel | `shade(colors.surface, -0.05)` |
| Assuming accent is blue | It is **burnt orange** in light |
| Bare `<Text>` from `react-native` | `shared/ui/Text` |
| Deriving note ink from `note.type` when the user picked a colour | `readableTextOn(paperBg)` |
| A border on a card to show selection | An absolutely-positioned overlay ring — a border reflows the card and makes it twitch |
| Testing only in dark | Both, every time |

---

Related: `docs/IMPLEMENTATION_REFERENCE.md` for canvas geometry, entitlements
and the invariants behind the interaction layer.
