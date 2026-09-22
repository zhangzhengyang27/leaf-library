<script setup lang="ts">
/**
 * UContextMenu · 右键菜单（D-008）
 * - Fluent 风格：rounded-lg + shadow-md + fast 动效
 * - 视口边缘自动翻转定位
 * - 键盘：↑↓ 移动 / Enter 确认 / Esc 关闭
 * 状态源见 composables/useContextMenu.ts（模块单例）
 * 二十四轮：二级子菜单（Eagle 密码保护/排列/移动文件夹/导出 等箭头项，
 * hover 父项弹出飞出面板，越界向左翻转）；色点行；快捷键提示。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useContextMenu, type MenuItem } from '../../composables/useContextMenu'

const { state, close } = useContextMenu()

const panelRef = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0 })
const activeIndex = ref(-1)
/** 六轮：菜单搜索（Eagle 卡片右键菜单顶部搜索框） */
const query = ref('')

// ── 二级子菜单（二十四轮）──
interface SubmenuState {
  parent: MenuItem
  parentKey: string
  items: MenuItem[]
  x: number
  y: number
}
const submenu = ref<SubmenuState | null>(null)
const submenuRef = ref<HTMLElement | null>(null)
const SUB_W = 200
/** 网格子菜单（emoji 图标）宽度 */
const SUB_GRID_W = 248

function subWidth(): number {
  return submenu.value?.parent.grid ? SUB_GRID_W : SUB_W
}

/** 过滤后仍应渲染的项（含分隔线——两侧至少一侧可见才渲染） */
function visibleItems(): Array<{ item: MenuItem; index: number }> {
  const s = state.value
  if (!s) return []
  const q = query.value.trim().toLowerCase()
  const all = s.items
  if (!s.searchable || !q) return all.map((item, index) => ({ item, index }))
  const match = (it: MenuItem): boolean => !it.divider && (it.label ?? '').toLowerCase().includes(q)
  return all
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => {
      if (item.divider) {
        const prev = all[index - 1]
        const next = all[index + 1]
        return Boolean(prev && next && match(prev) && match(next))
      }
      return match(item)
    })
}

function pickableIndexes(): number[] {
  if (!state.value) return []
  // 排除子菜单父项（审查 P3-69）：键盘 Enter 命中父项时旧实现会当作普通项
  // pick 并关菜单，与鼠标 hover 展开子菜单的行为不一致
  return visibleItems()
    .filter(({ item }) => !item.divider && !item.disabled && !item.colors && !item.children)
    .map(({ index }) => index)
}

function pick(item: MenuItem): void {
  if (item.divider || item.disabled) return
  const onPick = state.value?.onPick
  close()
  onPick?.(item.key)
}

/** 色点行（Eagle 文件夹菜单）：点某个圆点 → 以 `color:<key>` 回调 */
function pickColor(item: MenuItem, dot: { key: string; hex: string }): void {
  const onPick = state.value?.onPick
  close()
  onPick?.(`color:${item.key}:${dot.key}`)
}

// ── 二级子菜单 ──
function openSubmenu(item: MenuItem, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect()
  const w = item.grid ? SUB_GRID_W : SUB_W
  let x = rect.right - 4
  let y = rect.top - 4
  if (x + w > window.innerWidth - 8) x = Math.max(8, rect.left - w + 4)
  if (y + 240 > window.innerHeight - 8) y = Math.max(8, window.innerHeight - 248)
  submenu.value = { parent: item, parentKey: item.key, items: item.children ?? [], x, y }
}

function onRowEnter(item: MenuItem, e: MouseEvent): void {
  activeIndex.value = visibleItems().findIndex((p) => p.item.key === item.key)
  const anchor = e.currentTarget as HTMLElement | null
  if (item.children && anchor) openSubmenu(item, anchor)
  else if (!item.children) submenu.value = null
}

function pickSub(parent: MenuItem, child: MenuItem): void {
  if (child.divider || child.disabled) return
  const onPick = state.value?.onPick
  close()
  onPick?.(`sub:${parent.key}:${child.key}`)
}

/** 挂载后测量尺寸，越界翻转 */
async function place(): Promise<void> {
  if (!state.value) return
  pos.value = { x: state.value.x, y: state.value.y }
  await nextTick()
  const el = panelRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  let { x, y } = pos.value
  if (x + rect.width > window.innerWidth - 8) x = Math.max(8, x - rect.width)
  if (y + rect.height > window.innerHeight - 8) y = Math.max(8, y - rect.height)
  pos.value = { x, y }
  resetActive()
}

