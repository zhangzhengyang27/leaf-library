<script setup lang="ts">
/**
 * PhotoListView · 列表布局（D-008 新增，补 Eagle 差距 #11）
 *
 * 与 PhotoGrid 同一套交互契约：选择（含 ⌘/Shift 连选）、预览、右键菜单、
 * 拖拽、键盘高亮；行 = 缩略图 + 名称 + 类型 + 尺寸/大小 + 日期 + 评分。
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import { KIND_LABELS } from '@shared/assetTypes'
import type { Photo, PhotoFolder, PhotoSection } from '../../../types/photo'
import { loadDoubleClickAction } from '../constants/appPreferences'
import AssetThumb from './AssetThumb.vue'
import FolderCard from './FolderCard.vue'
import { useMarquee } from '../composables/useMarquee'
import { usePhotoClipboard } from '../composables/usePhotoClipboard'

const props = withDefaults(
  defineProps<{
    sections: PhotoSection[]
    /** 代码审查 P0-10：选中集 Set 化，行判定 O(1) */
    selectedSet: Set<string>
    isSelectionMode: boolean
    loading: boolean
    mode?: 'normal' | 'trash'
    /** 键盘导航高亮项 */
    navActiveId?: string | null
    /** 分页化阶段 1：数据源还有下一页（触底后 emit load-more） */
    hasMore?: boolean
    /** D-012：父层（右键「重命名」/ F2 / ⌘R）驱动的行内就地重命名 */
    renamingId?: string | null
    /** 特性：子文件夹卡片（父文件夹视图、includeSubfolders 关闭时由 index.vue 传入） */
    folders?: PhotoFolder[]
  }>(),
  { mode: 'normal', navActiveId: null, renamingId: null, folders: () => [] }
)

// F1：剪切态（Eagle：已剪切素材半透明）
const clipboard = usePhotoClipboard()

/**
 * 特性：卡片单击选中高亮（v1 边界：文件夹卡片不进多选集——selectedIds 只装素材 id，
 * 框选橡皮筋以 .list-row 为准也不会框到卡片；切视图随组件卸载重置）
 */
const selectedFolderId = ref<string | null>(null)

const emit = defineEmits<{
  /** 分页化阶段 1：已渲染完所有已加载项且数据源还有下一页 */
  'load-more': []
  'select-photo': [photoId: string, selected: boolean]
  'preview-photo': [photo: Photo]
  /** 设置页「操控·双击文件=在默认应用打开」 */
  'open-photo': [photo: Photo]
  'restore-photo': [photoId: string]
  'context-menu': [payload: { photo: Photo; x: number; y: number }]
  'drag-photos': [payload: { photo: Photo; e: DragEvent }]
  'click-select': [
    photoId: string,
    modifiers: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }
  ]
  /** D-012 框选橡皮筋：拖拽中/结束的最终选中集 */
  'marquee-select': [ids: string[]]
  /** D-012 就地重命名（与 PhotoGrid 同一契约，父层 onRenameCommit 复用） */
  'rename-commit': [photo: Photo, newName: string]
  'rename-cancel': []
}>()

const isSelected = (photoId: string): boolean => props.selectedSet.has(photoId)

// —— D-012 框选橡皮筋（与 PhotoGrid 同一 composable）——
const listEl = ref<HTMLElement | null>(null)
const marquee = useMarquee({
  getContainer: () => listEl.value,
  itemSelector: '.list-row',
  enabled: () => props.mode !== 'trash',
  getBaseSelection: () => [...props.selectedSet],
  onSelect: (ids) => emit('marquee-select', ids)
})

// —— D-012 行内就地重命名（P1-11 收尾：此前列表布局没有该能力，
//    入口在列表/自由网格下写了 renamingId 却无人消费 → 静默无反应）——

const renamingPhotoId = ref<string | null>(null)
const renameValue = ref('')
let renameSettled = false

function startRename(p: Photo): void {
  renamingPhotoId.value = p.id
  renameValue.value = p.fileName
  renameSettled = false
  void nextTick(() => {
    const input = listEl.value?.querySelector<HTMLInputElement>('input[data-rename-input]')
    if (input) {
      input.focus()
      const dot = p.fileName.lastIndexOf('.')
      input.setSelectionRange(0, dot > 0 ? dot : p.fileName.length)
    }
  })
}

function commitRename(p: Photo): void {
  if (renameSettled) return
  renameSettled = true
  if (renameValue.value.trim() && renameValue.value !== p.fileName)
    emit('rename-commit', p, renameValue.value)
  else emit('rename-cancel')
  renamingPhotoId.value = null
}

