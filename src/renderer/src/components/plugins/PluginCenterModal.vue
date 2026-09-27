<script setup lang="ts">
/**
 * PluginCenterModal · 插件中心（P1 离线核心，D-025）
 *
 * Eagle 4.0 插件中心的像素级复刻（蓝本：eagle asar app/js/directives/plugin-center.html
 * + app.css 全部 .plugin-center 规则实测值），自绘 fixed 容器替代 UModal：
 *
 *   容器     1080×800（max-width calc(100%-40px) / max-height calc(100%-60px)），
 *            圆角 10 + border + shadow，打开动画 pluginCenterPopup：scale .96→1（150ms）
 *   overlay  bg-overlay + backdrop blur；点 overlay 关闭，面板内点击不冒泡
 *   双页     page.list / page.detail 绝对定位铺满；list 自 -100%、detail 自 +100%
 *            滑入（200ms cubic-bezier(0.4,0,0.22,1)，即 Eagle --timing-function-super）
 *   list 页  左栏 198px（标题 48 高 / 搜索框 36 高 / 分类行 32 高 + 主色计数徽标，
 *            update 分类 margin-top 20 + 分割线）｜右栏 surface-3 圆角 8 margin 8px 0，
 *            header 高 48 底部分割，插件行 padding 12px 8px gap 12px、logo 40×40 圆角 10
 *            右下 14px 状态圆点、名称 13 粗 + 版本 mono 12 半透明、desc 12 单行截断、
 *            more 区按钮 min-width 88 高 32（主色安装 / 灰已安装·禁用中）
 *   detail 页左栏 280px（plugin-card 居中：大 logo 80×80 圆角 20、名称 16 粗、描述 13/18、
 *            整宽按钮 + props 属性表）｜右栏 header 换 back + segmented-tabs（指示滑块
 *            200ms 滑动）+ close，tabs-container 为 plugin-intro（14px/1.7）与版本记录
 *
 * 业务语义与 P1 完全一致（本次只改形态）：
 *   - 数据源 usePluginRegistry（全量含禁用）+ window.api.plugins.listBuiltin（未安装内置项）
 *   - 「安装」= 安装内置（过 requestConfirm）；「已安装」点击 = 禁用、「禁用中」点击 = 启用
 *   - 详情页整宽按钮同状态机 + 「卸载」（danger，requestConfirm 确认）
 *   - 「导入 .leafplugin…」两段式导入（选文件 → inspect → 权限确认 → 落盘），Leaf 独有，
 *     放列表页左栏底部（button-grey 弱化）
 *   - 分类 tab 照 Eagle 全量视觉（slugs：all/ai-tools/image/productivity/converter/format/
 *     video/inspector/others + update），Leaf 实际类别映射：inspector→inspector、
 *     format→format、window→productivity（工具窗口≈效率）、development→others；
 *     没有内容的分类计数 0 也保留
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import { useToast } from '@composables/useToast'
import { usePluginRegistry } from '@renderer/composables/usePluginRegistry'
import { isEscTop, popEscScope, pushEscScope } from '@renderer/utils/escStack'
import { PLUGIN_CATEGORY_LABELS } from '@renderer/types/plugin'
import type { PluginCategory } from '@renderer/types/plugin'
import { useDialogs } from '@views/photos/composables/useDialogs'
import illuSearchEmptyLight from '../../assets/illustrations/plugin-search-empty-light.svg'
import illuSearchEmptyDark from '../../assets/illustrations/plugin-search-empty-dark.svg'
import statusInstalledDot from '../../assets/icons/plugin-status-installed.svg'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const { plugins, reload, setEnabled } = usePluginRegistry()
const toast = useToast()
const dialogs = useDialogs()

/** 当前是否暗色（useTheme 只在 html 上切 .dark，观察之；空态插图/滑块底色随主题） */
const isDark = ref(
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
)
let themeObserver: MutationObserver | null = null
onMounted(() => {
  themeObserver = new MutationObserver(() => {
    isDark.value = document.documentElement.classList.contains('dark')
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})
onBeforeUnmount(() => {
  themeObserver?.disconnect()
  themeObserver = null
})

// ─────────────────────────────────────────────────────────────
// 分类（Eagle slugs 全量 + Leaf 类别映射）
// ─────────────────────────────────────────────────────────────

/** Eagle 分类侧栏条目（名称照 Eagle 中文语序；图标 = ic-plugin-type-{slug}） */
const CATEGORIES = [
  { slug: 'all', name: '全部', icon: 'ic-plugin-type-all' },
  { slug: 'ai-tools', name: 'AI 工具', icon: 'ic-plugin-type-ai-tools' },
  { slug: 'image', name: '图像', icon: 'ic-plugin-type-image' },
  { slug: 'productivity', name: '效率', icon: 'ic-plugin-type-productivity' },
  { slug: 'converter', name: '转换器', icon: 'ic-plugin-type-converter' },
  { slug: 'format', name: '格式', icon: 'ic-plugin-type-format' },
  { slug: 'video', name: '视频', icon: 'ic-plugin-type-video' },
  { slug: 'inspector', name: '检查器', icon: 'ic-plugin-type-inspector' },
  { slug: 'others', name: '其他', icon: 'ic-plugin-type-others' },
  { slug: 'update', name: '待更新', icon: 'ic-plugin-type-update' }
] as const

type CategorySlug = (typeof CATEGORIES)[number]['slug']

/** Leaf 插件类别 → Eagle 分类 slug（window≈效率、development 归入其他） */
const LEAF_TO_EAGLE_SLUG: Record<PluginCategory, Exclude<CategorySlug, 'all' | 'update'>> = {
  inspector: 'inspector',
  format: 'format',
  window: 'productivity',
  development: 'others'
}

function slugOf(category: PluginCategory): Exclude<CategorySlug, 'all' | 'update'> {
  return LEAF_TO_EAGLE_SLUG[category]
}

/** Eagle 分类图标名（列表 logo 占位 / props 分类行复用） */
function catIconOf(category: PluginCategory): string {
  return `ic-plugin-type-${slugOf(category)}`
}

// ─────────────────────────────────────────────────────────────
// 数据装配：安装件（registry 全量含禁用）+ 未安装内置项
// ─────────────────────────────────────────────────────────────

/** 中心面板统一行模型（安装件与未安装内置项归一） */
interface RowItem {
  id: string
  name: string
  version: string
  description?: string
  category: PluginCategory
  installed: boolean
  enabled: boolean
  source: 'builtin' | 'imported' | 'dev'
  permissions: string[]
  entry: string
}

const builtinRaw = ref<Array<{ id: string; name: string; version: string; category: string; entry: string; description?: string; permissions?: string[] }>>([])

/** 来源 → props「开发者」行文案（Leaf 无在线作者体系） */
const SOURCE_LABEL: Record<RowItem['source'], string> = {
  builtin: 'Leaf 内置',
  imported: '本地导入',
  dev: '开发者目录'
}

const allRows = computed<RowItem[]>(() => {
  const byName = (a: RowItem, b: RowItem): number => a.name.localeCompare(b.name)
  const installedRows: RowItem[] = plugins.value.map((p) => ({
    id: p.id,
    name: p.name,
    version: p.version,
    description: p.description,
    category: p.category,
    installed: true,
    enabled: p.enabled,
    source: p.source,
    permissions: p.permissions ?? [],
    entry: p.entry
  }))
  const installedIds = new Set(plugins.value.map((p) => p.id))
  const builtinRows: RowItem[] = builtinRaw.value
    .filter((b) => !installedIds.has(b.id))
    .map((b) => ({
      id: b.id,
      name: b.name,
      version: b.version,
      description: b.description,
      category: b.category as PluginCategory,
      installed: false,
      enabled: false,
      source: 'builtin' as const,
      permissions: b.permissions ?? [],
      entry: b.entry
    }))
  return [...installedRows.sort(byName), ...builtinRows.sort(byName)]
})

const query = ref('')
const activeSlug = ref<CategorySlug>('all')
const activeCategory = computed(() => CATEGORIES.find((c) => c.slug === activeSlug.value) ?? CATEGORIES[0])

function selectCategory(slug: CategorySlug): void {
  activeSlug.value = slug
}

/** 分类计数徽标：全部=总量、update=待更新数（Leaf 无更新源恒 0），空分类显示 0 保留 */
const categoryCounts = computed<Record<CategorySlug, number>>(() => {
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.slug, 0])) as Record<CategorySlug, number>
  for (const row of allRows.value) counts[slugOf(row.category)]++
  counts.all = allRows.value.length
  counts.update = 0
  return counts
})

