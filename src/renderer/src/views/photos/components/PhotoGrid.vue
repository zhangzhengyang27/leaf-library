<template>
  <div
    ref="gridEl"
    class="photo-grid relative p-2.5"
    :class="marquee.marqueeActive.value ? 'select-none' : ''"
    @pointerdown="marquee.onPointerDown"
  >
    <!-- 框选橡皮筋（D-012） -->
    <div
      v-if="marquee.marqueeActive.value"
      class="pointer-events-none fixed z-20 rounded-sm border border-brand-400 bg-brand-500/10"
      :style="{
        left: `${marquee.marqueeRect.value.x}px`,
        top: `${marquee.marqueeRect.value.y}px`,
        width: `${marquee.marqueeRect.value.w}px`,
        height: `${marquee.marqueeRect.value.h}px`
      }"
      aria-hidden="true"
    />
    <!-- 加载状态 -->
    <div v-if="loading" class="flex items-center justify-center py-20 text-fg-muted">加载中...</div>

    <!-- 空状态（二十四轮对齐 Eagle：插画 + 拖放引导 + 双按钮；回收站保留原样；
         文件夹视图有子文件夹卡片时不算空——卡片本身就是内容） -->
    <div
      v-else-if="sections.length === 0 && folders.length === 0"
      class="flex flex-col items-center justify-center py-20 text-fg-muted"
    >
      <template v-if="mode === 'trash'">
        <div class="mb-4 text-6xl">📷</div>
        <div class="text-xl">回收站是空的</div>
      </template>
      <template v-else>
        <!-- Eagle 空文件夹插画（文件夹 + 浮动文件卡片 + 加号） -->
        <svg
          class="mb-6 size-44 text-fg-tertiary"
          viewBox="0 0 200 150"
          fill="none"
          aria-hidden="true"
        >
          <!-- 浮动卡片 -->
          <g opacity="0.55">
            <rect
              x="18"
              y="26"
              width="26"
              height="26"
              rx="6"
              class="stroke-current"
              stroke-width="3"
            />
            <rect
              x="152"
              y="20"
              width="30"
              height="30"
              rx="7"
              class="stroke-current"
              stroke-width="3"
            />
            <circle cx="158" cy="106" r="14" class="stroke-current" stroke-width="3" />
            <rect
              x="24"
              y="92"
              width="26"
              height="32"
              rx="5"
              class="stroke-current"
              stroke-width="3"
            />
            <path
              d="M30 100h14M30 106h14M30 112h9"
              class="stroke-current"
              stroke-width="2.5"
              stroke-linecap="round"
            />
          </g>
          <!-- 文件夹本体 -->
          <path
            d="M55 66c0-4.4 3.6-8 8-8h24l9 9h41c4.4 0 8 3.6 8 8v47c0 4.4-3.6 8-8 8H63c-4.4 0-8-3.6-8-8V66Z"
            class="fill-current opacity-25"
          />
          <path
            d="M55 74h90v39c0 4.4-3.6 8-8 8H63c-4.4 0-8-3.6-8-8V74Z"
            class="fill-current opacity-45"
          />
          <!-- 加号 -->
          <g class="stroke-current" stroke-width="6" stroke-linecap="round">
            <path d="M100 84v22M89 95h22" />
          </g>
        </svg>
        <div class="mb-2 text-lg font-medium text-fg-primary">拖放文件到这里</div>
        <div class="mb-6 text-xs text-fg-muted">你可以一次拖拽多个文件到这里添加</div>
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="rounded-md border border-line-default bg-surface-2 px-4 py-1.5 text-xs text-fg-primary transition-colors hover:bg-surface-hover"
            @click="$emit('import-folder')"
          >
            导入本地文件夹
          </button>
          <button
            type="button"
            class="rounded-md border border-line-default bg-surface-2 px-4 py-1.5 text-xs text-fg-primary transition-colors hover:bg-surface-hover"
            @click="$emit('install-extension')"
          >
            安装浏览器扩展
          </button>
        </div>
      </template>
    </div>

    <!-- 内容网格（无日期分组头；section 仅作窗口化容器） -->
    <div v-else class="space-y-8">
      <!-- 特性：子文件夹卡片段（Eagle 标志性交互，「显示子文件夹内容」关闭时显示）。
           卡片等宽走网格语义（复用方格布局列宽档），不参与瀑布流分列/自适应成行；
           FreeformCanvas 与地图视图不渲染卡片（index.vue 对该两布局不传 folders）。 -->
      <div v-if="folders.length > 0" data-test="folder-cards">
        <div :class="gridColsClass">
          <FolderCard
            v-for="f in folders"
            :key="`folder-${f.id}`"
            :folder="f"
            :selected="selectedFolderId === f.id"
            @select="selectedFolderId = $event"
          />
        </div>
      </div>
      <div v-for="section in cappedSections" :key="section.dateSection" class="photo-section">
        <!-- ── 网格：正方形裁切（Eagle 网格）── -->
        <div v-if="layout === 'grid'" :class="gridColsClass">
          <div
            v-for="photo in section.photos"
            :key="photo.id"
            :data-photo-id="photo.id"
            class="photo-item group relative flex cursor-pointer flex-col"
            :class="cutIdsSet.has(photo.id) ? 'opacity-40' : ''"
            draggable="true"
            @click="handleClick(photo, $event)"
            @dblclick="handleDblClick(photo, $event)"
            @contextmenu.prevent="
              emit('context-menu', { photo, x: $event.clientX, y: $event.clientY })
            "
            @dragstart="onDragStart(photo, $event)"
          >
            <div
              :class="[
                'thumb-wrap relative aspect-square w-full overflow-hidden rounded-[3px] border-2 transition-all duration-fast',
                thumbBgClass,
                isSelected(photo.id) || navActiveId === photo.id
                  ? 'border-brand-500'
                  : 'border-transparent'
              ]"
              :title="cardTooltip(photo)"
            >
              <HoverPreview :photo="photo" />
              <PhotoGridOverlay
                :photo="photo"
                :selected="isSelected(photo.id)"
                :mode="mode"
                :show-bar="display.showHoverBar"
                @restore="$emit('restore-photo', photo.id)"
                @preview="$emit('preview-photo', photo)"
              />
            </div>
            <CardMeta
              :selected="isSelected(photo.id)"
              :show-name="display.showName"
              :show-summary="display.showSummary !== 'none'"
              :renaming="renamingPhotoId === photo.id"
              :rename-value="renameValue"
              :name="visibleName(photo)"
              :summary="summaryText(photo)"
              @update:rename-value="renameValue = $event"
              @rename-commit="commitRename(photo)"
              @rename-cancel="emit('rename-cancel')"
            />
          </div>
        </div>

        <!-- ── 瀑布流（Eagle：等宽列 masonry，图片原始比例不裁切）── -->
        <div v-else-if="layout === 'waterfall'" class="flex items-start gap-1.5">
          <div
            v-for="(col, ci) in cachedMasonryColumns(section.photos)"
            :key="`col-${ci}`"
            class="flex min-w-0 flex-1 flex-col gap-1.5"
          >
            <div
              v-for="photo in col"
              :key="photo.id"
              :data-photo-id="photo.id"
              class="photo-item group relative flex cursor-pointer flex-col"
              :class="cutIdsSet.has(photo.id) ? 'opacity-40' : ''"
              draggable="true"
              @click="handleClick(photo, $event)"
              @dblclick="handleDblClick(photo, $event)"
              @contextmenu.prevent="
                emit('context-menu', { photo, x: $event.clientX, y: $event.clientY })
              "
              @dragstart="onDragStart(photo, $event)"
            >
              <div
                :class="[
                  'thumb-wrap relative w-full overflow-hidden rounded-[3px] border-2 transition-all duration-fast',
                  thumbBgClass,
                  isSelected(photo.id) || navActiveId === photo.id
                    ? 'border-brand-500'
                    : 'border-transparent'
                ]"
                :style="{ aspectRatio: `${aspectOf(photo)}` }"
                :title="cardTooltip(photo)"
              >
                <HoverPreview :photo="photo" />
                <PhotoGridOverlay
                  :photo="photo"
                  :selected="isSelected(photo.id)"
                  :mode="mode"
                  :show-bar="display.showHoverBar"
                  @restore="$emit('restore-photo', photo.id)"
                  @preview="$emit('preview-photo', photo)"
                />
              </div>
              <CardMeta
                :selected="isSelected(photo.id)"
                :show-name="display.showName"
                :show-summary="display.showSummary !== 'none'"
                :renaming="renamingPhotoId === photo.id"
                :rename-value="renameValue"
                :name="visibleName(photo)"
                :summary="summaryText(photo)"
                @update:rename-value="renameValue = $event"
                @rename-commit="commitRename(photo)"
                @rename-cancel="emit('rename-cancel')"
              />
            </div>
          </div>
        </div>

        <!-- ── 自适应（Eagle justified：行高≈基准微调，行内宽度按比例，整行填满）── -->
        <div v-else class="flex flex-col gap-1.5">
          <div
            v-for="(row, ri) in cachedJustifiedRows(section.photos)"
            :key="`row-${ri}`"
            class="flex items-start justify-start gap-1.5"
          >
            <div
              v-for="photo in row.photos"
              :key="photo.id"
              :data-photo-id="photo.id"
              class="photo-item group relative flex cursor-pointer flex-col"
              :class="cutIdsSet.has(photo.id) ? 'opacity-40' : ''"
              :style="{ width: Math.round(row.height * aspectOf(photo)) + 'px' }"
              draggable="true"
              @click="handleClick(photo, $event)"
              @dblclick="handleDblClick(photo, $event)"
              @contextmenu.prevent="
                emit('context-menu', { photo, x: $event.clientX, y: $event.clientY })
              "
              @dragstart="onDragStart(photo, $event)"
            >
              <div
                :class="[
                  'thumb-wrap relative w-full overflow-hidden rounded-[3px] border-2 transition-all duration-fast',
                  thumbBgClass,
                  isSelected(photo.id) || navActiveId === photo.id
                    ? 'border-brand-500'
                    : 'border-transparent'
                ]"
                :style="{ height: row.height + 'px' }"
                :title="cardTooltip(photo)"
              >
                <HoverPreview :photo="photo" />
                <PhotoGridOverlay
                  :photo="photo"
                  :selected="isSelected(photo.id)"
                  :mode="mode"
                  :show-bar="display.showHoverBar"
                  @restore="$emit('restore-photo', photo.id)"
                  @preview="$emit('preview-photo', photo)"
                />
              </div>
              <CardMeta
                :selected="isSelected(photo.id)"
                :show-name="display.showName"
                :show-summary="display.showSummary !== 'none'"
                :renaming="renamingPhotoId === photo.id"
                :rename-value="renameValue"
                :name="visibleName(photo)"
                :summary="summaryText(photo)"
                @update:rename-value="renameValue = $event"
                @rename-commit="commitRename(photo)"
                @rename-cancel="emit('rename-cancel')"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- ③ 窗口化渲染：触底增量加载更多 -->
    <div
      v-if="visibleCount < totalCount || hasMore"
      ref="sentinel"
      class="h-px w-full"
      aria-hidden="true"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, nextTick, onUnmounted, ref, watch } from 'vue'
