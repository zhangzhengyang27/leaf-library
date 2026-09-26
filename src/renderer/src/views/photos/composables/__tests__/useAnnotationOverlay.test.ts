// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import {
  clientToImagePoint,
  normalizeDragRect,
  isRectTooSmall,
  atMsToPercent,
  useAnnotationOverlay
} from '../useAnnotationOverlay'
import { useAnnotationFocus } from '../useAnnotationFocus'
import { ANNOTATION_MIN_SIDE } from '@shared/annotations'

/**
 * M1 标注 overlay 的纯函数直打（实施计划 M1 纪律：坐标换算必须可单测）。
 * rect 存源图像素，显示层按 img 显示矩形比例换算——换算错了，阈值断言必红，
 * 所以这里把「任意 scale/pan 都成立」当成一等公民来测。
 */
describe('useAnnotationOverlay · 屏幕→源图像素换算（clientToImagePoint）', () => {
  const fitRect = { left: 100, top: 50, width: 500, height: 400 } // 适应窗口：源图 1000×800 → 一半

  it('适应窗口态：按显示矩形比例折算（比例 0.5）', () => {
    const p = clientToImagePoint(100 + 250, 50 + 200, fitRect, 1000, 800)
    expect(p.x).toBe(500)
    expect(p.y).toBe(400)
  })

  it('放大 + 平移后同样成立（100% 实际像素、显示矩形已平移出视口）', () => {
    // 源图 1000×800 以 1:1 显示、左上角平移到 (-300, -200)
    const rect = { left: -300, top: -200, width: 1000, height: 800 }
    const p = clientToImagePoint(0, 0, rect, 1000, 800) // 视口左上角落在图内 (300, 200)
    expect(p.x).toBe(300)
    expect(p.y).toBe(200)
  })

  it('出界钳回图内：拖出右边/上边不留负坐标与越界值', () => {
    const left = clientToImagePoint(fitRect.left - 50, fitRect.top + 100, fitRect, 1000, 800)
    expect(left.x).toBe(0)
    expect(left.y).toBe(200)
    const right = clientToImagePoint(fitRect.left + 900, fitRect.top + 9999, fitRect, 1000, 800)
    expect(right.x).toBe(1000)
    expect(right.y).toBe(800)
  })

  it('零尺寸不除零：显示矩形或自然尺寸不可用时退 0 点而不是 NaN', () => {
    expect(clientToImagePoint(10, 10, { left: 0, top: 0, width: 0, height: 0 }, 1000, 800)).toEqual(
      {
        x: 0,
        y: 0
      }
    )
    expect(clientToImagePoint(10, 10, fitRect, 0, 0)).toEqual({ x: 0, y: 0 })
  })
})

describe('useAnnotationOverlay · 拖拽矩形归一化（normalizeDragRect / isRectTooSmall）', () => {
  it('从右下往左上拖也归一化成 x/y 左上角、w/h 非负（任意方向圈注）', () => {
    expect(normalizeDragRect(800, 600, 200, 100)).toEqual({ x: 200, y: 100, w: 600, h: 500 })
    expect(normalizeDragRect(500, 500, 500, 500)).toEqual({ x: 500, y: 500, w: 0, h: 0 })
  })

  it('小于 ANNOTATION_MIN_SIDE（源图像素）的拖拽判小：点按与手抖不算框选', () => {
    expect(isRectTooSmall({ x: 0, y: 0, w: ANNOTATION_MIN_SIDE - 1, h: 300 })).toBe(true)
    expect(isRectTooSmall({ x: 0, y: 0, w: 300, h: ANNOTATION_MIN_SIDE - 1 })).toBe(true)
    expect(isRectTooSmall({ x: 10, y: 10, w: ANNOTATION_MIN_SIDE, h: ANNOTATION_MIN_SIDE })).toBe(
      false
    )
  })
})

describe('useAnnotationOverlay · 时间点→进度百分比（atMsToPercent）', () => {
  it('毫秒位置按秒折算成 0~100 的百分比', () => {
    expect(atMsToPercent(30_000, 120)).toBe(25)
    expect(atMsToPercent(0, 120)).toBe(0)
  })

  it('时长不可用（0 / NaN / 负）恒 0，由调用方决定不渲染刻度（对齐 09-26 NaN clamp 口径）', () => {
    expect(atMsToPercent(30_000, 0)).toBe(0)
    expect(atMsToPercent(30_000, Number.NaN)).toBe(0)
    expect(atMsToPercent(30_000, -5)).toBe(0)
  })

  it('越界值不硬造位置：负 atMs 与超时长都钳在 0~100', () => {
    expect(atMsToPercent(-100, 120)).toBe(0)
    expect(atMsToPercent(999_999, 120)).toBe(100)
  })
})

