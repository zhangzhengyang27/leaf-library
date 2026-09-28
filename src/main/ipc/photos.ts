import { extname, join, basename, isAbsolute } from 'path'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  promises as fsPromises,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'node:os'
import type { BrowserWindow, OpenDialogOptions } from 'electron'
import { ClipboardItem, clipboard, dialog, ipcMain, shell } from 'electron'
import { pathToFileURL } from 'node:url'
import { showOpenDialogFor, showSaveDialogFor } from '../modules/dialogs'
import { getActiveLibrary, activeSubdir } from '../modules/libraryRegistry'
import { screenshotFileName } from '../utils/screenshotFile'
import { registerPrefixedHandlers, sanitizeIpcMessage } from './utils'
import { PhotoDataStore, type Photo, type SmartAlbumRules } from '../stores/PhotoDataStore'
import { photoRepository } from '../db/repos'
import type { AssetProcessingService } from '../services/AssetProcessingService'
import { getThumbnailService } from '../services/ThumbnailService'
import { buildSmartAlbumWhere, type CompiledWhere } from '../db/smartAlbumRules'
import type { PageSortCol } from '../db/repos/PhotoRepository'
import fontkit from 'fontkit'
import {
  getEmbeddingService,
  isAiAvailable,
  type EmbeddingProgress
} from '../services/EmbeddingService'
import { addBookmark as addBookmarkService } from '../services/BookmarkService'
import {
  folderHasPassword as folderHasPasswordSvc,
  removeFolderPassword as removeFolderPasswordSvc,
  setFolderPassword as setFolderPasswordSvc,
  verifyFolderPassword as verifyFolderPasswordSvc
} from '../services/FolderLockService'
import { photoFolderRepository } from '../db/repos'
import { reverseGeocode as reverseGeocodeService } from '../services/GeoCoder'
import { ocrService } from '../services/OcrService'
import { listZipEntries, extractZipEntryDataUrl } from '../utils/zipBrowse'
import { uniqueFilePath } from '../utils/screenshotFile'
import { getReverseSearchEngine, openReverseSearchEngine } from '../utils/reverseSearch'
import {
  isOpenPathAllowed,
  grantScanDir,
  isScanDirAllowed,
  isBundlePath
} from '../utils/pathPolicy'
import { docTextService } from '../services/DocTextService'
import { importDirectoryTree, SCAN_LIMIT as FOLDER_SCAN_LIMIT } from '../services/ImportFolderTree'
import type { ImportDeps } from '../services/ImportFolderTree'
import {
  lockClear,
  lockIsEnabled,
  lockSetPassword,
  lockVerify
} from '../services/PhotosLockService'

