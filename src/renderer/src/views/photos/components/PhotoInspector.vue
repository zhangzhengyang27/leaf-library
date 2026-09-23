<script setup lang="ts">
/**
 * PhotoInspector · 常驻属性/信息面板（§3 L2）
 *
 * - 选中 1 张：展示元数据（尺寸/大小/时长/路径/创建时间/EXIF/主色），并就地编辑
 *   标签（增删）、备注（失焦即存）、星级评分、收藏。
 * - 选中多张：切换为「批量编辑」态，统一应用标签 / 评分 / 备注（调用既有批量 action）。
 * 默认随选中态展开，关闭即清空选择。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import PluginSandbox from '@components/plugins/PluginSandbox.vue'
import type { InstalledPlugin } from '@renderer/types/plugin'
import { Map as MLMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Photo } from '../../../types/photo'
import { KIND_LABELS, isEditableImageFile } from '@shared/assetTypes'
import { buildItemLink } from '@shared/deepLink'
import type { PhotoAnnotation } from '@shared/annotations'
import { usePhotoData } from '../composables/usePhotoData'
import { usePhotoActions } from '../composables/usePhotoActions'
import { useWallpaper } from '../composables/useWallpaper'
import { useContextMenu, type MenuItem } from '@composables/useContextMenu'
import { useDialogs } from '../composables/useDialogs'
import { useToast } from '@composables/useToast'
import { useTheme } from '@composables/useTheme'
import { mediaUrl } from '@renderer/utils/mediaPath'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import { useLibraryCommandPalette } from '@composables/useLibraryCommandPalette'

/**
 * 代码审查 P0-11：props 从 photoIds（内部再 find）改为直接接收 Photo[]，
 * 由父层用 Map 索引 O(1) 解析，避免每次 allPhotos 变化都 O(N×M) 重算。
 */
const props = withDefaults(
  defineProps<{
    photos: Photo[]
    /** R5 高级模式（F8）：信息全展开（完整路径/哈希/秒级时间/EXIF 不截断） */
    expanded?: boolean
  }>(),
  { expanded: false }
)

const emit = defineEmits<{
  close: []
  'open-folder': [folderId: string]
  'add-to-folder': []
  /** F11 收尾：重新定位完成后父级刷新全库 */
  relinked: []
}>()

const data = usePhotoData()
const actions = usePhotoActions()
const wallpaper = useWallpaper()
const palette = useLibraryCommandPalette()

const photos = computed<Photo[]>(() => props.photos)
const single = computed<Photo | null>(() => (photos.value.length === 1 ? photos.value[0] : null))

/** R3：所属文件夹链（根→叶；Leaf 模型为单文件夹归属） */
const folderChain = computed(() => {
  const fid = single.value?.folderId
  if (!fid) return []
  const byId = new Map(data.folders.value.map((f) => [f.id, f]))
  const chain: Array<{ id: string; name: string }> = []
  let cur = byId.get(fid)
  let guard = 0
  while (cur && guard < 32) {
    chain.unshift({ id: cur.id, name: cur.name })
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
    guard += 1
  }
  return chain
})
const isBatch = computed(() => photos.value.length > 1)

// —— 阶段 5.1 检查器插件扩展点（category=inspector 的插件渲染到面板底部） ——
const inspectorPlugins = ref<InstalledPlugin[]>([])
onMounted(async () => {
  try {
    const list = await window.api.plugins.list()
    inspectorPlugins.value = list.filter((p) => p.category === 'inspector')
  } catch {
    inspectorPlugins.value = []
  }
})

/** 注入给插件的当前素材摘要（白名单字段，避免暴露 filePath 等敏感路径） */
const pluginPayload = computed(() => {
  const p = single.value
  if (!p) return null
  return {
    id: p.id,
    fileName: p.fileName,
    kind: p.kind,
    width: p.width ?? null,
    height: p.height ?? null,
    fileSize: p.fileSize,
    rating: p.rating,
    isFavorite: p.isFavorite,
    tags: p.tags,
    description: p.description ?? null,
    durationMs: p.durationMs ?? null,
    thumbUrl: `thumb://256/${p.id}`,
    bigThumbUrl: `thumb://1024/${p.id}`,
    // F20 插件扩展字段（白名单元数据，不含任何磁盘路径）
    ext: (p.fileName.split('.').pop() ?? '').toLowerCase(),
    cameraModel: p.cameraModel ?? null,
    lensModel: p.lensModel ?? null,
    iso: p.iso ?? null,
    aperture: p.aperture ?? null,
    shutter: p.shutter ?? null,
    focalLength: p.focalLength ?? null,
    latitude: p.latitude ?? null,
    longitude: p.longitude ?? null,
    takenAt: p.takenAt ?? null,
    importedAt: p.importedAt,
    sourceUrl: p.sourceUrl ?? null
  }
})

// 单图：备注草稿（失焦即存）
const descDraft = ref('')
watch(
  () => single.value?.id,
  () => {
    descDraft.value = single.value?.description ?? ''
  },
  { immediate: true }
)

const newSingleTag = ref('')
const newBatchTag = ref('')
const batchDesc = ref('')
const batchRating = ref(0)

// —— 二十一轮：Eagle「＋ 添加标签」按钮 ——点击就地展开输入框，提交/失焦收回
const tagInputOpen = ref(false)
const tagInputEl = ref<HTMLInputElement | null>(null)
watch(tagInputOpen, (open) => {
  if (open) nextTick(() => tagInputEl.value?.focus())
})

