import type { UpdateEvent, UpdateStatus } from '../renderer/src/types/update'
import type { SmartAlbumRules } from '@shared/smartAlbumRules'
import type { VectorStatus } from '@shared/vectorTypes'
import type { AnnotationInput, PhotoAnnotation } from '@shared/annotations'
import type {
  WallpaperAssessResult,
  WallpaperSetOptions,
  WallpaperSetResult
} from '@shared/wallpaper'

export interface Tag {
  id: string
  name: string
  color?: string | null
  /** 六期标签分组：父标签 id（null=顶层） */
  parentId?: string | null
  usageCount?: number
  createdAt: number
}

/** 写入类通道统一回全量列表（省掉"写完再拉一次"的竞态） */
export interface AnnotationWriteResult {
  ok: boolean
  id?: string
  error?: string
  items?: PhotoAnnotation[]
}

export interface API {
  /** 二十四轮：Electron 32+ 移除 File.path，拖拽导入经 webUtils 换取磁盘路径 */
  getPathForFile: (file: File) => string
  /** 设为桌面壁纸：主进程按目标屏适配（cover / 模糊底 / 原图）后设置 */
  setWallpaper: (
    filePath: string,
    screen?: 'all' | 'main' | number,
    options?: WallpaperSetOptions
  ) => Promise<WallpaperSetResult>
  /** 壁纸适配预检：每台屏一份判定结果，不改桌面也不写缓存 */
  assessWallpaper: (filePath: string) => Promise<WallpaperAssessResult>
  libraries: {
    list: () => Promise<{
      activeId: string
      libraries: Array<{
        id: string
        name: string
        path: string
        legacy: boolean
        active: boolean
        createdAt: number
        lastOpenedAt: number
      }>
    }>
    create: (name: string) => Promise<{ id: string; name: string; path: string }>
    rename: (id: string, name: string) => Promise<boolean>
    unregister: (id: string) => Promise<boolean>
    switchTo: (id: string) => Promise<void>
    mergeFrom: (sourceId: string) => Promise<{
      photosAdded: number
      photosSkipped: number
      tagsAdded: number
    }>
    moveTo: (
      targetLibraryId: string,
      photoIds: string[]
    ) => Promise<{
      moved: number
      skipped: number
    }>
  }
  /** 阶段 5.1 插件系统 */
  plugins: {
    list: () => Promise<
      Array<{
        id: string
        name: string
        version: string
        category: 'inspector' | 'format' | 'window' | 'development'
        entry: string
        formats: string[]
        dir: string
      }>
    >
    getExtraDir: () => Promise<string>
    setExtraDir: (dir: string) => Promise<unknown>
    pickExtraDir: () => Promise<unknown>
    readAsset: (
      pluginId: string,
      relativePath: string
    ) => Promise<{ ok: true; content: string } | { ok: false; error: string }>
    listBuiltin: () => Promise<
      Array<{
        id: string
        name: string
        version: string
        category: 'inspector' | 'format' | 'window' | 'development'
        entry: string
        formats: string[]
        dir: string
      }>
    >
    installBuiltin: (id: string) => Promise<{ ok: boolean; error?: string }>
  }
  /** 阶段 4.4 监控文件夹自动导入 */
  watchedFolders: {
    list: () => Promise<string[]>
    add: (folder: string) => Promise<string[]>
    remove: (folder: string) => Promise<string[]>
    setEnabled: (on: boolean) => Promise<boolean>
  }
  /** F16：库定时备份 */
  backup: {
    getConfig: () => Promise<{
      enabled: boolean
      intervalDays: number
      keep: number
      lastAt: number | null
      dir: string
    }>
    setConfig: (patch: { enabled?: boolean; intervalDays?: number; keep?: number }) => Promise<{
      enabled: boolean
      intervalDays: number
      keep: number
      lastAt: number | null
      dir: string
    }>
    runNow: () => Promise<{ ok: boolean; file?: string; error?: string }>
    openDir: () => Promise<boolean>
  }
  /** F8：剪贴板常驻监听自动导入 */
  clipboardWatch: {
    getEnabled: () => Promise<boolean>
    setEnabled: (on: boolean) => Promise<boolean>
  }
  /** F11：库存储模式 / 断链 / 迁移 */
  storage: {
    scanMissing: () => Promise<{
      ok: boolean
      missing?: number
      restored?: number
      scanned?: number
      error?: string
    }>
    relinkPhoto: (id: string) => Promise<{ ok: boolean; photo?: unknown; error?: string }>
    migrateIntoLibrary: (dryRun: boolean) => Promise<{
      ok: boolean
      scanned?: number
      candidates?: number
      totalSize?: number
      copied?: number
      failed?: number
      error?: string
    }>
    /** F17：库目录移动修复（dryRun 先行统计） */
    repairMovedLibrary: (
      oldRoot: string,
      dryRun: boolean
    ) => Promise<{
      ok: boolean
      missing?: number
      repairable?: number
      repaired?: number
      error?: string
    }>
  }
  tag: {
    getTags: () => Promise<Tag[]>
    getTagById: (id: string) => Promise<Tag | undefined>
    addTag: (name: string, opts?: { parentId?: string }) => Promise<Tag>
    updateTag: (
      id: string,
      updates: Partial<Omit<Tag, 'id' | 'createdAt'>>
    ) => Promise<Tag | undefined>
    deleteTag: (id: string) => Promise<boolean>
    /** F19：多标签合并为一个（批量重命名语义） */
    mergeTags: (ids: string[], name: string) => Promise<Tag>
    getTagsByIds: (ids: string[]) => Promise<Tag[]>
  }
  preferences: {
    getEditorSettings: () => Promise<EditorSettings>
    updateEditorSettings: (updates: Partial<EditorSettings>) => Promise<EditorSettings>
    getTheme: () => Promise<'light' | 'dark' | 'auto'>
    setTheme: (theme: 'light' | 'dark' | 'auto') => Promise<void>
    /** 订阅主题变更广播（多窗口同步，BUGS.md B4）；返回取消订阅函数 */
    onThemeChanged: (cb: (theme: 'light' | 'dark' | 'auto') => void) => () => void
    getPreferences: () => Promise<Preferences>
    isOnboardingCompleted: () => Promise<boolean>
    setOnboardingCompleted: () => Promise<void>
    resetOnboarding: () => Promise<void>
    getFavoriteModules: () => Promise<string[]>
    setFavoriteModules: (ids: string[]) => Promise<void>
  }
  update: {
    check: () => Promise<UpdateStatus>
    download: () => Promise<void>
    install: () => void
    getStatus: () => Promise<UpdateStatus>
    getCurrentVersion: () => Promise<string>
    onEvent: (cb: (e: UpdateEvent) => void) => () => void
  }
  system: {
    info: () => Promise<SystemInfo>
    /** F7：剪藏扩展目录（不存在返回 null） */
    getExtensionDir: () => Promise<string | null>
    openPath: (p: string) => Promise<boolean>
    openExternal: (url: string) => Promise<boolean>
    /** 拉起 macOS 分享面板；面板不可用返回 false（调用方回退复制降级） */
    shareFiles: (paths: string[]) => Promise<boolean>
    pickApp: () => Promise<string | null>
    openWith: (filePath: string, appPath: string) => Promise<boolean>
    listFileManagers: () => Promise<Array<{ name: string; appPath: string }>>
    revealInApp: (filePath: string, appPath: string) => Promise<boolean>
  }
  log: {
    export: () => Promise<string | null>
    getMode: () => Promise<TelemetryMode>
    setMode: (mode: TelemetryMode) => Promise<TelemetryMode>
  }
  onAppOpenModule: (cb: (e: { moduleId: string; path: string }) => void) => () => void
  onAppGoHome: (cb: () => void) => () => void
  // leaf:// 深链（形状与校验都在 @shared/deepLink）
  onAppDeepLink: (cb: (t: { kind: 'item' | 'folder'; id: string }) => void) => () => void
  takeAppDeepLink: () => Promise<{ kind: 'item' | 'folder'; id: string } | null>
  onAppOpenCommandPalette: (cb: () => void) => () => void
  onAppOpenSettings: (cb: () => void) => () => void
  onAppOpenAbout: (cb: () => void) => () => void
  onAppMenuAction: (
    cb: (e: {
      action: string
      /** synthesize-shortcut 专用：要求渲染层合成 keydown（见 appMenu.editWithSynth） */
      key?: string
      code?: string
      metaKey?: boolean
      ctrlKey?: boolean
    }) => void
  ) => () => void
  platform: {
    setDockBadge: (text: string | number | null) => Promise<void>
    setProgressBar: (fraction: number) => Promise<void>
    requestUserAttention: (level: 'critical' | 'informational') => Promise<void>
  }

