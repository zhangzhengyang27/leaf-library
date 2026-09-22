/**
 * Leaf · 搜索范围注册表（二十七轮，对齐 Eagle 搜索框 ˅ 下拉「搜索范围」实测）
 *
 * Eagle 面板 8 项：名称 / 文件夹名 / 文件夹描述 / 扩展名 / 标签 / 链接 / 标注 / 注释；
 * 「标注」（图片标注）无对应数据字段，不入表；「注释」= 描述字段。
 * 本项目另加第 8 项「OCR 文本」= ocr_text（Eagle 没有该项，但没有它图内文字就搜不到）。
 * 勾选集存 localStorage('leaf.search-scopes')，全局生效（Eagle 同语义，跨视图记住）。
 * 模块级单例 ref：TitleBar（勾选 UI）与 usePhotoFilters（匹配逻辑）共享同一实例。
 */
import { ref, type Ref } from 'vue'
import type { SearchScopeId } from '@shared/smartAlbumRules'

// 词表单源在 @shared/smartAlbumRules：主进程的列映射表按它穷举，
// 这里加一项而主进程没补列会在 typecheck 阶段报错，而不是静默去搜文件名
export type { SearchScopeId }

export interface SearchScopeMeta {
  id: SearchScopeId
  label: string
  icon: string
}

export const SEARCH_SCOPES: SearchScopeMeta[] = [
  { id: 'name', label: '名称', icon: 'context-menu/ic-search-scope-name' },
  { id: 'folderName', label: '文件夹名', icon: 'context-menu/ic-search-scope-folder' },
  { id: 'folderDesc', label: '文件夹描述', icon: 'context-menu/ic-search-scope-folder-desc' },
  { id: 'ext', label: '扩展名', icon: 'context-menu/ic-search-scope-ext' },
  { id: 'tags', label: '标签', icon: 'context-menu/ic-search-scope-tag' },
  { id: 'link', label: '链接', icon: 'context-menu/ic-search-scope-link' },
  { id: 'note', label: '注释', icon: 'context-menu/ic-search-scope-note' },
  // OCR 单列一项而非并入「注释」：图内文字命中与描述命中语义不同，扫描件库里
  // 用户需要能单独关掉 OCR，否则命中会淹没按名称的结果
  // （图标原写 ic-ocr，该文件不存在 → AppIcon 静默渲染空，换成实存的图标）
  { id: 'ocr', label: 'OCR 文本', icon: 'context-menu/ic-search-by-image' },
  // 文档正文与 OCR 文本同理分开：一个是"文件里本来就有的字"，一个是"图里认出来的字"
  { id: 'docText', label: '文档正文', icon: 'context-menu/ic-search-scope-comment' }
]

const STORAGE_KEY = 'leaf.search-scopes'
const ALL_IDS = SEARCH_SCOPES.map((s) => s.id)

/**
 * 勾选集落库形状：`{ v: 保存时的范围项总数, ids }`。
 * 判「要不要跟进新增项」靠 v 而不是猜集合内容：`ids.length === v` 才说明
 * 保存那一刻用户是全选的。旧写法（比对历史全选快照）会把「只取消掉新增那一项」
 * 的真实偏好也判成从未个性化，下次启动静默给勾回来。
 */
interface StoredScopes {
  v: number
  ids: SearchScopeId[]
}

/** 旧格式（纯数组、无版本）时代的全选快照，仅用于一次性升级 */
const LEGACY_FULL_SELECTIONS: SearchScopeId[][] = [
  ALL_IDS.filter((id) => id !== 'ocr' && id !== 'docText'), // 最初 7 项
  ALL_IDS.filter((id) => id !== 'docText') // 加 OCR 之后的 8 项
]

function isExactMatch(a: SearchScopeId[], b: SearchScopeId[]): boolean {
  return a.length === b.length && b.every((id) => a.includes(id))
}

function sanitize(ids: string[]): SearchScopeId[] {
  const valid = ids.filter((id) => ALL_IDS.includes(id as SearchScopeId)) as SearchScopeId[]
  return valid.length > 0 ? valid : [...ALL_IDS]
}

function loadSearchScopes(): SearchScopeId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [...ALL_IDS]
    const parsed = JSON.parse(raw) as string[] | StoredScopes
    if (Array.isArray(parsed)) {
      // 旧格式：无从得知"当时共几项"，只能比对历史全选快照，然后就地升级
      const valid = sanitize(parsed)
      const wasFull = LEGACY_FULL_SELECTIONS.some((legacy) => isExactMatch(valid, legacy))
      const ids = wasFull ? [...ALL_IDS] : valid
      persist(ids)
      return ids
    }
    const stored = parsed
    const ids = sanitize(stored.ids ?? [])
    // 保存时是全选 → 随范围项扩充自动跟进；否则尊重用户的选择
    return stored.v === ids.length && ids.length < ALL_IDS.length ? [...ALL_IDS] : ids
  } catch {
    return [...ALL_IDS]
  }
}

function persist(ids: SearchScopeId[]): void {
  try {
    const stored: StoredScopes = { v: ALL_IDS.length, ids: [...ids] }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  } catch {
    /* ignore */
  }
}

const scopes = ref<SearchScopeId[]>(loadSearchScopes())

/** 当前勾选的搜索范围（响应式；usePhotoFilters 的匹配读取它建立依赖） */
export function useSearchScopes(): Ref<SearchScopeId[]> {
  return scopes
}

export function saveSearchScopes(ids: SearchScopeId[]): void {
  scopes.value = [...ids]
  persist(ids)
}

export function toggleSearchScope(id: SearchScopeId): void {
  const i = scopes.value.indexOf(id)
  if (i >= 0) scopes.value.splice(i, 1)
  else scopes.value.push(id)
  saveSearchScopes([...scopes.value])
}
