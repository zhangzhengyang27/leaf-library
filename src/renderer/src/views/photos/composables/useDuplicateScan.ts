/**
 * Leaf 素材库 · 查重与相似（D-008 重构）
 *
 * 原 index.vue 的 duplicate/similar 逻辑迁入；结果池注入 usePhotoFilters，
 * 「查重」「与 xx 相似」作为 tab 视角打开。
 */
import { ref } from 'vue'
import { useToast } from '@composables/useToast'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import type { DuplicateGroup } from '@views/photos/components/DuplicateGroupsView.vue'
import type { Photo } from '@renderer/types/photo'
import { useDialogs } from './useDialogs'
import { usePhotoData } from './usePhotoData'
import { usePhotoFilters } from './usePhotoFilters'
import { usePhotoSelection } from './usePhotoSelection'
import { installSearchPools } from './usePhotoFilters'

const SIMILARITY_THRESHOLD = 10

const toast = useToast()

const duplicateGroups = ref<DuplicateGroup[]>([])
const duplicateLoading = ref(false)
const similarSourceName = ref('')
const similarMatches = ref<Photo[]>([])
/** G1：本次"找相似"里由向量档补进来的条数（pHash 之外的那一档） */
const similarVectorCount = ref(0)
/** F5：扫描设置弹窗（Eagle 4「扫描相同文件/相似图片」× 范围） */
const scanModalOpen = ref(false)
/** 最近一次扫描参数（结果页徽标 + 移除后按原参数重扫） */
const lastScan = ref<{
  mode: 'phash' | 'hash'
  scope: 'all' | 'view' | 'selection'
  photoIds?: string[]
}>({ mode: 'phash', scope: 'all' })
/** 扫描参数的人类可读徽标（DuplicateGroupsView 顶部展示） */
const scanLabel = ref('')

export type DuplicateMode = 'phash' | 'hash'
export type DuplicateScope = 'all' | 'view' | 'selection'

