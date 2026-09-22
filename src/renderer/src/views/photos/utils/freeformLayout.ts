/**
 * F10：自由网格布局纯函数（对齐 Eagle 自由网格）。
 *
 * 新素材进入自由网格视图时没有保存过的摆放位置——用「首适配空位扫描」
 * 在现有占用之外自动找位置：从画布原点按 gap 步进行列扫描，找到第一个
 * 与全部已占矩形不相交的 (x, y)。O(新项数 × 候选点 × 已占数)，
 * 素材量级（数百）下足够快。
 */

export interface FreeformRect {
  x: number
  y: number
  w: number
  h: number
}

const GAP = 8
const COL_W = 176 // 基准卡宽 168 + 间距
const ROW_H = 8 // 行扫描步进（细粒度，保证紧凑）

function overlaps(a: FreeformRect, b: FreeformRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/**
 * 为无位置的素材生成摆放。existing：已有矩形（含已放置的同批项）；
 * heights：各项对应高度（宽固定 baseW）。返回逐项 (x, y)。
 */
export function autoPlace(
  heights: number[],
  existing: FreeformRect[],
  baseW = 168,
  canvasW = 1200
): Array<{ x: number; y: number }> {
  const occupied = [...existing]
  const out: Array<{ x: number; y: number }> = []
  for (const h of heights) {
    const rect: FreeformRect = { x: 0, y: 0, w: baseW, h }
    let placed = false
    for (let y = 0; !placed; y += ROW_H) {
      for (let x = 0; x + baseW <= canvasW; x += COL_W) {
        rect.x = x
        rect.y = y
        if (!occupied.some((o) => overlaps(rect, o))) {
          placed = true
          break
        }
        // 画布右缘外的候选点回退到行首换行（x 循环结束自然进入下一 y）
      }
      if (y > 100000) break // 兜底：异常输入防死循环
    }
    occupied.push({ ...rect })
    out.push({ x: rect.x, y: rect.y })
  }
  return out
}

/** 吸附到 8px 网格（⌥ 拖拽临时关闭由调用方处理） */
export function snap(v: number, grid = GAP): number {
  return Math.round(v / grid) * grid
}

/** 缩放范围钳制 */
export function clampScale(v: number, min = 0.2, max = 4): number {
  return Math.max(min, Math.min(max, v))
}