import type { Photo, PhotoFolder, PhotoSection } from '../../../types/photo'
import { loadDoubleClickAction } from '../constants/appPreferences'
import {
  makeDisplayOptions,
  type DisplayOptions,
  type ThumbSize
} from '@renderer/stores/libraryTabs'
import HoverPreview from './HoverPreview.vue'
import PhotoGridOverlay from './PhotoGridOverlay.vue'
import CardMeta from './CardMeta.vue'
import FolderCard from './FolderCard.vue'
import { useMarquee } from '../composables/useMarquee'
import { usePhotoClipboard } from '../composables/usePhotoClipboard'

const props = withDefaults(
  defineProps<{
    sections: PhotoSection[]
    /** 代码审查 P0-10：选中集 Set 化，卡片判定 O(1) */
    selectedSet: Set<string>
    isSelectionMode: boolean
    loading: boolean
    /** normal = 图库；trash = 回收站（点击/选择禁用，悬停出现恢复按钮） */
    mode?: 'normal' | 'trash'
    /** grid = 方格裁切；waterfall = 等宽列 masonry；auto = justified 行式（Eagle 自适应） */
    layout?: 'grid' | 'waterfall' | 'auto'
    /** 键盘导航高亮项 */
    navActiveId?: string | null
    /** §3 L5 缩略图尺寸档位 */
    thumbSize?: ThumbSize
    /** D-012 显示开关（随视图持久化于 LibraryTab.display） */
    display?: DisplayOptions
    /** D-012 就地重命名：正在重命名的素材 id */
    renamingId?: string | null
    /** 分页化阶段 1：数据源还有下一页（触底后 emit load-more） */
    hasMore?: boolean
    /** 特性：子文件夹卡片（父文件夹视图、includeSubfolders 关闭时由 index.vue 传入） */
    folders?: PhotoFolder[]
  }>(),
  {
    mode: 'normal',
    layout: 'waterfall',
    navActiveId: null,
    thumbSize: 'md',
    display: makeDisplayOptions,
    renamingId: null,
    folders: () => []
  }
)

