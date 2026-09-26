import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { API } from './index.d'

// 类型契约见 ./index.d.ts 的 API 接口（渲染层 window.api 的同一份形状）
const api: API = {
  // 二十四轮：Electron 32+ 移除 File.path，拖拽导入需经 webUtils 换取磁盘路径
  getPathForFile: (file) => webUtils.getPathForFile(file),
  // 壁纸：主进程按屏适配后设置（wallpaper.ts），返回结果与适配口径供 toast 反馈
  setWallpaper: (filePath, screen, options) =>
    ipcRenderer.invoke('wallpaper:set', filePath, screen, options),
  // 壁纸适配预检：各屏的匹配判定，供菜单说明「会裁掉多少」
  assessWallpaper: (filePath) => ipcRenderer.invoke('wallpaper:assess', filePath),
  // 新窗口打开（右键「新窗口打开」；主进程 createAppWindow 以 boot-view 参数启动）
  createNewWindow: (route) => ipcRenderer.invoke('create-new-window', route),
  // D-013 多资源库
  libraries: {
    list: () => ipcRenderer.invoke('libraries:list'),
    create: (name) => ipcRenderer.invoke('libraries:create', name),
    rename: (id, name) => ipcRenderer.invoke('libraries:rename', id, name),
    unregister: (id) => ipcRenderer.invoke('libraries:unregister', id),
    switchTo: (id) => ipcRenderer.invoke('libraries:switch', id),
    mergeFrom: (sourceId) => ipcRenderer.invoke('libraries:mergeFrom', sourceId),
    moveTo: (targetLibraryId, photoIds) =>
      ipcRenderer.invoke('libraries:moveTo', targetLibraryId, photoIds)
  },
  // 阶段 5.1 插件系统（沙箱 iframe + postMessage 桥，仅读取插件元数据与资源）
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    getExtraDir: () => ipcRenderer.invoke('plugins:getExtraDir'),
    setExtraDir: (dir) => ipcRenderer.invoke('plugins:setExtraDir', dir),
    pickExtraDir: () => ipcRenderer.invoke('plugins:pickExtraDir'),
    readAsset: (pluginId, relativePath) =>
      ipcRenderer.invoke('plugins:readAsset', pluginId, relativePath),
    listBuiltin: () => ipcRenderer.invoke('plugins:listBuiltin'),
    installBuiltin: (id) => ipcRenderer.invoke('plugins:installBuiltin', id)
  },
  // 阶段 4.4 监控文件夹自动导入
  storage: {
    scanMissing: () => ipcRenderer.invoke('storage:scanMissing'),
    relinkPhoto: (id) => ipcRenderer.invoke('storage:relinkPhoto', id),
    moveMissingToTrash: () => ipcRenderer.invoke('storage:moveMissingToTrash'),
    migrateIntoLibrary: (dryRun) => ipcRenderer.invoke('storage:migrateIntoLibrary', dryRun),
    repairMovedLibrary: (oldRoot, dryRun) =>
      ipcRenderer.invoke('storage:repairMovedLibrary', oldRoot, dryRun)
  },
  backup: {
    getConfig: () => ipcRenderer.invoke('backup:getConfig'),
    setConfig: (patch) => ipcRenderer.invoke('backup:setConfig', patch),
    runNow: () => ipcRenderer.invoke('backup:runNow'),
    openDir: () => ipcRenderer.invoke('backup:openDir')
  },
  clipboardWatch: {
    getEnabled: () => ipcRenderer.invoke('clipboardWatch:getEnabled'),
    setEnabled: (on) => ipcRenderer.invoke('clipboardWatch:setEnabled', on)
  },
  watchedFolders: {
    list: () => ipcRenderer.invoke('watched:list'),
    add: (folder) => ipcRenderer.invoke('watched:add', folder),
    remove: (folder) => ipcRenderer.invoke('watched:remove', folder),
    setEnabled: (on) => ipcRenderer.invoke('watched:setEnabled', on)
  },
  // 番茄钟相关 API
  tag: {
    getTags: () => ipcRenderer.invoke('tag:getTags'),
    getTagById: (id) => ipcRenderer.invoke('tag:getTagById', id),
    addTag: (name, opts) => ipcRenderer.invoke('tag:addTag', name, opts),
    updateTag: (id, updates) => ipcRenderer.invoke('tag:updateTag', id, updates),
    deleteTag: (id) => ipcRenderer.invoke('tag:deleteTag', id),
    mergeTags: (ids, name) => ipcRenderer.invoke('tag:mergeTags', ids, name),
    getTagsByIds: (ids) => ipcRenderer.invoke('tag:getTagsByIds', ids)
  },
  // 偏好设置 API
  preferences: {
    getEditorSettings: () => ipcRenderer.invoke('preferences:getEditorSettings'),
    updateEditorSettings: (updates) =>
      ipcRenderer.invoke('preferences:updateEditorSettings', updates),
    getTheme: () => ipcRenderer.invoke('preferences:getTheme'),
    setTheme: (theme) => ipcRenderer.invoke('preferences:setTheme', theme),
    // B4 修复：订阅主进程的主题广播（多窗口主题同步）
    onThemeChanged: (cb) => {
      const listener = (_e, t) => cb(t)
      ipcRenderer.on('theme:changed', listener)
      return () => ipcRenderer.removeListener('theme:changed', listener)
    },
    getPreferences: () => ipcRenderer.invoke('preferences:getPreferences'),
    // onboarding 状态（首次启动引导）
    isOnboardingCompleted: () => ipcRenderer.invoke('preferences:isOnboardingCompleted'),
    setOnboardingCompleted: () => ipcRenderer.invoke('preferences:setOnboardingCompleted'),
    resetOnboarding: () => ipcRenderer.invoke('preferences:resetOnboarding'),
    // 用户选的常用模块（onboarding 步骤 3 写入）
    getFavoriteModules: () => ipcRenderer.invoke('preferences:getFavoriteModules'),
    setFavoriteModules: (ids) => ipcRenderer.invoke('preferences:setFavoriteModules', ids)
  },
  // 使用统计（最近使用 + 收藏）
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    getStatus: () => ipcRenderer.invoke('update:getStatus'),
    getCurrentVersion: () => ipcRenderer.invoke('update:getCurrentVersion'),
    onEvent: (cb) => {
      const listener = (_e, payload) => cb(payload)
      ipcRenderer.on('update:event', listener)
      return () => ipcRenderer.removeListener('update:event', listener)
    }
  },
  // System info (userData path, legacy archive dir)
  system: {
    info: () => ipcRenderer.invoke('system:info'),
    getExtensionDir: () => ipcRenderer.invoke('system:getExtensionDir'),
    openPath: (p) => ipcRenderer.invoke('system:openPath', p),
    openExternal: (url) => ipcRenderer.invoke('system:openExternal', url),
    /** 拉起 macOS 分享面板（NSSharingServicePicker）；面板不可用返回 false */
    shareFiles: (paths) => ipcRenderer.invoke('system:shareFiles', paths),
    pickApp: () => ipcRenderer.invoke('system:pickApp'),
    openWith: (filePath, appPath) => ipcRenderer.invoke('system:openWith', filePath, appPath),
    listFileManagers: () => ipcRenderer.invoke('system:listFileManagers'),
    revealInApp: (filePath, appPath) => ipcRenderer.invoke('system:revealInApp', filePath, appPath)
  },
  // 日志 / 反馈
  log: {
    export: () => ipcRenderer.invoke('log:export'),
    getMode: () => ipcRenderer.invoke('log:getMode'),
    setMode: (mode) => ipcRenderer.invoke('log:setMode', mode)
  },
  // 主进程菜单 / dock / tray 跳转订阅
  onAppOpenModule: (cb) => {
    const l = (_e, payload) => cb(payload)
    ipcRenderer.on('app:openModule', l)
    return () => ipcRenderer.removeListener('app:openModule', l)
  },
  // leaf:// 深链：主进程 push（热启动）+ 起来后主动 take（冷启动时 push 没人听）
  onAppDeepLink: (cb) => {
    const l = (_e, payload) => cb(payload)
    ipcRenderer.on('app:deepLink', l)
    return () => ipcRenderer.removeListener('app:deepLink', l)
  },
  takeAppDeepLink: () => ipcRenderer.invoke('app:takeDeepLink'),
  onAppGoHome: (cb) => {
    const l = () => cb()
    ipcRenderer.on('app:goHome', l)
    return () => ipcRenderer.removeListener('app:goHome', l)
  },
  onAppOpenCommandPalette: (cb) => {
    const l = () => cb()
    ipcRenderer.on('app:openCommandPalette', l)
    return () => ipcRenderer.removeListener('app:openCommandPalette', l)
  },
  onAppOpenSettings: (cb) => {
    const l = () => cb()
    ipcRenderer.on('app:openSettings', l)
    return () => ipcRenderer.removeListener('app:openSettings', l)
  },
  onAppOpenAbout: (cb) => {
    const l = () => cb()
    ipcRenderer.on('app:openAbout', l)
    return () => ipcRenderer.removeListener('app:openAbout', l)
  },
  // D-012 原生菜单动作（appMenu.ts → 渲染层执行）；
  // synthesize-shortcut：编辑菜单项要求渲染层合成快捷键（见 appMenu.editWithSynth）
  onAppMenuAction: (cb) => {
    const l = (_e, payload) => cb(payload)
    ipcRenderer.on('app:menu-action', l)
    return () => ipcRenderer.removeListener('app:menu-action', l)
  },
  // 平台特性
  platform: {
    setDockBadge: (text) => ipcRenderer.invoke('platform:setDockBadge', text),
    setProgressBar: (fraction) => ipcRenderer.invoke('platform:setProgressBar', fraction),
    requestUserAttention: (level = 'informational') =>
      ipcRenderer.invoke('platform:requestUserAttention', level)
  },
  // 数据迁移中心
  // DeepSeek 文本模型（D-017）：Key 只写不读，正文由主进程按 photoId 反查
  ai: {
    config: () => ipcRenderer.invoke('ai:config'),
    setKey: (key) => ipcRenderer.invoke('ai:setKey', key),
    clearKey: () => ipcRenderer.invoke('ai:clearKey'),
    test: () => ipcRenderer.invoke('ai:test'),
    batchMeta: (ids) => ipcRenderer.invoke('ai:batchMeta', ids),
    onBatch: (callback) => {
      const listener = (_e, p) => callback(p)
      ipcRenderer.on('ai:batch', listener)
      return () => ipcRenderer.removeListener('ai:batch', listener)
    },
    tagStructure: () => ipcRenderer.invoke('ai:tagStructure'),
    renamePattern: (instruction, samples) =>
      ipcRenderer.invoke('ai:renamePattern', instruction, samples),
    suggestMeta: (photoId) => ipcRenderer.invoke('ai:suggestMeta', photoId)
  },
  photos: {
    getAll: () => ipcRenderer.invoke('photos:getAll'),
    getByDateSection: () => ipcRenderer.invoke('photos:getByDateSection'),
    getDateSections: () => ipcRenderer.invoke('photos:getDateSections'),
    add: (filePath, metadata) => ipcRenderer.invoke('photos:add', filePath, metadata),
    addMultiple: (filePaths, metadataMap) =>
      ipcRenderer.invoke('photos:addMultiple', filePaths, metadataMap),
    getById: (id) => ipcRenderer.invoke('photos:getById', id),
    getByPath: (filePath) => ipcRenderer.invoke('photos:getByPath', filePath),
    update: (id, updates) => ipcRenderer.invoke('photos:update', id, updates),
    delete: (id) => ipcRenderer.invoke('photos:delete', id),
    deleteMultiple: (ids) => ipcRenderer.invoke('photos:deleteMultiple', ids),
    search: (query) => ipcRenderer.invoke('photos:search', query),
    filterByTags: (tags) => ipcRenderer.invoke('photos:filterByTags', tags),
    getFavorites: () => ipcRenderer.invoke('photos:getFavorites'),
    toggleFavorite: (id) => ipcRenderer.invoke('photos:toggleFavorite', id),
    addTag: (id, tag) => ipcRenderer.invoke('photos:addTag', id, tag),
    removeTag: (id, tag) => ipcRenderer.invoke('photos:removeTag', id, tag),
    addTagToMultiple: (ids, tag) => ipcRenderer.invoke('photos:addTagToMultiple', ids, tag),
    removeTagFromMultiple: (ids, tag) =>
      ipcRenderer.invoke('photos:removeTagFromMultiple', ids, tag),
    getAllTags: () => ipcRenderer.invoke('photos:getAllTags'),
    getCount: () => ipcRenderer.invoke('photos:getCount'),
    getStats: () => ipcRenderer.invoke('photos:getStats'),
    clearAll: (expectedTotal) => ipcRenderer.invoke('photos:clearAll', expectedTotal),
    setRating: (id, rating) => ipcRenderer.invoke('photos:setRating', id, rating),
    setDescription: (id, description) =>
      ipcRenderer.invoke('photos:setDescription', id, description),
    updatePhotos: (ids, updates) => ipcRenderer.invoke('photos:updatePhotos', ids, updates),
    getRecycleBin: () => ipcRenderer.invoke('photos:getRecycleBin'),
    // 分页化阶段 1（docs/PAGINATION_DESIGN.md）：语义参数进、Page 出，
    // where/params 由主进程构造
    getPage: (req) => ipcRenderer.invoke('photos:getPage', req),
    restoreMultiple: (ids) => ipcRenderer.invoke('photos:restoreMultiple', ids),
    clearRecycleBin: () => ipcRenderer.invoke('photos:clearRecycleBin'),
    listSmartAlbums: () => ipcRenderer.invoke('photos:listSmartAlbums'),
    createSmartAlbum: (name, rules) => ipcRenderer.invoke('photos:createSmartAlbum', name, rules),
    updateSmartAlbum: (id, updates) => ipcRenderer.invoke('photos:updateSmartAlbum', id, updates),
    deleteSmartAlbum: (id) => ipcRenderer.invoke('photos:deleteSmartAlbum', id),
    getSmartAlbumPhotos: (id) => ipcRenderer.invoke('photos:getSmartAlbumPhotos', id),
    queryPhotosByRules: (rules) => ipcRenderer.invoke('photos:queryPhotosByRules', rules),
    findSimilar: (photoId, threshold) =>
      ipcRenderer.invoke('photos:findSimilar', photoId, threshold),
    getDuplicateGroups: (threshold, opts) =>
      ipcRenderer.invoke('photos:getDuplicateGroups', threshold, opts),
    listPhotoFolders: () => ipcRenderer.invoke('photos:listPhotoFolders'),
    createPhotoFolder: (name, parentId) =>
      ipcRenderer.invoke('photos:createPhotoFolder', name, parentId),
    renamePhotoFolder: (id, name) => ipcRenderer.invoke('photos:renamePhotoFolder', id, name),
    deletePhotoFolder: (id, deleteImages) =>
      ipcRenderer.invoke('photos:deletePhotoFolder', id, deleteImages),
    // 二十四轮（Eagle 移动文件夹/文件夹图标/设置自动标签）
    movePhotoFolder: (id, parentId) => ipcRenderer.invoke('photos:movePhotoFolder', id, parentId),
    setFolderIcon: (id, icon) => ipcRenderer.invoke('photos:setFolderIcon', id, icon),
    getFolderAutoTags: (id) => ipcRenderer.invoke('photos:getFolderAutoTags', id),
    setFolderAutoTags: (id, tags) => ipcRenderer.invoke('photos:setFolderAutoTags', id, tags),
    // F10：自由网格摆放
    getFreeformPositions: (folderId) => ipcRenderer.invoke('photos:getFreeformPositions', folderId),
    setFreeformPositions: (folderId, items) =>
      ipcRenderer.invoke('photos:setFreeformPositions', folderId, items),
    assignPhotosToFolder: (folderId, photoIds) =>
      ipcRenderer.invoke('photos:assignPhotosToFolder', folderId, photoIds),
    getFolderPhotos: (folderId) => ipcRenderer.invoke('photos:getFolderPhotos', folderId),
    renamePhotos: (items) => ipcRenderer.invoke('photos:renamePhotos', items),
    copyToClipboard: (filePaths) => ipcRenderer.invoke('photos:copyToClipboard', filePaths),
    convertPhotosToWebP: (ids) => ipcRenderer.invoke('photos:convertPhotosToWebP', ids),
    // F3：批量格式转换（漏暴露会导致调用即 not a function，审查 P1-5）
    convertPhotos: (ids, opts) => ipcRenderer.invoke('photos:convertPhotos', ids, opts),
    // 右键「刷新缩略图 / 重新分析颜色」
    reanalyzeAssets: (ids, opts) => ipcRenderer.invoke('photos:reanalyzeAssets', ids, opts),
    // 右键「重新抓取封面」（视频/GIF）
    reextractVideoCover: (ids) => ipcRenderer.invoke('photos:reextractVideoCover', ids),
    // 右键「创建拼图」
    createCollage: (ids) => ipcRenderer.invoke('photos:createCollage', ids),
    // 右键「拷贝/保存当前画面」（视频/GIF）
    copyVideoFrame: (id) => ipcRenderer.invoke('photos:copyVideoFrame', id),
    saveVideoFrame: (id) => ipcRenderer.invoke('photos:saveVideoFrame', id),
    // —— 六期：书签 / 反地理编码 / 密码锁 ——
    addBookmark: (url, title) => ipcRenderer.invoke('photos:addBookmark', url, title),
    showInFolder: (filePath) => ipcRenderer.invoke('photos:showInFolder', filePath),
    reverseGeocode: (lat, lon) => ipcRenderer.invoke('photos:reverseGeocode', lat, lon),
    lockIsEnabled: () => ipcRenderer.invoke('photos:lockIsEnabled'),
    lockSetPassword: (password, oldPassword) =>
      ipcRenderer.invoke('photos:lockSetPassword', password, oldPassword),
    lockVerify: (password) => ipcRenderer.invoke('photos:lockVerify', password),
    lockClear: (password) => ipcRenderer.invoke('photos:lockClear', password),
    listAlbums: () => ipcRenderer.invoke('photos:listAlbums'),
    createAlbum: (name) => ipcRenderer.invoke('photos:createAlbum', name),
    renameAlbum: (id, name) => ipcRenderer.invoke('photos:renameAlbum', id, name),
    deleteAlbum: (id) => ipcRenderer.invoke('photos:deleteAlbum', id),
    addPhotosToAlbum: (albumId, photoIds) =>
      ipcRenderer.invoke('photos:addPhotosToAlbum', albumId, photoIds),
    removePhotosFromAlbum: (albumId, photoIds) =>
      ipcRenderer.invoke('photos:removePhotosFromAlbum', albumId, photoIds),
    getAlbumPhotos: (albumId) => ipcRenderer.invoke('photos:getAlbumPhotos', albumId),
    fontInfo: (filePath) => ipcRenderer.invoke('photos:fontInfo', filePath),
    fontGlyphs: (filePath, codePoints) =>
      ipcRenderer.invoke('photos:fontGlyphs', filePath, codePoints),
    // F12：OCR 文字识别
    ocrStatus: () => ipcRenderer.invoke('photos:ocrStatus'),
    setOcrEnabled: (on) => ipcRenderer.invoke('photos:setOcrEnabled', on),
    runOcr: () => ipcRenderer.invoke('photos:runOcr'),
    // 文档正文抽取（officeparser）
    docTextStatus: () => ipcRenderer.invoke('photos:docTextStatus'),
    setDocTextEnabled: (on) => ipcRenderer.invoke('photos:setDocTextEnabled', on),
    runDocText: () => ipcRenderer.invoke('photos:runDocText'),
    // F18：ZIP 内容浏览
    listZipEntries: (id) => ipcRenderer.invoke('photos:listZipEntries', id),
    extractZipEntry: (id, entryName) => ipcRenderer.invoke('photos:extractZipEntry', id, entryName),
    readTextFile: (filePath, maxBytes) =>
      ipcRenderer.invoke('photos:readTextFile', filePath, maxBytes),
    clipServer: {
      getConfig: () => ipcRenderer.invoke('clipServer:getConfig'),
      regenerateToken: () => ipcRenderer.invoke('clipServer:regenerateToken')
    },
    onProcessing: (callback) => {
      const listener = (_event, progress) => callback(progress)
      ipcRenderer.on('photos:processing', listener)
      return () => ipcRenderer.removeListener('photos:processing', listener)
    },
    // 十五轮 A1：存量数据回填（file_size/fs 日期）完成，渲染层应刷新素材列表
    onBackfilled: (callback) => {
      const listener = () => callback()
      ipcRenderer.on('photos:backfilled', listener)
      return () => ipcRenderer.removeListener('photos:backfilled', listener)
    },
    selectFolder: () => ipcRenderer.invoke('photos:selectFolder'),
    selectFiles: () => ipcRenderer.invoke('photos:selectFiles'),
    importFolderTree: (folderPath, parentId) =>
      ipcRenderer.invoke('photos:importFolderTree', folderPath, parentId ?? null),
    // —— §2.A 收集入口 ——
    importPaths: (filePaths, parentId) =>
      ipcRenderer.invoke('photos:importPaths', filePaths, parentId ?? null),
    getClipboardFiles: () => ipcRenderer.invoke('photos:getClipboardFiles'),
    // ⌘V 粘贴内存位图（截图/网页图）直接入库
    importBlob: (payload) => ipcRenderer.invoke('photos:importBlob', payload),
    // —— §3 L4 / §2.B 固定入口 ——
    getUnsorted: () => ipcRenderer.invoke('photos:getUnsorted'),
    getRecent: (limit) => ipcRenderer.invoke('photos:getRecent', limit),
    getRecentViewed: (limit) => ipcRenderer.invoke('photos:getRecentViewed', limit),
    setLastViewed: (id) => ipcRenderer.invoke('photos:setLastViewed', id),
    getSidebarCounts: () => ipcRenderer.invoke('photos:getSidebarCounts'),
    exportSelected: (photoIds) => ipcRenderer.invoke('photos:exportSelected', photoIds),
    exportCsv: (photoIds) => ipcRenderer.invoke('photos:exportCsv', photoIds),
    // D-012 二轮 R2/R4/R5
    copyText: (text) => ipcRenderer.invoke('photos:copyText', text),
    getClipboardText: () => ipcRenderer.invoke('photos:getClipboardText'),
    copyThumbToClipboard: (id) => ipcRenderer.invoke('photos:copyThumbToClipboard', id),
    copyBase64: (id) => ipcRenderer.invoke('photos:copyBase64', id),
    // 右键「反向图搜」：位图进系统剪贴板 + 打开引擎页（引擎清单见 main/utils/reverseSearch）
    reverseImageSearch: (payload) => ipcRenderer.invoke('photos:reverseImageSearch', payload),
    openWithDefault: (filePath) => ipcRenderer.invoke('photos:openWithDefault', filePath),
    duplicate: (id) => ipcRenderer.invoke('photos:duplicate', id),
    replaceFile: (id) => ipcRenderer.invoke('photos:replaceFile', id),
    setPinned: (id, pinned) => ipcRenderer.invoke('photos:setPinned', id, pinned),
    exportFolder: (folderId) => ipcRenderer.invoke('photos:exportFolder', folderId),
    setFolderPassword: (folderId, password, oldPassword) =>
      ipcRenderer.invoke('photos:setFolderPassword', folderId, password, oldPassword),
    removeFolderPassword: (folderId, password) =>
      ipcRenderer.invoke('photos:removeFolderPassword', folderId, password),
    verifyFolderPassword: (folderId, password) =>
      ipcRenderer.invoke('photos:verifyFolderPassword', folderId, password),
    folderHasPassword: (folderId) => ipcRenderer.invoke('photos:folderHasPassword', folderId),
    setFolderCover: (folderId, photoId) =>
      ipcRenderer.invoke('photos:setFolderCover', folderId, photoId),
    setFolderDescription: (folderId, description) =>
      ipcRenderer.invoke('photos:setFolderDescription', folderId, description),
    setFolderViewSettings: (folderId, settings) =>
      ipcRenderer.invoke('photos:setFolderViewSettings', folderId, settings),
    // 十五轮 D19：文件夹颜色（null=恢复自动色）
    setFolderColor: (folderId, hex) => ipcRenderer.invoke('photos:setFolderColor', folderId, hex)
  },
  // G1：图像向量档（模型按需下载 + 全库建索引 + 向量找相似）
  vectors: {
    status: () => ipcRenderer.invoke('vectors:status'),
    download: () => ipcRenderer.invoke('vectors:download'),
    indexAll: (rebuild) => ipcRenderer.invoke('vectors:indexAll', Boolean(rebuild)),
    cancelIndex: () => ipcRenderer.invoke('vectors:cancelIndex'),
    clearVectors: () => ipcRenderer.invoke('vectors:clearVectors'),
    removeModel: () => ipcRenderer.invoke('vectors:removeModel'),
    similar: (photoId, topK) => ipcRenderer.invoke('vectors:similar', photoId, topK),
    search: (query, topK) => ipcRenderer.invoke('vectors:search', String(query ?? ''), topK),
    similarByImage: (filePath, topK) =>
      ipcRenderer.invoke('vectors:similarByImage', String(filePath ?? ''), topK)
  },
  // P1 标注 comments[]：id 与数字都由主进程复核，渲染层传不进路径
  annotations: {
    list: (photoId) => ipcRenderer.invoke('annotations:list', String(photoId ?? '')),
    create: (photoId, input) =>
      ipcRenderer.invoke('annotations:create', String(photoId ?? ''), input),
    update: (id, photoId, input) =>
      ipcRenderer.invoke('annotations:update', String(id ?? ''), String(photoId ?? ''), input),
    remove: (id, photoId) =>
      ipcRenderer.invoke('annotations:remove', String(id ?? ''), String(photoId ?? ''))
  },
  // P1：音频波形 + BPM（波形 400 B/条不随列表下发，打开预览时按 id 单独取一次）
  audio: {
    waveform: (photoId) => ipcRenderer.invoke('audio:waveform', String(photoId ?? ''))
  },
  // P1：视频同目录字幕（只传 id，路径由主进程从库里取）
  video: {
    subtitles: (photoId) => ipcRenderer.invoke('video:subtitles', String(photoId ?? ''))
  },
  // P1 图片就地编辑：只传 id 与枚举，路径由主进程从库里取
  edit: {
    canEdit: (photoId) => ipcRenderer.invoke('edit:canRotate', String(photoId ?? '')),
    rotate: (photoId, degrees) => ipcRenderer.invoke('edit:rotate', String(photoId ?? ''), degrees),
    flip: (photoId, axis) => ipcRenderer.invoke('edit:flip', String(photoId ?? ''), axis)
  },
  // 搜索链：中文分词取词（词典只在主进程一份，两侧共用同一套词）
  search: {
    segmentWords: (query) => ipcRenderer.invoke('search:segmentWords', String(query ?? '')),
    segmentStatus: () => ipcRenderer.invoke('search:segmentStatus')
  },
  // 屏幕录制相关 API
  notification: {
    // 通用通知
    show: (type, title, body, options) =>
      ipcRenderer.invoke('notification:show', type, title, body, options),
    // 番茄钟通知
    pomodoro: (type, message) => ipcRenderer.invoke('notification:pomodoro', type, message),
    // 屏幕录制通知
    recording: (type, message) => ipcRenderer.invoke('notification:recording', type, message),
    // 信息通知
    info: (title, body, options) => ipcRenderer.invoke('notification:info', title, body, options),
    // 成功通知
    success: (title, body, options) =>
      ipcRenderer.invoke('notification:success', title, body, options),
    // 警告通知
    warning: (title, body, options) =>
      ipcRenderer.invoke('notification:warning', title, body, options),
    // 错误通知
    error: (title, body, options) => ipcRenderer.invoke('notification:error', title, body, options),
    // 关闭通知
    close: (id) => ipcRenderer.invoke('notification:close', id),
    // 关闭所有通知
    closeAll: () => ipcRenderer.invoke('notification:closeAll'),
    // B10：订阅通知的点击/关闭事件（{ id, kind }）；返回取消订阅函数
    onEvent: (cb) => {
      const listener = (_e, payload) => cb(payload)
      ipcRenderer.on('notification:event', listener)
      return () => ipcRenderer.removeListener('notification:event', listener)
    }
  },
  // ── 截图：主流程 API ──
  screenshot: {
    save: (req) => ipcRenderer.invoke('screenshot.save', req),
    getSettings: () => ipcRenderer.invoke('screenshot.settings.get'),
    setSettings: (patch) => ipcRenderer.invoke('screenshot.settings.set', patch),
    closePin: (id) => ipcRenderer.invoke('screenshot.pin.close', { id }),
    dragPin: (dx, dy) => ipcRenderer.invoke('screenshot.pin.drag', { dx, dy }),
    getPinPayload: (id) => ipcRenderer.invoke('screenshot.pin.payload', { id }),
    /** 截图入库后主窗口刷新（返回取消订阅函数） */
    onImported: (cb) => {
      const handler = (_e, p) => cb(p)
      ipcRenderer.on('screenshot:imported', handler)
      return () => ipcRenderer.removeListener('screenshot:imported', handler)
    }
  }
}
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.api = api
}
