import { prefRepository } from '../db/repos/PrefRepository'
import type { ScreenshotSettings } from '@shared/ipc-contract'

export interface EditorSettings {
  fontSize: number
  fontFamily: string
  wrap: boolean
  tabSize: number
  matchBrackets: boolean
  highlightLine: boolean
  // Prettier 格式化设置
  semi: boolean
  singleQuote: boolean
  trailingComma: 'none' | 'es5' | 'all'
}

export interface Preferences {
  editor: EditorSettings
  theme: 'light' | 'dark' | 'auto'
  /** onboarding 是否已完成（首次启动引导） */
  onboardingCompleted: boolean
  /** 用户在 onboarding 步骤 3 选的常用模块（影响 Hub 「收藏」区） */
  favoriteModules: string[]
}

const EDITOR_DEFAULTS: EditorSettings = {
  fontSize: 14,
  fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
  wrap: false,
  tabSize: 2,
  matchBrackets: true,
  highlightLine: true,
  semi: true,
  singleQuote: true,
  trailingComma: 'es5'
}

const THEME_VALUES = ['light', 'dark', 'auto'] as const
const PREF_KEYS = {
  theme: 'theme',
  editor: 'editor',
  onboardingCompleted: 'onboarding:completed',
  favoriteModules: 'onboarding:favoriteModules',
  screenshot: 'screenshot'
} as const

const DEFAULT_SCREENSHOT_SETTINGS: ScreenshotSettings = {
  shortcutEnabled: true,
  format: 'png',
  quality: 90,
  saveDir: '',
  autoTag: true
}

/**
 * PreferencesDataStore — 5-7 纯转发层。
 */

export class PreferencesDataStore {
  private getEditor(): EditorSettings {
    const raw = prefRepository.get(PREF_KEYS.editor)
    if (raw) {
      try {
        return { ...EDITOR_DEFAULTS, ...JSON.parse(raw) }
      } catch {
        // fall through
      }
    }
    return EDITOR_DEFAULTS
  }

  getEditorSettings(): EditorSettings {
    return this.getEditor()
  }

  updateEditorSettings(updates: Partial<EditorSettings>): EditorSettings {
    const current = this.getEditor()
    const updated = { ...current, ...updates }
    prefRepository.set(PREF_KEYS.editor, JSON.stringify(updated))
    return updated
  }

  getTheme(): 'light' | 'dark' | 'auto' {
    const raw = prefRepository.get(PREF_KEYS.theme)
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (THEME_VALUES.includes(parsed)) return parsed
      } catch {
        // fall through
      }
    }
    // 默认跟随系统（v4 产品决策）：首次启动读取系统外观，设置页可手动覆盖并持久化。
    // 渲染进程 useTheme 的初值与此保持一致。
    return 'auto'
  }

  setTheme(theme: 'light' | 'dark' | 'auto'): void {
    prefRepository.set(PREF_KEYS.theme, JSON.stringify(theme))
  }

  /** ── 截图设置（JSON 整存整取，未知字段回退默认值） ── */
  getScreenshotSettings(): ScreenshotSettings {
    const raw = prefRepository.get(PREF_KEYS.screenshot)
    if (raw) {
      try {
        return { ...DEFAULT_SCREENSHOT_SETTINGS, ...(JSON.parse(raw) as Partial<ScreenshotSettings>) }
      } catch {
        // fall through
      }
    }
    return { ...DEFAULT_SCREENSHOT_SETTINGS }
  }

  patchScreenshotSettings(patch: Partial<ScreenshotSettings>): ScreenshotSettings {
    const next = { ...this.getScreenshotSettings(), ...patch }
    prefRepository.set(PREF_KEYS.screenshot, JSON.stringify(next))
    return next
  }

  /** onboarding 是否已完成 */
  isOnboardingCompleted(): boolean {
    return prefRepository.get(PREF_KEYS.onboardingCompleted) === 'true'
  }

  /** 标记 onboarding 完成 */
  setOnboardingCompleted(): void {
    prefRepository.set(PREF_KEYS.onboardingCompleted, 'true')
  }

  /** 重置 onboarding 状态（设置页「重新开始引导」） */
  resetOnboarding(): void {
    prefRepository.delete(PREF_KEYS.onboardingCompleted)
  }

  /** 取得 onboarding 阶段收藏的模块 id 列表 */
  getFavoriteModules(): string[] {
    const raw = prefRepository.get(PREF_KEYS.favoriteModules)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string')
    } catch {
      /* fall through */
    }
    return []
  }

  /** 写入 onboarding 阶段收藏的模块 id 列表 */
  setFavoriteModules(ids: string[]): void {
    prefRepository.set(PREF_KEYS.favoriteModules, JSON.stringify(ids))
  }

  getPreferences(): Preferences {
    return {
      editor: this.getEditorSettings(),
      theme: this.getTheme(),
      onboardingCompleted: this.isOnboardingCompleted(),
      favoriteModules: this.getFavoriteModules()
    }
  }
}