// F1：剪切态（Eagle：已剪切素材半透明）
const clipboard = usePhotoClipboard()

/**
 * 特性：卡片单击选中高亮（v1 边界：文件夹卡片不进多选集——selectedIds 只装素材 id，
 * 框选橡皮筋以 .photo-item 为准也不会框到卡片；点素材卡不清除它，切视图随组件卸载重置）
 */
const selectedFolderId = ref<string | null>(null)

// —— 容器宽度（masonry 列数 / justified 成行依赖；contentRect 已剔除 p-5 内边距）——
const gridEl = ref<HTMLElement | null>(null)
const containerW = ref(0)
let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  if (!gridEl.value) return
  resizeObserver = new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect.width ?? 0
    if (w > 0) containerW.value = w
  })
  resizeObserver.observe(gridEl.value)
})
onBeforeUnmount(() => resizeObserver?.disconnect())

/** 素材宽高比（缺尺寸按 1:1） */
function aspectOf(photo: Photo): number {
  return photo.width && photo.height && photo.height > 0 ? photo.width / photo.height : 1
}

// —— 网格列（Tailwind JIT 需源码字面量；computed 响应 TitleBar 滑块切档）——
const GRID_COLS: Record<ThumbSize, string> = {
  sm: 'grid-cols-[repeat(auto-fill,minmax(110px,1fr))]',
  md: 'grid-cols-[repeat(auto-fill,minmax(150px,1fr))]',
  lg: 'grid-cols-[repeat(auto-fill,minmax(200px,1fr))]',
  xl: 'grid-cols-[repeat(auto-fill,minmax(260px,1fr))]'
}
const gridColsClass = computed(() => `grid ${GRID_COLS[props.thumbSize]} gap-1.5`)