function build() {
  const tabs = useLibraryTabs()
  const data = usePhotoData()
  const filters = usePhotoFilters()
  const { requestConfirm } = useDialogs()
  const { selectedIds } = usePhotoSelection()
  /** 找相似请求序号（审查 P3-34） */
  let similarSeq = 0

  /** 打开扫描设置弹窗（真正扫描在弹窗「开始扫描」触发） */
  function openDuplicateScan(): void {
    scanModalOpen.value = true
  }

  /** 在触发视图下快照范围 id（切走视图前调用） */
  function snapshotScope(scope: DuplicateScope): string[] | undefined {
    if (scope === 'view') return filters.flatDisplayPhotos.value.map((p) => p.id)
    if (scope === 'selection') return [...selectedIds.value]
    return undefined
  }

  /** 按模式×范围执行扫描；photoIds 缺省时按当前视图快照 */
  async function runDuplicateScan(
    mode: DuplicateMode,
    scope: DuplicateScope,
    photoIds?: string[]
  ): Promise<void> {
    // 在飞守卫（审查 P3-34）：双击「开始扫描」会并发两次全库 phash 扫描
    if (duplicateLoading.value) return
    const ids = scope === 'all' ? undefined : (photoIds ?? snapshotScope(scope))
    if (scope !== 'all' && (!ids || ids.length === 0)) {
      toast.info(scope === 'selection' ? '当前没有选中素材' : '当前视图没有素材')
      scanModalOpen.value = false
      return
    }
    lastScan.value = { mode, scope, photoIds: ids }
    scanLabel.value =
      `${mode === 'hash' ? '相同文件' : '相似图片'} · ` +
      (scope === 'all' ? '全部素材' : scope === 'view' ? '当前视图' : '已选')
    scanModalOpen.value = false
    tabs.setView('duplicates', '相似查重')
    duplicateLoading.value = true
    try {
      const groups = await window.api.photos.getDuplicateGroups(SIMILARITY_THRESHOLD, {
        mode,
        photoIds: ids
      })
      duplicateGroups.value = groups.map((photos) => {
        // 推荐保留：分辨率 × 文件大小最优的一张
        const keep = [...photos].sort(
          (a, b) =>
            (b.width ?? 0) * (b.height ?? 0) * (b.fileSize || 1) -
            (a.width ?? 0) * (a.height ?? 0) * (a.fileSize || 1)
        )[0]
        return { photos, keepId: keep?.id ?? photos[0].id }
      })
      if (groups.length === 0) toast.info('没有发现相似/重复图片')
    } catch (error) {
      toast.error('查重失败', { description: (error as Error).message })
    } finally {
      duplicateLoading.value = false
    }
  }

  /** 移除/撤销后按原参数重扫（不重新弹设置） */
  function rescanLast(): Promise<void> {
    const { mode, scope, photoIds } = lastScan.value
    return runDuplicateScan(mode, scope, photoIds)
  }

  /**
   * 找相似：两档合并。① pHash 感知哈希（近乎同一张图）；② G1 的图像向量档
   * （改过一版、换过封面但视觉同类的那一批）。结果池注入 usePhotoFilters 展示。
   * D-017 拆掉 CLIP 后这里只剩 pHash 一档，向量档随二十九轮重新接回（实现换成了
   * 主进程直跑 onnxruntime-node，不再是 transformers.js 那条宿主路）。
   */
  const handleFindSimilar = async (photoId: string): Promise<void> => {
    // 序号守卫（审查 P3-34）：连续对两张图找相似时，先发的慢请求不得覆盖新视图
    const seq = ++similarSeq
    let matches: Photo[] = []
    try {
      const phashMatches = await window.api.photos.findSimilar(photoId, SIMILARITY_THRESHOLD)
      if (seq !== similarSeq) return
      matches = phashMatches.map((m) => m.photo)
    } catch (error) {
      if (seq === similarSeq) toast.error('找相似失败', { description: (error as Error).message })
      return
    }
    // G1 第二档：pHash 只认"近乎同一张图"（同尺寸同构图），换封面/改过一版的
    // 视觉同类它看不见；向量档补这一段。模型没下载时 vectors.similar 直接返回空，
    // 所以这里不报错也不提示——那一档就是不存在。
    let vectorCount = 0
    try {
      const hits = await window.api.vectors.similar(photoId, 24)
      if (seq !== similarSeq) return
      const seen = new Set(matches.map((p) => p.id))
      for (const hit of hits) {
        if (!hit?.photo || seen.has(hit.photo.id)) continue
        seen.add(hit.photo.id)
        matches.push(hit.photo)
        vectorCount++
      }
    } catch {
      /* 向量档不可用：pHash 那一档的结果照常展示 */
    }
    similarVectorCount.value = vectorCount
    if (seq !== similarSeq) return
    similarSourceName.value =
      data.allPhotos.value.find((p) => p.id === photoId)?.fileName ?? '所选图片'
    similarMatches.value = matches
    tabs.setView(`similar:${photoId}`, `与「${similarSourceName.value}」相似`)
    if (matches.length === 0) {
      toast.info('没有找到相似图片', {
        description: `相似度阈值：汉明距离 ≤ ${SIMILARITY_THRESHOLD}`
      })
    } else if (vectorCount > 0 && matches.length > vectorCount) {
      toast.info(`另有 ${vectorCount} 张由向量档补入`, {
        description: 'pHash 认近乎同一张的图；向量档认改过一版、构图相似的那类'
      })
    }
  }

  const handleRemoveOthers = (group: DuplicateGroup): void => {
    const others = group.photos.filter((p) => p.id !== group.keepId).map((p) => p.id)
    if (others.length === 0) return
    requestConfirm(
      '移除相似图片',
      `保留「${group.photos.find((p) => p.id === group.keepId)?.fileName ?? '推荐图片'}」，\n移除其余 ${others.length} 张相似图片吗？\n\n记录会移入回收站，本地文件不受影响。`,
      '移除',
      async () => {
        try {
          await window.api.photos.deleteMultiple(others)
          toast.success(`已移除 ${others.length} 张相似图片`, {
            description: '已移入回收站',
            duration: 10000,
            action: {
              label: '撤销',
              onClick: () => {
                void window.api.photos.restoreMultiple(others).then(async () => {
                  await data.loadPhotos()
                  await rescanLast()
                })
              }
            }
          })
          await data.loadPhotos()
          await rescanLast()
        } catch (error) {
          toast.error('移除失败', { description: (error as Error).message })
        }
      }
    )
  }

  return {
    SIMILARITY_THRESHOLD,
    duplicateGroups,
    duplicateLoading,
    similarSourceName,
    similarMatches,
    similarVectorCount,
    scanModalOpen,
    scanLabel,
    lastScan,
    openDuplicateScan,
    runDuplicateScan,
    rescanLast,
    handleFindSimilar,
    handleRemoveOthers
  }
}

type DuplicateScan = ReturnType<typeof build>

let singleton: DuplicateScan | null = null

/** 模块单例；同时把 similar 结果池注入 usePhotoFilters */
export function useDuplicateScan(): DuplicateScan {
  if (!singleton) {
    singleton = build()
    // 相似视图的结果池（filters 展示用）
    const pools = installSearchPools()
    pools.similarMatches = similarMatches
    pools.similarSourceName = similarSourceName
  }
  return singleton
}