/** 六轮审查：高亮项校验——被搜索过滤隐藏后回落到第一个可见可选项 */
function resetActive(): void {
  const pickable = pickableIndexes()
  activeIndex.value = pickable.includes(activeIndex.value) ? activeIndex.value : (pickable[0] ?? -1)
}

/**
 * 菜单打开时它吃掉这些键：捕获阶段 stopPropagation，
 * 否则同一事件还会冒泡到 window 上的预览/网格键盘层——
 * Esc 关菜单的同时会把整个预览浮层一起关掉（与 UModal 的 Esc 裁决同一口径）。
 */
function onKeydown(e: KeyboardEvent): void {
  if (!state.value) return
  const pickable = pickableIndexes()
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    close()
    return
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    e.stopPropagation()
    if (pickable.length === 0) return
    const cur = pickable.indexOf(activeIndex.value)
    const next =
      e.key === 'ArrowDown'
        ? pickable[(cur + 1) % pickable.length]
        : pickable[(cur - 1 + pickable.length) % pickable.length]
    activeIndex.value = next
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    const pickable = pickableIndexes()
    if (pickable.length === 0) return
    // 六轮审查：过滤后高亮可能指向隐藏项，回落到第一个可见项
    const target = pickable.includes(activeIndex.value) ? activeIndex.value : pickable[0]
    const item = state.value.items[target]
    if (item) pick(item)
  }
}

function onWindowMouseDown(e: MouseEvent): void {
  if (!state.value) return
  // 七轮审查 P0：捕获阶段先于面板冒泡 .stop 执行——必须放行面板内按下，
  // 否则菜单项在 mousedown 即被卸载，click 永远无法触达（鼠标点不了菜单）
  if (panelRef.value && panelRef.value.contains(e.target as Node)) return
  if (submenu.value && submenuRef.value && submenuRef.value.contains(e.target as Node)) return
  close()
}

function onWindowContextMenu(e: MouseEvent): void {
  // 已有菜单打开时，别处再右键 → 直接关闭（事件继续传播生成新菜单）
  if (state.value) close()
  void e
}

watch(state, (s) => {
  query.value = ''
  submenu.value = null
  if (s) void place()
})

/** 六轮审查：搜索词变化 → 高亮校验 + 面板高度变化重定位 */
watch(query, () => {
  submenu.value = null
  void place()
})

