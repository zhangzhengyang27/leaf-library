/**
 * Leaf · PhotoRepository
 *
 * Schema: photo_photos / photo_albums / photo_album_items / photo_tags
 * 014 起标签绑定全局字典 tag_tags（photo_tags.tag_id 存 tag_tags.id），
 * Photo.tags 对外仍暴露「名称数组」（读时 JOIN 解析，兼容旧渲染端契约）。
 *
 * 业务接口：
 * - getPhotos / getPhotoById / getPhotoByPath / addPhoto / addPhotos
 * - updatePhoto / deletePhoto / deletePhotos / clearAllPhotos
 * - restorePhotos / getRecycleBinPhotos / clearRecycleBin
 * - getPhotosByDateSection / getDateSections
 * - searchPhotos / filterPhotosByTags / getFavoritePhotos / getAllTags
 * - toggleFavorite / setRating / setDescription
 * - addTag / removeTag / addTagToPhotos / removeTagFromPhotos
 * - updateProcessingResult / setThumbStatus / getProcessingPending
 * - queryByRules（智能收藏夹）
 */

import { existsSync, renameSync, statSync } from 'fs'
import { dirname, extname, isAbsolute, join as joinPath, relative } from 'path'
import { v4 as uuidv4 } from 'uuid'
import type Database from 'better-sqlite3'
import { database } from '../database'
import { now, chunkIds } from '../repo'
import { decodePageCursor, encodePageCursor } from '../pageCursor'
import { TagRepository } from './TagRepository'
import { buildSmartAlbumWhere, type SmartAlbumRules } from '../smartAlbumRules'
import { extOfFileName, hueBucketOf } from '../../../shared/colorHue'
import { clusterDuplicates, findSimilar, type PhashItem } from '../photoSimilarity'
import { kindOfExt, DOC_TEXT_QUERY_EXTENSIONS, type AssetKind } from '@shared/assetTypes'
import { sanitizeFileNameBase } from '@shared/filename'

export interface Photo {
  id: string
  filePath: string
  fileName: string
  fileSize: number
  width?: number
  height?: number
  createdAt: number // 拍摄时间（无 EXIF 时为文件修改时间）
  takenAt?: number // EXIF 拍摄时间
  importedAt: number // 导入时间
  modifiedAt: number // 文件修改时间
  tags: string[]
  isFavorite: boolean
  dateSection: string // YYYY-MM-DD
  // —— 014 起新增（处理管线/素材库）——
  kind: AssetKind // image | video | audio | font | file | bookmark（016/017）
  durationMs?: number // 视频/音频时长
  /** 视频实测帧率（022，ffmpeg 探测；逐帧步进按它挪时间） */
  fps?: number
  /** 音频 BPM（024，仅在确实测出正数时挂上，检查器据此决定显不显示） */
  bpm?: number
  folderId?: string // 所属文件夹
  sourceUrl?: string // 书签来源 URL（017，kind='bookmark'）
  rating: number // 0-5
  description?: string
  source: string // manual | screenshot | clipboard | ...
  thumbStatus: number // 0 待处理 / 1 完成 / 2 失败
  phash?: string // 64 位感知哈希（二期以图搜图/查重）
  colorDominant?: string // 主色 #rrggbb
  palette?: string[] // 主色板（006，检查器色点行，Eagle 多色板形态）
  cameraModel?: string
  lensModel?: string
  iso?: number
  aperture?: number
  shutter?: string
  focalLength?: number
  latitude?: number
  longitude?: number
  hash?: string // 文件 md5（精确去重）
  lastViewedAt?: number // 最近查看时间（§3 L4 / §2.B 固定入口）
  fsCreatedAt?: number // 文件系统创建时间（003，排列「创建日期」）
  fsModifiedAt?: number // 文件系统修改时间（003，排列「修改日期」）
  pinnedAt?: number // 置顶时间（004，置顶项视图内优先）
  sourcePath?: string // F11：copy 模式导入时的原始路径
  missingAt?: number // F11：断链标记（扫描时置位，重定位/恢复后清除）
  ocrText?: string // F12：图片内文字（tesseract，搜索/检查器用）
  docText?: string // 迁移 018：文档正文（officeparser，搜索/检查器用）
}

/** 处理管线回填的数据（exifr / sharp / sharp-phash 产物） */
export interface PhotoProcessingResult {
  takenAt?: number | null
  width?: number
  height?: number
  durationMs?: number | null
  /** 视频实测帧率；undefined=本次没探（不覆盖旧值），null=探了但没有 */
  fps?: number | null
  /** 音频波形峰值（400 个 0–255，迁移 024）；同 fps 语义：undefined 不覆盖旧值 */
  waveform?: Uint8Array | Buffer | null
  /** 节拍估计（整数拍/分）；null=算不出节拍感 */
  bpm?: number | null
  hash?: string
  phash?: string
  colorDominant?: string
  palette?: string[]
  cameraModel?: string
  lensModel?: string
  iso?: number
  aperture?: number
  shutter?: string
  focalLength?: number
  latitude?: number
  longitude?: number
}

interface PhotoRow {
  id: string
  source_url?: string | null
  file_path: string
  file_name: string
  file_size: number
  width: number | null
  height: number | null
  taken_at: number | null
  imported_at: number
  updated_at: number
  hash: string | null
  is_favorite: number
  rating: number
  description: string | null
  camera_model: string | null
  lens_model: string | null
  iso: number | null
  aperture: number | null
  shutter: string | null
  focal_length: number | null
  latitude: number | null
  longitude: number | null
  phash: string | null
  color_dominant: string | null
  palette?: string | null
  thumb_status: number
  source: string
  kind: string
  duration_ms: number | null
  fps?: number | null
  /** 024：音频 BPM（列表 SELECT 未取时为空，仅在有值的行上挂到 Photo.bpm） */
  bpm?: number | null
  folder_id: string | null
  deleted_at: number | null
  last_viewed_at: number | null
  fs_created_at: number | null
  fs_modified_at: number | null
  pinned_at: number | null
  source_path?: string | null
  missing_at?: number | null
  ocr_text?: string | null
  doc_text?: string | null
}

const PHOTO_SELECT = `
  SELECT * FROM photo_photos
`

/**
 * 分页排序键（docs/PAGINATION_DESIGN.md §3）。
 * COLLATE 与游标比较一致（BINARY）；
 * taken_at 可空，keyset 下 NULL 比较是坑，未开放。
 * deleted_at 仅在 `deleted_at IS NOT NULL` 的 where 下使用（回收站），
 * 非空约束由查询侧保证（m015 部分索引配契约注释）。
 */
export type PageSortCol =
  | 'imported_at'
  | 'file_name'
  | 'file_size'
  | 'deleted_at'
  | 'rating'
  | 'modified'
  | 'created'
  | 'extension'
  | 'dimensions'
  | 'duration'

/** 阶段 3：排序键 → 非空键表达式（keyset 无 NULL 分组坑；extension 带名称次序键） */
const PAGE_SORT_KEYS: Record<PageSortCol, string[]> = {
  imported_at: ['imported_at'],
  file_name: ['file_name'],
  file_size: ['file_size'],
  deleted_at: ['deleted_at'],
  rating: ['rating'],
  modified: ['COALESCE(fs_modified_at, updated_at)'],
  // 表上没有 created_at（Photo.createdAt 映射自 imported_at），别照模型字段名写列名
  created: ['COALESCE(fs_created_at, taken_at, imported_at)'],
  extension: ['file_ext', 'file_name'],
  dimensions: ['(COALESCE(width, 0) * COALESCE(height, 0))'],
  duration: ['COALESCE(duration_ms, 0)']
}

/** 置顶分组表达式（元组首位；Eagle 行为置顶恒在最前） */
const PAGE_PIN_EXPR = '(pinned_at IS NOT NULL)'

/** 泛化键链：字典序续页条件。exprs=[k0,k1..] vals 与之一一对应，rowidVal 为末位并列键值 */
function buildKeyChainCond(
  exprs: string[],
  vals: Array<string | number | null>,
  rowidVal: number,
  cmp: string
): { sql: string; params: unknown[] } {
  let sql = ''
  const params: unknown[] = []
  for (let i = exprs.length; i >= 0; i--) {
    const isRowid = i === exprs.length
    const expr = isRowid ? 'rowid' : exprs[i]!
    const val = isRowid ? rowidVal : vals[i]!
    if (i === exprs.length) {
      sql = `(${expr} ${cmp} ?)`
      params.unshift(val)
    } else {
      params.unshift(val, val)
      sql = `(${expr} ${cmp} ? OR (${expr} = ? AND ${sql}))`
    }
  }
  return { sql, params }
}

export interface PhotoPage {
  items: Photo[]
  /** null = 已到末页 */
  nextCursor: string | null
  /** 同 WHERE 的总数（与分页无关，供 UI 计数） */
  total: number
}

export class PhotoRepository {
  /** 与本仓库绑定同一 db 的标签字典（避免依赖全局单例，测试可注入） */
  private readonly tagRepo: TagRepository

  constructor(private readonly _db?: Database.Database) {
    this.tagRepo = new TagRepository(_db)
  }

  private get db(): Database.Database {
    return this._db ?? database.handle
  }

