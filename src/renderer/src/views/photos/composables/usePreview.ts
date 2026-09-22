/**
 * Leaf 素材库 · 预览状态（D-008 重构）
 *
 * previewPhoto + 翻页（顺序与网格/列表展示一致：flatDisplayPhotos），
 * 空格 QuickLook 的锚点（lastViewedId）也在这里。
 */
import { ref } from 'vue'
import type { Photo } from '@renderer/types/photo'
import { usePhotoFilters } from './usePhotoFilters'

const previewPhoto = ref<Photo | null>(null)
const lastViewedId = ref<string | null>(null)

function build() {
  const filters = usePhotoFilters()

  function openPhoto(photo: Photo): void {
    lastViewedId.value = photo.id
    previewPhoto.value = photo
  }

  function openById(photoId: string, pool?: Photo[]): void {
    const photo = (pool ?? filters.currentPool.value).find((p) => p.id === photoId)
    if (photo) openPhoto(photo)
  }

  function close(): void {
    previewPhoto.value = null
  }

  // 翻页池选择（审查 P3-38）：地图视图的展示池是 flatDisplayPhotos（主池），
  // 但入口池是仅含坐标素材的 currentPool——旧实现会翻到无坐标素材，与地图语境脱节
  function pagePool(): Photo[] {
    if (filters.isMapView.value) return filters.currentPool.value
    return filters.flatDisplayPhotos.value
  }

  function previous(): void {
    if (!previewPhoto.value) return
    const pool = pagePool()
    const idx = pool.findIndex((p) => p.id === previewPhoto.value!.id)
    if (idx > 0) previewPhoto.value = pool[idx - 1]
  }

  function next(): void {
    if (!previewPhoto.value) return
    const pool = pagePool()
    const idx = pool.findIndex((p) => p.id === previewPhoto.value!.id)
    if (idx >= 0 && idx < pool.length - 1) previewPhoto.value = pool[idx + 1]
  }

  return { previewPhoto, lastViewedId, openPhoto, openById, close, previous, next }
}

type Preview = ReturnType<typeof build>

let singleton: Preview | null = null

export function usePreview(): Preview {
  if (!singleton) singleton = build()
  return singleton
}
