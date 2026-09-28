/**
 * Leaf 素材库 · 操作层（D-008 重构）
 *
 * 原index.vue 的全部变更类 handler 迁入：导入、删除/恢复、收藏/评分/
 * 描述/标签、相册/文件夹/智能夹 CRUD、批量重命名、转 WebP、书签、密码锁。
 * 依赖注入：数据层 + tabs + 确认/输入弹窗 + toast。
 */
import { ref } from 'vue'
import { useToast } from '@composables/useToast'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import type { Photo, SmartAlbum, SmartAlbumRules } from '@renderer/types/photo'
import { useDialogs } from './useDialogs'
import { usePhotoData } from './usePhotoData'

const SIMILARITY_THRESHOLD = 10

const toast = useToast()

// ── 弹窗开关（模板渲染用）──
const tagManagerOpen = ref(false)
const smartAlbumModalOpen = ref(false)
const folderModalOpen = ref(false)
const batchRenameOpen = ref(false)
const bookmarkModalOpen = ref(false)
const lockModalOpen = ref(false)
const editingSmartAlbum = ref<SmartAlbum | null>(null)
/** 二十四轮：Eagle 式侧栏行内重命名中的文件夹 id（新建后立即进入；右键重命名复用） */
const renamingFolderId = ref<string | null>(null)

