/**
 * 标注 comments[] 的仓库层
 *
 * 写入前一律过 `@shared/annotations` 的 normalizeAnnotationInput：
 * 表上有 CHECK（坐标全有或全无），直接 prepare 一条半坐标的行会抛 SQLITE_CONSTRAINT，
 * 用户看到的就是一句没有上下文的失败；在门口按字段报错才说得出"哪一条不对"。
 *
 * 关联表不加外键（与 photo_tags 同一套），
 * 素材被永久删除时的清理由 PhotoRepository.clearRecycleBin 那段负责——
 * 那处的注释就写着"旧实现漏了关联表"，别再漏第二次。
 */
import { v4 as uuidv4 } from 'uuid'
import type Database from 'better-sqlite3'
import { database } from '../database'
import { PhotoRepository } from './PhotoRepository'
import {
  ANNOTATION_MAX_PER_PHOTO,
  isAnnotationIdLike,
  normalizeAnnotationInput,
  type PhotoAnnotation
} from '@shared/annotations'

interface AnnotationRow {
  id: string
  photo_id: string
  body: string
  x: number | null
  y: number | null
  w: number | null
  h: number | null
  at_ms: number | null
  created_at: number
  updated_at: number
}

type WriteResult = { ok: true; id: string } | { ok: false; error: string }
type MutateResult = { ok: true } | { ok: false; error: string }

export class PhotoAnnotationRepository {
  /** 与本仓库绑同一 db 的素材仓库（照 PhotoRepository 用 TagRepository 的写法）：
   *  全局单例在单测里没有 database.handle，注入才能拿 :memory: 库真跑 */
  private readonly photos: PhotoRepository

  constructor(private readonly _db?: Database.Database) {
    this.photos = new PhotoRepository(_db)
  }

  private get db(): Database.Database {
    return this._db ?? database.handle
  }

  private toDomain(row: AnnotationRow): PhotoAnnotation {
    const a: PhotoAnnotation = {
      id: row.id,
      photoId: row.photo_id,
      body: row.body,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
    if (row.x !== null && row.y !== null && row.w !== null && row.h !== null)
      a.rect = { x: row.x, y: row.y, w: row.w, h: row.h }
    if (row.at_ms !== null) a.atMs = row.at_ms
    return a
  }

  /** 某条素材的全部标注：时间点笔记按位置排，其余按创建顺序（区域框之间没有先后） */
  listByPhotoId(photoId: string): PhotoAnnotation[] {
    if (!isAnnotationIdLike(photoId)) return []
    const rows = this.db
      .prepare(
        `SELECT * FROM photo_annotations WHERE photo_id = ?
         ORDER BY (at_ms IS NULL), at_ms, created_at`
      )
      .all(photoId) as AnnotationRow[]
    return rows.map((r) => this.toDomain(r))
  }

  /** 批量计数（卡片角标用；一次查完而不是每卡一条 SQL） */
  countByPhotoIds(ids: readonly string[]): Map<string, number> {
    const out = new Map<string, number>()
    const valid = ids.filter((i) => isAnnotationIdLike(i))
    if (valid.length === 0) return out
    // 上限：一次别拿整库来问（IN 太长会让 SQLite 直接拒绝）
    const chunk = valid.slice(0, 500)
    const placeholders = chunk.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT photo_id, COUNT(*) AS n FROM photo_annotations
         WHERE photo_id IN (${placeholders}) GROUP BY photo_id`
      )
      .all(...chunk) as Array<{ photo_id: string; n: number }>
    for (const r of rows) out.set(r.photo_id, r.n)
    return out
  }

  create(photoId: string, input: unknown): WriteResult {
    if (!isAnnotationIdLike(photoId)) return { ok: false, error: '素材 id 不合法' }
    if (!this.photos.getPhotoById(photoId))
      return { ok: false, error: '素材不在库里（可能已被删除）' }
    const checked = normalizeAnnotationInput(input)
    if (!checked.ok) return { ok: false, error: checked.error }
    const existing = this.countOf(photoId)
    if (existing >= ANNOTATION_MAX_PER_PHOTO)
      return { ok: false, error: `单条素材最多 ${ANNOTATION_MAX_PER_PHOTO} 条标注` }

    const id = uuidv4()
    const ts = Date.now()
    const { value } = checked
    this.db
      .prepare(
        `INSERT INTO photo_annotations (id, photo_id, body, x, y, w, h, at_ms, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        photoId,
        value.body,
        value.rect?.x ?? null,
        value.rect?.y ?? null,
        value.rect?.w ?? null,
        value.rect?.h ?? null,
        value.atMs ?? null,
        ts,
        ts
      )
    return { ok: true, id }
  }

  /** 整条覆盖式更新（渲染层拿到的就是全量对象；局部字段更新是另一套语义，别混） */
  update(id: string, input: unknown): MutateResult {
    if (!isAnnotationIdLike(id)) return { ok: false, error: '标注 id 不合法' }
    const checked = normalizeAnnotationInput(input)
    if (!checked.ok) return { ok: false, error: checked.error }
    const row = this.db.prepare(`SELECT photo_id FROM photo_annotations WHERE id = ?`).get(id) as
      | { photo_id: string }
      | undefined
    if (!row) return { ok: false, error: '标注不存在（可能刚被删除）' }
    const { value } = checked
    this.db
      .prepare(
        `UPDATE photo_annotations SET body = ?, x = ?, y = ?, w = ?, h = ?, at_ms = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        value.body,
        value.rect?.x ?? null,
        value.rect?.y ?? null,
        value.rect?.w ?? null,
        value.rect?.h ?? null,
        value.atMs ?? null,
        Date.now(),
        id
      )
    return { ok: true }
  }

  remove(id: string): MutateResult {
    if (!isAnnotationIdLike(id)) return { ok: false, error: '标注 id 不合法' }
    const r = this.db.prepare(`DELETE FROM photo_annotations WHERE id = ?`).run(id)
    return r.changes > 0 ? { ok: true } : { ok: false, error: '标注不存在（可能已被删除）' }
  }

  private countOf(photoId: string): number {
    return (
      this.db
        .prepare(`SELECT COUNT(*) AS n FROM photo_annotations WHERE photo_id = ?`)
        .get(photoId) as { n: number }
    ).n
  }
}

export const photoAnnotationRepository = new PhotoAnnotationRepository()
