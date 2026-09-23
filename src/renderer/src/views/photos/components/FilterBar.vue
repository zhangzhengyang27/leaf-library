<script setup lang="ts">
/**
 * FilterBar · 素材库筛选条（D-011 Eagle 布局；二十六轮全面对齐 Eagle 实测筛选维度）
 *
 * 固定维度（图钉 + 池拖拽序）= 「图标+文字」chip，点击锚定弹出面板：
 * - 多选面板（标签/文件夹/形状/评分/格式）：左键包含 / 右键排除（红色划线态）/ ESC 关闭，
 *   选择后面板保持打开，每行右侧实时计数（基于当前视图候选池）；
 * - 单值面板（尺寸/大小/时长/添加日期/修改日期）：预设行带计数 + 自定义输入；
 * - 关键词面板（注释/链接）：输入即筛选；
 * - AI 维度（以图找图/语义搜索）：固定后为动作 chip，触发对应搜索模式。
 * 生效态（Eagle 实测）：chip 显示摘要 token（排除为「-png」负向形态）、
 * 行尾出现 保存筛选/锁定筛选/清除全部 三图标。
 * 状态全部随活动视图（useLibraryTabs），组件不持有本地筛选状态。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import { useLibraryTabs, type OrientationValue } from '@renderer/stores/libraryTabs'
import type { SmartAlbumRules } from '../../../types/photo'
import { buildFiltersSpec } from '../composables/usePhotoFilterSpec'
import { rulesToFilters } from '../composables/rulesToFilters'
import { saveSearchScopes } from '../constants/searchScopes'
import { useSemanticSearch } from '../constants/semanticSearch'
import SavedFiltersPopover from './SavedFiltersPopover.vue'
import {
  DIMENSION_LABEL,
  loadDimensionOrder,
  loadPinnedDimensions,
  reorderDimension,
  savePinnedDimensions,
  type DimensionId
} from '../constants/filterDimensions'
import {
  extOfFile,
  ratioMatches,
  matchImportTimePreset,
  RESOLUTION_MIN,
  shapeOf,
  usePhotoFilters
} from '../composables/usePhotoFilters'
import { useToast } from '@composables/useToast'
import DimensionPoolPopover from '@components/shell/DimensionPoolPopover.vue'
import DimensionChip from './DimensionChip.vue'
import OptionRow from './OptionRow.vue'
import FilterHintBar from './FilterHintBar.vue'
import ColorPickerPanel from './ColorPickerPanel.vue'
import TagsFilterPanel from './TagsFilterPanel.vue'
import FoldersFilterPanel from './FoldersFilterPanel.vue'
import { usePhotoActions } from '../composables/usePhotoActions'
import { useDuplicateScan } from '../composables/useDuplicateScan'

const tabs = useLibraryTabs()
const actions = usePhotoActions()
const filters = usePhotoFilters()
const semantic = useSemanticSearch()
const scan = useDuplicateScan()

const tab = computed(() => tabs.active)
const pool = filters.currentPool
const showKindChips = computed(
  () => filters.showFilters.value && tab.value.view !== 'map' && !tab.value.aiSearchMode
)

/** 相册/文件夹/智能夹上下文操作（原筛选条内联按钮） */
const showAlbumActions = computed(() => !!filters.activeAlbum.value)
const showFolderActions = computed(() => !!filters.activeFolder.value)
const showSmartActions = computed(() => !!filters.activeSmartAlbum.value)

function editActiveSmart(): void {
  if (filters.activeSmartAlbum.value) actions.openSmartAlbumModal(filters.activeSmartAlbum.value)
}

function deleteActiveSmart(): void {
  if (filters.activeSmartAlbum.value) actions.deleteSmartAlbumById(filters.activeSmartAlbum.value)
}

function renameActiveAlbum(): void {
  const album = filters.activeAlbum.value
  if (album) actions.renameAlbumById(album.id, album.name)
}

function deleteActiveAlbum(): void {
  const album = filters.activeAlbum.value
  if (album) actions.deleteAlbumById(album.id, album.name)
}

function deleteActiveFolder(): void {
  const folder = filters.activeFolder.value
  if (folder) actions.deleteFolderById(folder.id, folder.name)
}

// ── D-012 / 二十六轮：维度池（图钉固定 + 拖拽排序，单源 localStorage） ──

const pinned = ref<DimensionId[]>(loadPinnedDimensions())
const dimOrder = ref<DimensionId[]>(loadDimensionOrder())
/** 筛选行渲染序 = 维度顺序 ∩ 已固定（Eagle 池拖拽决定顺序） */
const pinnedOrdered = computed(() => dimOrder.value.filter((id) => pinned.value.includes(id)))

/** 九轮：⌘⇧T 打开标签筛选弹层（Eagle open.tagfilter）。
 * 审查 I2：模板 ref 位于 v-for 作用域内时 Vue 存的是实例数组而非单个实例 */
const tagsChipRef = ref<
  InstanceType<typeof DimensionChip> | InstanceType<typeof DimensionChip>[] | null
>(null)
function openTagFilter(): void {
  const chip = Array.isArray(tagsChipRef.value) ? tagsChipRef.value[0] : tagsChipRef.value
  chip?.show()
}
defineExpose({ openTagFilter })

function togglePin(id: DimensionId): void {
  const i = pinned.value.indexOf(id)
  if (i >= 0) pinned.value.splice(i, 1)
  else pinned.value.push(id)
  savePinnedDimensions([...pinned.value])
  window.dispatchEvent(new CustomEvent('leaf:dimensions-changed'))
}

/** 池内拖拽排序（DimensionPoolPopover 转发；TitleBar 同步经 window 事件） */
function onReorder(from: DimensionId, to: DimensionId): void {
  dimOrder.value = reorderDimension(from, to)
  window.dispatchEvent(new CustomEvent('leaf:dimensions-changed'))
}

/** TitleBar 维度池与本组件图钉/顺序同步（同一 localStorage 单源） */
function onDimsChanged(): void {
  pinned.value = loadPinnedDimensions()
  dimOrder.value = loadDimensionOrder()
}
onMounted(() => window.addEventListener('leaf:dimensions-changed', onDimsChanged))
onBeforeUnmount(() => window.removeEventListener('leaf:dimensions-changed', onDimsChanged))

// ── 多选维度：行三态 + 包含/排除切换（左键包含 / 右键排除，Eagle 弹层语义） ──

type RowState = 'off' | 'include' | 'exclude'