/** 列表结果：分类 + 关键词过滤（Eagle resultList 语义） */
const resultList = computed<RowItem[]>(() => {
  const q = query.value.trim().toLowerCase()
  const slug = activeSlug.value
  return allRows.value.filter((row) => {
    if (slug === 'update') return false // Leaf 无更新源，待更新分类恒空
    if (slug !== 'all' && slugOf(row.category) !== slug) return false
    if (!q) return true
    return (
      row.name.toLowerCase().includes(q) ||
      row.id.toLowerCase().includes(q) ||
      (row.description ?? '').toLowerCase().includes(q)
    )
  })
})

// ─────────────────────────────────────────────────────────────
// 双页滑动：list ⇄ detail（Eagle page.list / page.detail.show）
// ─────────────────────────────────────────────────────────────

const activePage = ref<'list' | 'detail'>('list')
const selectedId = ref<string | null>(null)
const currentTab = ref<'overview' | 'logs'>('overview')

/** 详情行（从全量行取，不受列表过滤影响） */
const detail = computed<RowItem | null>(
  () => allRows.value.find((r) => r.id === selectedId.value) ?? null
)

function openDetail(row: RowItem): void {
  selectedId.value = row.id
  currentTab.value = 'overview'
  activePage.value = 'detail'
  void nextTick(updateTabIndicator)
}

function backToList(): void {
  activePage.value = 'list'
}

