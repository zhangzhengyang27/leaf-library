/**
 * 标注 comments[] 的形状与上限（主进程与渲染层共用一份）
 *
 * 为什么这份必须存在而不是各写一遍：标注的输入路径是"渲染层报数字、主进程落库"，
 * 上限与合法性只要有一侧松，就会出现界面能填进去、存下去直接崩 CHECK 的情况
 * （本模块在枚举/路径参数上已经栽过三次，见 memory 里的 IPC 信任边界）。
 * 校验函数放在这里，主进程拿它做唯一入口判据，渲染层拿它做即时反馈——同一个函数。
 *
 * 两种形状（对齐 Eagle）：
 *  - 图片区域批注：`rect` 四个数都有（源图像素坐标），且宽高不小于 10；
 *  - 时间点笔记：`atMs` 一个非负整数（视频/音频的毫秒位置）；
 *  - 都没有 = 整条素材级批注（代码/文档类也就能用这种，overlay 才有前两种）。
 */

export interface AnnotationRect {
  x: number
  y: number
  w: number
  h: number
}

export interface PhotoAnnotation {
  id: string
  photoId: string
  body: string
  rect?: AnnotationRect
  atMs?: number
  createdAt: number
  updatedAt: number
}

/** 正文长度上限：一条批注不是文档，超了直接拒而不是截断（截断会让用户以为存下了全文） */
export const ANNOTATION_BODY_MAX = 2_000
/** Eagle 的矩形最小 10×10（再小就是一个点，画出来无法命中） */
export const ANNOTATION_MIN_SIDE = 10
/** 坐标上界：源图不可能有 10 万像素，出现这种值就是传错了而不是"很大" */
export const ANNOTATION_MAX_COORD = 100_000
/** 单条素材最多多少条标注（挡住脚本一把灌进来） */
export const ANNOTATION_MAX_PER_PHOTO = 200

/** 归一化后的可入库载荷（校验通过才有 value） */
export interface AnnotationInput {
  body: string
  rect?: AnnotationRect
  atMs?: number
}

export type AnnotationCheck = { ok: true; value: AnnotationInput } | { ok: false; error: string }

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * 校验并归一化一条标注的输入。
 *
 * 只认 `null`/`undefined` 为"没有该字段"；数字必须是有限实数——
 * `Infinity` 与 `NaN` 进 SQLite 的 REAL 是能存进去的，读出来才发现坏了就晚了。
 */
export function normalizeAnnotationInput(raw: unknown): AnnotationCheck {
  if (typeof raw !== 'object' || raw === null) return fail('标注内容不合法')
  const o = raw as Record<string, unknown>

  const rawBody = typeof o.body === 'string' ? o.body.trim() : ''
  if (!rawBody) return fail('标注内容不能为空')
  if (rawBody.length > ANNOTATION_BODY_MAX)
    return fail(`标注内容最长 ${ANNOTATION_BODY_MAX} 字（当前 ${rawBody.length}）`)

  const hasRect = o.rect !== null && o.rect !== undefined
  const hasAt = o.atMs !== null && o.atMs !== undefined
  if (hasRect && hasAt) return fail('区域批注与时间点笔记不能同时给')

  const out: AnnotationInput = { body: rawBody }

  if (hasRect) {
    const r = o.rect as unknown
    if (typeof r !== 'object' || r === null) return fail('区域坐标格式不对')
    const { x, y, w, h } = r as Record<string, unknown>
    if (![x, y, w, h].every(isFiniteNumber)) return fail('区域坐标必须是有限数字')
    if ((x as number) < 0 || (y as number) < 0) return fail('区域坐标不能为负')
    if ((w as number) < ANNOTATION_MIN_SIDE || (h as number) < ANNOTATION_MIN_SIDE)
      return fail(`区域最小要 ${ANNOTATION_MIN_SIDE}×${ANNOTATION_MIN_SIDE} 像素`)
    if (
      (x as number) > ANNOTATION_MAX_COORD ||
      (y as number) > ANNOTATION_MAX_COORD ||
      (w as number) > ANNOTATION_MAX_COORD ||
      (h as number) > ANNOTATION_MAX_COORD
    )
      return fail('区域坐标超出合理范围')
    out.rect = { x, y, w, h } as AnnotationRect
  }

  if (hasAt) {
    const at = o.atMs as unknown
    if (!isFiniteNumber(at) || at < 0) return fail('时间点必须是非负毫秒')
    out.atMs = Math.round(at)
  }

  return { ok: true, value: out }
}

function fail(error: string): AnnotationCheck {
  return { ok: false, error }
}

/** id 形状：库里都是 uuid，外部递进来的任何东西先按这个筛一遍 */
export const ANNOTATION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isAnnotationIdLike(value: unknown): value is string {
  return typeof value === 'string' && ANNOTATION_ID_RE.test(value)
}