function build() {
  const tabs = useLibraryTabs()
  const data = usePhotoData()
  const { requestConfirm, requestPrompt } = useDialogs()

  // ── 导入 ──

  const handleImportFolder = async (): Promise<void> => {
    try {
      const folderPaths = await window.api.photos.selectFolder()
      const folderPath = folderPaths[0]
      if (!folderPath) return

      data.loading.value = true
      // Eagle 口径：镜像磁盘层级建夹，当前在文件夹视图内则整棵树挂在它下面
      const activeView = tabs.activeView
      const parentId = activeView.startsWith('folder:') ? activeView.slice(7) : null
      const {
        photos: newPhotos,
        folders,
        truncated,
        fileCount
      } = await window.api.photos.importFolderTree(folderPath, parentId)

      if (fileCount === 0) {
        // 二十四轮（对齐 Eagle）：任意类型均入库；扫描为空通常是空目录/仅隐藏系统文件/未授权
        toast.warning('该文件夹里没有可导入的文件', {
          description: `${folderPath}（空目录、仅隐藏或系统文件、或系统未授权读取）`
        })
        return
      }
      if (newPhotos.length === 0) {
        toast.info(`目录里的 ${fileCount} 个文件都已在库中`)
        return
      }
      if (truncated) {
        toast.warning(`文件夹过大，仅导入前 ${newPhotos.length} 个文件`, {
          description: '建议分批导入或改用「自动导入」监控文件夹'
        })
      }

      await data.loadFolders()
      toast.success(
        `成功导入 ${newPhotos.length} 个素材`,
        folders.length > 0
          ? { description: `按目录结构新建了 ${folders.length} 个文件夹` }
          : undefined
      )
      await data.loadPhotos()
    } catch (error) {
      console.error('导入文件夹失败:', error)
      toast.error('导入失败', { description: (error as Error).message })
    } finally {
      data.loading.value = false
    }
  }

  const handleImportFiles = async (): Promise<void> => {
    try {
      const filePaths = await window.api.photos.selectFiles()
      if (filePaths.length === 0) return

      data.loading.value = true
      const newPhotos = await window.api.photos.addMultiple(filePaths)
      toast.success(`成功导入 ${newPhotos.length} 个素材`)
      await data.loadPhotos()
    } catch (error) {
      console.error('导入文件失败:', error)
      toast.error('导入失败', { description: (error as Error).message })
    } finally {
      data.loading.value = false
    }
  }

  // ── 单图增量操作 ──

  async function handleToggleFavorite(photoId: string): Promise<void> {
    try {
      const updated = await window.api.photos.toggleFavorite(photoId)
      if (updated) data.replacePhotoLocal(updated)
    } catch (error) {
      // 代码审查 P1：失败需用户可见（旧实现只 console.error 静默）
      console.error('切换收藏状态失败:', error)
      toast.error('操作失败', { description: (error as Error).message })
    }
  }

  async function handleSetRating(photoId: string, rating: number): Promise<void> {
    try {
      const updated = await window.api.photos.setRating(photoId, rating)
      if (updated) data.replacePhotoLocal(updated)
    } catch (error) {
      console.error('评分失败:', error)
      toast.error('评分失败', { description: (error as Error).message })
    }
  }

  async function handleSetDescription(photoId: string, description: string): Promise<void> {
    try {
      const updated = await window.api.photos.setDescription(photoId, description)
      if (updated) data.replacePhotoLocal(updated)
    } catch (error) {
      console.error('保存描述失败:', error)
      toast.error('保存失败', { description: (error as Error).message })
    }
  }

  /** 批量更新（评分/描述/收藏）：一次 IPC 完成，替代逐张请求 */
  async function handleBatchUpdate(ids: string[], updates: Partial<Photo>): Promise<void> {
    if (ids.length === 0) return
    try {
      const updated = await window.api.photos.updatePhotos(ids, updates)
      for (const p of updated) data.replacePhotoLocal(p)
    } catch (error) {
      console.error('批量更新失败:', error)
      toast.error('批量更新失败', { description: (error as Error).message })
    }
  }

  async function handleAddTag(photoId: string, tag: string): Promise<void> {
    try {
      const updated = await window.api.photos.addTag(photoId, tag)
      if (updated) data.replacePhotoLocal(updated)
    } catch (error) {
      console.error('添加标签失败:', error)
      toast.error('添加标签失败', { description: (error as Error).message })
    }
  }

  async function handleRemoveTag(photoId: string, tag: string): Promise<void> {
    try {
      const updated = await window.api.photos.removeTag(photoId, tag)
      if (updated) data.replacePhotoLocal(updated)
    } catch (error) {
      console.error('移除标签失败:', error)
      toast.error('移除标签失败', { description: (error as Error).message })
    }
  }

  /** 给一组素材加标签（右键菜单/拖拽落点共用） */
  async function addTagToMany(ids: string[], tag: string): Promise<void> {
    if (ids.length === 0 || !tag.trim()) return
    try {
      await window.api.photos.addTagToMultiple(ids, tag.trim())
      await data.loadPhotos()
      // 主进程 linkTag 会为全新名称建标签，字典不刷新则筛选面板看不到它（审查 P3-37）
      void data.loadDictionaryTags()
      toast.success(`已为 ${ids.length} 项添加标签「${tag.trim()}」`)
    } catch (error) {
      toast.error('添加标签失败', { description: (error as Error).message })
    }
  }

  // ── 删除 / 回收站 ──

  /** 软删除 + 10s 撤销（ids 捕获，撤销异步回调安全） */
  async function deleteWithUndo(ids: string[], undoRefresh?: () => Promise<void>): Promise<void> {
    // 必须 await 捕获异步拒绝（审查 P1-8）：旧实现 void promise + 同步 try/catch，
    // IPC 失败时既无 toast 也无选中集清理
    try {
      await window.api.photos.deleteMultiple(ids)
    } catch (error) {
      console.error('删除图片失败:', error)
      toast.error('删除失败', { description: (error as Error).message })
      return
    }
    toast.success(`已移除 ${ids.length} 张图片`, {
      description: '已移入回收站',
      duration: 10000,
      action: {
        label: '撤销',
        onClick: () => {
          void window.api.photos
            .restoreMultiple(ids)
            .then(async () => {
              await data.loadPhotos()
              await data.loadRecycleBin()
              await undoRefresh?.()
            })
            .catch((error: unknown) => {
              console.error('撤销删除失败:', error)
              toast.error('撤销失败', { description: (error as Error).message })
            })
        }
      }
    })
    await data.loadPhotos()
    await undoRefresh?.()
  }

  function handleDeleteIds(ids: string[], undoRefresh?: () => Promise<void>): void {
    if (ids.length === 0) return
    requestConfirm(
      '移除选中图片',
      `确定要从图片库中移除选中的 ${ids.length} 张图片吗？\n\n注意：这只会从应用中移除图片记录（可在回收站恢复），不会删除您的本地文件。`,
      '移除',
      async () => {
        deleteWithUndo(ids, undoRefresh)
      }
    )
  }

  /** 调用方已自带确认（预览弹窗的确认文案含文件名）时直接执行，避免二次确认框 */
  function deleteIdsConfirmed(ids: string[], undoRefresh?: () => Promise<void>): void {
    if (ids.length === 0) return
    void deleteWithUndo(ids, undoRefresh)
  }

  /** 彻底删除：回收站场景仅提供整体「清空回收站」，单条只做恢复 */
  function handleRestoreIds(ids: string[]): void {
    if (ids.length === 0) return
    void window.api.photos
      .restoreMultiple(ids)
      .then(async () => {
        await data.loadRecycleBin()
        await data.loadPhotos()
        toast.success(`已恢复 ${ids.length} 项`)
      })
      .catch((error: Error) => {
        toast.error('恢复失败', { description: error.message })
      })
  }

  function handleClearRecycleBin(): void {
    requestConfirm(
      '清空回收站',
      '将彻底删除回收站中的所有素材（缩略图一并清理）。\n\n注意：库内的文件副本会一起删除、不可撤销；导入时未拷贝入库的原文件（在资源库目录之外）不会被动。',
      '彻底清空',
      async () => {
        try {
          const purged = await window.api.photos.clearRecycleBin()
          await data.loadRecycleBin()
          toast.success(`已彻底清理 ${purged.length} 条记录`)
        } catch (error) {
          toast.error('清空失败', { description: (error as Error).message })
        }
      }
    )
  }

  async function handleRemoveAll(): Promise<void> {
    // 确认弹窗必须展示真实总数（审查 P2-20）：分页窗口下 allPhotos 只是 ≤500 的窗口，
    // 旧文案「移除所有 500 张」而 clearAll 实际清空全库，属危险操作的误导性确认
    let total = 0
    try {
      const stats = await window.api.photos.getStats()
      total = stats?.total ?? data.allPhotos.value.length
    } catch {
      total = data.allPhotos.value.length
    }
    if (total === 0) {
      toast.info('图片库中已经没有图片了')
      return
    }

    requestConfirm(
      '移除所有图片',
      `确定要从图片库中移除所有 ${total} 张图片吗？\n\n注意：这只会从应用中移除图片记录（可在回收站恢复），不会删除您的本地文件。`,
      '全部移除',
      async () => {
        try {
          data.loading.value = true
          // 带确认计数（审查 P3-22）：主进程比对库内实际总数，防渲染层 bug 误触发全库清除
          await window.api.photos.clearAll(total)
          await data.loadPhotos()
          toast.success('所有图片已从库中移除', {
            description: '本地文件未受影响，可在回收站恢复'
          })
        } catch (error) {
          console.error('移除所有图片失败:', error)
          toast.error('移除失败', { description: (error as Error).message })
        } finally {
          data.loading.value = false
        }
      }
    )
  }

  // ── 文件夹分组 ──

  /** 三轮 G10：新建子文件夹时预选的父级（FolderModal initialParent） */
  const folderModalParentId = ref<string | null>(null)

  function openFolderModal(parentId?: string): void {
    folderModalParentId.value = parentId ?? null
    folderSettingsId.value = null
    folderModalOpen.value = true
  }

  /** 十二轮：打开文件夹设置（Eagle 空白区右键「打开文件夹设置…」） */
  const folderSettingsId = ref<string | null>(null)
  function openFolderSettings(folderId: string | null): void {
    if (!folderId) return
    folderSettingsId.value = folderId
    folderModalOpen.value = true
  }

  /** 二十四轮（Eagle 实测）：「+」/ 右键新建 / ⌘⇧N 均无弹窗——立即创建
   *  「未命名文件夹」，侧栏该行进入行内重命名，视图自动跳入新文件夹。
   *  parentId 缺省 = 根级（Eagle：「+」始终在根目录创建，嵌套走右键「新增子文件夹」） */
  async function createFolderInline(parentId?: string | null): Promise<void> {
    const target = parentId ?? null
    try {
      const folder = await window.api.photos.createPhotoFolder('未命名文件夹', target)
      await data.loadFolders()
      renamingFolderId.value = folder.id
    } catch (error) {
      toast.error('创建文件夹失败', { description: (error as Error).message })
    }
  }

  /** 右键「重命名」→ 侧栏行内编辑（Eagle ⌘R 行为） */
  function startFolderInlineRename(fid: string): void {
    renamingFolderId.value = fid
  }

  /** 行内重命名提交（Eagle：Enter/失焦提交；空值或未变视为放弃） */
  async function commitFolderInlineRename(fid: string, rawName: string): Promise<void> {
    const folder = data.folders.value.find((f) => f.id === fid)
    renamingFolderId.value = null
    if (!folder) return
    const trimmed = rawName.trim()
    if (!trimmed || trimmed === folder.name) return
    try {
      await window.api.photos.renamePhotoFolder(fid, trimmed)
      await data.loadFolders()
      tabs.retitleByViewPrefix('folder:', fid, trimmed)
      toast.success(`「${folder.name}」已重命名为「${trimmed}」`, {
        action: { label: '撤销', onClick: () => void revertFolderRename(fid, folder.name) }
      })
    } catch (error) {
      toast.error('重命名失败', { description: (error as Error).message })
    }
  }

  /** 重命名 toast 的「撤销」：改回原名 */
  async function revertFolderRename(fid: string, originalName: string): Promise<void> {
    try {
      await window.api.photos.renamePhotoFolder(fid, originalName)
      await data.loadFolders()
      tabs.retitleByViewPrefix('folder:', fid, originalName)
    } catch (error) {
      toast.error('撤销失败', { description: (error as Error).message })
    }
  }

  /** 行内重命名取消（Eagle：ESC 退出编辑，保留当前名称） */
  function cancelFolderInlineRename(): void {
    renamingFolderId.value = null
  }

  function addToFolder(folderId: string, photoIds: string[]): void {
    if (photoIds.length === 0) return
    void window.api.photos
      .assignPhotosToFolder(folderId, photoIds)
      .then(() => {
        data.loadFolders()
        // 加入文件夹后变为「已分类」，刷新固定入口的未分类池
        data.loadUnsorted()
        void data.refreshFolderPhotos(folderId)
      })
      .catch((error: Error) => {
        toast.error('加入文件夹失败', { description: error.message })
      })
  }

  /**
   * Eagle `dialog.removeFolder` 口径（本机 4.0.0 bundle 取证，旧注释「Eagle 无确认弹窗」取错了）：
   * 文件夹有素材或有子文件夹才弹确认，勾选框「把文件夹内项目丢到回收站」默认勾选；
   * 确认后整棵子树连带删除，素材走软删除进回收站（磁盘原文件不动）。
   */
  function deleteFolderById(folderId: string, name: string): void {
    const doomed = folderSubtreeIds(folderId)
    const folder = data.folders.value.find((f) => f.id === folderId)
    const hasContent = doomed.length > 1 || (folder?.photoCount ?? 0) > 0
    if (!hasContent) {
      // Eagle：空文件夹不弹确认，直接删
      void runFolderDelete(folderId, name, false, doomed)
      return
    }
    requestConfirm(
      '删除文件夹',
      `这个操作无法进行复原，确认要删除“${name}”文件夹吗？`,
      '确认删除',
      async (toTrash) => {
        await runFolderDelete(folderId, name, toTrash, doomed)
      },
      { label: '把文件夹内项目丢到回收站', checked: true }
    )
  }

  /** 自身 + 全部后代（子文件夹随父级一起删，不再上提） */
  function folderSubtreeIds(rootId: string): string[] {
    const out = new Set<string>([rootId])
    let grew = true
    while (grew) {
      grew = false
      for (const f of data.folders.value) {
        if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
          out.add(f.id)
          grew = true
        }
      }
    }
    return [...out]
  }

  async function runFolderDelete(
    folderId: string,
    name: string,
    toTrash: boolean,
    doomed: string[]
  ): Promise<void> {
    const folder = data.folders.value.find((f) => f.id === folderId)
    // 前一个同级（删除后选中项的落点，对齐 Eagle）
    const siblings = data.folders.value.filter(
      (f) => (f.parentId ?? null) === (folder?.parentId ?? null)
    )
    const idx = siblings.findIndex((f) => f.id === folderId)
    const prevSibling = idx > 0 ? siblings[idx - 1] : null
    try {
      const wasActive = tabs.activeView === `folder:${folderId}`
      await window.api.photos.deletePhotoFolder(folderId, toTrash)
      // 整棵子树的视图都要失效（含停在子文件夹里的标签页）
      tabs.invalidateViews((v) => v.startsWith('folder:') && doomed.includes(v.slice(7)))
      if (wasActive && prevSibling) {
        // Eagle：删除后选中项落到前一个同级文件夹
        tabs.setView(`folder:${prevSibling.id}`, prevSibling.name)
      }
      await data.loadFolders()
      if (toTrash) {
        await data.loadRecycleBin()
        await data.loadPhotos()
        toast.success(`「${name}」已删除`, { description: '文件夹内的素材已移入回收站' })
      } else {
        await data.loadUnsorted()
        toast.success(`「${name}」已删除`, { description: '文件夹内的素材已归入未分类' })
      }
    } catch (error) {
      toast.error('删除失败', { description: (error as Error).message })
    }
  }

  function removeSelectedFromFolder(folderId: string, ids: string[]): void {
    if (ids.length === 0) return
    const folder = data.folders.value.find((f) => f.id === folderId)
    requestConfirm(
      '移出文件夹',
      `把 ${ids.length} 项移出「${folder?.name ?? '文件夹'}」吗？\n\n素材保留在图库中，仅变为未分组。`,
      '移出',
      async () => {
        await window.api.photos.assignPhotosToFolder(null, ids)
        await data.loadFolders()
        // 移出文件夹后变回「未分类」，刷新固定入口的未分类池
        await data.loadUnsorted()
        await data.refreshFolderPhotos(folderId)
        toast.success('已移出文件夹')
      }
    )
  }

  // ── 标签 ──

  function renameTagById(tagId: string, currentName: string): void {
    requestPrompt({
      title: '重命名标签',
      label: '新的标签名称',
      initialValue: currentName,
      onSubmit: async (name) => {
        const trimmed = name.trim()
        if (!trimmed || trimmed === currentName) return
        await window.api.tag.updateTag(tagId, { name: trimmed })
        await data.loadDictionaryTags()
        await data.loadPhotos()
        toast.success('标签已重命名')
      }
    })
  }

  function deleteTagById(tagId: string, name: string): void {
    requestConfirm(
      '删除标签',
      `确定删除标签「${name}」吗？\n\n会从所有素材上移除该标签，素材本身不受影响。`,
      '删除',
      async () => {
        await window.api.tag.deleteTag(tagId)
        tabs.invalidateViews((v) => v === `tag:${tagId}`)
        await data.loadDictionaryTags()
        await data.loadPhotos()
        toast.success('标签已删除')
      }
    )
  }

  // ── 智能文件夹 ──

  /** 二十六轮：「保存筛选」预置规则（Eagle ic-filter-saved → 智能文件夹） */
  const smartPresetRules = ref<SmartAlbumRules | null>(null)

  function openSmartAlbumModal(album: SmartAlbum | null, presetRules?: SmartAlbumRules): void {
    editingSmartAlbum.value = album
    smartPresetRules.value = album ? null : (presetRules ?? null)
    smartAlbumModalOpen.value = true
  }

  /** 二十六轮：以图找图（Eagle AI 维度；选外部图片 → 百度以图搜图，路径进剪贴板） */
  async function reverseImageSearch(): Promise<void> {
    try {
      const files = await window.api.photos.selectFiles()
      if (!files || files.length === 0) return
      const img = files[0]
      await window.api.system.openExternal('https://graph.baidu.com/')
      // 复制图片路径到剪贴板，方便用户在搜图页面粘贴/拖入
      try {
        await navigator.clipboard.writeText(img)
      } catch {
        /* 剪贴板不可用时静默 */
      }
      toast.info('已打开百度以图搜图，图片路径已复制，请拖入或选择图片')
    } catch (error) {
      console.error('以图搜图失败:', error)
      toast.error('以图搜图启动失败')
    }
  }

  function deleteSmartAlbumById(album: SmartAlbum): void {
    requestConfirm(
      '删除智能文件夹',
      `确定删除「${album.name}」吗？\n\n只删除收藏夹本身，不会删除其中的图片。`,
      '删除',
      async () => {
        await window.api.photos.deleteSmartAlbum(album.id)
        tabs.invalidateViews((v) => v === `smart:${album.id}`)
        await data.loadSmartAlbums()
        toast.success('智能文件夹已删除')
      }
    )
  }

  // ── 批量操作 ──

  function handleConvertToWebP(ids: string[]): void {
    const imageIds = data
      .byIds(ids)
      .filter((p) => p.kind === 'image' && !p.fileName.toLowerCase().endsWith('.webp'))
      .map((p) => p.id)
    if (imageIds.length === 0) {
      toast.info('选中项中没有可转换的图片（已跳过视频/音频/已是 WebP）')
      return
    }
    requestConfirm(
      '转换为 WebP',
      `将选中的 ${imageIds.length} 张图片转换为 WebP 并作为新素材入库（质量 82）。\n\n原文件保持不动。`,
      '转换',
      async () => {
        data.loading.value = true
        try {
          const { count } = await window.api.photos.convertPhotosToWebP(imageIds)
          toast.success(`已转换 ${count} 张并入库`)
          await data.loadPhotos()
        } catch (error) {
          toast.error('转换失败', { description: (error as Error).message })
        } finally {
          data.loading.value = false
        }
      }
    )
  }

  /** F3：按指定格式/参数直接转换（右键「转换为」子菜单；自定参数经 ConvertModal） */
  async function convertTo(
    ids: string[],
    format: 'webp' | 'png' | 'jpg' | 'avif',
    opts?: { quality?: number; maxWidth?: number }
  ): Promise<void> {
    const ext = `.${format}`
    const imageIds = data
      .byIds(ids)
      .filter((p) => p.kind === 'image' && !p.fileName.toLowerCase().endsWith(ext))
      .map((p) => p.id)
    if (imageIds.length === 0) {
      toast.info('选中项中没有可转换的图片（已跳过非图片与同格式）')
      return
    }
    data.loading.value = true
    try {
      const { count } = await window.api.photos.convertPhotos(imageIds, { format, ...opts })
      if (count > 0) {
        toast.success(`已转换 ${count} 张（${ext.toUpperCase()}）并入库`)
        await data.loadPhotos()
      } else {
        toast.info('没有可转换的图片')
      }
    } catch (error) {
      toast.error('转换失败', { description: (error as Error).message })
    } finally {
      data.loading.value = false
    }
  }

  /** §2.D 导出/打包：选目录后拷贝选中素材到外部 */
  async function exportSelected(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      toast.info('没有选中可导出的素材')
      return
    }
    try {
      const count = await window.api.photos.exportSelected(ids)
      if (count > 0) toast.success(`已导出 ${count} 个素材`)
      else toast.info('已取消导出或文件不可读')
    } catch (error) {
      toast.error('导出失败', { description: (error as Error).message })
    }
  }

  /** round20：导出选中素材元数据为 CSV */
  async function exportCsv(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      toast.info('没有选中可导出的素材')
      return
    }
    try {
      const result = await window.api.photos.exportCsv(ids)
      if (result.ok && result.count) {
        toast.success(`已导出 ${result.count} 条元数据为 CSV`)
      } else if (result.error !== '已取消') {
        toast.error('CSV 导出失败', { description: result.error })
      }
    } catch (error) {
      toast.error('CSV 导出失败', { description: (error as Error).message })
    }
  }

  // ── 密码锁 ──

  const lockEnabled = ref(false)
  const locked = ref(false)
  const unlockPassword = ref('')

  async function refreshLockState(): Promise<void> {
    try {
      lockEnabled.value = await window.api.photos.lockIsEnabled()
      if (lockEnabled.value) locked.value = true
    } catch {
      // 主进程未就绪等场景静默
    }
  }

  /** 🔒 统一打开管理弹窗（设置/移除/立即锁定都在弹窗内） */
  function handleLockAction(): void {
    lockModalOpen.value = true
  }

  function handleQuickLock(): void {
    lockModalOpen.value = false
    locked.value = true
    unlockPassword.value = ''
  }

  async function handleUnlock(): Promise<void> {
    if (!unlockPassword.value) return
    try {
      const ok = await window.api.photos.lockVerify(unlockPassword.value)
      if (ok) {
        locked.value = false
        unlockPassword.value = ''
      } else {
        toast.error('密码不正确')
      }
    } catch (error) {
      toast.error('解锁失败', { description: (error as Error).message })
    }
  }

  // ── 在系统文件管理器中显示 ──

  function revealInFolder(photos: Photo[]): void {
    const last = photos[photos.length - 1]
    if (last) void window.api.photos.showInFolder(last.filePath)
  }

  return {
    // 弹窗开关
    tagManagerOpen,
    smartAlbumModalOpen,
    folderModalOpen,
    folderModalParentId,
    folderSettingsId,
    openFolderSettings,
    batchRenameOpen,
    bookmarkModalOpen,
    lockModalOpen,
    editingSmartAlbum,
    smartPresetRules,
    // 导入
    handleImportFolder,
    handleImportFiles,
    // 单图
    handleToggleFavorite,
    handleSetRating,
    handleSetDescription,
    handleBatchUpdate,
    handleAddTag,
    handleRemoveTag,
    addTagToMany,
    revealInFolder,
    // 删除/回收站
    handleDeleteIds,
    deleteIdsConfirmed,
    handleRestoreIds,
    handleClearRecycleBin,
    handleRemoveAll,
    SIMILARITY_THRESHOLD,
    // 文件夹
    openFolderModal,
    renamingFolderId,
    createFolderInline,
    startFolderInlineRename,
    commitFolderInlineRename,
    cancelFolderInlineRename,
    addToFolder,
    deleteFolderById,
    removeSelectedFromFolder,
    // 标签
    renameTagById,
    deleteTagById,
    // 智能夹
    openSmartAlbumModal,
    deleteSmartAlbumById,
    reverseImageSearch,
    // 批量
    handleConvertToWebP,
    convertTo,
    exportSelected,
    exportCsv,
    // 锁
    lockEnabled,
    locked,
    unlockPassword,
    refreshLockState,
    handleLockAction,
    handleQuickLock,
    handleUnlock
  }
}

type Actions = ReturnType<typeof build>

let singleton: Actions | null = null

export function usePhotoActions(): Actions {
  if (!singleton) singleton = build()
  return singleton
}
