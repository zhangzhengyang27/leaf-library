<template>
  <div class="photos-page relative flex h-screen flex-row bg-surface-0">
    <!-- 六期：素材库锁屏（启用密码锁后每次进入需解锁） -->
    <div
      v-if="locked"
      class="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-surface-0"
    >
      <span class="text-6xl">🔒</span>
      <p class="text-lg text-fg-primary">素材库已锁定</p>
      <div class="flex items-center gap-2">
        <input
          v-model="unlockPassword"
          type="password"
          placeholder="输入密码解锁"
          class="w-56 rounded-md border border-line-default bg-surface-1 h-8 px-3 text-sm text-fg-primary focus:outline-none focus:border-brand-500"
          @keyup.enter="actions.handleUnlock"
        />
        <UButton variant="primary" @click="actions.handleUnlock">解锁</UButton>
      </div>
    </div>

    <!-- §2.A 拖拽入库遮罩（窗口级拖入文件时显示） -->
    <transition name="fade">
      <div
        v-if="importDragActive"
        class="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-brand-500/10 backdrop-blur-sm"
      >
        <div
          class="rounded-xl border-2 border-dashed border-brand-400 bg-surface-1/80 px-8 py-6 text-center text-fg-primary"
        >
          <AppIcon
            icon="context-menu/ic-import-local"
            :size="28"
            class="mx-auto mb-2 text-brand-400"
          />
          <p class="text-sm font-medium">松开以导入素材</p>
        </div>
      </div>
    </transition>

    <!-- Eagle 式布局：检查器/信息栏为「全高右栏」，与工具栏、筛选条、卡片区域全部并排
         （对齐 Eagle 实测——右栏从窗口顶直通到底，工具栏只延伸到右栏左侧）。
         左列 = TitleBar + (侧栏 + 主内容列)；右列 = PhotoInspector / FolderInspector / 资源库信息 -->
    <div class="flex min-w-0 flex-1 flex-col">
      <TitleBar />

      <div class="flex min-h-0 flex-1 flex-row">
        <!-- 左侧栏（Eagle 式：位于工具栏下方，从顶到底） -->
        <div
          v-show="panelVisible"
          class="h-full shrink-0 overflow-hidden border-r border-line-subtle transition-[width] duration-spring ease-out"
          :style="{ width: 'var(--shell-library-panel-w)' }"
        >
          <LibraryPanel />
        </div>

        <!-- 主内容列：筛选行 + 网格/列表 -->
        <div class="flex min-w-0 flex-1 flex-col">
          <FilterBar v-show="filterBarVisible" ref="filterBarRef" />

          <!-- 主内容区：查重视图 / 地图 / 网格或列表（G9：空白区右键菜单） -->
          <div
            ref="contentScrollRef"
            class="app-scroll flex min-h-0 flex-1 flex-col overflow-auto"
            @contextmenu.prevent="openBlankContextMenu"
          >
            <DuplicateGroupsView
              v-if="filters.isDuplicateView.value"
              :groups="scan.duplicateGroups.value"
              :loading="scan.duplicateLoading.value"
              :threshold="scan.SIMILARITY_THRESHOLD"
              :scan-label="scan.scanLabel.value"
              @remove-others="scan.handleRemoveOthers"
              @preview-photo="preview.openPhoto"
              @open-scan-settings="scan.openDuplicateScan"
            />
            <div v-else-if="filters.isMapView.value" class="min-h-0 flex-1">
              <!-- 地图视图不渲染子文件夹卡片（地理视角无文件夹语义） -->
              <PhotoMapView :photos="allPhotos" :loading="loading" @select-photo="onPreviewById" />
            </div>
            <!-- FreeformCanvas 不渲染子文件夹卡片：自由网格只摆放素材（folderCards 对该布局恒为空） -->
            <FreeformCanvas
              v-else-if="effectiveLayout === 'freeform'"
              :photos="filters.flatDisplayPhotos.value"
              :selected-set="selectedSet"
              @click-select="keyboard.handleClickSelect"
              @preview-photo="onPreviewPhoto"
              @context-menu="openPhotoContextMenu"
            />
            <PhotoListView
              v-else-if="effectiveLayout === 'list'"
              :sections="filters.displaySections.value"
              :selected-set="selectedSet"
              :is-selection-mode="isSelectionMode"
              :loading="loading"
              :mode="filters.isTrashView.value ? 'trash' : 'normal'"
              :has-more="hasMoreForView"
              :nav-active-id="keyboard.navActiveId.value"
              :renaming-id="renamingId"
              :folders="folderCards"
              @select-photo="handleSelectPhoto"
              @preview-photo="onPreviewPhoto"
              @open-photo="onOpenPhotoExternal"
              @restore-photo="actions.handleRestoreIds([$event])"
              @context-menu="openPhotoContextMenu"
              @drag-photos="handleDragPhotos"
              @click-select="keyboard.handleClickSelect"
              @marquee-select="replaceSelection"
              @rename-commit="onRenameCommit"
              @rename-cancel="renamingId = null"
              @load-more="onLoadMore"
            />
            <PhotoGrid
              v-else
              :sections="filters.displaySections.value"
              :selected-set="selectedSet"
              :is-selection-mode="isSelectionMode"
              :loading="loading"
              :layout="effectiveLayout"
              :thumb-size="filters.tab.value.thumbSize"
              :display="filters.viewDisplay.value"
              :mode="filters.isTrashView.value ? 'trash' : 'normal'"
              :has-more="hasMoreForView"
              :nav-active-id="keyboard.navActiveId.value"
              :renaming-id="renamingId"
              :folders="folderCards"
              @load-more="onLoadMore"
              @rename-commit="onRenameCommit"
              @rename-cancel="renamingId = null"
              @import-folder="actions.handleImportFolder()"
              @install-extension="extensionGuideOpen = true"
              @select-photo="handleSelectPhoto"
              @preview-photo="onPreviewPhoto"
              @open-photo="onOpenPhotoExternal"
              @toggle-favorite="actions.handleToggleFavorite"
              @restore-photo="actions.handleRestoreIds([$event])"
              @context-menu="openPhotoContextMenu"
              @drag-photos="handleDragPhotos"
              @add-tag="onAddTag"
              @click-select="keyboard.handleClickSelect"
              @marquee-select="replaceSelection"
            />
          </div>
        </div>
      </div>
    </div>
    <!-- 右侧面板：全高右栏（与工具栏/筛选条/卡片并排；选中=PhotoInspector /
             文件夹视图=FolderInspector / 其余=资源库信息面板） -->
    <PhotoInspector
      v-if="showInspector"
      :photos="data.byIds(selectedIds)"
      :expanded="inspectorExpanded"
      @close="clearSelection"
      @open-folder="openFolderFromInspector"
      @add-to-folder="actions.openFolderModal()"
      @relinked="loadAll"
    />
    <FolderInspector
      v-else-if="filters.activeFolder.value && !previewPhoto"
      :folder="filters.activeFolder.value"
      @changed="loadAll"
      @open-settings="actions.openFolderSettings(filters.activeFolder.value?.id ?? null)"
    />
    <LibraryInfoPanel v-else-if="showLibraryInfo" :photos="filters.flatDisplayPhotos.value" />

    <!-- 图片预览弹窗 -->
    <PhotoPreview
      v-if="previewPhoto"
      :photo="previewPhoto"
      :grayscale="previewGrayscale"
      :brief-mode="briefMode"
      :photos="filters.flatDisplayPhotos.value"
      @close="preview.close"
      @previous="preview.previous"
      @next="preview.next"
      @toggle-favorite="actions.handleToggleFavorite"
      @set-rating="actions.handleSetRating"
      @set-description="actions.handleSetDescription"
      @add-tag="actions.handleAddTag"
      @remove-tag="actions.handleRemoveTag"
      @find-similar="onPreviewFindSimilar"
      @renamed="data.loadPhotos"
      @delete="onPreviewDelete"
    />

    <!-- 标签管理 -->

    <!-- 智能文件夹编辑 -->
    <SmartAlbumModal
      v-if="smartAlbumModalOpen"
      :album="editingSmartAlbum"
      :preset-rules="actions.smartPresetRules.value"
      :available-tags="dictionaryTags"
      @close="smartAlbumModalOpen = false"
      @saved="data.loadSmartAlbums"
    />

    <!-- 文件夹（新建/归组；G10 支持预选父级） -->
    <FolderModal
      v-if="folderModalOpen"
      :photo-ids-to-add="selectedIds"
      :initial-parent="actions.folderModalParentId.value"
      :edit-folder-id="actions.folderSettingsId.value ?? undefined"
      @close="folderModalOpen = false"
      @changed="data.loadFolders"
    />

    <!-- 批量重命名 -->
    <BatchRenameModal
      v-if="batchRenameOpen"
      :photos="data.byIds(selectedIds)"
      @close="batchRenameOpen = false"
      @renamed="data.loadPhotos"
    />

    <!-- 六期：收藏书签 -->
    <BookmarkModal v-if="bookmarkModalOpen" @close="bookmarkModalOpen = false" @saved="loadAll" />

    <!-- F3：格式转换（质量/尺寸自定） -->
    <ConvertModal v-if="convertIds" :ids="convertIds" @close="convertIds = null" />

    <!-- F5：查重扫描设置（模式 × 范围） -->
    <DuplicateScanModal v-if="scan.scanModalOpen.value" @close="scan.scanModalOpen.value = false" />

    <!-- F7：浏览器扩展安装引导 -->
    <ExtensionGuideModal v-if="extensionGuideOpen" @close="extensionGuideOpen = false" />

    <!-- 六期：素材库密码锁设置 -->
    <LockModal
      v-if="lockModalOpen"
      @close="lockModalOpen = false"
      @changed="
        () => {
          lockModalOpen = false
          void actions.refreshLockState()
        }
      "
      @lock="actions.handleQuickLock"
    />

    <!-- 危险操作二次确认 / prompt 输入框已全局化（App.vue） -->
    <UContextMenu />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import UButton from '@components/ui/UButton.vue'