function arrayRowState(
  include: readonly string[],
  exclude: readonly string[],
  key: string
): RowState {
  if (include.includes(key)) return 'include'
  if (exclude.includes(key)) return 'exclude'
  return 'off'
}
function toggleIn(list: string[], key: string, opposite: string[]): void {
  const i = list.indexOf(key)
  if (i >= 0) list.splice(i, 1)
  else list.push(key)
  const j = opposite.indexOf(key)
  if (j >= 0) opposite.splice(j, 1)
  tabs.persist()
}

// ── 形状维度（多选 + 比例 + 自定） ──

const ORIENTATIONS: Array<{ key: OrientationValue; label: string }> = [
  { key: 'landscape', label: '横图' },
  { key: 'portrait', label: '竖图' },
  { key: 'square', label: '方形' },
  { key: 'panoramic', label: '细长横图' },
  { key: 'panoramicPortrait', label: '细长竖图' }
]
const SHAPE_LABEL: Record<OrientationValue, string> = Object.fromEntries(
  ORIENTATIONS.map((o) => [o.key, o.label])
) as Record<OrientationValue, string>

/** 比例预设（Eagle 形状弹层「3:4」行形态；仅显示命中当前视图的比例行） */
const RATIO_PRESETS: Array<{ label: string; ratio: [number, number] }> = [
  { label: '1:1', ratio: [1, 1] },
  { label: '4:3', ratio: [4, 3] },
  { label: '3:4', ratio: [3, 4] },
  { label: '3:2', ratio: [3, 2] },
  { label: '2:3', ratio: [2, 3] },
  { label: '16:9', ratio: [16, 9] },
  { label: '9:16', ratio: [9, 16] }
]
const customW = ref<number | null>(null)
const customH = ref<number | null>(null)
/** 审查 M10：输入有效时始终应用输入值（含预设激活时直接覆盖），输入为空才作清除 */
function applyCustomRatio(): void {
  const w = customW.value
  const h = customH.value
  if (w && h && w > 0 && h > 0) {
    tab.value.ratioFilter = [w, h]
  } else {
    tab.value.ratioFilter = null
  }
  tabs.persist()
}
function isRatioActive(ratio: [number, number]): boolean {
  const r = tab.value.ratioFilter
  return !!r && r[0] === ratio[0] && r[1] === ratio[1]
}
function toggleRatioPreset(ratio: [number, number]): void {
  tab.value.ratioFilter = isRatioActive(ratio) ? null : ratio
  tabs.persist()
}
function ratioVisible(label: string): boolean {
  return (
    (ratioCounts.value[label] ?? 0) > 0 ||
    RATIO_PRESETS.some((p) => p.label === label && isRatioActive(p.ratio))
  )
}

function shapeRowState(key: OrientationValue): RowState {
  return arrayRowState(tab.value.shapeInclude, tab.value.shapeExclude, key)
}
function toggleShapeInclude(key: OrientationValue): void {
  toggleIn(tab.value.shapeInclude, key, tab.value.shapeExclude)
}
function toggleShapeExclude(key: OrientationValue): void {
  toggleIn(tab.value.shapeExclude, key, tab.value.shapeInclude)
}

// ── 评分维度（精确星级 + 尚未评分，Eagle 评分弹层形态：星级行在前、「尚未评分」最后） ──

const RATING_OPTIONS = [1, 2, 3, 4, 5, 0]
function ratingLabel(r: number): string {
  if (r === 0) return '尚未评分'
  return '★'.repeat(r) + '☆'.repeat(5 - r)
}
function ratingRowState(r: number): RowState {
  if (tab.value.ratingInclude.includes(r)) return 'include'
  if (tab.value.ratingExclude.includes(r)) return 'exclude'
  return 'off'
}
function toggleNumIn(list: number[], key: number, opposite: number[]): void {
  const i = list.indexOf(key)
  if (i >= 0) list.splice(i, 1)
  else list.push(key)
  const j = opposite.indexOf(key)
  if (j >= 0) opposite.splice(j, 1)
  tabs.persist()
}
function toggleRatingInclude(r: number): void {
  toggleNumIn(tab.value.ratingInclude, r, tab.value.ratingExclude)
}
function toggleRatingExclude(r: number): void {
  toggleNumIn(tab.value.ratingExclude, r, tab.value.ratingInclude)
}

// ── 格式维度（多选 + 面板内搜索） ──

const formatSearch = ref('')
const visibleFormats = computed(() => {
  const q = formatSearch.value.trim().toLowerCase()
  if (!q) return filters.availableFormats.value
  return filters.availableFormats.value.filter((f) => f.toLowerCase().includes(q))
})
function formatRowState(f: string): RowState {
  return arrayRowState(tab.value.formatInclude, tab.value.formatExclude, f)
}
function toggleFormatInclude(f: string): void {
  toggleIn(tab.value.formatInclude, f, tab.value.formatExclude)
}
function toggleFormatExclude(f: string): void {
  toggleIn(tab.value.formatExclude, f, tab.value.formatInclude)
}

// ── 阶段3：各维度选项实时计数（基于当前视图候选池，Eagle 弹层形态） ──

const formatCounts = computed<Record<string, number>>(() => {
  const out: Record<string, number> = {}
  for (const p of pool.value) {
    const ext = extOfFile(p)
    if (!ext) continue
    out[ext] = (out[ext] ?? 0) + 1
  }
  return out
})

const ratingCounts = computed<Record<number, number>>(() => {
  const out: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const p of pool.value) out[p.rating] = (out[p.rating] ?? 0) + 1
  return out
})

const shapeCounts = computed<Record<OrientationValue, number>>(() => {
  const c: Record<OrientationValue, number> = {
    landscape: 0,
    portrait: 0,
    square: 0,
    panoramic: 0,
    panoramicPortrait: 0
  }
  for (const p of pool.value) {
    const v = shapeOf(p)
    if (v) c[v]++
  }
  return c
})

const ratioCounts = computed<Record<string, number>>(() => {
  const out: Record<string, number> = {}
  for (const preset of RATIO_PRESETS) out[preset.label] = 0
  for (const p of pool.value) {
    for (const preset of RATIO_PRESETS) {
      if (ratioMatches(p, preset.ratio)) out[preset.label]++
    }
  }
  return out
})