  createNewWindow: (route: string) => Promise<boolean>
  // DeepSeek 文本模型（D-017）
  ai: {
    config: () => Promise<{ configured: boolean; model: string; hint: string }>
    setKey: (key: string) => Promise<{ ok: true } | { ok: false; error: string }>
    clearKey: () => Promise<{ ok: true } | { ok: false; error: string }>
    test: () => Promise<{ ok: true; text: string } | { ok: false; error: string }>
    batchMeta: (ids: string[]) => Promise<{
      done: number
      skipped: number
      failed: number
      tokens: { prompt: number; completion: number }
      requested: number
    }>
    onBatch: (callback: (p: { done: number; total: number; phase: string }) => void) => () => void
    tagStructure: () => Promise<
      | {
          ok: true
          suggestions: Array<{
            kind: 'merge' | 'parent' | 'rename'
            from: string
            to: string
            reason: string
          }>
        }
      | { ok: false; error: string }
    >
    renamePattern: (
      instruction: string,
      samples: string[]
    ) => Promise<{ ok: true; pattern: string } | { ok: false; error: string }>
    suggestMeta: (photoId: string) => Promise<{
      ok: boolean
      error?: string
      description?: string
      tags?: string[]
    }>
  }

  // 图片管理相关 API
  photos: {
    getAll: () => Promise<Photo[]>
    getByDateSection: () => Promise<Array<{ dateSection: string; photos: Photo[] }>>
    getDateSections: () => Promise<string[]>
    add: (filePath: string, metadata?: { width?: number; height?: number }) => Promise<Photo>
    addMultiple: (
      filePaths: string[],
      metadataMap?: Record<string, { width?: number; height?: number }>
    ) => Promise<Photo[]>
    getById: (id: string) => Promise<Photo | undefined>
    getByPath: (filePath: string) => Promise<Photo | undefined>
    update: (
      id: string,
      updates: Partial<
        Pick<Photo, 'width' | 'height' | 'isFavorite' | 'lastViewedAt' | 'sourceUrl' | 'tags'>
      >
    ) => Promise<Photo | undefined>
    delete: (id: string) => Promise<boolean>
    deleteMultiple: (ids: string[]) => Promise<number>
    search: (query: string) => Promise<Photo[]>
    filterByTags: (tags: string[]) => Promise<Photo[]>
    getFavorites: () => Promise<Photo[]>
    toggleFavorite: (id: string) => Promise<Photo | undefined>
    addTag: (id: string, tag: string) => Promise<Photo | undefined>
    removeTag: (id: string, tag: string) => Promise<Photo | undefined>
    addTagToMultiple: (ids: string[], tag: string) => Promise<number>
    removeTagFromMultiple: (ids: string[], tag: string) => Promise<number>
    getAllTags: () => Promise<string[]>
    getCount: () => Promise<number>
    /** 阶段 4.5 统计面板 */
    getStats: () => Promise<{
      total: number
      favorites: number
      totalSize: number
      totalDuration: number
      byKind: Record<string, number>
      byFormat: Array<{ format: string; count: number }>
      bySize: Array<{ label: string; count: number }>
      importTrend: Array<{ month: string; count: number }>
      ratingDist: Array<{ rating: number; count: number }>
    }>
    clearAll: (expectedTotal?: number) => Promise<boolean>
    setRating: (id: string, rating: number) => Promise<Photo | undefined>
    setDescription: (id: string, description: string) => Promise<Photo | undefined>
    updatePhotos: (
      ids: string[],
      updates: Partial<Pick<Photo, 'rating' | 'description' | 'isFavorite' | 'lastViewedAt'>>
    ) => Promise<Photo[]>
    getRecycleBin: () => Promise<Photo[]>
    /** 分页化阶段 1（docs/PAGINATION_DESIGN.md）：语义参数进、Page 出，where 由主进程构造 */
    getPage: (req: {
      view: 'all' | 'trash' | 'favorites' | 'folder' | 'search'
      folderId?: string
      /** 全局搜索词（FTS5 + 标签名；阶段 3 全局语义） */
      query?: string
      /** LibrarySort id 或旧列名 */
      sort?: string
      desc?: boolean
      cursor?: string
      limit?: number
      /** 阶段 3：筛选维度语义 spec */
      filters?: SmartAlbumRules
    }) => Promise<PhotoPage>
    restoreMultiple: (ids: string[]) => Promise<number>
    clearRecycleBin: () => Promise<string[]>
    listSmartAlbums: () => Promise<SmartAlbum[]>
    createSmartAlbum: (name: string, rules: SmartAlbumRules) => Promise<SmartAlbum>
    updateSmartAlbum: (
      id: string,
      updates: { name?: string; rules?: SmartAlbumRules }
    ) => Promise<SmartAlbum | undefined>
    deleteSmartAlbum: (id: string) => Promise<boolean>
    getSmartAlbumPhotos: (id: string) => Promise<Photo[]>
    queryPhotosByRules: (rules: SmartAlbumRules) => Promise<Photo[]>
    findSimilar: (
      photoId: string,
      threshold?: number
    ) => Promise<Array<{ photo: Photo; distance: number }>>
    getDuplicateGroups: (
      threshold?: number,
      opts?: { mode?: 'phash' | 'hash'; photoIds?: string[] }
    ) => Promise<Photo[][]>
    listPhotoFolders: () => Promise<PhotoFolder[]>
    createPhotoFolder: (name: string, parentId?: string | null) => Promise<PhotoFolder>
    renamePhotoFolder: (id: string, name: string) => Promise<PhotoFolder | undefined>
    deletePhotoFolder: (id: string, deleteImages: boolean) => Promise<boolean>
    movePhotoFolder: (id: string, parentId: string | null) => Promise<void>
    setFolderIcon: (id: string, icon: string | null) => Promise<void>
    getFolderAutoTags: (id: string) => Promise<string[]>
    setFolderAutoTags: (id: string, tags: string[]) => Promise<void>
    /** F10：自由网格摆放（逐文件夹画布坐标） */
    getFreeformPositions: (
      folderId: string
    ) => Promise<Array<{ photoId: string; x: number; y: number; scale: number }>>
    setFreeformPositions: (
      folderId: string,
      items: Array<{ photoId: string; x: number; y: number; scale: number }>
    ) => Promise<void>
    assignPhotosToFolder: (folderId: string | null, photoIds: string[]) => Promise<number>
    getFolderPhotos: (folderId: string) => Promise<Photo[]>
    renamePhotos: (
      items: Array<{ id: string; pattern?: string; start?: number; name?: string }>
    ) => Promise<{
      renamed: Array<{ id: string; fileName: string; filePath: string }>
      conflicts: Array<{ id: string; fileName: string }>
    }>
    copyToClipboard: (filePaths: string[]) => Promise<boolean>
    convertPhotosToWebP: (ids: string[]) => Promise<{ count: number }>
    /** 右键「刷新缩略图 / 重新分析颜色」 */
    reanalyzeAssets: (
      ids: string[],
      opts?: { thumbs?: boolean; palette?: boolean }
    ) => Promise<{ ok: number; failed: string[] }>
    reextractVideoCover: (ids: string[]) => Promise<{ ok: number }>
    createCollage: (ids: string[]) => Promise<{
      ok: boolean
      error?: string
      photoId?: string
      filePath?: string
    }>
    copyVideoFrame: (id: string) => Promise<{ ok: boolean; error?: string }>
    saveVideoFrame: (id: string) => Promise<{
      ok: boolean
      error?: string
      photoId?: string
      filePath?: string
    }>
    /** F3：批量格式转换（webp/png/jpg/avif + 质量/最大宽度），产物入库为新素材 */
    convertPhotos: (
      ids: string[],
      opts: { format: 'webp' | 'png' | 'jpg' | 'avif'; quality?: number; maxWidth?: number }
    ) => Promise<{ count: number }>
    // —— 六期：书签 / 反地理编码 / 密码锁 ——
    addBookmark: (url: string, title?: string) => Promise<Photo>
    showInFolder: (filePath: string) => Promise<void>
    reverseGeocode: (
      lat: number,
      lon: number
    ) => Promise<{ city: string; displayName: string } | null>
    lockIsEnabled: () => Promise<boolean>
    lockSetPassword: (password: string, oldPassword?: string) => Promise<void>
    lockVerify: (password: string) => Promise<boolean>
    lockClear: (password: string) => Promise<boolean>
    listAlbums: () => Promise<Album[]>
    createAlbum: (name: string) => Promise<Album>
    renameAlbum: (id: string, name: string) => Promise<Album | undefined>
    deleteAlbum: (id: string) => Promise<boolean>
    addPhotosToAlbum: (albumId: string, photoIds: string[]) => Promise<number>
    removePhotosFromAlbum: (albumId: string, photoIds: string[]) => Promise<number>
    getAlbumPhotos: (albumId: string) => Promise<Photo[]>
    fontInfo: (
      filePath: string
    ) => Promise<{ familyName: string; subfamilyName: string; fullName: string } | null>
    fontGlyphs: (
      filePath: string,
      codePoints: number[]
    ) => Promise<{ ok: true; missing: number[] } | { ok: false; error: string }>
    /** F12：OCR 文字识别 */
    ocrStatus: () => Promise<{
      enabled: boolean
      pending: number
      ready: boolean
      pendingTotal: number
    }>
    setOcrEnabled: (on: boolean) => Promise<{
      enabled: boolean
      pending: number
      ready: boolean
      pendingTotal: number
    }>
    runOcr: () => Promise<{ queued: number }>
    /** 文档正文抽取（officeparser；无 ready 概念，解析器是纯 JS） */
    docTextStatus: () => Promise<{
      enabled: boolean
      pending: number
      pendingTotal: number
    }>
    setDocTextEnabled: (on: boolean) => Promise<{
      enabled: boolean
      pending: number
      pendingTotal: number
    }>
    runDocText: () => Promise<{ queued: number }>
    /** F18：ZIP 内容浏览 */
    listZipEntries: (id: string) => Promise<{
      ok: boolean
      error?: string
      entries: Array<{ name: string; size: number; isDir: boolean }>
    }>
    extractZipEntry: (
      id: string,
      entryName: string
    ) => Promise<{ ok: boolean; error?: string; mime?: string; dataUrl?: string }>
    readTextFile: (
      filePath: string,
      maxBytes?: number
    ) => Promise<{ ok: true; content: string } | { ok: false; error: string }>
    clipServer: {
      getConfig: () => Promise<{
        running: boolean
        port: number | null
        token: string | null
      }>
      regenerateToken: () => Promise<{ port: number | null; token: string | null }>
    }
    onProcessing: (
      callback: (progress: {
        photoId: string
        status: 'done' | 'failed'
        done: number
        total: number
      }) => void
    ) => () => void
    /** 十五轮 A1：存量数据回填完成（渲染层刷新素材列表） */
    onBackfilled: (callback: () => void) => () => void
    selectFolder: () => Promise<string[]>
    selectFiles: () => Promise<string[]>
    /** 导入目录：镜像磁盘层级建夹（Eagle 口径），parentId = 挂载点（当前文件夹视图） */
    importFolderTree: (
      folderPath: string,
      parentId?: string | null
    ) => Promise<{
      photos: Photo[]
      folders: string[]
      truncated: boolean
      fileCount: number
    }>
    // —— §2.A 收集入口 ——
    importPaths: (filePaths: string[], parentId?: string | null) => Promise<Photo[]>
    getClipboardFiles: () => Promise<string[]>
    /** ⌘V 粘贴内存位图（截图/网页图）直接入库 */
    importBlob: (payload: { mime?: string; base64: string }) => Promise<{
      ok: boolean
      error?: string
      photo?: Photo
    }>
    // —— §3 L4 / §2.B 固定入口 ——
    getUnsorted: () => Promise<Photo[]>
    getRecent: (limit?: number) => Promise<Photo[]>
    getRecentViewed: (limit?: number) => Promise<Photo[]>
    setLastViewed: (id: string) => Promise<void>
    getSidebarCounts: () => Promise<{
      all: number
      untagged: number
      recentViewed: number
    }>
    // —— §2.D 导出/打包 ——
    exportSelected: (photoIds: string[]) => Promise<number>
    exportCsv: (photoIds: string[]) => Promise<{ ok: boolean; error?: string; count?: number }>
    copyText: (text: string) => Promise<boolean>
    getClipboardText: () => Promise<string>
    /** ④-3：复制缩略图位图到剪贴板 */
    copyThumbToClipboard: (id: string) => Promise<boolean>
    /** ④-3：复制原文件 Base64（5MB 上限） */
    copyBase64: (id: string) => Promise<{ ok: boolean; error?: string }>
    openWithDefault: (filePath: string) => Promise<boolean>
    duplicate: (id: string) => Promise<Photo>
    replaceFile: (id: string) => Promise<{ ok: boolean; error?: string; photo?: Photo }>
    setPinned: (id: string, pinned: boolean) => Promise<Photo | undefined>
    exportFolder: (folderId: string) => Promise<number>
    setFolderPassword: (folderId: string, password: string, oldPassword?: string) => Promise<void>
    removeFolderPassword: (folderId: string, password: string) => Promise<boolean>
    verifyFolderPassword: (folderId: string, password: string) => Promise<boolean>
    folderHasPassword: (folderId: string) => Promise<boolean>
    setFolderCover: (folderId: string, photoId: string | null) => Promise<void>
    setFolderViewSettings: (
      folderId: string,
      settings: { layout: string | null; sort: string | null; display: string | null }
    ) => Promise<void>
    /** 十五轮 D19：文件夹颜色（null=恢复自动色） */
    setFolderColor: (folderId: string, hex: string | null) => Promise<void>
    setFolderDescription: (folderId: string, description: string) => Promise<void>
  }
  // G1：图像向量档
  vectors: {
    status: () => Promise<VectorStatus>
    download: () => Promise<{ ok: boolean; error?: string }>
    indexAll: (rebuild?: boolean) => Promise<{ ok: boolean; error?: string }>
    cancelIndex: () => Promise<boolean>
    clearVectors: () => Promise<{ removed: number }>
    removeModel: () => Promise<boolean>
    similar: (photoId: string, topK?: number) => Promise<Array<{ photo: Photo; score: number }>>
    /** 文搜图（G1 语义档）：只回余弦过实测阈值的素材 */
    search: (query: string, topK?: number) => Promise<Array<{ photo: Photo; score: number }>>
    /** 以图搜库内（外部图 → 本地图像向量档）；模型未就绪或路径不合法时返回空 */
    similarByImage: (
      filePath: string,
      topK?: number
    ) => Promise<Array<{ photo: Photo; score: number }>>
  }
  // P1 图片就地编辑
  edit: {
    canEdit: (photoId: string) => Promise<{ ok: boolean; reason?: string }>
    rotate: (photoId: string, degrees: number) => Promise<{ ok: boolean; error?: string }>
    flip: (
      photoId: string,
      axis: 'horizontal' | 'vertical'
    ) => Promise<{ ok: boolean; error?: string }>
  }
  // P1 标注 comments[]（形状与校验单源在 @shared/annotations）
  annotations: {
    list: (photoId: string) => Promise<PhotoAnnotation[]>
    create: (photoId: string, input: AnnotationInput) => Promise<AnnotationWriteResult>
    update: (id: string, photoId: string, input: AnnotationInput) => Promise<AnnotationWriteResult>
    remove: (id: string, photoId: string) => Promise<AnnotationWriteResult>
  }
  // P1：音频波形 + BPM（400 B 一条，不随列表下发，打开预览时按 id 单独取）
  audio: {
    waveform: (photoId: string) => Promise<{
      peaks: number[] | null
      durationMs: number
      bpm: number | null
    } | null>
  }
  // P1：音频波形 + BPM（400 B 一条，不随列表下发，打开预览时按 id 单独取）
  audio: {
    waveform: (photoId: string) => Promise<{
      peaks: number[] | null
      durationMs: number
      bpm: number | null
    } | null>
  }
  // P1：视频同目录字幕（主进程只认 photoId，路径由它自己从库里取）
  video: {
    subtitles: (photoId: string) => Promise<
      Array<{ label: string; srclang?: string; vtt: string; isDefault: boolean }>
    >
  }
  // 搜索链：中文分词
  search: {
    segmentWords: (query: string) => Promise<string[]>
    segmentStatus: () => Promise<{ active: boolean; engine: string; error: string }>
  }
  // 通知相关 API
  notification: {
    // 通用通知
    show: (
      type: string,
      title: string,
      body: string,
      options?: {
        icon?: string
        sound?: boolean
        timeout?: number
      }
    ) => Promise<number>
    // 番茄钟通知
    pomodoro: (
      type: 'start' | 'break' | 'complete' | 'pause' | 'remind',
      message?: string
    ) => Promise<number>
    // 屏幕录制通知
    recording: (type: 'start' | 'stop' | 'error', message?: string) => Promise<number>
    // 信息通知
    info: (
      title: string,
      body: string,
      options?: {
        icon?: string
        sound?: boolean
        timeout?: number
      }
    ) => Promise<number>
    // 成功通知
    success: (
      title: string,
      body: string,
      options?: {
        icon?: string
        sound?: boolean
        timeout?: number
      }
    ) => Promise<number>
    // 警告通知
    warning: (
      title: string,
      body: string,
      options?: {
        icon?: string
        sound?: boolean
        timeout?: number
      }
    ) => Promise<number>
    // 错误通知
    error: (
      title: string,
      body: string,
      options?: {
        icon?: string
        sound?: boolean
        timeout?: number
      }
    ) => Promise<number>
    // 关闭通知
    close: (id: number) => Promise<void>
    // 关闭所有通知
    closeAll: () => Promise<void>
    /** 订阅通知点击/关闭事件（BUGS.md B10）；返回取消订阅函数 */
    onEvent: (cb: (e: { id: number; kind: 'click' | 'close' }) => void) => () => void
  }
  // ── 截图：主流程 API ──
  screenshot: {
    save: (req: {
      dataUrl: string
      displayId: number
      region: { x: number; y: number; width: number; height: number }
      actions: { library: boolean; clipboard: boolean; file: boolean; pin: boolean }
    }) => Promise<{
      ok: boolean
      error?: string
      filePath?: string
      photoId?: string
      pinId?: string
    }>
    getSettings: () => Promise<{
      shortcutEnabled: boolean
      format: 'png' | 'jpg'
      quality: number
      saveDir: string
      autoTag: boolean
    }>
    setSettings: (
      patch: Partial<{
        shortcutEnabled: boolean
        format: 'png' | 'jpg'
        quality: number
        saveDir: string
        autoTag: boolean
      }>
    ) => Promise<{
      shortcutEnabled: boolean
      format: 'png' | 'jpg'
      quality: number
      saveDir: string
      autoTag: boolean
    }>
    closePin: (id: string) => Promise<{ ok: boolean }>
    dragPin: (dx: number, dy: number) => Promise<{ ok: boolean }>
    getPinPayload: (id: string) => Promise<{
      ok: boolean
      dataUrl?: string
      width?: number
      height?: number
    }>
    /** 截图入库后主窗口刷新（返回取消订阅函数） */
    onImported: (cb: (p: { photoId: string; filePath?: string }) => void) => () => void
  }
}