import UContextMenu from '@components/ui/UContextMenu.vue'
import { useContextMenu, type MenuItem } from '@composables/useContextMenu'
import { useToast } from '../../composables/useToast'
import { useRouter } from 'vue-router'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import { useLibraryUI } from '@composables/useLibraryUI'
import FilterBar from '@views/photos/components/FilterBar.vue'
import TitleBar from '@components/shell/TitleBar.vue'
import LibraryPanel from '@views/photos/components/LibraryPanel.vue'
import PhotoGrid from '@views/photos/components/PhotoGrid.vue'
import PhotoListView from '@views/photos/components/PhotoListView.vue'
import PhotoPreview from '@views/photos/components/PhotoPreview.vue'
import PhotoInspector from '@views/photos/components/PhotoInspector.vue'
import FolderInspector from '@views/photos/components/FolderInspector.vue'
import LibraryInfoPanel from '@views/photos/components/LibraryInfoPanel.vue'
import SmartAlbumModal from '@views/photos/components/SmartAlbumModal.vue'
import BookmarkModal from '@views/photos/components/BookmarkModal.vue'
import LockModal from '@views/photos/components/LockModal.vue'
import DuplicateGroupsView from '@views/photos/components/DuplicateGroupsView.vue'
import PhotoMapView from '@views/photos/components/PhotoMapView.vue'
import FolderModal from '@views/photos/components/FolderModal.vue'
import BatchRenameModal from '@views/photos/components/BatchRenameModal.vue'
import ConvertModal from '@views/photos/components/ConvertModal.vue'
import DuplicateScanModal from '@views/photos/components/DuplicateScanModal.vue'
import ExtensionGuideModal from '@views/photos/components/ExtensionGuideModal.vue'
import FreeformCanvas from '@views/photos/components/FreeformCanvas.vue'
import type { Photo } from '../../types/photo'
import { usePhotoData, bindProcessingProgress, bindViewWatcher } from './composables/usePhotoData'
import { usePhotoFilters } from './composables/usePhotoFilters'
import { usePhotoSearch } from './composables/usePhotoSearch'
import { usePhotoActions } from './composables/usePhotoActions'
import { useAiBatch } from './composables/useAiBatch'
import { useDuplicateScan } from './composables/useDuplicateScan'
import { usePreview } from './composables/usePreview'
import { usePhotoKeyboard } from './composables/usePhotoKeyboard'
import { useDialogs } from './composables/useDialogs'
import { usePhotoImport } from './composables/usePhotoImport'
import { usePhotoClipboard } from './composables/usePhotoClipboard'
import { usePhotoSelection } from './composables/usePhotoSelection'
import { useDeepLink } from './composables/useDeepLink'
import { buildItemLink, type DeepLinkTarget } from '@shared/deepLink'
import { isTextFile } from '@shared/assetTypes'
import { hasAiWorthyText } from '@shared/ocrText'
// 引擎清单与主进程同一份（纯模块，两侧不跑偏）；跨层相对路径，保持 main/utils 为唯一出处
import { REVERSE_SEARCH_ENGINES } from '../../../../main/utils/reverseSearch'
import { MODE_LABEL, useWallpaper } from './composables/useWallpaper'
import type { WallpaperMode } from '@shared/wallpaper'

const router = useRouter()
const tabs = useLibraryTabs()
const { panelVisible, filterBarVisible } = useLibraryUI()
const photoImport = usePhotoImport()
const clipboard = usePhotoClipboard()
const wallpaper = useWallpaper()
const importDragActive = photoImport.dragActive

// ── 数据与逻辑层（模块单例 composables）──
const data = usePhotoData()
const filters = usePhotoFilters()
const search = usePhotoSearch()
const scan = useDuplicateScan()
const actions = usePhotoActions()
const aiBatch = useAiBatch()
// M3 视觉打标：视觉模型是否已配置（设置 › AI 助手 › 视觉打标）。
// 挂载时拉一次；设置页与本视图分属两个路由，返回时重挂载会重新拉。
const visionReady = ref(false)
const preview = usePreview()
const keyboard = usePhotoKeyboard()
const { pendingConfirm } = useDialogs()

// ── 模板需要的解构（保持模板与旧版相近）──
const { loading, allPhotos, dictionaryTags } = data
const { previewPhoto } = preview
const {
  locked,
  unlockPassword,
  smartAlbumModalOpen,
  folderModalOpen,
  batchRenameOpen,
  bookmarkModalOpen,
  lockModalOpen,
  editingSmartAlbum
} = actions
const { pendingPrompt, requestPrompt } = useDialogs()

// ── 选择状态（模块单例：FilterBar chip / TitleBar 菜单共享）──
const { selectedIds, isSelectionMode, clearSelection, handleSelectPhoto, selectAll } =
  usePhotoSelection()
const filterBarRef = ref<InstanceType<typeof FilterBar> | null>(null)

// ── D-012 自适应布局 + 显示开关 ──
const contentScrollRef = ref<HTMLElement | null>(null)
/** 实际生效布局：文件夹覆盖优先于全局；'auto' 即 Eagle「自适应」justified 布局 */
const effectiveLayout = computed(() => filters.viewLayout.value)
const showInspector = computed(
  () => filters.viewDisplay.value.showInspector && selectedIds.value.length > 0
)
/** 四轮 G13：Eagle 检查器区域常驻——无选中且非文件夹/地图/查重视图时显示资源库信息 */
const showLibraryInfo = computed(
  () =>
    filters.viewDisplay.value.showInspector &&
    !filters.activeFolder.value &&
    !filters.isMapView.value &&
    !filters.isDuplicateView.value
)
/**
 * 特性（Eagle 标志性交互）：网格顶部的子文件夹卡片。
 * 仅在文件夹视图 + 「显示子文件夹内容」关闭（拍平语义下卡片隐藏）时给数；
 * FreeformCanvas 与地图视图不渲染卡片（各自分支不消费该 prop，见下方模板注释）。
 */
