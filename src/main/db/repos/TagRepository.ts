/**
 * Leaf · TagRepository
 *
 * 职责：管理 tag_tags 表（全局标签字典）。
 * 取代 TagDataStore 的核心 CRUD。
 *
 * Schema: tag_tags(id TEXT PK, name TEXT, color TEXT, icon TEXT, parent_id TEXT, description TEXT, usage_count INTEGER, created_at INTEGER, updated_at INTEGER, deleted_at INTEGER)
 * UNIQUE(name) WHERE deleted_at IS NULL（partial unique index，迁移 002 建立）
 */

import { v4 as uuidv4 } from 'uuid'
import type Database from 'better-sqlite3'
import { database } from '../database'
import { now, chunkIds } from '../repo'

export interface TagRow {
  id: string
  name: string
  color: string | null
  icon: string | null
  parent_id: string | null
  usage_count: number
  created_at: number
  updated_at: number
  deleted_at: number | null
}

export class TagRepository {
  constructor(private readonly _db?: Database.Database) {}

  private get db(): Database.Database {
    return this._db ?? database.handle
  }

  /** 所有未删除标签，按 name 升序 */
  all(): TagRow[] {
    return this.db
      .prepare('SELECT * FROM tag_tags WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE')
      .all() as TagRow[]
  }

  /** 按 id 取 */
  getById(id: string): TagRow | null {
    return (
      (this.db.prepare('SELECT * FROM tag_tags WHERE id = ? AND deleted_at IS NULL').get(id) as
        | TagRow
        | undefined) ?? null
    )
  }

  /** 按 name 取（不区分大小写） */
  getByName(name: string): TagRow | null {
    return (
      (this.db
        .prepare('SELECT * FROM tag_tags WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL')
        .get(name) as TagRow | undefined) ?? null
    )
  }

  /** 按 ids 批量取（分块防 IN 参数超限） */
  getByIds(ids: string[]): TagRow[] {
    if (ids.length === 0) return []
    const out: TagRow[] = []
    for (const chunk of chunkIds(ids)) {
      const placeholders = chunk.map(() => '?').join(',')
      out.push(
        ...(this.db
          .prepare(`SELECT * FROM tag_tags WHERE id IN (${placeholders}) AND deleted_at IS NULL`)
          .all(...chunk) as TagRow[])
      )
    }
    return out
  }

