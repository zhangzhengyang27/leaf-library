/**
 * Leaf · PhotoFolderRepository
 *
 * Schema: photo_folders（016，层级预留 parent_id）
 * 素材库手动文件夹分组（Eagle 文件夹维度）；与手动相册互补：文件夹做归类，相册做有序集合。
 */

import { v4 as uuidv4 } from 'uuid'
import type Database from 'better-sqlite3'
import { database } from '../database'
import { now, chunkIds } from '../repo'

export interface PhotoFolder {
  id: string
  name: string
  parentId: string | null
  photoCount: number
  createdAt: number
  updatedAt: number
  /** 文件夹密码（safeStorage 加密 base64，m004；undefined = 未设置） */
  password?: string
  /** 文件夹封面素材 id（m004，侧栏缩略图） */
  coverPhotoId?: string
  /** 文件夹描述（m004，Eagle 文件夹检查器有描述字段） */
  description?: string
  /** 八轮：布局覆盖（m005，NULL=跟随全局） */
  viewLayout?: string
  /** 八轮：排列覆盖（m005，NULL=跟随全局） */
  viewSort?: string
  /** 八轮：显示开关覆盖（m005，JSON 部分对象；NULL=跟随全局） */
  viewDisplay?: string
  /** 十五轮 D19：文件夹颜色（'#rrggbb'；undefined=自动色） */
  color?: string
  /** 二十四轮：emoji 图标（NULL=默认文件夹图形） */
  icon?: string
  /** 二十四轮：自动标签规则（JSON string[] 标签名；undefined=未设置） */
  autoTags?: string
}

interface FolderRow {
  id: string
  name: string
  parent_id: string | null
  sort_order: number
  created_at: number
  updated_at: number
  password: string | null
  cover_photo_id: string | null
  description: string | null
  view_layout: string | null
  view_sort: string | null
  view_display: string | null
  color: string | null
  icon: string | null
  auto_tags: string | null
}

export class PhotoFolderRepository {
  constructor(private readonly _db?: Database.Database) {}

  private get db(): Database.Database {
    return this._db ?? database.handle
  }

