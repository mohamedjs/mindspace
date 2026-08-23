# 05 — UI: React Native → DOM

## 5.1 Primitive translation

| React Native | Web | Notes |
|---|---|---|
| `<View>` | `<div>` | RN defaults to `display: flex; flex-direction: column`. **A `<div>` does not.** See §5.2 |
| `<Text>` | `<span>` / `<p>` / heading | See §5.4 — this app has a custom `<Text>` |
| `<TouchableOpacity>` | `<button type="button">` | Add `:active { opacity: .85 }` to match `activeOpacity`. **Always a real `<button>`** — keyboard and screen-reader support come free |
| `<Pressable>` | `<button>` | |
| `<TextInput>` | `<input>` / `<textarea>` | `multiline` → `<textarea>`; `secureTextEntry` → `type="password"`; `placeholderTextColor` → `::placeholder` |
| `<ScrollView>` | `<div class="overflow-y-auto">` | |
| `<FlatList>` | `.map()` over a `<div>` | Lists here are small (ledger, recordings, spaces). Only virtualise if a real user hits thousands of rows |
| `<Switch>` | `<input type="checkbox" role="switch">` styled | |
| `<ActivityIndicator>` | A CSS spinner | One shared component |
| `<Modal>` | `<dialog>` | See §5.6 |
| `<SafeAreaView>` | `padding: env(safe-area-inset-*)` | Only matters as an installed PWA |
| `Alert.alert(title, msg, buttons)` | A confirm dialog component | **Do not use `window.confirm`** — it cannot be styled and blocks the main thread. ~6 call sites, all destructive confirmations |
| `Dimensions.get('window')` | `useWindowDimensions` hook you write, or CSS | |
| `Platform.OS` | Delete the branch — you are always web | |
| `hitSlop={12}` | Padding on the button plus a negative margin, or `::before` overlay | Touch targets must stay ≥ 44px |

## 5.2 The flexbox trap — read this before writing any component

