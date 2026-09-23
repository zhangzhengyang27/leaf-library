import {
  photoRepository,
  type Photo,
  type PhotoProcessingResult,
  type PhotoRepository
} from '../db/repos/PhotoRepository'
import { smartAlbumRepository, type SmartAlbum } from '../db/repos/SmartAlbumRepository'
import { albumRepository, type Album } from '../db/repos/AlbumRepository'
import { photoFolderRepository, type PhotoFolder } from '../db/repos/PhotoFolderRepository'
import type { SmartAlbumRules } from '../db/smartAlbumRules'
import { activeRoot, activeSubdir } from '../modules/libraryRegistry'
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync
} from 'fs'
import { basename, isAbsolute, join, relative } from 'path'
import { sanitizeFileNameBase } from '@shared/filename'
import { uniqueFilePath } from '../utils/screenshotFile'
import { planLibraryMoveRepair } from '../utils/libraryMoveRepair'
import { isBundlePath, isSensitiveImportPath } from '../utils/pathPolicy'
import { applySemanticQuery, stripSemanticSnapshot } from '../services/semanticRules'

export type { Photo, SmartAlbum, SmartAlbumRules, Album, PhotoFolder }

/** 导入时可随路径带的元数据（拷贝入库后按「目标路径」重键传给仓库层） */
export interface ImportMeta {
  width?: number
  height?: number
  fileSize?: number
  /** copy 模式：这条素材的原文件路径 */
  sourcePath?: string
  /** copy 模式：原文件的出生时间。副本的 birthtime 是导入那一刻，不带就会改掉「创建日期」 */
  fsCreatedAt?: number
}

/** 路径存在且是普通文件（非目录/设备/失效路径）；目录拖入库会成为无法预览的死条目 */
function isRegularFile(p: string): boolean {
  try {
    return lstatSync(p).isFile()
  } catch {
    return false
  }
}

/** 单条入库的路径防线：必须是绝对路径的普通文件，且非凭据/私钥类敏感文件 */
function assertImportablePath(p: string): void {
  if (typeof p !== 'string' || !isAbsolute(p)) {
    throw new Error(`导入路径必须是绝对路径：${p}`)
  }
  if (isSensitiveImportPath(p)) {
    throw new Error(`出于安全考虑，不允许导入凭据/私钥类文件：${basename(p)}`)
  }
  if (!isRegularFile(p) && !isBundlePath(p)) {
    throw new Error(`不是可导入的普通文件：${p}`)
  }
}

/**
 * PhotoDataStore — 5-7 纯转发层。
 */
export class PhotoDataStore {
  getPhotos(): Photo[] {
    return photoRepository.getPhotos()
  }

  getPhotoByPath(filePath: string): Photo | undefined {
    return photoRepository.getPhotoByPath(filePath)
  }

  /** 含回收站软删行（回收站素材预览走 image://video://rawfile:// 与 readTextFile 时用） */
  getPhotoByPathIncludingDeleted(filePath: string): Photo | undefined {
    return photoRepository.getPhotoByPathIncludingDeleted(filePath)
  }

  getPhotoById(id: string): Photo | undefined {
    return photoRepository.getPhotoById(id)
  }

  addPhoto(filePath: string, metadata?: { width?: number; height?: number }): Photo {
    assertImportablePath(filePath)
    return photoRepository.addPhoto(filePath, metadata)
  }

  addPhotos(filePaths: string[], metadataMap?: Map<string, ImportMeta>): Photo[] {
    // 入口统一校验：非字符串/相对路径/目录与失效路径跳过；凭据/私钥类敏感文件
    // 拒绝入库（防「先入库再经 image:// 读内容」绕过协议白名单）。单个不合法不中断整批。
    const importable = filePaths.filter((p) => {
      if (typeof p !== 'string' || !isAbsolute(p)) {
        console.warn('[PhotoDataStore] addPhotos 跳过非法路径:', p)
        return false
      }
      if (isSensitiveImportPath(p)) {
        console.warn('[PhotoDataStore] addPhotos 拒绝导入敏感文件:', p)
        return false
      }
      // bundle（.app/.framework/…）按单个素材项入库，不是普通文件
      if (!isRegularFile(p) && !isBundlePath(p)) {
        console.warn('[PhotoDataStore] addPhotos 跳过非普通文件:', p)
        return false
      }
      return true
    })
    return this.addPhotosInner(importable, metadataMap)
  }

