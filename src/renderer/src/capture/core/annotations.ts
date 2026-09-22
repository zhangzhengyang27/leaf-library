/**
 * 标注操作栈 + Canvas 重放——操作序列是单一事实源：
 * 编辑画布与导出（同一画布）都由 drawAnnotations 重放得出，undo/redo 只动指针。
 */
import type { Rect } from './geometry'

export type AnnotationTool = 'rect' | 'ellipse' | 'arrow' | 'pen' | 'text' | 'mosaic'

export interface AnnotationStyle {
  color: string
  strokeWidth: number
}

export type AnnotationOp =
  | { tool: 'rect'; style: AnnotationStyle; rect: Rect }
  | { tool: 'ellipse'; style: AnnotationStyle; rect: Rect }
  | { tool: 'arrow'; style: AnnotationStyle; from: { x: number; y: number }; to: { x: number; y: number } }
  | { tool: 'pen'; style: AnnotationStyle; points: Array<{ x: number; y: number }> }
  | { tool: 'text'; style: AnnotationStyle; at: { x: number; y: number }; text: string }
  | { tool: 'mosaic'; style: { cellSize: number }; rect: Rect }

export interface DrawOptions {
  /** 马赛克像素源：裁剪图 canvas（物理分辨率） */
  source: CanvasImageSource | null
  /** 物理/逻辑比（display.scaleFactor） */
  dpr: number
}

export class AnnotationHistory {
  private ops: AnnotationOp[] = []
  private index = -1

  /** push 落在指针之后（丢弃重做分支） */
  push(op: AnnotationOp): void {
    this.ops = this.ops.slice(0, this.index + 1)
    this.ops.push(op)
    this.index = this.ops.length - 1
  }

  undo(): AnnotationOp | null {
    if (this.index < 0) return null
    return this.ops[this.index--] ?? null
  }

  redo(): AnnotationOp | null {
    if (this.index >= this.ops.length - 1) return null
    return this.ops[++this.index] ?? null
  }

  get current(): AnnotationOp[] {
    return this.ops.slice(0, this.index + 1)
  }

  get canUndo(): boolean {
    return this.index >= 0
  }

  get canRedo(): boolean {
    return this.index < this.ops.length - 1
  }
}

export function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  op: AnnotationOp,
  opts: DrawOptions
): void {
  if (op.tool === 'mosaic') {
    if (!opts.source) return
    const { rect: r, style } = op
    const sx = Math.round(r.x * opts.dpr)
    const sy = Math.round(r.y * opts.dpr)
    const sw = Math.max(1, Math.round(r.width * opts.dpr))
    const sh = Math.max(1, Math.round(r.height * opts.dpr))
    const cell = Math.max(4, style.cellSize * opts.dpr)
    const tw = Math.max(1, Math.round(sw / cell))
    const th = Math.max(1, Math.round(sh / cell))
    const tmp = document.createElement('canvas')
    tmp.width = tw
    tmp.height = th
    const tctx = tmp.getContext('2d')
    if (!tctx) return
    tctx.drawImage(opts.source, sx, sy, sw, sh, 0, 0, tw, th)
    const prev = ctx.imageSmoothingEnabled
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(tmp, 0, 0, tw, th, r.x, r.y, r.width, r.height)
    ctx.imageSmoothingEnabled = prev
    return
  }

  const style = op.style
  ctx.save()
  ctx.strokeStyle = style.color
  ctx.fillStyle = style.color
  ctx.lineWidth = style.strokeWidth
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  if (op.tool === 'rect') {
    ctx.strokeRect(op.rect.x, op.rect.y, op.rect.width, op.rect.height)
  } else if (op.tool === 'ellipse') {
    ctx.beginPath()
    ctx.ellipse(
      op.rect.x + op.rect.width / 2,
      op.rect.y + op.rect.height / 2,
      Math.abs(op.rect.width / 2),
      Math.abs(op.rect.height / 2),
      0,
      0,
      Math.PI * 2
    )
    ctx.stroke()
  } else if (op.tool === 'arrow') {
    const { from, to } = op
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    const angle = Math.atan2(to.y - from.y, to.x - from.x)
    const head = 10 + style.strokeWidth * 2
    ctx.beginPath()
    ctx.moveTo(to.x, to.y)
    ctx.lineTo(to.x - head * Math.cos(angle - 0.45), to.y - head * Math.sin(angle - 0.45))
    ctx.lineTo(to.x - head * Math.cos(angle + 0.45), to.y - head * Math.sin(angle + 0.45))
    ctx.closePath()
    ctx.fill()
  } else if (op.tool === 'pen') {
    if (op.points.length < 2) {
      ctx.restore()
      return
    }
    ctx.beginPath()
    ctx.moveTo(op.points[0]!.x, op.points[0]!.y)
    for (const p of op.points.slice(1)) ctx.lineTo(p.x, p.y)
    ctx.stroke()
  } else if (op.tool === 'text') {
    const fontSize = 14 + style.strokeWidth * 3
    ctx.font = `${fontSize}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`
    const lineHeight = fontSize * 1.4
    op.text.split('\n').forEach((line, i) => ctx.fillText(line, op.at.x, op.at.y + i * lineHeight))
  }
  ctx.restore()
}

export function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  ops: AnnotationOp[],
  opts: DrawOptions
): void {
  for (const op of ops) drawAnnotation(ctx, op, opts)
}