// —— 瀑布流 masonry：目标列宽定列数，逐张放入最矮列（Eagle 同形态）——
const MASONRY_COL_W: Record<ThumbSize, number> = { sm: 110, md: 150, lg: 200, xl: 260 }
/** 列内卡片纵向估高（缩略图外的名称/简介区），用于「最矮列」判定；名称/简介隐藏时仅剩列间距 */
function masonryMetaH(): number {
  return props.display.showName || props.display.showSummary !== 'none' ? 42 : 6
}

function masonryColumns(photos: Photo[]): Photo[][] {
  const w = containerW.value
  if (w <= 0) return [photos]
  const n = Math.max(1, Math.floor(w / MASONRY_COL_W[props.thumbSize]))
  const colW = (w - (n - 1) * 6) / n
  const cols: Photo[][] = Array.from({ length: n }, () => [])
  const heights = new Array(n).fill(0)
  for (const p of photos) {
    let idx = 0
    for (let i = 1; i < n; i++) if (heights[i] < heights[idx]) idx = i
    cols[idx].push(p)
    heights[idx] += colW / aspectOf(p) + masonryMetaH()
  }
  return cols
}

// —— 布局缓存（审查 P2-28）：布局函数在模板内直调，任意选中变化（selectedSet
// 每次都是新 Set）都会全量重跑 O(N) 布局 + 整树 diff。按「数组身份 + 内容签名 +
// 布局参数」记忆化，签名含宽高之和以覆盖 replacePhotoLocal 就地替换宽高的场景。
const masonryCache = new WeakMap<Photo[], { sig: string; value: Photo[][] }>()
const justifiedCache = new WeakMap<Photo[], { sig: string; value: JustifiedRow[] }>()
function layoutSig(photos: Photo[]): string {
  let sum = 0
  for (const p of photos) sum += (p.width ?? 0) * 31 + (p.height ?? 0)
  return [
    containerW.value,
    props.thumbSize,
    props.layout,
    props.display.showName ? 1 : 0,
    props.display.showSummary,
    photos.length,
    photos[0]?.id ?? '',
    photos[photos.length - 1]?.id ?? '',
    sum
  ].join('|')
}