// ── 分段式 tabs 滑动指示器（Eagle ng-style tabIndicatorStyle 的 Vue 实现）──
const tabsRef = ref<HTMLElement | null>(null)
const tabIndicator = ref<{ transform: string; width: string }>({
  transform: 'translateX(0px)',
  width: '0px'
})

function updateTabIndicator(): void {
  const container = tabsRef.value
  if (!container) return
  const active = container.querySelector<HTMLElement>('.tab.active')
  if (!active) return
  tabIndicator.value = {
    width: `${active.offsetWidth}px`,
    transform: `translateX(${active.offsetLeft}px)`
  }
}

function switchTab(tab: 'overview' | 'logs'): void {
  currentTab.value = tab
  void nextTick(updateTabIndicator)
}

// ─────────────────────────────────────────────────────────────
// 开合：overlay 关闭 / Esc（escStack 层级裁决，确认弹窗在其上时不抢）/ 打开刷新
// ─────────────────────────────────────────────────────────────

const searchRef = ref<HTMLInputElement | null>(null)
let escScope: symbol | null = null

function close(): void {
  emit('update:modelValue', false)
}

function onKeydown(e: KeyboardEvent): void {
  if (!props.modelValue) return
  if (e.key === 'Escape' && escScope && isEscTop(escScope)) {
    e.preventDefault()
    e.stopPropagation()
    close()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown, true)
  void refresh()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  if (escScope) popEscScope(escScope)
  escScope = null
})

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      if (!escScope) escScope = pushEscScope()
      activePage.value = 'list'
      selectedId.value = null
      currentTab.value = 'overview'
      void refresh()
      // Eagle auto-focus="OPEN_PLUGIN_CENTER"：打开即聚焦搜索框
      void nextTick(() => searchRef.value?.focus())
    } else if (escScope) {
      popEscScope(escScope)
      escScope = null
    }
  }
)

async function refresh(): Promise<void> {
  await reload()
  try {
    builtinRaw.value = await window.api.plugins.listBuiltin()
  } catch {
    builtinRaw.value = []
  }
}

// ─────────────────────────────────────────────────────────────
// 操作：启停 / 安装内置 / 卸载 / 导入（语义与 P1 上一版一致）
// ─────────────────────────────────────────────────────────────

/** 启停直接切换（无确认，与原 USwitch 一致）；Eagle 无此语义（其为主菜单启停） */
async function toggleEnabled(row: RowItem): Promise<void> {
  try {
    await setEnabled(row.id, !row.enabled)
    toast.success(row.enabled ? '插件已禁用（扩展点即时卸载）' : '插件已启用')
  } catch (error) {
    toast.error('启停失败', { description: (error as Error).message })
  }
}

/** 正在安装中的插件 id（Eagle installingPluginMaps 的等价物；Leaf 无下载进度，只给态） */
const installingIds = reactive(new Set<string>())

/** 安装内置插件（列表与详情页共用；敏感动作过 requestConfirm） */
function installBuiltin(row: RowItem): void {
  dialogs.requestConfirm(
    '安装内置插件',
    `安装「${row.name}」到 userData/plugins/。\n\n权限：${
      row.permissions.length ? row.permissions.join('、') : '未声明'
    }`,
    '安装',
    async () => {
      installingIds.add(row.id)
      try {
        const res = await window.api.plugins.installBuiltin(row.id)
        if (!res.ok) {
          toast.error('安装失败', { description: res.error ?? '未知错误' })
          return
        }
        await refresh()
        toast.success('插件已安装')
      } catch (error) {
        toast.error('安装失败', { description: (error as Error).message })
      } finally {
        installingIds.delete(row.id)
      }
    }
  )
}

/** 卸载（danger；requestConfirm 确认；开发者目录插件不提供） */
function uninstallSelected(): void {
  const p = detail.value
  if (!p || !p.installed || p.source === 'dev') return
  dialogs.requestConfirm(
    '卸载插件',
    `将删除「${p.name}」的安装副本（userData/plugins/${p.id}）。\n\n内置插件之后可随时重新安装；开发者目录中的插件不受影响。`,
    '卸载',
    async () => {
      try {
        const res = await window.api.plugins.uninstall(p.id)
        if (!res.ok) {
          toast.error('卸载失败', { description: res.error })
          return
        }
        selectedId.value = null
        activePage.value = 'list'
        await refresh()
        toast.success('插件已卸载')
      } catch (error) {
        toast.error('卸载失败', { description: (error as Error).message })
      }
    }
  )
}

const importing = ref(false)

