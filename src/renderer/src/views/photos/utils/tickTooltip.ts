/**
 * M2 时间点笔记刻度 hover 浮层的定位纯函数（视频进度条 / 音频波形两处共用）。
 *
 * 为什么不用原生 title：rail 外层是 overflow-hidden 的预览容器，刻度贴近
 * 左右边缘（0% / 100%）时气泡被裁掉看不见。这里给刻度百分比 + 浮层自身
 * 渲染尺寸 + 边界尺寸，算出「相对 rail 左上角」的落点与翻转标志——
 * DOM 测量在组件层做（AnnotationTickRail.vue），换算抽出来单测直打。
 *
 * 坐标口径（一处换算处处复用）：
 *  - 输出 (left, top) 相对 rail 元素左上角，浮层 absolute 进 rail 即贴位；
 *  - 水平：理想居中（刻度点对浮层中线），越出 rail 边界时整体收进——
 *    贴左缘浮层左缘钳到 margin，贴右缘浮层右缘钳到 railWidth - margin；
 *  - 垂直：默认浮在刻度点上方，上方空间不足且下方够放时翻到刻度下方
 *    （两边都不够时保持上方——水平已收进，叠着也比截断强）。
 */

export interface TickTooltipGeom {
  /** 刻度点在 rail 内的横向位置（px） */
  tickX: number
  /** 刻度点在 rail 内的纵向位置（px，rail 垂直中心） */
  tickY: number
  /** rail 宽（px，水平收进的边界） */
  railWidth: number
  /** 浮层自身渲染宽（px） */
  tooltipWidth: number
  /** 浮层自身渲染高（px） */
  tooltipHeight: number
  /** 刻度点上方到裁剪容器顶部的可用空间（px；无裁剪容器可传 Infinity） */
  spaceAbove: number
  /** 刻度点下方到裁剪容器底部的可用空间（px；同上） */
  spaceBelow: number
  /** 浮层与刻度点的间距（px，默认 6） */
  gap?: number
  /** 容器边缘安全边距（px，默认 4） */
  margin?: number
}

export interface TickTooltipPlacement {
  /** 相对 rail 左上角的横向落点（px） */
  left: number
  /** 相对 rail 左上角的纵向落点（px） */
  top: number
  /** true = 上方空间不足，已翻到刻度下方 */
  flipVertical: boolean
  /** 水平收进方式：center 居中 / start 左缘贴左界 / end 右缘贴右界 */
  align: 'center' | 'start' | 'end'
}

const DEFAULT_GAP = 6
const DEFAULT_MARGIN = 4

/**
 * 算浮层落点。纯函数：不吃 DOM，Infinity 表示该方向无边界。
 */
export function placeTickTooltip(g: TickTooltipGeom): TickTooltipPlacement {
  const gap = g.gap ?? DEFAULT_GAP
  const margin = g.margin ?? DEFAULT_MARGIN

  // 垂直：默认在刻度点上方（bottom = tickY + gap），贴顶且下方够放才翻到下方
  const needH = g.tooltipHeight + gap + margin
  const flipVertical = g.spaceAbove < needH && g.spaceBelow >= needH
  const top = flipVertical ? g.tickY + gap : g.tickY - gap - g.tooltipHeight

  // 水平：理想居中，越界则整体收进（钳到 margin 内）
  const idealLeft = g.tickX - g.tooltipWidth / 2
  const minLeft = margin
  const maxLeft = Math.max(minLeft, g.railWidth - margin - g.tooltipWidth)
  const left = Math.min(Math.max(idealLeft, minLeft), maxLeft)
  const align: TickTooltipPlacement['align'] =
    idealLeft < minLeft ? 'start' : idealLeft > maxLeft ? 'end' : 'center'

  return { left, top, flipVertical, align }
}

/**
 * 刻度点 hover 提示的时间头（m:ss，与检查器 annotationStamp 同口径）。
 * 从 PhotoPreview 本地实现上移到这里，rail 组件与检查器外的地方共用。
 */
export function fmtMsPosition(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