const resolutionCounts = computed<Record<string, number>>(() => {
  const out: Record<string, number> = { '1k': 0, '2k': 0, '4k': 0 }
  for (const p of pool.value) {
    const maxDim = Math.max(p.width ?? 0, p.height ?? 0)
    if (maxDim >= RESOLUTION_MIN['1k']) out['1k']++
    if (maxDim >= RESOLUTION_MIN['2k']) out['2k']++
    if (maxDim >= RESOLUTION_MIN['4k']) out['4k']++
  }
  return out
})

const TIME_PRESET_KEYS = ['today', 'yesterday', '7d', '30d', '90d', '365d'] as const
type TimePresetKey = (typeof TIME_PRESET_KEYS)[number]
const TIME_PRESET_LABEL: Record<TimePresetKey, string> = {
  today: '今日',
  yesterday: '昨日',
  '7d': '最近 7 日',
  '30d': '最近 30 日',
  '90d': '最近 90 日',
  '365d': '最近 365 日'
}
const timeCounts = computed<Record<string, number>>(() => {
  const out: Record<string, number> = {}
  for (const t of TIME_PRESET_KEYS) out[t] = 0
  for (const p of pool.value) {
    for (const t of TIME_PRESET_KEYS) {
      if (matchImportTimePreset(p, t)) out[t]++
    }
  }
  return out
})

const SIZE_PRESETS: Array<{ key: string; label: string; range: [number, number] }> = [
  { key: 'lt1', label: '< 1 MB', range: [0, 1_048_576] },
  { key: '1to10', label: '1 ~ 10 MB', range: [1_048_576, 10_485_760] },
  { key: '10to100', label: '10 ~ 100 MB', range: [10_485_760, 104_857_600] },
  { key: 'gt100', label: '> 100 MB', range: [104_857_600, Number.MAX_SAFE_INTEGER] }
]
const sizeCounts = computed<Record<string, number>>(() => {
  const out: Record<string, number> = {}
  for (const preset of SIZE_PRESETS) out[preset.key] = 0
  for (const p of pool.value) {
    for (const preset of SIZE_PRESETS) {
      if (p.fileSize >= preset.range[0] && p.fileSize <= preset.range[1]) out[preset.key]++
    }
  }
  return out
})

const DURATION_PRESETS: Array<{ key: string; label: string; range: [number, number] }> = [
  { key: 'lt30s', label: '< 30 秒', range: [0, 30_000] },
  { key: '30s5m', label: '30 秒 ~ 5 分钟', range: [30_000, 300_000] },
  { key: 'gt5m', label: '> 5 分钟', range: [300_000, Number.MAX_SAFE_INTEGER] }
]
const durationCounts = computed<Record<string, number>>(() => {
  const out: Record<string, number> = {}
  for (const preset of DURATION_PRESETS) out[preset.key] = 0
  for (const p of pool.value) {
    if (p.durationMs == null) continue
    for (const preset of DURATION_PRESETS) {
      if (p.durationMs >= preset.range[0] && p.durationMs <= preset.range[1]) out[preset.key]++
    }
  }
  return out
})

// 「今日」边界的时间基准（审查 P3-49）：new Date() 非响应式，computed 缓存永不失效，
// 跨午夜运行后「今日修改」仍是昨天零点；低频 tick 让边界至少每分钟对齐一次
const nowTick = ref(Date.now())
const midnightTimer = window.setInterval(() => {
  nowTick.value = Date.now()
}, 60_000)
onBeforeUnmount(() => window.clearInterval(midnightTimer))

function dayStart(offsetDays: number): number {
  const base = new Date(nowTick.value)
  const today = base.setHours(0, 0, 0, 0)
  if (offsetDays === 0) return today
  return today - offsetDays * 86_400_000
}
const MOD_PRESETS = computed<Array<{ key: string; label: string; from: number }>>(() => [
  { key: 'today', label: '今日修改', from: dayStart(0) },
  { key: '7d', label: '最近 7 日修改', from: dayStart(7) },
  { key: '30d', label: '最近 30 日修改', from: dayStart(30) }
])
const modCounts = computed<Record<string, number>>(() => {
  const out: Record<string, number> = {}
  for (const preset of MOD_PRESETS.value) out[preset.key] = 0
  for (const p of pool.value) {
    if (p.fsModifiedAt == null) continue
    for (const preset of MOD_PRESETS.value) {
      if (p.fsModifiedAt >= preset.from) out[preset.key]++
    }
  }
  return out
})

// ── 单值维度取值 ──