/** 导入 .leafplugin（Leaf 独有，Eagle 无此按钮）：两段式选文件 → inspect → 权限确认 → 落盘 */
async function pickAndImport(): Promise<void> {
  if (importing.value) return
  importing.value = true
  try {
    const zipPath = await window.api.plugins.pickPluginZip()
    if (!zipPath) return // 用户取消选择
    const inspected = await window.api.plugins.inspectPlugin(zipPath)
    if (!inspected.ok || !inspected.meta) {
      toast.error('导入失败', { description: inspected.error ?? '未知错误' })
      return
    }
    const meta = inspected.meta
    await new Promise<void>((resolveConfirm, rejectConfirm) => {
      dialogs.requestConfirm(
        '安装插件',
        `安装「${meta.name}」v${meta.version} 到 userData/plugins/。\n\n权限：${meta.permissions.length ? meta.permissions.join('、') : '未声明'}`,
        '安装',
        async () => {
          try {
            const res = await window.api.plugins.importPlugin(zipPath)
            if (!res.ok) {
              toast.error('导入失败', { description: res.error ?? '未知错误' })
              rejectConfirm(new Error(res.error ?? '导入失败'))
              return
            }
            await refresh()
            selectedId.value = res.id ?? null
            toast.success(`插件已导入：${res.id}`)
            resolveConfirm()
          } catch (error) {
            rejectConfirm(error as Error)
          }
        }
      )
    })
  } catch {
    /* 用户在确认弹窗点了取消——静默 */
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <!-- overlay：bg-overlay + blur，点击空白关闭；面板内点击 @click.stop 不冒泡 -->
    <div v-if="modelValue" class="pc-overlay" @click.self="close">
      <!-- Eagle .modal.plugin-center：1080×800 圆角 10 面板，打开 scale .96→1（150ms） -->
      <div
        class="plugin-center plugin-center-modal"
        role="dialog"
        aria-modal="true"
        aria-label="插件中心"
        @click.stop
      >
        <!-- ═══════════ page.list：列表页 ═══════════ -->
        <div class="page list" :class="{ show: activePage === 'list' }">
          <div class="pc-container">
            <!-- 左栏 198px：标题 + 搜索 + 分类 + 导入（Leaf 独有） -->
            <aside class="left-panel">
              <div class="title">插件中心</div>
              <div class="search-box">
                <AppIcon icon="ic_search" :size="16" class="search-glyph" />
                <input
                  ref="searchRef"
                  v-model="query"
                  type="text"
                  placeholder="搜索插件..."
                />
              </div>
              <nav class="plugin-category-list">
                <div
                  v-for="c in CATEGORIES"
                  :key="c.slug"
                  class="plugin-category"
                  :class="[`category-${c.slug}`, { active: activeCategory.slug === c.slug }]"
                  @click="selectCategory(c.slug)"
                >
                  <div class="icon"><AppIcon :icon="c.icon" :size="16" /></div>
                  <div class="name">{{ c.name }}</div>
                  <div class="badge">{{ categoryCounts[c.slug] ?? 0 }}</div>
                </div>
              </nav>
              <button
                type="button"
                class="pc-btn grey import-btn"
                :disabled="importing"
                @click="pickAndImport"
              >
                导入 .leafplugin…
              </button>
            </aside>

            <!-- 右栏：header 48 + 空态 / 插件列表 -->
            <section class="right-panel">
              <header class="panel-header">
                <div class="panel-title">{{ activeCategory.name }}</div>
                <button type="button" class="close" aria-label="关闭" @click="close">
                  <AppIcon icon="ic-modal-close" :size="24" />
                </button>
              </header>

              <!-- 空态（Eagle empty-state：搜索无结果 / 无需更新 / 重新加载） -->
              <div v-if="resultList.length === 0" class="empty-state">
                <template v-if="query.trim()">
                  <div class="icon">
                    <img
                      v-if="isDark"
                      class="illu"
                      :src="illuSearchEmptyDark"
                      alt=""
                    />
                    <img v-else class="illu" :src="illuSearchEmptyLight" alt="" />
                  </div>
                  <div class="title">无结果</div>
                  <p>请尝试其他关键词。</p>
                </template>
                <template v-else-if="activeCategory.slug === 'update'">
                  <div class="icon">
                    <img
                      v-if="isDark"
                      class="illu"
                      :src="illuSearchEmptyDark"
                      alt=""
                    />
                    <img v-else class="illu" :src="illuSearchEmptyLight" alt="" />
                  </div>
                  <div class="title">无需更新</div>
                  <p>没有需要更新的插件</p>
                </template>
                <template v-else>
                  <button type="button" class="pc-btn grey" @click="void refresh()">重新加载</button>
                </template>
              </div>

              <!-- 插件列表（Eagle .plugin-list > .plugin） -->
              <div v-else class="plugin-list">
                <div
                  v-for="row in resultList"
                  :key="row.id"
                  class="plugin"
                  @click="openDetail(row)"
                >
                  <div class="logo">
                    <AppIcon :icon="catIconOf(row.category)" :size="20" class="logo-glyph" />
                    <!-- 右下 14px 状态圆点：已安装=绿、禁用=灰（去饱和） -->
                    <div v-if="row.installed" class="status" :class="{ off: !row.enabled }">
                      <img :src="statusInstalledDot" alt="" />
                    </div>
                  </div>
                  <div class="info">
                    <div class="info-main">
                      <div class="name">
                        {{ row.name }}
                        <span class="version">{{ row.version }}</span>
                      </div>
                      <div class="desc">{{ row.description || '该插件没有提供描述。' }}</div>
                    </div>
                    <div class="more">
                      <!-- 状态机：正在安装 → 安装（主色） ⇄ 已安装/禁用中（灰，点击启停） -->
                      <button
                        v-if="installingIds.has(row.id)"
                        type="button"
                        class="pc-btn grey"
                        disabled
                      >
                        正在安装
                      </button>
                      <button
                        v-else-if="!row.installed"
                        type="button"
                        class="pc-btn primary"
                        @click.stop="installBuiltin(row)"
                      >
                        <AppIcon icon="ic-plugin-list-download" :size="16" />
                        安装
                      </button>
                      <button
                        v-else-if="row.enabled"
                        type="button"
                        class="pc-btn grey"
                        @click.stop="toggleEnabled(row)"
                      >
                        已安装
                      </button>
                      <button
                        v-else
                        type="button"
                        class="pc-btn grey"
                        @click.stop="toggleEnabled(row)"
                      >
                        禁用中
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        <!-- ═══════════ page.detail：详情页 ═══════════ -->
        <div class="page detail" :class="{ show: activePage === 'detail' }">
          <div class="pc-container">
            <!-- 左栏 280px：plugin-card 居中 + props 属性表 -->
            <aside class="left-panel detail-left-panel">
              <div v-if="detail" class="plugin-detail-info">
                <div class="plugin-card">
                  <div class="logo">
                    <AppIcon :icon="catIconOf(detail.category)" :size="32" class="logo-glyph" />
                  </div>
                  <div class="name">{{ detail.name }}</div>
                  <div class="desc">{{ detail.description || '该插件没有提供描述。' }}</div>
                  <div class="card-actions">
                    <button
                      v-if="installingIds.has(detail.id)"
                      type="button"
                      class="pc-btn grey block"
                      disabled
                    >
                      正在安装...
                    </button>
                    <button
                      v-else-if="!detail.installed"
                      type="button"
                      class="pc-btn primary block"
                      @click="installBuiltin(detail)"
                    >
                      <AppIcon icon="ic-plugin-list-download" :size="16" />
                      安装
                    </button>
                    <button
                      v-else-if="detail.enabled"
                      type="button"
                      class="pc-btn grey block"
                      @click="toggleEnabled(detail)"
                    >
                      已安装
                    </button>
                    <button
                      v-else
                      type="button"
                      class="pc-btn grey block"
                      @click="toggleEnabled(detail)"
                    >
                      禁用中
                    </button>
                    <button
                      v-if="detail.installed && detail.source !== 'dev'"
                      type="button"
                      class="pc-btn danger block"
                      @click="uninstallSelected"
                    >
                      卸载
                    </button>
                  </div>
                  <p v-if="detail.installed && detail.source === 'dev'" class="dev-hint">
                    开发者目录插件请在设置中管理（卸载会删除你的工作目录）
                  </p>
                </div>
                <!-- props 属性表（Eagle .plugin-props 两列：图标+标签 ｜ 值） -->
                <div class="plugin-props">
                  <div class="props">
                    <div class="prop">
                      <div class="icon"><AppIcon icon="ic-plugin-prop-developer" :size="16" /></div>
                      开发者
                    </div>
                    <div class="prop">
                      <div class="icon"><AppIcon icon="ic-plugin-prop-version" :size="16" /></div>
                      版本
                    </div>
                    <div class="prop">
                      <div class="icon"><AppIcon :icon="catIconOf(detail.category)" :size="16" /></div>
                      分类
                    </div>
                    <div class="prop">
                      <div class="icon">
                        <AppIcon icon="context-menu/ic-privacy" :size="16" />
                      </div>
                      权限
                    </div>
                    <div class="prop">
                      <div class="icon"><AppIcon icon="ic-plugin-local" :size="16" /></div>
                      入口
                    </div>
                  </div>
                  <div class="values">
                    <div class="value">{{ SOURCE_LABEL[detail.source] }}</div>
                    <div class="value mono">{{ detail.version }}</div>
                    <div class="value">
                      {{ PLUGIN_CATEGORY_LABELS[detail.category] ?? detail.category }}
                    </div>
                    <div
                      class="value"
                      :title="detail.permissions.join('、')"
                    >
                      {{ detail.permissions.length ? detail.permissions.join('、') : '未声明' }}
                    </div>
                    <div class="value mono" :title="detail.entry">{{ detail.entry }}</div>
                  </div>
                </div>
              </div>
            </aside>

            <!-- 右栏：back + segmented-tabs + close，tabs-container 介绍/版本记录 -->
            <section class="right-panel">
              <header class="panel-header detail-panel-header">
                <button type="button" class="back" aria-label="返回列表" @click="backToList">
                  <AppIcon icon="ic-plugin-panel-back" :size="20" />
                </button>
                <div ref="tabsRef" class="segmented-tabs">
                  <div class="tab-indicator" :class="{ dark: isDark }" :style="tabIndicator" />
                  <div
                    class="tab"
                    :class="{ active: currentTab === 'overview' }"
                    @click="switchTab('overview')"
                  >
                    插件介绍
                  </div>
                  <div
                    class="tab"
                    :class="{ active: currentTab === 'logs' }"
                    @click="switchTab('logs')"
                  >
                    版本记录
                  </div>
                </div>
                <button type="button" class="close" aria-label="关闭" @click="close">
                  <AppIcon icon="ic-modal-close" :size="24" />
                </button>
              </header>

              <div v-show="currentTab === 'overview'" class="tabs-container">
                <div class="plugin-intro">
                  <p>{{ detail?.description || '该插件没有提供描述。' }}</p>
                  <p>插件运行在隔离沙箱中，仅可读取注入的素材数据。</p>
                </div>
              </div>

              <div v-show="currentTab === 'logs'" class="tabs-container">
                <div class="logs">
                  <!-- Leaf manifest 无 changelog 字段：有数据时按 .log 结构渲染，当前显示占位 -->
                  <p v-if="detail" class="logs-empty">该插件未提供版本记录。</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ═══════════════ 容器与 overlay（Eagle .modal.plugin-center 实测值） ═══════════════ */

.pc-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--overlay-bg);
  backdrop-filter: blur(2px);
}