function cachedMasonryColumns(photos: Photo[]): Photo[][] {
  const sig = layoutSig(photos)
  const hit = masonryCache.get(photos)
  if (hit && hit.sig === sig) return hit.value
  const value = masonryColumns(photos)
  masonryCache.set(photos, { sig, value })
  return value
}

function cachedJustifiedRows(photos: Photo[]): JustifiedRow[] {
  const sig = layoutSig(photos)
  const hit = justifiedCache.get(photos)
  if (hit && hit.sig === sig) return hit.value
  const value = justifiedRows(photos)
  justifiedCache.set(photos, { sig, value })
  return value
}

/** 剪切态 Set 化（审查 P2-28）：模板逐卡片 includes 是 O(cut) 线性查找 */
const cutIdsSet = computed(() => new Set(clipboard.cutPhotoIds.value))

// —— 自适应 justified：贪心成行，行高按填充比缩放（限制放大倍率防稀疏行过高）——
const JUSTIFY_H: Record<ThumbSize, number> = { sm: 100, md: 140, lg: 180, xl: 240 }
interface JustifiedRow {
  photos: Photo[]
  height: number
}

function justifiedRows(photos: Photo[]): JustifiedRow[] {
  const w = containerW.value
  if (w <= 0) return []
  const baseH = JUSTIFY_H[props.thumbSize]
  const rows: JustifiedRow[] = []
  let cur: Photo[] = []
  let curW = 0
  for (const p of photos) {
    cur.push(p)
    curW += baseH * aspectOf(p)
    if (curW >= w) {
      rows.push({ photos: cur, height: Math.round(Math.min(baseH * (w / curW), baseH * 1.3)) })
      cur = []
      curW = 0
    }
  }
  // 末行不强制填满：保持基准行高，左对齐（Eagle 同行为）
  if (cur.length) rows.push({ photos: cur, height: baseH })
  return rows
}

/** 二十三轮 P3：缩略图背景类（Eagle 缩略图背景子菜单）——类名须为源码字面量供 Tailwind JIT 扫描 */
const THUMB_BG: Record<NonNullable<DisplayOptions['thumbBackground']>, string> = {
  auto: 'bg-surface-hover',
  white: 'bg-white',
  dark: 'bg-[linear-gradient(45deg,#333_25%,transparent_25%),linear-gradient(-45deg,#333_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#333_75%),linear-gradient(-45deg,transparent_75%,#333_75%)] bg-[length:12px_12px] bg-[position:0_0,0_6px,6px_-6px,-6px_0] bg-gray-700',
  transparent: 'bg-transparent'
}
const thumbBgClass = computed(() => THUMB_BG[props.display?.thumbBackground ?? 'auto'])

/** 卡片简介单行（四轮对齐 Eagle：内容随显示开关「简介」切换——尺寸/大小/日期） */
function fmtCardSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes.toFixed(1)} bytes`
}

function fmtCardDate(ms: number | null | undefined): string {
  if (!ms) return '—'
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`
}

function summaryText(p: Photo): string {
  switch (props.display.showSummary) {
    case 'size':
      return fmtCardSize(p.fileSize)
    case 'added':
      return fmtCardDate(p.importedAt)
    case 'modified':
      return fmtCardDate(p.fsModifiedAt ?? p.modifiedAt)
    case 'created':
      return fmtCardDate(p.fsCreatedAt ?? p.createdAt)
    case 'dimensions':
    default:
      if (p.kind === 'video' || p.kind === 'audio') {
        if (!p.durationMs) return '—'
        const total = Math.round(p.durationMs / 1000)
        return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
      }
      if (p.kind === 'bookmark') {
        try {
          return new URL(p.sourceUrl ?? '').hostname
        } catch {
          return '书签'
        }
      }
      if (p.kind === 'font') return '字体'
      if (p.width && p.height) return `${p.width} × ${p.height}`
      return fmtCardSize(p.fileSize)
  }
}

/** 二十一轮：可见名（显示扩展名开=完整名；关=纯名）；Eagle 卡片名单色渲染，选中整名进蓝条 */
function visibleName(p: Photo): string {
  const i = p.fileName.lastIndexOf('.')
  if (i > 0 && !props.display.showExtension) return p.fileName.slice(0, i)
  return p.fileName
}