  private fromRow(row: FolderRow, photoCount: number): PhotoFolder {
    const f: PhotoFolder = {
      id: row.id,
      name: row.name,
      parentId: row.parent_id,
      photoCount,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
    if (row.password) f.password = row.password
    if (row.cover_photo_id) f.coverPhotoId = row.cover_photo_id
    if (row.description) f.description = row.description
    if (row.view_layout) f.viewLayout = row.view_layout
    if (row.view_sort) f.viewSort = row.view_sort
    if (row.view_display) f.viewDisplay = row.view_display
    if (row.color) f.color = row.color
    if (row.icon) f.icon = row.icon
    if (row.auto_tags) f.autoTags = row.auto_tags
    return f
  }

  /** m004：读取加密密码（null = 未设置；仅供 FolderLockService） */
  getPassword(folderId: string): string | null {
    const row = this.db.prepare(`SELECT password FROM photo_folders WHERE id = ?`).get(folderId) as
      | { password: string | null }
      | undefined
    return row?.password ?? null
  }

  /** m004：设置/清除加密密码（传 null 清除） */
  setPassword(folderId: string, encrypted: string | null): void {
    this.db
      .prepare(`UPDATE photo_folders SET password = ?, updated_at = ? WHERE id = ?`)
      .run(encrypted, now(), folderId)
  }

  /** m004：设置文件夹描述 */
  setDescription(folderId: string, description: string | null): void {
    this.db
      .prepare(`UPDATE photo_folders SET description = ?, updated_at = ? WHERE id = ?`)
      .run(description, now(), folderId)
  }

  /** m004：设置/清除文件夹封面素材 */
  setCover(folderId: string, photoId: string | null): void {
    this.db
      .prepare(`UPDATE photo_folders SET cover_photo_id = ?, updated_at = ? WHERE id = ?`)
      .run(photoId, now(), folderId)
  }

  /** 十五轮 D19：设置/清除文件夹颜色（null=恢复自动色） */
  setColor(folderId: string, hex: string | null): void {
    this.db
      .prepare(`UPDATE photo_folders SET color = ?, updated_at = ? WHERE id = ?`)
      .run(hex, now(), folderId)
  }

  /** m005：保存文件夹视图覆盖（null=清除，回到跟随全局） */
  setViewSettings(
    folderId: string,
    settings: { layout: string | null; sort: string | null; display: string | null }
  ): void {
    this.db
      .prepare(
        `UPDATE photo_folders
         SET view_layout = ?, view_sort = ?, view_display = ?, updated_at = ? WHERE id = ?`
      )
      .run(settings.layout, settings.sort, settings.display, now(), folderId)
  }

  /** 二十四轮：设置/清除 emoji 图标（null=默认图形） */
  setIcon(folderId: string, icon: string | null): void {
    this.db
      .prepare(`UPDATE photo_folders SET icon = ?, updated_at = ? WHERE id = ?`)
      .run(icon, now(), folderId)
  }

  /** 二十四轮：保存/清除自动标签规则（tagsJson = JSON string[]，null=清除） */
  setAutoTags(folderId: string, tagsJson: string | null): void {
    this.db
      .prepare(`UPDATE photo_folders SET auto_tags = ?, updated_at = ? WHERE id = ?`)
      .run(tagsJson, now(), folderId)
  }

  /** F10：读取文件夹的自由网格摆放 */
  getFreeformPositions(
    folderId: string
  ): Array<{ photoId: string; x: number; y: number; scale: number }> {
    const rows = this.db
      .prepare(`SELECT photo_id, x, y, scale FROM photo_freeform_pos WHERE folder_id = ?`)
      .all(folderId) as Array<{ photo_id: string; x: number; y: number; scale: number }>
    return rows.map((r) => ({ photoId: r.photo_id, x: r.x, y: r.y, scale: r.scale }))
  }

  /** F10：整文件夹覆盖式保存自由网格摆放（事务） */
  setFreeformPositions(
    folderId: string,
    items: Array<{ photoId: string; x: number; y: number; scale: number }>
  ): void {
    const del = this.db.prepare(`DELETE FROM photo_freeform_pos WHERE folder_id = ?`)
    const ins = this.db.prepare(
      `INSERT OR REPLACE INTO photo_freeform_pos (folder_id, photo_id, x, y, scale)
       VALUES (?, ?, ?, ?, ?)`
    )
    const tx = this.db.transaction(() => {
      del.run(folderId)
      for (const it of items) {
        ins.run(folderId, it.photoId, it.x, it.y, it.scale)
      }
    })
    tx()
  }

  getAutoTags(folderId: string): string[] {
    const row = this.db
      .prepare(`SELECT auto_tags FROM photo_folders WHERE id = ?`)
      .get(folderId) as { auto_tags: string | null } | undefined
    if (!row?.auto_tags) return []
    try {
      const parsed = JSON.parse(row.auto_tags) as unknown
      return Array.isArray(parsed) ? (parsed as string[]) : []
    } catch {
      return []
    }
  }

  /** 二十四轮：移动文件夹到新父级（null=根级）。禁止移入自身或自身后代（防环） */
  move(id: string, newParentId: string | null): void {
    if (newParentId === id) throw new Error('[PhotoFolderRepository] parent cannot be self')
    if (newParentId && !this.getById(newParentId))
      throw new Error('[PhotoFolderRepository] target parent not found')
    const isDescendant = this.db
      .prepare(
        `WITH RECURSIVE desc(id) AS (
           SELECT id FROM photo_folders WHERE parent_id = ?
           UNION ALL
           SELECT f.id FROM photo_folders f JOIN desc d ON f.parent_id = d.id
         )
         SELECT 1 FROM desc WHERE id = ?`
      )
      .get(newParentId, id)
    if (isDescendant) throw new Error('[PhotoFolderRepository] cannot move into own descendant')
    this.db
      .prepare(`UPDATE photo_folders SET parent_id = ?, updated_at = ? WHERE id = ?`)
      .run(newParentId, now(), id)
  }

  private countStmt(): Database.Statement {
    return this.db.prepare(
      `SELECT COUNT(*) AS n FROM photo_photos WHERE folder_id = ? AND deleted_at IS NULL`
    )
  }

  list(): PhotoFolder[] {
    const rows = this.db
      .prepare(`SELECT * FROM photo_folders ORDER BY sort_order ASC, created_at ASC`)
      .all() as FolderRow[]
    const count = this.countStmt()
    return rows.map((r) => this.fromRow(r, (count.get(r.id) as { n: number }).n))
  }

  getById(id: string): PhotoFolder | undefined {
    const row = this.db.prepare(`SELECT * FROM photo_folders WHERE id = ?`).get(id) as
      | FolderRow
      | undefined
    if (!row) return undefined
    return this.fromRow(row, (this.countStmt().get(id) as { n: number }).n)
  }

  /** 同名同级查找（目录镜像导入复用已有文件夹，避免重复导入建出第二棵树） */
  findByName(name: string, parentId: string | null): string | null {
    const row = parentId
      ? this.db
          .prepare(`SELECT id FROM photo_folders WHERE name = ? AND parent_id = ? LIMIT 1`)
          .get(name, parentId)
      : this.db
          .prepare(`SELECT id FROM photo_folders WHERE name = ? AND parent_id IS NULL LIMIT 1`)
          .get(name)
    return (row as { id: string } | undefined)?.id ?? null
  }

  create(name: string, parentId?: string | null): PhotoFolder {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('[PhotoFolderRepository] name is required')
    const ts = now()
    const id = uuidv4()
    this.db
      .prepare(
        `INSERT INTO photo_folders (id, name, parent_id, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, 0, ?, ?)`
      )
      .run(id, trimmed, parentId ?? null, ts, ts)
    return this.getById(id)!
  }

  update(
    id: string,
    updates: { name?: string; parentId?: string | null }
  ): PhotoFolder | undefined {
    const existing = this.getById(id)
    if (!existing) return undefined
    const ts = now()
    if (updates.name !== undefined) {
      const trimmed = updates.name.trim()
      if (!trimmed) throw new Error('[PhotoFolderRepository] name cannot be empty')
      this.db
        .prepare(`UPDATE photo_folders SET name = ?, updated_at = ? WHERE id = ?`)
        .run(trimmed, ts, id)
    }
    if (updates.parentId !== undefined) {
      if (updates.parentId === id) throw new Error('[PhotoFolderRepository] parent cannot be self')
      this.db
        .prepare(`UPDATE photo_folders SET parent_id = ?, updated_at = ? WHERE id = ?`)
        .run(updates.parentId, ts, id)
    }
    return this.getById(id)
  }

  /**
   * 子树（自身 + 全部后代）。用 `UNION`（非 UNION ALL）：历史脏数据里
   * 出现过 parent_id 自指的行，UNION ALL 在环上会无限递归。
   */
  private subtreeIds(id: string): string[] {
    const rows = this.db
      .prepare(
        `WITH RECURSIVE tree(id) AS (
           SELECT id FROM photo_folders WHERE id = ?
           UNION
           SELECT f.id FROM photo_folders f JOIN tree t ON f.parent_id = t.id
         )
         SELECT id FROM tree`
      )
      .all(id) as Array<{ id: string }>
    return rows.map((r) => r.id)
  }

  /**
   * 删除文件夹（Eagle `dialog.removeFolder` 口径，本机 4.0.0 bundle 取证）：
   * 整棵子树连带删除（旧实现把子文件夹上提，Eagle 是连子树一起删）；
   * deleteImages=true 时子树内素材丢进回收站（软删，磁盘原文件不动），
   * =false 才只是脱离文件夹落进未分类。
   */
  remove(id: string, deleteImages = false): boolean {
    const folderIds = this.subtreeIds(id)
    if (folderIds.length === 0) return false
    const inList = folderIds.map(() => '?').join(',')
    const ts = now()
    const tx = this.db.transaction(() => {
      // 先软删再脱离：反过来了 folder_id 条件就不成立了
      if (deleteImages) {
        this.db
          .prepare(
            `UPDATE photo_photos SET deleted_at = ?, updated_at = ?
             WHERE folder_id IN (${inList}) AND deleted_at IS NULL`
          )
          .run(ts, ts, ...folderIds)
      }
      // 回收站里本就躺着的素材也要脱离：恢复后 folder_id 悬挂会
      // 既不在「未分类」（要求 IS NULL）也不在任何文件夹，成黑户
      this.db
        .prepare(
          `UPDATE photo_photos SET folder_id = NULL, updated_at = ? WHERE folder_id IN (${inList})`
        )
        .run(ts, ...folderIds)
      this.db
        .prepare(`DELETE FROM photo_freeform_pos WHERE folder_id IN (${inList})`)
        .run(...folderIds)
      this.db.prepare(`DELETE FROM photo_folders WHERE id IN (${inList})`).run(...folderIds)
    })
    tx()
    return true
  }

  /** 归组（folderId = null 表示未分组） */
  assignPhotos(folderId: string | null, photoIds: string[]): number {
    if (photoIds.length === 0) return 0
    if (folderId && !this.getById(folderId))
      throw new Error('[PhotoFolderRepository] folder not found')
    const ts = now()
    // 整批单事务：中途失败不留下「归组一半」的状态（与 deletePhotos/restorePhotos 对齐）
    const tx = this.db.transaction((): number => {
      let changes = 0
      for (const chunk of chunkIds(photoIds)) {
        const placeholders = chunk.map(() => '?').join(',')
        changes += this.db
          .prepare(
            `UPDATE photo_photos SET folder_id = ?, updated_at = ? WHERE id IN (${placeholders}) AND deleted_at IS NULL`
          )
          .run(folderId, ts, ...chunk).changes
      }
      return changes
    })
    return tx()
  }
}

export const photoFolderRepository = new PhotoFolderRepository()
