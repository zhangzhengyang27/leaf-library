import { BrowserWindow, ipcMain } from 'electron'
import type { PreferencesDataStore } from '../stores/PreferencesDataStore'

export function registerPreferencesIpcHandlers(preferencesStore: PreferencesDataStore): void {
  // 获取编辑器设置
  ipcMain.handle('preferences:getEditorSettings', () => {
    return preferencesStore.getEditorSettings()
  })

  // 更新编辑器设置
  ipcMain.handle(
    'preferences:updateEditorSettings',
    (_event, updates: Partial<import('../stores/PreferencesDataStore').EditorSettings>) => {
      return preferencesStore.updateEditorSettings(updates)
    }
  )

  // 获取主题设置
  ipcMain.handle('preferences:getTheme', () => {
    return preferencesStore.getTheme()
  })

  // 设置主题。入参白名单校验（审查 P3-21）：任意值曾被持久化并广播给全部窗口，
  // 坏值落库后读取静默回退 auto，用户设置丢失且无告警
  ipcMain.handle('preferences:setTheme', (_event, theme: 'light' | 'dark' | 'auto') => {
    if (theme !== 'light' && theme !== 'dark' && theme !== 'auto') {
      throw new Error('invalid theme value')
    }
    preferencesStore.setTheme(theme)
    // B4 修复：向所有窗口广播主题变更，否则多窗口场景下各窗口主题不一致
    // （渲染端 useTheme 通过 onThemeChanged 订阅）
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('theme:changed', theme)
      }
    }
  })

  // 获取所有偏好设置
  ipcMain.handle('preferences:getPreferences', () => {
    return preferencesStore.getPreferences()
  })

  // onboarding 状态
  ipcMain.handle('preferences:isOnboardingCompleted', () => {
    return preferencesStore.isOnboardingCompleted()
  })
  ipcMain.handle('preferences:setOnboardingCompleted', () => {
    preferencesStore.setOnboardingCompleted()
  })
  ipcMain.handle('preferences:resetOnboarding', () => {
    preferencesStore.resetOnboarding()
  })

  // onboarding 阶段收藏模块
  ipcMain.handle('preferences:getFavoriteModules', () => {
    return preferencesStore.getFavoriteModules()
  })
  ipcMain.handle('preferences:setFavoriteModules', (_event, ids: string[]) => {
    preferencesStore.setFavoriteModules(ids)
  })
}

export function registerPrettierIpcHandlers(preferencesStore: PreferencesDataStore): void {
  // Prettier 格式化处理
  ipcMain.handle('prettier:format', async (_event, payload: { text: string; parser: string }) => {
    try {
      const prettier = await import('prettier')
      const editorSettings = preferencesStore.getEditorSettings()
      const formatted = await prettier.default.format(payload.text, {
        parser: payload.parser,
        tabWidth: editorSettings.tabSize,
        semi: editorSettings.semi,
        singleQuote: editorSettings.singleQuote,
        trailingComma: editorSettings.trailingComma
      })
      return formatted
    } catch (error) {
      console.error('Prettier 格式化失败:', error)
      throw error
    }
  })
}