export interface EditorSettings {
  fontSize: number
  fontFamily: string
  wrap: boolean
  tabSize: number
  matchBrackets: boolean
  highlightLine: boolean
  // Prettier 格式化设置
  semi: boolean
  singleQuote: boolean
  trailingComma: 'none' | 'es5' | 'all'
}

export interface Preferences {
  editor: EditorSettings
  theme: 'light' | 'dark' | 'auto'
}

export interface Folder {
  id: string
  name: string
  parentId: string | null
  icon: string | null
  defaultLanguage: string
  isOpen: boolean
  orderIndex: number
  createdAt: number
  updatedAt: number
}

export interface PhotoPage {
  items: Photo[]
  /** null = 已到末页 */
  nextCursor: string | null
  /** 同 WHERE 的总数（与分页无关，供 UI 计数） */
  total: number
}

export interface Photo {
  id: string
  filePath: string
  fileName: string
  fileSize: number
  width?: number
  height?: number
  createdAt: number
  takenAt?: number
  importedAt: number
  modifiedAt: number
  tags: string[]
  isFavorite: boolean
  dateSection: string
  rating: number
  description?: string
  source: string
  thumbStatus: number
  kind: 'image' | 'video' | 'audio' | 'font' | 'text' | 'file' | 'bookmark'
  durationMs?: number
  /** 视频实测帧率（迁移 022，逐帧步进按它挪时间） */
  fps?: number
  /** 节拍估计（迁移 024，ffmpegAudio.estimateBpm 算的整数拍/分；无节拍感为 undefined） */
  bpm?: number
  /** 节拍估计（迁移 024，ffmpegAudio.estimateBpm 算的整数拍/分；无节拍感为 undefined） */
  bpm?: number
  folderId?: string
  /** 来源链接（六期书签；六轮起检查器可编辑任意素材的链接；null=清除） */
  sourceUrl?: string | null
  phash?: string
  colorDominant?: string
  cameraModel?: string
  lensModel?: string
  iso?: number
  aperture?: number
  shutter?: string
  focalLength?: number
  latitude?: number
  longitude?: number
  hash?: string
  lastViewedAt?: number
  /** 文件系统创建时间（003，排列「创建日期」） */
  fsCreatedAt?: number
  /** 文件系统修改时间（003，排列「修改日期」） */
  fsModifiedAt?: number
  /** 置顶时间（004，置顶项视图内优先） */
  pinnedAt?: number
  /** F11：copy 模式导入时的原始路径 */
  sourcePath?: string
  /** F11：断链标记（原文件丢失） */
  missingAt?: number
}