  private addPhotosInner(filePaths: string[], metadataMap?: Map<string, ImportMeta>): Photo[] {
    // D-020：入库即拷贝进库（Eagle 语义）。库内已有文件与不可达文件保持原样
    const mapped: string[] = []
    /** 本次调用新拷贝进库的目标文件（只删确实没落库的那些） */
    const copiedTargets: string[] = []
    // 元数据按「目标路径」重键：拷贝项补 source_path，未拷贝项透传原元数据。
    // 注意 metadataMap 常为 undefined（拖拽/监控导入），此时也要建表——否则 source_path 丢失。
    const remappedMeta = new Map<string, ImportMeta>()
    let anyCopied = false
    // 同批内同一路径先去重：不去重会拷出两份副本、建出两行（mapped=[c1,c2]）
    for (const p of new Set(filePaths)) {
      const origMeta = metadataMap?.get(p)
      if (this.isInsideLibrary(p) || !existsSync(p)) {
        if (origMeta) remappedMeta.set(p, origMeta)
        mapped.push(p)
        continue
      }
      // 两种"这个原文件其实已经在库里"：D-020 之前按引用入库的行（file_path 就是它），
      // 以及拷贝入库后再导入的行（file_path 是副本，只能按 source_path 认）
      const known =
        photoRepository.getPhotoByPathIncludingDeleted(p) ??
        photoRepository.getPhotoBySourcePathIncludingDeleted(p)
      if (known) {
        mapped.push(known.filePath)
        if (origMeta) remappedMeta.set(known.filePath, origMeta)
        continue
      }
      // 副本的 birthtime 是"这一刻"，直接 stat 会把创建日期/修改日期改写成导入时间
      // （「创建日期」排序与「修改日期」条件都吃这两列）→ 原文件的出生时间随元数据带进去，
      // mtime/atime 由 copyIntoLibrary 用 utimesSync 落回副本
      let originBirth: number | undefined
      try {
        const st = statSync(p)
        if (st.birthtimeMs > 0) originBirth = Math.round(st.birthtimeMs)
      } catch {
        /* 不可达就不带 */
      }
      const copied = this.copyIntoLibrary(p)
      if (copied) {
        mapped.push(copied)
        copiedTargets.push(copied)
        anyCopied = true
        remappedMeta.set(copied, { ...origMeta, sourcePath: p, fsCreatedAt: originBirth })
      } else {
        if (origMeta) remappedMeta.set(p, origMeta)
        mapped.push(p)
      }
    }
    try {
      return photoRepository.addPhotos(
        mapped,
        anyCopied || remappedMeta.size > 0 ? remappedMeta : undefined
      )
    } catch (err) {
      // 只删「确实没落库」的副本：addPhotos 按 200 条一批分别提交，无条件回滚会把
      // 已提交行的文件一起删掉，那些行当场变断链
      for (const t of copiedTargets) {
        try {
          if (existsSync(t) && !photoRepository.getPhotoByPath(t)) unlinkSync(t)
        } catch {
          /* 删不掉就留给断链扫描 */
        }
      }
      throw err
    }
  }

  // —— D-020：拷贝式入库 / 断链 ——

  /** 用 path.relative 判定包含关系：旧实现的 `root + '/'` 字符串前缀匹配
   *  在 win32 反斜杠路径上永远匹配不上 → 每次导入都会重复拷贝一份。
   *  两侧都先 realpath：库根可能是个软链（`images` 被链到库外、或 userData 走
   *  /var↔/private/var 那类别名），按字面判会把用户自己的文件算成"库内"，
   *  而「清空回收站」只删判成库内的文件 */
  isInsideLibrary(p: string): boolean {
    const rel = relative(this.realpath(activeRoot()), this.realpath(p))
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
  }

