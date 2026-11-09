/**
 * Layout constants for consistent mobile and desktop geometry.
 * Guaranteed contracts between header, dock, and viewport.
 */
export const APP_HEADER_HEIGHT = 56; // 56px per plan spec
export const CANVAS_DOCK_HEIGHT = 64; // 64px (64pt) per plan spec and TOOLBAR.md
export const MIN_TOUCH_TARGET = 44; // 44px min touch target (WCAG AAA / Apple HIG)
export const MIN_TEXT_SIZE = 14; // 14px minimum text size

export interface ViewportGeometry {
  width: number;
  height: number;
  safeAreaTop?: number;
  safeAreaBottom?: number;
}

/**
 * Computes vertical layout clearance between top header and bottom dock.
 * Returns true if header and dock have strictly positive separation (never overlap).
 */
export function checkHeaderDockClearance(viewport: ViewportGeometry): {
  headerBottom: number;
  dockTop: number;
  clearance: number;
  overlaps: boolean;
} {
  const safeTop = viewport.safeAreaTop ?? 0;
  const safeBottom = viewport.safeAreaBottom ?? 0;

  const headerBottom = APP_HEADER_HEIGHT + safeTop;
  const dockTop = viewport.height - (CANVAS_DOCK_HEIGHT + safeBottom);
  const clearance = dockTop - headerBottom;

  return {
    headerBottom,
    dockTop,
    clearance,
    overlaps: clearance <= 0,
  };
}
