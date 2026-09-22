/**
 * Leaf · 筛选维度注册表（D-012，对齐 Eagle 实测筛选维度池 + 图钉固定）
 *
 * - pinned 集存 localStorage('leaf.filter-dimensions-pinned')，语义同 Eagle 图钉
 * - 二十六轮：维度顺序存 localStorage('leaf.filter-dimensions-order')，
 *   池内拖拽排序（Eagle ic-drag-help），筛选行按该顺序渲染已固定维度
 * - 每个维度的取值在 LibraryTab 上，激活判断/清除统一走 isDimensionActive/clearDimension
 * - 有意差异：Eagle「标注」无对应数据字段，不入池；「注释」对应描述字段；
 *   AI 维度（以图找图）固定后为动作 chip（触发搜索模式而非取值面板）
 */

export type DimensionId =
  | 'color'
  | 'aiImage'
  | 'tags'
  | 'folders'
  | 'shape'
  | 'rating'
  | 'format'
  | 'resolution'
  | 'size'
  | 'duration'
  | 'notes'
  | 'url'
  | 'time'
  | 'modifiedDate'

export interface FilterDimensionMeta {
  id: DimensionId
  label: string
  icon: string
  defaultPinned: boolean
  /** Eagle 池中带 AI 徽标的维度（以图找图/语义搜索） */
  ai?: boolean
}

/**
 * 二十六轮：注册表顺序对齐 Eagle 池实测——
 * 颜色 / 以图找图(AI) / 语义搜索(AI) / 标签 / 文件夹 / 形状 / 评分 / 格式 /
 * 尺寸 / 时长 / 大小 / 注释 / 链接 / 添加日期 / 修改日期。
 * 默认固定集 = Eagle 默认筛选行：颜色 / 标签 / 文件夹 / 形状 / 评分 / 格式。
 */
export const FILTER_DIMENSIONS: FilterDimensionMeta[] = [
  { id: 'color', label: '颜色', icon: 'context-menu/ic-filter-item-color', defaultPinned: true },
  {
    id: 'aiImage',
    label: '以图找图',
    icon: 'context-menu/ic-filter-item-image',
    defaultPinned: false,
    ai: true
  },
  { id: 'tags', label: '标签', icon: 'context-menu/ic-filter-item-tag', defaultPinned: true },
  {
    id: 'folders',
    label: '文件夹',
    icon: 'context-menu/ic-filter-item-folder',
    defaultPinned: true
  },
  { id: 'shape', label: '形状', icon: 'context-menu/ic-filter-item-shape', defaultPinned: true },
  { id: 'rating', label: '评分', icon: 'context-menu/ic-filter-item-rating', defaultPinned: true },
  { id: 'format', label: '格式', icon: 'context-menu/ic-filter-item-ext', defaultPinned: true },
  {
    id: 'resolution',
    label: '尺寸',
    icon: 'context-menu/ic-filter-item-resolution',
    defaultPinned: false
  },
  {
    id: 'time',
    label: '添加日期',
    icon: 'context-menu/ic-filter-item-import',
    defaultPinned: false
  },
  { id: 'size', label: '大小', icon: 'context-menu/ic-filter-item-size', defaultPinned: false },
  {
    id: 'duration',
    label: '时长',
    icon: 'context-menu/ic-filter-item-duration',
    defaultPinned: false
  },
  { id: 'notes', label: '注释', icon: 'context-menu/ic-filter-item-note', defaultPinned: false },
  { id: 'url', label: '链接', icon: 'context-menu/ic-filter-item-url', defaultPinned: false },
  {
    id: 'modifiedDate',
    label: '修改日期',
    icon: 'context-menu/ic-filter-item-modify',
    defaultPinned: false
  }
]

export const DIMENSION_LABEL: Record<DimensionId, string> = Object.fromEntries(
  FILTER_DIMENSIONS.map((d) => [d.id, d.label])
) as Record<DimensionId, string>

const STORAGE_KEY = 'leaf.filter-dimensions-pinned'
const ORDER_STORAGE_KEY = 'leaf.filter-dimensions-order'

export function loadPinnedDimensions(): DimensionId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return FILTER_DIMENSIONS.filter((d) => d.defaultPinned).map((d) => d.id)
    const parsed = JSON.parse(raw) as string[]
    const valid = parsed.filter((id) => FILTER_DIMENSIONS.some((d) => d.id === id)) as DimensionId[]
    return valid.length > 0
      ? valid
      : FILTER_DIMENSIONS.filter((d) => d.defaultPinned).map((d) => d.id)
  } catch {
    return FILTER_DIMENSIONS.filter((d) => d.defaultPinned).map((d) => d.id)
  }
}

export function savePinnedDimensions(ids: DimensionId[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

/** 二十六轮：维度展示顺序（Eagle 池拖拽排序；缺省 = 注册表顺序） */
export function loadDimensionOrder(): DimensionId[] {
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_KEY)
    if (!raw) return FILTER_DIMENSIONS.map((d) => d.id)
    const parsed = JSON.parse(raw) as string[]
    const valid = parsed.filter((id) => FILTER_DIMENSIONS.some((d) => d.id === id)) as DimensionId[]
    // 注册表新增维度补到末尾
    const missing = FILTER_DIMENSIONS.map((d) => d.id).filter((id) => !valid.includes(id))
    return [...valid, ...missing]
  } catch {
    return FILTER_DIMENSIONS.map((d) => d.id)
  }
}

export function saveDimensionOrder(ids: DimensionId[]): void {
  try {
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

/** 二十六轮：把 from 移到 to 当前位置（池拖拽排序；返回并持久化新顺序） */
export function reorderDimension(from: DimensionId, to: DimensionId): DimensionId[] {
  const order = loadDimensionOrder()
  const fromIdx = order.indexOf(from)
  const toIdx = order.indexOf(to)
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return order
  order.splice(toIdx, 0, ...order.splice(fromIdx, 1))
  saveDimensionOrder(order)
  return order
}