  private fromRow(row: PhotoRow, tags: string[]): Photo {
    const p: Photo = {
      id: row.id,
      filePath: row.file_path,
      fileName: row.file_name,
      fileSize: row.file_size,
      createdAt: row.taken_at ?? row.updated_at,
      importedAt: row.imported_at,
      modifiedAt: row.updated_at,
      tags,
      isFavorite: row.is_favorite === 1,
      dateSection: dateSectionOf(row.taken_at ?? row.updated_at),
      rating: row.rating ?? 0,
      source: row.source ?? 'manual',
      thumbStatus: row.thumb_status ?? 0,
      kind: (row.kind as AssetKind) ?? 'image'
    }
    if (row.duration_ms !== null) p.durationMs = row.duration_ms
    if (row.fps !== null && row.fps !== undefined) p.fps = row.fps
    if (typeof row.bpm === 'number' && row.bpm > 0) p.bpm = row.bpm
    if (row.folder_id !== null) p.folderId = row.folder_id
    if (row.fs_created_at !== null && row.fs_created_at > 0) p.fsCreatedAt = row.fs_created_at
    if (row.fs_modified_at !== null && row.fs_modified_at > 0) p.fsModifiedAt = row.fs_modified_at
    if (row.pinned_at !== null && row.pinned_at > 0) p.pinnedAt = row.pinned_at
    if (row.source_url !== null && row.source_url !== undefined) p.sourceUrl = row.source_url
    if (row.taken_at !== null) p.takenAt = row.taken_at
    if (row.width !== null) p.width = row.width
    if (row.height !== null) p.height = row.height
    if (row.description !== null) p.description = row.description
    if (row.hash !== null) p.hash = row.hash
    if (row.phash !== null) p.phash = row.phash
    if (row.color_dominant !== null) p.colorDominant = row.color_dominant
    if (row.palette) {
      try {
        const parsed: unknown = JSON.parse(row.palette)
        if (Array.isArray(parsed))
          p.palette = parsed.filter((c): c is string => typeof c === 'string')
      } catch {
        /* 损坏的 palette 数据按缺失处理 */
      }
    }
    if (row.camera_model !== null) p.cameraModel = row.camera_model
    if (row.lens_model !== null) p.lensModel = row.lens_model
    if (row.iso !== null) p.iso = row.iso
    if (row.aperture !== null) p.aperture = row.aperture
    if (row.shutter !== null) p.shutter = row.shutter
    if (row.focal_length !== null) p.focalLength = row.focal_length
    if (row.latitude !== null) p.latitude = row.latitude
    if (row.longitude !== null) p.longitude = row.longitude
    if (row.last_viewed_at !== null && row.last_viewed_at !== undefined)
      p.lastViewedAt = row.last_viewed_at
    if (row.source_path) p.sourcePath = row.source_path
    if (row.missing_at !== null && row.missing_at !== undefined && row.missing_at > 0)
      p.missingAt = row.missing_at
    if (row.ocr_text) p.ocrText = row.ocr_text
    if (row.doc_text) p.docText = row.doc_text
    return p
  }

