<script setup lang="ts">
import type { ScreenshotSettings } from '@shared/ipc-contract'
import type { VectorStatus } from '@shared/vectorTypes'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@components/AppIcon.vue'
import UBadge from '@components/ui/UBadge.vue'
import UButton from '@components/ui/UButton.vue'
import UProgress from '@components/ui/UProgress.vue'
import USwitch from '@components/ui/USwitch.vue'
import { useToast } from '@composables/useToast'
import { useTheme, type Theme } from '../composables/useTheme'
import { usePhotoActions } from './photos/composables/usePhotoActions'
import { isEscTop, popEscScope, pushEscScope } from '@renderer/utils/escStack'
import { loadDoubleClickAction, type DoubleClickAction } from './photos/constants/appPreferences'
import type { UpdateStatus, UpdateEvent } from '../types/update'
import type { InstalledPlugin } from '@renderer/types/plugin'
import { PLUGIN_CATEGORY_LABELS } from '@renderer/types/plugin'
import type { SystemInfo } from '../types/system'
import type { TelemetryMode } from '../types/log'

/**
 * 二十八轮：偏好设置一比一复刻 Eagle（窗口卡 840×650：左侧导航 + 右侧卡片 +
 * 底部「保存设置 / 应用」）。页签与 Eagle 同序；无对应能力的页签（截图 /
 * AI 模型套件 / Eagle MCP / 预览设置）不做假开关，直接缺席——与本会话
 * 「标注」范围的处理一致。Leaf 增值页签：插件 / 剪藏。
 */

const { theme, setTheme, initTheme } = useTheme()
initTheme()

const router = useRouter()
const actions = usePhotoActions()

/** 返回素材库主界面 */
const goBack = (): void => {
  router.push('/photos').catch(() => {
    /* ignore */
  })
}

// ── 左侧导航（Eagle 同序）──

const NAV: Array<{ id: string; label: string; icon?: string; glyph?: string }> = [
  { id: 'general', label: '常用', icon: 'ic_home' },
  { id: 'sidebar', label: '左栏', icon: 'ic_toggle-sidebar' },
  { id: 'control', label: '操控', icon: 'ic-settings' },
  { id: 'shortcuts', label: '快捷键', glyph: '⌘' },
  { id: 'screenshot', label: '截图', glyph: '✂' },
  { id: 'notification', label: '通知', icon: 'ic_notification' },
  { id: 'privacy', label: '密码保护', icon: 'ic-lock' },
  { id: 'autoimport', label: '自动导入', icon: 'ic_download' },
  { id: 'ai', label: '内容识别', icon: 'ic-ai' },
  { id: 'assistant', label: 'AI 助手', icon: 'ic-ai' },
  { id: 'plugins', label: '插件', icon: 'ic-toolbar-plugin' },
  { id: 'clip', label: '剪藏', icon: 'ic_chrome' },
  { id: 'developer', label: '开发者选项', icon: 'ic-developer' }
]

const activeTab = ref('general')
const activeNav = computed(() => NAV.find((n) => n.id === activeTab.value) ?? NAV[0]!)

const navQuery = ref('')
const filteredNav = computed(() => {
  const q = navQuery.value.trim().toLowerCase()
  if (!q) return NAV
  return NAV.filter((n) => n.label.toLowerCase().includes(q))
})

function gotoTab(id: string): void {
  activeTab.value = id
}

// ── 常用 · 外观（Eagle 主题色板形态；Leaf 为浅色 / 深色 / 跟随系统）──

const themeSwatches: Array<{ id: Theme; label: string; style: string }> = [
  { id: 'light', label: '浅色', style: 'background:#f5f5f5' },
  {
    id: 'dark',
    label: '深色',
    style: 'background:#1d1e21'
  },
  {
    id: 'auto',
    label: '跟随系统',
    style: 'background:linear-gradient(90deg,#f5f5f5 50%,#1d1e21 50%)'
  }
]

const onSelectTheme = async (id: Theme): Promise<void> => {
  await setTheme(id)
}

// ── 操控 · 双击文件（localStorage；PhotoGrid / PhotoListView 双击消费）──

const dblClickAction = ref<DoubleClickAction>(loadDoubleClickAction())

function setDblClickAction(v: DoubleClickAction): void {
  dblClickAction.value = v
  try {
    localStorage.setItem('leaf.pref.double-click-action', v)
  } catch {
    /* ignore */
  }
}

// ── 左栏 · 侧栏可见性（localStorage；LibraryPanel 消费）──