const folderCards = computed(() =>
  filters.activeFolderId.value &&
  !filters.viewDisplay.value.includeSubfolders &&
  effectiveLayout.value !== 'freeform'
    ? data.childFolders.value
    : []
)
/** 代码审查 P0-10：选中集 Set 化，网格/列表卡片 O(1) 判定 */
const selectedSet = computed(() => new Set(selectedIds.value))

// ── 拖拽载荷 ──

function handleDragPhotos({ photo, e }: { photo: Photo; e: DragEvent }): void {
  const ids = selectedIds.value.includes(photo.id) ? [...selectedIds.value] : [photo.id]
  e.dataTransfer?.setData('application/x-leaf-photos', JSON.stringify(ids))
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'copyMove'
    // §2.D 拖出到外部：提供 file:// URI 列表，可直接落入 Finder/资源管理器
    const photos = data.byIds(ids)
    const uris = photos.map((p) => `file://${p.filePath.replace(/\\/g, '/')}`).join('\r\n')
    if (uris) e.dataTransfer.setData('text/uri-list', uris)
  }
}

// ── 卡片右键菜单 ──

const menu = useContextMenu()
const toast = useToast()

/** D-012 就地重命名：当前正在重命名的素材 id（F2 / 右键触发） */
const renamingId = ref<string | null>(null)
/** F3：转换参数弹窗（右键「转换为…」→ 质量/尺寸自定） */
const convertIds = ref<string[] | null>(null)
/** F7：浏览器扩展安装引导 */
const extensionGuideOpen = ref(false)
/** R5 黑白预览：右键/⌘G 切换，预览弹窗按此应用灰度滤镜 */
const previewGrayscale = ref(false)
function toggleGrayscale(): void {
  previewGrayscale.value = !previewGrayscale.value
  useToast().info(previewGrayscale.value ? '黑白预览已开启' : '黑白预览已关闭')
}
/** 十八轮 P3：简报模式（Eagle F5）——预览弹窗隐藏全部 UI，纯图片全屏+自动幻灯片 */
const briefMode = ref(false)
/** R5 高级模式（F8 / Eagle 检查器展开）：检查器信息全展开态（右栏宽度固定，不随之变宽） */
const inspectorExpanded = ref(false)

/**
 * 就地重命名入口（右键 / F2 / ⌘R）。
 * 自由网格画布只画缩略图、没有名称行，就地输入框无处安放——该布局退回提示框，
 * 否则 renamingId 无人消费，菜单项点了毫无反应（审查二轮，P1-11 的残留面）。
 */
function beginInlineRename(photo: Photo): void {
  if (effectiveLayout.value === 'freeform') {
    requestPrompt({
      title: '重命名',
      label: '文件名',
      initialValue: photo.fileName,
      confirmLabel: '保存',
      onSubmit: async (name) => {
        await onRenameCommit(photo, name)
      }
    })
    return
  }
  renamingId.value = photo.id
}

async function onRenameCommit(photo: Photo, newName: string): Promise<void> {
  renamingId.value = null
  const trimmed = newName.trim()
  if (!trimmed || trimmed === photo.fileName) return
  const result = await window.api.photos.renamePhotos([{ id: photo.id, name: trimmed }])
  if (result.renamed.length > 0) {
    toast.success('已重命名', { description: result.renamed[0].fileName })
  } else if (result.conflicts.length > 0) {
    toast.error('重命名失败', { description: `「${result.conflicts[0].fileName}」已存在同名文件` })
  }
}

/** G9：网格空白区右键菜单（对齐 Eagle 实测：新建/粘贴/全选/重新加载/文件夹设置） */
function openBlankContextMenu(e: MouseEvent): void {
  if (filters.isMapView.value || filters.isDuplicateView.value) return
  // 命中卡片（卡片自身菜单已开）或就地重命名输入框时跳过
  const target = e.target as HTMLElement | null
  if (target?.closest('[data-photo-id], .photo-item, [data-rename-input]')) return
  const items: MenuItem[] = [
    { key: 'new-folder', label: '新建文件夹', icon: 'context-menu/ic-folder-new-folder' },
    { key: 'new-smart', label: '新增智能文件夹', icon: 'ic_smart-folder' },
    { key: 'd1', divider: true },
    { key: 'paste', label: '粘贴 ⌘V', icon: 'context-menu/ic-file-copy' },
    { key: 'd2', divider: true },
    { key: 'select-all', label: '全选 ⌘A', icon: 'batch-save-select-all' },
    { key: 'd3', divider: true },
    // ⌘R 已绑定「重命名」（对齐 Eagle），这里去掉 ⌘R 标注避免同一组合键两个语义
    { key: 'reload', label: '重新加载', icon: 'ic_refresh' }
  ]
  if (filters.activeFolder.value) {
    items.push(
      { key: 'd4', divider: true },
      {
        key: 'folder-settings',
        label: '打开文件夹设置…',
        icon: 'ic_cog'
      }
    )
  }
  menu.open(e.clientX, e.clientY, items, (key) => {
    if (key === 'new-folder') void actions.createFolderInline()
    else if (key === 'new-smart') actions.openSmartAlbumModal(null)
    else if (key === 'paste') {
      // F1：有内部剪切态时 ⌘V = 粘贴移动，否则为文件导入
      if (clipboard.cutPhotoIds.value.length > 0) void clipboard.pasteMove()
      else void photoImport.pasteFromClipboard()
    } else if (key === 'select-all') selectAll(filters.flatDisplayPhotos.value.map((p) => p.id))
    else if (key === 'reload') void loadAll()
    else if (key === 'folder-settings')
      actions.openFolderSettings(filters.activeFolder.value?.id ?? null)
  })
}

/** 分页化阶段 2：当前视图对应的分页目标（回收站/搜索/收藏/文件夹/主视图） */
function pagedViewTarget(): 'trash' | 'search' | 'favorites' | 'folder' | 'main' {
  if (filters.isTrashView.value) return 'trash'
  if (filters.isSearchMode.value && data.usePagedSearch()) return 'search'
  if (filters.tab.value.view === 'favorites' && data.usePagedFavorites()) return 'favorites'
  if (
    filters.activeFolderId.value &&
    data.usePagedFolder()
    // 「显示子文件夹内容」开启时文件夹池改为拍平取数（folderIds 下推），
    // 翻页目标仍是同一文件夹池，不再排除（排除会把 load-more 错挂到主池）
  ) {
    return 'folder'
  }
  return 'main'
}
const hasMoreForView = computed(() => {
  // 固定入口视图（未加标签/未分类/最近添加/最近查看）由独立池渲染（审查 P3-35）：
  // 旧实现 hasMore 落到主池，滚动到底反复加载永不显示的页，纯浪费 IPC/CPU
  const view = filters.tab.value.view
  if (!filters.isTrashView.value && ['untagged', 'unsorted', 'recent', 'recents'].includes(view)) {
    return false
  }
  const t = pagedViewTarget()
  if (t === 'trash') return data.trashHasMore.value
  if (t === 'search') return data.searchHasMore.value
  if (t === 'favorites') return data.favoritesHasMore.value
  if (t === 'folder') return data.folderHasMore.value
  return data.mainHasMore.value
})
function onLoadMore(): void {
  const t = pagedViewTarget()
  if (t === 'trash') return data.loadMoreTrash()
  if (t === 'search') return data.loadMoreSearch()
  if (t === 'favorites') return data.loadMoreFavorites()
  if (t === 'folder') return data.loadMoreFolder()
  data.loadMoreMain()
}

/**
 * M3 视觉链入口门禁（D-017 教训的看图版）：位图素材只有「视觉模型已配置」才出现
 * AI 入口——未配置就维持不出现，模型看不到图还摆按钮就是在诱导瞎猜。
 * 有文字信号的素材（正文/OCR/纯文本）不受影响，仍走文本链；判定口径与
 * PhotoPreview 的 hasTextSignal 一致，主进程 suggestVisionMeta 里还有第二道闸。
 */
