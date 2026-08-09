export interface Point {
  x: number;
  y: number;
}

export function worldToScreen(wx: number, wy: number, offset: Point, scale: number): Point {
  return {
    x: (wx + offset.x) * scale,
    y: (wy + offset.y) * scale,
  };
}

export function screenToWorld(sx: number, sy: number, offset: Point, scale: number): Point {
  return {
    x: sx / scale - offset.x,
    y: sy / scale - offset.y,
  };
}
