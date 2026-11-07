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