function aiEntryVisible(ids: string[]): boolean {
  const photos = byIds(ids)
  if (!photos.some((p) => p.kind === 'image') || visionReady.value) return true
  return photos.some(
    (p) =>
      p.kind === 'text' ||
      isTextFile(p.fileName) ||
      hasAiWorthyText(p.docText) ||
      hasAiWorthyText(p.ocrText)
  )
}

function openPhotoContextMenu({ photo, x, y }: { photo: Photo; x: number; y: number }): void {
  if (filters.isMapView.value) return
  const inTrash = filters.isTrashView.value
  // R1（Eagle 行为）：右键未选中的卡片会先选中它（检查器同步刷新）；
  // 右键已选中的卡片保持现有多选
  if (!selectedIds.value.includes(photo.id)) {
    replaceSelection([photo.id])
  }
  // 右键未选中的卡片：以该卡为唯一操作对象；选中的多卡：批量语义
  const ids = selectedIds.value.includes(photo.id) ? [...selectedIds.value] : [photo.id]

  if (inTrash) {
    // 批量恢复语义写进行标签（5 千条回收站里右键多选时看得清作用范围）；
    // 文件已丢失的素材「在访达中打开」必然失败 → 有断链标记即禁用；
    // 清空回收站复用侧栏同款确认弹窗（彻底删除必须有确认）
    const trashed = byIds(ids)
    menu.open(
      x,
      y,
      [
        {
          key: 'restore',
          label: ids.length > 1 ? `恢复（${ids.length} 条）` : '恢复',
          icon: 'ic_refresh'
        },
        { key: 'd1', divider: true },
        {
          key: 'reveal',
          label: '在访达中打开',
          icon: 'context-menu/ic-open-finder',
          disabled: trashed.some((p) => p.missingAt != null)
        },
        { key: 'd2', divider: true },
        {
          key: 'clear',
          label: '清空回收站…',
          icon: 'context-menu/ic-trash-empty',
          danger: true
        }
      ],
      (key) => {
        if (key === 'restore') actions.handleRestoreIds(ids)
        else if (key === 'reveal') actions.revealInFolder(byIds(ids))
        else if (key === 'clear') actions.handleClearRecycleBin()
      }
    )
    return
  }

  // 十五轮：菜单结构对齐 Eagle 4.0 卡片右键实拍（在新窗口打开/默认应用/访达｜插件｜
  // 上次文件夹/文件夹/其它资源库/导出｜分享｜重命名/复制…｜创建副本/以图搜图/黑白预览｜…更多平铺｜回收站）；
  // 十八轮 P3 全部补齐：在其它应用打开…、缩略图背景（平铺 4 项）、简报模式 F5、
  // 打开文件所在的位置（第三方文件管理器动态列出）、复制…（来源 URL/注释）；
  // …更多▸（置顶/封面/壁纸/收藏/评分/移出）收敛为平铺区（UContextMenu 无层级）；
  const isSingle = ids.length === 1
  // kind 感知菜单：图片专属项只在「所选全部是位图」时出现——Markdown/文本/视频
  // 等类型不需要看到反向图搜/设为壁纸/转换为/黑白预览这些图片动作（Eagle 同款按
  // 素材类型裁剪菜单；多选混合类型时按更保守口径整段隐藏）
  const allImages = byIds(ids).length > 0 && byIds(ids).every((p) => p.kind === 'image')
  const lastFolderId = (() => {
    try {
      return localStorage.getItem('leaf.last-used-folder')
    } catch {
      return null
    }
  })()
  const items: MenuItem[] = [
    { key: 'open', label: '打开预览', icon: 'context-menu/ic-open-eagle' },
    { key: 'new-window', label: '在新窗口打开', icon: 'context-menu/ic-open-new-window' },
    {
      key: 'open-default',
      label: '在默认应用打开',
      icon: 'context-menu/ic-open-default',
      disabled: !isSingle
    },
    // 十八轮 P3：在其它应用打开（Eagle 在其它应用打开▸；弹出应用选择器）
    {
      key: 'open-with',
      label: '在其它应用打开…',
      icon: 'context-menu/ic-open-other',
      disabled: !isSingle
    },
    { key: 'reveal', label: '在访达中打开', icon: 'context-menu/ic-open-finder' },
    // 十八轮 P3：打开文件所在的位置▸——动态列出已安装的第三方文件管理器
    ...fileManagers.value.map((fm) => ({
      key: `reveal-app:${fm.name}`,
      label: `在${fm.name}中打开`,
      icon: 'context-menu/ic-open-finder',
      disabled: !isSingle
    })),
    { key: 'd1', divider: true },
    { key: 'plugins', label: '插件…', icon: 'ic-toolbar-plugin' },
    { key: 'd2', divider: true },
    {
      key: 'add-last-folder',
      label: '添加至上次使用的文件夹…',
      icon: 'context-menu/ic-folder-add-to',
      disabled: !lastFolderId
    },
    { key: 'add-folder', label: '添加至文件夹…', icon: 'context-menu/ic-folder-add-to' },
    {
      key: 'new-folder-with',
      label: ids.length > 1 ? `用所选项目新建文件夹（${ids.length} 项）` : '用所选项目新建文件夹',
      icon: 'context-menu/ic-folder-new-with-selection'
    },
    { key: 'move-lib', label: '添加至其它资源库…', icon: 'context-menu/ic-library-add-to' },
    { key: 'export', label: '导出…', icon: 'context-menu/ic-export' },
    { key: 'export-csv', label: '导出 CSV…', icon: 'context-menu/ic-export-csv' },
    ...(ids.length >= 2
      ? [
          {
            key: 'collage',
            label: `创建拼图（${ids.length} 张）`,
            icon: 'context-menu/ic-file-combine',
            disabled: !byIds(ids).every((p) => p.kind === 'image')
          } as MenuItem
        ]
      : []),
    // F3（Eagle 格式转换器）：转换为子菜单（图片专属——格式转换只对位图有意义）
    ...(allImages
      ? [
          {
            key: 'convert',
            label: '转换为…',
            icon: 'context-menu/ic-export',
            children: [
              { key: 'webp', label: 'WebP（质量 82）' },
              { key: 'png', label: 'PNG' },
              { key: 'jpg', label: 'JPG' },
              { key: 'avif', label: 'AVIF' },
              { key: 'custom', label: '质量 / 尺寸自定…' }
            ]
          } as MenuItem
        ]
      : []),
    { key: 'd3', divider: true },
    { key: 'share', label: '分享', icon: 'ic_earth' },
    { key: 'd4', divider: true },
    {
      key: 'batch-rename',
      label: ids.length > 1 ? `批量重命名（${ids.length} 项）…` : '批量重命名…',
      icon: 'context-menu/ic-rename'
    },
    ...(aiEntryVisible(ids)
      ? [
          {
            key: 'ai-batch-meta',
            label: `AI 摘要与标签（${ids.length} 项）…`,
            icon: 'context-menu/ic-ai'
          } as MenuItem
        ]
      : []),
    { key: 'rename', label: '重命名 ⌘R', icon: 'context-menu/ic-rename', disabled: !isSingle },
    // F1（Eagle）：剪切 → 目标文件夹 ⌘V 粘贴移动
    { key: 'cut', label: '剪切 ⌘X', icon: 'context-menu/ic-file-copy' },
    // 复制…▸（Eagle 4 子菜单形态；原 10 项平铺收敛）
    {
      key: 'copy-more',
      label: '复制…',
      icon: 'context-menu/ic-file-copy',
      children: [
        { key: 'copy', label: '复制文件 ⌘C' },
        { key: 'copy-path', label: '复制文件路径 ⌥⌘C' },
        { key: 'copy-link', label: '复制素材链接' },
        { key: 'copy-title', label: '复制标题', disabled: !isSingle },
        {
          key: 'copy-tags',
          label: '复制标签',
          disabled: !isSingle || photo.tags.length === 0
        },
        { key: 'copy-url', label: '复制来源 URL', disabled: !isSingle || !photo.sourceUrl },
        { key: 'copy-desc', label: '复制注释', disabled: !isSingle || !photo.description },
        { key: 'copy-folder-path', label: '复制文件夹路径', disabled: !isSingle },
        { key: 'copy-thumb', label: '复制缩略图', disabled: !isSingle },
        ...(allImages
          ? [{ key: 'copy-base64', label: '复制 Base64', disabled: !isSingle }]
          : [])
      ]
    },
    { key: 'paste-tags', label: '粘贴标签 ⌘V', icon: 'context-menu/ic-tag-paste' },
    { key: 'd5', divider: true },
    { key: 'duplicate', label: '创建副本 ⌘D', icon: 'context-menu/ic-clone', disabled: !isSingle },
    { key: 'replace-file', label: '替换文件…', icon: 'ic_refresh', disabled: !isSingle },
    // F11：断链素材重新定位
    ...(photo.missingAt
      ? [
          {
            key: 'relink-file',
            label: '重新定位文件…',
            icon: 'ic_refresh',
            disabled: !isSingle
          } as MenuItem
        ]
      : []),
    // 视频/GIF：重新抓取封面帧（Eagle 设当前画面为封面/刷新缩略图的落地版）
    ...(photo.kind === 'video' || photo.fileName.toLowerCase().endsWith('.gif')
      ? [
          {
            key: 'reextract-cover',
            label: '重新抓取封面',
            icon: 'context-menu/ic-video-update-thumbnail',
            disabled: !isSingle
          },
          {
            key: 'copy-frame',
            label: '拷贝当前画面',
            icon: 'context-menu/ic-file-copy',
            disabled: !isSingle
          },
          {
            key: 'save-frame',
            label: '保存当前画面',
            icon: 'context-menu/ic-export',
            disabled: !isSingle
          } as MenuItem
        ]
      : []),
    { key: 'refresh-thumb', label: '刷新缩略图', icon: 'context-menu/ic-video-update-thumbnail' },
    // 以下四项均为图片专属（颜色分析/pHash 以图搜图/反向图搜/黑白预览），非位图整段隐藏
    ...(allImages
      ? [
          { key: 'reanalyze-color', label: '重新分析颜色', icon: 'context-menu/ic-filter-item-color' },
          { key: 'similar', label: '以图搜图', icon: 'context-menu/ic-search-by-image' },
          // 反向图搜▸（Eagle find > reverse）：引擎只认 URL/上传，本地位图先进剪贴板再开页粘贴；
          // 多选禁用（一次只贴一张）
          {
            key: 'reverse-search',
            label: '反向图搜',
            icon: 'context-menu/ic-reverse-search',
            disabled: ids.length > 1,
            children: REVERSE_SEARCH_ENGINES.map((e) => ({ key: e.id, label: e.name }))
          },
          { key: 'gray-preview', label: '黑白预览', icon: 'context-menu/ic-grayscale' }
        ]
      : []),
    // 缩略图背景▸（Eagle 子菜单形态；棋盘底只作用于位图缩略图）
    ...(allImages
      ? [
          { key: 'd-thumbbg', divider: true },
          {
            key: 'thumbbg',
            label: '缩略图背景…',
            icon: 'context-menu/ic-file-transparent-grid',
            children: [
              {
                key: 'auto',
                label: '自动',
                checked: tabs.active.display.thumbBackground === 'auto'
              },
              {
                key: 'white',
                label: '白色',
                checked: tabs.active.display.thumbBackground === 'white'
              },
              {
                key: 'dark',
                label: '深色棋盘',
                checked: tabs.active.display.thumbBackground === 'dark'
              },
              {
                key: 'transparent',
                label: '透明',
                checked: tabs.active.display.thumbBackground === 'transparent'
              }
            ]
          }
        ]
      : []),
    {
      key: 'brief',
      label: '进入简报模式 F5',
      icon: 'player/ic-toolbar-play',
      disabled: !isSingle
    },
    {
      key: 'advanced',
      label: '进入高级模式 F8',
      icon: 'player/ic-toolbar-fullscreen',
      disabled: !isSingle
    },
    { key: 'd6', divider: true },
    { key: 'pin', label: photo.pinnedAt ? '取消置顶' : '置顶', icon: 'ic-toolbar-pin' },
    {
      key: 'set-cover',
      label: '设为文件夹封面',
      icon: 'context-menu/ic-folder-set-cover',
      disabled: !isSingle || !filters.activeFolder.value
    },
    ...(allImages
      ? [
          {
            key: 'set-wallpaper',
            label: '设为壁纸',
            icon: 'ic_texture',
            disabled: ids.length > 1,
            // 父项与首子项都是自动适配（父项在子菜单展开时不易点，故子菜单里也给出）
            children: (['auto', 'cover', 'blurred', 'original'] as WallpaperMode[]).map((key) => ({
              key,
              label: key === 'auto' ? `${MODE_LABEL.auto}（按屏判定）` : MODE_LABEL[key]
            }))
          } as MenuItem
        ]
      : []),
    {
      key: 'favorite',
      label: photo.isFavorite ? '取消收藏' : '收藏',
      icon: photo.isFavorite ? 'context-menu/ic-favorite-remove' : 'ic_star'
    },
    // Eagle 形态：评分 = 单行 5 颗星（点第 N 颗设 N 星），不再是 5 行堆叠的 ★ 文本行
    {
      key: 'rate-row',
      label: '评分',
      stars: byIds(ids).every((p) => p.rating === byIds(ids)[0].rating)
        ? byIds(ids)[0].rating
        : 0
    },
    { key: 'rate-0', label: '清除评分', disabled: byIds(ids).every((p) => p.rating === 0) }
  ]
  // 文件夹上下文：移出操作
  if (filters.activeFolder.value) {
    items.push({
      key: 'remove-from-folder',
      label: `移出「${filters.activeFolder.value.name}」`,
      icon: 'ic-modal-close'
    })
  }
  items.push({ key: 'd7', divider: true })
  items.push({
    key: 'delete',
    label: '丢到回收站 ⌘⌫',
    icon: 'context-menu/ic-file-move-trash',
    danger: true
  })

  menu.open(
    x,
    y,
    items,
    (rawKey) => {
      // 统一错误兜底（审查 P3-36）：菜单动作里的裸 await 任一 reject
      // 曾成为无提示的 unhandled rejection
      void (async () => {
        try {
          await handleMenuAction(rawKey, ids, photo)
        } catch (err) {
          useToast().error('操作失败', { description: (err as Error).message })
        }
      })()
    },
    { searchable: true }
  )
}

