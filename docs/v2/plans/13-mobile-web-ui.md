# 13 Mobile web UI pass

## Goal
`apps/web` is comfortable on a phone. The owner tested at about 375 px wide and found: the design looks poor, Settings cannot be reached, and the header needs rework.

## Known root cause
`components/Sidebar.tsx` line 135 is `hidden lg:flex`, so below 1024 px the whole navigation, including Settings, disappears, and nothing replaces it. Read `components/AppShell.tsx` and `app/(app)/layout.tsx` first.

## Required
1. **Navigation under 1024 px:** a top header, 56 px plus the safe area, with the space name, a back button inside a space, and an avatar or menu button opening a sheet with Home, Spaces, Plans, Credits, API keys, Settings and Sign out. Every destination reachable from the desktop sidebar must be reachable on mobile in at most two taps.
2. **Header:** one consistent component for all `(app)` pages. Title truncates, actions never wrap or overflow, `position: sticky`, RTL mirrored.
3. **Canvas pages:** follow `docs/v2/TOOLBAR.md`, mobile section. The bottom dock from `CanvasMobileDock.tsx` must not collide with the header, the sheet, the keyboard or the iOS home bar. Remove any overlap between `CanvasModeRail`, `CanvasViewBar` and the dock on small screens.
4. **Every page** under `app/` at 360, 390 and 768 px wide: no horizontal scrolling, text at least 14 px, tap targets at least 44 by 44 px, forms usable with the keyboard open, modals become bottom sheets.
5. Keep the existing visual language (`shared/theme`, clay styles). Do not redesign desktop.

## Rules
- Do not launch or attach to any browser. Verify with component tests using React Testing Library at those widths, plus `npm run build -w @mindspace/web`.
- Add a test asserting Settings is reachable on mobile, and that the dock and header do not overlap, using computed layout or class contracts.
- List every page you checked, and what you changed on each, under `notes`.

## Acceptance checks
```
docker compose run --rm dev npm run typecheck -w @mindspace/web
docker compose run --rm dev npm test -w @mindspace/web
docker compose run --rm dev npm run build -w @mindspace/web
```

## Decisions
- Unified mobile navigation under `<AppHeader>` (56px + safe-area top) and `<MobileNavSheet>` (reachable in $\le 2$ taps from any page via avatar button).
- Positioned `<CanvasMobileDock>` at bottom (64px + safe-area bottom), hiding automatically when the virtual keyboard is active to maximize visible editing area.
- Converted modal dialogs (`CreateSpaceModal`, `ColorPicker`) into bottom sheets on mobile viewports (`rounded-t-3xl sm:rounded-3xl`, `items-end sm:items-center`).
- All inputs on mobile use `text-base` ($\ge 16$ px) to prevent iOS Safari auto-zooming.

## Notes
Every page under `apps/web/src/app` was reviewed and updated for 360 px, 390 px, and 768 px viewports:
- **`app/(app)/settings/page.tsx`**: Replaced ad-hoc header with `<AppHeader title="Settings" showBack />`. Upgraded typography from `text-xs` to `text-sm`, ensured appearance controls and account buttons have $\ge 44$ px touch targets.
- **`app/(app)/credits/page.tsx`**: Replaced custom header with `<AppHeader title="Credits & billing" showBack actions={<SignOutButton />} />`. Upgraded ledger entries to `min-h-[48px]`, text to `text-sm`, and "Get monthly credits" button to $\ge 44$ px height.
- **`app/(app)/plans/page.tsx`**: Replaced custom header with `<AppHeader title="Plans" showBack />`. Upgraded status/loading typography to `text-sm`, verified plan cards and payment sheet mobile bottom sheet presentation.
- **`app/(app)/keys/page.tsx`**: Replaced custom header with `<AppHeader title="Your API keys" showBack />`. Upgraded provider selector and key removal buttons to `min-h-[44px]`, helper text from `text-[12px]`/`text-xs` to `text-sm`.
- **`app/(app)/space/[id]/page.tsx`** & **`CanvasRoot` / `CanvasToolbar` / `CanvasViewBar`**: Removed overlapping fixed top buttons in `CanvasRoot`. Moved mobile canvas title and undo/redo into `<AppHeader>` inside `CanvasViewBar`. Hid desktop `CanvasModeRail` on `< 1024px`, rendered `CanvasMobileDock` (64px + safe-area) with touch targets $\ge 44\times 44$ px, raised `+` create button, and auto-hide on virtual keyboard focus.
- **`app/(app)/space/[id]/mind-map/page.tsx`**: Verified clearance with `AppHeader` and bottom dock.
- **`app/(app)/note/[id]/page.tsx`** & **`NoteEditor.tsx`**: Made header sticky (`sticky top-0 z-30 pt-[calc(12px+env(safe-area-inset-top,0px))]`), increased back and toolbar buttons to `min-h-[44px] min-w-[44px] h-11 w-11`, added `rtl:rotate-180` to back chevron, type strip buttons to `min-h-[44px]`, sub-note input to `text-base`, and text to `text-sm`.
- **`app/(app)/page.tsx` (Notes list / Home)**: Delegated `NotesHeader` to `<AppHeader>`, updated `ViewTabs`, `WeekStrip`, and `CalendarPane` targets to $\ge 44$ px, ensured `RecordFab` respects bottom safe area.
- **`app/(auth)/sign-in/page.tsx`** & **`LoginForm` / `RegisterForm`**: Upgraded switch links and forgot-password buttons to `min-h-[44px] flex items-center justify-center`. Form inputs use `text-base` (16px).
- **`app/(app)/record/page.tsx`**: Verified voice recording view, touch targets $\ge 44$ px, sticky controls, safe area insets.
- **Testing**: Added `mobileNavigation.test.tsx` verifying Settings reachable in $\le 2$ taps, all 7 navigation destinations in `MobileNavSheet`, `AppHeader` contracts, `CanvasMobileDock` 64px contract, `CreateSpaceModal` bottom sheet contract, and header-dock clearance across 360, 390, and 768 px viewports. All 13 test suites (138 tests), typecheck, and Next.js production build pass with 0 errors.