.plugin-center {
  pointer-events: all;
  -webkit-font-smoothing: antialiased;
  width: 1080px;
  max-width: calc(100% - 40px);
  height: 800px;
  max-height: calc(100% - 60px);
  position: relative;
  border-radius: 10px;
  border: 1px solid var(--border-default);
  background: var(--surface-3);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  /* Eagle pluginCenterPopup：150ms super 曲线 scale .96→1 */
  animation: pc-popup 150ms cubic-bezier(0.4, 0, 0.22, 1) both;
}

@keyframes pc-popup {
  0% {
    opacity: 0;
    transform: scale(0.96);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

/* 双页滑动（Eagle .page / .page.list / .page.detail） */
.page {
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  transition: all 200ms cubic-bezier(0.4, 0, 0.22, 1);
}
.page.list {
  opacity: 0.5;
  transform: translateX(-100%);
}
.page.list.show {
  opacity: 1;
  transform: translateX(0%);
}
.page.detail {
  opacity: 0.5;
  transform: translateX(100%);
}
.page.detail.show {
  opacity: 1;
  transform: translateX(0%);
}

.pc-container {
  display: flex;
  gap: 12px;
  padding-right: 8px;
  height: 100%;
}

/* ═══════════════ 左栏（list 198px / detail 280px） ═══════════════ */

.left-panel {
  box-sizing: border-box;
  width: 198px;
  padding: 8px 0 0 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.left-panel > .title {
  display: flex;
  height: 48px;
  flex-shrink: 0;
  align-items: center;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  padding-left: 4px;
}

.search-box {
  position: relative;
  flex-shrink: 0;
  margin: 0 4px 12px 0;
}
.search-box input {
  font-size: 13px;
  width: 100%;
  height: 36px;
  box-sizing: border-box;
  background: var(--surface-0);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 0 8px 0 32px;
  color: var(--text-primary);
  outline: none;
}
.search-box input::placeholder {
  color: var(--text-muted);
}
.search-glyph {
  position: absolute;
  left: 9px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}

.plugin-category-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.plugin-category {
  display: flex;
  align-items: center;
  padding: 0 8px;
  height: 32px;
  font-size: 13px;
  color: var(--text-secondary);
  background-color: transparent;
  transition: all 250ms cubic-bezier(0.4, 0, 0.22, 1);
  border-radius: 6px;
  margin-bottom: 2px;
  cursor: pointer;
}
.plugin-category:hover,
.plugin-category.active {
  color: var(--text-primary);
  background-color: var(--surface-active);
}
.plugin-category .icon {
  display: flex;
  margin-right: 8px;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.plugin-category .name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 主色计数徽标（Eagle .badge：mono、20 高胶囊） */
.plugin-category .badge {
  font-size: 12px;
  margin-left: auto;
  background: var(--brand-500);
  color: #fff;
  display: inline-block;
  height: 20px;
  line-height: 20px;
  align-self: center;
  padding: 0 7px;
  border-radius: 20px;
  font-family: var(--font-mono);
}
/* update 分类：分割线 + 上方留白（Eagle .category-update） */
.plugin-category.category-update {
  position: relative;
  margin-top: 20px;
}
.plugin-category.category-update::before {
  position: absolute;
  content: '';
  top: -10px;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--border-subtle);
}

/* 导入 .leafplugin（Leaf 独有，button-grey 弱化，置左栏底部） */
.import-btn {
  flex-shrink: 0;
  align-self: stretch;
  margin: 8px 4px 8px 0;
}

/* ═══════════════ 右栏（surface-3 圆角 8 + border + shadow） ═══════════════ */

.right-panel {
  flex: 1;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  margin: 8px 0;
  background: var(--surface-3);
  border: 1px solid var(--border-subtle);
  /* --shadow-lg 随主题换值（light 8% / dark 55% 黑），对应 Eagle 亮暗两套右栏投影 */
  box-shadow:
    0 0 0 1px var(--border-subtle),
    var(--shadow-lg);
}

.panel-header {
  display: flex;
  align-items: center;
  padding: 0 12px;
  height: 48px;
  min-height: 48px;
  border-bottom: 1px solid var(--border-subtle);
}
.panel-header .panel-title {
  flex: 1;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  padding-left: 4px;
}

/* close 24×24 圆角 4（Eagle ic-modal-close 底图 → mask 渲染随主题） */
.panel-header .close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary);
  border: none;
  background: transparent;
  padding: 0;
  transition: all 250ms ease;
}
.panel-header .close:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

/* ═══════════════ 空态（Eagle .empty-state） ═══════════════ */

.empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translateX(-50%) translateY(-50%);
  width: calc(100% - 40px);
  text-align: center;
  font-size: 13px;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
}
.empty-state .icon {
  margin-bottom: 24px;
}
.empty-state .icon .illu {
  width: 90px;
  -webkit-user-drag: none;
  display: block;
}
.empty-state .title {
  font-size: 16px;
  line-height: 24px;
  margin-bottom: 8px;
  color: var(--text-primary);
  font-weight: 700;
}
.empty-state p {
  line-height: 1.5;
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0;
}
.empty-state .pc-btn {
  margin-top: 16px;
  padding: 0 16px;
}