onMounted(() => {
  window.addEventListener('keydown', onKeydown, true)
  window.addEventListener('mousedown', onWindowMouseDown, true)
  // capture 先于目标元素处理器执行：旧菜单先关，再由目标元素打开新菜单
  window.addEventListener('contextmenu', onWindowContextMenu, true)
  window.addEventListener('resize', close)
  window.addEventListener('blur', close)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('mousedown', onWindowMouseDown, true)
  window.removeEventListener('contextmenu', onWindowContextMenu, true)
  window.removeEventListener('resize', close)
  window.removeEventListener('blur', close)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="state"
      ref="panelRef"
      role="menu"
      class="fixed z-[1300] min-w-[176px] overflow-hidden rounded-lg border border-line-default bg-surface-3 py-1 shadow-md"
      :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
      @mousedown.stop
      @contextmenu.prevent
    >
      <!-- 六轮：菜单搜索框（Eagle 卡片右键菜单形态） -->
      <div v-if="state.searchable" class="border-b border-line-subtle px-2 py-1.5">
        <div class="flex items-center gap-1.5 rounded-sm bg-surface-1 px-2 py-1">
          <AppIcon icon="ic_search" :size="12" class="shrink-0 text-fg-muted" />
          <input
            v-model="query"
            type="text"
            placeholder="搜索..."
            class="h-5 w-full bg-transparent text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none"
          />
        </div>
      </div>
      <template v-for="pair in visibleItems()" :key="`${pair.item.key}-${pair.index}`">
        <div v-if="pair.item.divider" class="mx-2 my-1 h-px bg-line-subtle" />
        <!-- 色点行（Eagle 文件夹菜单的文件夹颜色） -->
        <div
          v-else-if="pair.item.colors"
          class="menu-item mx-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-sm px-2.5 py-1.5"
          :class="activeIndex === pair.index ? 'is-active' : ''"
          @mouseenter="onRowEnter(pair.item, $event)"
        >
          <button
            v-for="dot in pair.item.colors"
            :key="dot.key"
            type="button"
            class="size-3.5 shrink-0 rounded-full border border-black/20 transition-transform hover:scale-125"
            :style="{ backgroundColor: dot.hex }"
            :aria-label="dot.key"
            :title="dot.key"
            @click="pickColor(pair.item, dot)"
          />
        </div>
        <button
          v-else
          type="button"
          role="menuitem"
          :disabled="pair.item.disabled"
          class="menu-item mx-1 flex w-[calc(100%-8px)] items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-xs transition-colors duration-instant disabled:cursor-not-allowed disabled:opacity-40"
          :class="[
            pair.item.danger ? 'text-danger' : 'text-fg-primary',
            activeIndex === pair.index ? 'is-active' : ''
          ]"
          @click="pick(pair.item)"
          @mouseenter="onRowEnter(pair.item, $event)"
        >
          <AppIcon
            v-if="pair.item.icon"
            :icon="pair.item.icon"
            :class="pair.item.danger ? 'text-danger' : 'text-fg-secondary'"
          />
          <span class="min-w-0 flex-1 truncate">{{ pair.item.label }}</span>
          <!-- 右对齐快捷键提示（Eagle ⌘⇧N 形态） -->
          <span v-if="pair.item.shortcut" class="shrink-0 text-[11px] tabular-nums text-fg-muted">{{
            pair.item.shortcut
          }}</span>
          <AppIcon v-if="pair.item.checked" icon="ic-check" class="text-brand-500" />
          <!-- 二级子菜单箭头 -->
          <AppIcon
            v-if="pair.item.children"
            icon="ic-context-menu-arrow-right"
            class="text-fg-muted"
          />
        </button>
      </template>
    </div>

    <!-- 二级子菜单飞出面板 -->
    <div
      v-if="submenu"
      ref="submenuRef"
      role="menu"
      class="fixed z-[1310] max-h-[60vh] overflow-y-auto overflow-x-hidden rounded-lg border border-line-default bg-surface-3 py-1 shadow-md app-scroll"
      :class="submenu.parent.grid ? '' : 'min-w-[176px]'"
      :style="{
        left: `${submenu.x}px`,
        top: `${submenu.y}px`,
        width: `${subWidth()}px`
      }"
      @mousedown.stop
      @contextmenu.prevent
    >
      <!-- 网格子菜单（Eagle 文件夹图标▸ 的 emoji 网格） -->
      <div v-if="submenu.parent.grid" class="flex flex-wrap gap-1 px-2 py-1.5">
        <button
          v-for="(child, ci) in submenu.items"
          :key="`${child.key}-${ci}`"
          type="button"
          role="menuitem"
          class="flex size-9 items-center justify-center rounded-md text-[19px] leading-none transition-colors hover:bg-surface-hover"
          :class="
            child.checked
              ? 'bg-brand-500/15 ring-1 ring-brand-500'
              : child.disabled
                ? 'cursor-not-allowed opacity-40'
                : ''
          "
          :title="child.label"
          :aria-label="child.label"
          @click="pickSub(submenu.parent, child)"
        >
          <AppIcon v-if="child.icon" :icon="child.icon" :size="16" class="text-fg-secondary" />
          <span v-else-if="child.key === '__none'" class="text-xs text-fg-muted">无</span>
          <span v-else>{{ child.label }}</span>
        </button>
      </div>
      <!-- 普通列表子菜单 -->
      <template v-else>
        <template v-for="(child, ci) in submenu.items" :key="`${child.key}-${ci}`">
          <div v-if="child.divider" class="mx-2 my-1 h-px bg-line-subtle" />
          <button
            v-else
            type="button"
            role="menuitem"
            :disabled="child.disabled"
            class="menu-item mx-1 flex w-[calc(100%-8px)] items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-xs transition-colors duration-instant disabled:cursor-not-allowed disabled:opacity-40"
            :class="child.danger ? 'text-danger' : 'text-fg-primary'"
            @click="pickSub(submenu.parent, child)"
          >
            <AppIcon
              v-if="child.icon"
              :icon="child.icon"
              :class="child.danger ? 'text-danger' : 'text-fg-secondary'"
            />
            <span class="min-w-0 flex-1 truncate">{{ child.label }}</span>
            <AppIcon v-if="child.checked" icon="ic-check" class="text-brand-500" />
          </button>
        </template>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.menu-item:not(:disabled):hover,
.menu-item.is-active {
  background: var(--surface-hover);
}
</style>
