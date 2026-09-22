/**
 * Leaf · AlbumRepository
 *
 * Schema: photo_albums / photo_album_items（001 预建，四期接入 UI）
 * 手动相册：用户显式挑选图片的容器（与智能收藏夹的「规则=动态相册」互补，Eagle 双模式）。
 * cover_id 无外键约束（应用层保证）；items 复合主键 (album_id, photo_id) 天然去重。
 */

import { v4 as uuidv4 } from 'uuid'
import type Database from 'better-sqlite3'
import { database } from '../database'
import { now, chunkIds } from '../repo'

export interface Album {
  id: string
  name: string
  coverPhotoId: string | null
  sortOrder: number
  photoCount: number
  createdAt: number
  updatedAt: number
}

interface AlbumRow {
  id: string
  name: string
  cover_id: string | null
  created_at: number
  updated_at: number
  sort_order: number
}

export class AlbumRepository {
  constructor(private readonly _db?: Database.Database) {}

  private get db(): Database.Database {
    return this._db ?? database.handle
  }

  private fromRow(row: AlbumRow, photoCount: number): Album {
    return {
      id: row.id,
      name: row.name,
      coverPhotoId: row.cover_id,
      sortOrder: row.sort_order,
      photoCount,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  list(): Album[] {
    const rows = this.db
      .prepare(`SELECT * FROM photo_albums ORDER BY sort_order ASC, created_at ASC`)
      .all() as AlbumRow[]
    const countStmt = this.db.prepare(
      `SELECT COUNT(*) AS n FROM photo_album_items ai
       JOIN photo_photos p ON p.id = ai.photo_id AND p.deleted_at IS NULL
       WHERE ai.album_id = ?`
    )
    return rows.map((r) => this.fromRow(r, (countStmt.get(r.id) as { n: number }).n))
  }

  getById(id: string): Album | undefined {
    const row = this.db.prepare(`SELECT * FROM photo_albums WHERE id = ?`).get(id) as
      | AlbumRow
      | undefined
    if (!row) return undefined
    const count = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM photo_album_items ai
         JOIN photo_photos p ON p.id = ai.photo_id AND p.deleted_at IS NULL
         WHERE ai.album_id = ?`
      )
      .get(id) as { n: number }
    return this.fromRow(row, count.n)
  }

  create(name: string): Album {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('[AlbumRepository] name is required')
    const ts = now()
    const id = uuidv4()
    this.db
      .prepare(
        `INSERT INTO photo_albums (id, name, cover_id, created_at, updated_at, sort_order)
         VALUES (?, ?, NULL, ?, ?, 0)`
      )
      .run(id, trimmed, ts, ts)
    return this.getById(id)!
  }

  update(id: string, updates: { name?: string }): Album | undefined {
    const existing = this.getById(id)
    if (!existing) return undefined
    if (updates.name !== undefined) {
      const trimmed = updates.name.trim()
      if (!trimmed) throw new Error('[AlbumRepository] name cannot be empty')
      this.db
        .prepare(`UPDATE photo_albums SET name = ?, updated_at = ? WHERE id = ?`)
        .run(trimmed, now(), id)
    }
    return this.getById(id)
  }

  /** 软删除不适合（无 deleted_at 列）：直接删除相册及其关联；图片本体不受影响 */
  remove(id: string): boolean {
    const tx = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM photo_album_items WHERE album_id = ?`).run(id)
      const r = this.db.prepare(`DELETE FROM photo_albums WHERE id = ?`).run(id)
      return r.changes > 0
    })
    return tx()
  }

  /** 加入图片（幂等，自动补 cover），返回新加入数量 */
  addPhotos(albumId: string, photoIds: string[]): number {
    if (photoIds.length === 0) return 0
    const album = this.getById(albumId)
    if (!album) throw new Error('[AlbumRepository] album not found')
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO photo_album_items (album_id, photo_id, added_at, sort_order)
       VALUES (?, ?, ?, ?)`
    )
    const maxOrder = this.db
      .prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM photo_album_items WHERE album_id = ?`)
      .get(albumId) as { m: number }
    const tx = this.db.transaction((ids: string[]) => {
      let added = 0
      ids.forEach((photoId, i) => {
        const r = insert.run(albumId, photoId, now(), maxOrder.m + i + 1)
        added += r.changes
      })
      if (added > 0) {
        this.db.prepare(`UPDATE photo_albums SET updated_at = ? WHERE id = ?`).run(now(), albumId)
        // 首图自动设为封面
        if (!album.coverPhotoId) {
          this.db
            .prepare(`UPDATE photo_albums SET cover_id = ? WHERE id = ? AND cover_id IS NULL`)
            .run(ids[0], albumId)
        }
      }
      return added
    })
    return tx(photoIds)
  }

  removePhotos(albumId: string, photoIds: string[]): number {
    if (photoIds.length === 0) return 0
    const tx = this.db.transaction(() => {
      let changes = 0
      // 分块防 IN 参数超限
      for (const chunk of chunkIds(photoIds)) {
        const placeholders = chunk.map(() => '?').join(',')
        const r = this.db
          .prepare(
            `DELETE FROM photo_album_items WHERE album_id = ? AND photo_id IN (${placeholders})`
          )
          .run(albumId, ...chunk)
        changes += r.changes
      }
      // 封面被移除时顺延到剩余首图
      const cover = this.db
        .prepare(`SELECT cover_id FROM photo_albums WHERE id = ?`)
        .get(albumId) as { cover_id: string | null } | undefined
      if (cover?.cover_id && photoIds.includes(cover.cover_id)) {
        const first = this.db
          .prepare(
            `SELECT photo_id FROM photo_album_items WHERE album_id = ? ORDER BY sort_order ASC LIMIT 1`
          )
          .get(albumId) as { photo_id: string } | undefined
        this.db
          .prepare(`UPDATE photo_albums SET cover_id = ?, updated_at = ? WHERE id = ?`)
          .run(first?.photo_id ?? null, now(), albumId)
      }
      return changes
    })
    return tx()
  }

  /** 相册内图片（排除已删除的图片行，按加入顺序） */
  getAlbumPhotos(albumId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT ai.photo_id AS id FROM photo_album_items ai
         JOIN photo_photos p ON p.id = ai.photo_id AND p.deleted_at IS NULL
         WHERE ai.album_id = ? ORDER BY ai.sort_order ASC, ai.added_at ASC`
      )
      .all(albumId) as Array<{ id: string }>
    return rows.map((r) => r.id)
  }
}

export const albumRepository = new AlbumRepository()