/* ═══════════════ 插件列表（Eagle .plugin-list > .plugin） ═══════════════ */

.plugin-list {
  padding: 4px;
  overflow-y: auto;
  flex: 1;
}

.plugin {
  --row-name: var(--text-secondary);
  --row-desc: var(--text-tertiary);
  display: flex;
  padding: 12px 8px;
  gap: 12px;
  transition: all 250ms cubic-bezier(0.4, 0, 0.22, 1);
  border-radius: 6px;
  cursor: pointer;
  background-color: transparent;
}
.plugin:hover {
  --row-name: var(--text-primary);
  --row-desc: var(--text-secondary);
  background-color: var(--surface-hover);
}

/* logo 40×40 圆角 10 + 右下 14px 状态圆点 */
.plugin .logo {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--surface-0);
  box-shadow: 0 0 0 1px var(--border-default);
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.plugin .logo .logo-glyph {
  color: var(--text-tertiary);
}
.plugin .logo .status {
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--surface-3);
}
.plugin .logo .status img {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  display: block;
}
.plugin .logo .status.off img {
  filter: grayscale(1);
  opacity: 0.55;
}

.plugin .info {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
}
.plugin .info-main {
  flex: 1;
  min-width: 0;
}
.plugin .name {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  line-height: 22px;
  font-weight: 700;
  color: var(--row-name);
  margin-bottom: 4px;
}
.plugin .name .version {
  font-size: 12px;
  opacity: 0.5;
  margin-left: 8px;
  font-weight: 400;
  font-family: var(--font-mono);
}
.plugin .desc {
  font-size: 12px;
  color: var(--row-desc);
  line-height: 1.5em;
  max-height: 1.5em;
  overflow: hidden;
}
.plugin .more {
  display: flex;
  align-items: center;
  margin-left: auto;
  padding: 0 0 0 20px;
  justify-content: flex-end;
  white-space: nowrap;
  gap: 16px;
  flex-shrink: 0;
}
.plugin .more .pc-btn {
  min-width: 88px;
}