function cancelRename(): void {
  emit('rename-cancel')
  renamingPhotoId.value = null
}

watch(
  () => props.renamingId,
  (id) => {
    if (!id) {
      renamingPhotoId.value = null
      return
    }
    if (renamingPhotoId.value === id) return
    const target = props.sections.flatMap((s) => s.photos).find((p) => p.id === id)
    if (target) startRename(target)
  },
  // immediate：布局来回切换时组件会重新挂载，而父层的 renamingId 仍在——
  // 没有它则回到列表后输入框不再出现（与 PhotoGrid 同修）
  { immediate: true }
)

function handleClick(photo: Photo, e: MouseEvent): void {
  if (props.mode === 'trash') return
  if (e.metaKey || e.ctrlKey || e.shiftKey) {
    emit('click-select', photo.id, {
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey
    })
    return
  }
  // D-012 二轮 R1（Eagle 交互模型）：单击=选中替换，双击=预览
  emit('marquee-select', [photo.id])
}

/** R1：双击打开预览（Eagle 行为）；设置页「操控·双击文件」可切换为系统默认应用打开 */
function handleDblClick(photo: Photo, e: MouseEvent): void {
  if (props.mode === 'trash') return
  if (e.metaKey || e.ctrlKey || e.shiftKey || props.isSelectionMode) return
  if (loadDoubleClickAction() === 'system') emit('open-photo', photo)
  else emit('preview-photo', photo)
}

function onDragStart(photo: Photo, e: DragEvent): void {
  emit('drag-photos', { photo, e })
}

const kindIcon: Record<string, string> = {
  image: 'ic_photo',
  video: 'ic_film',
  audio: 'ic_music',
  font: 'ic_font-sans',
  bookmark: 'ic_book',
  file: 'context-menu/ic-filter-item-ext'
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDims(photo: Photo): string {
  if (photo.kind === 'video' && photo.durationMs) {
    const sec = Math.round(photo.durationMs / 1000)
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
  }
  if (photo.width && photo.height) return `${photo.width}×${photo.height}`
  return '—'
}

function formatDate(photo: Photo): string {
  const d = new Date(photo.importedAt)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

/** 非日期分组标题（相似视图等）原样展示 */
const isDateSection = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s)

const sectionTitle = (s: string): string => {
  if (!isDateSection(s)) return s
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]
  if (s === today) return '今天'
  if (s === yesterday) return '昨天'
  return s
}

const flatCount = computed(() => props.sections.reduce((n, s) => n + s.photos.length, 0))

// —— ③ 窗口化渲染：大库下只挂载前 N 行，触底经 IntersectionObserver 增量加载，避免万级 DOM 常驻 ——
const RENDER_STEP = 300
const visibleCount = ref(RENDER_STEP)
const sentinel = ref<HTMLElement | null>(null)
let io: IntersectionObserver | null = null

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

watch(flatCount, (n, o) => {
  // 仅收缩时重置渲染窗口：分页追加（阶段 2）会让 count 增长，
  // 若无脑重置会把用户已滚到的位置弹回顶部
  if (n < o) visibleCount.value = RENDER_STEP
})

watch(
  () => sentinel.value,
  (el) => {
    io?.disconnect()
    io = null
    if (!el) return
    io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        if (visibleCount.value < flatCount.value) {
          visibleCount.value += RENDER_STEP
        } else if (props.hasMore) {
          // 已渲染完已加载项但数据源还有下一页：请求父级追加
          emit('load-more')
        }
      },
      { root: scrollParentOf(el), rootMargin: '800px' }
    )
    io.observe(el)
  },
  { immediate: true }
)

onUnmounted(() => io?.disconnect())
</script>