  /**
   * 新建标签。同名（不区分大小写）已存在则返回已有行。
   * name 必填，自动 trim。
   */
  create(name: string, opts?: { color?: string; icon?: string; parentId?: string }): TagRow {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('[TagRepository] name is required')
    // 审查补齐：与 update 对齐，父不存在直接报错，不写悬挂引用
    if (opts?.parentId && !this.getById(opts.parentId)) {
      throw new Error('[TagRepository] parentId does not exist')
    }

    const existing = this.getByName(trimmed)
    if (existing) return existing

    const ts = now()
    const row: TagRow = {
      id: uuidv4(),
      name: trimmed,
      color: opts?.color ?? null,
      icon: opts?.icon ?? null,
      parent_id: opts?.parentId ?? null,
      usage_count: 0,
      created_at: ts,
      updated_at: ts,
      deleted_at: null
    }
    this.db
      .prepare(
        `INSERT INTO tag_tags (id, name, color, icon, parent_id, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .run(row.id, row.name, row.color, row.icon, row.parent_id, row.created_at, row.updated_at)
    return row
  }

  /** 更新（name 重复返回 null；color/icon 传 null 表示不变更；parentId 传 null 表示不变更、传空串表示清除） */
  update(
    id: string,
    updates: {
      name?: string
      color?: string | null
      icon?: string | null
      parentId?: string | null
    }
  ): TagRow | null {
    const existing = this.getById(id)
    if (!existing) return null

    if (updates.name !== undefined) {
      const trimmed = updates.name.trim()
      if (!trimmed) throw new Error('[TagRepository] name cannot be empty')
      const conflict = this.getByName(trimmed)
      if (conflict && conflict.id !== id) return null
      updates = { ...updates, name: trimmed }
    }

    // 六期标签分组：null/'' 清除父级；挂父级时禁止自挂与成环，父不存在视为不变更
    let nextParentId: string | null = null
    let parentTouched = false
    if (updates.parentId !== undefined) {
      parentTouched = true
      if (updates.parentId === '' || updates.parentId === null) {
        nextParentId = null
      } else if (updates.parentId === id) {
        return null
      } else {
        const parent = this.getById(updates.parentId)
        if (!parent) return null
        let cursor: TagRow | null = parent
        while (cursor) {
          if (cursor.id === id) return null // 会形成环
          cursor = cursor.parent_id ? this.getById(cursor.parent_id) : null
        }
        nextParentId = parent.id
      }
    }

    const ts = now()
    if (parentTouched) {
      this.db
        .prepare(
          `UPDATE tag_tags
           SET name = COALESCE(?, name),
               color = COALESCE(?, color),
               icon = COALESCE(?, icon),
               parent_id = ?,
               updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`
        )
        .run(
          updates.name ?? null,
          updates.color ?? null,
          updates.icon ?? null,
          nextParentId,
          ts,
          id
        )
    } else {
      this.db
        .prepare(
          `UPDATE tag_tags
           SET name = COALESCE(?, name),
               color = COALESCE(?, color),
               icon = COALESCE(?, icon),
               updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`
        )
        .run(updates.name ?? null, updates.color ?? null, updates.icon ?? null, ts, id)
    }
    return this.getById(id)
  }

  /**
   * 软删除：字典行留档（deleted_at），但素材上的绑定必须一并清除。
   * 旧实现只打标记，留下三类后果：读标签的 JOIN 失配 → 卡片标签条显示裸 UUID；
   * usage_count 恒高于实际；photo_tags 里再也无法按标签名清理这批行。
   */
  softDelete(id: string): boolean {
    const ts = now()
    const tx = this.db.transaction(() => {
      const result = this.db
        .prepare(
          'UPDATE tag_tags SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL'
        )
        .run(ts, ts, id)
      if (result.changes === 0) return 0
      this.db.prepare('DELETE FROM photo_tags WHERE tag_id = ?').run(id)
      this.db.prepare('UPDATE tag_tags SET usage_count = 0 WHERE id = ?').run(id)
      return result.changes
    })
    return tx() > 0
  }

  /** 引用计数调整（photo_tags 增删时调用，下限 0） */
  bumpUsage(id: string, delta: number): void {
    this.db
      .prepare(`UPDATE tag_tags SET usage_count = MAX(0, usage_count + ?) WHERE id = ?`)
      .run(delta, id)
  }

  /**
   * F19：把多个标签合并为一个（Eagle 4.0 标签管理「批量重命名」语义）。
   * 目标 = 已存在同名标签（含选中项之一），否则把第一个选中项改名。
   * photo_tags 关联全部并入目标（去重），来源行硬删、来源标签软删，
   * 来源的子标签改挂到目标（target 若在子标签后代中则改挂顶层，防环），
   * 目标 usage_count 按关联行重算。返回目标行；ids 为空或名为空返回 null。
   */
  mergeTags(ids: string[], name: string): TagRow | null {
    const trimmed = name.trim()
    if (!trimmed) return null
    // 按入参顺序重排（getByIds 的 SQL 返回顺序不保证，目标必须是「第一个选中项」）
    const rowMap = new Map(this.getByIds(ids).map((r) => [r.id, r]))
    const rows = ids.map((id) => rowMap.get(id)).filter((r): r is TagRow => r !== undefined)
    if (rows.length === 0) return null
    const byName = this.getByName(trimmed)
    const targetId = byName ? byName.id : rows[0].id
    const ts = now()
    const tx = this.db.transaction(() => {
      if (!byName) {
        this.db
          .prepare(`UPDATE tag_tags SET name = ?, updated_at = ? WHERE id = ?`)
          .run(trimmed, ts, targetId)
      }
      for (const r of rows) {
        if (r.id === targetId) continue
        // 关联并入目标（复合主键去重）
        this.db
          .prepare(
            `INSERT OR IGNORE INTO photo_tags (photo_id, tag_id, created_at)
             SELECT pt.photo_id, ?, pt.created_at FROM photo_tags pt WHERE pt.tag_id = ?`
          )
          .run(targetId, r.id)
        this.db.prepare(`DELETE FROM photo_tags WHERE tag_id = ?`).run(r.id)
        // 来源的子标签改挂目标；target 出现在该子标签后代中时改挂顶层（防环）
        const children = this.db
          .prepare(`SELECT id FROM tag_tags WHERE parent_id = ? AND deleted_at IS NULL`)
          .all(r.id) as Array<{ id: string }>
        for (const c of children) {
          let cursor: TagRow | null = this.getById(c.id)
          let targetInSubtree = false
          while (cursor) {
            if (cursor.id === targetId) {
              targetInSubtree = true
              break
            }
            const next = this.db
              .prepare(`SELECT parent_id FROM tag_tags WHERE id = ?`)
              .get(cursor.id) as { parent_id: string | null } | undefined
            cursor = next?.parent_id ? this.getById(next.parent_id) : null
          }
          this.db
            .prepare(`UPDATE tag_tags SET parent_id = ?, updated_at = ? WHERE id = ?`)
            .run(targetInSubtree ? null : targetId, ts, c.id)
        }
        // 软删来源
        this.db
          .prepare(`UPDATE tag_tags SET deleted_at = ?, updated_at = ? WHERE id = ?`)
          .run(ts, ts, r.id)
      }
      // 目标引用计数重算
      this.db
        .prepare(
          `UPDATE tag_tags SET usage_count = (SELECT COUNT(*) FROM photo_tags WHERE tag_id = ?), updated_at = ? WHERE id = ?`
        )
        .run(targetId, ts, targetId)
    })
    tx()
    return this.getById(targetId)
  }

  /** 批量导入（用于迁移） */
  importMany(entries: Array<{ id: string; name: string; createdAt: number }>): number {
    const stmt = this.db.prepare(
      `INSERT INTO tag_tags (id, name, color, icon, parent_id, created_at, updated_at, deleted_at)
       VALUES (?, ?, NULL, NULL, NULL, ?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`
    )
    const tx = this.db.transaction((rows: typeof entries) => {
      let n = 0
      for (const r of rows) {
        stmt.run(r.id, r.name, r.createdAt, r.createdAt)
        n += 1
      }
      return n
    })
    return tx(entries)
  }
}

export const tagRepository = new TagRepository()