/* ═══════════════ 按钮（Eagle .button.button-xs + plugin-center 覆写：高 32 / min-width 88） ═══════════════ */

.pc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-sizing: border-box;
  min-width: 32px;
  height: 32px;
  padding: 0 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  border: 1px solid transparent;
  margin: 0;
  transition: all 150ms cubic-bezier(0.4, 0, 0.22, 1);
}
.pc-btn.primary {
  background-color: var(--brand-500);
  color: var(--text-inverse);
}
.pc-btn.primary:hover {
  background-color: var(--brand-600);
}
.pc-btn.grey {
  background-color: var(--surface-hover);
  border-color: var(--border-subtle);
  color: var(--text-secondary);
}
.pc-btn.grey:hover {
  background-color: var(--surface-active);
  color: var(--text-primary);
}
.pc-btn.danger {
  background-color: transparent;
  border-color: var(--color-danger);
  color: var(--text-danger);
}
.pc-btn.danger:hover {
  background-color: var(--color-danger);
  color: #fff;
}
.pc-btn.block {
  width: 100%;
}
.pc-btn:disabled {
  opacity: 0.5;
  cursor: default;
  pointer-events: none;
}

/* ═══════════════ 详情页左栏（280px：plugin-card + plugin-props） ═══════════════ */

.detail-left-panel {
  width: 280px;
  padding: 8px 0 8px 8px;
}

.plugin-detail-info {
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1;
  border-radius: 8px;
  padding-top: 36px;
}