  /** 读时解析单张标签名（getPhotoById / 单图场景用） */
  private getTags(photoId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT tt.name AS name
         FROM photo_tags pt
         JOIN tag_tags tt ON tt.id = pt.tag_id AND tt.deleted_at IS NULL
         WHERE pt.photo_id = ?
         ORDER BY tt.name COLLATE NOCASE`
      )
      .all(photoId) as Array<{ name: string }>
    return rows.map((r) => r.name)
  }

  /** 批量解析多张图的标签名（单条 IN 查询，替代逐张 N+1）；分块防参数超限 */
  private getTagsForIds(ids: string[]): Map<string, string[]> {
    const map = new Map<string, string[]>()
    if (ids.length === 0) return map
    for (const chunk of chunkIds(ids)) {
      const placeholders = chunk.map(() => '?').join(',')
      const rows = this.db
        .prepare(
          `SELECT pt.photo_id AS id, tt.name AS name
           FROM photo_tags pt
           JOIN tag_tags tt ON tt.id = pt.tag_id AND tt.deleted_at IS NULL
           WHERE pt.photo_id IN (${placeholders})
           ORDER BY tt.name COLLATE NOCASE`
        )
        .all(...chunk) as Array<{ id: string; name: string }>
      for (const r of rows) {
        const arr = map.get(r.id)
        if (arr) arr.push(r.name)
        else map.set(r.id, [r.name])
      }
    }
    return map
  }

  private loadPhotos(rows: PhotoRow[]): Photo[] {
    const tagMap = this.getTagsForIds(rows.map((r) => r.id))
    return rows.map((r) => this.fromRow(r, tagMap.get(r.id) ?? []))
  }

  private getBase(where: string, order: string, params: unknown[] = []): Photo[] {
    const rows = this.db
      .prepare(`${PHOTO_SELECT} WHERE ${where} ORDER BY ${order}`)
      .all(...params) as PhotoRow[]
    return this.loadPhotos(rows)
  }

  /** 全部（按 imported_at DESC） */
  getAll(): Photo[] {
    return this.getBase('deleted_at IS NULL', 'imported_at DESC')
  }

  /** 兼容 PhotoDataStore.getPhotos() */
  getPhotos(): Photo[] {
    return this.getAll()
  }

  getPhotoById(id: string): Photo | undefined {
    const rows = this.db
      .prepare(`${PHOTO_SELECT} WHERE id = ? AND deleted_at IS NULL`)
      .all(id) as PhotoRow[]
    return rows.length ? this.fromRow(rows[0], this.getTags(id)) : undefined
  }

  getPhotoByPath(filePath: string): Photo | undefined {
    const rows = this.db
      .prepare(`${PHOTO_SELECT} WHERE file_path = ? AND deleted_at IS NULL LIMIT 1`)
      .all(filePath) as PhotoRow[]
    return rows.length ? this.fromRow(rows[0], this.getTags(rows[0].id)) : undefined
  }

  /**
   * 路径是否已登记（含回收站软删行，且是 O(1) 索引式查询）。
   * 供 openPath/showInFolder/openWith 白名单使用：软删素材仍是用户导入过的文件，
   * 回收站右键「在访达中打开」必须继续可用（getPhotoByPath 会漏掉它们）。
   */
  hasPhotoByPath(filePath: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM photo_photos WHERE file_path = ? LIMIT 1`).get(filePath)
  }

  /** 按路径取行，含回收站软删行（回收站素材预览 image://video://rawfile:// 用） */
  getPhotoByPathIncludingDeleted(filePath: string): Photo | undefined {
    const rows = this.db
      .prepare(`${PHOTO_SELECT} WHERE file_path = ? LIMIT 1`)
      .all(filePath) as PhotoRow[]
    return rows.length ? this.fromRow(rows[0], this.getTags(rows[0].id)) : undefined
  }

  /**
   * 按「导入时的原始路径」查已入库素材，含回收站软删行。
   * 拷贝式入库的重复导入判定只能走这条：入库后 file_path 是库内那个副本路径，
   * 与用户再选一次的原路径对不上，光按 file_path 去重会拷出两份、建出两行。
   */
  getPhotoBySourcePathIncludingDeleted(sourcePath: string): Photo | undefined {
    // 同一 source_path 理论上可以有多行（先 add 成引用行、再导入、再迁移）。
    // 不写 ORDER BY 就是"命中哪行看 rowid 心情"，优先活跃行、其次最近导入的那条
    const rows = this.db
      .prepare(
        `${PHOTO_SELECT} WHERE source_path = ?
         ORDER BY (deleted_at IS NULL) DESC, imported_at DESC LIMIT 1`
      )
      .all(sourcePath) as PhotoRow[]
    return rows.length ? this.fromRow(rows[0], this.getTags(rows[0].id)) : undefined
  }

  /** 把回收站里的同路径素材恢复为活跃行（重新导入已软删路径时避免双行并存） */
  private restoreDeletedByPath(filePath: string): Photo | undefined {
    const row = this.db
      .prepare(`SELECT id FROM photo_photos WHERE file_path = ? AND deleted_at IS NOT NULL LIMIT 1`)
      .get(filePath) as { id: string } | undefined
    if (!row) return undefined
    this.db
      .prepare(`UPDATE photo_photos SET deleted_at = NULL, updated_at = ? WHERE id = ?`)
      .run(now(), row.id)
    return this.getPhotoById(row.id)
  }

  /** 新建（按 file_path 唯一），返回 Photo；重复路径返回已存在 */
  addPhoto(
    filePath: string,
    metadata?: {
      width?: number
      height?: number
      fileSize?: number
      createdAt?: number
      modifiedAt?: number
      source?: string
      kind?: AssetKind
      sourceUrl?: string
      description?: string
      sourcePath?: string
      /** copy 模式：原文件的出生时间（副本的 birthtime 是导入那一刻，不能用） */
      fsCreatedAt?: number
    }
  ): Photo {
    const existing = this.getPhotoByPath(filePath)
    if (existing) return existing
    // 同路径素材在回收站（软删）时重新导入 = 恢复：file_path 无 UNIQUE 约束，
    // 直接 INSERT 会造成软删行 + 新活跃行并存。
    // 「必须是普通文件」的校验在 PhotoDataStore 入口层（repository 保持纯数据层）。
    const restored = this.restoreDeletedByPath(filePath)
    if (restored) return restored

    const ts = now()
    const id = uuidv4()
    const fileName = basename(filePath)
    const takenAt = metadata?.createdAt ?? ts
    const kind = metadata?.kind ?? kindOfExt(fileName)

    // 003：文件系统时间在导入时落库（取不到留给回填任务重试）
    // 十五轮 A1：同一 stat 顺带取文件大小（Eagle 卡片/检查器/统计显示真实大小）
    // D-020：copy 模式入库的文件是副本，它的 birthtime 是"这一刻"——原文件的出生时间
    // 由调用方经 metadata.fsCreatedAt 带进来，否则「创建日期」排序整库塌到导入日
    let fsCreatedAt: number | null = metadata?.fsCreatedAt ?? null
    let fsModifiedAt: number | null = null
    let statSize: number | null = null
    try {
      const st = statSync(filePath)
      if (fsCreatedAt == null) {
        fsCreatedAt = Math.round(st.birthtimeMs > 0 ? st.birthtimeMs : st.ctimeMs)
      }
      fsModifiedAt = Math.round(st.mtimeMs)
      statSize = st.size
    } catch {
      /* 文件暂不可达 */
    }
    const fileSize = metadata?.fileSize ?? statSize ?? 0

    this.db
      .prepare(
        `INSERT INTO photo_photos (id, file_path, file_name, file_ext, file_size, width, height, mime_type,
                                   taken_at, imported_at, updated_at, hash, is_favorite, deleted_at,
                                   thumb_status, source, kind, source_url, description, last_viewed_at,
                                   fs_created_at, fs_modified_at, source_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, 0, NULL, 0, ?, ?, ?, ?, NULL, ?, ?, ?)`
      )
      .run(
        id,
        filePath,
        fileName,
        extOfFileName(fileName),
        fileSize,
        metadata?.width ?? null,
        metadata?.height ?? null,
        takenAt,
        ts,
        metadata?.modifiedAt ?? ts,
        metadata?.source ?? 'manual',
        kind,
        metadata?.sourceUrl ?? null,
        metadata?.description ?? null,
        fsCreatedAt,
        fsModifiedAt,
        metadata?.sourcePath ?? null
      )

    return this.getPhotoById(id)!
  }

  /** 批量添加（返回 newPhotos[]）。整批包在单事务里：
   *  旧实现逐条 autocommit，导入 1 万文件 = 1 万次隐式事务同步阻塞主进程，
   *  且中途失败已插入的行不回滚（入库一半的状态） */
  addPhotos(
    filePaths: string[],
    metadataMap?: Map<
      string,
      {
        width?: number
        height?: number
        fileSize?: number
        sourcePath?: string
        fsCreatedAt?: number
      }
    >
  ): Photo[] {
    const out: Photo[] = []
    // 分批事务（200/批）：整批单事务在误选大目录的超大导入下会撑爆
    // SQLite 内存直至 SIGTRAP（实测 33 万行提交时崩溃）；
    // 200/批保持「批内原子 + 有界内存」，导入比逐条 autocommit 快两个数量级
    const BATCH = 200
    for (const batch of chunkIds(filePaths, BATCH)) {
      const tx = this.db.transaction(() => {
        for (const p of batch) {
          const m = metadataMap?.get(p)
          const before = this.getPhotoByPath(p)
          const photo = this.addPhoto(p, m)
          if (!before) out.push(photo)
        }
      })
      tx()
    }
    return out
  }

  /** 置顶/取消置顶（004，视图内置顶项优先展示） */
  setPinned(id: string, pinned: boolean): Photo | undefined {
    const existing = this.getPhotoById(id)
    if (!existing) return undefined
    this.db
      .prepare(`UPDATE photo_photos SET pinned_at = ? WHERE id = ?`)
      .run(pinned ? Date.now() : null, id)
    return this.getPhotoById(id)
  }

  /**
   * 回填一批缺失的文件系统时间（003，启动空闲时分批跑）。
   * 文件已不可达的行写 0 占位，避免每次启动重复扫描。返回本批处理数。
   */
  backfillFileDates(batchSize = 200): number {
    const rows = this.db
      .prepare(`SELECT id, file_path FROM photo_photos WHERE fs_created_at IS NULL LIMIT ?`)
      .all(batchSize) as Array<{ id: string; file_path: string }>
    if (rows.length === 0) return 0

    const update = this.db.prepare(
      `UPDATE photo_photos SET fs_created_at = ?, fs_modified_at = ? WHERE id = ?`
    )
    const tx = this.db.transaction((batch: Array<{ id: string; file_path: string }>): void => {
      for (const r of batch) {
        try {
          const st = statSync(r.file_path)
          update.run(
            Math.round(st.birthtimeMs > 0 ? st.birthtimeMs : st.ctimeMs),
            Math.round(st.mtimeMs),
            r.id
          )
        } catch {
          update.run(0, 0, r.id)
        }
      }
    })
    tx(rows)
    return rows.length
  }

  /**
   * 回填一批缺失的文件大小（十五轮 A1，存量行为 0 的行，启动空闲时分批跑）。
   * 文件已不可达的行写 -1 占位（避免每次启动重复扫描；展示层按 <=0 视为未知）。
   * 返回本批处理数。
   */
  backfillFileSizes(batchSize = 200): number {
    const rows = this.db
      .prepare(`SELECT id, file_path FROM photo_photos WHERE file_size = 0 LIMIT ?`)
      .all(batchSize) as Array<{ id: string; file_path: string }>
    if (rows.length === 0) return 0

    const update = this.db.prepare(`UPDATE photo_photos SET file_size = ? WHERE id = ?`)
    const tx = this.db.transaction((batch: Array<{ id: string; file_path: string }>): void => {
      for (const r of batch) {
        try {
          update.run(statSync(r.file_path).size, r.id)
        } catch {
          update.run(-1, r.id)
        }
      }
    })
    tx(rows)
    return rows.length
  }

  /** 十五轮 A2：取一批「处理已完成但宽高缺失」的图片行（供 AssetProcessingService 兜底补尺寸） */
  getDimensionBackfillPending(limit = 100): Array<{ id: string; file_path: string }> {
    return this.db
      .prepare(
        `SELECT id, file_path FROM photo_photos
         WHERE deleted_at IS NULL AND thumb_status = 1 AND kind = 'image'
           AND (width IS NULL OR height IS NULL) LIMIT ?`
      )
      .all(limit) as Array<{ id: string; file_path: string }>
  }

  /** 十五轮 A2：写入回填的宽高（仅当行内仍为空，避免覆盖并行处理结果） */
  updateBackfilledDimensions(id: string, width: number, height: number): void {
    this.db
      .prepare(
        `UPDATE photo_photos SET width = COALESCE(width, ?), height = COALESCE(height, ?)
         WHERE id = ?`
      )
      .run(width, height, id)
  }

  /** 十五轮批6：取一批「处理已完成但无主色板」的行（旧数据补 5 色板） */
  getPaletteBackfillPending(limit = 100): Array<{ id: string }> {
    return this.db
      .prepare(
        `SELECT id FROM photo_photos
         WHERE deleted_at IS NULL AND thumb_status = 1 AND palette IS NULL LIMIT ?`
      )
      .all(limit) as Array<{ id: string }>
  }

  /** 十五轮批6：写入回填的主色板（JSON 数组） */
  updateBackfilledPalette(id: string, palette: string[]): void {
    this.db
      .prepare(`UPDATE photo_photos SET palette = ?, color_hue = ? WHERE id = ?`)
      .run(JSON.stringify(palette), palette.length > 0 ? hueBucketOf(palette[0]) : null, id)
  }

  /**
   * 022：取一批「已处理完但没有实测帧率」的视频（旧数据在 fps 列之前入库）。
   * 只认 thumb_status=1：待处理的行会由管线自己探，两边同时跑是白付一次 ffmpeg。
   */
  getFpsBackfillPending(limit = 100): Array<{ id: string; file_path: string }> {
    return this.db
      .prepare(
        `SELECT id, file_path FROM photo_photos
         WHERE deleted_at IS NULL AND thumb_status = 1 AND kind = 'video'
           AND fps IS NULL LIMIT ?`
      )
      .all(limit) as Array<{ id: string; file_path: string }>
  }

  /** 音频事实（peaks/duration/bpm）：400 B 一条，不随列表下发，在打开音频预览时按 id 取一次 */
  getAudioFacts(
    id: string
  ): { waveform: Uint8Array | null; bpm: number | null; durationMs: number | null } | null {
    const row = this.db
      .prepare(
        `SELECT waveform, bpm, duration_ms FROM photo_photos WHERE id = ? AND deleted_at IS NULL`
      )
      .get(id) as
      { waveform: Uint8Array | null; bpm: number | null; duration_ms: number | null } | undefined
    if (!row) return null
    return {
      waveform: row.waveform ?? null,
      bpm: row.bpm ?? null,
      durationMs: row.duration_ms ?? null
    }
  }

  /** 022：写入回填的帧率（仅当行内仍为空，避免覆盖并行处理结果） */
  updateBackfilledFps(id: string, fps: number): void {
    this.db.prepare(`UPDATE photo_photos SET fps = COALESCE(fps, ?) WHERE id = ?`).run(fps, id)
  }

  /**
   * 部分更新。合同收窄（审查 P3-5）：旧签名 Partial<Photo> 会误导调用方以为
   * 任意字段都能落库，实际只有下列字段被持久化，其余静默丢弃。
   */
  updatePhoto(
    id: string,
    updates: Partial<
      Pick<Photo, 'width' | 'height' | 'isFavorite' | 'lastViewedAt' | 'sourceUrl' | 'tags'>
    >
  ): Photo | undefined {
    const existing = this.getPhotoById(id)
    if (!existing) return undefined
    const ts = now()
    const next: Photo = { ...existing, ...updates, id }

    const sets: string[] = ['width = ?', 'height = ?', 'is_favorite = ?', 'updated_at = ?']
    const args: unknown[] = [next.width ?? null, next.height ?? null, next.isFavorite ? 1 : 0, ts]
    // 仅当显式传入 lastViewedAt 时更新（避免评分/标签等更新把查看时间洗掉）
    if (updates.lastViewedAt !== undefined) {
      sets.push('last_viewed_at = ?')
      args.push(updates.lastViewedAt ?? null)
    }
    // 六轮：检查器来源链接（Eagle http:// 字段）
    if (updates.sourceUrl !== undefined) {
      sets.push('source_url = ?')
      args.push(updates.sourceUrl ?? null)
    }
    args.push(id)
    this.db
      .prepare(`UPDATE photo_photos SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`)
      .run(...args)

    if (updates.tags !== undefined) {
      const tags = updates.tags
      // 整组替换包进事务；旧实现只 DELETE+重插、不维护 usage_count，
      // 导致标签统计与实际关联永久脱钩
      const tx = this.db.transaction(() => {
        const beforeRows = this.db
          .prepare(`SELECT tag_id FROM photo_tags WHERE photo_id = ?`)
          .all(id) as Array<{ tag_id: string }>
        const before = new Map<string, number>()
        for (const r of beforeRows) before.set(r.tag_id, (before.get(r.tag_id) ?? 0) + 1)

        this.db.prepare(`DELETE FROM photo_tags WHERE photo_id = ?`).run(id)
        const ins = this.db.prepare(
          `INSERT OR IGNORE INTO photo_tags (photo_id, tag_id, created_at) VALUES (?, ?, ?)`
        )
        const after = new Set<string>()
        for (const name of tags) {
          const tagId = this.tagRepo.create(name).id
          ins.run(id, tagId, ts)
          after.add(tagId)
        }
        // 按差集回退/推进计数（与 addTag/removeTag 同口径）
        for (const [tagId, count] of before) {
          if (!after.has(tagId)) this.tagRepo.bumpUsage(tagId, -count)
        }
        for (const tagId of after) {
          if (!before.has(tagId)) this.tagRepo.bumpUsage(tagId, 1)
        }
      })
      tx()
    }

    return this.getPhotoById(id)
  }

  /**
   * round20：替换文件（保留所有元数据：标签/评分/描述/文件夹/来源等）。
   * 仅更新文件相关字段：file_path / file_name / file_size / width / height /
   * hash / phash / thumb_status / kind / duration_ms。
   */
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
      kind?: AssetKind
      durationMs?: number
    }
  ): Photo | undefined {
    const existing = this.getPhotoById(id)
    if (!existing) return undefined
    const ts = now()
    // file_ext 一并维护（审查 P2-10）：替换可能改变扩展名，漏更会让格式筛选/
    // 排序键/016 部分索引对该行永久失真
    this.db
      .prepare(
        `UPDATE photo_photos SET
           file_path = ?, file_name = ?, file_size = ?, file_ext = ?,
           width = ?, height = ?, hash = ?, phash = ?,
           kind = ?, duration_ms = ?, thumb_status = 0, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`
      )
      .run(
        updates.filePath,
        updates.fileName,
        updates.fileSize,
        extOfFileName(updates.fileName),
        updates.width ?? null,
        updates.height ?? null,
        updates.hash ?? null,
        updates.phash ?? null,
        updates.kind ?? existing.kind,
        updates.durationMs ?? null,
        ts,
        id
      )
    return this.getPhotoById(id)
  }

  // —— 软删除 / 回收站 ——

  deletePhoto(id: string): boolean {
    const ts = now()
    const r = this.db
      .prepare(
        `UPDATE photo_photos SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`
      )
      .run(ts, ts, id)
    return r.changes > 0
  }

  deletePhotos(ids: string[]): number {
    if (ids.length === 0) return 0
    const ts = now()
    return this.db.transaction(() => {
      let changes = 0
      for (const chunk of chunkIds(ids)) {
        const placeholders = chunk.map(() => '?').join(',')
        const r = this.db
          .prepare(
            `UPDATE photo_photos SET deleted_at = ?, updated_at = ? WHERE id IN (${placeholders}) AND deleted_at IS NULL`
          )
          .run(ts, ts, ...chunk)
        changes += r.changes
      }
      return changes
    })()
  }

  getRecycleBinPhotos(): Photo[] {
    return this.getBase('deleted_at IS NOT NULL', 'deleted_at DESC')
  }

  /** 从回收站恢复（软删除反向） */
  restorePhotos(ids: string[]): number {
    if (ids.length === 0) return 0
    const ts = now()
    return this.db.transaction(() => {
      let changes = 0
      for (const chunk of chunkIds(ids)) {
        const placeholders = chunk.map(() => '?').join(',')
        const r = this.db
          .prepare(
            `UPDATE photo_photos SET deleted_at = NULL, updated_at = ? WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`
          )
          .run(ts, ...chunk)
        changes += r.changes
      }
      return changes
    })()
  }

  /**
   * 清空回收站：硬删除行 + 孤儿标签关联 + 孤儿语义向量 + 相册/自由网格摆放孤儿行，
   * 并回退标签 usage_count，返回被清理的 photo id
   * （调用方负责清理缩略图目录）
   */
  clearRecycleBin(): string[] {
    const purged = this.db
      .prepare(`SELECT id FROM photo_photos WHERE deleted_at IS NOT NULL`)
      .all() as Array<{ id: string }>
    if (purged.length === 0) return []
    const ids = purged.map((r) => r.id)
    const tx = this.db.transaction(() => {
      for (const chunk of chunkIds(ids)) {
        const placeholders = chunk.map(() => '?').join(',')
        // 先统计待删关联的标签引用数，删完回退 usage_count（与 addTag/removeTag 维护口径一致）
        const tagCounts = this.db
          .prepare(
            `SELECT tag_id, COUNT(*) AS n FROM photo_tags WHERE photo_id IN (${placeholders}) GROUP BY tag_id`
          )
          .all(...chunk) as Array<{ tag_id: string; n: number }>
        this.db.prepare(`DELETE FROM photo_tags WHERE photo_id IN (${placeholders})`).run(...chunk)
        // 旧实现漏了这两张关联表 → 相册条目/自由网格坐标永久残留
        this.db
          .prepare(`DELETE FROM photo_album_items WHERE photo_id IN (${placeholders})`)
          .run(...chunk)
        this.db
          .prepare(`DELETE FROM photo_freeform_pos WHERE photo_id IN (${placeholders})`)
          .run(...chunk)
        // 023 标注同样要跟着清：漏了就剩下一批指向不存在素材的批注，
        // 而这张表没有外键兜底（与上面两张同规则）
        this.db
          .prepare(`DELETE FROM photo_annotations WHERE photo_id IN (${placeholders})`)
          .run(...chunk)
        this.db.prepare(`DELETE FROM photo_photos WHERE id IN (${placeholders})`).run(...chunk)
        for (const t of tagCounts) this.tagRepo.bumpUsage(t.tag_id, -t.n)
      }
    })
    tx()
    return ids
  }

  clearAllPhotos(): void {
    const ts = now()
    this.db
      .prepare(`UPDATE photo_photos SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL`)
      .run(ts, ts)
  }

  /** 按 dateSection 分组 */
  getPhotosByDateSection(): Map<string, Photo[]> {
    const photos = this.getAll()
    const map = new Map<string, Photo[]>()
    for (const p of photos) {
      const section = p.dateSection
      if (!map.has(section)) map.set(section, [])
      map.get(section)!.push(p)
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.createdAt - a.createdAt)
    }
    return map
  }

  getDateSections(): string[] {
    // 本地时区分桶（审查 P3-7）：与 dateSectionOf 的分组语义一致，
    // UTC 分桶会让 UTC+8 用户在本地午夜前后的素材挂错日期组
    const rows = this.db
      .prepare(
        `SELECT DISTINCT date(datetime(taken_at / 1000, 'unixepoch', 'localtime')) AS section
         FROM photo_photos WHERE deleted_at IS NULL`
      )
      .all() as Array<{ section: string | null }>
    return rows
      .map((r) => r.section)
      .filter((s): s is string => s !== null)
      .sort((a, b) => b.localeCompare(a))
  }

  // —— 搜索 / 筛选 ——

  /**
   * 未分类：既不在任何文件夹、也不在任何手动相册里的素材（§3 L4 / §2.B 固定入口）。
   * 反连接下推 SQL（审查 P3-4）：旧实现全表 SELECT + JS 过滤相册集合
   */
  getUnsortedPhotos(): Photo[] {
    const rows = this.db
      .prepare(
        `${PHOTO_SELECT} WHERE deleted_at IS NULL AND folder_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM photo_album_items pai WHERE pai.photo_id = photo_photos.id)
         ORDER BY imported_at DESC`
      )
      .all() as PhotoRow[]
    return this.loadPhotos(rows)
  }

  /** 最近添加（按 imported_at DESC） */
  getRecentPhotos(limit = 200): Photo[] {
    // limit 钳制（审查 P3-20）：负数在 SQLite LIMIT 语义下等于无限制
    const n = Math.min(Math.max(Math.trunc(limit) || 200, 1), 1000)
    const rows = this.db
      .prepare(`${PHOTO_SELECT} WHERE deleted_at IS NULL ORDER BY imported_at DESC LIMIT ?`)
      .all(n) as PhotoRow[]
    return this.loadPhotos(rows)
  }

  /** 最近查看（按 last_viewed_at DESC，仅已记录的） */
  getRecentViewedPhotos(limit = 200): Photo[] {
    // limit 钳制同 getRecentPhotos：渲染层可传，负数在 SQLite 语义下等于无限制
    const n = Math.min(Math.max(Math.trunc(limit) || 200, 1), 1000)
    const rows = this.db
      .prepare(
        `${PHOTO_SELECT} WHERE deleted_at IS NULL AND last_viewed_at IS NOT NULL ORDER BY last_viewed_at DESC LIMIT ?`
      )
      .all(n) as PhotoRow[]
    return this.loadPhotos(rows)
  }

  /**
   * 侧栏固定项计数（全部 / 未标签 / 最近查看）。
   *
   * 单条聚合 SQL：这三项此前由渲染层从「已加载的分页窗口」里数，500 行的窗口
   * 决定徽章最大 500、且与窗口外的真实集合无关——大库上是错的数。
   * 未标签口径与 buildSmartAlbumWhere 的 untaggedOnly 一致：看标签是否活动，
   * 不是看有没有绑定行（字典软删而绑定残留的存量数据要能回到「未标签」）。
   */
  sidebarCounts(): { all: number; untagged: number; recentViewed: number } {
    // 别名不能用 all —— 它是 SQLite 关键字（`AS all` 直接 syntax error）
    const r = this.db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM photo_photos WHERE deleted_at IS NULL) AS all_n,
           (SELECT COUNT(*) FROM photo_photos
              WHERE deleted_at IS NULL AND last_viewed_at IS NOT NULL) AS viewed_n,
           (SELECT COUNT(*) FROM photo_photos p WHERE p.deleted_at IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM photo_tags pt JOIN tag_tags tt ON tt.id = pt.tag_id
                 WHERE pt.photo_id = p.id AND tt.deleted_at IS NULL)) AS untagged_n`
      )
      .get() as { all_n: number; viewed_n: number; untagged_n: number }
    return { all: r.all_n, untagged: r.untagged_n, recentViewed: r.viewed_n }
  }

  /** 标记查看（打开素材/视图时调用，驱动「最近查看」入口） */
  setLastViewed(id: string): void {
    this.db
      .prepare(
        `UPDATE photo_photos SET last_viewed_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`
      )
      .run(now(), now(), id)
  }

  /**
   * 全文搜索（文件名 / 描述 / OCR 文本 / 标签名）。
   *
   * 混合策略：
   * - ≥3 字符：走 FTS5 trigram 索引（m014），子串语义与旧 LIKE 等价且对 CJK 有效，
   *   大库下把 O(n) 全表扫降为索引查找；标签名不在 FTS 内，保持 LIKE EXISTS 并联。
   * - 1-2 字符（中文短词常见）或 FTS 异常：回退旧 LIKE 路径（trigram 最短匹配 3 字符）。
   */
  searchPhotos(query: string): Photo[] {
    const kw = query.trim()
    if (kw === '') return []
    if ([...kw].length >= 3) {
      const viaFts = this.searchViaFts(kw)
      if (viaFts) return viaFts
    }
    return this.searchViaLike(kw)
  }

  /** FTS 路径。MATCH 参数用短语转义（内部双引号翻倍），任何用户输入都不会构成 FTS 语法 */
  private searchViaFts(kw: string): Photo[] | null {
    try {
      const match = `"${kw.replace(/"/g, '""')}"`
      const likeKw = `%${escapeLike(kw)}%`
      return this.getBase(
        `deleted_at IS NULL AND (
           rowid IN (SELECT rowid FROM photo_fts WHERE photo_fts MATCH ?)
           OR EXISTS (
             SELECT 1 FROM photo_tags pt
             JOIN tag_tags tt ON tt.id = pt.tag_id AND tt.deleted_at IS NULL
             WHERE pt.photo_id = photo_photos.id AND tt.name LIKE ? ESCAPE '\\'
           )
         )`,
        'imported_at DESC',
        [match, likeKw]
      )
    } catch (e) {
      // 极端情况下索引损坏也不应让搜索功能失败：退回 LIKE
      console.warn('[PhotoRepository] FTS search failed, fallback to LIKE:', (e as Error).message)
      return null
    }
  }

  private searchViaLike(kw: string): Photo[] {
    const kwLike = `%${escapeLike(kw)}%`
    return this.getBase(
      `deleted_at IS NULL AND (
         file_name LIKE ? ESCAPE '\\'
         OR (description IS NOT NULL AND description LIKE ? ESCAPE '\\')
         OR (ocr_text IS NOT NULL AND ocr_text LIKE ? ESCAPE '\\')
         OR (doc_text IS NOT NULL AND doc_text LIKE ? ESCAPE '\\')
         OR EXISTS (
           SELECT 1 FROM photo_tags pt
           JOIN tag_tags tt ON tt.id = pt.tag_id AND tt.deleted_at IS NULL
           WHERE pt.photo_id = photo_photos.id AND tt.name LIKE ? ESCAPE '\\'
         )
       )`,
      'imported_at DESC',
      [kwLike, kwLike, kwLike, kwLike, kwLike]
    )
  }

  /**
   * keyset 分页取素材（协议与分阶段迁移见 docs/PAGINATION_DESIGN.md）。
   *
   * - 游标 = (排序键, rowid) 复合键，深页码不衰减、插入/删除不漂移错页
   * - where/params 由主进程内部构造（IPC 只收语义参数，渲染层不可传 SQL 片段）
   * - 排序列只开放 NOT NULL 列（taken_at 可空，keyset 下 NULL 比较是坑，暂不开放）
   * - fetch limit+1 探测 hasMore；total 用同 WHERE 的 COUNT
   */
  /**
   * 阶段 3：泛化元组游标分页。
   *
   * - 排序键全部 COALESCE/列表达式为非空（keyset 无 NULL 分组坑）；
   *   extension 额外带 file_name 次序键（JS 排序语义保真）。
   * - 置顶分组在最前：元组 = (pinned, k0[, k1], rowid)，字典序比较。
   * - 游标只携带键值（ks），续页键表达式由主进程按本次 sort 查表取得——
   *   渲染层不可注入任何 SQL 片段（2026-09-18 审查 P0-2）。
   * - 旧游标 { c, r } 单键形态兼容读取（p 恒 0，键表达式取本次 sort 主键）。
   */
  getPhotosPage(opts: {
    where: string
    params?: unknown[]
    sort?: PageSortCol
    desc?: boolean
    cursor?: string | null
    limit?: number
  }): PhotoPage {
    const sortCol = opts.sort ?? 'imported_at'
    const sortExprs = PAGE_SORT_KEYS[sortCol] ?? PAGE_SORT_KEYS['imported_at']
    const desc = opts.desc ?? true
    const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 100), 1), 500)
    const dir = desc ? 'DESC' : 'ASC'
    const cmp = desc ? '<' : '>'

    const conds = [opts.where]
    const params = [...(opts.params ?? [])]
    const decoded = opts.cursor ? decodePageCursor(opts.cursor) : null
    if (opts.cursor && !decoded) {
      console.warn('[PhotoRepository] invalid page cursor ignored, restart from first page')
    }
    if (decoded) {
      // 元组 = (pinned, k0, [k1], rowid)；旧游标无 ks → 主键单分量，p=0。
      // 键表达式一律取自 PAGE_SORT_KEYS[sortCol]（主进程查表），渲染层游标只携带值。
      const pinVal = decoded.p ?? 0
      const keyVals = (decoded.ks ?? (decoded.c != null ? [decoded.c] : [])).filter(
        (v): v is string | number | null =>
          v === null || typeof v === 'string' || typeof v === 'number'
      )
      if (keyVals.length !== sortExprs.length) {
        // 键值数量与排序键数量不符（旧格式游标 / 跨 sort 复用 / 篡改）：丢弃游标回到首页
        console.warn('[PhotoRepository] cursor key count mismatch, restart from first page')
      } else {
        const chain = buildKeyChainCond(sortExprs, keyVals, decoded.r, cmp)
        conds.push(`((${PAGE_PIN_EXPR} ${cmp} ?) OR (${PAGE_PIN_EXPR} = ? AND ${chain.sql}))`)
        params.push(pinVal, pinVal, ...chain.params)
      }
    }

    const baseParams = opts.params ?? []
    const total = (
      this.db
        .prepare(`SELECT COUNT(*) AS n FROM photo_photos WHERE ${opts.where}`)
        .get(...baseParams) as { n: number }
    ).n

    const keySelects = sortExprs.map((e, i) => `, ${e} AS __k${i}`).join('')
    const orderBy = [
      `${PAGE_PIN_EXPR} ${dir}`,
      ...sortExprs.map((e) => `${e} ${dir}`),
      `rowid ${dir}`
    ].join(', ')

    const rows = this.db
      .prepare(
        `SELECT photo_photos.*, photo_photos.rowid AS __page_rowid${keySelects}, ${PAGE_PIN_EXPR} AS __pin
         FROM photo_photos
         WHERE ${conds.join(' AND ')}
         ORDER BY ${orderBy}
         LIMIT ?`
      )
      .all(...params, limit + 1) as (PhotoRow & {
      __page_rowid: number
      __pin: number
      __k0?: string | number
      __k1?: string | number
    })[]

    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows
    const items = this.loadPhotos(pageRows)
    const last = hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1] : null
    return {
      items,
      nextCursor:
        last && typeof last.__page_rowid === 'number'
          ? encodePageCursor({
              p: last.__pin ? 1 : 0,
              ks: sortExprs.map(
                (_, i) => (last as unknown as Record<string, string | number>)[`__k${i}`] ?? null
              ),
              r: last.__page_rowid
            })
          : null,
      total
    }
  }

  /** F12：保存 OCR 识别结果（null=清除回待识别；''=已识别但无文字，避免反复重试） */
  updateOcrText(id: string, text: string | null): Photo | undefined {
    this.db
      .prepare(`UPDATE photo_photos SET ocr_text = ?, updated_at = ? WHERE id = ?`)
      .run(text === null ? null : text, now(), id)
    return this.getPhotoById(id)
  }

  /** F12：待识别清单（图片、缩略图就绪、未识别），批上限 limit */
  listOcrPending(limit = 500): Array<{ id: string; filePath: string }> {
    return this.db
      .prepare(
        `SELECT id, file_path FROM photo_photos
         WHERE deleted_at IS NULL AND kind = 'image' AND thumb_status = 1 AND ocr_text IS NULL
         LIMIT ?`
      )
      .all(limit) as Array<{ id: string; filePath: string }>
  }

  /** 待 OCR 的图片数：SQL 判 `ocr_text IS NULL`。
   *  别用映射后的 Photo.ocrText 数——空串（识别过但没文字）在映射层被丢成 undefined，
   *  会把已完成的素材算成待识别，进度条永远差一截。 */
  countOcrPending(): number {
    const r = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM photo_photos
         WHERE deleted_at IS NULL AND kind = 'image' AND thumb_status = 1 AND ocr_text IS NULL`
      )
      .get() as { n: number }
    return r.n
  }

  /** 保存文档正文抽取结果（null=清除回待抽取；''=抽过但无正文/不可恢复的失败） */
  updateDocText(id: string, text: string | null): Photo | undefined {
    this.db
      .prepare(`UPDATE photo_photos SET doc_text = ?, updated_at = ? WHERE id = ?`)
      .run(text, now(), id)
    return this.getPhotoById(id)
  }

  /**
   * 待抽取正文清单：按 file_ext 命中 DOC_TEXT_QUERY_EXTENSIONS。
   * 这份比 isDocTextFile 宽（含全部代码扩展名）：SQL 表达不了"排除 d.ts/min 产物"，
   * 那些行由 DocTextService 逐条判掉并落 ''，不会留在清单里空转。
   * 用扩展名而不是 kind 过滤——pdf 归 image、docx 归 file，kind 在这条链路上无意义。
   */
  listDocTextPending(limit = 200): Array<{ id: string; filePath: string }> {
    const exts = DOC_TEXT_QUERY_EXTENSIONS
    const placeholders = exts.map(() => `?`).join(',')
    return this.db
      .prepare(
        `SELECT id, file_path FROM photo_photos
         WHERE deleted_at IS NULL AND doc_text IS NULL AND file_ext IN (${placeholders})
         LIMIT ?`
      )
      .all(...exts, limit) as Array<{ id: string; filePath: string }>
  }

  /** 待抽取正文的总数（设置页展示用，避免把整表读进内存） */
  countDocTextPending(): number {
    const exts = DOC_TEXT_QUERY_EXTENSIONS
    const placeholders = exts.map(() => `?`).join(',')
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM photo_photos
         WHERE deleted_at IS NULL AND doc_text IS NULL AND file_ext IN (${placeholders})`
      )
      .get(...exts) as { n: number }
    return row.n
  }

  /** 按 id 批量取（导出/拖出等），保持入参顺序，标签一次批量解析；分块防参数超限 */
  getPhotosByIds(ids: string[]): Photo[] {
    if (ids.length === 0) return []
    const byId = new Map<string, PhotoRow>()
    for (const chunk of chunkIds(ids)) {
      const placeholders = chunk.map(() => '?').join(',')
      const rows = this.db
        .prepare(`${PHOTO_SELECT} WHERE id IN (${placeholders})`)
        .all(chunk) as PhotoRow[]
      for (const r of rows) byId.set(r.id, r)
    }
    const tagMap = this.getTagsForIds(ids)
    return ids
      .map((id) => {
        const r = byId.get(id)
        return r ? this.fromRow(r, tagMap.get(r.id) ?? []) : undefined
      })
      .filter((p): p is Photo => !!p)
  }

  /** 按标签名筛选（全部包含）——Set 交集，避免 O(n×m) includes（审查修复） */
  filterPhotosByTags(tags: string[]): Photo[] {
    if (tags.length === 0) return this.getAll()
    let result: Set<string> | null = null
    const byTag = this.db.prepare(
      `SELECT pt.photo_id AS id
       FROM photo_tags pt
       JOIN tag_tags tt ON tt.id = pt.tag_id AND tt.deleted_at IS NULL
       WHERE LOWER(tt.name) = LOWER(?)`
    )
    for (const name of tags) {
      const ids = new Set((byTag.all(name) as Array<{ id: string }>).map((r) => r.id))
      if (result === null) {
        result = ids
      } else {
        const prev = result
        result = new Set([...prev].filter((id) => ids.has(id)))
      }
      if (result.size === 0) break
    }
    if (!result || result.size === 0) return []
    // 结果集分块取（防 IN 参数超限）；块内各自有序，拼接后需统一按
    // imported_at DESC 重排，否则跨块整体顺序错乱（分块拼接的常见坑）
    const resultIds = Array.from(result)
    const out: Photo[] = []
    for (const chunk of chunkIds(resultIds)) {
      const placeholders = chunk.map(() => '?').join(',')
      out.push(
        ...this.getBase(`deleted_at IS NULL AND id IN (${placeholders})`, 'imported_at DESC', chunk)
      )
    }
    out.sort((a, b) => b.importedAt - a.importedAt)
    return out
  }

  getFavoritePhotos(): Photo[] {
    return this.getBase('deleted_at IS NULL AND is_favorite = 1', 'imported_at DESC')
  }

  toggleFavorite(id: string): Photo | undefined {
    const existing = this.getPhotoById(id)
    if (!existing) return undefined
    return this.updatePhoto(id, { isFavorite: !existing.isFavorite })
  }

  // —— 批量重命名（五期）：磁盘改名 + DB 同步 ——

  /**
   * 批量重命名（磁盘改名 + DB 同步）。目标重名跳过。
   * 两种 payload：`{id, name}` = 渲染端已渲染好的最终基础名（F2 模板引擎）；
   * `{id, pattern, start}` = 兼容旧 {n} 序号路径。
   */
  renameFiles(items: Array<{ id: string; pattern?: string; start?: number; name?: string }>): {
    renamed: Array<{ id: string; fileName: string; filePath: string }>
    conflicts: Array<{ id: string; fileName: string }>
  } {
    const renamed: Array<{ id: string; fileName: string; filePath: string }> = []
    const conflicts: Array<{ id: string; fileName: string }> = []

    for (const item of items) {
      const photo = this.getPhotoById(item.id)
      if (!photo) continue
      const ext = extname(photo.fileName)
      const dir = dirname(photo.filePath)
      let base: string
      if (typeof item.name === 'string' && item.name.trim().length > 0) {
        base = sanitizeFileNameBase(item.name.trim())
      } else {
        const seq = (item.start ?? 1) + renamed.length + conflicts.length
        // pattern 与 name 同样消毒（审查 P1-2）：模板串来自渲染层，`../` 会逃出素材目录
        base = sanitizeFileNameBase((item.pattern ?? '').replace(/\{n\}/g, String(seq)))
      }
      const newName = `${base || extname(photo.fileName).slice(1) || photo.fileName}${ext}`
      const target = joinPath(dir, newName)
      // 双保险：解析后的目标必须仍在素材原目录内
      if (relative(dir, target).startsWith('..') || isAbsolute(relative(dir, target))) {
        conflicts.push({ id: photo.id, fileName: newName })
        continue
      }
      if (existsSync(target)) {
        conflicts.push({ id: photo.id, fileName: newName })
        continue
      }
      renameSync(photo.filePath, target)
      this.db
        .prepare(
          `UPDATE photo_photos SET file_path = ?, file_name = ?, updated_at = ? WHERE id = ?`
        )
        .run(target, newName, now(), photo.id)
      renamed.push({ id: photo.id, fileName: newName, filePath: target })
    }
    return { renamed, conflicts }
  }

  // —— 评分 / 描述 ——

  setRating(id: string, rating: number): Photo | undefined {
    const clamped = Math.max(0, Math.min(5, Math.round(rating)))
    this.db
      .prepare(
        `UPDATE photo_photos SET rating = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`
      )
      .run(clamped, now(), id)
    return this.getPhotoById(id)
  }

  setDescription(id: string, description: string): Photo | undefined {
    this.db
      .prepare(
        `UPDATE photo_photos SET description = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`
      )
      .run(description, now(), id)
    return this.getPhotoById(id)
  }

  /** 批量更新（评分/描述/收藏等）：单事务一次 UPDATE ... WHERE id IN，替代逐张 IPC */
  updatePhotos(
    ids: string[],
    updates: Partial<Pick<Photo, 'rating' | 'description' | 'isFavorite' | 'lastViewedAt'>>
  ): Photo[] {
    if (ids.length === 0) return []
    const ts = now()
    const sets: string[] = ['updated_at = ?']
    const args: unknown[] = [ts]
    if (updates.rating !== undefined) {
      sets.push('rating = ?')
      args.push(Math.max(0, Math.min(5, Math.round(updates.rating))))
    }
    if (updates.description !== undefined) {
      sets.push('description = ?')
      args.push(updates.description)
    }
    if (updates.isFavorite !== undefined) {
      sets.push('is_favorite = ?')
      args.push(updates.isFavorite ? 1 : 0)
    }
    if (updates.lastViewedAt !== undefined) {
      sets.push('last_viewed_at = ?')
      args.push(updates.lastViewedAt)
    }
    const sqlBase = `UPDATE photo_photos SET ${sets.join(', ')} WHERE id IN (`
    this.db.transaction(() => {
      // id 分块：一条 UPDATE 绑定几万个 id 会超 SQLite 参数上限
      for (const chunk of chunkIds(ids)) {
        const placeholders = chunk.map(() => '?').join(',')
        this.db.prepare(`${sqlBase}${placeholders}) AND deleted_at IS NULL`).run(...args, ...chunk)
      }
    })()
    // 回读更新后的照片（保持入参顺序）；标签不在此次批量范围故直接复用
    const byId = new Map(this.getPhotosByIds(ids).map((p) => [p.id, p]))
    return ids.map((id) => byId.get(id)).filter((p): p is Photo => !!p)
  }

  // —— 标签（字典化写入） ——

  private linkTag(photoId: string, tagName: string): void {
    const tag = this.tagRepo.create(tagName) // 同名（不区分大小写）复用已有行
    this.db
      .prepare(`INSERT OR IGNORE INTO photo_tags (photo_id, tag_id, created_at) VALUES (?, ?, ?)`)
      .run(photoId, tag.id, now())
    this.tagRepo.bumpUsage(tag.id, 1)
  }

  addTag(id: string, tag: string): Photo | undefined {
    const existing = this.getPhotoById(id)
    if (!existing) return undefined
    if (existing.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return existing
    this.linkTag(id, tag)
    return this.getPhotoById(id)
  }

  removeTag(id: string, tagName: string): Photo | undefined {
    const existing = this.getPhotoById(id)
    if (!existing) return undefined
    const row = this.db
      .prepare(
        `SELECT pt.tag_id AS tagId FROM photo_tags pt
         LEFT JOIN tag_tags tt ON tt.id = pt.tag_id
         WHERE pt.photo_id = ? AND (tt.name = ? COLLATE NOCASE OR pt.tag_id = ?)`
      )
      .get(id, tagName, tagName) as { tagId: string } | undefined
    if (!row) return existing
    this.db.prepare(`DELETE FROM photo_tags WHERE photo_id = ? AND tag_id = ?`).run(id, row.tagId)
    this.tagRepo.bumpUsage(row.tagId, -1)
    return this.getPhotoById(id)
  }

  addTagToPhotos(ids: string[], tag: string): number {
    const tx = this.db.transaction((idList: string[]) => {
      let count = 0
      // 批量集合 SQL（审查 P3-4）：旧实现逐张 getPhotoById（2 条 SQL）+ linkTag，
      // 500 张选择 ≈ 2500 条语句；改为两条集合语句
      const tagName = tag.trim().toLowerCase()
      const existingTag = this.db
        .prepare(`SELECT id FROM tag_tags WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL`)
        .get(tagName) as { id: string } | undefined
      let tagId = existingTag?.id
      if (!tagId) {
        tagId = this.tagRepo.create(tag.trim())?.id // 同名（不区分大小写）复用已有行
        if (!tagId) return 0
      }
      for (const id of idList) {
        const photoExists = this.db
          .prepare(`SELECT 1 FROM photo_photos WHERE id = ? AND deleted_at IS NULL`)
          .get(id)
        if (!photoExists) continue
        const inserted = this.db
          .prepare(
            `INSERT OR IGNORE INTO photo_tags (photo_id, tag_id, created_at) VALUES (?, ?, ?)`
          )
          .run(id, tagId, Date.now())
        if (inserted.changes > 0) count += 1
      }
      this.tagRepo.bumpUsage(tagId, count)
      return count
    })
    return tx(ids)
  }

  removeTagFromPhotos(ids: string[], tagName: string): number {
    const tx = this.db.transaction((idList: string[]) => {
      let count = 0
      // 批量集合 SQL（审查 P3-4）：一次找出标签，逐项 DELETE 收集受影响行
      const row = this.db
        .prepare(`SELECT id FROM tag_tags WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL`)
        .get(tagName) as { id: string } | undefined
      if (!row) return 0
      const deleteStmt = this.db.prepare(`DELETE FROM photo_tags WHERE photo_id = ? AND tag_id = ?`)
      for (const id of idList) {
        const res = deleteStmt.run(id, row.id)
        if (res.changes > 0) count += 1
      }
      this.tagRepo.bumpUsage(row.id, -count)
      return count
    })
    return tx(ids)
  }

  /** 图库在用的标签名（去重排序） */
  getAllTags(): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT tt.name AS name
         FROM photo_tags pt
         JOIN tag_tags tt ON tt.id = pt.tag_id AND tt.deleted_at IS NULL`
      )
      .all() as Array<{ name: string }>
    return Array.from(new Set(rows.map((r) => r.name))).sort()
  }

  getPhotoCount(): number {
    const r = this.db
      .prepare(`SELECT COUNT(*) AS n FROM photo_photos WHERE deleted_at IS NULL`)
      .get() as { n: number }
    return r.n
  }

  /** 库统计（六期 MCP 用，审查改 SQL 聚合：全量 getPhotos 在大库只为计数太重） */
  getLibraryStats(): {
    total: number
    byKind: Record<string, number>
    favorites: number
    firstImportedAt: number | null
    lastImportedAt: number | null
  } {
    const rows = this.db
      .prepare(
        `SELECT kind, COUNT(*) AS n, COALESCE(SUM(is_favorite), 0) AS fav,
                MIN(imported_at) AS first_at, MAX(imported_at) AS last_at
         FROM photo_photos WHERE deleted_at IS NULL GROUP BY kind`
      )
      .all() as Array<{
      kind: string | null
      n: number
      fav: number
      first_at: number | null
      last_at: number | null
    }>
    const byKind: Record<string, number> = {}
    let total = 0
    let favorites = 0
    let first: number | null = null
    let last: number | null = null
    for (const r of rows) {
      const k = r.kind ?? 'image'
      byKind[k] = r.n
      total += r.n
      favorites += r.fav
      if (r.first_at != null && (first === null || r.first_at < first)) first = r.first_at
      if (r.last_at != null && (last === null || r.last_at > last)) last = r.last_at
    }
    return { total, byKind, favorites, firstImportedAt: first, lastImportedAt: last }
  }

  /** 库统计扩展维度（阶段 4.5 统计面板：类型/格式/大小/导入趋势/评分分布） */
  getStatsDetail(): {
    total: number
    favorites: number
    totalSize: number
    totalDuration: number
    byKind: Record<string, number>
    byFormat: Array<{ format: string; count: number }>
    bySize: Array<{ label: string; count: number }>
    importTrend: Array<{ month: string; count: number }>
    ratingDist: Array<{ rating: number; count: number }>
  } {
    const base = this.getLibraryStats()

    const byFormat = (
      this.db
        .prepare(
          `SELECT
             COALESCE(NULLIF(substr(file_name, instr(file_name, '.') + 1), file_name), '—') AS format,
             COUNT(*) AS n
           FROM photo_photos WHERE deleted_at IS NULL
           GROUP BY format ORDER BY n DESC LIMIT 12`
        )
        .all() as Array<{ format: string; n: number }>
    ).map((r) => ({ format: r.format.toLowerCase(), count: r.n }))

    const sizeRows = this.db
      .prepare(
        `SELECT
           CASE
             WHEN file_size < 1048576 THEN '0-1MB'
             WHEN file_size < 5242880 THEN '1-5MB'
             WHEN file_size < 20971520 THEN '5-20MB'
             WHEN file_size < 104857600 THEN '20-100MB'
             ELSE '100MB+'
           END AS bucket,
           COUNT(*) AS n
         FROM photo_photos WHERE deleted_at IS NULL
         GROUP BY bucket`
      )
      .all() as Array<{ bucket: string | null; n: number }>
    const SIZE_ORDER = ['0-1MB', '1-5MB', '5-20MB', '20-100MB', '100MB+']
    const bySize = SIZE_ORDER.map((label) => ({
      label,
      count: sizeRows.find((r) => r.bucket === label)?.n ?? 0
    }))

    const trendRows = this.db
      .prepare(
        `SELECT strftime('%Y-%m', imported_at / 1000, 'unixepoch') AS month, COUNT(*) AS n
         FROM photo_photos WHERE deleted_at IS NULL
         GROUP BY month`
      )
      .all() as Array<{ month: string; n: number }>
    const trendMap = new Map(trendRows.map((r) => [r.month, r.n]))
    // 补全最近 12 个月，保证连续
    const importTrend: Array<{ month: string; count: number }> = []
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      importTrend.push({ month: key, count: trendMap.get(key) ?? 0 })
    }

    const ratingRows = this.db
      .prepare(
        `SELECT rating, COUNT(*) AS n FROM photo_photos
         WHERE deleted_at IS NULL GROUP BY rating`
      )
      .all() as Array<{ rating: number; n: number }>
    const ratingMap = new Map(ratingRows.map((r) => [r.rating, r.n]))
    const ratingDist = [0, 1, 2, 3, 4, 5].map((rating) => ({
      rating,
      count: ratingMap.get(rating) ?? 0
    }))

    const sumRow = this.db
      .prepare(
        `SELECT COALESCE(SUM(MAX(file_size, 0)), 0) AS size, COALESCE(SUM(duration_ms), 0) AS duration
         FROM photo_photos WHERE deleted_at IS NULL`
      )
      .get() as { size: number; duration: number }

    return {
      total: base.total,
      favorites: base.favorites,
      totalSize: sumRow.size,
      totalDuration: sumRow.duration,
      byKind: base.byKind,
      byFormat,
      bySize,
      importTrend,
      ratingDist
    }
  }

  // —— 处理管线（AssetProcessingService 回填） ——

  /** 回填 EXIF/缩略图/哈希/主色，并置 thumb_status = done */
  updateProcessingResult(id: string, result: PhotoProcessingResult): void {
    this.db
      .prepare(
        `UPDATE photo_photos SET
           taken_at = COALESCE(?, taken_at),
           width = COALESCE(?, width),
           height = COALESCE(?, height),
           duration_ms = ?,
           fps = COALESCE(?, fps),
           waveform = COALESCE(?, waveform),
           bpm = COALESCE(?, bpm),
           hash = COALESCE(?, hash),
           phash = ?,
           color_dominant = ?,
           color_hue = ?,
           palette = ?,
           camera_model = COALESCE(?, camera_model),
           lens_model = COALESCE(?, lens_model),
           iso = COALESCE(?, iso),
           aperture = COALESCE(?, aperture),
           shutter = COALESCE(?, shutter),
           focal_length = COALESCE(?, focal_length),
           latitude = COALESCE(?, latitude),
           longitude = COALESCE(?, longitude),
           thumb_status = 1,
           updated_at = ?
         WHERE id = ?`
      )
      .run(
        result.takenAt ?? null,
        result.width ?? null,
        result.height ?? null,
        result.durationMs ?? null,
        result.fps ?? null,
        // 峰值是 Uint8Array，better-sqlite3 直接当 BLOB 绑定
        result.waveform ?? null,
        result.bpm ?? null,
        result.hash ?? null,
        result.phash ?? null,
        result.colorDominant ?? null,
        result.colorDominant ? hueBucketOf(result.colorDominant) : null,
        result.palette ? JSON.stringify(result.palette) : null,
        result.cameraModel ?? null,
        result.lensModel ?? null,
        result.iso ?? null,
        result.aperture ?? null,
        result.shutter ?? null,
        result.focalLength ?? null,
        result.latitude ?? null,
        result.longitude ?? null,
        now(),
        id
      )
  }

  /**
   * 就地编辑后回写"文件事实"：尺寸与大小。
   *
   * 为什么不能等处理管线来填：图片分支的 updateProcessingResult 压根不传 width/height
   * （只有 video/pdf 传），而那条 SQL 又是 `width = COALESCE(?, width)`——
   * 于是转一次 90°，文件已经是竖的、库里还记着横的，颜色/尺寸筛选与壁纸适配全按旧值算。
   * 单靠"重新入队"补不回来，必须由改文件的人当场写。
   */
  updateFileFacts(
    id: string,
    facts: { size: number; width: number | null; height: number | null }
  ): void {
    this.db
      .prepare(
        `UPDATE photo_photos SET file_size = ?, width = ?, height = ?, updated_at = ? WHERE id = ?`
      )
      .run(facts.size, facts.width, facts.height, now(), id)
  }

  setThumbStatus(id: string, status: 0 | 1 | 2): void {
    this.db.prepare(`UPDATE photo_photos SET thumb_status = ? WHERE id = ?`).run(status, id)
  }

  /**
   * 待处理的图片（按导入时间正序，旧图优先）。
   * statusOnly=false（默认）只取 0=未处理；启动恢复用，避免永久失败的图每次启动反复重试。
   * statusOnly=true 额外包含 2=失败（手动「重新处理」场景）。
   */
  getProcessingPending(limit?: number, statusOnly = false): Photo[] {
    const cond = statusOnly ? 'thumb_status != 1' : 'thumb_status = 0'
    const sql = `${PHOTO_SELECT} WHERE deleted_at IS NULL AND ${cond} ORDER BY imported_at ASC${limit ? ' LIMIT ?' : ''}`
    const rows = (
      limit ? this.db.prepare(sql).all(limit) : this.db.prepare(sql).all()
    ) as PhotoRow[]
    return this.loadPhotos(rows)
  }

  // —— 智能收藏夹 ——

  queryByRules(rules: SmartAlbumRules): Photo[] {
    const { whereSql, params } = buildSmartAlbumWhere(rules)
    let photos = this.getBase(`deleted_at IS NULL AND (${whereSql})`, 'imported_at DESC', params)
    // 色相桶需在 JS 侧按主色计算过滤（SQLite 不便计算色相）
    if (rules.colorHue) {
      photos = photos.filter((p) => hueBucketOf(p.colorDominant) === rules.colorHue)
    }
    return photos
  }

  // —— 以图搜图 / 相似查重（二期） ——

  /** 全库已算好 phash 的图片（相似度计算的输入） */
  getAllPhashItems(): PhashItem[] {
    return this.db
      .prepare(`SELECT id, phash FROM photo_photos WHERE deleted_at IS NULL AND phash IS NOT NULL`)
      .all() as PhashItem[]
  }

  /** 以图搜图：与指定图片相似（汉明距离 ≤ threshold），按距离升序 */
  findSimilarPhotos(photoId: string, threshold = 10): Array<{ photo: Photo; distance: number }> {
    const items = this.getAllPhashItems()
    if (!items.some((it) => it.id === photoId)) return []
    const matches = findSimilar(items, photoId, threshold)
    const out: Array<{ photo: Photo; distance: number }> = []
    for (const m of matches) {
      const photo = this.getPhotoById(m.id)
      if (photo) out.push({ photo, distance: m.distance })
    }
    return out
  }

  /**
   * 查重（F5，对齐 Eagle「扫描相似图片/扫描相同文件」+ 范围）：
   * - mode 'phash'（默认）：感知哈希汉明距离 ≤ threshold 聚类
   * - mode 'hash'：md5 精确分组
   * - photoIds：范围限定（当前视图/已选快照），缺省 = 全库
   * 返回 ≥2 张的组，大组优先。
   */
  getDuplicatePhotoGroups(
    threshold = 10,
    opts?: { mode?: 'phash' | 'hash'; photoIds?: string[] }
  ): Photo[][] {
    const mode = opts?.mode ?? 'phash'
    const scopeIds = opts?.photoIds

    if (mode === 'hash') {
      const params = scopeIds && scopeIds.length > 0 ? scopeIds : null
      const rows: Array<{ id: string; hash: string }> = []
      if (params) {
        for (const chunk of chunkIds(params)) {
          const placeholders = chunk.map(() => '?').join(',')
          rows.push(
            ...(this.db
              .prepare(
                `SELECT id, hash FROM photo_photos
                 WHERE deleted_at IS NULL AND hash IS NOT NULL
                   AND id IN (${placeholders})`
              )
              .all(...chunk) as Array<{ id: string; hash: string }>)
          )
        }
      } else {
        rows.push(
          ...(this.db
            .prepare(
              `SELECT id, hash FROM photo_photos WHERE deleted_at IS NULL AND hash IS NOT NULL`
            )
            .all() as Array<{ id: string; hash: string }>)
        )
      }
      const byHash = new Map<string, string[]>()
      for (const r of rows) {
        const list = byHash.get(r.hash) ?? []
        list.push(r.id)
        byHash.set(r.hash, list)
      }
      const out: Photo[][] = []
      for (const ids of byHash.values()) {
        if (ids.length < 2) continue
        const photos = ids
          .map((id) => this.getPhotoById(id))
          .filter((p): p is Photo => p !== undefined)
        if (photos.length >= 2) out.push(photos)
      }
      return out.sort((a, b) => b.length - a.length)
    }

    let items = this.getAllPhashItems()
    if (scopeIds && scopeIds.length > 0) {
      const allow = new Set(scopeIds)
      items = items.filter((it) => allow.has(it.id))
    }
    if (items.length < 2) return []
    const groups = clusterDuplicates(items, threshold)
    const out: Photo[][] = []
    for (const group of groups) {
      const photos = group
        .map((id) => this.getPhotoById(id))
        .filter((p): p is Photo => p !== undefined)
      if (photos.length >= 2) out.push(photos)
    }
    // 大组优先
    return out.sort((a, b) => b.length - a.length)
  }

  // —— F11：库拷贝式存储 / 断链 ——

  /** 全库（未删除）路径清单：断链扫描 / 迁移器的输入 */
  listAllForStorageScan(): Array<{ id: string; filePath: string; missingAt: number | null }> {
    const rows = this.db
      .prepare(`SELECT id, file_path, missing_at FROM photo_photos WHERE deleted_at IS NULL`)
      .all() as Array<{ id: string; file_path: string; missing_at: number | null }>
    return rows.map((r) => ({ id: r.id, filePath: r.file_path, missingAt: r.missing_at ?? null }))
  }

  /** 断链标记（missingAt=null 恢复正常） */
  setMissing(id: string, missingAt: number | null): void {
    this.db.prepare(`UPDATE photo_photos SET missing_at = ? WHERE id = ?`).run(missingAt, id)
  }

  /** 重新定位：换绑到新路径并清除断链标记（元数据保留）。file_ext 同步维护（审查 P2-10） */
  relinkPhoto(id: string, newPath: string, sourcePath?: string): Photo | undefined {
    const existing = this.getPhotoById(id)
    if (!existing) return undefined
    this.db
      .prepare(
        `UPDATE photo_photos SET file_path = ?, file_name = ?, file_ext = ?, missing_at = NULL,
           source_path = COALESCE(?, source_path), updated_at = ? WHERE id = ?`
      )
      .run(
        newPath,
        basename(newPath),
        extOfFileName(basename(newPath)),
        sourcePath ?? null,
        now(),
        id
      )
    return this.getPhotoById(id)
  }

  /** F17：断链素材清单（库目录移动修复的输入） */
  listMissing(): Array<{ id: string; filePath: string }> {
    const rows = this.db
      .prepare(
        `SELECT id, file_path FROM photo_photos WHERE deleted_at IS NULL AND missing_at IS NOT NULL`
      )
      .all() as Array<{ id: string; file_path: string }>
    return rows.map((r) => ({ id: r.id, filePath: r.file_path }))
  }

  /** F17：批量换绑（事务；newPath 换绑 + 清 missing_at）。file_ext 同步维护（审查 P2-10） */
  relinkBatch(batch: Array<{ id: string; newPath: string }>): number {
    const stmt = this.db.prepare(
      `UPDATE photo_photos SET file_path = ?, file_name = ?, file_ext = ?, missing_at = NULL, updated_at = ? WHERE id = ?`
    )
    const tx = this.db.transaction(() => {
      for (const it of batch)
        stmt.run(
          it.newPath,
          basename(it.newPath),
          extOfFileName(basename(it.newPath)),
          now(),
          it.id
        )
    })
    tx()
    return batch.length
  }

  /** 迁移器批量换绑（copy 入库后）：事务更新 file_path/file_name/source_path */
  updateMigrationBatch(
    batch: Array<{ id: string; filePath: string; fileName: string; sourcePath: string }>
  ): void {
    const stmt = this.db.prepare(
      `UPDATE photo_photos
       SET file_path = ?, file_name = ?, source_path = ?, updated_at = ? WHERE id = ?`
    )
    const tx = this.db.transaction(() => {
      for (const it of batch) stmt.run(it.filePath, it.fileName, it.sourcePath, now(), it.id)
    })
    tx()
  }
}

function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return idx >= 0 ? p.slice(idx + 1) : p
}

function dateSectionOf(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** LIKE 通配符转义（% _ \） */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export const photoRepository = new PhotoRepository()
