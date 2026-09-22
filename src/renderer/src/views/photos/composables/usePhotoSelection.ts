/**
 * Leaf 素材库 · 选中状态（D-011）
 *
 * 模块级单例：index.vue（网格事件）、FilterBar（已选 chip）、TitleBar
 * （更多菜单的批量操作）三方共享同一份选中态。
 */
import { ref } from 'vue'

const selectedIds = ref<string[]>([])
const isSelectionMode = ref(false)

function build() {
  function toggleSelectionMode(): void {
    isSelectionMode.value = !isSelectionMode.value
    if (!isSelectionMode.value) selectedIds.value = []
  }

  /** 代码审查 P1：同时退出选择模式——旧实现只清 ids，
   *  关闭检查器后仍停在选择模式，单击卡片不再打开预览 */
  function clearSelection(): void {
    selectedIds.value = []
    isSelectionMode.value = false
  }

  function handleSelectPhoto(photoId: string, selected: boolean): void {
    if (selected) {
      if (!selectedIds.value.includes(photoId)) selectedIds.value.push(photoId)
    } else {
      selectedIds.value = selectedIds.value.filter((id) => id !== photoId)
    }
  }

  /** ⌘A 全选（传入当前展示区扁平列表） */
  function selectAll(ids: string[]): void {
    selectedIds.value = [...ids]
    if (selectedIds.value.length > 0) isSelectionMode.value = true
  }

  return {
    selectedIds,
    isSelectionMode,
    toggleSelectionMode,
    clearSelection,
    handleSelectPhoto,
    selectAll
  }
}

type Selection = ReturnType<typeof build>

let singleton: Selection | null = null

export function usePhotoSelection(): Selection {
  if (!singleton) singleton = build()
  return singleton
}