.plugin-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: var(--text-primary);
  padding: 0 16px 20px 16px;
}
.plugin-card .logo {
  width: 80px;
  height: 80px;
  border-radius: 20px;
  box-shadow: 0 0 0 1px var(--border-default);
  background: var(--surface-0);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.plugin-card .logo .logo-glyph {
  color: var(--text-tertiary);
}
.plugin-card .name {
  user-select: text;
  font-weight: 700;
  font-size: 16px;
  line-height: 24px;
  margin-bottom: 8px;
  text-align: center;
}
.plugin-card .desc {
  user-select: text;
  color: var(--text-tertiary);
  font-size: 13px;
  line-height: 18px;
  text-align: center;
  margin-bottom: 12px;
}
.plugin-card .card-actions {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.plugin-card .dev-hint {
  font-size: 11px;
  line-height: 16px;
  color: var(--text-muted);
  text-align: center;
  margin: 8px 0 0;
}

/* props 属性表（Eagle .plugin-props 两列） */
.plugin-props {
  display: flex;
  font-size: 12px;
  gap: 8px;
  overflow: hidden;
  user-select: text;
  margin: 0 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-default);
}
.plugin-props .props {
  color: var(--text-primary);
  padding-right: 12px;
}
.plugin-props .props .prop {
  height: 26px;
  display: flex;
  flex-wrap: nowrap;
  white-space: nowrap;
  align-items: center;
  margin-bottom: 2px;
  gap: 2px;
}
.plugin-props .props .prop .icon {
  margin-right: 4px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.plugin-props .values {
  flex: 1;
  min-width: 0;
  color: var(--text-primary);
}
.plugin-props .values .value {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  margin-bottom: 2px;
  min-height: 26px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mono {
  font-family: var(--font-mono);
}

/* ═══════════════ 详情页右栏（back + segmented-tabs + tabs-container） ═══════════════ */

.panel-header.detail-panel-header {
  justify-content: space-between;
  border-bottom: none;
  opacity: 0.8;
}

.panel-header.detail-panel-header .back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary);
  border: none;
  background: transparent;
  padding: 0;
  transition: all 250ms ease;
  opacity: 0.8;
}
.panel-header.detail-panel-header .back:hover {
  background: var(--surface-hover);
  opacity: 1;
  color: var(--text-primary);
}

.segmented-tabs {
  display: flex;
  gap: 2px;
  align-items: center;
  justify-content: center;
  padding: 3px;
  border-radius: 6px;
  position: relative;
  background: var(--surface-hover);
}
.tab-indicator {
  position: absolute;
  top: 2px;
  left: 0;
  height: 28px;
  border-radius: 4px;
  transition:
    transform 200ms cubic-bezier(0.4, 0, 0.22, 1),
    width 200ms cubic-bezier(0.4, 0, 0.22, 1);
  z-index: 0;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #fff;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.1);
}
/* Eagle dark：lightgray-10 底 + 深投影（无边框） */
.tab-indicator.dark {
  background: var(--surface-active);
  border: none;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.2);
}
.segmented-tabs .tab {
  padding: 0 16px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
  transition:
    color 150ms ease,
    font-weight 150ms ease;
  color: var(--text-tertiary);
  position: relative;
  z-index: 1;
  white-space: nowrap;
}
.segmented-tabs .tab:hover {
  color: var(--text-secondary);
}
.segmented-tabs .tab.active {
  color: var(--text-primary);
}

.tabs-container {
  padding: 8px 16px 16px;
  user-select: text;
  overflow-y: auto;
  flex: 1;
}

/* 插件介绍（Eagle .plugin-intro：14px/1.7 富文本容器） */
.plugin-intro {
  font-size: 14px;
  line-height: 1.7;
  overflow: hidden;
  padding: 0 4px;
  word-break: break-word;
  overflow-wrap: break-word;
  color: var(--text-secondary);
}
.plugin-intro > :first-child {
  margin-top: 0;
}
.plugin-intro > :last-child {
  margin-bottom: 0;
}
.plugin-intro p {
  line-height: 1.7;
  margin: 0.75em 0;
}

/* 版本记录（Eagle .logs：版本号 mono + 日期胶囊 + 列表；Leaf 暂无 changelog 数据） */
.logs {
  color: var(--text-primary);
}
.logs .log {
  padding: 0 0 24px;
}
.logs .log .version {
  font-weight: 700;
  font-size: 16px;
  margin-bottom: 10px;
}
.logs .log .version .number {
  font-family: var(--font-mono);
}
.logs .log .version .date {
  color: var(--text-secondary);
  font-weight: 400;
  font-size: 12px;
  margin-left: 12px;
  line-height: 22px;
  padding: 0 8px;
  display: inline-block;
  border-radius: 3px;
  background: var(--surface-hover);
}
.logs .log ul {
  list-style: disc;
  padding-left: 14px;
  font-size: 13px;
  line-height: 24px;
  opacity: 0.8;
}
.logs-empty {
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0;
}

/* 滚动条走全局 app-scroll；此处仅补弱化滚动条样式 */
.plugin-category-list,
.plugin-list,
.tabs-container,
.plugin-detail-info {
  scrollbar-width: thin;
}

/* 尊重 reduced-motion：动画与滑动过渡全部省略 */
@media (prefers-reduced-motion: reduce) {
  .plugin-center {
    animation: none;
  }
  .page,
  .pc-btn,
  .plugin-category,
  .plugin,
  .tab-indicator {
    transition: none;
  }
}
</style>
