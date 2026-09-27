/** 插件系统类型（阶段 5.1 MVP）—— P1（D-025）起单源下沉 @shared/plugin，本文件只留展示映射 */
export type { PluginCategory, PluginManifest, InstalledPlugin, ManagedPlugin } from '@shared/plugin'
import type { PluginCategory } from '@shared/plugin'

export const PLUGIN_CATEGORY_LABELS: Record<PluginCategory, string> = {
  inspector: '检查器',
  format: '格式预览',
  window: '工具窗口',
  development: '开发'
}