/** 右键菜单动作派发（供带兜底的 wrapper 调用） */
async function handleMenuAction(rawKey: string, ids: string[], photo: Photo): Promise<void> {
  {
    // 子菜单派发：UContextMenu 以 sub:<parent>:<child> 回传，归一成既有 key
    let key = rawKey
    if (key.startsWith('sub:copy-more:')) key = key.slice('sub:copy-more:'.length)
    if (key.startsWith('sub:thumbbg:')) key = `thumbbg-${key.slice('sub:thumbbg:'.length)}`
    if (key.startsWith('sub:set-wallpaper:'))
      key = `wallpaper-${key.slice('sub:set-wallpaper:'.length)}`
    if (key === 'new-window') {
      // 十五轮 D18：新窗口打开当前视图（boot-view 参数驱动；引导窗口不回写持久化）
      void window.api.createNewWindow(`/photos?boot-view=${encodeURIComponent(tabs.activeView)}`)
    } else if (key === 'plugins') {
      // 十五轮 D20：打开插件管理面板（TitleBar 挂载，事件转发）
      window.dispatchEvent(new CustomEvent('leaf:open-plugins'))
    } else if (key === 'add-last-folder') {
      const fid = localStorage.getItem('leaf.last-used-folder')
      if (fid) {
        actions.addToFolder(fid, ids)
        useToast().success(`已添加 ${ids.length} 项至文件夹`)
      }
    } else if (key === 'share') {
      // 阶段 5：原生分享面板（NSSharingServicePicker addon）；不可用回退复制降级
      const paths = byIds(ids).map((p) => p.filePath)
      const opened = await window.api.system.shareFiles(paths)
      if (opened) {
        useToast().success('分享面板已打开')
      } else {
        const ok = await window.api.photos.copyToClipboard(paths)
        if (ok) useToast().success('已复制文件', { description: '可在 Finder / 聊天应用粘贴分享' })
        else useToast().error('分享失败', { description: '文件不存在或已被移动' })
      }
    } else if (key === 'open') {
      onPreviewPhoto(photo)
    } else if (key === 'favorite') {
      for (const id of ids) void actions.handleToggleFavorite(id)
    } else if (key.startsWith('rate-')) {
      const rating = Number(key.slice(5))
      for (const id of ids) void actions.handleSetRating(id, rating)
    } else if (key === 'rename') {
      beginInlineRename(photo)
    } else if (key === 'open-default') {
      const ok = await window.api.photos.openWithDefault(photo.filePath)
      if (!ok) useToast().error('打开失败', { description: '文件不存在或已被移动' })
    } else if (key === 'open-with') {
      // 十八轮 P3：在其它应用打开——弹出应用选择器，选定后用该应用打开文件
      const appPath = await window.api.system.pickApp()
      if (appPath) {
        const ok = await window.api.system.openWith(photo.filePath, appPath)
        if (!ok) useToast().error('打开失败', { description: '无法用所选应用打开文件' })
      }
    } else if (key === 'pin') {
      const target = !photo.pinnedAt
      for (const id of ids) {
        const updated = await window.api.photos.setPinned(id, target)
        if (updated) data.replacePhotoLocal(updated)
      }
    } else if (key === 'set-cover') {
      if (filters.activeFolder.value) {
        await window.api.photos.setFolderCover(filters.activeFolder.value.id, photo.id)
        await data.loadFolders()
        useToast().success('已设为文件夹封面', { description: photo.fileName })
      }
    } else if (key === 'copy-path') {
      await window.api.photos.copyText(
        byIds(ids)
          .map((p) => p.filePath)
          .join('\n')
      )
      useToast().success('已复制文件路径')
    } else if (key === 'copy-link') {
      // 深链 leaf://item/<id>（Eagle「复制 Eagle 链接」口径；检查器同款，形状在 @shared/deepLink）
      await window.api.photos.copyText(
        byIds(ids)
          .map((p) => buildItemLink(p.id))
          .join('\n')
      )
      useToast().success('已复制素材链接')
    } else if (key === 'copy-title') {
      const base = photo.fileName.replace(/\.[^.]+$/, '')
      await window.api.photos.copyText(base)
      useToast().success('已复制标题', { description: base })
    } else if (key === 'copy-tags') {
      await window.api.photos.copyText(photo.tags.join(', '))
      useToast().success('已复制标签', { description: photo.tags.join(', ') })
    } else if (key === 'copy-url') {
      // 十八轮 P3：复制来源 URL
      if (photo.sourceUrl) {
        await window.api.photos.copyText(photo.sourceUrl)
        useToast().success('已复制来源 URL', { description: photo.sourceUrl })
      }
    } else if (key === 'copy-desc') {
      // 十八轮 P3：复制注释
      if (photo.description) {
        await window.api.photos.copyText(photo.description)
        useToast().success('已复制注释')
      }
    } else if (key === 'paste-tags') {
      const raw = await window.api.photos.getClipboardText()
      const tags = raw
        .split(/[\s,，、]+/)
        .map((t) => t.trim())
        .filter(Boolean)
      if (tags.length === 0) {
        useToast().warning('剪贴板中没有可用的标签', {
          description: '请先复制标签或输入标签文本'
        })
        return
      }
      for (const tag of tags) await actions.addTagToMany(ids, tag)
      useToast().success(`已粘贴 ${tags.length} 个标签`)
    } else if (key === 'duplicate') {
      const created = await window.api.photos.duplicate(photo.id)
      await loadAll()
      useToast().success('已创建副本', {
        description: created.fileName,
        action: {
          label: '在访达中打开',
          onClick: () => actions.revealInFolder([created])
        }
      })
    } else if (key === 'replace-file') {
      const result = await window.api.photos.replaceFile(photo.id)
      if (result.ok) {
        await loadAll()
        useToast().success('已替换文件', {
          description: '标签、评分和分类已保留，正在重建缩略图'
        })
      } else if (result.error !== '已取消') {
        useToast().error('替换失败', { description: result.error })
      }
    } else if (key === 'relink-file') {
      // F11：断链重新定位（主进程弹对话框选新文件换绑，元数据保留）
      try {
        const res = await window.api.storage.relinkPhoto(photo.id)
        if (res.ok) {
          await loadAll()
          useToast().success('已重新定位', {
            description: (res.photo as { filePath?: string } | undefined)?.filePath
          })
        } else if (res.error !== '已取消') {
          useToast().error('重新定位失败', { description: res.error })
        }
      } catch (error) {
        useToast().error('重新定位失败', { description: (error as Error).message })
      }
    } else if (key === 'gray-preview') {
      toggleGrayscale()
    } else if (key.startsWith('thumbbg-')) {
      // 十八轮 P3：缩略图背景切换
      const mode = key.slice(8) as 'auto' | 'white' | 'dark' | 'transparent'
      tabs.active.display.thumbBackground = mode
      const label = { auto: '自动', white: '白色', dark: '深色棋盘', transparent: '透明' }[mode]
      useToast().info(`缩略图背景：${label}`)
    } else if (key === 'cut') {
      clipboard.cutSelection(ids)
    } else if (key.startsWith('sub:convert:')) {
      // F3：转换为（默认参数直转；自定参数走弹窗）
      const child = key.slice('sub:convert:'.length)
      if (child === 'custom') convertIds.value = ids
      else void actions.convertTo(ids, child as 'webp' | 'png' | 'jpg' | 'avif')
    } else if (key === 'copy-folder-path') {
      // ④-3：复制所在文件夹路径。D-020 之后 file_path 是库内公共桶（images/2609），
      // 复制出去没有导航意义；知道原件出处就给出处，丢了桶这把钥匙也少给一把。
      const p = byIds(ids)[0]
      if (p) {
        const from = p.sourcePath || p.filePath
        const dir = from.slice(0, Math.max(from.lastIndexOf('/'), from.lastIndexOf('\\')))
        const ok = await window.api.photos.copyText(dir)
        if (ok) useToast().success('已复制文件夹路径', { description: dir })
      }
    } else if (key === 'copy-thumb') {
      const ok = await window.api.photos.copyThumbToClipboard(photo.id)
      if (ok) useToast().success('已复制缩略图', { description: '可在聊天/文档应用直接粘贴' })
      else useToast().error('复制失败', { description: '缩略图尚未生成或不可读' })
    } else if (key === 'copy-base64') {
      const r = await window.api.photos.copyBase64(photo.id)
      if (r.ok) useToast().success('已复制 Base64', { description: '原文件编码，5MB 以内' })
      else useToast().error('复制失败', { description: r.error })
    } else if (key === 'copy') {
      const paths = byIds(ids).map((p) => p.filePath)
      const ok = await window.api.photos.copyToClipboard(paths)
      if (ok)
        useToast().success(`已复制 ${paths.length} 个文件`, { description: '可在 Finder 粘贴' })
      else useToast().error('复制失败', { description: '文件不存在或已被移动' })
    } else if (key === 'move-lib') {
      requestPrompt({
        title: `移动 ${ids.length} 项到资源库`,
        label: '目标资源库名称',
        initialValue: '',
        confirmLabel: '移动',
        onSubmit: async (name) => {
          const res = await window.api.libraries.list()
          const target = res.libraries.find((l) => !l.active && l.name === name.trim())
          if (!target) {
            useToast().error('未找到该资源库', { description: name })
            return
          }
          const result = await window.api.libraries.moveTo(target.id, ids)
          useToast().success('移动完成', {
            description: `已移动 ${result.moved} 项；目标库已有重复跳过 ${result.skipped} 项`,
            action: {
              label: `前往「${target.name}」`,
              onClick: () => void window.api.libraries.switchTo(target.id)
            }
          })
          clearSelection()
          await loadAll()
        }
      })
    } else if (key === 'set-wallpaper' || key.startsWith('wallpaper-')) {
      // 父项走 auto（主进程按屏判定），子项强制某种策略
      const mode = key === 'set-wallpaper' ? 'auto' : key.slice('wallpaper-'.length)
      await wallpaper.set(photo, mode as WallpaperMode)
    } else if (key === 'add-folder') {
      actions.openFolderModal()
    } else if (key === 'export') {
      void actions.exportSelected(ids)
    } else if (key === 'export-csv') {
      void actions.exportCsv(ids)
    } else if (key === 'advanced') {
      inspectorExpanded.value = !inspectorExpanded.value
    } else if (key === 'refresh-thumb') {
      const r = await window.api.photos.reanalyzeAssets(ids, { thumbs: true, palette: false })
      if (r.ok > 0) {
        await loadAll()
        useToast().success(`已刷新 ${r.ok} 张缩略图`)
      } else useToast().error('刷新失败', { description: '没有可处理的图片/视频' })
    } else if (key === 'reanalyze-color') {
      const r = await window.api.photos.reanalyzeAssets(ids, { thumbs: false, palette: true })
      if (r.ok > 0) {
        await loadAll()
        useToast().success(`已重新分析 ${r.ok} 项的主色`)
      } else useToast().error('分析失败', { description: '没有可处理的图片/视频' })
    } else if (key === 'batch-rename') {
      // 批量重命名弹窗基于当前选中集（BatchRenameModal 消费 selection）
      batchRenameOpen.value = true
    } else if (key === 'ai-batch-meta') {
      // M3：位图走视觉链（每条带一次缩略图请求），其余素材并到文本链，两段串行、
      // 用量合并报；视觉未配置时维持文本链现状（位图会被「无文字信号」跳过）。
      const bitmapIds = byIds(ids)
        .filter((p) => p.kind === 'image')
        .map((p) => p.id)
      if (bitmapIds.length && visionReady.value) {
        aiBatch.runVision(
          bitmapIds,
          ids.filter((id) => !bitmapIds.includes(id))
        )
      } else {
        aiBatch.run(ids)
      }
    } else if (key === 'new-folder-with') {
      requestPrompt({
        title: ids.length > 1 ? `用所选项目新建文件夹（${ids.length} 项）` : '用所选项目新建文件夹',
        label: '文件夹名称',
        initialValue: '',
        confirmLabel: '创建',
        onSubmit: async (name) => {
          const folder = await window.api.photos.createPhotoFolder(name.trim(), null)
          await data.loadFolders()
          actions.addToFolder(folder.id, ids)
          useToast().success('文件夹已创建', {
            description: `已将 ${ids.length} 项添加至「${name.trim()}」`
          })
        }
      })
    } else if (key === 'reextract-cover') {
      const r = await window.api.photos.reextractVideoCover(ids)
      if (r.ok > 0) {
        await loadAll()
        useToast().success(`已重新抓取 ${r.ok} 张封面`)
      } else useToast().error('抓取失败', { description: '没有可处理的视频/GIF' })
    } else if (key === 'copy-frame') {
      const r = await window.api.photos.copyVideoFrame(photo.id)
      if (r.ok) useToast().success('画面已复制', { description: '可在聊天/文档应用粘贴' })
      else useToast().error('拷贝失败', { description: r.error })
    } else if (key === 'save-frame') {
      const r = await window.api.photos.saveVideoFrame(photo.id)
      if (r.ok) {
        await loadAll()
        useToast().success('画面已入库', { description: r.filePath?.split(/[\\/]/).pop() })
      } else useToast().error('保存失败', { description: r.error })
    } else if (key === 'collage') {
      const r = await window.api.photos.createCollage(ids)
      if (r.ok) {
        await loadAll()
        useToast().success('拼图已创建并入库', { description: r.filePath?.split(/[\\/]/).pop() })
      } else useToast().error('创建拼图失败', { description: r.error })
    } else if (key.startsWith('sub:reverse-search:')) {
      // 反向图搜（Eagle find > reverse）：主进程把位图写进系统剪贴板并打开引擎页
      const r = await window.api.photos.reverseImageSearch({
        id: photo.id,
        engineId: key.slice('sub:reverse-search:'.length)
      })
      if (r.ok) {
        useToast().success('图片已复制到剪贴板，请在打开的页面粘贴', {
          description: `引擎：${r.engine ?? ''} · 在页面搜索框 ⌘V`
        })
      } else {
        useToast().error('反向图搜失败', { description: r.error })
      }
    } else if (key === 'brief') {
      // 十八轮 P3：进入简报模式 F5
      briefMode.value = true
      onPreviewPhoto(photo)
    } else if (key === 'similar') {
      void scan.handleFindSimilar(photo.id)
    } else if (key === 'reveal') {
      actions.revealInFolder(byIds(ids))
    } else if (key.startsWith('reveal-app:')) {
      // 十八轮 P3：在第三方文件管理器中打开文件所在位置
      const fmName = key.slice(11)
      const fm = fileManagers.value.find((f) => f.name === fmName)
      if (fm) {
        const ok = await window.api.system.revealInApp(photo.filePath, fm.appPath)
        if (!ok) useToast().error('打开失败', { description: `无法在 ${fmName} 中打开` })
      }
    } else if (key === 'remove-from-folder' && filters.activeFolder.value) {
      actions.removeSelectedFromFolder(filters.activeFolder.value.id, ids)
    } else if (key === 'delete') {
      actions.handleDeleteIds(ids)
    }
  }
}