/** 六轮：原生悬停 tooltip（Eagle：格式/尺寸/文件大小/修改日期/创建日期，无尺寸段则省略） */
function cardTooltip(p: Photo): string {
  const rows = [`格式: ${extBadge(p).toLowerCase()}`]
  if (p.width && p.height) rows.push(`尺寸: ${p.width} × ${p.height}`)
  rows.push(`文件大小: ${fmtCardSize(p.fileSize)}`)
  rows.push(`修改日期: ${fmtCardDate(p.fsModifiedAt ?? p.modifiedAt)}`)
  rows.push(`创建日期: ${fmtCardDate(p.fsCreatedAt ?? p.createdAt)}`)
  return rows.join('\n')
}

/** 扩展名标签（Eagle「显示扩展名标签」） */
function extBadge(p: Photo): string {
  const i = p.fileName.lastIndexOf('.')
  if (i >= 0 && i < p.fileName.length - 1) return p.fileName.slice(i + 1).toUpperCase()
  if (p.kind === 'bookmark') return 'WEB'
  if (p.kind === 'font') return 'FONT'
  return 'FILE'
}

// —— D-012 就地重命名 ——

const renameValue = ref('')
const renamingPhotoId = ref<string | null>(null)

function startRename(p: Photo): void {
  renamingPhotoId.value = p.id
  // 预选主文件名（不含扩展名），与 Finder 习惯一致
  renameValue.value = p.fileName
  renameSettled = false
  void nextTick(() => {
    const input = gridEl.value?.querySelector<HTMLInputElement>('input[data-rename-input]')
    if (input) {
      input.focus()
      const dot = p.fileName.lastIndexOf('.')
      input.setSelectionRange(0, dot > 0 ? dot : p.fileName.length)
    }
  })
}
let renameSettled = false

function flatPhotos(): Photo[] {
  return props.sections.flatMap((s) => s.photos)
}
function commitRename(p: Photo): void {
  if (renameSettled) return
  renameSettled = true
  if (renameValue.value.trim() && renameValue.value !== p.fileName) {
    emit('rename-commit', p, renameValue.value)
  } else {
    emit('rename-cancel')
  }
}

// —— ③ 窗口化渲染：大库下只挂载前 N 张，触底经 IntersectionObserver 增量加载，避免万级 DOM 常驻 ——
const RENDER_STEP = 300
const visibleCount = ref(RENDER_STEP)
const sentinel = ref<HTMLElement | null>(null)
let io: IntersectionObserver | null = null

const totalCount = computed(() => props.sections.reduce((n, s) => n + s.photos.length, 0))
const cappedSections = computed<PhotoSection[]>(() => {
  let budget = visibleCount.value
  const out: PhotoSection[] = []
  for (const s of props.sections) {
    if (budget <= 0) break
    const take = Math.min(s.photos.length, budget)
    out.push({ dateSection: s.dateSection, photos: s.photos.slice(0, take) })
    budget -= take
  }
  return out
})

function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return node
    node = node.parentElement
  }
  return null
}

watch(totalCount, (n, o) => {
  // 仅收缩时重置渲染窗口：分页追加（阶段 2）会让 count 增长，
  // 若无脑重置会把用户已滚到的位置弹回顶部
  if (n < o) visibleCount.value = RENDER_STEP
})

// D-012：父层（右键「重命名」/ F2 / ⌘R）通过 renamingId prop 驱动就地重命名；
// 旧实现从未读取该 prop，入口全部静默失效（审查 P1-11）
watch(
  () => props.renamingId,
  (id) => {
    if (!id) {
      if (renamingPhotoId.value) renamingPhotoId.value = null
      return
    }
    if (renamingPhotoId.value === id) return
    const target = flatPhotos().find((p) => p.id === id)
    if (target) startRename(target)
  },
  // immediate：布局来回切换时组件重新挂载而 renamingId 仍在，缺它则输入框不再出现
  { immediate: true }
)

