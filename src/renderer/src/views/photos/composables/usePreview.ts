/**
 * Leaf 素材库 · 预览状态（D-008 重构）
 *
 * 预览不存对象快照，只记 id：每次经 data.livePhoto(id) 现取，
 * 于是缩略图/EXIF 回填、收藏/评分/标签的就地替换能立刻反映到打开着的预览上。
 * 素材已从所有池里消失（删除/筛选挪走）时退回最后一次快照，预览不会突然空白。
 * 空格 QuickLook 的锚点（lastViewedId）也在这里。
 */
import { computed, ref } from 'vue'
import type { Photo } from '@renderer/types/photo'
import { usePhotoData } from './usePhotoData'
import { usePhotoFilters } from './usePhotoFilters'

const previewId = ref<string | null>(null)
const previewSnapshot = ref<Photo | null>(null)
const lastViewedId = ref<string | null>(null)

function build() {
  const filters = usePhotoFilters()
  const data = usePhotoData()

  const previewPhoto = computed<Photo | null>(() => {
    const id = previewId.value
    if (!id) return null
    return data.livePhoto(id) ?? (previewSnapshot.value?.id === id ? previewSnapshot.value : null)
  })

  function show(photo: Photo): void {
    previewId.value = photo.id
    previewSnapshot.value = photo
  }

  function openPhoto(photo: Photo): void {
    lastViewedId.value = photo.id
    show(photo)
  }

  function openById(photoId: string, pool?: Photo[]): void {
    const photo = (pool ?? filters.currentPool.value).find((p) => p.id === photoId)
    if (photo) openPhoto(photo)
  }

  function close(): void {
    previewId.value = null
    previewSnapshot.value = null
  }

  // 翻页池选择（审查 P3-38）：地图视图的展示池是 flatDisplayPhotos（主池），
  // 但入口池是仅含坐标素材的 currentPool——旧实现会翻到无坐标素材，与地图语境脱节
  function pagePool(): Photo[] {
    if (filters.isMapView.value) return filters.currentPool.value
    return filters.flatDisplayPhotos.value
  }

  function previous(): void {
    const id = previewId.value
    if (!id) return
    const pool = pagePool()
    const idx = pool.findIndex((p) => p.id === id)
    if (idx > 0) show(pool[idx - 1])
  }

  function next(): void {
    const id = previewId.value
    if (!id) return
    const pool = pagePool()
    const idx = pool.findIndex((p) => p.id === id)
    if (idx >= 0 && idx < pool.length - 1) show(pool[idx + 1])
  }

  return { previewPhoto, lastViewedId, openPhoto, openById, close, previous, next }
}

type Preview = ReturnType<typeof build>

let singleton: Preview | null = null

export function usePreview(): Preview {
  if (!singleton) singleton = build()
  return singleton
}