function byIds(ids: string[]): Photo[] {
  return data.byIds(ids)
}

/** R3：检查器文件夹归属点击 → 跳到该文件夹视图 */
function openFolderFromInspector(folderId: string): void {
  const folder = data.folders.value.find((f) => f.id === folderId)
  tabs.setView(`folder:${folderId}`, folder?.name ?? '文件夹')
  router.push('/photos').catch(() => {})
}

/** leaf://item/<id> · leaf://folder/<id>：冷启动（argv）与热启动（open-url）都汇到这一个回调。
 *  校验一律在跳之前做——链接是外部可控输入，id 查不到就是不在本库，不能拿它去猜路径 */
useDeepLink((target) => void openFromDeepLink(target))

async function openFromDeepLink(target: DeepLinkTarget): Promise<void> {
  if (target.kind === 'folder') {
    if (!data.folders.value.some((f) => f.id === target.id)) {
      toast.warning('链接里的文件夹不在当前资源库')
      return
    }
    openFolderFromInspector(target.id)
    return
  }
  const photo = await window.api.photos.getById(target.id)
  if (!photo) {
    toast.warning('链接里的素材不在当前资源库')
    return
  }
  router.push('/photos').catch(() => {})
  onPreviewPhoto(photo)
}

function onPreviewFindSimilar(photoId: string): void {
  void scan.handleFindSimilar(photoId)
}

