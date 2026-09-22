import { describe, expect, it, vi } from 'vitest'
import { AnnotationHistory, drawAnnotation, type AnnotationOp } from '../annotations'

describe('AnnotationHistory', () => {
  const op = (n: number): AnnotationOp => ({
    tool: 'rect',
    style: { color: '#f00', strokeWidth: 2 },
    rect: { x: 0, y: 0, width: n, height: n }
  })
  const rectWidth = (o: AnnotationOp | null): number => (o && 'rect' in o ? o.rect.width : -1)
  it('push/undo/redo 指针语义', () => {
    const h = new AnnotationHistory()
    expect(h.canUndo).toBe(false)
    h.push(op(1))
    h.push(op(2))
    expect(h.current).toHaveLength(2)
    expect(rectWidth(h.undo())).toBe(2)
    expect(h.current).toHaveLength(1)
    expect(rectWidth(h.redo())).toBe(2)
    expect(h.canRedo).toBe(false)
  })
  it('undo 后 push 丢弃重做分支', () => {
    const h = new AnnotationHistory()
    h.push(op(1))
    h.push(op(2))
    h.undo()
    h.push(op(3))
    expect(h.current.map((o) => ('rect' in o ? o.rect.width : -1))).toEqual([1, 3])
    expect(h.canRedo).toBe(false)
  })
  it('空栈 undo/redo 返回 null', () => {
    const h = new AnnotationHistory()
    expect(h.undo()).toBeNull()
    expect(h.redo()).toBeNull()
  })
})

describe('drawAnnotation', () => {
  const makeCtx = (): CanvasRenderingContext2D => {
    return {
      strokeRect: vi.fn(),
      ellipse: vi.fn(),
      stroke: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      closePath: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(),
      setTransform: vi.fn(),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      lineJoin: '',
      lineCap: '',
      font: '',
      imageSmoothingEnabled: true,
      setLineDash: vi.fn()
    } as unknown as CanvasRenderingContext2D
  }
  const style = { color: '#123456', strokeWidth: 4 }

  it('rect → strokeRect', () => {
    const ctx = makeCtx()
    drawAnnotation(ctx, { tool: 'rect', style, rect: { x: 1, y: 2, width: 3, height: 4 } }, { source: null, dpr: 2 })
    expect(ctx.strokeRect).toHaveBeenCalledWith(1, 2, 3, 4)
  })
  it('ellipse → ellipse', () => {
    const ctx = makeCtx()
    drawAnnotation(ctx, { tool: 'ellipse', style, rect: { x: 1, y: 2, width: 3, height: 4 } }, { source: null, dpr: 2 })
    expect(ctx.ellipse).toHaveBeenCalled()
  })
  it('arrow → 线条 + 实心箭头', () => {
    const ctx = makeCtx()
    drawAnnotation(ctx, { tool: 'arrow', style, from: { x: 0, y: 0 }, to: { x: 10, y: 0 } }, { source: null, dpr: 2 })
    expect(ctx.stroke).toHaveBeenCalled()
    expect(ctx.fill).toHaveBeenCalled()
  })
  it('pen → 折线', () => {
    const ctx = makeCtx()
    drawAnnotation(
      ctx,
      { tool: 'pen', style, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 9, y: 1 }] },
      { source: null, dpr: 2 }
    )
    expect(ctx.lineTo).toHaveBeenCalledTimes(2)
  })
  it('text → fillText（多行拆分）', () => {
    const ctx = makeCtx()
    drawAnnotation(ctx, { tool: 'text', style, at: { x: 5, y: 5 }, text: '你好\n世界' }, { source: null, dpr: 2 })
    expect(ctx.fillText).toHaveBeenCalledTimes(2)
    expect(ctx.fillText).toHaveBeenNthCalledWith(1, '你好', 5, 5)
  })
})