export interface SmartAlbumRules {
  tags?: string[]
  kinds?: string[]
  favorite?: boolean
  minRating?: number
  formats?: string[]
  minWidth?: number
  minHeight?: number
  colorHue?: string
  minFileSize?: number
  maxFileSize?: number
  minDurationMs?: number
  maxDurationMs?: number
  sourceUrl?: string
  descriptionKeyword?: string
  takenFrom?: number
  takenTo?: number
  importedFrom?: number
  importedTo?: number
  keyword?: string
}

export interface SmartAlbum {
  id: string
  name: string
  rules: SmartAlbumRules
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface Album {
  id: string
  name: string
  coverPhotoId: string | null
  sortOrder: number
  photoCount: number
  createdAt: number
  updatedAt: number
}

export interface PhotoFolder {
  id: string
  name: string
  parentId: string | null
  photoCount: number
  createdAt: number
  updatedAt: number
  /** 二十四轮：emoji 图标（undefined=默认图形） */
  icon?: string
  /** 十二轮：视图覆盖（m005；undefined=跟随全局） */
  viewLayout?: string
  viewSort?: string
  viewDisplay?: string
}

export interface SystemInfo {
  userDataPath: string
  dbPath: string
  migrationDone: boolean
}

export type TelemetryMode = 'off' | 'local' | 'remote'

declare global {
  interface Window {
    api: API
  }
}