/** 预览内移除：PhotoPreview 已确认过（文案含文件名），这里不再二次确认，
 *  且必须关掉预览——素材已离开展示池，留着会变成翻页两端都禁用、
 *  信息面板全是死数据的死角 */
function onPreviewDelete(photoId: string): void {
  preview.close()
  actions.deleteIdsConfirmed([photoId])
}

/** 打开预览并记录「最近查看」（§3 L4 / §2.B 固定入口） */
function onPreviewPhoto(photo: Photo): void {
  preview.openPhoto(photo)
  void data.setLastViewed(photo.id)
}

/** 设置页「操控·双击文件=在默认应用打开」：双击时改用系统默认应用 */
function onOpenPhotoExternal(photo: Photo): void {
  void window.api.system.openPath(photo.filePath).then((ok) => {
    if (!ok) {
      useToast().error('打开失败', { description: '文件不存在或已被移动' })
    }
  })
}

function onPreviewById(id: string): void {
  preview.openById(id)
  void data.setLastViewed(id)
}

/** 网格浮层「添加标签」：仿右键菜单，对单张打开标签 prompt */
function onAddTag(photo: Photo): void {
  const ids = [photo.id]
  requestPrompt({
    title: '添加标签',
    label: '标签名称',
    initialValue: '',
    confirmLabel: '添加',
    onSubmit: async (tag) => {
      await actions.addTagToMany(ids, tag)
    }
  })
}

