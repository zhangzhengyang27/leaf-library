/**
 * Leaf 素材库 · 模块元数据（shared 真理源）
 *
 * 独立版只有素材库一个业务模块；settings/about 是应用级页面不进模块表。
 * Sidebar / CommandPalette 从这里取清单。
 */

export type ModuleGroup = 'resource'

export interface ModuleMeta {
  /** 唯一 id */
  id: string
  /** 路由名（vue-router name） */
  routeName: string
  /** 路由 path（用于 router.push） */
  path: string
  /** 中文标签 */
  label: string
  /** 描述 */
  description: string
  /** AppIcon 图标名（本地图标资产，见 renderer AppIcon） */
  icon: string
  /** 所在分组 */
  group: ModuleGroup
  badge?: string
  /** 快捷键 */
  shortcut: string
}

export const MODULES: ModuleMeta[] = [
  {
    id: 'photos',
    routeName: 'photos',
    path: '/photos',
    label: '素材库',
    description: '图片/视频/音频/字体/书签 一站式管理',
    icon: 'ic_photo',
    group: 'resource',
    shortcut: '1'
  }
]

export function findModule(id: string): ModuleMeta | undefined {
  return MODULES.find((m) => m.id === id)
}

export function findModuleByRoute(routeName: string): ModuleMeta | undefined {
  return MODULES.find((m) => m.routeName === routeName)
}

export function getModulesByGroup(group: ModuleGroup): ModuleMeta[] {
  return MODULES.filter((m) => m.group === group)
}

export const GROUP_LABELS: Record<ModuleGroup, string> = {
  resource: '素材'
}
