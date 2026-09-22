/**
 * IPC 处理器统一导出（Leaf 素材库独立版）。
 */

export { registerNotificationIpcHandlers } from './notifications'
export { registerPhotoIpcHandlers } from './photos'
export { registerPreferencesIpcHandlers, registerPrettierIpcHandlers } from './preferences'
export { registerTagIpcHandlers } from './tags'
export { registerAutoUpdateIpcHandlers } from './autoUpdate'
export { registerSystemInfoIpcHandlers } from './system'
export { registerLogIpcHandlers } from './log'
export { registerPlatformIpcHandlers } from './platform'
export { registerClipServerIpcHandlers } from './clipServer'
export { registerWallpaperIpcHandlers } from './wallpaper'
export { registerLibrariesIpcHandlers } from './libraries'
export { registerWatchedFoldersIpcHandlers } from './watchedFolders'
export { registerClipboardWatchIpcHandlers } from './clipboardWatch'
export { registerStorageIpcHandlers } from './storage'
export { registerBackupIpcHandlers } from './backup'
export { registerVectorsIpcHandlers } from './vectors'
export { registerSearchIpcHandlers } from './search'
export { registerEditIpcHandlers } from './edit'
export { registerMediaIpcHandlers } from './media'
export { registerAnnotationIpcHandlers } from './annotations'
export { registerPluginsIpcHandlers } from './plugins'
export { registerScreenshotIpcHandlers } from './screenshots'
export { registerDeepSeekIpcHandlers } from './deepseek'

// 导出工具函数
export { registerHandlers, registerPrefixedHandlers } from './utils'
