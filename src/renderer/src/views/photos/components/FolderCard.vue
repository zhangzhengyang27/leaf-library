<script setup lang="ts">
/**
 * FolderCard · 子文件夹卡片（特性：父文件夹视图网格/列表顶部，Eagle 标志性交互）
 *
 * 数据源 = usePhotoData.childFolders（parentId === 活动文件夹，数据库序）；
 * 计数徽标 = PhotoFolder.photoCount（直属素材数、不含后代/回收站，与侧栏树行同源）。
 * 交互（useFolderCardActions 单点出口，全部照侧栏既有链路）：
 * - 单击 = 选中高亮（v1 边界：不进多选集，不参与框选橡皮筋/键盘全选/连选）；
 * - 双击 = 进入该文件夹（= 侧栏 openItem 的导航语义，含密码解锁前置）；
 * - 右键 = 文件夹上下文菜单（打开/重命名/在父文件夹显示子文件夹内容/删除）；
 * - 拖拽素材到卡片 = 移入该文件夹（库内载荷走 addToFolder；外部文件走导入漏斗）。
 * 视觉照既有卡片体系 token（无新色值）：hover 提亮、选中/拖落 ring-brand-500 描边。
 */
import { ref } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import type { PhotoFolder } from '../../../types/photo'
import { useFolderCardActions } from '../composables/useFolderCardActions'

const props = withDefaults(
  defineProps<{
    folder: PhotoFolder
    /** 单击选中的高亮态（宿主组件记账，v1 不进多选集） */
    selected?: boolean
    /** card = 网格单元形态（方格裁切）；row = 列表布局行形态 */
    variant?: 'card' | 'row'
  }>(),
  { selected: false, variant: 'card' }
)

const emit = defineEmits<{
  /** 单击选中（宿主记录 selectedFolderId） */
  select: [folderId: string]
}>()

const cardActions = useFolderCardActions()
/** 拖拽悬停高亮（照侧栏行 dragOver 落点提示） */
const dragOver = ref(false)

function onClick(): void {
  emit('select', props.folder.id)
}
function onDblClick(): void {
  cardActions.openFolderView(props.folder.id)
}
function onContextMenu(e: MouseEvent): void {
  cardActions.openFolderCardMenu(props.folder.id, e.clientX, e.clientY)
}
function onDragOver(e: DragEvent): void {
  e.preventDefault()
  dragOver.value = true
}
function onDragLeave(e: DragEvent): void {
  // 指针离开「整卡」才算离开：卡内有封面/图标/名称等子节点，拖拽跨子节点边界
  // 会不断冒泡 dragleave（侧栏行 onRowDragLeave 同款守卫）
  const card = e.currentTarget as HTMLElement | null
  const next = e.relatedTarget as Node | null
  if (card && next && card.contains(next)) return
  dragOver.value = false
}
function onDrop(e: DragEvent): void {
  dragOver.value = false
  cardActions.dropPhotosToFolderCard(props.folder.id, e)
}
</script>

<template>
  <!-- ── 网格形态：等宽卡片（封面方格 + 名称 + 计数）── -->
  <div
    v-if="variant === 'card'"
    class="folder-card group relative flex cursor-pointer flex-col rounded-[6px] border p-1.5 transition-all duration-fast"
    :class="
      selected || dragOver
        ? 'border-transparent ring-2 ring-brand-500'
        : 'border-line-subtle hover:bg-surface-hover'
    "
    :data-folder-card="folder.id"
    :data-folder-name="folder.name"
    :data-folder-count="folder.photoCount"
    :title="folder.name"
    @click="onClick"
    @dblclick="onDblClick"
    @contextmenu.prevent="onContextMenu"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- 封面：有封面显封面缩略图（侧栏树行同款 thumb:// 通路）；无则 emoji / 文件夹图形 -->
    <div class="relative aspect-square w-full overflow-hidden rounded-[3px] bg-surface-hover">
      <img
        v-if="folder.coverPhotoId"
        :src="`thumb://256/${folder.coverPhotoId}`"
        class="absolute inset-0 size-full object-cover"
        :alt="folder.name"
        draggable="false"
      />
      <span
        v-else-if="folder.icon"
        class="absolute inset-0 flex items-center justify-center text-4xl"
        >{{ folder.icon }}</span
      >
      <!-- 无自定义色时照侧栏树行用 Eagle 文件夹灰蓝（LibraryPanel EAGLE_FOLDER_COLOR 同值） -->
      <AppIcon
        v-else
        icon="ic_folder-close"
        :size="44"
        :color="folder.color ?? '#64748b'"
        class="absolute inset-0 m-auto"
      />
    </div>
    <div class="mt-1.5 flex items-center gap-1.5 px-0.5">
      <span class="min-w-0 flex-1 truncate text-xs text-fg-primary">{{ folder.name }}</span>
      <!-- 素材计数徽标（口径见 usePhotoData.childFolders 注释） -->
      <span class="shrink-0 text-[11px] tabular-nums text-fg-muted">{{ folder.photoCount }}</span>
    </div>
  </div>

  <!-- ── 列表形态：行（图标 + 名称 + 计数右对齐），与 PhotoListView 行同高同 token ── -->
  <div
    v-else
    class="folder-card group flex h-11 cursor-pointer items-center gap-3 border-b border-line-subtle px-3 transition-colors duration-instant last:border-b-0"
    :class="
      selected || dragOver
        ? 'bg-brand-500/10 ring-1 ring-inset ring-brand-500'
        : 'hover:bg-surface-hover'
    "
    :data-folder-card="folder.id"
    :data-folder-name="folder.name"
    :data-folder-count="folder.photoCount"
    :title="folder.name"
    @click="onClick"
    @dblclick="onDblClick"
    @contextmenu.prevent="onContextMenu"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <span
      class="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-hover"
    >
      <img
        v-if="folder.coverPhotoId"
        :src="`thumb://256/${folder.coverPhotoId}`"
        class="size-8 object-cover"
        :alt="folder.name"
        draggable="false"
      />
      <span v-else-if="folder.icon" class="text-[15px] leading-none">{{ folder.icon }}</span>
      <AppIcon v-else icon="ic_folder-close" :size="18" :color="folder.color ?? '#64748b'" />
    </span>
    <span class="min-w-0 flex-1 truncate text-xs text-fg-primary">{{ folder.name }}</span>
    <span class="shrink-0 text-[12px] tabular-nums text-fg-muted">{{ folder.photoCount }}</span>
  </div>
</template>