  /** 解析软链/别名段；路径不存在时按原样比（新副本本来就还不存在） */
  private realpath(p: string): string {
    try {
      return realpathSync(p)
    } catch {
      return p
    }
  }

  /**
   * copy 落盘：images/YYMM/<原名>；不可达文件返回 null。
   * `nameOverride` 供「创建副本」这类要换个显示名的调用方用（副本.ext），
   * 目的是一次就拷到位，不要让调用方自己拼路径绕开重名探测。
   *
   * 名字**保持原样**（重名才追加 ` 2`）：库内路径的唯一性是目录给的（按月的 YYMM 分桶
   * + 重名探测），而 file_name 是卡片/检查器直接显示的那一行——早期实现给每个副本加
   * `<uuid8>_` 前缀，结果是用户导入的东西在界面上全长着乱码前缀的名字。
   * Eagle 同理：原件按原名存在 `<库>/images/<id>.info/` 里。
   */
  copyIntoLibrary(srcPath: string, nameOverride?: string): string | null {
    const root = activeRoot()
    if (!existsSync(srcPath)) return null
    const d = new Date()
    const yymm = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`
    const dir = join(root, 'images', yymm)
    mkdirSync(dir, { recursive: true })
    const origBase = nameOverride ?? basename(srcPath)
    const dot = origBase.lastIndexOf('.')
    const stem = sanitizeFileNameBase(dot > 0 ? origBase.slice(0, dot) : origBase) || 'file'
    const ext = dot > 0 ? origBase.slice(dot) : ''
    const dest = uniqueFilePath(dir, stem, ext)
    try {
      // .app / .framework 这类 bundle 是按「单个素材项」入库的（pathPolicy 同源），
      // copyFileSync 对目录必抛 EISDIR → 以前会静默留成库外引用行，迁移时每次数成 failed
      if (isBundlePath(srcPath)) cpSync(srcPath, dest, { recursive: true })
      else copyFileSync(srcPath, dest)
      // 时间戳回到原文件：副本的 mtime 是这一刻，而「修改日期」筛选/排序吃 fs_modified_at
      try {
        const st = statSync(srcPath)
        utimesSync(dest, st.atime, st.mtime)
      } catch {
        /* 时间戳尽力而为 */
      }
      return dest
    } catch (err) {
      console.error('[PhotoDataStore] copy-into-library failed:', srcPath, err)
      // 拷到一半失败（bundle 尤其可能）不要把半个目录留在库里
      try {
        if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
      } catch {
        /* 清不掉就交给断链扫描 */
      }
      return null
    }
  }

  /** 断链扫描：标记丢失/恢复出现，分批让出事件循环 */
  async scanMissing(): Promise<{
    missing: number
    restored: number
    scanned: number
    /** 扫完之后**当前**断链条目总数：missing 只报本次新标记的，重复扫描时会是 0 */
    remaining: number
  }> {
    const rows = photoRepository.listAllForStorageScan()
    let missing = 0
    let restored = 0
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const ok = existsSync(r.filePath)
      if (!ok && r.missingAt == null) {
        photoRepository.setMissing(r.id, Date.now())
        missing += 1
      } else if (ok && r.missingAt != null) {
        photoRepository.setMissing(r.id, null)
        restored += 1
      }
      if (i % 500 === 499) await new Promise((res) => setTimeout(res, 0))
    }
    return {
      missing,
      restored,
      scanned: rows.length,
      remaining: photoRepository.listMissingIds().length
    }
  }

  /**
   * 把所有断链条目软删进回收站（可还原，不是真删）。
   *
   * 为什么要这个入口：一次误删/换盘之后库里可能几千条 missing_at，用户只能逐条看到
   * 「⚠ 丢失」徽章，没有任何办法把这一堆清出视野。软删是可逆的——东西还在回收站，
   * 日后从备份找回文件还能「重新定位」；等真要清空回收站时，missing 的行磁盘上本来就
   * 没有文件，D-020 那道"只删库内副本"的守卫不会被绕过。
   */
  moveMissingToTrash(): number {
    const ids = photoRepository.listMissingIds()
    if (ids.length === 0) return 0
    return photoRepository.deletePhotos(ids)
  }

  /**
   * 重新定位丢失素材（要求新路径存在）。
   * D-020：选中的新文件在库外时先拷进库、把出处记进 source_path，而不是把行换绑到
   * 库外路径——后者等于趁用户修一次断链，悄悄把这条素材退回引用形态。
   */
  relinkPhoto(id: string, newPath: string): Photo | undefined {
    if (!existsSync(newPath)) throw new Error('新文件不存在')
    if (!this.isInsideLibrary(newPath)) {
      const copied = this.copyIntoLibrary(newPath)
      if (copied) return photoRepository.relinkPhoto(id, copied, newPath)
      console.warn('[PhotoDataStore] relink 拷贝入库失败，退回换绑原路径:', newPath)
    }
    return photoRepository.relinkPhoto(id, newPath)
  }

  /**
   * F17：库目录移动修复——missing 素材按「旧根相对路径 → 新根」批量重映射。
   * dryRun 只返回可修复数；oldRoot 由用户选择（原库目录）。
   */
  repairMovedLibrary(
    oldRoot: string,
    dryRun: boolean
  ): {
    missing: number
    repairable: number
    repaired: number
  } {
    const newRoot = activeRoot()
    const missing = photoRepository.listMissing()
    const plan = planLibraryMoveRepair(
      missing.map((m) => ({ id: m.id, filePath: m.filePath })),
      oldRoot,
      newRoot,
      existsSync
    )
    if (!dryRun && plan.length > 0) {
      photoRepository.relinkBatch(plan)
    }
    return { missing: missing.length, repairable: plan.length, repaired: dryRun ? 0 : plan.length }
  }

  /**
   * 存量迁移器（copy 模式落地）：把库外引用的文件批量拷入 images/YYMM 并换绑。
   * dryRun 只统计；每 50 条一批让出事件循环，幂等（已在库内的自动跳过）。
   */
  /**
   * 把一条素材的文件收进库内（Eagle 语义：编辑动作要落在库自己的副本上）。
   *
   * 为什么必须先这一步：本库此刻 5,178 条素材里有 5,152 条的 file_path 直接指向
   * 桌面上的原文件（导入时没拷贝入库）。就地旋转/翻转等于改写用户散在自己磁盘上的
   * 原始文件，撤销不了——所以编辑类动作一律先 materialize，原文件保持不动，
   * source_path 记下出处。
   *
   * 库根就是当前库目录（legacy 库即 userData，D-020 起支持收库编辑），
   * 拷贝失败才抛错——绝不退化成就地改用户散在磁盘上的原始文件。
   */
  materializeIntoLibrary(photoId: string): string {
    const photo = photoRepository.getPhotoById(photoId)
    if (!photo) throw new Error('素材不存在')
    if (this.isInsideLibrary(photo.filePath)) return photo.filePath
    if (!existsSync(photo.filePath)) throw new Error('素材文件已丢失')
    const dest = this.copyIntoLibrary(photo.filePath)
    if (!dest) throw new Error('拷贝入资源库失败（磁盘空间或权限？）')
    photoRepository.updateMigrationBatch([
      { id: photoId, filePath: dest, fileName: basename(dest), sourcePath: photo.filePath }
    ])
    return dest
  }

  async migrateIntoLibrary(opts: { dryRun: boolean }): Promise<{
    scanned: number
    candidates: number
    totalSize: number
    copied: number
    failed: number
  }> {
    const rows = photoRepository.listAllForStorageScan()
    const candidates: Array<{ id: string; filePath: string; size: number }> = []
    let totalSize = 0
    for (const r of rows) {
      if (this.isInsideLibrary(r.filePath) || !existsSync(r.filePath)) continue
      let size = 0
      try {
        size = statSync(r.filePath).size
      } catch {
        continue
      }
      candidates.push({ id: r.id, filePath: r.filePath, size })
      totalSize += size
    }
    const result = {
      scanned: rows.length,
      candidates: candidates.length,
      totalSize,
      copied: 0,
      failed: 0
    }
    if (opts.dryRun || candidates.length === 0) return result

    let batch: Array<{ id: string; filePath: string; fileName: string; sourcePath: string }> = []
    for (const c of candidates) {
      const dest = this.copyIntoLibrary(c.filePath)
      if (!dest) {
        result.failed += 1
        continue
      }
      batch.push({
        id: c.id,
        filePath: dest,
        fileName: basename(dest),
        sourcePath: c.filePath
      })
      result.copied += 1
      if (batch.length >= 50) {
        photoRepository.updateMigrationBatch(batch)
        batch = []
        await new Promise((res) => setTimeout(res, 0))
      }
    }
    if (batch.length > 0) photoRepository.updateMigrationBatch(batch)
    return result
  }

  updatePhoto(
    id: string,
    updates: Partial<
      Pick<Photo, 'width' | 'height' | 'isFavorite' | 'lastViewedAt' | 'sourceUrl' | 'tags'>
    >
  ): Photo | undefined {
    return photoRepository.updatePhoto(id, updates)
  }

  updatePhotos(
    ids: string[],
    updates: Partial<Pick<Photo, 'rating' | 'description' | 'isFavorite' | 'lastViewedAt'>>
  ): Photo[] {
    return photoRepository.updatePhotos(ids, updates)
  }

  /** round20：替换文件（保留元数据） */
  replaceFile(
    id: string,
    updates: {
      filePath: string
      fileName: string
      fileSize: number
      width?: number
      height?: number
      hash?: string
      phash?: string
      kind?: import('@shared/assetTypes').AssetKind
      durationMs?: number
    }
  ): Photo | undefined {
    return photoRepository.replaceFile(id, updates)
  }

  deletePhoto(id: string): boolean {
    return photoRepository.deletePhoto(id)
  }

  deletePhotos(ids: string[]): number {
    return photoRepository.deletePhotos(ids)
  }

  getPhotosByDateSection(): Map<string, Photo[]> {
    return photoRepository.getPhotosByDateSection()
  }

  getDateSections(): string[] {
    // 轻量 SQL 版（审查 P3-20）：旧实现全量加载 + JS 分组只为取组名列表
    return photoRepository.getDateSections()
  }

  getPhotosByIds(ids: string[]): Photo[] {
    return photoRepository.getPhotosByIds(ids)
  }

  // —— §3 L4 / §2.B 固定入口：未分类 / 最近添加 / 最近查看 ——

  getUnsortedPhotos(): Photo[] {
    return photoRepository.getUnsortedPhotos()
  }

  getRecentPhotos(limit?: number): Photo[] {
    return photoRepository.getRecentPhotos(limit)
  }

  getRecentViewedPhotos(limit?: number): Photo[] {
    return photoRepository.getRecentViewedPhotos(limit)
  }

  sidebarCounts(): { all: number; untagged: number; recentViewed: number } {
    return photoRepository.sidebarCounts()
  }

  setLastViewed(id: string): void {
    photoRepository.setLastViewed(id)
  }

  searchPhotos(query: string): Photo[] {
    return photoRepository.searchPhotos(query)
  }

  filterPhotosByTags(tags: string[]): Photo[] {
    return photoRepository.filterPhotosByTags(tags)
  }

  getFavoritePhotos(): Photo[] {
    return photoRepository.getFavoritePhotos()
  }

  toggleFavorite(id: string): Photo | undefined {
    return photoRepository.toggleFavorite(id)
  }

  setRating(id: string, rating: number): Photo | undefined {
    return photoRepository.setRating(id, rating)
  }

  setDescription(id: string, description: string): Photo | undefined {
    return photoRepository.setDescription(id, description)
  }

  addTag(id: string, tag: string): Photo | undefined {
    return photoRepository.addTag(id, tag)
  }

  removeTag(id: string, tag: string): Photo | undefined {
    return photoRepository.removeTag(id, tag)
  }

  addTagToPhotos(ids: string[], tag: string): number {
    return photoRepository.addTagToPhotos(ids, tag)
  }

  removeTagFromPhotos(ids: string[], tag: string): number {
    return photoRepository.removeTagFromPhotos(ids, tag)
  }

  getAllTags(): string[] {
    return photoRepository.getAllTags()
  }

  getPhotoCount(): number {
    return photoRepository.getPhotoCount()
  }

  countOcrPending(): number {
    return photoRepository.countOcrPending()
  }

  /** 阶段 4.5 统计面板：扩展维度聚合 */
  getStatsDetail(): ReturnType<PhotoRepository['getStatsDetail']> {
    return photoRepository.getStatsDetail()
  }

  clearAllPhotos(): void {
    photoRepository.clearAllPhotos()
  }

  // —— 回收站 ——

  getRecycleBinPhotos(): Photo[] {
    return photoRepository.getRecycleBinPhotos()
  }

  restorePhotos(ids: string[]): number {
    return photoRepository.restorePhotos(ids)
  }

  /**
   * 清空回收站：删行 + 删**库内**副本（Eagle 也是这一步才真删字节）。
   * 只删落在库根内的普通文件——D-020 之前入库的引用式素材，它的 file_path 就是
   * 用户自己磁盘上的原件，清空回收站不该把它删了；原件留给用户自己处置，
   * 素材行没了就是库里没了。返回被清理的 photoId（调用方负责缩略图目录）。
   */
  clearRecycleBin(): string[] {
    const doomed = photoRepository.getRecycleBinPhotos()
    const ids = photoRepository.clearRecycleBin()
    for (const p of doomed) {
      if (!this.isInsideLibrary(p.filePath)) continue
      try {
        if (lstatSync(p.filePath).isFile()) unlinkSync(p.filePath)
      } catch {
        /* 删不掉留给断链扫描标记 */
      }
    }
    return ids
  }

  // —— 智能文件夹 ——

  listSmartAlbums(): SmartAlbum[] {
    return smartAlbumRepository.list()
  }

  createSmartAlbum(name: string, rules: SmartAlbumRules): SmartAlbum {
    return smartAlbumRepository.create(name, stripSemanticSnapshot(rules))
  }

  updateSmartAlbum(
    id: string,
    updates: { name?: string; rules?: SmartAlbumRules }
  ): SmartAlbum | undefined {
    if (!updates.rules) return smartAlbumRepository.update(id, updates)
    return smartAlbumRepository.update(id, {
      ...updates,
      rules: stripSemanticSnapshot(updates.rules)
    })
  }

  deleteSmartAlbum(id: string): boolean {
    return smartAlbumRepository.remove(id)
  }

  /** 语义条件（若有）在进 SQL 前解析成 id 快照；模型未就绪时按 fail-closed 出空 */
  async getSmartAlbumPhotos(id: string): Promise<Photo[]> {
    const album = smartAlbumRepository.getById(id)
    if (!album) return []
    return photoRepository.queryByRules(await applySemanticQuery(album.rules))
  }

  // —— 手动相册（四期） ——

  listAlbums(): Album[] {
    return albumRepository.list()
  }

  createAlbum(name: string): Album {
    return albumRepository.create(name)
  }

  renameAlbum(id: string, name: string): Album | undefined {
    return albumRepository.update(id, { name })
  }

  deleteAlbum(id: string): boolean {
    return albumRepository.remove(id)
  }

  addPhotosToAlbum(albumId: string, photoIds: string[]): number {
    return albumRepository.addPhotos(albumId, photoIds)
  }

  removePhotosFromAlbum(albumId: string, photoIds: string[]): number {
    return albumRepository.removePhotos(albumId, photoIds)
  }

  getAlbumPhotos(albumId: string): Photo[] {
    return albumRepository
      .getAlbumPhotos(albumId)
      .map((id) => photoRepository.getPhotoById(id))
      .filter((p): p is Photo => p !== undefined)
  }

  // —— 文件夹分组（五期） ——

  listPhotoFolders(): ReturnType<PhotoDataStore['listFoldersSafe']> {
    return this.listFoldersSafe()
  }

  createPhotoFolder(name: string, parentId?: string | null): PhotoFolder {
    return photoFolderRepository.create(name, parentId)
  }

  renamePhotoFolder(id: string, name: string): PhotoFolder | undefined {
    return photoFolderRepository.update(id, { name })
  }

  deletePhotoFolder(id: string, deleteImages = false): boolean {
    return photoFolderRepository.remove(id, deleteImages)
  }

  assignPhotosToFolder(folderId: string | null, photoIds: string[]): number {
    const n = photoFolderRepository.assignPhotos(folderId, photoIds)
    // 二十四轮（Eagle 设置自动标签）：素材归入文件夹时自动补打文件夹规则内的标签
    if (folderId && n > 0) {
      for (const tag of photoFolderRepository.getAutoTags(folderId)) {
        try {
          photoRepository.addTagToPhotos(photoIds, tag)
        } catch {
          /* 单个标签失败不阻断归组 */
        }
      }
    }
    return n
  }

  /** 二十四轮：移动文件夹（改父级，null=根级；含防环校验） */
  movePhotoFolder(id: string, parentId: string | null): void {
    photoFolderRepository.move(id, parentId)
  }

  /** 二十四轮：文件夹 emoji 图标 */
  setFolderIcon(id: string, icon: string | null): void {
    photoFolderRepository.setIcon(id, icon)
  }

  /** F10：自由网格摆放读取 */
  getFreeformPositions(
    folderId: string
  ): Array<{ photoId: string; x: number; y: number; scale: number }> {
    return photoFolderRepository.getFreeformPositions(folderId)
  }

  /** F10：自由网格摆放覆盖式保存 */
  setFreeformPositions(
    folderId: string,
    items: Array<{ photoId: string; x: number; y: number; scale: number }>
  ): void {
    photoFolderRepository.setFreeformPositions(folderId, items)
  }

  /** 二十四轮：读取文件夹自动标签规则 */
  getFolderAutoTags(id: string): string[] {
    return photoFolderRepository.getAutoTags(id)
  }

  /** 二十四轮：保存自动标签规则，并立即应用到文件夹内现有素材 */
  setFolderAutoTags(id: string, tags: string[]): void {
    const cleaned = [...new Set(tags.map((t) => t.trim()).filter(Boolean))]
    photoFolderRepository.setAutoTags(id, cleaned.length > 0 ? JSON.stringify(cleaned) : null)
    if (cleaned.length === 0) return
    const ids = photoRepository
      .getAll()
      .filter((p) => p.folderId === id)
      .map((p) => p.id)
    for (const tag of cleaned) {
      try {
        photoRepository.addTagToPhotos(ids, tag)
      } catch {
        /* 单个标签失败不阻断保存 */
      }
    }
  }

  getFolderPhotos(folderId: string): Photo[] {
    return photoRepository.getAll().filter((p) => p.folderId === folderId)
  }

  /** D-013 二轮：列表不外泄加密密码体，改发 hasPassword 布尔 */
  listFoldersSafe(): Array<
    import('../db/repos/PhotoFolderRepository').PhotoFolder & { hasPassword?: boolean }
  > {
    return photoFolderRepository.list().map((f) => {
      const { password, ...rest } = f
      return password ? { ...rest, hasPassword: true } : rest
    })
  }

  // —— 批量操作（五期） ——

  /**
   * 批量重命名。**先收库再改名**：renameFiles 是 `renameSync` 真改磁盘，
   * 而 D-020 之前入库的引用行 `file_path` 就是用户散在磁盘上的原件（本库实测 5,152 条
   * 指向 ~/Desktop）——不改这一步，批量重命名等于在用户自己的目录里改他的文件名。
   * 收库失败（原文件已丢）的条目记进 conflicts，让弹窗如实显示"这条没改"。
   */
  renamePhotos(items: Array<{ id: string; pattern?: string; start?: number; name?: string }>): {
    renamed: Array<{ id: string; fileName: string; filePath: string }>
    conflicts: Array<{ id: string; fileName: string }>
  } {
    const safe: typeof items = []
    const conflicts: Array<{ id: string; fileName: string }> = []
    for (const it of items) {
      const photo = photoRepository.getPhotoById(it.id)
      if (!photo) continue
      if (!this.isInsideLibrary(photo.filePath)) {
        try {
          this.materializeIntoLibrary(it.id)
        } catch (err) {
          console.warn('[PhotoDataStore] 改名前收库失败，跳过该条:', photo.filePath, err)
          conflicts.push({ id: photo.id, fileName: photo.fileName })
          continue
        }
      }
      safe.push(it)
    }
    const r = photoRepository.renameFiles(safe)
    return { renamed: r.renamed, conflicts: [...conflicts, ...r.conflicts] }
  }

  /** 转换为 WebP：新文件落 userData/converted，入库为新素材（source='converted'），原文件不动 */
  async convertPhotosToWebP(ids: string[]): Promise<number> {
    return this.convertPhotos(ids, { format: 'webp', quality: 82 })
  }

  /**
   * 批量格式转换（F3，对齐 Eagle 格式转换器）：webp/png/jpg/avif 互转，
   * 可选质量与最大宽度；产物落 userData/converted 入库为新素材，原文件不动。
   * png 无质量参数（sharp 忽略），签名保持统一。
   */
  async convertPhotos(
    ids: string[],
    opts: { format: 'webp' | 'png' | 'jpg' | 'avif'; quality?: number; maxWidth?: number }
  ): Promise<number> {
    const sharp = (await import('sharp')).default
    const { join } = await import('path')
    const { mkdirSync, writeFileSync } = await import('fs')
    const dir = activeSubdir('converted')
    mkdirSync(dir, { recursive: true })
    const quality = Math.max(1, Math.min(100, Math.round(opts.quality ?? 82)))
    const maxW = opts.maxWidth && opts.maxWidth > 0 ? Math.round(opts.maxWidth) : null
    const ext = `.${opts.format}`
    const fmt = opts.format === 'jpg' ? 'jpeg' : opts.format
    let count = 0
    for (const id of ids) {
      const photo = photoRepository.getPhotoById(id)
      if (!photo || photo.kind !== 'image') continue
      const lower = photo.fileName.toLowerCase()
      // 同格式跳过（jpg 需同时匹配 .jpg/.jpeg）
      const isSameFormat = opts.format === 'jpg' ? /\.jpe?g$/.test(lower) : lower.endsWith(ext)
      if (isSameFormat) continue
      try {
        let pipeline = sharp(photo.filePath)
        if (maxW) pipeline = pipeline.resize({ width: maxW, withoutEnlargement: true })
        const { data: buffer, info } = await pipeline
          .toFormat(fmt, fmt === 'png' ? {} : { quality })
          .toBuffer({ resolveWithObject: true })
        const base = photo.fileName.replace(/\.[^.]+$/, '')
        const outPath = join(dir, `${Date.now()}_${base}${ext}`)
        writeFileSync(outPath, buffer)
        photoRepository.addPhoto(outPath, {
          source: 'converted',
          kind: 'image',
          width: info.width,
          height: info.height
        })
        count += 1
      } catch (err) {
        console.error('[PhotoDataStore] convert failed:', id, err)
      }
    }
    return count
  }

  /** 规则试运行（编辑智能文件夹时实时预览结果数） */
  async queryPhotosByRules(rules: SmartAlbumRules): Promise<Photo[]> {
    return photoRepository.queryByRules(await applySemanticQuery(rules))
  }

  // —— 以图搜图 / 相似查重（二期） ——

  findSimilarPhotos(photoId: string, threshold = 10): Array<{ photo: Photo; distance: number }> {
    return photoRepository.findSimilarPhotos(photoId, threshold)
  }

  getDuplicatePhotoGroups(
    threshold = 10,
    opts?: { mode?: 'phash' | 'hash'; photoIds?: string[] }
  ): Photo[][] {
    return photoRepository.getDuplicatePhotoGroups(threshold, opts)
  }

  // —— 处理管线（渲染层基本只读，供调试/重跑） ——

  reprocessPhoto(id: string): void {
    photoRepository.setThumbStatus(id, 0)
  }
}

export type { PhotoProcessingResult }
