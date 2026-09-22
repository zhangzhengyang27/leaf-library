/**
 * Leaf · 主题切换（light / dark / auto）
 *
 * 持久化走主进程 preferences IPC：
 *   window.api.preferences.getTheme() / setTheme()
 *
 * 实际生效方式：设置 documentElement.dataset.theme。
 * - 'light' → 'light'
 * - 'dark' → 'dark'
 * - 'auto' → 由 prefers-color-scheme media query + 监听决定
 *
 * Tailwind dark: 类基于 documentElement.classList.contains('dark')，
 * 因此我们对 'dark' 加 .dark 类，'light'/'auto' 移除。
 *
 * v4 变更：
 * - 默认 'auto'（跟随系统），与主进程 PreferencesDataStore.getTheme() 一致
 * - 用户切换 / 系统外观变化时给 html 加 .theme-anim，让全局色彩平滑过渡
 *   （320ms 后移除，避免常驻全局 transition 的性能开销；尊重 prefers-reduced-motion）
 */

import { ref } from 'vue'

export type Theme = 'light' | 'dark' | 'auto'

// 默认跟随系统（v4 产品决策）：首次启动 initTheme() 会从主进程读到持久化值并覆盖这里。
const theme = ref<Theme>('auto')

const mql =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null

let animTimer: ReturnType<typeof setTimeout> | null = null

/** 切换动画：短暂开启全局色彩过渡，320ms 后摘除 */
function playThemeAnimation(): void {
  if (reducedMotion?.matches) return
  const html = document.documentElement
  html.classList.add('theme-anim')
  if (animTimer) clearTimeout(animTimer)
  animTimer = setTimeout(() => html.classList.remove('theme-anim'), 320)
}

function apply(t: Theme, animate = false): void {
  if (animate) playThemeAnimation()
  const html = document.documentElement
  if (t === 'dark') {
    html.classList.add('dark')
    html.dataset.theme = 'dark'
    return
  }
  if (t === 'light') {
    html.classList.remove('dark')
    html.dataset.theme = 'light'
    return
  }
  // auto
  const isDark = mql ? mql.matches : false
  html.classList.toggle('dark', isDark)
  html.dataset.theme = 'auto'
}

let inited = false

export function useTheme(): {
  theme: typeof theme
  setTheme: (t: Theme) => Promise<void>
  initTheme: () => Promise<void>
} {
  if (!inited && mql) {
    mql.addEventListener('change', () => {
      if (theme.value === 'auto') apply('auto', true)
    })
    // B4 修复：订阅主进程的主题广播，多窗口间保持一致。
    // 模块级单例 + inited 守卫，应用生命周期内只注册一次。
    try {
      const unsubThemeBroadcast = window.api.preferences.onThemeChanged((t) => {
        // 只在本地 theme 落后于广播时应用，避免自身 setTheme 的回声
        if (theme.value !== t) {
          theme.value = t
          apply(t, true)
        }
      })
      // 应用生命周期内不退订；保留引用语义即可
      void unsubThemeBroadcast
    } catch {
      /* preload 未更新时忽略 */
    }
    inited = true
  }

  const initTheme = async (): Promise<void> => {
    try {
      const t = await window.api.preferences.getTheme()
      theme.value = t
      apply(t) // 首次初始化不做过渡动画，避免启动时全屏闪变
    } catch {
      apply('auto')
    }
  }

  const setTheme = async (t: Theme): Promise<void> => {
    theme.value = t
    apply(t, true)
    try {
      await window.api.preferences.setTheme(t)
    } catch (e) {
      console.warn('[useTheme] persist failed:', e)
    }
  }

  return { theme, setTheme, initTheme }
}