<template>
  <div
    ref="listEl"
    class="photo-list relative p-4"
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

    <!-- 空状态（有子文件夹卡片时不算空——卡片本身就是内容） -->
    <div
      v-else-if="flatCount === 0 && folders.length === 0"
      class="flex flex-col items-center justify-center py-20 text-fg-muted"
    >
      <div class="mb-4 text-6xl">📷</div>
      <div class="mb-2 text-xl">{{ mode === 'trash' ? '回收站是空的' : '还没有素材' }}</div>
      <div class="text-sm">{{ mode === 'trash' ? '' : '点击工具栏导入，或从浏览器剪藏收集' }}</div>
    </div>

    <div v-else class="space-y-6">
      <!-- 特性：子文件夹卡片行（Eagle 标志性交互，「显示子文件夹内容」关闭时显示；
           FreeformCanvas 与地图视图不渲染卡片——index.vue 对该两布局不传 folders） -->
      <div v-if="folders.length > 0" data-test="folder-cards">
        <div class="overflow-hidden rounded-md border border-line-subtle">
          <FolderCard
            v-for="f in folders"
            :key="`folder-${f.id}`"
            :folder="f"
            variant="row"
            :selected="selectedFolderId === f.id"
            @select="selectedFolderId = $event"
          />
        </div>
      </div>
      <div v-for="section in cappedSections" :key="section.dateSection">
        <div class="mb-1.5 flex items-baseline gap-2 px-1">
          <h2 class="text-sm font-semibold text-fg-primary">
            {{ sectionTitle(section.dateSection) }}
          </h2>
          <span class="text-xs text-fg-muted">{{ section.photos.length }} 项</span>
        </div>

        <div class="overflow-hidden rounded-md border border-line-subtle">
          <div
            v-for="photo in section.photos"
            :key="photo.id"
            class="list-row group flex h-11 items-center gap-3 border-b border-line-subtle px-3 transition-colors duration-instant last:border-b-0"
            :class="[
              isSelected(photo.id) ? 'bg-brand-500/10' : 'hover:bg-surface-hover',
              navActiveId === photo.id ? 'ring-1 ring-inset ring-brand-500' : '',
              clipboard.cutPhotoIds.value.includes(photo.id) ? 'opacity-40' : ''
            ]"
            :data-photo-id="photo.id"
            draggable="true"
            @click="handleClick(photo, $event)"
            @dblclick="handleDblClick(photo, $event)"
            @contextmenu.prevent="
              emit('context-menu', { photo, x: $event.clientX, y: $event.clientY })
            "
            @dragstart="onDragStart(photo, $event)"
          >
            <span
              class="flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors"
              :class="
                isSelected(photo.id)
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-line-strong text-transparent group-hover:border-brand-400'
              "
              @click.stop="emit('select-photo', photo.id, !isSelected(photo.id))"
            >
              <AppIcon v-if="isSelected(photo.id)" icon="ic-check" :size="10" />
            </span>

            <div class="size-8 shrink-0 overflow-hidden rounded-sm bg-surface-hover">
              <AssetThumb :photo="photo" :cover="true" />
            </div>

            <input
              v-if="renamingPhotoId === photo.id"
              data-rename-input
              class="min-w-0 flex-1 truncate rounded-xs border border-brand-500 bg-surface-1 px-1 text-xs text-fg-primary outline-none"
              :value="renameValue"
              draggable="false"
              @click.stop
              @dblclick.stop
              @input="renameValue = ($event.target as HTMLInputElement).value"
              @keydown.enter.prevent="commitRename(photo)"
              @keydown.esc.prevent="cancelRename()"
              @blur="commitRename(photo)"
            />
            <span v-else class="min-w-0 flex-1 truncate text-xs text-fg-primary">
              {{ photo.fileName }}
            </span>

            <span
              class="hidden w-20 shrink-0 items-center gap-1 text-[11px] text-fg-muted md:flex"
              :title="KIND_LABELS[photo.kind]"
            >
              <AppIcon
                :icon="kindIcon[photo.kind] ?? 'context-menu/ic-filter-item-ext'"
                :size="13"
              />
              {{ KIND_LABELS[photo.kind] }}
            </span>

            <span class="hidden w-24 shrink-0 text-[11px] tabular-nums text-fg-muted sm:block">
              {{ formatDims(photo) }}
            </span>
            <span class="hidden w-20 shrink-0 text-[11px] tabular-nums text-fg-muted sm:block">
              {{ formatSize(photo.fileSize) }}
            </span>
            <span class="hidden w-24 shrink-0 text-[11px] tabular-nums text-fg-muted md:block">
              {{ formatDate(photo) }}
            </span>
            <span
              v-if="photo.rating > 0"
              class="w-10 shrink-0 text-right text-[11px] text-amber-500"
            >
              ★{{ photo.rating }}
            </span>
            <span v-else class="w-10 shrink-0" />

            <button
              v-if="mode === 'trash'"
              type="button"
              class="shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] text-fg-secondary opacity-0 transition-opacity hover:bg-surface-hover hover:text-fg-primary group-hover:opacity-100"
              @click.stop="emit('restore-photo', photo.id)"
            >
              恢复
            </button>
          </div>
        </div>
      </div>
    </div>
    <!-- ③ 窗口化渲染：触底增量加载更多 -->
    <div
      v-if="visibleCount < flatCount || hasMore"
      ref="sentinel"
      class="h-px w-full"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.photo-list {
  flex: 1;
  overflow-y: auto;
}

.list-row {
  content-visibility: auto;
  contain-intrinsic-size: auto 44px;
}
</style>