// ── 消费端收尾：检查器 ↔ overlay 选中联动（useAnnotationFocus 单例 + 接线）──

describe('useAnnotationFocus · 聚焦 id 单例', () => {
  it('set/clear 直接可用；模块级单例——两处 useAnnotationFocus() 拿到同一份状态', () => {
    const writer = useAnnotationFocus()
    const reader = useAnnotationFocus()
    expect(reader.activeAnnotationId.value).toBeNull()
    writer.setAnnotationFocus('anno-x')
    expect(reader.activeAnnotationId.value).toBe('anno-x')
    reader.clearAnnotationFocus()
    expect(writer.activeAnnotationId.value).toBeNull()
  })
})

describe('useAnnotationOverlay · 选中态 → 联动单例接线', () => {
  /** 一条带 rect 的标注（形状同 @shared/annotations 的 PhotoAnnotation） */
  const rectAnno = {
    id: 'anno-1',
    photoId: 'p1',
    body: 'logo 区',
    rect: { x: 10, y: 10, w: 100, h: 80 },
    createdAt: 0,
    updatedAt: 0
  }

  /** 最小 deps：imgEl 给 1:1 显示矩形（640×480 源图铺满），其余只够类型成立 */
  function makeOverlay(): ReturnType<typeof useAnnotationOverlay> {
    const fakeImg = {
      getBoundingClientRect: () =>
        ({
          left: 0,
          top: 0,
          width: 640,
          height: 480
        }) as unknown as DOMRect
    } as unknown as HTMLImageElement
    return useAnnotationOverlay(
      {
        photoId: () => 'p1',
        nat: () => ({ w: 640, h: 480 }),
        annotations: () => [rectAnno],
        imgEl: () => fakeImg,
        syncSignals: () => [],
        onRefresh: () => {}
      },
      ref<HTMLElement | null>(null)
    )
  }

  /** happy-dom 没有 PointerEvent 构造器也不影响：处理器只认 button/stopPropagation/clientX/Y */
  const fakePointer = (x = 0, y = 0): PointerEvent =>
    ({
      button: 0,
      clientX: x,
      clientY: y,
      // 处理器契约要求该方法存在；测试里不必真停传播，显式返回 undefined 免空函数体
      stopPropagation: () => undefined
    }) as unknown as PointerEvent

  it('点已有框（第一击）：选中并把 id 写进联动单例（检查器列表据此高亮）', () => {
    const overlay = makeOverlay()
    const focus = useAnnotationFocus()
    overlay.onBoxPointerDown(rectAnno, fakePointer())
    expect(overlay.selectedId.value).toBe('anno-1')
    expect(focus.activeAnnotationId.value).toBe('anno-1')
  })

  it('已选中再点：弹改词框，联动 id 保持不变', () => {
    const overlay = makeOverlay()
    const focus = useAnnotationFocus()
    overlay.onBoxPointerDown(rectAnno, fakePointer())
    overlay.onBoxPointerDown(rectAnno, fakePointer())
    expect(overlay.editor.value?.mode).toBe('update')
    expect(focus.activeAnnotationId.value).toBe('anno-1')
    overlay.closeEditor()
  })

  it('点空白开拖：取消选中并清掉联动 id（拖太小则什么都不留）', () => {
    const overlay = makeOverlay()
    const focus = useAnnotationFocus()
    overlay.onBoxPointerDown(rectAnno, fakePointer())
    expect(focus.activeAnnotationId.value).toBe('anno-1')
    // 在 (5,5) 按下 → 选中被取消、联动被清、开始拖拽；1 源图像素的拖拽判小，editor 不开
    overlay.onRootPointerDown(fakePointer(5, 5))
    expect(overlay.selectedId.value).toBeNull()
    expect(focus.activeAnnotationId.value).toBeNull()
    // 收掉拖拽（pointerup 落在 1px 外 = 太小），不把监听器和草稿框漏到下一条用例
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 6, clientY: 6 }))
    expect(overlay.editor.value).toBeNull()
    expect(overlay.draft.value).toBeNull()
  })
})