// ── 键盘上下文 ──

keyboard.bind({
  selectedIds,
  isSelectionMode,
  anyModalOpen,
  // D-012：搜索框移入 TitleBar，⌘F/⌘J 直接聚焦其输入框
  focusSearch: () => document.getElementById('library-search')?.focus(),
  // 八轮：⌘⇧N 新增文件夹 / ⌘⇧T 标签筛选（Eagle keybinds）
  createFolder: () => actions.createFolderInline(),
  openTagFilter: () => filterBarRef.value?.openTagFilter(),
  beginRename: () => {
    if (selectedIds.value.length !== 1) return
    const only = data.byIds(selectedIds.value)[0]
    if (only) beginInlineRename(only)
  },
  toggleAdvancedMode: () => {
    inspectorExpanded.value = !inspectorExpanded.value
  },
  toggleGrayscale,
  // 十八轮 P3 F5：简报模式——预览已开则切换；未开则用选中项/导航项打开预览并进入简报
  isBriefMode: () => briefMode.value,
  toggleBriefMode: () => {
    if (previewPhoto.value) {
      briefMode.value = !briefMode.value
      return
    }
    const targetId =
      selectedIds.value.length === 1 ? selectedIds.value[0] : keyboard.navActiveId.value
    if (targetId) {
      const p = data.byIds([targetId])[0]
      if (p) {
        briefMode.value = true
        onPreviewPhoto(p)
      }
    }
  },
  duplicateSelected: () => {
    if (selectedIds.value.length !== 1) return
    void window.api.photos.duplicate(selectedIds.value[0]).then((created) => {
      void loadAll()
      useToast().success('已创建副本', { description: created.fileName })
    })
  },
  copyPath: () => {
    void window.api.photos
      .copyText(
        data
          .byIds(selectedIds.value)
          .map((p) => p.filePath)
          .join('\n')
      )
      .then(() => useToast().success('已复制文件路径'))
  },
  // 对齐菜单「复制文件 ⌘C」：原文件进系统剪贴板（Finder 可粘贴）
  copyFiles: () => {
    void (async () => {
      const paths = data.byIds(selectedIds.value).map((p) => p.filePath)
      const ok = await window.api.photos.copyToClipboard(paths)
      if (ok) {
        useToast().success(`已复制 ${paths.length} 个文件`, { description: '可在 Finder 粘贴' })
      } else {
        useToast().error('复制失败', { description: '文件不存在或已被移动' })
      }
    })()
  },
  scrollToPhoto: (id) => {
    document.querySelector(`[data-photo-id="${id}"]`)?.scrollIntoView({ block: 'nearest' })
  },
  selectMaybeAll: () => selectAll(filters.flatDisplayPhotos.value.map((p) => p.id))
})

function anyModalOpen(): boolean {
  return (
    folderModalOpen.value ||
    batchRenameOpen.value ||
    smartAlbumModalOpen.value ||
    bookmarkModalOpen.value ||
    lockModalOpen.value ||
    pendingConfirm.value !== null ||
    pendingPrompt.value !== null ||
    previewPhoto.value !== null
  )
}

// 视图切换：清空瞬态（选择/预览/键盘高亮）──

watch(
  () => tabs.activeView,
  () => {
    selectedIds.value = []
    isSelectionMode.value = false
    preview.close()
    briefMode.value = false
    keyboard.clearNav()
  }
)

// 预览关闭时重置简报模式
watch(previewPhoto, (p) => {
  if (!p) briefMode.value = false
})

// 视图引用失效时由 store.invalidateViews 兜底回图库；
// 这里保证当前视图标题随数据（文件夹/智能夹真名）同步
watch(
  () => [filters.activeFolder.value?.name, filters.activeSmartAlbum.value?.name],
  () => {
    const view = tabs.activeView
    if (view.startsWith('folder:') && filters.activeFolder.value) {
      tabs.syncTitle(filters.activeFolder.value.name)
    } else if (view.startsWith('smart:') && filters.activeSmartAlbum.value) {
      tabs.syncTitle(filters.activeSmartAlbum.value.name)
    }
  }
)

// ── 生命周期 ──

/** R1：替换式选中（不翻转「选择模式」，对齐 Eagle 单击语义） */
function replaceSelection(ids: string[]): void {
  clearSelection()
  for (const id of ids) handleSelectPhoto(id, true)
  // 列表页的单击只走这条（网格走 click-select → 会更新高亮项）。不补上锚点的话，
  // 刚点的那一行对 Enter / 空格完全不可见，键盘预览只能回到池首
  keyboard.navActiveId.value = ids.length === 1 ? ids[0] : null
}

const loadAll = async (): Promise<void> => {
  await Promise.all([
    data.loadPhotos(),
    data.loadSmartAlbums(),
    data.loadFolders(),
    data.loadRecycleBin()
  ])
}

let unbindKeyboard: (() => void) | null = null
let unbindAiBatch: (() => void) | null = null
let unbindProcessing: (() => void) | null = null
let unbindViewWatcher: (() => void) | null = null
let unbindDrag: (() => void) | null = null
let unbindPaste: (() => void) | null = null
// 十五轮 A1：存量回填（file_size/尺寸）完成 → 刷新，消除首启「0 KB / —」
let unbindBackfilled: (() => void) | null = null
const refreshHandler = (): void => void data.loadPhotos()

/** 十八轮 P3：已安装的第三方文件管理器（Eagle「打开文件所在的位置▸」等价） */
const fileManagers = ref<Array<{ name: string; appPath: string }>>([])

onMounted(async () => {
  unbindKeyboard = keyboard.bindWindow()
  unbindAiBatch = aiBatch.bind()
  unbindProcessing = bindProcessingProgress()
  unbindViewWatcher = bindViewWatcher()
  unbindDrag = photoImport.bindWindowDrag()
  unbindPaste = photoImport.bindWindowPaste()
  unbindBackfilled = window.api.photos.onBackfilled(() => void data.loadPhotos())
  // 十五轮批6：布局弹层「刷新」按钮
  window.addEventListener('leaf:refresh-photos', refreshHandler)
  onUnmounted(() => window.removeEventListener('leaf:refresh-photos', refreshHandler))
  void actions.refreshLockState()
  void loadAll()
  // 十八轮 P3：加载已安装的第三方文件管理器列表
  try {
    fileManagers.value = await window.api.system.listFileManagers()
  } catch {
    fileManagers.value = []
  }
  // M3：视觉打标入口门禁的数据源（失败按未配置处理，不阻塞首屏）
  try {
    visionReady.value = (await window.api.ai.config()).vision.configured
  } catch {
    visionReady.value = false
  }
})

onUnmounted(() => {
  unbindKeyboard?.()
  unbindAiBatch?.()
  unbindProcessing?.()
  unbindViewWatcher?.()
  unbindDrag?.()
  unbindPaste?.()
  unbindBackfilled?.()
  search.dispose()
  // 代码审查 P1：清空模块级单例的选择/弹窗状态，防跨路由残留
  clearSelection()
  for (const key of [
    'tagManagerOpen',
    'smartAlbumModalOpen',
    'folderModalOpen',
    'batchRenameOpen',
    'bookmarkModalOpen',
    'lockModalOpen'
  ] as const) {
    actions[key].value = false
  }
})
</script>