/** 评分：点击当前星级=清除（Eagle 无独立「清除」钮） */
function toggleRating(r: number): void {
  void setRating(single.value?.rating === r ? 0 : r)
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
function fmtDate(ms?: number, full = false): string {
  if (!ms) return '—'
  const d = new Date(ms)
  // 十五轮 B7：对齐 Eagle 斜杠式 `YYYY/MM/DD HH:mm`（R5 高级模式补秒）
  const p = (n: number): string => String(n).padStart(2, '0')
  const ymd = `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`
  const hms = `${p(d.getHours())}:${p(d.getMinutes())}${full ? `:${p(d.getSeconds())}` : ''}`
  return `${ymd} ${hms}`
}
function fmtDuration(ms?: number): string {
  if (!ms) return '—'
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

async function saveDescription(): Promise<void> {
  if (!single.value) return
  await actions.handleSetDescription(single.value.id, descDraft.value.trim())
}
async function addSingleTag(): Promise<void> {
  if (!single.value || !newSingleTag.value.trim()) return
  await actions.handleAddTag(single.value.id, newSingleTag.value.trim())
  newSingleTag.value = ''
  tagInputOpen.value = false
}
async function removeSingleTag(tag: string): Promise<void> {
  if (!single.value) return
  await actions.handleRemoveTag(single.value.id, tag)
}
async function setRating(r: number): Promise<void> {
  if (!single.value) return
  await actions.handleSetRating(single.value.id, r)
}
async function toggleFavorite(): Promise<void> {
  if (!single.value) return
  await actions.handleToggleFavorite(single.value.id)
}

// —— 三轮 G11：Eagle 式检查器结构（就地名称/置顶/导出）——

/** 十五轮 B6：Eagle 名称框只显纯名，扩展名在预览徽标上；保存时自动拼回 */
function pureNameOf(fileName: string): string {
  const i = fileName.lastIndexOf('.')
  return i > 0 ? fileName.slice(0, i) : fileName
}
function extWithDotOf(fileName: string): string {
  const i = fileName.lastIndexOf('.')
  return i > 0 ? fileName.slice(i) : ''
}

/** 名称就地编辑草稿（Eagle：名称 textarea 直接可编辑） */
const nameDraft = ref('')
watch(
  () => single.value?.id,
  () => {
    nameDraft.value = single.value ? pureNameOf(single.value.fileName) : ''
  },
  { immediate: true }
)

/** 单选重命名：字面量写入（pattern 不含 {n}）；用户没写扩展名时自动补原扩展名 */
/**
 * 已提交过的目标名（审查 P3-44 的正确形态）。Enter 提交后 blur 会再触发一次，
 * 去重键是「本次要写入的名字」本身：切换素材（下方 watch 清空）或改成别的名字
 * 都会重新放行。早先用布尔标志做奇偶翻转，成功路径与同名早退路径都不复位，
 * 于是隔一次改名就被静默吞掉。
 */
let committedName: string | null = null
watch(
  () => single.value?.id,
  () => {
    committedName = null
  }
)
async function commitName(): Promise<void> {
  const p = single.value
  if (!p) return
  const trimmed = nameDraft.value.trim()
  const ext = extWithDotOf(p.fileName)
  const target = ext && trimmed.toLowerCase().endsWith(ext.toLowerCase()) ? trimmed : trimmed + ext
  if (!trimmed || target === p.fileName) return
  if (committedName === target) return
  committedName = target
  try {
    const result = await window.api.photos.renamePhotos([{ id: p.id, pattern: target, start: 1 }])
    if (result.renamed.length > 0) {
      toast.success('已重命名', { description: result.renamed[0].fileName })
      await data.loadPhotos()
    } else if (result.conflicts.length > 0) {
      toast.error('重命名失败', { description: '同目录下已存在同名文件' })
      nameDraft.value = pureNameOf(p.fileName)
      committedName = null // 允许用户换个名字或直接重试
    }
  } catch (error) {
    committedName = null
    toast.error('重命名失败', { description: (error as Error).message })
  }
}

/** 置顶（Eagle：检查器右上 pin） */
async function togglePinned(): Promise<void> {
  const p = single.value
  if (!p) return
  try {
    const updated = await window.api.photos.setPinned(p.id, !p.pinnedAt)
    if (updated) data.replacePhotoLocal(updated)
  } catch (error) {
    toast.error('置顶失败', { description: (error as Error).message })
  }
}

// —— P1 标注 comments[]（Eagle 的招牌差异之一）——
// 这里先做"素材级批注"的可用面：列表、加、删。区域批注（rect）与时间点（atMs）由预览的
// 框选 overlay 填，那张图此刻正被同仓另一个会话在飞改写；两边共用 @shared/annotations
// 那一份形状与上限，主进程仍然逐条复核（渲染层递来的数字不可信）。
const annotations = ref<PhotoAnnotation[]>([])
const annotationDraft = ref('')
const annotationBusy = ref(false)
const annotationError = ref('')

watch(
  () => single.value?.id,
  async (id) => {
    annotations.value = []
    annotationDraft.value = ''
    annotationError.value = ''
    if (!id) return
    try {
      annotations.value = await window.api.annotations.list(id)
    } catch {
      /* 读不到就当没有：换素材时的失败不该盖掉整个检查器 */
    }
  },
  { immediate: true }
)

/** 条目前面的位置标记：时间点 > 区域尺寸 > 无 */
function annotationStamp(a: PhotoAnnotation): string {
  if (a.atMs !== undefined) {
    const total = Math.round(a.atMs / 1000)
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
  }
  if (a.rect) return `${Math.round(a.rect.w)}×${Math.round(a.rect.h)}`
  return ''
}

async function addAnnotation(): Promise<void> {
  const p = single.value
  const body = annotationDraft.value.trim()
  if (!p || !body || annotationBusy.value) return
  annotationBusy.value = true
  annotationError.value = ''
  try {
    const r = await window.api.annotations.create(p.id, { body })
    if (!r.ok) {
      annotationError.value = r.error ?? '保存失败'
      return
    }
    annotations.value = r.items ?? []
    annotationDraft.value = ''
  } catch (error) {
    annotationError.value = (error as Error).message
  } finally {
    annotationBusy.value = false
  }
}

async function removeAnnotation(id: string): Promise<void> {
  const p = single.value
  if (!p) return
  try {
    const r = await window.api.annotations.remove(id, p.id)
    if (!r.ok) {
      toast.error('没能删除标注', { description: r.error })
      return
    }
    annotations.value = r.items ?? []
  } catch (error) {
    toast.error('没能删除标注', { description: (error as Error).message })
  }
}

// —— 六轮：来源链接（Eagle 检查器 http:// 字段）——

const urlDraft = ref('')
watch(
  () => single.value?.id,
  () => {
    urlDraft.value = single.value?.sourceUrl ?? ''
  },
  { immediate: true }
)

async function saveSourceUrl(): Promise<void> {
  const p = single.value
  if (!p) return
  const trimmed = urlDraft.value.trim()
  if ((p.sourceUrl ?? '') === trimmed) return
  // 清空必须传 null——undefined 会被 updatePhoto 的「未指定不更新」守卫跳过。
  // 注意走单张通道：批量 updatePhotos 只持久化评分/描述/收藏/查看时间，不含 source_url
  const updated = await window.api.photos.update(p.id, { sourceUrl: trimmed || null })
  if (updated) data.replacePhotoLocal(updated)
  toast.success('已保存链接')
}

/** 六轮：文件夹 chip × 直接移出（Eagle 检查器形态，无确认弹窗） */
async function removeFromFolder(): Promise<void> {
  const p = single.value
  if (!p?.folderId) return
  await window.api.photos.assignPhotosToFolder(null, [p.id])
  await data.loadFolders()
  await data.loadPhotos()
  toast.success('已移出文件夹')
}

async function exportSingle(): Promise<void> {
  const p = single.value
  if (p) void actions.exportSelected([p.id])
}

/** 十五轮 B4：主色板色点（palette 优先，退化单主色；Eagle 预览下方色点行） */
const paletteColors = computed<string[]>(() => {
  const p = single.value
  if (!p) return []
  if (p.palette && p.palette.length > 0) return p.palette
  return p.colorDominant ? [p.colorDominant] : []
})

/** 十五轮 B9：右下 ? 帮助钮 → 命令面板（快捷键/命令速查入口） */
function openHelp(): void {
  palette.open()
}

/** 类型徽标（Eagle：检查器左上角 PNG 徽标） */
const kindBadge = computed(() => {
  const p = single.value
  if (!p) return ''
  const i = p.fileName.lastIndexOf('.')
  return i >= 0 ? p.fileName.slice(i + 1).toUpperCase() : KIND_LABELS[p.kind]
})

/** 基本信息 · 格式（扩展名） */
function extLabel(p: Photo): string {
  const i = p.fileName.lastIndexOf('.')
  return i >= 0 ? p.fileName.slice(i + 1).toUpperCase() : '—'
}

// —— 批量编辑 ——
async function applyBatchTag(): Promise<void> {
  if (!newBatchTag.value.trim()) return
  await actions.addTagToMany(
    props.photos.map((p) => p.id),
    newBatchTag.value.trim()
  )
  newBatchTag.value = ''
}
async function applyBatchRating(r: number): Promise<void> {
  await actions.handleBatchUpdate(
    props.photos.map((p) => p.id),
    { rating: r }
  )
  batchRating.value = r
}
async function applyBatchDescription(): Promise<void> {
  await actions.handleBatchUpdate(
    props.photos.map((p) => p.id),
    {
      description: batchDesc.value.trim()
    }
  )
}

// —— 阶段 4.2 · EXIF 区块 ——

const hasExif = computed(() => {
  const p = single.value
  if (!p) return false
  return Boolean(
    p.cameraModel ||
    p.lensModel ||
    p.iso ||
    p.aperture ||
    p.shutter ||
    p.focalLength ||
    hasGps.value
  )
})

/** 合法坐标含 0（赤道/本初子午线），必须用 != null 判断 */
const hasGps = computed(() => {
  const p = single.value
  return p != null && p.latitude != null && p.longitude != null
})

const exifRows = computed<Array<{ label: string; value: string }>>(() => {
  const p = single.value
  if (!p) return []
  const rows: Array<{ label: string; value: string }> = []
  if (p.takenAt) rows.push({ label: '拍摄', value: fmtDate(p.takenAt, props.expanded) })
  if (p.cameraModel) rows.push({ label: '相机', value: p.cameraModel })
  if (p.lensModel) rows.push({ label: '镜头', value: p.lensModel })
  if (p.iso) rows.push({ label: 'ISO', value: String(p.iso) })
  if (p.aperture) rows.push({ label: '光圈', value: `f/${p.aperture}` })
  if (p.shutter) rows.push({ label: '快门', value: p.shutter })
  if (p.focalLength) rows.push({ label: '焦距', value: `${p.focalLength}mm` })
  if (hasGps.value) {
    rows.push({
      label: 'GPS',
      value: `${p.latitude!.toFixed(props.expanded ? 6 : 4)}, ${p.longitude!.toFixed(
        props.expanded ? 6 : 4
      )}`
    })
  }
  return rows
})

/** R5 高级模式：250px 窄栏常态放不下、也不该占位的排障字段 */
const advancedRows = computed<Array<{ label: string; value: string; reveal?: boolean }>>(() => {
  const p = single.value
  if (!p || !props.expanded) return []
  const rows: Array<{ label: string; value: string; reveal?: boolean }> = [
    { label: '文件路径', value: p.filePath }
  ]
  // D-020 后拷贝行的 file_path 只是库里那份副本；用户真正想跳的是它在磁盘上的出处，
  // 所以这行多给一颗「显示」（主进程按 source_path 过白名单，不是任意路径）
  if (p.sourcePath) rows.push({ label: '原始路径', value: p.sourcePath, reveal: true })
  if (p.width && p.height) {
    rows.push({
      label: '像素总数',
      value: `${((p.width * p.height) / 1e6).toFixed(1)} MP`
    })
  }
  if (p.phash) rows.push({ label: '感知哈希', value: p.phash })
  if (p.hash) rows.push({ label: '内容哈希', value: p.hash })
  return rows
})

// —— ⑤ 检查器区块折叠记忆（Eagle 4.0：区块可折叠并记住状态） ——
// 必须先于下方迷你地图 watch 声明：该 watch 依赖 inspectorCollapsed.exif 且 immediate

const COLLAPSE_KEY = 'leaf.inspector-collapsed'

function loadInspectorCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

const inspectorCollapsed = ref<Record<string, boolean>>(loadInspectorCollapsed())

// —— 阶段 4.2 · 迷你地图（有 GPS 时展示，点击跳地图视图） ——

const tabs = useLibraryTabs()
const { theme } = useTheme()
const miniMapEl = ref<HTMLDivElement | null>(null)
let miniMap: MLMap | null = null

/** 城市标签（Nominatim 反查，失败静默） */
const cityLabel = ref('')

function isDarkNow(): boolean {
  if (theme.value === 'dark') return true
  if (theme.value === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function destroyMiniMap(): void {
  miniMap?.remove()
  miniMap = null
}

function initMiniMap(): void {
  const p = single.value
  if (!miniMapEl.value || !p || p.latitude == null || p.longitude == null) return
  destroyMiniMap()
  const tile = isDarkNow() ? 'dark_all' : 'light_all'
  miniMap = new MLMap({
    container: miniMapEl.value,
    style: {
      version: 8,
      sources: {
        carto: {
          type: 'raster',
          tiles: [
            `https://a.basemaps.cartocdn.com/${tile}/{z}/{x}/{y}@2x.png`,
            `https://b.basemaps.cartocdn.com/${tile}/{z}/{x}/{y}@2x.png`,
            `https://c.basemaps.cartocdn.com/${tile}/{z}/{x}/{y}@2x.png`
          ],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors © CARTO',
          maxzoom: 20
        }
      },
      layers: [{ id: 'basemap', type: 'raster', source: 'carto' }]
    },
    center: [p.longitude, p.latitude],
    zoom: 10,
    // 小地图仅供定位，禁用交互让点击落到覆盖层（跳地图视图）
    interactive: false,
    attributionControl: false
  })
  miniMap.on('load', () => {
    if (!miniMap) return
    new Marker({ color: '#10b981' })
      .setLngLat([p.longitude as number, p.latitude as number])
      .addTo(miniMap)
  })
}

function openInMapView(): void {
  tabs.setView('map', '地图')
}

// 选中项 / GPS / EXIF 折叠态变化时重建迷你地图并反查城市（审查 P2-14：
// 旧 watch 依赖缺折叠态——折叠后容器 v-if 卸载导致旧 maplibre 实例泄漏、
// 重新展开后地图永久空白）
watch(
  () => [single.value?.id, hasGps.value, inspectorCollapsed.value.exif] as const,
  async ([id, gps, exifOpen]) => {
    cityLabel.value = ''
    if (!id || !gps || !exifOpen) {
      destroyMiniMap()
      return
    }
    const p = single.value
    await nextTick()
    initMiniMap()
    if (p?.latitude == null || p?.longitude == null) return
    const info = await window.api.photos.reverseGeocode(p.latitude, p.longitude).catch(() => null)
    // 异步期间可能已切换选中项
    if (info && single.value?.id === id) cityLabel.value = info.city
  },
  { immediate: true }
)

onUnmounted(destroyMiniMap)

// —— 阶段 4.2 · 操作区 ——

const toast = useToast()
const { requestPrompt } = useDialogs()

const canSetWallpaper = computed(() => single.value?.kind === 'image')

function revealInFolder(): void {
  actions.revealInFolder(photos.value)
}

async function copyFiles(): Promise<void> {
  const paths = photos.value.map((p) => p.filePath)
  if (paths.length === 0) return
  try {
    const ok = await window.api.photos.copyToClipboard(paths)
    if (ok) toast.success(`已复制 ${paths.length} 个文件`, { description: '可在 Finder 粘贴' })
    else toast.error('复制失败', { description: '文件不存在或已被移动' })
  } catch (error) {
    toast.error('复制失败', { description: (error as Error).message })
  }
}

/** 在访达里打开出处所在目录。主进程按"有没有素材把这个路径登记为 source_path"过白名单，
 *  所以这里不需要（也不应该）自己判断路径合法性 */
function revealSourcePath(sourcePath: string): void {
  if (!sourcePath) return
  void window.api.photos.showInFolder(sourcePath)
}

/** 复制文档正文（officeparser 抽取） */
async function copyDocText(): Promise<void> {
  const text = single.value?.docText
  if (!text) return
  try {
    const ok = await window.api.photos.copyText(text)
    if (ok) toast.success('已复制文档正文')
    else toast.error('复制失败')
  } catch (error) {
    toast.error('复制失败', { description: (error as Error).message })
  }
}

/** F12：复制 OCR 识别文字 */
async function copyOcrText(): Promise<void> {
  const text = single.value?.ocrText
  if (!text) return
  try {
    const ok = await window.api.photos.copyText(text)
    if (ok) toast.success('已复制图片文字')
    else toast.error('复制失败')
  } catch (error) {
    toast.error('复制失败', { description: (error as Error).message })
  }
}

/**
 * leaf:// 深链（Eagle 检查器旁的「复制 Eagle 链接」）。
 * 只负责显示与复制——形状与合法性都在 @shared/deepLink 那一份里。
 */
const deepLink = computed(() => (single.value ? buildItemLink(single.value.id) : ''))

async function copyDeepLink(): Promise<void> {
  if (!deepLink.value) return
  try {
    const ok = await window.api.photos.copyText(deepLink.value)
    if (ok) toast.success('已复制素材链接')
    else toast.error('复制失败')
  } catch (error) {
    toast.error('复制失败', { description: (error as Error).message })
  }
}

function toggleInspectorSection(key: string): void {
  inspectorCollapsed.value = { ...inspectorCollapsed.value, [key]: !inspectorCollapsed.value[key] }
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(inspectorCollapsed.value))
  } catch {
    /* ignore */
  }
}

/** F11 收尾：断链素材在检查器中重新定位（主进程弹对话框，与右键菜单同一 IPC） */
async function relinkFromInspector(): Promise<void> {
  const p = single.value
  if (!p?.missingAt) return
  try {
    const res = await window.api.storage.relinkPhoto(p.id)
    if (res.ok) {
      toast.success('已重新定位', {
        description: (res.photo as { filePath?: string } | undefined)?.filePath
      })
      emit('relinked')
    } else if (res.error !== '已取消') {
      toast.error('重新定位失败', { description: res.error })
    }
  } catch (error) {
    toast.error('重新定位失败', { description: (error as Error).message })
  }
}

function renameBatch(): void {
  actions.batchRenameOpen.value = true
}

/** 图标按钮放不下二级按钮：点击即展开策略菜单，菜单顶部说明本张图的适配结果 */
/**
 * 就地编辑（旋转/翻转）。一个按钮弹菜单而不是摊成四个键：
 * 编辑是低频动作，底部按钮排已经给了壁纸/导出。
 *
 * 主进程在改之前会先把文件收进库内副本（本库多数素材直接指向桌面上的原文件，
 * 就地改写等于动用户自己的东西），所以这里不提示"原文件会被修改"——
 * 但要说清"库里这份会被改"，撤销不了。
 */
const EDIT_MENU: MenuItem[] = [
  { key: 'rot-l', label: '向左旋转 90°', icon: 'ic-toolbar-rotate' },
  { key: 'rot-r', label: '向右旋转 90°', icon: 'ic-toolbar-rotate' },
  { key: 'rot-180', label: '旋转 180°', icon: 'ic-toolbar-rotate' },
  { key: 'sep', divider: true },
  { key: 'flip-h', label: '水平翻转', icon: 'ic-toolbar-flip' },
  { key: 'flip-v', label: '垂直翻转', icon: 'ic-toolbar-flip' }
]
const editMenu = useContextMenu()
const editing = ref(false)
/** 只有单张、且格式允许原样写回时才给这颗键（HEIC/RAW 点了只会失败） */
const canEditImage = computed(() => {
  const p = single.value
  return !!p && isEditableImageFile(p.fileName)
})

function pickImageEdit(event: MouseEvent): void {
  const p = single.value
  if (!p || editing.value) return
  editMenu.open(event.clientX, event.clientY, EDIT_MENU, (key) => void applyImageEdit(p, key))
}

async function applyImageEdit(p: Photo, key: string): Promise<void> {
  editing.value = true
  try {
    const r =
      key === 'rot-l'
        ? await window.api.edit.rotate(p.id, 270)
        : key === 'rot-r'
          ? await window.api.edit.rotate(p.id, 90)
          : key === 'rot-180'
            ? await window.api.edit.rotate(p.id, 180)
            : key === 'flip-h'
              ? await window.api.edit.flip(p.id, 'horizontal')
              : key === 'flip-v'
                ? await window.api.edit.flip(p.id, 'vertical')
                : { ok: false as const, error: '未知操作' }
    if (!r.ok) {
      toast.error('就地编辑失败', { description: r.error })
      return
    }
    toast.success('已就地修改库内文件', { description: '缩略图与相似度/颜色/向量正在重算' })
    // 宽高/文件大小/主色都变了：让处理管线跑完后由 onProcessing 换入新对象，
    // 这里再主动取一次，避免管线忙时界面停在旧数值
    const updated = await window.api.photos.getById(p.id)
    if (updated) data.replacePhotoLocal(updated)
  } finally {
    editing.value = false
  }
}

function pickWallpaper(event: MouseEvent): void {
  const p = single.value
  if (!p) return
  void wallpaper.openMenu(p, event.clientX, event.clientY)
}
</script>

<template>
  <aside
    class="relative flex h-full w-[var(--shell-inspector-w)] shrink-0 flex-col border-l border-line-default bg-surface-1 animate-in slide-in-right duration-150"
  >
    <!-- Eagle：header 高 48px、内容右对齐、仅图钉（F8 高级模式=信息全展开，不改宽度） -->
    <header class="flex h-12 shrink-0 items-center justify-end border-b border-line-default pr-2">
      <button
        v-if="single"
        type="button"
        class="flex size-6 items-center justify-center rounded-sm transition-colors hover:bg-surface-hover"
        :class="single.pinnedAt ? 'text-brand-500' : 'text-fg-muted hover:text-fg-primary'"
        :title="single.pinnedAt ? '取消置顶' : '置顶'"
        @click="togglePinned"
      >
        <AppIcon icon="ic-toolbar-pin" />
      </button>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto p-3">
      <!-- 单图：六轮对齐 Eagle 结构（预览/名称/注释/链接/标签/文件夹chip/基本信息/EXIF/导出；无快捷图标行） -->
      <template v-if="single">
        <!-- 预览区（Eagle：描边圆角容器 + 左上扩展名徽标，无底色衬垫） -->
        <div
          class="relative mb-3 flex h-40 w-full items-center justify-center overflow-hidden rounded-lg border border-line-default"
        >
          <span
            v-if="kindBadge"
            class="absolute left-0 top-0 z-10 rounded-br-md rounded-tl-lg bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white"
          >
            {{ kindBadge }}
          </span>
          <img
            v-if="single.kind === 'image'"
            :src="`thumb://1024/${single.id}`"
            class="max-h-full max-w-full object-contain"
            alt=""
          />
          <video
            v-else-if="single.kind === 'video'"
            :src="mediaUrl('video', single.filePath)"
            class="max-h-full max-w-full object-contain"
            muted
            controls
          />
          <div v-else class="flex size-full items-center justify-center text-3xl">🎵</div>
        </div>

        <!-- 十五轮 B4：主色板色点行（Eagle：描边胶囊容器内多色点） -->
        <div v-if="paletteColors.length > 0" class="mb-3 flex justify-center" title="主色板">
          <div class="flex items-center gap-2 rounded-full border border-line-default px-3 py-1.5">
            <span
              v-for="(c, i) in paletteColors"
              :key="`${c}-${i}`"
              class="size-4 rounded-full border border-black/10 shadow-sm"
              :style="{ backgroundColor: c }"
            />
          </div>
        </div>

        <!-- 名称就地编辑（Eagle：内嵌深底圆角输入框，实测高 32px） -->
        <input
          v-model="nameDraft"
          type="text"
          aria-label="名称"
          class="h-8 w-full rounded-[10px] border border-transparent bg-surface-hover px-3 text-sm font-medium text-fg-primary focus:outline-none focus:border-brand-500 dark:bg-surface-0"
          @keyup.enter="commitName"
          @blur="commitName"
        />

        <!-- 注释（Eagle：单行 32px 输入框） -->
        <textarea
          v-model="descDraft"
          rows="1"
          placeholder="添加注释"
          class="mt-2 h-8 w-full resize-none rounded-[10px] border border-transparent bg-surface-hover px-3 py-[6px] text-xs leading-[18px] text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-brand-500 dark:bg-surface-0"
          @blur="saveDescription"
        />

        <!-- 六轮：来源链接（Eagle 检查器 http:// 输入框，高 32px） -->
        <input
          v-model="urlDraft"
          type="text"
          placeholder="http://"
          spellcheck="false"
          class="mt-2 h-8 w-full rounded-[10px] border border-transparent bg-surface-hover px-3 text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-brand-500 dark:bg-surface-0"
          @keyup.enter="saveSourceUrl"
          @blur="saveSourceUrl"
        />

        <!-- 标注 comments[]：素材级批注可直接增删；区域/时间点等 overlay 落地后再填 -->
        <div class="mt-3 border-t border-line-default pt-3">
          <p class="mb-2 text-xs text-fg-tertiary">标注（{{ annotations.length }}）</p>
          <ul v-if="annotations.length" class="mb-2 flex flex-col gap-1">
            <li
              v-for="a in annotations"
              :key="a.id"
              class="flex items-start gap-1.5 text-[11px] text-fg-secondary"
            >
              <span
                v-if="annotationStamp(a)"
                class="shrink-0 rounded bg-surface-hover px-1 font-mono text-[10px]"
                >{{ annotationStamp(a) }}</span
              >
              <span class="min-w-0 flex-1 break-words">{{ a.body }}</span>
              <button
                type="button"
                class="shrink-0 text-fg-muted hover:text-danger"
                title="删除这条标注"
                @click="removeAnnotation(a.id)"
              >
                ×
              </button>
            </li>
          </ul>
          <input
            v-model="annotationDraft"
            type="text"
            placeholder="写一条标注，回车保存"
            class="h-8 w-full rounded-[10px] border border-transparent bg-surface-hover px-3 text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-brand-500 dark:bg-surface-0"
            @keyup.enter="addAnnotation"
          />
          <p v-if="annotationError" class="mt-1 text-[11px] text-danger">{{ annotationError }}</p>
        </div>

        <!-- leaf:// 深链：贴进笔记/终端，点了就回到这条素材 -->
        <div class="mt-2 flex items-center gap-2">
          <span
            class="min-w-0 flex-1 truncate rounded-[10px] bg-surface-hover px-3 py-1.5 font-mono text-[11px] text-fg-secondary"
            :title="deepLink"
            >{{ deepLink }}</span
          >
          <button
            type="button"
            class="shrink-0 text-[11px] text-fg-brand hover:underline"
            @click="copyDeepLink"
          >
            复制
          </button>
        </div>

        <!-- 标签（Eagle：分隔线 + 「＋ 添加标签」按钮） -->
        <div class="mt-3 border-t border-line-default pt-3">
          <p class="mb-2 text-xs text-fg-tertiary">标签</p>
          <div class="mb-2 flex flex-wrap gap-1">
            <span
              v-for="t in single.tags"
              :key="t"
              class="group flex items-center gap-1 rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] text-brand-600 dark:text-brand-400"
            >
              {{ t }}
              <button class="hover:text-danger" @click="removeSingleTag(t)">
                <AppIcon icon="ic-modal-close" :size="11" />
              </button>
            </span>
          </div>
          <input
            v-if="tagInputOpen"
            ref="tagInputEl"
            v-model="newSingleTag"
            type="text"
            placeholder="输入标签，回车添加"
            class="h-8 w-full rounded-[10px] border border-line-default bg-surface-hover px-3 text-xs text-fg-primary focus:outline-none focus:border-brand-500"
            @keyup.enter="addSingleTag"
            @blur="tagInputOpen = false"
          />
          <button
            v-else
            type="button"
            class="flex h-8 w-full items-center justify-center gap-1.5 rounded-[10px] bg-surface-2 text-xs text-fg-primary transition-colors duration-fast hover:bg-surface-3"
            @click="tagInputOpen = true"
          >
            <AppIcon icon="ic-inspector-add-label" />
            添加标签
          </button>
        </div>

        <!-- 六轮：文件夹 chip（Eagle：描边圆角 chip + ＋） -->
        <div class="mt-3 border-t border-line-default pt-3">
          <p class="mb-2 text-xs text-fg-tertiary">文件夹</p>
          <div class="flex flex-wrap items-center gap-1.5">
            <span
              v-if="folderChain.length > 0"
              class="flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1 text-xs text-fg-primary"
              :title="`位于 ${folderChain.map((f) => f.name).join(' / ')}`"
            >
              {{ folderChain[folderChain.length - 1].name }}
              <button
                type="button"
                class="text-fg-muted transition-colors hover:text-danger"
                title="移出文件夹"
                @click="removeFromFolder"
              >
                <AppIcon icon="ic-modal-close" :size="11" />
              </button>
            </span>
            <button
              v-if="single.folderId"
              type="button"
              class="flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-[11px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg-primary"
              title="前往所属文件夹"
              @click="$emit('open-folder', single.folderId)"
            >
              <AppIcon icon="ic-arrow-right" :size="12" />
            </button>
            <!-- 十五轮 B8：未归类时也显示 ＋（Eagle 文件夹区块常驻添加钮） -->
            <button
              v-if="!single.folderId"
              type="button"
              class="flex items-center justify-center rounded-sm px-1.5 py-0.5 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg-primary"
              title="添加至文件夹"
              @click="emit('add-to-folder')"
            >
              <AppIcon icon="ic-inspector-add-label" />
            </button>
          </div>
        </div>

        <!-- 基本信息（Eagle：label + 值列左对齐两栏；评分为首行小星星） -->
        <div class="mt-3 border-t border-line-default pt-3">
          <button
            type="button"
            class="mb-2 flex w-full items-center justify-between text-xs text-fg-tertiary hover:text-fg-secondary"
            @click="toggleInspectorSection('info')"
          >
            <span>基本信息</span>
            <span class="text-[10px]">{{ inspectorCollapsed.info ? '▸' : '▾' }}</span>
          </button>
          <!-- F11 收尾：原文件丢失警示 + 就地重新定位 -->
          <div
            v-if="single.missingAt"
            class="mb-2.5 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5"
          >
            <span class="flex-1 text-[11px] text-amber-600 dark:text-amber-400">
              原文件丢失（路径不可访问）
            </span>
            <button
              type="button"
              class="shrink-0 text-[11px] text-fg-brand hover:underline"
              @click="relinkFromInspector"
            >
              重新定位…
            </button>
          </div>
          <dl
            v-show="!inspectorCollapsed.info"
            class="grid grid-cols-[auto_1fr] gap-x-5 gap-y-[7px] text-xs"
          >
            <div class="contents">
              <dt class="text-fg-tertiary">评分</dt>
              <dd class="flex items-center gap-0.5">
                <button
                  v-for="r in 5"
                  :key="r"
                  type="button"
                  class="text-[13px] leading-none transition-colors"
                  :class="
                    r <= single.rating ? 'text-amber-400' : 'text-fg-muted hover:text-amber-300'
                  "
                  :aria-label="`评 ${r} 星`"
                  @click="toggleRating(r)"
                >
                  ★
                </button>
              </dd>
            </div>
            <div v-if="single.width || single.height" class="contents">
              <dt class="text-fg-tertiary">尺寸</dt>
              <dd class="text-fg-secondary">
                {{ single.width || '—' }} × {{ single.height || '—' }}
              </dd>
            </div>
            <div class="contents">
              <dt class="text-fg-tertiary">文件大小</dt>
              <dd class="text-fg-secondary">{{ fmtSize(single.fileSize) }}</dd>
            </div>
            <div class="contents">
              <dt class="text-fg-tertiary">格式</dt>
              <dd class="text-fg-secondary">{{ extLabel(single) }}</dd>
            </div>
            <div v-if="single.kind === 'video' || single.kind === 'audio'" class="contents">
              <dt class="text-fg-tertiary">时长</dt>
              <dd class="text-fg-secondary">{{ fmtDuration(single.durationMs) }}</dd>
            </div>
            <!-- 节拍是估的（迁移 024：能量包络自相关，只看前 120 秒），所以带"≈"并在
                 title 里交代算法边界 —— 慢歌常被读成两倍速，无节拍感的音频干脆没有这行 -->
            <div v-if="single.kind === 'audio' && single.bpm" class="contents">
              <dt class="text-fg-tertiary">节拍</dt>
              <dd
                class="text-fg-secondary"
                title="按前 120 秒的能量包络起拍算出的估计值；慢速素材可能给出两倍速"
              >
                ≈ {{ Math.round(single.bpm) }} BPM
              </dd>
            </div>
            <div class="contents">
              <dt class="text-fg-tertiary">添加日期</dt>
              <dd class="text-fg-secondary">{{ fmtDate(single.importedAt, expanded) }}</dd>
            </div>
            <div class="contents">
              <dt class="text-fg-tertiary">创建日期</dt>
              <dd class="text-fg-secondary">
                {{ fmtDate(single.fsCreatedAt ?? single.createdAt, expanded) }}
              </dd>
            </div>
            <div class="contents">
              <dt class="text-fg-tertiary">修改日期</dt>
              <dd class="text-fg-secondary">
                {{ fmtDate(single.fsModifiedAt ?? single.modifiedAt, expanded) }}
              </dd>
            </div>
            <div v-for="row in advancedRows" :key="row.label" class="contents">
              <dt class="shrink-0 text-fg-tertiary">{{ row.label }}</dt>
              <dd
                class="flex min-w-0 items-start gap-2 break-all select-text text-fg-secondary"
                :title="row.value"
                data-inspector-advanced-row
              >
                <span class="min-w-0 flex-1">{{ row.value }}</span>
                <button
                  v-if="row.reveal"
                  type="button"
                  class="shrink-0 text-[11px] text-fg-brand hover:underline"
                  @click="revealSourcePath(row.value)"
                >
                  显示
                </button>
              </dd>
            </div>
          </dl>
        </div>

        <!-- EXIF 有数据时并入基本信息展示（Eagle 检查器无独立 EXIF 区） -->
        <div v-if="hasExif" class="mt-3 border-t border-line-default pt-3">
          <button
            type="button"
            class="mb-2 flex w-full items-center justify-between text-xs text-fg-tertiary hover:text-fg-secondary"
            @click="toggleInspectorSection('exif')"
          >
            <span>EXIF</span>
            <span class="text-[10px]">{{ inspectorCollapsed.exif ? '▸' : '▾' }}</span>
          </button>
          <dl
            v-show="!inspectorCollapsed.exif"
            class="grid grid-cols-[auto_1fr] gap-x-5 gap-y-[7px] text-xs"
          >
            <div v-for="row in exifRows" :key="row.label" class="contents">
              <dt class="shrink-0 text-fg-tertiary">{{ row.label }}</dt>
              <dd
                class="text-fg-secondary"
                :class="expanded ? 'break-all' : 'truncate'"
                :title="row.value"
              >
                {{ row.value }}
              </dd>
            </div>
          </dl>

          <!-- 阶段 4.2：迷你地图（带 GPS 时），点击跳地图视图 -->
          <div v-if="hasGps && !inspectorCollapsed.exif" class="mt-2">
            <div class="relative h-28 overflow-hidden rounded-md border border-line-default">
              <div ref="miniMapEl" class="absolute inset-0" />
              <button
                type="button"
                class="absolute inset-0 flex items-end bg-gradient-to-t from-black/50 to-transparent p-1.5 text-left text-[10px] text-white"
                title="在地图视图中查看"
                @click="openInMapView"
              >
                <span class="truncate">{{ cityLabel || '在地图中查看' }}</span>
              </button>
            </div>
            <p class="mt-1 text-[10px] text-fg-tertiary">© OpenStreetMap © CARTO</p>
          </div>
        </div>

        <!-- F12：OCR 图片文字（识别完成后展示；可复制） -->
        <div v-if="single.ocrText" class="mt-3 border-t border-line-default pt-3">
          <div class="mb-1 flex items-center justify-between">
            <button
              type="button"
              class="flex items-center gap-1.5 text-xs font-medium text-fg-secondary hover:text-fg-primary"
              @click="toggleInspectorSection('ocr')"
            >
              <span class="text-[10px]">{{ inspectorCollapsed.ocr ? '▸' : '▾' }}</span>
              <span>图片文字</span>
            </button>
            <button
              type="button"
              class="text-[11px] text-fg-brand hover:underline"
              @click="copyOcrText"
            >
              复制
            </button>
          </div>
          <p
            v-show="!inspectorCollapsed.ocr"
            class="overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-fg-secondary"
            :class="expanded ? 'max-h-72' : 'max-h-32'"
          >
            {{ single.ocrText }}
          </p>
        </div>

        <!-- 文档正文（officeparser 抽取完成后展示；与「图片文字」分列，语义不同） -->
        <div v-if="single.docText" class="mt-3 border-t border-line-default pt-3">
          <div class="mb-1 flex items-center justify-between">
            <button
              type="button"
              class="flex items-center gap-1.5 text-xs font-medium text-fg-secondary hover:text-fg-primary"
              @click="toggleInspectorSection('docText')"
            >
              <span class="text-[10px]">{{ inspectorCollapsed.docText ? '▸' : '▾' }}</span>
              <span>文档正文</span>
            </button>
            <button
              type="button"
              class="text-[11px] text-fg-brand hover:underline"
              @click="copyDocText"
            >
              复制
            </button>
          </div>
          <p
            v-show="!inspectorCollapsed.docText"
            class="overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-fg-secondary"
            :class="expanded ? 'max-h-72' : 'max-h-32'"
          >
            {{ single.docText }}
          </p>
        </div>

        <!-- 阶段 5.1：检查器插件区块（沙箱 iframe） -->
        <div v-if="inspectorPlugins.length > 0" class="mt-3 flex flex-col gap-2">
          <p class="text-[11px] font-medium text-fg-secondary">插件</p>
          <PluginSandbox
            v-for="p in inspectorPlugins"
            :key="p.id"
            :plugin="p"
            :payload="pluginPayload"
          />
        </div>
      </template>

      <!-- 批量编辑 -->
      <template v-else-if="isBatch">
        <div
          class="mb-3 rounded-md border border-line-default bg-surface-0 p-2 text-[11px] text-fg-tertiary"
        >
          已选中
          <span class="text-fg-primary">{{ photos.length }}</span>
          张素材，以下操作将统一应用到全部。
        </div>

        <div class="mb-3">
          <p class="mb-1 text-[11px] font-medium text-fg-secondary">统一评分</p>
          <div class="flex items-center gap-1">
            <button
              v-for="r in 5"
              :key="r"
              type="button"
              class="text-lg transition-colors"
              :class="r <= batchRating ? 'text-amber-400' : 'text-fg-muted hover:text-amber-300'"
              @click="applyBatchRating(r)"
            >
              ★
            </button>
            <button
              v-if="batchRating > 0"
              type="button"
              class="ml-1 text-[11px] text-fg-muted hover:text-danger"
              @click="applyBatchRating(0)"
            >
              清除
            </button>
          </div>
        </div>

        <div class="mb-3">
          <p class="mb-1 text-[11px] font-medium text-fg-secondary">添加标签</p>
          <input
            v-model="newBatchTag"
            type="text"
            placeholder="回车应用到全部"
            class="h-6 w-full rounded-sm border border-line-default bg-surface-0 px-1.5 text-[11px] text-fg-primary focus:outline-none focus:border-brand-500"
            @keyup.enter="applyBatchTag"
          />
        </div>

        <div class="mb-3">
          <p class="mb-1 text-[11px] font-medium text-fg-secondary">统一备注</p>
          <textarea
            v-model="batchDesc"
            rows="3"
            placeholder="应用到全部（覆盖）"
            class="w-full resize-none rounded-md border border-line-default bg-surface-0 px-2 py-1.5 text-[11px] text-fg-primary focus:outline-none focus:border-brand-500"
          />
          <button
            type="button"
            class="mt-1 w-full rounded-md bg-brand-500 py-1 text-[11px] text-white transition-colors hover:bg-brand-600"
            @click="applyBatchDescription"
          >
            应用备注
          </button>
        </div>
      </template>

      <p v-else class="text-[11px] text-fg-muted">未选中素材。</p>
    </div>

    <!-- G11 + 二十一轮：底部「导出」胶囊（Eagle 底部右侧紧凑按钮排布） -->
    <footer
      v-if="single"
      class="flex shrink-0 items-center justify-end gap-2 border-t border-line-default py-2 pl-2 pr-10"
    >
      <button
        v-if="canSetWallpaper"
        type="button"
        class="inspector-action"
        title="设为桌面壁纸（可选适配方式）"
        @click="pickWallpaper"
      >
        <AppIcon icon="ic_texture" />
      </button>
      <button
        v-if="canEditImage"
        type="button"
        class="inspector-action"
        :title="editing ? '正在编辑…' : '旋转 / 翻转（就地改库内文件）'"
        :disabled="editing"
        @click="pickImageEdit"
      >
        <AppIcon icon="ic-toolbar-rotate" />
      </button>
      <button
        type="button"
        class="flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-xs font-medium text-fg-primary transition-colors duration-fast hover:bg-surface-3"
        @click="exportSingle"
      >
        <AppIcon icon="ic-inspector-export" :size="13" />
        导出
      </button>
    </footer>
    <footer
      v-else-if="photos.length > 0"
      class="flex shrink-0 items-center gap-1 border-t border-line-default px-2 py-1.5"
    >
      <button
        type="button"
        class="inspector-action"
        title="在文件管理器中显示"
        @click="revealInFolder"
      >
        <AppIcon icon="context-menu/ic-open-finder" />
      </button>
      <button type="button" class="inspector-action" title="复制文件" @click="copyFiles">
        <AppIcon icon="context-menu/ic-file-copy" />
      </button>
      <button type="button" class="inspector-action" title="批量重命名" @click="renameBatch()">
        <AppIcon icon="context-menu/ic-rename" />
      </button>
      <span class="ml-auto truncate text-[10px] text-fg-tertiary"> {{ photos.length }} 项 </span>
    </footer>

    <!-- 十五轮 B9：右下角帮助圆钮（Eagle 检查器形态） -->
    <button
      type="button"
      class="absolute bottom-3 right-3 z-20 flex size-7 items-center justify-center rounded-full border border-line-default bg-surface-1 text-xs font-medium text-fg-muted shadow-sm transition-colors hover:bg-surface-hover hover:text-fg-primary"
      title="帮助与快捷键（⌘K）"
      @click="openHelp"
    >
      ?
    </button>
  </aside>
</template>

<style scoped>
.inspector-action {
  @apply flex size-7 shrink-0 items-center justify-center rounded text-fg-muted transition-colors duration-fast hover:bg-surface-hover hover:text-fg-primary;
}
</style>