function clearResolution(close: () => void): void {
  tab.value.resolutionFilter = ''
  tabs.persist()
  close()
}
function pickResolution(v: '1k' | '2k' | '4k', close: () => void): void {
  tab.value.resolutionFilter = tab.value.resolutionFilter === v ? '' : v
  tabs.persist()
  close()
}
function clearTime(close: () => void): void {
  tab.value.timeFilter = ''
  tabs.persist()
  close()
}
function pickTime(t: TimePresetKey, close: () => void): void {
  tab.value.timeFilter = tab.value.timeFilter === t ? '' : t
  tabs.persist()
  close()
}
function clearSize(close: () => void): void {
  tab.value.sizeRange = null
  tabs.persist()
  close()
}
const sizeKey = computed(() => {
  const r = tab.value.sizeRange
  if (!r) return ''
  const hit = SIZE_PRESETS.find((p) => p.range[0] === r[0] && p.range[1] === r[1])
  return hit ? hit.key : 'custom'
})
function pickSize(key: string, close: () => void): void {
  if (tab.value.sizeRange && sizeKey.value === key) {
    tab.value.sizeRange = null
  } else {
    const hit = SIZE_PRESETS.find((p) => p.key === key)
    tab.value.sizeRange = hit ? hit.range : null
  }
  tabs.persist()
  close()
}
const minKb = computed(() => Math.round((tab.value.sizeRange?.[0] ?? 0) / 1024))
const maxKb = computed(() => Math.round((tab.value.sizeRange?.[1] ?? 0) / 1024))
function onMinKb(e: Event): void {
  const v = Number((e.target as HTMLInputElement).value) * 1024
  tab.value.sizeRange = [v, tab.value.sizeRange?.[1] ?? 0]
  tabs.persist()
}
function onMaxKb(e: Event): void {
  const v = Number((e.target as HTMLInputElement).value) * 1024
  tab.value.sizeRange = [tab.value.sizeRange?.[0] ?? 0, v]
  tabs.persist()
}
function clearDuration(close: () => void): void {
  tab.value.durationRange = null
  tabs.persist()
  close()
}
const durationKey = computed(() => {
  const r = tab.value.durationRange
  if (!r) return ''
  const hit = DURATION_PRESETS.find((p) => p.range[0] === r[0] && p.range[1] === r[1])
  return hit ? hit.key : 'custom'
})
function pickDuration(key: string, close: () => void): void {
  if (tab.value.durationRange && durationKey.value === key) {
    tab.value.durationRange = null
  } else {
    const hit = DURATION_PRESETS.find((p) => p.key === key)
    tab.value.durationRange = hit ? hit.range : null
  }
  tabs.persist()
  close()
}
function toDateInput(ms: number | null): string {
  if (!ms) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function onFromDate(e: Event): void {
  const v = (e.target as HTMLInputElement).value
  const ms = v ? new Date(v).getTime() : 0
  tab.value.customTime = [ms, tab.value.customTime?.[1] ?? 0]
  tabs.persist()
}
function onToDate(e: Event): void {
  const v = (e.target as HTMLInputElement).value
  const ms = v ? new Date(v).getTime() + 86_399_000 : 0
  tab.value.customTime = [tab.value.customTime?.[0] ?? 0, ms]
  tabs.persist()
}
function clearCustomTime(): void {
  tab.value.customTime = null
  tabs.persist()
}
function clearModified(close: () => void): void {
  tab.value.modifiedTimeRange = null
  tabs.persist()
  close()
}
function onModFrom(e: Event): void {
  const v = (e.target as HTMLInputElement).value
  const ms = v ? new Date(v).getTime() : 0
  tab.value.modifiedTimeRange = [ms, tab.value.modifiedTimeRange?.[1] ?? 0]
  tabs.persist()
}
function onModTo(e: Event): void {
  const v = (e.target as HTMLInputElement).value
  const ms = v ? new Date(v).getTime() + 86_399_000 : 0
  tab.value.modifiedTimeRange = [tab.value.modifiedTimeRange?.[0] ?? 0, ms]
  tabs.persist()
}
const modKey = computed(() => {
  const r = tab.value.modifiedTimeRange
  if (!r) return ''
  const hit = MOD_PRESETS.value.find((p) => p.from === r[0])
  return hit ? hit.key : 'custom'
})
function pickMod(key: string, close: () => void): void {
  if (tab.value.modifiedTimeRange && modKey.value === key) {
    tab.value.modifiedTimeRange = null
  } else {
    const hit = MOD_PRESETS.value.find((p) => p.key === key)
    tab.value.modifiedTimeRange = hit ? [hit.from, 0] : null
  }
  tabs.persist()
  close()
}
function clearNoteKeyword(): void {
  tab.value.noteKeyword = ''
  tabs.persist()
}
function clearUrlKeyword(): void {
  tab.value.urlKeyword = ''
  tabs.persist()
}
function toggleAiSearchMode(): void {
  tab.value.aiSearchMode = !tab.value.aiSearchMode
  tabs.persist()
}

// ── 生效态（Eagle：负向 token + 行尾 保存/锁定/清除；漏斗蓝点判定源在 filters） ──

const hasFilters = filters.hasDimensionFilters

/** chip 摘要 token：包含值直排，仅排除时用「-」前缀（Eagle「-png」形态） */
const formatToken = computed(() => {
  const inc = tab.value.formatInclude
  const ex = tab.value.formatExclude
  if (inc.length > 0) return inc.join('/')
  if (ex.length > 0) return `-${ex.join('/')}`
  return undefined
})
const shapeToken = computed(() => {
  const inc = tab.value.shapeInclude
  const ex = tab.value.shapeExclude
  if (inc.length > 0) return inc.map((v) => SHAPE_LABEL[v]).join('/')
  if (ex.length > 0) return `-${ex.map((v) => SHAPE_LABEL[v]).join('/')}`
  return undefined
})
const ratingToken = computed(() => {
  const inc = tab.value.ratingInclude
  const ex = tab.value.ratingExclude
  const fmt = (r: number): string => (r === 0 ? '未评分' : `${r}★`)
  if (inc.length > 0) return inc.map(fmt).join('/')
  if (ex.length > 0) return `-${ex.map(fmt).join('/')}`
  return undefined
})
const tagsToken = computed(() => {
  const t = tab.value
  const parts: string[] = []
  if (t.tagFilter.length > 0) parts.push(t.tagFilter.join('/'))
  if (t.untaggedOnly) parts.push('未标签')
  if (parts.length > 0) return parts.join('+')
  if (t.tagExclude.length > 0) return `-${t.tagExclude.join('/')}`
  return undefined
})
const foldersToken = computed(() => {
  const t = tab.value
  // 审查 M11：任意数量都给摘要，避免选中 1-2 个文件夹时 chip 无生效提示
  if (t.folderFilterIds.length > 0) return `${t.folderFilterIds.length} 项`
  if (t.folderExcludeIds.length > 0) return `-${t.folderExcludeIds.length} 项`
  return undefined
})

/** 二十六轮：保存筛选为智能文件夹（Eagle ic-filter-saved）。
 * 二十九轮 G3：改走 buildFiltersSpec() 单一映射源。此前这里手抄了一份映射，
 * 把「未标签/排除标签/排除评分/排除格式/排除文件夹/排除关键词/形状/比例/尺寸」
 * 全算成"规则表达不了"，而 buildSmartAlbumWhere 早就支持这些谓词——
 * 用户照 toast 提示以为丢了条件，实际是这里没写。搜索词里只有"语义档那条"带得过去
 * （存成 semanticQuery，编辑器有对应输入框），关键词档仍然单独播报。 */
function saveAsSmartAlbum(): void {
  const rules = buildFiltersSpec()
  const unmapped: string[] = []
  const kw = tab.value.searchKeyword.trim()
  // 语义档下这条查询本来就是"按画面内容"的意思，能原样存成 semanticQuery；
  // 关键词那一档仍然带不过去（编辑器没有它的位置，硬塞会在下次编辑时静默消失）
  if (kw && semantic.enabled.value && semantic.state.value.ranQuery === kw) {
    rules.semanticQuery = kw
  } else if (kw) {
    unmapped.push('搜索关键词')
  }
  if (Object.keys(rules).length === 0) {
    useToast().info('当前没有可保存的筛选条件')
    return
  }
  if (unmapped.length > 0) {
    useToast().info(`以下筛选条件不会带入智能文件夹：${unmapped.join('、')}`)
  }
  actions.openSmartAlbumModal(null, rules)
}

/**
 * 应用筛选预设：先清一遍维度筛选，再把规则摊回 chip。
 * 不清就会和上一个视图遗留的筛选叠加成 AND——用户按的是预设，看到的是混合结果。
 * 表达不了的项（如按 id 存的标签）明确播报，不静默丢。
 */
function applySavedFilterRules(rules: SmartAlbumRules): void {
  const { fields, scopes, unsupported } = rulesToFilters(rules)
  tabs.clearDimensionFilters()
  Object.assign(tabs.active, fields)
  if (!('searchKeyword' in fields)) tabs.active.searchKeyword = ''
  if (scopes) saveSearchScopes(scopes)
  tabs.persist()
  if (unsupported.length > 0) {
    useToast().info(`预设里有 ${unsupported.length} 项没法在筛选行显示：${unsupported.join('、')}`)
  }
}

// ── 未固定但已激活的维度 → chips 提示 + 一键清除（对齐 Eagle 行为） ──

const unpinnedActive = computed<DimensionId[]>(() => {
  return dimOrder.value.filter(
    (id) => !pinned.value.includes(id) && id !== 'aiImage' && id !== 'aiSemantic' && isDimActive(id)
  )
})

function isDimActive(id: DimensionId): boolean {
  switch (id) {
    case 'color':
      return !!tab.value.colorFilter || !!tab.value.colorClose
    case 'tags':
      return (
        tab.value.tagFilter.length > 0 || tab.value.tagExclude.length > 0 || tab.value.untaggedOnly
      )
    case 'folders':
      return (
        !!tab.value.folderFilter ||
        tab.value.folderFilterIds.length > 0 ||
        tab.value.folderExcludeIds.length > 0
      )
    case 'shape':
      return (
        tab.value.shapeInclude.length > 0 ||
        tab.value.shapeExclude.length > 0 ||
        !!tab.value.ratioFilter
      )
    case 'rating':
      return tab.value.ratingInclude.length > 0 || tab.value.ratingExclude.length > 0
    case 'format':
      return tab.value.formatInclude.length > 0 || tab.value.formatExclude.length > 0
    case 'resolution':
      return !!tab.value.resolutionFilter
    case 'size':
      return !!tab.value.sizeRange
    case 'duration':
      return !!tab.value.durationRange
    case 'notes':
      return !!tab.value.noteKeyword
    case 'url':
      return !!tab.value.urlKeyword
    case 'time':
      return !!tab.value.timeFilter || !!tab.value.customTime
    case 'modifiedDate':
      return !!tab.value.modifiedTimeRange
    case 'aiImage':
    case 'aiSemantic':
      return false
  }
}

function clearDim(id: DimensionId): void {
  switch (id) {
    case 'color':
      tab.value.colorFilter = null
      tab.value.colorClose = null
      break
    case 'tags':
      tab.value.tagFilter = []
      tab.value.tagExclude = []
      tab.value.untaggedOnly = false
      break
    case 'folders':
      tab.value.folderFilter = ''
      tab.value.folderFilterIds = []
      tab.value.folderExcludeIds = []
      break
    case 'shape':
      tab.value.shapeInclude = []
      tab.value.shapeExclude = []
      tab.value.ratioFilter = null
      break
    case 'rating':
      tab.value.ratingInclude = []
      tab.value.ratingExclude = []
      break
    case 'format':
      tab.value.formatInclude = []
      tab.value.formatExclude = []
      break
    case 'resolution':
      tab.value.resolutionFilter = ''
      break
    case 'size':
      tab.value.sizeRange = null
      break
    case 'duration':
      tab.value.durationRange = null
      break
    case 'notes':
      tab.value.noteKeyword = ''
      break
    case 'url':
      tab.value.urlKeyword = ''
      break
    case 'time':
      tab.value.timeFilter = ''
      tab.value.customTime = null
      break
    case 'modifiedDate':
      tab.value.modifiedTimeRange = null
      break
    case 'aiImage':
    case 'aiSemantic':
      break
  }
  tabs.persist()
}

/** 标签/文件夹维度激活态（chip 描边用，含排除/未标签） */
const isTagsActive = computed(
  () => tab.value.tagFilter.length > 0 || tab.value.tagExclude.length > 0 || tab.value.untaggedOnly
)
const isFoldersActive = computed(
  () =>
    !!tab.value.folderFilter ||
    tab.value.folderFilterIds.length > 0 ||
    tab.value.folderExcludeIds.length > 0
)

// ── 筛选状态持久化（审查 P2-3）：任意筛选字段写入后防抖落盘 ──
let persistTimer: number | undefined
watch(
  tab,
  () => {
    window.clearTimeout(persistTimer)
    persistTimer = window.setTimeout(() => tabs.persist(), 250)
  },
  { deep: true }
)
</script>

<template>
  <div
    class="flex min-h-11 shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-line-subtle bg-surface-0 px-4 py-2"
  >
    <!-- 相册/文件夹/智能夹上下文操作 -->
    <template v-if="showSmartActions">
      <span class="text-sm font-medium text-fg-primary">{{
        filters.activeSmartAlbum.value?.name
      }}</span>
      <button class="bar-action" @click="editActiveSmart">编辑规则</button>
      <button class="bar-action text-danger" @click="deleteActiveSmart">删除收藏夹</button>
    </template>
    <template v-else-if="showAlbumActions">
      <span class="text-sm font-medium text-fg-primary">{{ filters.activeAlbum.value?.name }}</span>
      <button class="bar-action" @click="renameActiveAlbum">重命名</button>
      <button class="bar-action text-danger" @click="deleteActiveAlbum">删除相册</button>
    </template>
    <template v-else-if="showFolderActions">
      <!-- 二十四轮（用户反馈）：移除目录名与重命名入口（名称在面包屑/检查器，重命名走右键菜单） -->
      <button class="bar-action text-danger" @click="deleteActiveFolder">删除文件夹</button>
    </template>
    <template v-else-if="filters.isTrashView.value">
      <span class="text-sm font-medium text-fg-primary">回收站</span>
      <button class="bar-action text-danger" @click="actions.handleClearRecycleBin()">
        清空回收站
      </button>
    </template>
    <template v-else-if="filters.isDuplicateView.value">
      <span class="text-sm font-medium text-fg-primary">相似查重</span>
    </template>
    <template v-else-if="filters.isSimilarView.value">
      <span class="text-sm font-medium text-fg-primary">
        与「{{ scan.similarSourceName.value }}」相似
      </span>
    </template>

    <!-- ── 固定维度（池拖拽序 = 展示序） ── -->
    <template v-if="showKindChips">
      <template v-for="dimId in pinnedOrdered" :key="dimId">
        <!-- 颜色 -->
        <DimensionChip
          v-if="dimId === 'color'"
          label="颜色"
          icon="context-menu/ic-filter-item-color"
          :active="!!tab.colorFilter || !!tab.colorClose"
        >
          <template #panel>
            <ColorPickerPanel />
          </template>
        </DimensionChip>

        <!-- 标签（Eagle 式双栏弹层；⌘⇧T 外部打开） -->
        <DimensionChip
          v-else-if="dimId === 'tags'"
          ref="tagsChipRef"
          label="标签"
          icon="context-menu/ic-filter-item-tag"
          :active="isTagsActive"
          :token="tagsToken"
        >
          <template #panel>
            <TagsFilterPanel />
          </template>
        </DimensionChip>

        <!-- 文件夹 -->
        <DimensionChip
          v-else-if="dimId === 'folders'"
          label="文件夹"
          icon="context-menu/ic-filter-item-folder"
          :active="isFoldersActive"
          :token="foldersToken"
        >
          <template #panel>
            <FoldersFilterPanel />
          </template>
        </DimensionChip>

        <!-- 形状（多选 + 比例 + 自定，Eagle 形状弹层） -->
        <DimensionChip
          v-else-if="dimId === 'shape'"
          label="形状"
          icon="context-menu/ic-filter-item-shape"
          :active="isDimActive('shape')"
          :token="shapeToken"
        >
          <template #panel>
            <div class="flex w-52 flex-col py-1">
              <OptionRow
                v-for="o in ORIENTATIONS"
                :key="o.key"
                multiselect
                :label="o.label"
                :state="shapeRowState(o.key)"
                :count="shapeCounts[o.key]"
                :title="shapeRowState(o.key) === 'exclude' ? '右键取消排除' : '左键包含 / 右键排除'"
                @pick="toggleShapeInclude(o.key)"
                @exclude="toggleShapeExclude(o.key)"
              />
              <div class="my-1 border-t border-line-subtle" />
              <template v-for="preset in RATIO_PRESETS" :key="preset.label">
                <OptionRow
                  v-if="ratioVisible(preset.label)"
                  :selected="isRatioActive(preset.ratio)"
                  :label="preset.label"
                  :count="ratioCounts[preset.label]"
                  @pick="toggleRatioPreset(preset.ratio)"
                />
              </template>
              <!-- 自定比例（Eagle「自定」行） -->
              <div class="flex items-center gap-1 px-2 py-1">
                <span class="leaf-radio" />
                <input
                  v-model.number="customW"
                  type="number"
                  min="1"
                  placeholder="宽"
                  class="h-5 w-12 rounded-sm border border-line-default bg-surface-0 px-1 text-[11px] text-fg-primary focus:border-brand-500 focus:outline-none"
                />
                <span class="text-fg-muted">:</span>
                <input
                  v-model.number="customH"
                  type="number"
                  min="1"
                  placeholder="高"
                  class="h-5 w-12 rounded-sm border border-line-default bg-surface-0 px-1 text-[11px] text-fg-primary focus:border-brand-500 focus:outline-none"
                />
                <button
                  type="button"
                  class="h-5 rounded-sm border border-line-default px-1.5 text-[10px] text-fg-secondary transition-colors duration-fast hover:border-brand-400 hover:text-fg-primary"
                  :title="customW && customH ? '应用自定义比例' : '清除比例筛选'"
                  @click="applyCustomRatio"
                >
                  {{ customW && customH ? '应用' : '清除' }}
                </button>
              </div>
              <FilterHintBar :esc="false" />
            </div>
          </template>
        </DimensionChip>

        <!-- 评分（精确星级复选 + 尚未评分，Eagle 评分弹层） -->
        <DimensionChip
          v-else-if="dimId === 'rating'"
          label="评分"
          icon="context-menu/ic-filter-item-rating"
          :active="isDimActive('rating')"
          :token="ratingToken"
        >
          <template #panel>
            <div class="flex w-44 flex-col py-1">
              <OptionRow
                v-for="r in RATING_OPTIONS"
                :key="r"
                multiselect
                :label="ratingLabel(r)"
                :state="ratingRowState(r)"
                :count="ratingCounts[r] ?? 0"
                :title="ratingRowState(r) === 'exclude' ? '右键取消排除' : '左键包含 / 右键排除'"
                @pick="toggleRatingInclude(r)"
                @exclude="toggleRatingExclude(r)"
              />
            </div>
          </template>
        </DimensionChip>

        <!-- 格式（多选 + 搜索 + 提示条，Eagle 格式弹层） -->
        <DimensionChip
          v-else-if="dimId === 'format'"
          label="格式"
          icon="context-menu/ic-filter-item-ext"
          :active="isDimActive('format')"
          :token="formatToken"
        >
          <template #panel>
            <div class="flex w-56 flex-col">
              <div class="flex items-center gap-2 border-b border-line-subtle px-3 py-2">
                <AppIcon icon="ic_search" :size="13" class="shrink-0 text-fg-muted" />
                <input
                  v-model="formatSearch"
                  type="text"
                  placeholder="搜索..."
                  class="h-5 min-w-0 flex-1 bg-transparent text-[11px] text-fg-primary placeholder:text-fg-muted focus:outline-none"
                />
              </div>
              <div class="max-h-64 overflow-y-auto py-1 app-scroll">
                <OptionRow
                  v-for="f in visibleFormats"
                  :key="f"
                  multiselect
                  :label="f"
                  :state="formatRowState(f)"
                  :count="formatCounts[f] ?? 0"
                  :title="formatRowState(f) === 'exclude' ? '右键取消排除' : '左键包含 / 右键排除'"
                  @pick="toggleFormatInclude(f)"
                  @exclude="toggleFormatExclude(f)"
                />
                <p v-if="visibleFormats.length === 0" class="px-3 py-2 text-[11px] text-fg-muted">
                  暂无格式
                </p>
              </div>
              <FilterHintBar />
            </div>
          </template>
        </DimensionChip>

        <!-- 尺寸（分辨率预设 + 计数） -->
        <DimensionChip
          v-else-if="dimId === 'resolution'"
          label="尺寸"
          icon="context-menu/ic-filter-item-resolution"
          :active="!!tab.resolutionFilter"
        >
          <template #panel="{ close }">
            <div class="flex w-44 flex-col py-1">
              <OptionRow
                :selected="!tab.resolutionFilter"
                label="任意尺寸"
                @pick="clearResolution(close)"
              />
              <OptionRow
                v-for="r in ['1k', '2k', '4k'] as const"
                :key="r"
                :selected="tab.resolutionFilter === r"
                :label="`≥ ${r.toUpperCase()}`"
                :count="resolutionCounts[r]"
                @pick="pickResolution(r, close)"
              />
            </div>
          </template>
        </DimensionChip>

        <!-- 添加日期（预设 + 自定义区间） -->
        <DimensionChip
          v-else-if="dimId === 'time'"
          label="添加日期"
          icon="context-menu/ic-filter-item-import"
          :active="!!tab.timeFilter || !!tab.customTime"
        >
          <template #panel="{ close }">
            <div class="flex w-52 flex-col py-1">
              <OptionRow :selected="!tab.timeFilter" label="全部时间" @pick="clearTime(close)" />
              <OptionRow
                v-for="t in TIME_PRESET_KEYS"
                :key="t"
                :selected="tab.timeFilter === t"
                :label="TIME_PRESET_LABEL[t]"
                :count="timeCounts[t]"
                @pick="pickTime(t, close)"
              />
              <div class="my-1 border-t border-line-subtle" />
              <div class="flex items-center gap-1 px-2 py-1">
                <input
                  type="date"
                  :value="toDateInput(tab.customTime?.[0] ?? null)"
                  class="h-5 w-full rounded-sm border border-line-default bg-surface-0 px-1 text-[10px] text-fg-primary focus:border-brand-500 focus:outline-none"
                  @change="onFromDate"
                />
                <span class="text-fg-muted">~</span>
                <input
                  type="date"
                  :value="toDateInput(tab.customTime?.[1] ?? null)"
                  class="h-5 w-full rounded-sm border border-line-default bg-surface-0 px-1 text-[10px] text-fg-primary focus:border-brand-500 focus:outline-none"
                  @change="onToDate"
                />
              </div>
              <button
                v-if="tab.customTime"
                type="button"
                class="mx-2 mt-0.5 text-left text-[10px] text-fg-muted transition-colors duration-fast hover:text-danger"
                @click="clearCustomTime"
              >
                清除自定义区间
              </button>
            </div>
          </template>
        </DimensionChip>

        <!-- 大小（预设 + 自定义区间） -->
        <DimensionChip
          v-else-if="dimId === 'size'"
          label="大小"
          icon="context-menu/ic-filter-item-size"
          :active="!!tab.sizeRange"
        >
          <template #panel="{ close }">
            <div class="flex w-52 flex-col py-1">
              <OptionRow :selected="!tab.sizeRange" label="任意大小" @pick="clearSize(close)" />
              <OptionRow
                v-for="p in SIZE_PRESETS"
                :key="p.key"
                :selected="sizeKey === p.key"
                :label="p.label"
                :count="sizeCounts[p.key]"
                @pick="pickSize(p.key, close)"
              />
              <div class="my-1 border-t border-line-subtle" />
              <div class="flex items-center gap-1 px-2 py-1">
                <input
                  type="number"
                  min="0"
                  :value="minKb"
                  placeholder="最小 KB"
                  class="h-5 w-full rounded-sm border border-line-default bg-surface-0 px-1 text-[10px] text-fg-primary focus:border-brand-500 focus:outline-none"
                  @input="onMinKb"
                />
                <span class="text-fg-muted">~</span>
                <input
                  type="number"
                  min="0"
                  :value="maxKb"
                  placeholder="最大 KB"
                  class="h-5 w-full rounded-sm border border-line-default bg-surface-0 px-1 text-[10px] text-fg-primary focus:border-brand-500 focus:outline-none"
                  @input="onMaxKb"
                />
              </div>
            </div>
          </template>
        </DimensionChip>

        <!-- 时长 -->
        <DimensionChip
          v-else-if="dimId === 'duration'"
          label="时长"
          icon="context-menu/ic-filter-item-duration"
          :active="!!tab.durationRange"
        >
          <template #panel="{ close }">
            <div class="flex w-44 flex-col py-1">
              <OptionRow
                :selected="!tab.durationRange"
                label="任意时长"
                @pick="clearDuration(close)"
              />
              <OptionRow
                v-for="p in DURATION_PRESETS"
                :key="p.key"
                :selected="durationKey === p.key"
                :label="p.label"
                :count="durationCounts[p.key]"
                @pick="pickDuration(p.key, close)"
              />
            </div>
          </template>
        </DimensionChip>

        <!-- 注释（描述关键词） -->
        <DimensionChip
          v-else-if="dimId === 'notes'"
          label="注释"
          icon="context-menu/ic-filter-item-note"
          :active="!!tab.noteKeyword"
        >
          <template #panel>
            <div class="flex w-52 flex-col gap-1 p-2">
              <input
                v-model="tab.noteKeyword"
                type="text"
                placeholder="描述包含…"
                class="h-6 w-full rounded-sm border border-line-default bg-surface-0 px-1.5 text-[11px] text-fg-primary placeholder:text-fg-muted focus:border-brand-500 focus:outline-none"
              />
              <label
                class="flex cursor-pointer items-center gap-1.5 text-[11px] text-fg-secondary"
                title="开：描述与关键词完全一致才算命中（Eagle「完全相等」）"
              >
                <input v-model="tab.noteKeywordExact" type="checkbox" class="accent-brand-500" />
                完全相等
              </label>
              <button
                v-if="tab.noteKeyword"
                type="button"
                class="text-left text-[10px] text-fg-muted transition-colors duration-fast hover:text-danger"
                @click="clearNoteKeyword"
              >
                清除
              </button>
            </div>
          </template>
        </DimensionChip>

        <!-- 链接（来源 URL 关键词） -->
        <DimensionChip
          v-else-if="dimId === 'url'"
          label="链接"
          icon="context-menu/ic-filter-item-url"
          :active="!!tab.urlKeyword"
        >
          <template #panel>
            <div class="flex w-52 flex-col gap-1 p-2">
              <input
                v-model="tab.urlKeyword"
                type="text"
                placeholder="来源 URL 包含…"
                class="h-6 w-full rounded-sm border border-line-default bg-surface-0 px-1.5 text-[11px] text-fg-primary placeholder:text-fg-muted focus:border-brand-500 focus:outline-none"
              />
              <label
                class="flex cursor-pointer items-center gap-1.5 text-[11px] text-fg-secondary"
                title="开：URL 与关键词完全一致才算命中（Eagle「完全相等」）"
              >
                <input v-model="tab.urlKeywordExact" type="checkbox" class="accent-brand-500" />
                完全相等
              </label>
              <button
                v-if="tab.urlKeyword"
                type="button"
                class="text-left text-[10px] text-fg-muted transition-colors duration-fast hover:text-danger"
                @click="clearUrlKeyword"
              >
                清除
              </button>
            </div>
          </template>
        </DimensionChip>

        <!-- 修改日期（预设 + 自定义区间） -->
        <DimensionChip
          v-else-if="dimId === 'modifiedDate'"
          label="修改日期"
          icon="context-menu/ic-filter-item-modify"
          :active="!!tab.modifiedTimeRange"
        >
          <template #panel="{ close }">
            <div class="flex w-52 flex-col py-1">
              <OptionRow
                :selected="!tab.modifiedTimeRange"
                label="全部修改时间"
                @pick="clearModified(close)"
              />
              <OptionRow
                v-for="p in MOD_PRESETS"
                :key="p.key"
                :selected="modKey === p.key"
                :label="p.label"
                :count="modCounts[p.key]"
                @pick="pickMod(p.key, close)"
              />
              <div class="my-1 border-t border-line-subtle" />
              <div class="flex items-center gap-1 px-2 py-1">
                <input
                  type="date"
                  :value="toDateInput(tab.modifiedTimeRange?.[0] ?? null)"
                  class="h-5 w-full rounded-sm border border-line-default bg-surface-0 px-1 text-[10px] text-fg-primary focus:border-brand-500 focus:outline-none"
                  @change="onModFrom"
                />
                <span class="text-fg-muted">~</span>
                <input
                  type="date"
                  :value="toDateInput(tab.modifiedTimeRange?.[1] ?? null)"
                  class="h-5 w-full rounded-sm border border-line-default bg-surface-0 px-1 text-[10px] text-fg-primary focus:border-brand-500 focus:outline-none"
                  @change="onModTo"
                />
              </div>
            </div>
          </template>
        </DimensionChip>

        <!-- AI 维度：动作 chip（触发搜索模式，无取值面板） -->
        <button
          v-else-if="dimId === 'aiSemantic'"
          type="button"
          class="flex h-6 items-center gap-1 rounded-sm border px-1.5 text-[11px] transition-colors duration-fast"
          :class="
            tab.aiSearchMode
              ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-fg-secondary hover:bg-surface-hover hover:text-fg-primary'
          "
          title="切换 AI 语义搜索（自然语言找图）"
          @click="toggleAiSearchMode"
        >
          <AppIcon icon="context-menu/ic-filter-item-semantic" :size="14" />
          语义搜索
          <span
            class="rounded-sm bg-brand-500/15 px-0.5 text-[9px] leading-3 text-brand-600 dark:text-brand-400"
            >AI</span
          >
        </button>
        <button
          v-else-if="dimId === 'aiImage'"
          type="button"
          class="flex h-6 items-center gap-1 rounded-sm border border-transparent px-1.5 text-[11px] text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg-primary"
          title="以图找图（选择外部图片，搜索引擎搜图）"
          @click="actions.reverseImageSearch()"
        >
          <AppIcon icon="context-menu/ic-filter-item-image" :size="14" />
          以图找图
          <span
            class="rounded-sm bg-brand-500/15 px-0.5 text-[9px] leading-3 text-brand-600 dark:text-brand-400"
            >AI</span
          >
        </button>
      </template>

      <!-- 「＋」维度池弹层（DimensionPoolPopover，与 TitleBar 漏斗同源） -->
      <DimensionPoolPopover :pinned="pinned" @toggle="togglePin" @reorder="onReorder">
        <template #default="{ toggle }">
          <button
            type="button"
            class="flex h-6 items-center gap-1 rounded-sm border border-line-default px-1.5 text-[11px] text-fg-secondary transition-colors duration-fast hover:border-brand-400"
            title="添加筛选维度"
            @click="toggle"
          >
            <AppIcon icon="ic-filter-add" :size="13" />
          </button>
        </template>
      </DimensionPoolPopover>

      <!-- 未固定但已激活的维度 → 可清除 chips -->
      <button
        v-for="id in unpinnedActive"
        :key="`active-${id}`"
        type="button"
        class="flex h-6 items-center gap-1 rounded-full border border-brand-500 bg-brand-500/10 px-2 text-[11px] text-brand-600 dark:text-brand-400"
        :title="`${DIMENSION_LABEL[id]}筛选生效，点击清除`"
        @click="clearDim(id)"
      >
        {{ DIMENSION_LABEL[id] }}
        <AppIcon icon="ic-modal-close" :size="11" />
      </button>
    </template>

    <div class="min-w-2 flex-1" />

    <!-- 筛选预设（不依赖当前有无筛选：应用预设本身就是入口） -->
    <SavedFiltersPopover :current-rules="buildFiltersSpec()" @apply="applySavedFilterRules" />

    <!-- ── 生效态行尾动作（Eagle：保存筛选 / 锁定筛选 / 清除全部） ── -->
    <template v-if="showKindChips && (hasFilters || tabs.filterLocked)">
      <button
        type="button"
        class="flex h-6 items-center rounded-sm px-1.5 text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg-primary"
        title="保存当前筛选为智能文件夹"
        @click="saveAsSmartAlbum"
      >
        <AppIcon icon="ic-filter-saved" :size="14" />
      </button>
      <button
        type="button"
        class="flex h-6 items-center rounded-sm px-1.5 transition-colors duration-fast hover:bg-surface-hover"
        :class="
          tabs.filterLocked
            ? 'text-brand-600 dark:text-brand-400'
            : 'text-fg-secondary hover:text-fg-primary'
        "
        :title="tabs.filterLocked ? '已锁定：切换视图时保留筛选' : '锁定筛选（切换视图时保留）'"
        @click="tabs.toggleFilterLock()"
      >
        <AppIcon icon="ic-filter-lock" :size="14" />
      </button>
      <button
        v-if="hasFilters"
        type="button"
        class="flex h-6 items-center rounded-sm px-1.5 text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-danger"
        title="清除全部筛选"
        @click="tabs.clearDimensionFilters()"
      >
        <AppIcon icon="ic-filter-reset" :size="14" />
      </button>
    </template>
  </div>
</template>

<style scoped>
.bar-action {
  @apply h-6 rounded-sm px-1.5 text-xs text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg-primary;
}
</style>
