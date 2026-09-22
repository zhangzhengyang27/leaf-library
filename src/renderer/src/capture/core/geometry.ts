/**
 * 选区几何——全部为 display 本地逻辑坐标的纯函数（可单测）。
 */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}
export type Bounds = { width: number; height: number }
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type HitPart = Handle | 'move' | null
export type RatioAnchor = 'tl' | 'tr' | 'bl' | 'br'

export const MIN_RECT_SIZE = 8

/** 拖拽两点 → 正矩形（负宽高归一） */
export function normalizeRect(ax: number, ay: number, bx: number, by: number): Rect {
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    width: Math.abs(ax - bx),
    height: Math.abs(ay - by)
  }
}

export function clampRect(rect: Rect, bounds: Bounds): Rect {
  const width = Math.min(Math.max(0, rect.width), bounds.width)
  const height = Math.min(Math.max(0, rect.height), bounds.height)
  const x = Math.min(Math.max(0, rect.x), bounds.width - width)
  const y = Math.min(Math.max(0, rect.y), bounds.height - height)
  return { x, y, width, height }
}

export function moveRect(rect: Rect, dx: number, dy: number, bounds: Bounds): Rect {
  return {
    ...rect,
    x: Math.min(Math.max(0, rect.x + dx), bounds.width - rect.width),
    y: Math.min(Math.max(0, rect.y + dy), bounds.height - rect.height)
  }
}

/** 键盘 Shift+方向键：调整右下角 */
export function resizeRect(rect: Rect, dw: number, dh: number, bounds: Bounds): Rect {
  return {
    ...rect,
    width: Math.min(Math.max(MIN_RECT_SIZE, rect.width + dw), bounds.width - rect.x),
    height: Math.min(Math.max(MIN_RECT_SIZE, rect.height + dh), bounds.height - rect.y)
  }
}

/** 比例锁定：ratio = 宽/高，anchor 为拖拽起点角（固定不动的一角） */
export function applyRatioLock(rect: Rect, ratio: number, anchor: RatioAnchor): Rect {
  if (!Number.isFinite(ratio) || ratio <= 0) return rect
  let width = rect.width
  let height = width / ratio
  if (height > rect.height) {
    height = rect.height
    width = height * ratio
  }
  let { x, y } = rect
  if (anchor === 'tr' || anchor === 'br') x = rect.x + rect.width - width
  if (anchor === 'bl' || anchor === 'br') y = rect.y + rect.height - height
  return { x, y, width, height }
}

/** 拖拽起点角（比例锁锚点）：start=按下点，end=当前点 */
export function ratioAnchor(start: { x: number; y: number }, end: { x: number; y: number }): RatioAnchor {
  const west = end.x < start.x
  const north = end.y < start.y
  if (west && north) return 'br'
  if (west) return 'tr'
  if (north) return 'bl'
  return 'tl'
}

export function hitHandle(px: number, py: number, rect: Rect, tol = 6): HitPart {
  if (rect.width < 1 || rect.height < 1) return null
  const left = Math.abs(px - rect.x) <= tol
  const right = Math.abs(px - (rect.x + rect.width)) <= tol
  const top = Math.abs(py - rect.y) <= tol
  const bottom = Math.abs(py - (rect.y + rect.height)) <= tol
  if (left && top) return 'nw'
  if (right && top) return 'ne'
  if (left && bottom) return 'sw'
  if (right && bottom) return 'se'
  if (left) return 'w'
  if (right) return 'e'
  if (top) return 'n'
  if (bottom) return 's'
  const inside = px > rect.x && px < rect.x + rect.width && py > rect.y && py < rect.y + rect.height
  return inside ? 'move' : null
}

/** 手柄拖拽：p 为鼠标逻辑坐标，rect 为当前选区 */
export function resizeByHandle(
  rect: Rect,
  handle: Handle,
  px: number,
  py: number,
  bounds: Bounds
): Rect {
  let { x, y, width, height } = rect
  if (handle.includes('w')) {
    const x2 = rect.x + rect.width
    x = Math.min(Math.max(0, px), x2 - MIN_RECT_SIZE)
    width = x2 - x
  }
  if (handle.includes('e')) {
    width = Math.min(Math.max(MIN_RECT_SIZE, px - rect.x), bounds.width - rect.x)
  }
  if (handle.includes('n')) {
    const y2 = rect.y + rect.height
    y = Math.min(Math.max(0, py), y2 - MIN_RECT_SIZE)
    height = y2 - y
  }
  if (handle.includes('s')) {
    height = Math.min(Math.max(MIN_RECT_SIZE, py - rect.y), bounds.height - rect.y)
  }
  return { x, y, width, height }
}
