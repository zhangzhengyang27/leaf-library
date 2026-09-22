/** 插件系统类型（阶段 5.1 MVP，与主进程 PluginService 对齐） */

export type PluginCategory = 'inspector' | 'format' | 'window' | 'development'

export interface InstalledPlugin {
  id: string
  name: string
  version: string
  category: PluginCategory
  entry: string
  formats: string[]
  dir: string
}

export const PLUGIN_CATEGORY_LABELS: Record<PluginCategory, string> = {
  inspector: '检查器',
  format: '格式预览',
  window: '工具窗口',
  development: '开发'
}
