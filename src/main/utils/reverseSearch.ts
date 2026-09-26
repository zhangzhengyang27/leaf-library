/**
 * 反向图搜（对标 Eagle find > reverse）引擎清单与打开逻辑。
 *
 * Eagle 的反向图搜是直接把文件丢给外部识图引擎；Leaf 的素材多为本地文件，
 * 搜索引擎只认 URL/上传，所以落地为「图片复制进系统剪贴板 + 打开引擎页」，
 * 用户在打开的页面里 ⌘V 粘贴。本模块刻意保持纯函数（不 import electron）：
 * 主进程注入 openExternal，渲染层直接复用这一份清单渲染子菜单，两侧不跑偏。
 */

export interface ReverseSearchEngine {
  /** 稳定 id（IPC 传参 / 右键菜单子项 key） */
  id: string
  /** 菜单显示名 */
  name: string
  /** 引擎的上传/搜索页 URL */
  url: string
}

export const REVERSE_SEARCH_ENGINES: readonly ReverseSearchEngine[] = [
  { id: 'google-lens', name: 'Google Lens', url: 'https://lens.google.com/' },
  { id: 'bing-visual', name: 'Bing 视觉搜索', url: 'https://www.bing.com/visualsearch' },
  { id: 'yandex', name: 'Yandex 图片', url: 'https://yandex.com/images/search' },
  { id: 'saucenao', name: 'SauceNAO', url: 'https://saucenao.com/' },
  { id: 'tineye', name: 'TinEye', url: 'https://tineye.com/' }
]

/** 按 id 查引擎；未知 id（旧版本菜单缓存 / 外部输入）返回 null */
export function getReverseSearchEngine(engineId: unknown): ReverseSearchEngine | null {
  if (typeof engineId !== 'string') return null
  return REVERSE_SEARCH_ENGINES.find((e) => e.id === engineId) ?? null
}

/**
 * 打开引擎页。openExternal 由调用方注入（主进程传 shell.openExternal），
 * 本模块不碰 electron，注入后即可纯函数单测。
 */
export function openReverseSearchEngine(
  engineId: unknown,
  openExternal: (url: string) => unknown
): ReverseSearchEngine | null {
  const engine = getReverseSearchEngine(engineId)
  if (!engine) return null
  openExternal(engine.url)
  return engine
}