React Native's `<View>` is `display: flex; flex-direction: column;
align-items: stretch; flex-shrink: 0` by default. A `<div>` is `display: block`.

Every NativeWind class string in this codebase was written against the RN
default. `className="flex-1"` on a `<View>` works; on a `<div>` it does nothing
unless the parent is a flex container and the div is a flex item.

**Two options. Pick one and be consistent:**

**(a) A base layer in `globals.css`** — closest to the original, least diff:

```css
@layer base {
  .rn { display: flex; flex-direction: column; align-items: stretch; flex-shrink: 0; }
}
```
…then every ported `<View>` becomes `<div className="rn …">`. Ugly but the
existing class strings survive untouched.

**(b) Add `flex flex-col` explicitly** wherever the original relied on the
default. More idiomatic web, more edits, more chances to miss one.

Recommendation: **(a)**, because it makes the port mechanical and reviewable. A
missed `flex flex-col` produces a subtly wrong layout that nobody notices until
a user does.

Also remember: `className="flex-row"` in NativeWind is `flex-row` in Tailwind
too, but it does **not** imply `display: flex` on a div. Under (a) it does,
because `.rn` already set it.

## 5.3 Claymorphism → CSS

The entire visual language is `clay()` in `src/shared/theme/clay.ts`. Port the
maths exactly. Reference output:

```ts
clay({ color, radius = 22, pressed = false, depth = 1 })
```

| RN property | Value | CSS equivalent |
|---|---|---|
| `backgroundColor` | `color` | `background: <color>` |
| `borderRadius` | `radius` | `border-radius: <radius>px` |
| `borderWidth` | `1.5` | `border-width: 1.5px` |
| `borderTopColor` | `shade(color, pressed ? -0.16 : 0.28)` | `border-top-color` |
| `borderLeftColor` | `shade(color, pressed ? -0.10 : 0.18)` | `border-left-color` |
| `borderRightColor` | `shade(color, pressed ? 0.10 : -0.12)` | `border-right-color` |
| `borderBottomColor` | `shade(color, pressed ? 0.18 : -0.20)` | `border-bottom-color` |
| shadow | offset-y `pressed ? 1 : 8*depth`, opacity `pressed ? .08 : .18*depth`, radius `pressed ? 2 : 16*depth` | `box-shadow: 0 Ypx Bpx rgba(0,0,0,A)` |

```ts
// web/src/shared/theme/clay.ts
export function clay({ color, radius = 22, pressed = false, depth = 1 }: ClayOptions): React.CSSProperties {
  const y = pressed ? 1 : 8 * depth;
  const blur = pressed ? 2 : 16 * depth;
  const alpha = pressed ? 0.08 : 0.18 * depth;

  return {
    background: color,
    borderRadius: radius,
    borderWidth: 1.5,
    borderStyle: 'solid',
    // Light catches the top edge on a raised object and the bottom edge on a
    // hollow one — that inversion is what sells "pressed in".
    borderTopColor:    shade(color, pressed ? -0.16 : 0.28),
    borderLeftColor:   shade(color, pressed ? -0.10 : 0.18),
    borderRightColor:  shade(color, pressed ?  0.10 : -0.12),
    borderBottomColor: shade(color, pressed ?  0.18 : -0.20),
    boxShadow: `0 ${y}px ${blur}px rgba(0,0,0,${alpha})`,
  };
}
```

**Keep `shade()` byte-for-byte** and keep `color.test.ts` passing — it is used
far beyond clay (surface tints, pressed states, disabled states).

`clayAccent(colors, radius)` = `clay({ color: colors.accent, radius, depth: 1.2 })`.
`claySurface(colors, radius)` = `clay({ color: colors.surface, radius })`.

> **Web bonus, optional:** the RN comment explains that inner lighting is faked
> with asymmetric borders because RN has no cross-platform inset shadow. The web
> *does* have `box-shadow: inset`. **Do not use it on the first pass.** Match the
> native look exactly, then consider refining it as a separate change with
> before/after screenshots.

## 5.4 The `<Text>` component

`src/shared/ui/Text.tsx` exists because **React Native does not inherit
`fontFamily`**, so every text node has to carry it. It picks:

- **Arabic script → Baloo Bhaijaan 2, always**, regardless of the hand-drawn
  toggle. That is about script coverage, not aesthetics.
- Otherwise: Architects Daughter when the hand-drawn toggle is on, else the
  default.

**On the web, CSS inherits `font-family`, so most of this component's reason to
exist disappears.** But the Arabic rule does not.

Correct web approach:

```css
:root      { --font-body: var(--font-ui); }
:root[data-hand="1"] { --font-body: var(--font-hand); }
body { font-family: var(--font-body), var(--font-ui), system-ui, sans-serif; }
```

Set `data-hand` alongside `data-theme`. Then list Baloo **after** Architects
Daughter in the stack: Architects Daughter has no Arabic glyphs, so the browser
falls back per-character and Arabic automatically renders in Baloo. That
reproduces `hasArabic()` behaviour with zero JavaScript.

Keep `fonts.ts` and `fonts.test.ts` — `hasArabic()` is still useful for
`dir="rtl"` decisions (see §5.9).

**Do not** ship a `<Text>` wrapper on every string. Use semantic elements.

## 5.5 Component inventory — all 35

| RN component | Web plan | Difficulty |
|---|---|---|
| **shared/ui** | | |
| `Text.tsx` | Delete; CSS inheritance (§5.4) | trivial |
| `ThemedToast.tsx` | `sonner` `<Toaster>` styled with theme vars. *(Has 3 pre-existing tsc errors — do not port them)* | easy |
| `RecordFab.tsx` | Fixed-position round button | easy |
| **theme** | | |
| `ThemeToggle.tsx` | 3-way segmented control | easy |
| **account** | | |
| `LoginForm.tsx` | `<form>` + `<input>` | easy |
| `RegisterForm.tsx` | Same, **three fields incl. full name** | easy |
| **credits** | | |
| `CreditChip.tsx` | Button showing the number only, no "EGP" | trivial |
| `OutOfCreditsSheet.tsx` | Sheet → `/plans` | easy |
| **ai** | | |
| `ModelPicker.tsx` | `<select>` or listbox; filters by BYOK providers | medium |
| **billing** | | |
| `PlanCard.tsx` | Two body variants (BYOK vs credits) — see `04` §4.6 | easy |
| `PaymentMethodSheet.tsx` | Channel list, disabled when `!isConfigured` | easy |
| **byok** | *(no components; the screen is the UI)* | |
| **notes-list** (already well decomposed — port 1:1) | | |
| `NotesListView.tsx` | Shell | easy |
| `NotesHeader.tsx` | Space name, credit chip, settings | easy |
| `ViewTabs.tsx` | List / Calendar tabs | trivial |
| `ListPane.tsx` | Day-grouped list | easy |
| `CalendarPane.tsx` | Month header + day detail | medium |
| `WeekStrip.tsx` | Horizontal week scroller | medium |
| `NoteListRow.tsx` | Shared row (list + calendar) | easy |
| `FreeDayEmptyState.tsx` | Empty state | trivial |
| **sticky-notes** | | |
| `StickyNoteItem.tsx` | **Hard** — drag, tap, long-press, lift animation. See `06` §6.4 | **hard** |
| `NoteEditor.tsx` | Full-screen editor, two microphones | medium |
| `NoteActionSheet.tsx` | Type / colour / delete | easy |
| `ColorPicker.tsx` | See §5.7 | easy |
| `PushPin.tsx` | Decorative SVG | trivial |
| `PeelFlap.tsx` | Folded-corner SVG/CSS | easy |
| **voice** | | |
| `RecordScreen.tsx` | Timer, waveform, stop, plan cap | medium |
| `MicButton.tsx` | The big record button | easy |
| `Waveform.tsx` | Live level bars — see `07` §7.3 | medium |
| `RecordingsSheet.tsx` | Recordings + status | easy |
| **canvas** | | |
| `CanvasRoot.tsx` | **Hardest.** See `06` | **hard** |
| `CanvasBackground.tsx` | Grid sheet + orbs, SVG | medium |
| `CanvasToolbar.tsx` | 6-tool strip | easy |
| `NoteConnectors.tsx` | SVG curves parent→child | medium |
| `NoteGroupFrame.tsx` | Titled, draggable, resizable frame | **hard** |
| `SpacesSheet.tsx` | Space switcher / CRUD. **Mobile only once `11` §11.2 lands** — the desktop sidebar replaces it | easy |

New components, not ports — see `11`:

| New component | Purpose | Difficulty |
|---|---|---|
| `ArrowTool` / rubber-band layer | Draw a parent→child link (`11` §11.1) | medium |
| `Sidebar` + `AppShell` | Desktop navigation (`11` §11.2) | medium |

Roughly: 12 trivial/easy-trivial, 14 easy, 5 medium, 3 hard. The three hard ones
are all in `06`.

## 5.6 Sheets and modals

Four bottom sheets use `@gorhom/bottom-sheet`: `SpacesSheet`,
`RecordingsSheet`, `NoteActionSheet`, `OutOfCreditsSheet`, plus
`PaymentMethodSheet`.

Use the native `<dialog>` element with `showModal()`:

- Free focus trap, `Escape` to close, backdrop via `::backdrop`, top-layer
  stacking (no `z-index` fights with the canvas).
- Animate in with a CSS transition on `translateY` + `@starting-style`.
- On desktop, render them as **centred modals**, not bottom sheets. A bottom
  sheet on a 1440px monitor is a phone app in a browser. Use a media query:
  bottom-anchored under 768px, centred above.

Do not install a modal library for five dialogs.

## 5.7 Colour picker

`reanimated-color-picker` gives a full HSV wheel, but the app only ever assigns
colours from the sticky-note palette — the AI picks from a fixed set and the
user picks from swatches.

**Replace it with a grid of swatch buttons.** Read the palette from wherever
`ColorPicker.tsx` currently sources it. Do not port a colour wheel for a
seven-swatch picker.

## 5.8 Icons

`lucide-react-native` → `lucide-react`. Same names, same `size` / `color` /
`strokeWidth` props. Icons in use include: `Mic`, `Settings`, `ChevronLeft`,
`Check`, `Pencil`, `Sparkles`, `StickyNote`, `Frame`, `LayoutGrid`, `Scan`.
The import path is the only change.

## 5.9 Things the web gets that RN did not — and must not regress

| Concern | Requirement |
|---|---|
| **Keyboard** | Every action reachable by keyboard. Real `<button>`s, visible `:focus-visible` rings, `Escape` closes dialogs |
| **Responsive** | Design for 375px **and** 1440px. The canvas toolbar, sheets and note editor all assume a phone today |
| **RTL** | Arabic is a first-class language here. At minimum set `dir="auto"` on note title and content elements so Arabic notes lay out correctly. Full app-level RTL is a follow-up — record it in `10-open-questions.md` |
| **Text selection** | Disable it on the canvas (`user-select: none`) or dragging a note selects text across the board |
| **Right-click** | The canvas long-press opens a colour picker. On desktop, also wire `contextmenu` — and `preventDefault()` it on the canvas |
| **Scroll** | `overscroll-behavior: none` on the canvas, or a pan gesture triggers browser pull-to-refresh on mobile |
| **Zoom** | `touch-action: none` on the canvas so the browser does not steal pinch |
| **`prefers-reduced-motion`** | Honour it: skip the note lift-spring and connector animations |