const SIDEBAR_VIS_KEY = 'leaf.sidebar-visibility'
const sidebarRows = [
  { key: 'unsorted', label: '未分类' },
  { key: 'untagged', label: '未标签' },
  { key: 'random', label: '随机模式' },
  { key: 'tag-manager', label: '标签管理' },
  { key: 'trash', label: '回收站' }
] as const
const sidebarRows2 = [
  { key: 'smartGroup', label: '智能文件夹组' },
  { key: 'folderGroup', label: '文件夹组' },
  { key: 'albumGroup', label: '相册组' }
] as const
type SidebarVisKey = (typeof sidebarRows)[number]['key'] | (typeof sidebarRows2)[number]['key']
const sidebarVisibility = ref<Record<string, boolean>>(loadSidebarVisibility())
function loadSidebarVisibility(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(SIDEBAR_VIS_KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}
/** 与 LibraryPanel.vis() 对齐：albumGroup 是 Leaf 扩展默认隐藏（=== true 才显示），其余未设置即显示 */
function isSidebarVisible(key: SidebarVisKey): boolean {
  return key === 'albumGroup'
    ? sidebarVisibility.value[key] === true
    : sidebarVisibility.value[key] !== false
}
function setSidebarVisible(key: SidebarVisKey, v: boolean): void {
  sidebarVisibility.value = { ...sidebarVisibility.value, [key]: v }
  try {
    localStorage.setItem(SIDEBAR_VIS_KEY, JSON.stringify(sidebarVisibility.value))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('leaf:sidebar-visibility'))
}

// ── 快捷键速查（只读，与 docs/SHORTCUTS.md 同步；Eagle 分组列表形态）──

const shortcutGroups = [
  {
    name: '全局',
    rows: [
      { label: '命令面板', keys: '⌘ K' },
      { label: '聚焦搜索框', keys: '⌘ F' },
      { label: '跳到素材库', keys: '⌘ 1' },
      { label: '设置', keys: '⌘ ,' },
      { label: '开发者工具', keys: '⌥ ⌘ I' }
    ]
  },
  {
    name: '选择与导航',
    rows: [
      { label: '全选（当前视图）', keys: '⌘ A' },
      { label: '⌘ 点击 / Shift 点击', keys: '连选 / 范围连选' },
      { label: '移动高亮', keys: '↑ ↓ ← →' },
      { label: '预览高亮项', keys: 'Enter' },
      { label: '空格快速预览', keys: 'Space' },
      { label: '关预览 / 退选择', keys: 'Esc' },
      { label: '重命名选中项', keys: 'F2' },
      { label: '高级模式（检查器信息全展开）', keys: 'F8' }
    ]
  },
  {
    name: '文件',
    rows: [
      { label: '导入文件夹', keys: '⌘ O' },
      { label: '导入文件', keys: '⇧ ⌘ O' },
      { label: '新建智能收藏夹', keys: '⌥ ⌘ N' },
      { label: '创建副本（单选）', keys: '⌘ D' },
      { label: '复制文件路径', keys: '⌥ ⌘ C' },
      { label: '移入回收站', keys: '⌫' }
    ]
  },
  {
    name: '界面',
    rows: [
      { label: '显示/隐藏侧栏', keys: '⌘ B' },
      { label: '显示/隐藏筛选行', keys: '⇧ ⌘ F' },
      { label: '切换布局', keys: '⌘ \\' }
    ]
  }
]

const shortcutQuery = ref('')
const filteredShortcutGroups = computed(() => {
  const q = shortcutQuery.value.trim().toLowerCase()
  if (!q) return shortcutGroups
  return shortcutGroups
    .map((g) => ({
      ...g,
      rows: g.rows.filter((r) => r.label.toLowerCase().includes(q))
    }))
    .filter((g) => g.rows.length > 0)
})

// ── 通知（localStorage；useNotifications 消费，含总开关）──

const notifyMaster = ref(loadNotifyMaster())
function loadNotifyMaster(): boolean {
  try {
    return localStorage.getItem('leaf.notify.master') !== '0'
  } catch {
    return true
  }
}
function setNotifyMaster(v: boolean): void {
  notifyMaster.value = v
  try {
    localStorage.setItem('leaf.notify.master', v ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function notifyToggle(kind: 'processing' | 'update'): boolean {
  return localStorage.getItem(`leaf.notify.${kind}`) !== '0'
}
// 子开关做成 ref：localStorage 非响应式，直接读会导致点击后勾选框不刷新
const notifyProcessing = ref(notifyToggle('processing'))
const notifyUpdate = ref(notifyToggle('update'))
function setNotify(kind: 'processing' | 'update', v: boolean): void {
  if (kind === 'processing') notifyProcessing.value = v
  else notifyUpdate.value = v
  try {
    localStorage.setItem(`leaf.notify.${kind}`, v ? '1' : '0')
  } catch {
    /* ignore */
  }
}

// ── 密码保护：前往素材库打开密码锁弹窗 ──

function goPrivacySettings(): void {
  actions.lockModalOpen.value = true
  router.push('/photos').catch(() => {})
}

// ── 自动导入（监控文件夹）──

const watchedFolders = ref<string[]>([])
// 主进程无 getEnabled，用 localStorage 影子值还原上次选择（默认开）
const watchedEnabled = ref(loadWatchedEnabled())

function loadWatchedEnabled(): boolean {
  try {
    return localStorage.getItem('leaf.watched-enabled') !== '0'
  } catch {
    return true
  }
}

async function loadWatchedFolders(): Promise<void> {
  try {
    watchedFolders.value = await window.api.watchedFolders.list()
  } catch {
    watchedFolders.value = []
  }
}

async function addWatchedFolder(): Promise<void> {
  try {
    const dirs = await window.api.photos.selectFolder()
    const folder = dirs[0]
    if (!folder) return
    watchedFolders.value = await window.api.watchedFolders.add(folder)
    useToast().success('已添加监控文件夹', { description: folder })
  } catch (error) {
    useToast().error('添加失败', { description: (error as Error).message })
  }
}

async function removeWatchedFolder(folder: string): Promise<void> {
  try {
    watchedFolders.value = await window.api.watchedFolders.remove(folder)
    useToast().success('已停止监控', { description: folder })
  } catch (error) {
    useToast().error('停止监控失败', { description: (error as Error).message })
  }
}

async function toggleWatchedEnabled(on: boolean): Promise<void> {
  const prev = watchedEnabled.value
  watchedEnabled.value = on
  try {
    localStorage.setItem('leaf.watched-enabled', on ? '1' : '0')
    await window.api.watchedFolders.setEnabled(on)
    useToast().success(on ? '自动导入已开启' : '自动导入已暂停')
  } catch (error) {
    watchedEnabled.value = prev
    try {
      localStorage.setItem('leaf.watched-enabled', prev ? '1' : '0')
    } catch {
      /* ignore */
    }
    useToast().error('切换失败', { description: (error as Error).message })
  }
}

// ── D-020：资源库存储（入库即拷贝）+ 丢失文件扫描迁移 ──
const storageMsg = ref('')
const scanningMissing = ref(false)
const migrating = ref(false)
/** 最近一次扫描得到的断链总数：决定「移入回收站」那颗按钮露不露 */
const missingTotal = ref(0)

async function onScanMissing(): Promise<void> {
  scanningMissing.value = true
  try {
    const r = await window.api.storage.scanMissing()
    if (!r.ok) {
      storageMsg.value = `扫描失败：${r.error ?? '未知错误'}`
      missingTotal.value = 0
      return
    }
    missingTotal.value = r.remaining ?? 0
    storageMsg.value =
      `扫描 ${r.scanned ?? 0} 个素材：本次新标记 ${r.missing ?? 0} 个丢失、恢复 ${r.restored ?? 0} 个；` +
      `当前共 ${missingTotal.value} 个断链。`
  } catch (error) {
    storageMsg.value = `扫描失败：${(error as Error).message}`
  } finally {
    scanningMissing.value = false
  }
}

/** 断链素材批量移入回收站：软删可还原，找回文件后仍可从回收站还原 + 重新定位 */
async function onMoveMissingToTrash(): Promise<void> {
  const n = missingTotal.value
  if (n === 0) return
  const ok = window.confirm(
    `将把 ${n} 个「文件已丢失」的素材移入回收站（软删，可还原）。\n\n` +
      '素材记录与标签、评分等元数据都保留在回收站里；日后从备份找回文件，' +
      '还原后再「重新定位」即可。不删除磁盘上的任何文件。'
  )
  if (!ok) {
    storageMsg.value = '已取消。'
    return
  }
  migrating.value = true
  try {
    const r = await window.api.storage.moveMissingToTrash()
    storageMsg.value = r.ok
      ? `已把 ${r.removed} 个丢失素材移入回收站。`
      : `操作失败：${r.error ?? '未知错误'}`
    missingTotal.value = 0
  } catch (error) {
    storageMsg.value = `操作失败：${(error as Error).message}`
  } finally {
    migrating.value = false
  }
}

async function onMigrate(dryRun: boolean): Promise<void> {
  migrating.value = true
  try {
    const r = await window.api.storage.migrateIntoLibrary(dryRun)
    if (!r.ok) {
      storageMsg.value = `迁移失败：${r.error ?? '未知错误'}`
      return
    }
    storageMsg.value = `扫描 ${r.scanned ?? 0} 个引用素材，已拷贝 ${r.copied ?? 0} 个入库（失败 ${r.failed ?? 0} 个）。`
  } catch (error) {
    storageMsg.value = `迁移失败：${(error as Error).message}`
  } finally {
    migrating.value = false
  }
}

// ── F17：库目录移动修复 ──

async function onRepairMovedLibrary(): Promise<void> {
  try {
    const dirs = await window.api.photos.selectFolder()
    const oldRoot = dirs[0]
    if (!oldRoot) return
    const dry = await window.api.storage.repairMovedLibrary(oldRoot, true)
    if (!dry.ok) {
      storageMsg.value = `修复失败：${dry.error}`
      return
    }
    if ((dry.repairable ?? 0) === 0) {
      storageMsg.value = `未找到可修复项（丢失 ${dry.missing ?? 0} 个素材，但都未在所选目录下找到对应文件）。请确认选择的是移动前的原库目录。`
      return
    }
    const ok = window.confirm(
      `在所选目录下找到 ${dry.repairable} 个丢失素材的对应文件（共丢失 ${dry.missing} 个）。\n将把引用路径批量改到当前资源库内的对应位置（元数据保留）。\n\n执行修复？`
    )
    if (!ok) {
      storageMsg.value = '已取消修复。'
      return
    }
    const r = await window.api.storage.repairMovedLibrary(oldRoot, false)
    storageMsg.value = r.ok
      ? `修复完成：已重新定位 ${r.repaired ?? 0} 个素材。`
      : `修复失败：${r.error}`
  } catch (error) {
    storageMsg.value = `修复失败：${(error as Error).message}`
  }
}

/** 迁移两段式确认：先干跑统计体积，确认后执行（F11） */
async function onMigrateConfirm(): Promise<void> {
  let first: Awaited<ReturnType<typeof window.api.storage.migrateIntoLibrary>>
  try {
    // 干跑阶段同样置 loading（审查 P3-59）：扫描大库可达数秒，按钮此前无反馈
    migrating.value = true
    first = await window.api.storage.migrateIntoLibrary(true)
  } catch (error) {
    storageMsg.value = `迁移失败：${(error as Error).message}`
    return
  } finally {
    migrating.value = false
  }
  if (!first.ok) {
    storageMsg.value = `迁移失败：${first.error ?? '未知错误'}`
    return
  }
  if ((first.candidates ?? 0) === 0) {
    storageMsg.value = `没有库外引用素材（共扫描 ${first.scanned ?? 0} 项），无需迁移。`
    return
  }
  const mb = ((first.totalSize ?? 0) / 1048576).toFixed(1)
  const ok = window.confirm(
    `将把 ${first.candidates} 个库外文件（约 ${mb} MB）拷贝入资源库 images/ 目录。\n原文件不会被删除，迁移后素材改用库内副本。\n\n继续迁移？`
  )
  if (!ok) {
    storageMsg.value = '已取消迁移。'
    return
  }
  await onMigrate(false)
}

// ── F12：OCR 文字识别（图片内文字可搜索/可复制） ──

const ocrStatus = ref<{
  enabled: boolean
  pending: number
  ready: boolean
  pendingTotal: number
} | null>(null)
const ocrBusy = ref(false)

async function loadOcrStatus(): Promise<void> {
  try {
    ocrStatus.value = await window.api.photos.ocrStatus()
  } catch {
    ocrStatus.value = null
  }
}

async function toggleOcr(on: boolean): Promise<void> {
  try {
    ocrStatus.value = await window.api.photos.setOcrEnabled(on)
    useToast().success(on ? '文字识别已开启' : '文字识别已关闭')
  } catch (error) {
    useToast().error('切换失败', { description: (error as Error).message })
  }
}

async function runOcrAll(): Promise<void> {
  ocrBusy.value = true
  try {
    const r = await window.api.photos.runOcr()
    useToast().info(`已加入识别队列 ${r.queued} 张`, {
      description: '识别在后台低优先级进行，完成后即可按图片内文字搜索'
    })
  } catch (error) {
    useToast().error('加入识别队列失败', { description: (error as Error).message })
  } finally {
    ocrBusy.value = false
  }
}

// ── 文档正文抽取（officeparser，与 OCR 并列的第二条文本链路） ──

const docTextStatus = ref<{ enabled: boolean; pending: number; pendingTotal: number } | null>(null)
const docTextBusy = ref(false)

async function loadDocTextStatus(): Promise<void> {
  try {
    docTextStatus.value = await window.api.photos.docTextStatus()
  } catch {
    docTextStatus.value = null
  }
}

async function toggleDocText(on: boolean): Promise<void> {
  try {
    docTextStatus.value = await window.api.photos.setDocTextEnabled(on)
    useToast().success(on ? '正文抽取已开启' : '正文抽取已关闭')
  } catch (error) {
    useToast().error('切换失败', { description: (error as Error).message })
  }
}

async function runDocTextAll(): Promise<void> {
  docTextBusy.value = true
  try {
    const r = await window.api.photos.runDocText()
    useToast().info(`已加入抽取队列 ${r.queued} 个`, {
      description: '后台低优先级进行，完成后文档正文与图片内文字一样可全文搜索'
    })
  } catch (error) {
    useToast().error('加入抽取队列失败', { description: (error as Error).message })
  } finally {
    docTextBusy.value = false
  }
}

// ── G1：图文向量档（中文文搜图 / 找相似第二档 / 本地以图搜图的底座） ──

const vecStatus = ref<VectorStatus | null>(null)
/** 当前在跑的长任务：只用来把按钮按住，真进度从 status 轮询回来 */
const vecBusy = ref<'' | 'download' | 'index'>('')
/** 点了建索引却迟迟等不到第一次进度的宽限计数：超了按没在跑收尾，别永远转圈 */
let vecQuietTicks = 0
let vecTimer: number | undefined

const vecMb = (bytes: number): number => Math.round(bytes / 1024 / 1024)

async function loadVectorStatus(): Promise<void> {
  try {
    vecStatus.value = await window.api.vectors.status()
  } catch {
    // 主进程没起来/通道缺失时整块隐藏，而不是显示一排 0 让人以为坏了
    vecStatus.value = null
  }
}

/**
 * 轮询而不是推进度事件：下载是百 MB 级、建索引是万级条目，
 * 推事件要把回调穿过 IPC 再排队，而 UI 只关心"现在到哪了"，1.5s 粒度足够。
 */
function watchVectorProgress(): void {
  if (vecTimer !== undefined) return
  vecTimer = window.setInterval(async () => {
    await loadVectorStatus()
    const s = vecStatus.value
    const pr = s?.progress ?? null
    if (vecBusy.value === 'download') return
    // 三种「没在跑」要分开：刚点下去时 indexAll 还没回报第一次进度（pr 仍是 null），
    // 这时候当结束会把轮询停掉、按钮态清掉，后台任务反而看不见在跑。
    if (vecBusy.value === 'index' && pr === null && ++vecQuietTicks < 10) return
    const running = vecBusy.value === 'index' && pr !== null && pr.done < pr.total
    if (!running) {
      // 收尾必须放掉 vecBusy：只在点击的 catch 分支复位的话，
      // 一轮「补齐缺失」正常跑完按钮会永久停在 loading，只能切页重进才恢复
      vecBusy.value = ''
      vecQuietTicks = 0
      if (vecTimer !== undefined) {
        window.clearInterval(vecTimer)
        vecTimer = undefined
      }
    }
  }, 1500)
}

async function downloadVectorModel(): Promise<void> {
  vecBusy.value = 'download'
  try {
    const r = await window.api.vectors.download()
    if (r.ok) useToast().success('视觉模型已就绪', { description: '现在可以给全库建向量索引了' })
    else useToast().error('模型下载失败', { description: r.error ?? '' })
  } catch (error) {
    useToast().error('模型下载失败', { description: (error as Error).message })
  } finally {
    vecBusy.value = ''
    await loadVectorStatus()
  }
}

async function startIndex(rebuild: boolean): Promise<void> {
  vecBusy.value = 'index'
  vecQuietTicks = 0
  try {
    const r = await window.api.vectors.indexAll(rebuild)
    if (!r.ok) {
      useToast().info(r.error ?? '索引任务已在跑')
      return
    }
    watchVectorProgress()
  } catch (error) {
    useToast().error('启动索引失败', { description: (error as Error).message })
    vecBusy.value = ''
  }
}

async function cancelIndex(): Promise<void> {
  await window.api.vectors.cancelIndex()
  useToast().info('已请求停止索引')
}

async function clearVectors(): Promise<void> {
  const r = await window.api.vectors.clearVectors()
  useToast().info(`已清空 ${r.removed} 条向量`, { description: '模型文件保留，可重新建索引' })
  await loadVectorStatus()
}

async function removeVectorModel(): Promise<void> {
  await window.api.vectors.removeModel()
  useToast().info('模型文件已删除')
  await loadVectorStatus()
}

// ── F16：库定时备份 ──

const backupCfg = ref<{
  enabled: boolean
  intervalDays: number
  keep: number
  lastAt: number | null
  dir: string
} | null>(null)
const backupKeep = ref(10)
const backupRunning = ref(false)
const backupMsg = ref('')

async function loadBackupConfig(): Promise<void> {
  try {
    backupCfg.value = await window.api.backup.getConfig()
    backupKeep.value = backupCfg.value.keep
  } catch {
    backupCfg.value = null
  }
}

async function saveBackupConfig(patch: {
  enabled?: boolean
  intervalDays?: number
  keep?: number
}): Promise<void> {
  try {
    backupCfg.value = await window.api.backup.setConfig(patch)
    backupKeep.value = backupCfg.value.keep
  } catch (error) {
    useToast().error('备份设置保存失败', { description: (error as Error).message })
  }
}

function setBackupEnabled(on: boolean): void {
  void saveBackupConfig({ enabled: on })
  useToast().success(on ? '自动备份已开启' : '自动备份已关闭')
}

function setBackupInterval(days: number): void {
  void saveBackupConfig({ intervalDays: days })
}

function setBackupKeep(): void {
  if (!backupKeep.value || backupKeep.value < 1) backupKeep.value = 10
  void saveBackupConfig({ keep: backupKeep.value })
}

async function onBackupNow(): Promise<void> {
  backupRunning.value = true
  backupMsg.value = ''
  try {
    const r = await window.api.backup.runNow()
    if (r.ok) {
      backupMsg.value = `备份完成：${r.file}`
      await loadBackupConfig()
    } else {
      backupMsg.value = `备份失败：${r.error}`
    }
  } finally {
    backupRunning.value = false
  }
}

function onOpenBackupDir(): void {
  void window.api.backup.openDir()
}

// ── 截图设置（快捷键开关/格式/质量/保存路径/自动标签） ──
const screenshotSettings = ref<ScreenshotSettings | null>(null)

async function loadScreenshotSettings(): Promise<void> {
  try {
    screenshotSettings.value = await window.api.screenshot.getSettings()
  } catch (error) {
    useToast().error('读取截图设置失败', { description: (error as Error).message })
  }
}

async function patchScreenshot(patch: Partial<ScreenshotSettings>): Promise<void> {
  try {
    screenshotSettings.value = await window.api.screenshot.setSettings(patch)
  } catch (error) {
    // 主进程校验失败（如 saveDir 白名单）时回弹并明确提示（审查 P3-59）
    useToast().error('保存截图设置失败', { description: (error as Error).message })
    await loadScreenshotSettings()
  }
}

async function onPickScreenshotDir(): Promise<void> {
  // photos:selectFolder 返回路径数组，取第一个
  const dirs = await window.api.photos.selectFolder()
  if (dirs && dirs[0]) await patchScreenshot({ saveDir: dirs[0] })
}

// ── F8：剪贴板常驻监听自动导入 ──

const clipboardWatchEnabled = ref(false)

async function loadClipboardWatch(): Promise<void> {
  try {
    clipboardWatchEnabled.value = await window.api.clipboardWatch.getEnabled()
  } catch {
    clipboardWatchEnabled.value = false
  }
}

async function toggleClipboardWatch(on: boolean): Promise<void> {
  const prev = clipboardWatchEnabled.value
  clipboardWatchEnabled.value = on
  try {
    await window.api.clipboardWatch.setEnabled(on)
    useToast().success(on ? '剪贴板监听已开启' : '剪贴板监听已关闭', {
      description: on ? '复制文件或图片会自动入库' : undefined
    })
  } catch (error) {
    clipboardWatchEnabled.value = prev
    useToast().error('切换失败', { description: (error as Error).message })
  }
}

// ── AI 助手（DeepSeek 文本模型，D-017）──

const aiCfg = ref<{
  configured: boolean
  model: string
  hint: string
  vision: { model: string; endpoint: string; enabled: boolean; configured: boolean }
} | null>(null)
const aiKeyInput = ref('')
const aiBusy = ref(false)
const aiTest = ref('')
// 视觉打标（M3）：与文本档共用 ai.config 一次拉回
const visionModelInput = ref('')
const visionEndpointInput = ref('')
const visionEnabledInput = ref(false)
const visionBusy = ref(false)
const visionTest = ref('')

async function loadAiConfig(): Promise<void> {
  try {
    aiCfg.value = await window.api.ai.config()
    // 视觉档（M3）与文本档同源回填：每次进设置页都以主进程配置为准
    visionModelInput.value = aiCfg.value.vision.model
    visionEndpointInput.value = aiCfg.value.vision.endpoint
    visionEnabledInput.value = aiCfg.value.vision.enabled
  } catch {
    aiCfg.value = null
  }
}

async function onSaveAiKey(): Promise<void> {
  aiBusy.value = true
  aiTest.value = ''
  const r = await window.api.ai.setKey(aiKeyInput.value)
  if (r.ok) {
    aiKeyInput.value = ''
    useToast().success('已保存 API Key', { description: '经系统密钥环加密存本机' })
    await loadAiConfig()
  } else {
    useToast().error('保存失败', { description: r.error })
  }
  aiBusy.value = false
}

async function onTestAi(): Promise<void> {
  aiBusy.value = true
  const r = await window.api.ai.test()
  aiTest.value = r.ok ? `模型回复：${r.text.trim().slice(0, 40)}` : `失败：${r.error}`
  aiBusy.value = false
}

async function onClearAiKey(): Promise<void> {
  const r = await window.api.ai.clearKey()
  if (r.ok) {
    aiTest.value = ''
    useToast().success('已清除 API Key')
    await loadAiConfig()
  } else {
    useToast().error('清除失败', { description: r.error })
  }
}

// ── AI 助手 · 视觉打标（M3 看图工作流：OpenAI 兼容端点 + DeepSeek 预设）──

async function onSaveVision(): Promise<void> {
  visionBusy.value = true
  visionTest.value = ''
  const r = await window.api.ai.setVisionConfig({
    model: visionModelInput.value,
    endpoint: visionEndpointInput.value,
    enabled: visionEnabledInput.value
  })
  if (r.ok) {
    useToast().success('已保存视觉打标配置', {
      description: '图片只以库内缩略图出库（≤768px / 200KB），原图不出库'
    })
    await loadAiConfig()
  } else {
    useToast().error('保存失败', { description: r.error })
  }
  visionBusy.value = false
}

async function onTestVision(): Promise<void> {
  visionBusy.value = true
  const r = await window.api.ai.testVision()
  visionTest.value = r.ok ? `视觉模型回复：${r.text.trim().slice(0, 40)}` : `失败：${r.error}`
  visionBusy.value = false
}

// ── 插件 ──

const plugins = ref<InstalledPlugin[]>([])
async function loadPlugins(): Promise<void> {
  try {
    plugins.value = await window.api.plugins.list()
  } catch {
    plugins.value = []
  }
}

// ── 剪藏服务 ──

const clipRunning = ref(false)
const clipPort = ref<number | null>(null)
const clipToken = ref<string | null>(null)
const clipShowToken = ref(false)
const clipRegenerating = ref(false)

const clipTokenMasked = computed(() => {
  if (!clipToken.value) return '—'
  if (clipShowToken.value) return clipToken.value
  return `${clipToken.value.slice(0, 6)}••••••${clipToken.value.slice(-4)}`
})

const clipServiceUrl = computed(() =>
  clipPort.value != null && clipToken.value
    ? `http://localhost:${clipPort.value}/?token=${clipToken.value}`
    : ''
)

async function loadClipConfig(): Promise<void> {
  try {
    const cfg = await window.api.photos.clipServer.getConfig()
    clipRunning.value = cfg.running
    clipPort.value = cfg.port
    clipToken.value = cfg.token
  } catch {
    /* ignore */
  }
}

async function onRegenerateClipToken(): Promise<void> {
  clipRegenerating.value = true
  try {
    const next = await window.api.photos.clipServer.regenerateToken()
    clipToken.value = next.token
    useToast().success('Token 已重新生成', { description: '请在浏览器扩展中同步更新' })
  } catch {
    useToast().error('重新生成失败')
  } finally {
    clipRegenerating.value = false
  }
}

function copyClipField(value: string, label: string): void {
  void navigator.clipboard.writeText(value).then(() => {
    useToast().success(`${label}已复制`)
  })
}

// ── 开发者选项：数据目录 / 日志 ──

const appVersion = ref('—')
const systemInfo = ref<SystemInfo | null>(null)

const onOpenDataDir = (): void => {
  if (systemInfo.value?.userDataPath) {
    void window.api.system.openPath(systemInfo.value.userDataPath)
  }
}

const telemetryMode = ref<TelemetryMode>('local')

const telemetryOptions: Array<{ id: TelemetryMode; label: string; description: string }> = [
  { id: 'local', label: '本地', description: '错误日志保存到本机 SQLite，重启可清。' },
  { id: 'off', label: '关闭', description: '只保留内存 ring buffer，重启即清零。' },
  { id: 'remote', label: '远程（1.0 暂未启用）', description: '当前等同本地。' }
]

const onSelectTelemetry = async (id: TelemetryMode): Promise<void> => {
  const prev = telemetryMode.value
  telemetryMode.value = id
  try {
    telemetryMode.value = await window.api.log.setMode(id)
  } catch (e) {
    console.warn('[SettingsView] setMode failed:', e)
    telemetryMode.value = prev
  }
}

const onExportLogs = async (): Promise<void> => {
  try {
    await window.api.log.export()
  } catch (e) {
    console.warn('[SettingsView] export failed:', e)
  }
}

// ── 自动更新 ──

const updateStatus = ref<UpdateStatus>('idle')
const updateVersion = ref<string>('')
const updateProgress = ref<number>(0)
const updateError = ref<string>('')

let unsubscribe: (() => void) | null = null

/** Eagle 偏好窗口同款：Esc 关闭（层级裁决，审查 P2-34）：
 *  命令面板/模态叠加时 Esc 先关它们，不穿透到设置页 */
let escScope: symbol | null = null
const onKeydown = (e: KeyboardEvent): void => {
  if (e.key === 'Escape' && escScope && isEscTop(escScope)) goBack()
}

const onCheckUpdate = async (): Promise<void> => {
  await window.api.update.check()
}

const onDownload = async (): Promise<void> => {
  await window.api.update.download()
}

const onInstall = (): void => {
  window.api.update.install()
}

const statusText = (s: UpdateStatus): string => {
  switch (s) {
    case 'idle':
      return '未检查'
    case 'checking':
      return '检查中…'
    case 'available':
      return `有可用更新 v${updateVersion.value}`
    case 'not-available':
      return '已是最新版本'
    case 'downloading':
      return `下载中 ${updateProgress.value}%`
    case 'downloaded':
      return `已下载 v${updateVersion.value}，点击重启安装`
    case 'error':
      return `错误：${updateError.value}`
    default:
      return s
  }
}

const canCheck = (): boolean =>
  updateStatus.value === 'idle' ||
  updateStatus.value === 'not-available' ||
  updateStatus.value === 'error'
const canDownload = (): boolean => updateStatus.value === 'available'
const canInstall = (): boolean => updateStatus.value === 'downloaded'

// ── 底部操作条（Eagle「保存设置 / 应用」；Leaf 即改即存）──

function onSaveSettings(): void {
  useToast().success('设置已保存', { description: 'Leaf 的设置为即改即存' })
}

onMounted(() => {
  void loadVectorStatus()
  // 订阅必须在任何 await 之前同步注册：若组件在 IPC 期间被卸载，
  // onBeforeUnmount 先执行时这些句柄仍是 null，会造成监听器泄漏
  unsubscribe = window.api.update.onEvent((e: UpdateEvent) => {
    updateStatus.value = e.status
    updateError.value = e.error ?? ''
    if (e.version) updateVersion.value = e.version
    if (e.progress) updateProgress.value = Math.round(e.progress.percent)
  })
  window.api.update
    .getStatus()
    .then((s) => (updateStatus.value = s))
    .catch(() => {
      /* ignore */
    })
  window.addEventListener('keydown', onKeydown)
  // 设置页入 Esc 栈（审查 P2-34）：叠加的模态/命令面板在其上层，Esc 先关它们
  escScope = pushEscScope()

  void loadInitialData()
})

async function loadInitialData(): Promise<void> {
  await loadClipConfig()
  await loadWatchedFolders()
  void loadClipboardWatch()
  void loadOcrStatus()
  void loadDocTextStatus()
  void loadBackupConfig()
  void loadScreenshotSettings()
  try {
    appVersion.value = await window.api.update.getCurrentVersion()
  } catch {
    /* ignore */
  }
  try {
    systemInfo.value = await window.api.system.info()
  } catch {
    /* ignore */
  }
  await loadPlugins()
  await loadAiConfig()
  try {
    telemetryMode.value = await window.api.log.getMode()
  } catch {
    /* ignore */
  }
}

onBeforeUnmount(() => {
  if (vecTimer !== undefined) {
    window.clearInterval(vecTimer)
    vecTimer = undefined
  }
  window.removeEventListener('keydown', onKeydown)
  unsubscribe?.()
  if (escScope) {
    popEscScope(escScope)
    escScope = null
  }
})
</script>

<template>
  <!-- Eagle 偏好设置窗口复刻：居中 840×650 卡片 + 半透明遮罩 -->
  <div class="fixed inset-0 z-40 grid place-items-center bg-black/50 p-6" @click.self="goBack">
    <div
      class="flex h-[min(650px,100%)] w-[840px] max-w-full overflow-hidden rounded-xl border border-line-default bg-surface-1 shadow-2xl"
    >
      <!-- ── 左侧导航 ── -->
      <aside class="flex w-[180px] shrink-0 flex-col bg-surface-0">
        <h1 class="px-4 pt-4 text-sm font-semibold text-fg-primary">偏好设置</h1>
        <div class="px-3 pb-2 pt-3">
          <div class="relative">
            <AppIcon
              icon="ic_search"
              :size="12"
              class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted"
            />
            <input
              v-model="navQuery"
              type="text"
              placeholder="搜索…"
              class="h-7 w-full rounded-md border border-line-subtle bg-surface-1 pl-7 pr-2 text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none"
            />
          </div>
        </div>
        <nav class="app-scroll flex-1 overflow-y-auto px-2 pb-3">
          <button
            v-for="n in filteredNav"
            :key="n.id"
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-left text-xs transition-colors duration-fast"
            :class="
              activeTab === n.id
                ? 'bg-surface-active text-fg-primary'
                : 'text-fg-secondary hover:bg-surface-hover hover:text-fg-primary'
            "
            @click="gotoTab(n.id)"
          >
            <span v-if="n.glyph" class="w-[15px] text-center text-[13px] leading-none">{{
              n.glyph
            }}</span>
            <AppIcon
              v-else-if="n.icon"
              :icon="n.icon"
              :size="15"
              class="shrink-0 text-fg-secondary"
            />
            <span class="min-w-0 flex-1 truncate">{{ n.label }}</span>
          </button>
          <p v-if="filteredNav.length === 0" class="px-2 py-1 text-[11px] text-fg-muted">
            无匹配的页签
          </p>
        </nav>
      </aside>

      <!-- ── 右侧内容 ── -->
      <section class="flex min-w-0 flex-1 flex-col">
        <header class="flex items-center justify-between px-5 pb-1 pt-4">
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold text-fg-primary">{{ activeNav.label }}</h2>
          </div>
          <button
            type="button"
            class="flex size-6 items-center justify-center rounded-md text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg-primary"
            title="关闭偏好设置"
            aria-label="关闭偏好设置"
            @click="goBack"
          >
            <AppIcon icon="ic-modal-close" :size="12" />
          </button>
        </header>

        <div class="app-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-2">
          <!-- ════════ 常用 ════════ -->
          <template v-if="activeTab === 'general'">
            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <h3 class="mb-3 text-xs font-medium text-fg-primary">外观</h3>
              <div class="grid grid-cols-[96px_1fr] items-center gap-x-4 py-1.5">
                <span class="text-xs text-fg-secondary">主题</span>
                <div class="flex items-center gap-2.5">
                  <button
                    v-for="t in themeSwatches"
                    :key="t.id"
                    type="button"
                    class="size-[22px] rounded-md border transition-shadow duration-fast"
                    :class="
                      theme === t.id
                        ? 'border-brand-500 ring-1 ring-brand-500 ring-offset-2 ring-offset-surface-2'
                        : 'border-line-strong'
                    "
                    :style="t.style"
                    :title="t.label"
                    :aria-label="`主题：${t.label}`"
                    @click="onSelectTheme(t.id)"
                  />
                </div>
              </div>
              <div class="grid grid-cols-[96px_1fr] items-center gap-x-4 py-1.5">
                <span class="text-xs text-fg-secondary">语言</span>
                <select
                  disabled
                  title="Leaf 当前仅提供简体中文"
                  class="h-7 w-32 rounded-md border border-line-subtle bg-surface-1 px-2 text-xs text-fg-primary"
                >
                  <option>简体中文</option>
                </select>
              </div>
            </section>

            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <h3 class="mb-3 text-xs font-medium text-fg-primary">更新</h3>
              <div class="flex items-center justify-between gap-4 py-1.5">
                <div class="min-w-0">
                  <p class="text-xs text-fg-primary">自动更新 · Leaf v{{ appVersion }}</p>
                  <p class="mt-0.5 text-[11px] text-fg-tertiary">{{ statusText(updateStatus) }}</p>
                  <UProgress
                    v-if="updateStatus === 'downloading'"
                    :value="updateProgress"
                    class="mt-2 max-w-60"
                  />
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <UButton
                    v-if="canCheck()"
                    size="sm"
                    variant="secondary"
                    :loading="updateStatus === 'checking'"
                    @click="onCheckUpdate"
                  >
                    {{ updateStatus === 'checking' ? '检查中…' : '检查更新' }}
                  </UButton>
                  <UButton v-if="canDownload()" size="sm" variant="primary" @click="onDownload">
                    下载
                  </UButton>
                  <UButton v-if="canInstall()" size="sm" variant="primary" @click="onInstall">
                    重启安装
                  </UButton>
                </div>
              </div>
            </section>

            <!-- D-020：资源库存储（入库即拷贝，对齐 Eagle「拷贝进资源库」模型） -->
            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <h3 class="text-xs font-medium text-fg-primary">资源库存储</h3>
              <p class="mt-2 text-[11px] leading-5 text-fg-tertiary">
                导入即复制一份进资源库 images/ 目录，原文件不动；此后编辑、重命名、
                清空回收站都只作用于库内副本。更早以「引用」方式入库的素材可用下方
                「迁移引用文件入库…」批量拷入（会先给出条数与体积）。
              </p>
              <div class="mt-3 flex items-center gap-2">
                <UButton
                  size="sm"
                  variant="secondary"
                  :loading="scanningMissing"
                  @click="onScanMissing"
                >
                  扫描丢失文件
                </UButton>
                <UButton size="sm" variant="ghost" @click="onRepairMovedLibrary">
                  库目录已移动？修复…
                </UButton>
                <!-- 只有扫出断链才出现：这条入口的存在意义就是处理那一堆 -->
                <UButton
                  v-if="missingTotal > 0"
                  size="sm"
                  variant="secondary"
                  :loading="migrating"
                  @click="onMoveMissingToTrash"
                >
                  把 {{ missingTotal }} 个丢失素材移入回收站
                </UButton>
                <UButton
                  size="sm"
                  variant="secondary"
                  :loading="migrating"
                  @click="onMigrateConfirm"
                >
                  迁移引用文件入库…
                </UButton>
              </div>
              <p v-if="storageMsg" class="mt-2 whitespace-pre-wrap text-[11px] text-fg-secondary">
                {{ storageMsg }}
              </p>
            </section>

            <!-- F16：库定时备份 -->
            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-medium text-fg-primary">自动备份</h3>
                <USwitch
                  size="sm"
                  :model-value="backupCfg?.enabled ?? false"
                  aria-label="自动备份"
                  @update:model-value="setBackupEnabled"
                />
              </div>
              <p class="mt-2 text-[11px] leading-5 text-fg-tertiary">
                定期把数据库备份到资源库 backups/
                目录（素材引用模式下的原文件不在备份范围内）。备份在后台静默进行，不阻塞素材操作。
              </p>
              <template v-if="backupCfg?.enabled">
                <div class="mt-3 flex items-center gap-2">
                  <span class="text-xs text-fg-muted">备份频率</span>
                  <button
                    v-for="d in [1, 7, 30]"
                    :key="d"
                    type="button"
                    class="rounded-md border px-2.5 py-1 text-xs transition-colors"
                    :class="
                      backupCfg.intervalDays === d
                        ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                        : 'border-line-subtle bg-surface-1 text-fg-secondary hover:border-brand-400'
                    "
                    @click="setBackupInterval(d)"
                  >
                    {{ d === 1 ? '每天' : d === 7 ? '每周' : '每月' }}
                  </button>
                  <span class="ml-2 text-xs text-fg-muted">保留</span>
                  <input
                    v-model.number="backupKeep"
                    type="number"
                    min="1"
                    max="100"
                    class="h-7 w-16 px-2 text-xs rounded-md border border-line-default bg-surface-1 text-fg-primary"
                    @change="setBackupKeep"
                  />
                  <span class="text-xs text-fg-muted">份</span>
                </div>
                <p v-if="backupCfg.lastAt" class="mt-2 text-[11px] text-fg-tertiary">
                  上次备份：{{ new Date(backupCfg.lastAt).toLocaleString() }}
                </p>
              </template>
              <div class="mt-3 flex items-center gap-2">
                <UButton
                  size="sm"
                  variant="secondary"
                  :loading="backupRunning"
                  @click="onBackupNow"
                >
                  立即备份
                </UButton>
                <UButton size="sm" variant="ghost" @click="onOpenBackupDir">打开备份目录</UButton>
              </div>
              <p v-if="backupMsg" class="mt-2 whitespace-pre-wrap text-[11px] text-fg-secondary">
                {{ backupMsg }}
              </p>
            </section>
          </template>

          <!-- ════════ 左栏 ════════ -->
          <template v-else-if="activeTab === 'sidebar'">
            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <h3 class="mb-3 text-xs font-medium text-fg-primary">在侧栏显示的文件：</h3>
              <div class="grid grid-cols-3 gap-x-6 gap-y-2.5">
                <!-- 全部固定显示（Eagle 同款灰置项） -->
                <span
                  class="flex cursor-not-allowed items-center gap-2 text-xs text-fg-muted"
                  title="「全部」固定显示，不可隐藏"
                >
                  <span
                    class="flex size-3.5 items-center justify-center rounded-[3px] border border-line-strong bg-surface-hover opacity-50"
                  >
                    <AppIcon icon="ic-check" :size="9" class="text-fg-secondary" />
                  </span>
                  全部
                </span>
                <button
                  v-for="row in sidebarRows"
                  :key="row.key"
                  type="button"
                  role="checkbox"
                  :aria-checked="isSidebarVisible(row.key)"
                  class="flex items-center gap-2 text-left text-xs text-fg-primary"
                  @click="setSidebarVisible(row.key, !isSidebarVisible(row.key))"
                >
                  <span
                    class="flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border"
                    :class="
                      isSidebarVisible(row.key)
                        ? 'border-brand-500 bg-brand-500'
                        : 'border-line-strong'
                    "
                  >
                    <AppIcon
                      v-if="isSidebarVisible(row.key)"
                      icon="ic-check"
                      :size="9"
                      class="text-white"
                    />
                  </span>
                  {{ row.label }}
                </button>
              </div>
              <div class="my-3 border-t border-line-subtle" />
              <div class="grid grid-cols-3 gap-x-6 gap-y-2.5">
                <button
                  v-for="row in sidebarRows2"
                  :key="row.key"
                  type="button"
                  role="checkbox"
                  :aria-checked="isSidebarVisible(row.key)"
                  class="flex items-center gap-2 text-left text-xs text-fg-primary"
                  @click="setSidebarVisible(row.key, !isSidebarVisible(row.key))"
                >
                  <span
                    class="flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border"
                    :class="
                      isSidebarVisible(row.key)
                        ? 'border-brand-500 bg-brand-500'
                        : 'border-line-strong'
                    "
                  >
                    <AppIcon
                      v-if="isSidebarVisible(row.key)"
                      icon="ic-check"
                      :size="9"
                      class="text-white"
                    />
                  </span>
                  {{ row.label }}
                </button>
              </div>
            </section>
          </template>

          <!-- ════════ 操控 ════════ -->
          <template v-else-if="activeTab === 'control'">
            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <h3 class="mb-3 text-xs font-medium text-fg-primary">鼠标</h3>
              <div class="grid grid-cols-[96px_1fr] items-center gap-x-4 py-1.5">
                <span class="text-xs text-fg-secondary">双击文件</span>
                <div class="flex items-center gap-10">
                  <button
                    type="button"
                    role="radio"
                    :aria-checked="dblClickAction === 'preview'"
                    class="flex items-center gap-1.5 text-xs text-fg-primary"
                    @click="setDblClickAction('preview')"
                  >
                    <span
                      class="flex size-3.5 items-center justify-center rounded-full border"
                      :class="
                        dblClickAction === 'preview' ? 'border-brand-500' : 'border-line-strong'
                      "
                    >
                      <span
                        class="size-1.5 rounded-full"
                        :class="dblClickAction === 'preview' ? 'bg-brand-500' : ''"
                      />
                    </span>
                    预览
                  </button>
                  <button
                    type="button"
                    role="radio"
                    :aria-checked="dblClickAction === 'system'"
                    class="flex items-center gap-1.5 text-xs text-fg-primary"
                    title="用系统默认应用打开文件"
                    @click="setDblClickAction('system')"
                  >
                    <span
                      class="flex size-3.5 items-center justify-center rounded-full border"
                      :class="
                        dblClickAction === 'system' ? 'border-brand-500' : 'border-line-strong'
                      "
                    >
                      <span
                        class="size-1.5 rounded-full"
                        :class="dblClickAction === 'system' ? 'bg-brand-500' : ''"
                      />
                    </span>
                    在默认应用打开
                  </button>
                </div>
              </div>
            </section>

            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <h3 class="mb-3 text-xs font-medium text-fg-primary">键盘</h3>
              <div class="grid grid-cols-[96px_1fr] items-center gap-x-4 py-1.5">
                <span class="text-xs text-fg-secondary">空格键</span>
                <div class="flex items-center gap-10">
                  <span class="flex items-center gap-1.5 text-xs text-fg-primary">
                    <span
                      class="flex size-3.5 items-center justify-center rounded-full border border-brand-500"
                    >
                      <span class="size-1.5 rounded-full bg-brand-500" />
                    </span>
                    快速预览
                  </span>
                  <span
                    class="flex cursor-not-allowed items-center gap-1.5 text-xs text-fg-muted"
                    title="Leaf 暂不支持 Quick Look"
                  >
                    <span class="size-3.5 rounded-full border border-line-strong" />
                    Quick Look
                  </span>
                  <span
                    class="flex cursor-not-allowed items-center gap-1.5 text-xs text-fg-muted"
                    title="空格键固定为快速预览"
                  >
                    <span class="size-3.5 rounded-full border border-line-strong" />
                    滚动页面
                  </span>
                </div>
              </div>
            </section>
          </template>

          <!-- ════════ 快捷键 ════════ -->
          <template v-else-if="activeTab === 'shortcuts'">
            <div class="relative mb-4">
              <AppIcon
                icon="ic_search"
                :size="12"
                class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted"
              />
              <input
                v-model="shortcutQuery"
                type="text"
                placeholder="搜索…"
                class="h-8 w-full rounded-md border border-line-subtle bg-surface-0 pl-7 pr-2 text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none"
              />
            </div>
            <section
              v-for="g in filteredShortcutGroups"
              :key="g.name"
              class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4"
            >
              <h3 class="mb-2 text-xs font-medium text-fg-primary">
                {{ g.name }}
                <span class="text-fg-muted">({{ g.rows.length }})</span>
              </h3>
              <div class="flex flex-col gap-0.5">
                <div
                  v-for="r in g.rows"
                  :key="r.label"
                  class="flex items-center justify-between rounded-md bg-surface-0 px-3 py-1.5"
                >
                  <span class="text-xs text-fg-primary">{{ r.label }}</span>
                  <span class="font-mono text-[11px] text-fg-tertiary">{{ r.keys }}</span>
                </div>
              </div>
            </section>
          </template>

          <!-- ════════ 截图 ════════ -->
          <template v-else-if="activeTab === 'screenshot'">
            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <h3 class="mb-3 text-xs font-medium text-fg-primary">截图选项</h3>
              <div class="grid grid-cols-[96px_1fr] items-center gap-x-4 py-1.5">
                <span class="text-xs text-fg-secondary">截图快捷键</span>
                <div class="flex items-center gap-2">
                  <USwitch
                    :model-value="screenshotSettings?.shortcutEnabled ?? true"
                    @update:model-value="(v: boolean) => patchScreenshot({ shortcutEnabled: v })"
                  />
                  <span class="text-[11px] text-fg-tertiary">⌘⇧A 全局唤起截图</span>
                </div>
              </div>
              <div class="grid grid-cols-[96px_1fr] items-center gap-x-4 py-1.5">
                <span class="text-xs text-fg-secondary">输出格式</span>
                <select
                  class="h-7 w-36 rounded-md border border-line-subtle bg-surface-1 px-2 text-xs text-fg-primary"
                  :value="screenshotSettings?.format ?? 'png'"
                  @change="
                    patchScreenshot({
                      format: ($event.target as HTMLSelectElement).value as 'png' | 'jpg'
                    })
                  "
                >
                  <option value="png">PNG（无损）</option>
                  <option value="jpg">JPG（体积小）</option>
                </select>
              </div>
              <div
                v-if="screenshotSettings?.format === 'jpg'"
                class="grid grid-cols-[96px_1fr] items-center gap-x-4 py-1.5"
              >
                <span class="text-xs text-fg-secondary">质量</span>
                <input
                  type="range"
                  min="1"
                  max="100"
                  :value="screenshotSettings?.quality ?? 90"
                  class="w-40"
                  @change="
                    patchScreenshot({ quality: Number(($event.target as HTMLInputElement).value) })
                  "
                />
              </div>
              <div class="grid grid-cols-[96px_1fr] items-center gap-x-4 py-1.5">
                <span class="text-xs text-fg-secondary">保存路径</span>
                <div class="flex min-w-0 items-center gap-2">
                  <span class="min-w-0 flex-1 truncate text-xs text-fg-primary">
                    {{ screenshotSettings?.saveDir || '当前资源库/screenshots' }}
                  </span>
                  <UButton size="sm" variant="secondary" @click="onPickScreenshotDir"
                    >选择…</UButton
                  >
                </div>
              </div>
              <div class="grid grid-cols-[96px_1fr] items-center gap-x-4 py-1.5">
                <span class="text-xs text-fg-secondary">自动标签</span>
                <div class="flex items-center gap-2">
                  <USwitch
                    :model-value="screenshotSettings?.autoTag ?? true"
                    @update:model-value="(v: boolean) => patchScreenshot({ autoTag: v })"
                  />
                  <span class="text-[11px] text-fg-tertiary">入库时自动添加「截图」标签</span>
                </div>
              </div>
            </section>
          </template>

          <!-- ════════ 通知 ════════ -->
          <template v-else-if="activeTab === 'notification'">
            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-medium text-fg-primary">弹出通知</h3>
                <USwitch
                  size="sm"
                  :model-value="notifyMaster"
                  aria-label="启用弹出通知"
                  @update:model-value="setNotifyMaster"
                />
              </div>
              <div
                class="mt-3 flex flex-col gap-2.5"
                :class="notifyMaster ? '' : 'opacity-40'"
                :inert="!notifyMaster"
              >
                <button
                  type="button"
                  role="checkbox"
                  :aria-checked="notifyProcessing"
                  class="flex items-center gap-2 text-left text-xs text-fg-primary"
                  @click="setNotify('processing', !notifyProcessing)"
                >
                  <span
                    class="flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border"
                    :class="
                      notifyProcessing ? 'border-brand-500 bg-brand-500' : 'border-line-strong'
                    "
                  >
                    <AppIcon v-if="notifyProcessing" icon="ic-check" :size="9" class="text-white" />
                  </span>
                  素材处理完成时，弹出通知
                </button>
                <button
                  type="button"
                  role="checkbox"
                  :aria-checked="notifyUpdate"
                  class="flex items-center gap-2 text-left text-xs text-fg-primary"
                  @click="setNotify('update', !notifyUpdate)"
                >
                  <span
                    class="flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border"
                    :class="notifyUpdate ? 'border-brand-500 bg-brand-500' : 'border-line-strong'"
                  >
                    <AppIcon v-if="notifyUpdate" icon="ic-check" :size="9" class="text-white" />
                  </span>
                  应用更新可用时，弹出通知
                </button>
              </div>
            </section>
          </template>

          <!-- ════════ 密码保护 ════════ -->
          <template v-else-if="activeTab === 'privacy'">
            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-medium text-fg-primary">启用密码锁</h3>
                <USwitch
                  size="sm"
                  :model-value="actions.lockEnabled.value"
                  aria-label="启用密码锁"
                  title="前往素材库设置密码锁"
                  @update:model-value="goPrivacySettings"
                />
              </div>
              <p class="mt-2 text-[11px] leading-5 text-fg-tertiary">
                密码锁可保护您的内容在您不在时不被窥视。在密码锁设置完成后，可以通过菜单
                「Leaf」→「锁定」进行上锁。
                {{ actions.lockEnabled.value ? '当前已启用——进入素材库需解锁。' : '当前未启用。' }}
              </p>
            </section>
          </template>

          <!-- ════════ 自动导入 ════════ -->
          <template v-else-if="activeTab === 'autoimport'">
            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-medium text-fg-primary">启用自动导入</h3>
                <USwitch
                  size="sm"
                  :model-value="watchedEnabled"
                  aria-label="启用自动导入"
                  @update:model-value="toggleWatchedEnabled"
                />
              </div>
              <p class="mt-2 text-[11px] leading-5 text-fg-tertiary">
                “自动导入”功能可监控指定的文件夹，发现新文件后自动导入素材库。设置之后，只需将文件放入被监控的文件夹，Leaf
                便会自动将这些文件导入到素材库中。
              </p>

              <template v-if="watchedEnabled">
                <button
                  type="button"
                  class="mt-4 flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left text-xs text-fg-primary transition-colors duration-fast hover:bg-surface-hover"
                  @click="addWatchedFolder"
                >
                  <AppIcon
                    icon="preferences/ic-watch-folder"
                    :size="15"
                    class="shrink-0 text-fg-secondary"
                  />
                  <span class="flex-1">添加监视的文件夹...</span>
                  <AppIcon icon="preferences/ic-next" :size="12" class="text-fg-muted" />
                </button>
                <div
                  v-for="folder in watchedFolders"
                  :key="folder"
                  class="flex items-center gap-2 rounded-md px-1 py-1.5 text-xs hover:bg-surface-hover"
                >
                  <AppIcon
                    icon="preferences/ic-folder"
                    :size="15"
                    class="shrink-0 text-fg-secondary"
                  />
                  <span class="min-w-0 flex-1 truncate text-fg-primary" :title="folder">
                    {{ folder }}
                  </span>
                  <button
                    type="button"
                    class="shrink-0 text-xs text-fg-brand hover:underline"
                    @click="removeWatchedFolder(folder)"
                  >
                    停止监控
                  </button>
                </div>
                <p
                  v-if="watchedFolders.length === 0"
                  class="mt-1 px-1 text-[11px] text-fg-tertiary"
                >
                  还没有监控文件夹，点击上方「添加监视的文件夹...」开始。
                </p>
              </template>
            </section>

            <!-- F8：剪贴板常驻监听（Eagle「监听剪贴板」） -->
            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-medium text-fg-primary">监听剪贴板</h3>
                <USwitch
                  size="sm"
                  :model-value="clipboardWatchEnabled"
                  aria-label="监听剪贴板"
                  @update:model-value="toggleClipboardWatch"
                />
              </div>
              <p class="mt-2 text-[11px] leading-5 text-fg-tertiary">
                开启后，复制到剪贴板的文件路径或图片会自动导入素材库（系统通知提醒）。应用内复制素材操作不会被重复导入。
              </p>
            </section>
          </template>

          <!-- ════════ AI 搜索 ════════ -->
          <template v-else-if="activeTab === 'ai'">
            <!-- F12：文字识别（OCR） -->
            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-medium text-fg-primary">文字识别（OCR）</h3>
                <USwitch
                  size="sm"
                  :model-value="ocrStatus?.enabled ?? false"
                  aria-label="文字识别"
                  @update:model-value="toggleOcr"
                />
              </div>
              <p class="mt-2 text-[11px] leading-5 text-fg-tertiary">
                开启后自动识别图片中的文字（首次使用需下载约 20MB
                语言包），识别完成后可直接按图片内文字搜索，检查器中可查看与复制。
              </p>
              <div
                v-if="ocrStatus?.enabled"
                class="mt-3 flex items-center gap-2 text-[11px] text-fg-secondary"
              >
                <span>待识别 {{ ocrStatus.pendingTotal }} 张</span>
                <UButton size="sm" variant="secondary" :loading="ocrBusy" @click="runOcrAll">
                  识别全部缺失
                </UButton>
              </div>
            </section>
            <!-- 文档正文抽取：与 OCR 同一套队列语义（后台低优先级、缺失可批量补） -->
            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-medium text-fg-primary">文档正文抽取</h3>
                <USwitch
                  size="sm"
                  :model-value="docTextStatus?.enabled ?? false"
                  aria-label="文档正文抽取"
                  @update:model-value="toggleDocText"
                />
              </div>
              <p class="mt-2 text-[11px] leading-5 text-fg-tertiary">
                开启后自动抽取 docx / xlsx / pptx / odf / rtf / epub / pdf 以及 txt / md / csv
                等文本类素材的正文，抽取后可直接按文档内容搜索（旧版 .doc / .xls / .ppt
                不支持，需要外部转换器）。
              </p>
              <div
                v-if="docTextStatus?.enabled"
                class="mt-3 flex items-center gap-2 text-[11px] text-fg-secondary"
              >
                <span>待抽取 {{ docTextStatus.pendingTotal }} 个</span>
                <UButton
                  size="sm"
                  variant="secondary"
                  :loading="docTextBusy"
                  @click="runDocTextAll"
                >
                  抽取全部缺失
                </UButton>
              </div>
            </section>

            <!-- G1：图文向量档（中文文搜图 + 找相似第二档） -->
            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <div class="flex items-center gap-2">
                <h3 class="text-xs font-medium text-fg-primary">
                  图文向量检索（中文文搜图 + 视觉相似）
                </h3>
                <UBadge v-if="vecStatus?.ready" variant="success">
                  模型就绪 · 已索引 {{ vecStatus.indexed }}
                </UBadge>
                <UBadge v-else-if="vecStatus?.installed" variant="warning">模型未通过自检</UBadge>
                <UBadge v-else variant="neutral">未下载模型</UBadge>
              </div>
              <p class="mt-2 text-[11px] leading-5 text-fg-tertiary">
                在素材本机跑一个中文图文模型（Chinese-CLIP ViT-B/16，约
                {{ vecMb(vecStatus?.approxBytes ?? 0) }}
                MB，首次需要联网下载；推理全程本地，不上传任何图片）。建好索引后多出两档：
              </p>
              <ul class="mt-1 space-y-0.5 text-[11px] leading-5 text-fg-tertiary">
                <li>
                  · 搜索框开
                  <span class="text-fg-secondary">AI 语义</span>
                  就能用中文按画面内容搜图（「红色日落的海边」），可与文件夹/标签/维度筛选组合
                </li>
                <li>
                  · 「找相似」在 pHash 之外多一档：pHash 只认近乎同一张的图，
                  这一档认改过一版、换过封面、构图相似的那类
                </li>
              </ul>
              <p class="mt-1 text-[11px] leading-5 text-fg-tertiary">
                实测口径（48 张真图池）：中文查询 top-1 命中 18/18；「池子里确实没有」的查询最高分
                低于阈值 {{ (vecStatus?.minScore?.text ?? 0.4).toFixed(2) }}
                时宁可返回空结果，也不给一张不相干的图充数。
              </p>

              <div class="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-fg-secondary">
                <template v-if="!vecStatus">
                  <span>读不到向量服务状态（主进程未就绪？）</span>
                </template>
                <template v-else>
                  <button
                    v-if="!vecStatus.ready"
                    type="button"
                    class="rounded bg-brand-500 px-2 py-1 text-[11px] text-white disabled:opacity-50"
                    :disabled="vecBusy === 'download'"
                    @click="downloadVectorModel"
                  >
                    {{ vecBusy === 'download' ? '下载中…' : '下载模型' }}
                  </button>
                  <template v-else>
                    <UButton
                      size="sm"
                      variant="secondary"
                      :loading="vecBusy === 'index'"
                      :disabled="vecStatus.pending === 0"
                      @click="startIndex(false)"
                    >
                      补齐缺失（{{ vecStatus.pending }}）
                    </UButton>
                    <UButton size="sm" variant="ghost" @click="startIndex(true)">全量重建</UButton>
                    <UButton size="sm" variant="ghost" @click="clearVectors"> 清空向量 </UButton>
                    <UButton size="sm" variant="ghost" @click="removeVectorModel">
                      删除模型
                    </UButton>
                  </template>
                  <UButton
                    v-if="vecBusy === 'index'"
                    size="sm"
                    variant="ghost"
                    @click="cancelIndex"
                  >
                    取消
                  </UButton>
                  <span v-if="vecStatus.progress">
                    进度 {{ vecStatus.progress.done }}/{{ vecStatus.progress.total }}
                    <template v-if="vecStatus.progress.failed > 0">
                      · 失败 {{ vecStatus.progress.failed }}
                    </template>
                  </span>
                  <span v-else>模型文件 {{ vecMb(vecStatus.bytesOnDisk) }} MB</span>
                  <button
                    type="button"
                    class="text-[11px] text-fg-muted underline disabled:opacity-0"
                    :disabled="!vecStatus.lastError"
                    :title="vecStatus.lastError ?? ''"
                    @click="loadVectorStatus"
                  >
                    {{ vecStatus.lastError ? `上次失败：${vecStatus.lastError}` : '' }}
                  </button>
                </template>
              </div>
            </section>
          </template>

          <!-- ════════ AI 助手（DeepSeek 文本模型） ════════ -->
          <template v-else-if="activeTab === 'assistant'">
            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <div class="flex items-center gap-2">
                <h3 class="text-xs font-medium text-fg-primary">DeepSeek 文本模型</h3>
                <UBadge v-if="aiCfg?.configured" variant="success">已配置 {{ aiCfg.hint }}</UBadge>
                <UBadge v-else variant="neutral">未配置</UBadge>
              </div>
              <p class="mt-2 text-[11px] leading-5 text-fg-tertiary">
                只处理文字：给「有正文或 OCR 文字」的素材生成摘要与标签建议，结果由你确认后写入。
                Key 经系统密钥环加密存本机，界面拿不到明文；请求直连 api.deepseek.com。
              </p>
              <div class="mt-3 flex items-center gap-2">
                <input
                  v-model="aiKeyInput"
                  type="password"
                  placeholder="sk-…"
                  autocomplete="off"
                  class="h-8 min-w-0 flex-1 rounded-md border border-line-default bg-surface-0 px-2 text-xs text-fg-primary focus:border-brand-500 focus:outline-none"
                />
                <UButton
                  size="sm"
                  :loading="aiBusy"
                  :disabled="!aiKeyInput.trim()"
                  @click="onSaveAiKey"
                  >保存</UButton
                >
                <UButton v-if="aiCfg?.configured" size="sm" variant="ghost" @click="onClearAiKey"
                  >清除</UButton
                >
              </div>
              <div class="mt-2 flex items-center gap-2">
                <UButton
                  size="sm"
                  variant="secondary"
                  :loading="aiBusy"
                  :disabled="!aiCfg?.configured"
                  @click="onTestAi"
                  >测试连接</UButton
                >
                <span v-if="aiTest" class="min-w-0 flex-1 truncate text-[11px] text-fg-tertiary">
                  {{ aiTest }}
                </span>
              </div>
            </section>

            <!-- 视觉打标（M3 看图工作流）：OpenAI 兼容端点 + DeepSeek 预设 -->
            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <div class="flex items-center gap-2">
                <h3 class="text-xs font-medium text-fg-primary">视觉打标</h3>
                <UBadge v-if="aiCfg?.vision.configured" variant="success">已配置</UBadge>
                <UBadge v-else variant="neutral">未配置</UBadge>
              </div>
              <p class="mt-2 text-[11px] leading-5 text-fg-tertiary">
                让模型看图生成摘要与标签（右键「AI 摘要与标签」）。DeepSeek 官方 API
                暂时只有文本，这里接任何 OpenAI 兼容视觉端点——如 SiliconFlow 托管的
                DeepSeek-VL2；官方视觉档上线后改端点/模型名即可。沿用上方同一把 API
                Key；图片只以库内缩略图出库（重编码 ≤768px / 200KB），原图不出库。
              </p>
              <div class="mt-3 grid grid-cols-[64px_1fr] items-center gap-x-3 py-1">
                <span class="text-xs text-fg-secondary">启用</span>
                <div class="flex items-center gap-2">
                  <USwitch v-model="visionEnabledInput" />
                  <span class="text-[11px] text-fg-tertiary">开启后位图素材出现看图打标入口</span>
                </div>
              </div>
              <div class="mt-1 grid grid-cols-[64px_1fr] items-center gap-x-3 py-1">
                <span class="text-xs text-fg-secondary">模型名</span>
                <input
                  v-model="visionModelInput"
                  type="text"
                  placeholder="如 deepseek-vl2（留空 = 未配置视觉）"
                  autocomplete="off"
                  class="h-8 min-w-0 rounded-md border border-line-default bg-surface-0 px-2 text-xs text-fg-primary focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div class="mt-1 grid grid-cols-[64px_1fr] items-center gap-x-3 py-1">
                <span class="text-xs text-fg-secondary">端点</span>
                <input
                  v-model="visionEndpointInput"
                  type="text"
                  placeholder="留空用 DeepSeek 主端点；托管平台填 base URL（如 https://api.siliconflow.cn/v1）"
                  autocomplete="off"
                  class="h-8 min-w-0 rounded-md border border-line-default bg-surface-0 px-2 text-xs text-fg-primary focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div class="mt-2 flex items-center gap-2">
                <UButton
                  size="sm"
                  :loading="visionBusy"
                  :disabled="!aiCfg?.configured"
                  @click="onSaveVision"
                  >保存</UButton
                >
                <UButton
                  size="sm"
                  variant="secondary"
                  :loading="visionBusy"
                  :disabled="!aiCfg?.vision.configured"
                  @click="onTestVision"
                  >测试连接</UButton
                >
                <span
                  v-if="visionTest"
                  class="min-w-0 flex-1 truncate text-[11px] text-fg-tertiary"
                >
                  {{ visionTest }}
                </span>
              </div>
            </section>
          </template>

          <!-- ════════ 插件（Leaf 增值） ════════ -->
          <template v-else-if="activeTab === 'plugins'">
            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <div class="flex items-center gap-2">
                <h3 class="text-xs font-medium text-fg-primary">已安装插件</h3>
                <UBadge variant="brand">{{ plugins.length }}</UBadge>
              </div>
              <p class="mt-2 text-[11px] leading-5 text-fg-tertiary">
                插件在隔离沙箱中运行；管理面板见工具栏 ⚡ 入口（可添加自定义插件目录）。
              </p>
              <div v-if="plugins.length > 0" class="mt-3 flex flex-col gap-1">
                <div
                  v-for="p in plugins"
                  :key="p.id"
                  class="flex items-center gap-2 rounded-md bg-surface-0 px-3 py-1.5 text-xs"
                >
                  <span class="min-w-0 flex-1 truncate text-fg-primary" :title="p.id">
                    {{ p.name }}
                  </span>
                  <span class="shrink-0 text-[10px] text-fg-muted">v{{ p.version }}</span>
                  <span class="shrink-0 text-[10px] text-fg-tertiary">
                    {{ PLUGIN_CATEGORY_LABELS[p.category] ?? p.category }}
                  </span>
                </div>
              </div>
              <p v-else class="mt-3 text-[11px] text-fg-tertiary">
                暂无插件。将插件目录放入 <code>userData/plugins/</code> 后刷新。
              </p>
            </section>
          </template>

          <!-- ════════ 剪藏（Leaf 增值，Eagle 开发者 API Token 同形态） ════════ -->
          <template v-else-if="activeTab === 'clip'">
            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <div class="flex items-center gap-2">
                <h3 class="text-xs font-medium text-fg-primary">剪藏服务</h3>
                <UBadge v-if="clipRunning" variant="success">运行中</UBadge>
                <UBadge v-else variant="neutral">未运行</UBadge>
              </div>
              <p class="mt-2 text-[11px] leading-5 text-fg-tertiary">
                在 Chrome 扩展（开发者模式加载 extension/
                目录）中填入以下信息，即可右键存图入素材库。
              </p>

              <div class="mt-3 flex items-center gap-2">
                <div
                  class="flex h-8 min-w-0 flex-1 items-center rounded-md border border-line-subtle bg-surface-0 px-3"
                >
                  <code class="truncate text-xs text-fg-primary">{{ clipTokenMasked }}</code>
                </div>
                <button
                  type="button"
                  class="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg-primary"
                  :title="clipShowToken ? '隐藏 Token' : '显示 Token'"
                  aria-label="显示或隐藏 Token"
                  @click="clipShowToken = !clipShowToken"
                >
                  <AppIcon :icon="clipShowToken ? 'ic_eye' : 'preferences/ic-copy'" :size="14" />
                </button>
                <button
                  type="button"
                  class="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg-primary"
                  title="复制 Token"
                  aria-label="复制 Token"
                  @click="copyClipField(clipToken ?? '', 'Token')"
                >
                  <AppIcon icon="preferences/ic-copy" :size="14" />
                </button>
                <UButton
                  size="sm"
                  variant="secondary"
                  :loading="clipRegenerating"
                  @click="onRegenerateClipToken"
                >
                  重新生成
                </UButton>
              </div>

              <div class="mt-2 flex items-center gap-2">
                <div
                  class="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-line-subtle bg-surface-0 px-3"
                >
                  <AppIcon icon="preferences/ic-link" :size="13" class="shrink-0 text-fg-muted" />
                  <span class="truncate text-xs text-fg-secondary">
                    {{ clipServiceUrl || 'http://localhost:' + (clipPort ?? '—') + '/' }}
                  </span>
                </div>
                <button
                  type="button"
                  class="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                  :disabled="!clipServiceUrl"
                  :title="clipServiceUrl ? '复制服务地址' : '剪藏服务未运行'"
                  aria-label="复制服务地址"
                  @click="copyClipField(clipServiceUrl, '服务地址')"
                >
                  <AppIcon icon="preferences/ic-copy" :size="14" />
                </button>
              </div>
              <p class="mt-2 text-[11px] text-fg-tertiary">
                服务端口：{{ clipPort ?? '—' }} · Token 是访问凭据，重新生成后需在扩展中同步更新
              </p>
            </section>
          </template>

          <!-- ════════ 开发者选项 ════════ -->
          <template v-else-if="activeTab === 'developer'">
            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <h3 class="mb-3 text-xs font-medium text-fg-primary">日志</h3>
              <div class="grid grid-cols-[96px_1fr] items-center gap-x-4 py-1.5">
                <span class="text-xs text-fg-secondary">日志模式</span>
                <div class="flex items-center gap-10">
                  <button
                    v-for="t in telemetryOptions"
                    :key="t.id"
                    type="button"
                    role="radio"
                    :aria-checked="telemetryMode === t.id"
                    class="flex items-center gap-1.5 text-xs text-fg-primary"
                    :title="t.description"
                    @click="onSelectTelemetry(t.id)"
                  >
                    <span
                      class="flex size-3.5 items-center justify-center rounded-full border"
                      :class="telemetryMode === t.id ? 'border-brand-500' : 'border-line-strong'"
                    >
                      <span
                        class="size-1.5 rounded-full"
                        :class="telemetryMode === t.id ? 'bg-brand-500' : ''"
                      />
                    </span>
                    {{ t.label }}
                  </button>
                </div>
              </div>
              <div class="flex items-center justify-between py-1.5">
                <span class="text-xs text-fg-secondary">导出日志</span>
                <UButton size="sm" variant="secondary" @click="onExportLogs">导出</UButton>
              </div>
            </section>

            <section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
              <h3 class="mb-3 text-xs font-medium text-fg-primary">数据目录</h3>
              <div class="flex items-center justify-between gap-4 py-1.5">
                <div class="min-w-0">
                  <p class="text-xs text-fg-primary">库文件</p>
                  <p
                    class="mt-0.5 truncate text-[11px] text-fg-tertiary"
                    :title="systemInfo?.dbPath"
                  >
                    {{ systemInfo?.dbPath || '…' }}
                  </p>
                </div>
                <UButton size="sm" variant="secondary" @click="onOpenDataDir">打开目录</UButton>
              </div>
            </section>

            <p class="pb-1 text-center text-[11px] text-fg-muted">
              Leaf · v{{ appVersion }} · 本地优先 / 开源
            </p>
          </template>
        </div>

        <!-- 底部操作条（Eagle 同位同序） -->
        <footer class="flex items-center justify-end gap-2 border-t border-line-default px-4 py-3">
          <UButton size="sm" variant="primary" @click="onSaveSettings">保存设置</UButton>
          <UButton size="sm" variant="secondary" @click="goBack">应用</UButton>
        </footer>
      </section>
    </div>
  </div>
</template>
