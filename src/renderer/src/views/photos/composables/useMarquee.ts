/**
 * useMarquee · 空白处拖拽框选（D-012，对齐 Eagle 橡皮筋多选）
 *
 * - 容器 pointerdown（左键、命中空白、pointerType=mouse）时启动
 * - 选框为容器内绝对定位 div；item 命中 = 视口矩形相交
 * - 几何缓存：拖拽开始时批量缓存 item 视口矩形，自动滚动后按 scrollTop 差量平移，
 *   避免每帧全量 getBoundingClientRect（大库性能红线）
 * - 贴边自动滚动：滚动容器取最近 overflow-y:auto 祖先
 * - 语义：无修饰键 = 替换选中；⌘/Ctrl = 起拖时选中集 ⊕ 命中集；
 *   拖拽中实时回调 onSelect；位移 < 3px 视为空白点击 = 清空选中
 */
import { onBeforeUnmount, ref, type Ref } from 'vue'

export interface MarqueeModifiers {
  metaKey: boolean
  ctrlKey: boolean
}

interface MarqueeOptions {
  /** 网格根元素（需 position:relative，选框挂载于此） */
  getContainer: () => HTMLElement | null
  /** 条目元素选择器 */
  itemSelector: string
  /** 条目 id 的 data-* 属性名（默认 photoId；028 标签管理复用处传 chipId） */
  idAttribute?: string
  /** 是否允许框选（trash 等视图返回 false） */
  enabled: () => boolean
  /** ⌘ 叠加语义的起拖基础选中集 */
  getBaseSelection: () => Iterable<string>
  /** 拖拽中/结束时的最终选中集回调 */
  onSelect: (ids: string[]) => void
}

interface CachedRect {
  id: string
  top: number
  bottom: number
  left: number
  right: number
}

export function useMarquee(options: MarqueeOptions): {
  marqueeActive: Ref<boolean>
  marqueeRect: Ref<{ x: number; y: number; w: number; h: number }>
  onPointerDown: (e: PointerEvent) => void
} {
  const marqueeActive = ref(false)
  /** 视口坐标系选框（position:fixed 渲染，自动滚动时不随内容漂移） */
  const marqueeRect = ref({ x: 0, y: 0, w: 0, h: 0 })

  let containerEl: HTMLElement | null = null
  let startX = 0
  let startY = 0
  let baseScrollTop = 0
  let cache: CachedRect[] = []
  let baseIds: Set<string> = new Set()
  let modifiers: MarqueeModifiers = { metaKey: false, ctrlKey: false }
  let moved = false
  let rafId = 0
  let scrollDir = 0

  function cacheRects(): void {
    const container = containerEl
    if (!container) return
    const items = container.querySelectorAll<HTMLElement>(options.itemSelector)
    const idAttr = options.idAttribute ?? 'photoId'
    cache = Array.from(items).map((el) => {
      const r = el.getBoundingClientRect()
      const id = el.dataset[idAttr] ?? ''
      return { id, top: r.top, bottom: r.bottom, left: r.left, right: r.right }
    })
  }

  /** 代码审查 S8：hitTest 直接遍历缓存矩形做差值比较，避免每帧 map 生成新对象数组 */
  function hitTest(x1: number, x2: number, y1: number, y2: number, delta: number): Set<string> {
    const hit = new Set<string>()
    for (const r of cache) {
      const top = r.top - delta
      const bottom = r.bottom - delta
      if (r.right >= x1 && r.left <= x2 && bottom >= y1 && top <= y2) hit.add(r.id)
    }
    return hit
  }

  /** 代码审查 S8：选中集 diff 后 emit，避免每帧全量替换触发整网格重渲染 */
  let lastEmitted: Set<string> | null = null
  function emitSelection(final: string[]): void {
    const s = new Set(final)
    if (lastEmitted && lastEmitted.size === s.size) {
      let same = true
      for (const id of s) {
        if (!lastEmitted.has(id)) {
          same = false
          break
        }
      }
      if (same) return
    }
    lastEmitted = s
    options.onSelect(final)
  }

  function applySelection(clientX: number, clientY: number): void {
    const x1 = Math.min(startX, clientX)
    const x2 = Math.max(startX, clientX)
    const y1 = Math.min(startY, clientY)
    const y2 = Math.max(startY, clientY)
    marqueeRect.value = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }

    const delta = containerEl ? containerEl.scrollTop - baseScrollTop : 0
    const hit = hitTest(x1, x2, y1, y2, delta)

    let final: string[]
    if (modifiers.metaKey || modifiers.ctrlKey) {
      // ⌘ 叠加：起拖选中集 ⊕ 命中集
      const xor = new Set(baseIds)
      for (const id of hit) {
        if (xor.has(id)) xor.delete(id)
        else xor.add(id)
      }
      final = [...xor]
    } else {
      final = [...hit]
    }
    emitSelection(final)
  }

  function onFrame(): void {
    const container = containerEl
    if (!container || !marqueeActive.value) return
    // rAF 天然节流：每帧只做一次命中计算 + diff emit
    if (moved) {
      if (scrollDir !== 0) container.scrollTop += scrollDir
      applySelection(lastX, lastY)
    }
    rafId = requestAnimationFrame(onFrame)
  }

  let lastX = 0
  let lastY = 0

  function onPointerMove(e: PointerEvent): void {
    if (!marqueeActive.value) return
    lastX = e.clientX
    lastY = e.clientY
    if (!moved && Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 2) moved = true

    // 贴边自动滚动（边缘 40px 渐速）
    const container = containerEl
    if (container) {
      const rect = container.getBoundingClientRect()
      const nearTop = e.clientY - rect.top
      const nearBottom = rect.bottom - e.clientY
      if (nearTop < 40 && container.scrollTop > 0) scrollDir = -Math.ceil((40 - nearTop) / 8)
      else if (nearBottom < 40) scrollDir = Math.ceil((40 - nearBottom) / 8)
      else scrollDir = 0
    }
  }

  function finish(): void {
    if (!marqueeActive.value) return
    marqueeActive.value = false
    scrollDir = 0
    cancelAnimationFrame(rafId)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
    // 空白点击（几乎未移动、无修饰键）= 清空选中
    if (!moved && !modifiers.metaKey && !modifiers.ctrlKey) options.onSelect([])
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || e.pointerType !== 'mouse') return
    if (!options.enabled()) return
    const container = containerEl
    if (!container) return
    const target = e.target as HTMLElement
    if (target.closest(options.itemSelector)) return // 条目上的按下交给条目逻辑

    containerEl = container
    startX = lastX = e.clientX
    startY = lastY = e.clientY
    baseScrollTop = container.scrollTop
    baseIds = new Set(options.getBaseSelection())
    modifiers = { metaKey: e.metaKey, ctrlKey: e.ctrlKey }
    moved = false
    marqueeRect.value = { x: 0, y: 0, w: 0, h: 0 }
    cacheRects()

    marqueeActive.value = true
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    rafId = requestAnimationFrame(onFrame)
  }

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
    cancelAnimationFrame(rafId)
  })

  return { marqueeActive, marqueeRect, onPointerDown }
}