export function registerPhotoIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  photoStore: PhotoDataStore,
  getAssetProcessing: () => AssetProcessingService | null
): void {
  /** 挂载点：只认库里真实存在的文件夹 id，其余（null/坏 id）一律归到侧栏根级 */
  const resolveParentFolder = (raw: unknown): string | null =>
    typeof raw === 'string' && raw && photoFolderRepository.getById(raw) ? raw : null

  /** 目录镜像建夹所需的依赖（ImportFolderTree 服务不直接 import 仓库，方便单测注入） */
  const importDeps = (): ImportDeps<Photo> => {
    const processing = getAssetProcessing()
    return {
      findByName: (parentId: string | null, name: string) =>
        photoFolderRepository.findByName(name, parentId),
      create: (parentId: string | null, name: string) =>
        photoFolderRepository.create(name, parentId).id,
      addFiles: (paths: string[]) => {
        const created = photoStore.addPhotos(paths)
        for (const p of created) processing?.enqueue(p.id)
        return created
      },
      assign: (folderId: string, photoIds: string[]) => {
        photoStore.assignPhotosToFolder(folderId, photoIds)
      },
      remove: (folderId: string) => {
        photoFolderRepository.remove(folderId, false)
      }
    }
  }

  // 直接映射到数据存储的方法
  registerPrefixedHandlers('photos', {
    getAll: () => photoStore.getPhotos(),
    // —— 六期：书签收集 / 反地理编码 / 素材库密码锁 ——
    addBookmark: (url: string, title?: string) => addBookmarkService(url, title),
    reverseGeocode: (lat: number, lon: number) => reverseGeocodeService(lat, lon),
    lockIsEnabled: () => lockIsEnabled(),
    lockSetPassword: (password: string, oldPassword?: string) =>
      lockSetPassword(password, oldPassword),
    lockVerify: (password: string) => lockVerify(password),
    lockClear: (password: string) => lockClear(password),
    // D-008：右键菜单「在 Finder 显示」（showItemInFolder 自带文件管理器差异处理）
    // 路径白名单：userData/应用目录/已登记库根目录/已入库素材（与 system:openPath 同策略）
    showInFolder: (filePath: string) => {
      if (typeof filePath === 'string' && filePath.length > 0 && isOpenPathAllowed(filePath)) {
        shell.showItemInFolder(filePath)
      }
    },
    // 阶段 5.1：格式预览插件读取文本内容
    // （代码审查 P0-7 收紧：仅限已入库素材路径 + 剔除敏感扩展名 + 512KB 上限）
    readTextFile: async (filePath: string) => {
      // 路径必须是已入库素材，防读取项目 .env / 配置 / 其它资源库文件
      if (!photoStore.getPhotoByPath(filePath)) {
        return { ok: false as const, error: 'not an asset' }
      }
      const ext = (filePath.split('.').pop() ?? '').toLowerCase()
      const TEXT_EXTS = new Set([
        'txt',
        'md',
        'markdown',
        'json',
        'log',
        'css',
        'scss',
        'less',
        'html',
        'htm',
        'xml',
        'yaml',
        'yml',
        'toml',
        'csv',
        'tsv',
        'js',
        'mjs',
        'cjs',
        'ts',
        'jsx',
        'tsx',
        'vue',
        'py',
        'java',
        'c',
        'cpp',
        'h',
        'rs',
        'go',
        'rb',
        'php',
        'sh',
        'svg',
        'gitignore'
      ])
      if (!TEXT_EXTS.has(ext)) return { ok: false as const, error: 'unsupported type' }
      try {
        const st = statSync(filePath)
        // F4：上限 512KB → 1MB（txt/md 预览；超限仍拒绝，防整本日志读入内存）
        if (st.size > 1024 * 1024) return { ok: false as const, error: 'file too large' }
        return { ok: true as const, content: readFileSync(filePath, 'utf-8') }
      } catch (err) {
        return { ok: false as const, error: sanitizeIpcMessage(err) }
      }
    },
    getByDateSection: () => {
      const photosByDate = photoStore.getPhotosByDateSection()
      const result: { dateSection: string; photos: Photo[] }[] = []
      for (const [dateSection, photos] of photosByDate.entries()) {
        result.push({ dateSection, photos })
      }
      return result.sort((a, b) => b.dateSection.localeCompare(a.dateSection))
    },
    getDateSections: () => photoStore.getDateSections(),
    add: (filePath: string, metadata?: { width?: number; height?: number }) => {
      const photo = photoStore.addPhoto(filePath, metadata)
      getAssetProcessing()?.enqueue(photo.id)
      return photo
    },
    addMultiple: (
      filePaths: string[],
      metadataMap?: Record<string, { width?: number; height?: number }>
    ) => {
      const map = metadataMap ? new Map(Object.entries(metadataMap)) : undefined
      const newPhotos = photoStore.addPhotos(filePaths, map)
      const processing = getAssetProcessing()
      for (const p of newPhotos) processing?.enqueue(p.id)
      return newPhotos
    },
    /** §2.A 拖拽/粘贴入库：与 addMultiple 同一管线（后台缩略图/EXIF）。
     *  拖入目录 = 镜像磁盘层级建夹（Eagle 口径），散装文件与镜像树的根都挂在
     *  parentId（当前文件夹视图）下面，null = 侧栏根级 */
    importPaths: async (filePaths: string[], parentId?: string | null): Promise<Photo[]> => {
      if (!Array.isArray(filePaths)) throw new Error('importPaths: filePaths 必须是数组')
      const under = resolveParentFolder(parentId)
      const deps = importDeps()
      const processing = getAssetProcessing()
      const files: string[] = []
      const mirrored: Photo[] = []
      for (const p of filePaths) {
        if (typeof p !== 'string' || !p) {
          console.warn(`[photos:importPaths] 忽略非法路径项:`, JSON.stringify(p))
          continue
        }
        let st
        try {
          st = await fsPromises.stat(p)
        } catch (err) {
          console.warn(`[photos:importPaths] 跳过不可达路径: ${p} (${(err as Error).message})`)
          continue
        }
        // bundle（.app/.framework/…）按「单个素材项」入库，绝不钻进包里把 Mach-O
        // 和 Info.plist 收成一堆素材——与 PhotoDataStore 的 isBundlePath 放行同源
        if (st.isFile() || (st.isDirectory() && isBundlePath(p))) {
          files.push(p)
        } else if (st.isDirectory()) {
          const r = await importDirectoryTree(p, under, deps)
          if (r.truncated) console.warn(`[photos:importPaths] 目录 ${p} 扫描达上限已截断`)
          mirrored.push(...r.photos)
        }
      }
      const loose = photoStore.addPhotos(files)
      for (const p of loose) processing?.enqueue(p.id)
      if (under && loose.length > 0) {
        photoStore.assignPhotosToFolder(
          under,
          loose.map((p) => p.id)
        )
      }
      return [...loose, ...mirrored]
    },
    /** §2.A ⌘V 粘贴：从系统剪贴板读取文件路径（Electron 44 剪贴板异步化+MIME 化：
     *  文件=uri-list，回退纯文本；旧 NSFilenamesPboardType/public.file-url 同步 API 已移除） */
    getClipboardFiles: async (): Promise<string[]> => {
      const out: string[] = []
      try {
        for (const item of await clipboard.read()) {
          if (!item.types.includes('text/uri-list')) continue
          const list = await ((await item.getType('text/uri-list')) as Blob).text()
          for (const line of list.split(/\r?\n/)) {
            const u = line.trim()
            if (!u.startsWith('file://')) continue
            try {
              const p = decodeURIComponent(new URL(u).pathname)
              // 必须是绝对路径：existsSync 会按 cwd 解析相对串（Finder 启动的 .app
              // cwd 是 /），于是剪贴板里一个 "Applications" 就能过闸，再被 importPaths
              // 当目录整棵导进来，绕开 photos:importFolderTree 的目录白名单
              if (p.includes('/') && isAbsolute(p) && existsSync(p)) out.push(p)
            } catch {
              /* 非法 URL 跳过 */
            }
          }
        }
      } catch {
        /* 非 macOS 或无文件时忽略 */
      }
      if (out.length === 0) {
        const txt = await clipboard.readText()
        if (txt) {
          for (const line of txt.split(/\r?\n/)) {
            const p = line.trim()
            // 同样只认绝对路径（纯文本回退最容易混进相对词）
            if (p && isAbsolute(p) && existsSync(p)) out.push(p)
          }
        }
      }
      return Array.from(new Set(out))
    },
    /** ⌘V 粘贴内存位图（截图/网页图，无磁盘路径）直接入库：
     *  渲染层把 blob 转 base64 传来，落盘库 clips/ 后走常规管线 */
    importBlob: async (payload: { mime?: string; base64: string }) => {
      const base64 = String(payload?.base64 ?? '')
      const MIME_EXT: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/bmp': 'bmp',
        'image/avif': 'avif'
      }
      const ext =
        MIME_EXT[
          String(payload?.mime ?? '')
            .split(';')[0]
            .trim()
        ] ?? 'png'
      // 上限先看 base64 长度再解码：否则一张超限图会先在内存里解出完整 Buffer
      if (base64.length > Math.ceil((32 * 1024 * 1024) / 3) * 4) {
        return { ok: false, error: '图像超过 32MB' }
      }
      const buf = Buffer.from(base64, 'base64')
      if (buf.length === 0) return { ok: false, error: '剪贴板里没有图像数据' }
      if (buf.length > 32 * 1024 * 1024) return { ok: false, error: '图像超过 32MB' }
      try {
        const dir = activeSubdir('clips')
        mkdirSync(dir, { recursive: true })
        // 一次粘贴可以带多个 blob：只到毫秒的时间戳会让第二个覆盖第一个，
        // 而 addPhoto 按 file_path 去重 → 界面报「导入 2 个」，库里其实只剩 1 个
        const outPath = uniqueFilePath(dir, `paste-${Date.now()}`, `.${ext}`)
        writeFileSync(outPath, buf)
        const photo = photoStore.addPhoto(outPath)
        getAssetProcessing()?.enqueue(photo.id)
        return { ok: true, photo }
      } catch (err) {
        return { ok: false, error: sanitizeIpcMessage(err) }
      }
    },
    // —— §3 L4 / §2.B 固定入口：未分类 / 最近添加 / 最近查看 ——
    getUnsorted: () => photoStore.getUnsortedPhotos(),
    getRecent: (limit?: number) => photoStore.getRecentPhotos(limit),
    getRecentViewed: (limit?: number) => photoStore.getRecentViewedPhotos(limit),
    setLastViewed: (id: string) => photoStore.setLastViewed(id),
    /** 侧栏固定项计数（全部/未标签/最近查看）：走 SQL 聚合，不吃分页窗口 */
    getSidebarCounts: () => photoStore.sidebarCounts(),
    /** §2.D 导出/打包：选目录后把选中素材拷贝出去 */
    exportSelected: async (photoIds: string[]): Promise<number> => {
      if (photoIds.length === 0) return 0
      const result = await dialog.showOpenDialog({
        title: '导出到…',
        properties: ['openDirectory', 'createDirectory']
      })
      const dir = result.filePaths?.[0]
      if (!dir) return 0
      const photos = photoStore.getPhotosByIds(photoIds)
      let n = 0
      for (const p of photos) {
        if (existsSync(p.filePath)) {
          try {
            // 重名不覆盖：自动追加序号（file (1).ext），防止覆盖用户目录里的既有文件
            copyFileSync(
              p.filePath,
              uniqueFilePath(dir, basename(p.fileName, extname(p.fileName)), extname(p.fileName))
            )
            n++
          } catch {
            /* 跳过不可读文件 */
          }
        }
      }
      return n
    },
    getById: (id: string) => photoStore.getPhotoById(id),
    getByPath: (filePath: string) => photoStore.getPhotoByPath(filePath),
    update: (id: string, updates: Partial<Photo>) => photoStore.updatePhoto(id, updates),
    delete: (id: string) => photoStore.deletePhoto(id),
    deleteMultiple: (ids: string[]) => photoStore.deletePhotos(ids),
    search: (query: string) => photoStore.searchPhotos(query),
    filterByTags: (tags: string[]) => photoStore.filterPhotosByTags(tags),
    getFavorites: () => photoStore.getFavoritePhotos(),
    toggleFavorite: (id: string) => photoStore.toggleFavorite(id),
    setRating: (id: string, rating: number) => photoStore.setRating(id, rating),
    setDescription: (id: string, description: string) => photoStore.setDescription(id, description),
    updatePhotos: (ids: string[], updates: Partial<Photo>) => photoStore.updatePhotos(ids, updates),
    addTag: (id: string, tag: string) => photoStore.addTag(id, tag),
    removeTag: (id: string, tag: string) => photoStore.removeTag(id, tag),
    addTagToMultiple: (ids: string[], tag: string) => photoStore.addTagToPhotos(ids, tag),
    removeTagFromMultiple: (ids: string[], tag: string) => photoStore.removeTagFromPhotos(ids, tag),
    getAllTags: () => photoStore.getAllTags(),
    getCount: () => photoStore.getPhotoCount(),
    // 阶段 4.5 统计面板
    getStats: () => photoStore.getStatsDetail(),
    // 全库清除需带确认计数（审查 P3-22）：渲染层传它展示给用户的真实总数，
    // 与库内实际总数比对一致才执行——渲染层 bug 把空集/窗口当全库时直接拒绝
    clearAll: (expectedTotal?: number) => {
      const actual = photoStore.getPhotoCount()
      if (typeof expectedTotal === 'number' && expectedTotal !== actual) {
        throw new Error(`clearAll 确认计数不符（预期 ${expectedTotal}，实际 ${actual}）`)
      }
      photoStore.clearAllPhotos()
      return true
    },

    // —— 分页化阶段 1（docs/PAGINATION_DESIGN.md §4）：语义参数进、SQL 片段不出 ——
    // 渲染层只声明「看哪个视图」，where/params 全部在这里构造（信任模型与 pathPolicy 一致）
    getPage: (req: {
      view: 'all' | 'trash' | 'favorites' | 'folder' | 'search'
      folderId?: string
      /** 全局搜索词（FTS5 + 标签名；阶段 3 全局语义） */
      query?: string
      /** LibrarySort id（imported/name/size/rating/modified/created/extension/dimensions/duration）或旧列名 */
      sort?: string
      desc?: boolean
      cursor?: string
      limit?: number
      /** 阶段 3：筛选维度语义 spec（渲染层不可传 SQL 片段） */
      filters?: SmartAlbumRules
    }) => {
      const params: unknown[] = []
      let where: string
      // LibrarySort id → PageSortCol（旧列名直通）
      const SORT_MAP: Record<string, PageSortCol> = {
        imported: 'imported_at',
        imported_at: 'imported_at',
        name: 'file_name',
        file_name: 'file_name',
        size: 'file_size',
        file_size: 'file_size',
        rating: 'rating',
        modified: 'modified',
        created: 'created',
        extension: 'extension',
        dimensions: 'dimensions',
        duration: 'duration',
        deleted_at: 'deleted_at'
      }
      let sort: PageSortCol = SORT_MAP[req.sort ?? 'imported_at'] ?? 'imported_at'
      switch (req.view) {
        case 'trash':
          // 排序固定 deleted_at DESC（与旧 getRecycleBinPhotos 行为一致）
          where = 'deleted_at IS NOT NULL'
          sort = 'deleted_at'
          break
        case 'favorites':
          where = 'deleted_at IS NULL AND is_favorite = 1'
          break
        case 'folder':
          if (!req.folderId) throw new Error('photos:getPage: folderId required')
          if (!photoFolderRepository.getById(req.folderId)) {
            throw new Error('photos:getPage: folder not found')
          }
          where = 'deleted_at IS NULL AND folder_id = ?'
          params.push(req.folderId)
          break
        case 'search':
          where = 'deleted_at IS NULL'
          break
        case 'all':
        default:
          where = 'deleted_at IS NULL'
      }
      // 阶段 3：筛选维度下推（语义 spec → WHERE；buildSmartAlbumWhere 扩展已覆盖全部维度）
      let filterWhere: CompiledWhere | null = null
      if (req.filters) {
        filterWhere = buildSmartAlbumWhere(req.filters)
      }
      const mergedWhere = filterWhere
        ? `${where}${filterWhere.whereSql.trim() ? ` AND (${filterWhere.whereSql})` : ''}`
        : where
      const mergedParams = filterWhere ? [...params, ...filterWhere.params] : params
      return photoRepository.getPhotosPage({
        where: mergedWhere,
        params: mergedParams,
        sort,
        desc: req.desc ?? true,
        cursor: req.cursor,
        limit: req.limit
      })
    },

    // —— 回收站 ——
    getRecycleBin: () => photoStore.getRecycleBinPhotos(),
    restoreMultiple: (ids: string[]) => photoStore.restorePhotos(ids),
    clearRecycleBin: () => {
      const purgedIds = photoStore.clearRecycleBin()
      const thumbs = getThumbnailService()
      for (const id of purgedIds) thumbs.remove(id)
      return purgedIds
    },

    // —— 智能收藏夹 ——
    listSmartAlbums: () => photoStore.listSmartAlbums(),
    createSmartAlbum: (name: string, rules: SmartAlbumRules, parentId?: string | null) =>
      photoStore.createSmartAlbum(name, rules, parentId),
    updateSmartAlbum: (id: string, updates: { name?: string; rules?: SmartAlbumRules; parentId?: string | null }) =>
      photoStore.updateSmartAlbum(id, updates),
    // M4：侧栏右键「移动到…」（环防护在 repo，中文错误经 IPC 直出渲染层 toast）
    moveSmartAlbum: (id: string, parentId: string | null) =>
      photoStore.moveSmartAlbum(id, parentId),
    deleteSmartAlbum: (id: string) => photoStore.deleteSmartAlbum(id),
    getSmartAlbumPhotos: (id: string) => photoStore.getSmartAlbumPhotos(id),
    // M4：scope 带「待定父级」时实时计数按「子级 AND 祖先链」口径
    queryPhotosByRules: (
      rules: SmartAlbumRules,
      scope?: { parentId?: string | null; excludeId?: string }
    ) => photoStore.queryPhotosByRules(rules, scope),

    // —— 以图搜图 / 相似查重（二期） ——
    findSimilar: (photoId: string, threshold?: number) =>
      photoStore.findSimilarPhotos(photoId, threshold),
    // F15：CLIP 视觉相似（AI 不可用/未建索引时返回空，调用方回退 pHash）
    findSimilarVisual: async (photoId: string, limit?: number) => {
      if (!isAiAvailable()) return []
      try {
        return await getEmbeddingService().findSimilarVisual(photoId, limit)
      } catch {
        return []
      }
    },
    getDuplicateGroups: (
      threshold?: number,
      opts?: { mode?: 'phash' | 'hash'; photoIds?: string[] }
    ) => photoStore.getDuplicatePhotoGroups(threshold, opts),

    // —— AI 语义搜索 / 自动打标（三期） ——
    aiAvailable: () => isAiAvailable(),
    semanticSearch: async (query: string, limit?: number) => {
      const svc = getEmbeddingService()
      const matches = await svc.semanticSearch(query, limit ?? 100)
      const out: Array<{ photo: Photo; score: number }> = []
      for (const m of matches) {
        const photo = photoStore.getPhotoById(m.photoId)
        if (photo) out.push({ photo, score: m.score })
      }
      return out
    },
    embeddingStatus: () => {
      const svc = getEmbeddingService()
      const total = photoStore.getPhotoCount()
      const indexed = svc.indexedCount()
      return { total, indexed, pending: svc.pendingCount, available: isAiAvailable() }
    },
    embeddingIndexAll: async () => {
      const svc = getEmbeddingService()
      svc.notify = (p: EmbeddingProgress) =>
        getMainWindow()?.webContents.send('photos:embedding', p)
      return svc.indexMissingPhotos(() =>
        photoStore
          .getPhotos()
          .map((p) => ({ id: p.id, filePath: p.filePath, thumbStatus: p.thumbStatus }))
      )
    },
    suggestTags: (photoId: string) => getEmbeddingService().suggestTags(photoId),
    // 阶段 5.3：描述建议 + 全库自动打标（缺标签且已有向量的素材，进度经 photos:embedding 推送）
    suggestDescription: (photoId: string) => getEmbeddingService().suggestDescription(photoId),
    // AI 动作扩展：命名建议（top 标签 + 原名）
    suggestName: (photoId: string) => getEmbeddingService().suggestName(photoId),
    autoTagLibrary: async () => {
      const svc = getEmbeddingService()
      svc.notify = (p: EmbeddingProgress) =>
        getMainWindow()?.webContents.send('photos:embedding', p)
      return svc.autoTagLibrary(photoStore.getPhotos().map((p) => ({ id: p.id, tags: p.tags })))
    },

    // —— F18：ZIP 内容浏览（不解压入库，按需提取 ≤10MB 图片/文本项预览） ——
    listZipEntries: async (id: string) => {
      const photo = photoStore.getPhotoById(id)
      if (!photo || !/\.zip$/i.test(photo.fileName))
        return { ok: false, error: 'not a zip', entries: [] }
      try {
        return { ok: true, entries: await listZipEntries(photo.filePath) }
      } catch (err) {
        return { ok: false, error: sanitizeIpcMessage(err), entries: [] }
      }
    },
    extractZipEntry: async (id: string, entryName: string) => {
      const photo = photoStore.getPhotoById(id)
      if (!photo || !/\.zip$/i.test(photo.fileName)) return { ok: false, error: 'not a zip' }
      try {
        const r = await extractZipEntryDataUrl(photo.filePath, String(entryName))
        if (!r) return { ok: false, error: 'unsupported or too large' }
        return { ok: true, ...r }
      } catch (err) {
        return { ok: false, error: sanitizeIpcMessage(err) }
      }
    },

    // —— F12：OCR 文字识别 ——
    ocrStatus: () => {
      const s = ocrService.status()
      return {
        ...s,
        pendingTotal: photoStore
          .getPhotos()
          .filter(
            (p) => p.kind === 'image' && p.thumbStatus === 1 && !p.ocrText && p.ocrText !== ''
          ).length
      }
    },
    setOcrEnabled: (on: boolean) => {
      ocrService.setEnabled(Boolean(on))
      return ocrService.status()
    },
    runOcr: () => ({ queued: ocrService.runPending() }),

    // —— 文档正文抽取（officeparser，D 轴「可检索」）——
    docTextStatus: () => ({
      ...docTextService.status(),
      pendingTotal: photoRepository.countDocTextPending()
    }),
    setDocTextEnabled: (on: boolean) => {
      docTextService.setEnabled(Boolean(on))
      return {
        ...docTextService.status(),
        pendingTotal: photoRepository.countDocTextPending()
      }
    },
    runDocText: () => ({ queued: docTextService.runPending() }),

    // —— 手动文件夹分组（五期） ——
    listPhotoFolders: () => photoStore.listFoldersSafe(),
    setFolderDescription: (folderId: string, description: string): void => {
      photoFolderRepository.setDescription(folderId, description.trim() || null)
    },
    // 十二轮：文件夹独立视图设置（m005，null=跟随全局）
    setFolderViewSettings: (
      folderId: string,
      settings: { layout: string | null; sort: string | null; display: string | null }
    ): void => {
      photoFolderRepository.setViewSettings(folderId, settings)
    },
    // 十五轮 D19：文件夹颜色（null=恢复自动色）
    setFolderColor: (folderId: string, hex: string | null): void => {
      photoFolderRepository.setColor(folderId, hex)
    },
    createPhotoFolder: (name: string, parentId?: string | null) =>
      photoStore.createPhotoFolder(name, parentId),
    renamePhotoFolder: (id: string, name: string) => photoStore.renamePhotoFolder(id, name),
    deletePhotoFolder: (id: string) => photoStore.deletePhotoFolder(id),
    // 二十四轮（Eagle 右键「移动文件夹」）：改父级，null=根级，含防环校验
    movePhotoFolder: (id: string, parentId: string | null): void =>
      photoStore.movePhotoFolder(id, parentId),
    // 二十四轮（Eagle 右键「文件夹图标」）：emoji 图标
    setFolderIcon: (id: string, icon: string | null): void => photoStore.setFolderIcon(id, icon),
    // 二十四轮（Eagle 右键「设置自动标签」）
    getFolderAutoTags: (id: string): string[] => photoStore.getFolderAutoTags(id),
    setFolderAutoTags: (id: string, tags: string[]): void => photoStore.setFolderAutoTags(id, tags),
    // F10：自由网格摆放（Eagle 自由网格，逐文件夹画布坐标）
    getFreeformPositions: (folderId: string) => photoStore.getFreeformPositions(folderId),
    setFreeformPositions: (
      folderId: string,
      items: Array<{ photoId: string; x: number; y: number; scale: number }>
    ): void => photoStore.setFreeformPositions(folderId, items),
    /** D-012 二轮 R4：文件夹密码保护（safeStorage 加密存 photo_folders.password） */
    setFolderPassword: (folderId: string, password: string, oldPassword?: string): void =>
      setFolderPasswordSvc(folderId, password, oldPassword),
    removeFolderPassword: (folderId: string, password: string): boolean =>
      removeFolderPasswordSvc(folderId, password),
    verifyFolderPassword: (folderId: string, password: string): boolean =>
      verifyFolderPasswordSvc(folderId, password),
    folderHasPassword: (folderId: string): boolean => folderHasPasswordSvc(folderId),
    setFolderCover: (folderId: string, photoId: string | null): void => {
      photoFolderRepository.setCover(folderId, photoId)
    },
    assignPhotosToFolder: (folderId: string | null, photoIds: string[]) =>
      photoStore.assignPhotosToFolder(folderId, photoIds),
    getFolderPhotos: (folderId: string) => photoStore.getFolderPhotos(folderId),

    // —— 批量操作（五期） ——
    renamePhotos: (
      items: Array<{ id: string; pattern?: string; start?: number; name?: string }>
    ) => {
      // {library} token 的取值来源：库名在注册表（photo 库 DB 里没有），求值前取好。
      // 注册表异常时按缺库处理（{library} 展开空串），不让改名被卡死
      let libraryName: string | undefined
      try {
        libraryName = getActiveLibrary().name
      } catch {
        /* 注册表为空/损坏：走缺省 */
      }
      return photoStore.renamePhotos(items, { libraryName })
    },
    // D-012：右键「复制文件」（macOS NSFilenamesPboardType，Finder 可直接粘贴）
    copyToClipboard: async (filePaths: string[]): Promise<boolean> => {
      if (!Array.isArray(filePaths) || filePaths.length === 0) return false
      const paths = filePaths.filter((p) => typeof p === 'string' && existsSync(p))
      if (paths.length === 0) return false
      // NSFilenamesPboardType 随 Electron 44 同步剪贴板 API 移除：改写 uri-list
      // （平台侧映射文件 URL 语义）+ 纯文本双份，路径不丢；Finder 能否直接当文件
      // 粘贴取决于平台映射，纯文本兜底保证路径始终可取
      await clipboard.write([
        new ClipboardItem({
          'text/uri-list': paths.map((p) => pathToFileURL(p).href).join('\n'),
          'text/plain': paths.join('\n')
        })
      ])
      return true
    },
    convertPhotosToWebP: async (ids: string[]) => {
      const count = await photoStore.convertPhotosToWebP(ids)
      return { count }
    },
    // 右键「重新抓取封面」（视频/GIF）：ffmpeg 重抽帧 → 重建 256/1024 缩略图
    reextractVideoCover: async (ids: string[]) => {
      const thumbs = getThumbnailService()
      const { extractVideoFrame } = await import('../services/AssetProcessingService')
      let ok = 0
      for (const id of ids) {
        try {
          const p = photoStore.getPhotoById(id)
          if (!p || !existsSync(p.filePath)) continue
          const isGif = p.fileName.toLowerCase().endsWith('.gif')
          if (p.kind !== 'video' && !isGif) continue
          const tmpFrame = join(tmpdir(), `leaf-cover_${id}_${Date.now()}.png`)
          try {
            await extractVideoFrame(p.filePath, tmpFrame)
            await thumbs.rasterize(tmpFrame, thumbs.pathFor(id, 256), 256)
            await thumbs.rasterize(tmpFrame, thumbs.pathFor(id, 1024), 1024)
            photoRepository.setThumbStatus(id, 1)
            ok += 1
          } finally {
            rmSync(tmpFrame, { force: true })
          }
        } catch {
          // 单个失败继续下一个
        }
      }
      return { ok }
    },
    // 右键「拷贝当前画面」（视频/GIF）：ffmpeg 抽帧 → 写剪贴板
    copyVideoFrame: async (id: string) => {
      const p = photoStore.getPhotoById(id)
      if (!p || !existsSync(p.filePath)) return { ok: false, error: '素材不存在' }
      const isGif = p.fileName.toLowerCase().endsWith('.gif')
      if (p.kind !== 'video' && !isGif) return { ok: false, error: '仅视频/GIF 支持画面拷贝' }
      const { extractVideoFrame } = await import('../services/AssetProcessingService')
      const tmpFrame = join(tmpdir(), `leaf-frame_${id}_${Date.now()}.png`)
      try {
        await extractVideoFrame(p.filePath, tmpFrame)
        await clipboard.write([
          new ClipboardItem({
            'image/png': new Blob([new Uint8Array(readFileSync(tmpFrame))], { type: 'image/png' })
          })
        ])
        return { ok: true }
      } finally {
        rmSync(tmpFrame, { force: true })
      }
    },
    // 右键「保存当前画面」（视频/GIF）：抽帧 → 落盘 → 入库为新素材
    saveVideoFrame: async (id: string) => {
      const p = photoStore.getPhotoById(id)
      if (!p || !existsSync(p.filePath)) return { ok: false, error: '素材不存在' }
      const isGif = p.fileName.toLowerCase().endsWith('.gif')
      if (p.kind !== 'video' && !isGif) return { ok: false, error: '仅视频/GIF 支持画面保存' }
      const { extractVideoFrame } = await import('../services/AssetProcessingService')
      const tmpFrame = join(tmpdir(), `leaf-frame_${id}_${Date.now()}.png`)
      try {
        await extractVideoFrame(p.filePath, tmpFrame)
        const dir = join(getActiveLibrary().path, 'screenshots')
        mkdirSync(dir, { recursive: true })
        const outPath = join(dir, `${screenshotFileName()} 画面.png`)
        copyFileSync(tmpFrame, outPath)
        const photo = photoStore.addPhoto(outPath)
        getAssetProcessing()?.enqueue(photo.id)
        return { ok: true, photoId: photo.id, filePath: outPath }
      } finally {
        rmSync(tmpFrame, { force: true })
      }
    },
    // 右键「创建拼图」：2-9 张图片网格合成一张并入库
    createCollage: async (ids: string[]) => {
      const sharp = (await import('sharp')).default
      const picked = ids
        .map((id) => photoStore.getPhotoById(id))
        .filter((p): p is NonNullable<ReturnType<typeof photoStore.getPhotoById>> => {
          return !!p && p.kind === 'image' && existsSync(p.filePath)
        })
      if (picked.length < 2) return { ok: false, error: '至少需要 2 张图片' }
      if (picked.length > 9) return { ok: false, error: '最多 9 张图片' }
      const cols = picked.length === 2 ? 2 : picked.length <= 4 ? 2 : 3
      const rows = Math.ceil(picked.length / cols)
      const cell = 800
      const composites: Array<{ input: Buffer; left: number; top: number }> = []
      for (let i = 0; i < picked.length; i++) {
        const col = i % cols
        const row = Math.floor(i / cols)
        const buf = await sharp(picked[i]!.filePath)
          .resize(cell, cell, { fit: 'cover' })
          .png()
          .toBuffer()
        composites.push({ input: buf, left: col * cell, top: row * cell })
      }
      const dir = join(getActiveLibrary().path, 'collage')
      mkdirSync(dir, { recursive: true })
      const outPath = join(dir, `${screenshotFileName()} 拼图.png`)
      await sharp({
        create: { width: cols * cell, height: rows * cell, channels: 3, background: '#ffffff' }
      })
        .composite(composites)
        .png()
        .toFile(outPath)
      const photo = photoStore.addPhoto(outPath)
      getAssetProcessing()?.enqueue(photo.id)
      return { ok: true, photoId: photo.id, filePath: outPath }
    },
    // 右键「刷新缩略图 / 重新分析颜色」：强制重建缩略图与/或重算主色板
    reanalyzeAssets: async (ids: string[], opts?: { thumbs?: boolean; palette?: boolean }) => {
      const thumbs = getThumbnailService()
      const { extractPalette } = await import('../services/AssetProcessingService')
      let ok = 0
      const failed: string[] = []
      for (const id of ids) {
        try {
          const p = photoStore.getPhotoById(id)
          if (!p || !existsSync(p.filePath)) continue
          if (p.kind !== 'image' && p.kind !== 'video') continue
          if (opts?.thumbs !== false) {
            thumbs.remove(id)
            await thumbs.ensure(id, p.filePath)
          }
          if (opts?.palette !== false) {
            const thumbPath = thumbs.getCachedPath(id, 256)
            if (thumbPath) {
              const palette = await extractPalette(thumbPath)
              photoRepository.updateBackfilledPalette(id, palette)
            }
          }
          ok += 1
        } catch {
          failed.push(id)
        }
      }
      return { ok, failed }
    },
    // F3：批量格式转换（webp/png/jpg/avif + 质量/最大宽度），产物入库为新素材
    convertPhotos: async (
      ids: string[],
      opts: { format: 'webp' | 'png' | 'jpg' | 'avif'; quality?: number; maxWidth?: number }
    ) => {
      const count = await photoStore.convertPhotos(ids, opts)
      return { count }
    },

    // —— D-012 二轮 R2/R5 ——
    /** 复制文本到系统剪贴板（复制文件路径/标题/标签共用） */
    copyText: async (text: string): Promise<boolean> => {
      await clipboard.writeText(String(text ?? ''))
      return true
    },
    /** 读取系统剪贴板文本（粘贴标签用） */
    getClipboardText: async (): Promise<string> => clipboard.readText(),
    // ④-3（Eagle 4 复制菜单扩展）：复制缩略图位图到剪贴板
    copyThumbToClipboard: async (id: string): Promise<boolean> => {
      const photo = photoStore.getPhotoById(id)
      if (!photo) return false
      const p = getThumbnailService().getCachedPath(id, 256)
      if (!p) return false
      const png = readFileSync(p)
      if (png.length === 0) return false
      await clipboard.write([
        new ClipboardItem({
          'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' })
        })
      ])
      return true
    },
    // ④-3：复制原文件 Base64（5MB 上限，防剪贴板爆炸）
    copyBase64: async (id: string): Promise<{ ok: boolean; error?: string }> => {
      const photo = photoStore.getPhotoById(id)
      if (!photo) return { ok: false, error: '素材不存在' }
      if (photo.fileSize > 5 * 1024 * 1024) return { ok: false, error: '文件超过 5MB' }
      // 文本类素材拒绝 Base64 外传（审查 P2-3）：配合「导入任意路径」能力会构成
      // 任意文件内容回传原语；文本内容走有白名单的 readTextFile
      {
        const ext = (photo.filePath.split('.').pop() ?? '').toLowerCase()
        const TEXT_LIKE = new Set([
          'txt',
          'md',
          'markdown',
          'json',
          'log',
          'css',
          'scss',
          'less',
          'html',
          'htm',
          'xml',
          'yaml',
          'yml',
          'toml',
          'csv',
          'tsv',
          'ini',
          'conf',
          'cfg',
          'sh',
          'bash',
          'zsh',
          'fish',
          'bat',
          'cmd',
          'ps1',
          'py',
          'rb',
          'pl',
          'php',
          'js',
          'mjs',
          'cjs',
          'ts',
          'tsx',
          'jsx',
          'java',
          'kt',
          'swift',
          'go',
          'rs',
          'c',
          'h',
          'cpp',
          'hpp',
          'cs',
          'sql',
          'env',
          'pem',
          'key',
          'pub',
          'gitignore',
          'gitconfig',
          'bashrc',
          'zshrc',
          'profile',
          'htaccess',
          'plist',
          'desktop',
          'service',
          'lock'
        ])
        if (TEXT_LIKE.has(ext) || ext === 'ssh' || photo.filePath.includes('/.ssh/')) {
          return { ok: false, error: '文本/敏感类文件不允许以 Base64 复制' }
        }
      }
      try {
        await clipboard.writeText(readFileSync(photo.filePath).toString('base64'))
        return { ok: true }
      } catch (err) {
        return { ok: false, error: sanitizeIpcMessage(err) }
      }
    },
    // 右键「反向图搜」（对标 Eagle find > reverse）：搜索引擎只认 URL/上传，
    // 所以位图复制进系统剪贴板 + 打开引擎页，用户在页面里 ⌘V 粘贴。
    // 路径只按 id 从库里反查（渲染层传不进任意路径，与 openWithDefault 同一信任模型）；
    // 非图片/文件缺失返回 { ok:false }，异常路径走 registerPrefixedHandlers 的统一脱敏通道。
    reverseImageSearch: async (payload: { id?: unknown; engineId?: unknown }) => {
      const engine = getReverseSearchEngine(payload?.engineId)
      if (!engine) return { ok: false as const, error: '未知的搜索引擎' }
      const photo = photoStore.getPhotoById(String(payload?.id ?? ''))
      if (!photo || photo.kind !== 'image') {
        return { ok: false as const, error: '素材不存在或不是位图' }
      }
      if (!existsSync(photo.filePath)) {
        return { ok: false as const, error: '文件不存在或已被移动' }
      }
      // 原图可能是任意位图格式，统一转 PNG 再进剪贴板（Electron 44 走 MIME）
      let png: Buffer
      try {
        const sharp = (await import('sharp')).default
        png = await sharp(photo.filePath).png().toBuffer()
      } catch {
        // SVG 等矢量 kind 也归 image，但解不出位图，这里兜住
        return { ok: false as const, error: '图片不可读（矢量或已损坏）' }
      }
      await clipboard.write([
        new ClipboardItem({
          'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' })
        })
      ])
      openReverseSearchEngine(engine.id, (url) => void shell.openExternal(url))
      return { ok: true as const, engine: engine.name }
    },
    /** 在默认应用中打开原文件（仅限已入库素材路径） */
    openWithDefault: (filePath: string): boolean => {
      if (
        typeof filePath === 'string' &&
        existsSync(filePath) &&
        photoStore.getPhotoByPath(filePath)
      ) {
        void shell.openPath(filePath)
        return true
      }
      return false
    },
    /** 创建副本（D-020）：新文件落**库内** images/。
     *  旧实现是同目录写一个「xx 副本.ext」——引用式入库的素材，那个目录就是用户自己的，
     *  等于往他的文件夹里造文件；而且它走 addPhoto（绕过拷贝），新行又指着用户目录。*/
    duplicate: (id: string) => {
      const src = photoStore.getPhotoById(id)
      if (!src || !existsSync(src.filePath)) throw new Error('源文件不存在')
      const ext = extname(src.filePath)
      const base = src.fileName.slice(0, src.fileName.length - ext.length)
      const target = photoStore.copyIntoLibrary(src.filePath, `${base} 副本${ext}`)
      if (!target) throw new Error('拷贝入资源库失败（磁盘空间或权限？）')
      const added = photoStore.addPhotos([target])
      const processing = getAssetProcessing()
      for (const p of added) processing?.enqueue(p.id)
      const out = added[0]
      if (!out) throw new Error('副本入库失败')
      return out
    },
    /**
     * round20：替换文件（保留标签/评分/描述/文件夹等所有元数据）。
     * D-020 起的形状：新字节拷进库（images/YYMM），旧文件**只有落在库内才删**。
     * 旧实现是「复制到旧目录 + 无条件 unlink 旧文件」，而引用式入库的素材
     * file_path 就是用户散在自己磁盘上的原件——那等于把用户自己的文件删了。
     */
    replaceFile: async (id: string): Promise<{ ok: boolean; error?: string; photo?: unknown }> => {
      const src = photoStore.getPhotoById(id)
      if (!src) return { ok: false, error: '素材不存在' }
      const win = getMainWindow()
      const result = await showOpenDialogFor(win, {
        title: '选择替换文件',
        properties: ['openFile'],
        message: '选择新文件以替换当前素材（标签和分类将保留）'
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, error: '已取消' }
      }
      const newPath = result.filePaths[0]
      if (!existsSync(newPath)) return { ok: false, error: '文件不存在' }
      try {
        const oldPath = src.filePath
        const target = photoStore.copyIntoLibrary(newPath)
        if (!target) return { ok: false, error: '拷贝入资源库失败（磁盘空间或权限？）' }
        const st = statSync(target)
        const updated = photoStore.replaceFile(id, {
          filePath: target,
          fileName: basename(target),
          fileSize: st.size,
          kind: src.kind
        })
        // 库内的旧副本让位给新的；库外原件一律不碰
        if (photoStore.isInsideLibrary(oldPath) && oldPath !== target && existsSync(oldPath)) {
          try {
            unlinkSync(oldPath)
          } catch {
            /* 忽略删除失败 */
          }
        }
        // 清除旧缩略图缓存并触发处理管线重建
        const thumb = getThumbnailService()
        thumb?.remove(id)
        const processing = getAssetProcessing()
        processing?.enqueue(id)
        return { ok: true, photo: updated }
      } catch (err) {
        return { ok: false, error: sanitizeIpcMessage(err) }
      }
    },
    /** 置顶/取消置顶（004，视图内置顶优先） */
    setPinned: (id: string, pinned: boolean) => photoRepository.setPinned(id, pinned),
    /** 导出文件夹内全部素材到所选目录（R4 导出文件夹） */
    exportFolder: async (folderId: string): Promise<number> => {
      const photos = photoStore.getFolderPhotos(folderId)
      if (photos.length === 0) return 0
      const result = await dialog.showOpenDialog({
        title: '导出文件夹到…',
        properties: ['openDirectory', 'createDirectory']
      })
      const dir = result.filePaths?.[0]
      if (!dir) return 0
      let n = 0
      for (const p of photos) {
        if (existsSync(p.filePath)) {
          try {
            // 重名不覆盖：自动追加序号（file (1).ext），防止覆盖用户目录里的既有文件
            copyFileSync(
              p.filePath,
              uniqueFilePath(dir, basename(p.fileName, extname(p.fileName)), extname(p.fileName))
            )
            n++
          } catch {
            /* 跳过不可读文件 */
          }
        }
      }
      return n
    },
    /**
     * round20：导出选中素材的元数据为 CSV（UTF-8 BOM，Excel 中文兼容）。
     * 列：文件名、标签、评分、描述、注释、来源URL、格式、尺寸、文件大小、添加日期、文件夹
     */
    exportCsv: async (
      photoIds: string[]
    ): Promise<{ ok: boolean; error?: string; count?: number }> => {
      if (photoIds.length === 0) return { ok: false, error: '没有选中素材' }
      const photos = photoIds
        .map((id) => photoStore.getPhotoById(id))
        .filter((p): p is NonNullable<typeof p> => !!p)
      if (photos.length === 0) return { ok: false, error: '素材不存在' }
      const win = getMainWindow()
      const result = await showSaveDialogFor(win, {
        title: '导出 CSV',
        defaultPath: 'leaf-export.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
      if (result.canceled || !result.filePath) return { ok: false, error: '已取消' }
      try {
        const escape = (v: string): string => {
          if (v.includes(',') || v.includes('"') || v.includes('\n')) {
            return '"' + v.replace(/"/g, '""') + '"'
          }
          return v
        }
        const fmtDate = (ts?: number): string =>
          ts ? new Date(ts).toISOString().slice(0, 19).replace('T', ' ') : ''
        const folderName = (folderId?: string): string => {
          if (!folderId) return '未分类'
          const f = photoFolderRepository.getById(folderId)
          return f?.name ?? folderId
        }
        const header = [
          '文件名',
          '标签',
          '评分',
          '描述',
          '来源URL',
          '格式',
          '尺寸',
          '文件大小(字节)',
          '添加日期',
          '文件夹'
        ]
        const rows = photos.map((p) => {
          const ext = p.fileName.includes('.') ? (p.fileName.split('.').pop() ?? '') : ''
          const dims = p.width && p.height ? `${p.width}x${p.height}` : ''
          return [
            escape(p.fileName),
            escape(p.tags.join('; ')),
            String(p.rating),
            escape(p.description ?? ''),
            escape(p.sourceUrl ?? ''),
            ext,
            dims,
            String(p.fileSize),
            fmtDate(p.importedAt),
            escape(folderName(p.folderId))
          ].join(',')
        })
        // UTF-8 BOM + 表头 + 数据行
        const csv = '\uFEFF' + header.join(',') + '\n' + rows.join('\n') + '\n'
        writeFileSync(result.filePath, csv, 'utf-8')
        return { ok: true, count: photos.length }
      } catch (err) {
        return { ok: false, error: sanitizeIpcMessage(err) }
      }
    },

    // —— 字体元数据（fontkit 读 name 表）——
    fontInfo: (
      filePath: string
    ): { familyName: string; subfamilyName: string; fullName: string } | null => {
      // 仅允许已入库素材路径（与 readTextFile 同一约束），防任意文件解析。
      // 含软删行：回收站里的字体也要能看名字（21:22 产物原本就是 IncludingDeleted）
      if (!photoStore.getPhotoByPathIncludingDeleted(filePath)) return null
      try {
        const opened = fontkit.openSync(filePath)
        // .ttc 集合取第一个字体
        const font = 'fonts' in opened ? opened.fonts[0] : opened
        if (!font?.familyName) return null
        return {
          familyName: font.familyName,
          subfamilyName: font.subfamilyName ?? '',
          fullName: font.fullName ?? font.familyName
        }
      } catch (err) {
        console.error('[photos:fontInfo] parse failed:', filePath, err)
        return null
      }
    },
    /** 字形覆盖检查（Eagle「已安装/未安装」那一档的本地半区）：
     *  不走「渲染再量像素」那套：Chromium 按**字符**做字体回退，
     *  缺字形的字符会被系统里别的字体画出来，像素永远有墨——实测 Arial 的 2000 个
     *  常用汉字只报「缺 1 字」，检测形同虚设。 */
    fontGlyphs: (filePath: string, codePoints: number[]) => {
      if (typeof filePath !== 'string' || !photoStore.getPhotoByPathIncludingDeleted(filePath)) {
        return { ok: false as const, error: '素材未入库' }
      }
      if (
        !Array.isArray(codePoints) ||
        codePoints.length === 0 ||
        codePoints.length > 8192 ||
        !codePoints.every((cp) => Number.isInteger(cp) && cp >= 0 && cp <= 1114111)
      ) {
        return { ok: false as const, error: 'codePoints 需为 1-8192 个合法码点' }
      }
      try {
        const opened = fontkit.openSync(filePath)
        const font = 'fonts' in opened ? opened.fonts[0] : opened
        if (!font || typeof font.hasGlyphForCodePoint !== 'function') {
          return { ok: false as const, error: '该字体没有可查的 cmap' }
        }
        const missing = codePoints.filter((cp) => !font.hasGlyphForCodePoint(cp))
        return { ok: true as const, missing }
      } catch (err) {
        return { ok: false as const, error: sanitizeIpcMessage(err) }
      }
    }
  })

  // 选择文件夹
  ipcMain.handle('photos:selectFolder', async () => {
    const win = getMainWindow()
    const options: OpenDialogOptions = {
      properties: ['openDirectory']
    }
    const result = await showOpenDialogFor(win, options)
    if (result.canceled) {
      return []
    }
    // 登记进目录扫描白名单：后续 importFolderTree / watched:add 只放行
    // 用户在对话框里选过的目录（审查 P2-2）
    for (const dir of result.filePaths) grantScanDir(dir)
    return result.filePaths
  })

  // 选择多个图片文件
  ipcMain.handle('photos:selectFiles', async () => {
    const win = getMainWindow()
    const options: OpenDialogOptions = {
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Images',
          extensions: [
            'jpg',
            'jpeg',
            'png',
            'gif',
            'bmp',
            'webp',
            'svg',
            'heic',
            'heif',
            'avif',
            'psd',
            'ai',
            'tif',
            'tiff',
            'pdf',
            'mp4',
            'mov',
            'webm',
            'm4v',
            'mkv',
            'avi',
            'mp3',
            'wav',
            'aac',
            'flac',
            'm4a',
            'ogg',
            'ttf',
            'otf',
            'woff',
            'woff2',
            'ttc'
          ]
        }
      ]
    }
    const result = await showOpenDialogFor(win, options)
    if (result.canceled) {
      return []
    }
    return result.filePaths
  })

  /** 「导入文件夹」：镜像磁盘层级建夹入库（Eagle 口径）。
   *  目录白名单：只放行用户对话框选过的目录 / userData / 已登记库根 */
  ipcMain.handle(
    'photos:importFolderTree',
    async (_event, folderPath: string, parentId?: string | null) => {
      if (typeof folderPath !== 'string' || !folderPath || !isScanDirAllowed(folderPath)) {
        throw new Error('目录不在允许扫描的白名单内（请通过「选择文件夹」对话框选取）')
      }
      const r = await importDirectoryTree(folderPath, resolveParentFolder(parentId), importDeps())
      if (r.truncated) {
        console.warn(
          `[photos:importFolderTree] 扫描达到上限 ${FOLDER_SCAN_LIMIT}，已截断（目录可能远大于此）`
        )
      }
      if (r.failedDirs > 0) {
        console.warn(`[photos:importFolderTree] ${r.failedDirs} 个子目录读取失败（可能未授权）`)
      }
      return {
        photos: r.photos,
        folders: r.folders,
        truncated: r.truncated,
        fileCount: r.fileCount
      }
    }
  )
}
