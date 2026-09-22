/**
 * Leaf · Trackpad / 触控板手势
 *
 * 设计：仿 macOS Safari 原生体验
 * - 双指水平 swipe（accumulated deltaX）：
 *   - 向左滑（deltaX < 0）→ back（history.back），对应 macOS「回到上一页」
 *   - 向右滑（deltaX > 0）→ forward（history.forward），对应 macOS「去下一页」
 * - wheel 监听 passive=true，不阻塞主线程滚动
 *
 * 约束：
 * - threshold = 60 像素（防止抖动手势误触；mouse wheel deltaX 通常远大于 trackpad）
 * - cooldown = 350ms（连续触发节流）
 * - MAX_INTERVAL_MS = 200ms：超过视为新手势（累加器清零）
 */

const DEFAULT_THRESHOLD = 60
const DEFAULT_COOLDOWN_MS = 350
const MAX_INTERVAL_MS = 200

interface GestureOptions {
  threshold?: number
  cooldownMs?: number
}

interface GestureState {
  accum: number
  lastEventTs: number
  lastFiredAt: number
}

/**
 * 在 target 上挂 swipe handler。
 *
 * - onSwipeLeft：向左滑动触发（deltaX 累计 < 0 达到阈值）
 * - onSwipeRight：向右滑动触发（deltaX 累计 > 0 达到阈值）
 *
 * 返回卸载函数。
 */
export function installTrackpadSwipe(
  target: HTMLElement | Window,
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
  opts: GestureOptions = {}
): () => void {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD
  const cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS

  const state: GestureState = { accum: 0, lastEventTs: 0, lastFiredAt: 0 }

  const handler: EventListener = (event) => {
    const e = event as WheelEvent

    // 仅横向滚动；竖向滚动由浏览器接管（避免误吞）
    if (Math.abs(e.deltaX) <= 0) return

    const now = performance.now()

    // 间隔过长 → 视为新手势，累加器清零
    if (now - state.lastEventTs > MAX_INTERVAL_MS) {
      state.accum = 0
    }
    state.lastEventTs = now
    state.accum += e.deltaX

    if (Math.abs(state.accum) < threshold) return

    // cooldown 内不重复触发；触发后清零累加器
    if (now - state.lastFiredAt < cooldownMs) {
      state.accum = 0
      return
    }

    if (state.accum > 0) {
      onSwipeRight()
    } else {
      onSwipeLeft()
    }
    state.lastFiredAt = now
    state.accum = 0
  }

  target.addEventListener('wheel', handler, { passive: true })
  return () => {
    target.removeEventListener('wheel', handler)
  }
}