watch(
  () => sentinel.value,
  (el) => {
    io?.disconnect()
    io = null
    if (!el) return
    const scroller = scrollParentOf(el)
    io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        if (visibleCount.value < totalCount.value) {
          visibleCount.value += RENDER_STEP
        } else if (props.hasMore) {
          // 已渲染完已加载项但数据源还有下一页：请求父级追加
          emit('load-more')
        }
      },
      { root: scroller, rootMargin: '800px' }
    )
    io.observe(el)
    // 代码审查 S7：双向窗口——滚到底再回顶时收缩窗口，
    // 避免「只增不减」导致 5 万 DOM 常驻内存
    if (scroller && scroller !== scrollEl) {
      scrollEl = scroller
      const onScroll = (): void => {
        if (visibleCount.value <= RENDER_STEP) return
        if (scroller.scrollTop < scroller.clientHeight * 2) {
          visibleCount.value = RENDER_STEP
        }
      }
      scroller.addEventListener('scroll', onScroll, { passive: true })
      scrollCleanup = () => {
        scroller.removeEventListener('scroll', onScroll)
        scrollCleanup = null
      }
    }
  },
  { immediate: true }
)

let scrollEl: HTMLElement | null = null
let scrollCleanup: (() => void) | null = null
onUnmounted(() => {
  io?.disconnect()
  scrollCleanup?.()
})

const emit = defineEmits<{
  /** 分页化阶段 1：已渲染完所有已加载项且数据源还有下一页 */
  'load-more': []
  'select-photo': [photoId: string, selected: boolean]
  'preview-photo': [photo: Photo]
  /** 设置页「操控·双击文件=在默认应用打开」 */
  'open-photo': [photo: Photo]
  'toggle-favorite': [photoId: string]
  'add-tag': [photo: Photo]
  'restore-photo': [photoId: string]
  'context-menu': [payload: { photo: Photo; x: number; y: number }]
  'drag-photos': [payload: { photo: Photo; e: DragEvent }]
  /** ⌘/Shift 连选（扁平范围语义在上层统一处理） */
  'click-select': [
    photoId: string,
    modifiers: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }
  ]
  /** 框选橡皮筋（D-012）：拖拽中/结束的最终选中集 */
  'marquee-select': [ids: string[]]
  /** 就地重命名（D-012）：Enter/失焦提交，Esc 取消 */
  'rename-commit': [photo: Photo, newName: string]
  'rename-cancel': []
  /** 二十四轮（Eagle 空文件夹页）：导入本地文件夹 / 安装浏览器扩展 */
  'import-folder': []
  'install-extension': []
}>()

// —— 框选橡皮筋（D-012）——
// 几何缓存 + 贴边自动滚动在 useMarquee 内；masonry/justified 几何以 .photo-item 矩形为准
const marquee = useMarquee({
  getContainer: () => gridEl.value,
  itemSelector: '.photo-item',
  enabled: () => props.mode !== 'trash',
  getBaseSelection: () => Array.from(props.selectedSet),
  onSelect: (ids) => emit('marquee-select', ids)
})

const isSelected = (photoId: string): boolean => {
  return props.selectedSet.has(photoId)
}

const handleClick = (photo: Photo, e: MouseEvent): void => {
  if (props.mode === 'trash') return
  // ⌘/Shift 连选（D-008）：交给上层统一处理扁平范围语义
  if (e.metaKey || e.ctrlKey || e.shiftKey) {
    emit('click-select', photo.id, {
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey
    })
    return
  }
  // D-012 二轮 R1（Eagle 交互模型）：单击=选中替换（检查器刷新），双击=预览
  emit('marquee-select', [photo.id])
}

/** R1：双击打开预览（Eagle 行为）；设置页「操控·双击文件」可切换为系统默认应用打开 */
const handleDblClick = (photo: Photo, e: MouseEvent): void => {
  if (props.mode === 'trash') return
  if (e.metaKey || e.ctrlKey || e.shiftKey || props.isSelectionMode) return
  if (loadDoubleClickAction() === 'system') emit('open-photo', photo)
  else emit('preview-photo', photo)
}

/** 拖拽载荷：拖选中项之一 = 携带全部选中；否则单张 */
const onDragStart = (photo: Photo, e: DragEvent): void => {
  emit('drag-photos', { photo, e })
}

defineExpose({ startRename, flatPhotos })
</script>

<style scoped>
.photo-grid {
  flex: 1;
  overflow-y: auto;
}

/* 六期：跳渲染虚拟化——视口外 cell 跳过布局/绘制（万级库滚动开销 O(可见区)）。
   auto 关键字让 Chromium 记住上次渲染尺寸，滚动回跳不抖动 */
.photo-item {
  content-visibility: auto;
  contain-intrinsic-size: auto 220px;
}
</style>
