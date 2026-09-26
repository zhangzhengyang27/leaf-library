/**
 * Leaf · SmartAlbumRepository
 *
 * Schema: photo_smart_albums（Eagle 式智能收藏夹：条件即相册）
 * rules_json 由 smartAlbumRules.ts 编译为 SQL WHERE，由 PhotoRepository.queryByRules 执行。
 *
 * M4 嵌套智能夹（D-022 / 026 迁移）：parent_id 指向父智能夹，树形组织。
 * - 求值语义（Eagle 口径）：子级命中 = 子级规则 AND 全部祖先规则——组合发生在
 *   PhotoDataStore（getSmartAlbumPhotos），本仓只负责给出可靠的父链（getAncestorChain）；
 * - 环防护：设置/移动父级时拒绝「父级=自己 / 自己的后代 / 不存在或已删除」，
 *   错误消息用中文（直接进渲染层 toast）；
 * - 删除不级联：删父夹后子夹成为孤儿，树查询把它挂回根级（不丢行）。
 */

import { v4 as uuidv4 } from 'uuid'
import type Database from 'better-sqlite3'
import { database } from '../database'
import { now } from '../repo'
import { parseSmartAlbumRules, type SmartAlbumRules } from '../smartAlbumRules'

export interface SmartAlbum {
  id: string
  name: string
  rules: SmartAlbumRules
  /** M4（026）：父智能夹 id；null = 根级 */
  parentId: string | null
  sortOrder: number
  createdAt: number
  updatedAt: number
}

interface SmartAlbumRow {
  id: string
  name: string
  rules_json: string
  parent_id: string | null
  sort_order: number
  created_at: number
  updated_at: number
  deleted_at: number | null
}

function fromRow(row: SmartAlbumRow): SmartAlbum {
  return {
    id: row.id,
    name: row.name,
    rules: parseSmartAlbumRules(row.rules_json),
    parentId: row.parent_id ?? null,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** M4 树查询节点：album + 子节点（按 parentId 组织） */
export interface SmartAlbumTreeNode {
  album: SmartAlbum
  children: SmartAlbumTreeNode[]
}

export class SmartAlbumRepository {
  constructor(private readonly _db?: Database.Database) {}

  private get db(): Database.Database {
    return this._db ?? database.handle
  }

  list(): SmartAlbum[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM photo_smart_albums WHERE deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC`
      )
      .all() as SmartAlbumRow[]
    return rows.map(fromRow)
  }

  getById(id: string): SmartAlbum | undefined {
    const row = this.db
      .prepare(`SELECT * FROM photo_smart_albums WHERE id = ? AND deleted_at IS NULL`)
      .get(id) as SmartAlbumRow | undefined
    return row ? fromRow(row) : undefined
  }

  /**
   * M4 树查询：按 parentId 组织成父子树（同级按 list 的顺序，即 sort_order → created_at）。
   * 脏数据兜底（parent_id 是自由列，没有外键挡手改）：
   * - 父级已软删/不存在 → 该子级挂根（孤儿提升，不丢行）；
   * - 环链（A↔B 互指）→ 链上节点只挂一次，到不了的剩余节点兜底挂根。
   */
  listTree(): SmartAlbumTreeNode[] {
    const all = this.list()
    const live = new Set(all.map((a) => a.id))
    const byParent = new Map<string | null, SmartAlbum[]>()
    for (const a of all) {
      const key = a.parentId !== null && live.has(a.parentId) ? a.parentId : null
      const bucket = byParent.get(key)
      if (bucket) bucket.push(a)
      else byParent.set(key, [a])
    }
    const placed = new Set<string>()
    const build = (parentId: string | null): SmartAlbumTreeNode[] => {
      const out: SmartAlbumTreeNode[] = []
      for (const a of byParent.get(parentId) ?? []) {
        if (placed.has(a.id)) continue // 环脏数据：每个节点只挂一次
        placed.add(a.id)
        out.push({ album: a, children: build(a.id) })
      }
      return out
    }
    const roots = build(null)
    for (const a of all) {
      if (!placed.has(a.id)) {
        placed.add(a.id)
        roots.push({ album: a, children: build(a.id) })
      }
    }
    return roots
  }

  /**
   * M4 祖先链：从 parentId 起向上收集（返回顺序：直接父级在前，根在后）。
   *
   * - 链上任一祖先已软删/不存在 → 在此截断（孤儿子级按「无该祖先」求值，不约束）；
   * - seen 集合兜底环脏数据：正常写入路径已被 assertValidParent 挡死，这里只防
   *   手改库造成的互指，保证求值路径不炸不挂；
   * - excludeId：编辑器按「待定父级」试算祖先链时把自己摘出去（自引用脏数据下
   *   链会撞到正在编辑的夹本身，撞到即停）。
   *
   * 树的层数**不设上限**：SMART_ALBUM_MAX_DEPTH 是规则组嵌套的防炸闸，与夹树深度
   * 是两个维度——祖先链另计，每层各自独立编译（各自受组深度/节点数闸约束）。
   */
  getAncestorChain(parentId: string | null | undefined, excludeId?: string): SmartAlbum[] {
    const out: SmartAlbum[] = []
    const seen = new Set<string>()
    let cur: string | null | undefined = parentId
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      if (cur === excludeId) break
      const ancestor = this.getById(cur)
      if (!ancestor) break // 已删/不存在：链在此截断，该祖先不约束
      out.push(ancestor)
      cur = ancestor.parentId
    }
    return out
  }

  /**
   * M4 环防护：校验 id 的目标父级合法性（create / update / moveTo 共用一条口径）。
   * 拒绝并抛中文错误（渲染层 toast 直出）：
   * - 父级=自己；
   * - 父级不存在或已软删；
   * - 父级是自己/自己的后代（沿目标父级的祖先链向上走，撞到 id 即成环）。
   */
  private assertValidParent(id: string, parentId: string | null): void {
    if (parentId === null) return // 根级永远合法
    if (parentId === id) {
      throw new Error('不能把智能夹设为自己的父级')
    }
    const parent = this.getById(parentId)
    if (!parent) {
      throw new Error('目标父级智能夹不存在或已删除')
    }
    const seen = new Set<string>()
    let cur: string | null = parent.parentId
    while (cur) {
      if (cur === id) {
        throw new Error('不能把智能夹移动到它自己的子级之下（会形成循环嵌套）')
      }
      if (seen.has(cur)) break // 环脏数据兜底，别死循环
      seen.add(cur)
      cur = this.getById(cur)?.parentId ?? null
    }
  }

  create(name: string, rules: SmartAlbumRules, parentId?: string | null): SmartAlbum {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('[SmartAlbumRepository] name is required')
    const ts = now()
    const id = uuidv4()
    const parent = parentId ?? null
    this.assertValidParent(id, parent) // 新夹不可能有自己的后代，这里主要挡「父级不存在/已删」
    this.db
      .prepare(
        `INSERT INTO photo_smart_albums (id, name, rules_json, parent_id, sort_order, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, 0, ?, ?, NULL)`
      )
      .run(id, trimmed, JSON.stringify(rules), parent, ts, ts)
    return this.getById(id)!
  }

  update(
    id: string,
    updates: { name?: string; rules?: SmartAlbumRules; parentId?: string | null }
  ): SmartAlbum | undefined {
    const existing = this.getById(id)
    if (!existing) return undefined
    const ts = now()
    const name = updates.name !== undefined ? updates.name.trim() : existing.name
    if (!name) throw new Error('[SmartAlbumRepository] name cannot be empty')
    const rulesJson =
      updates.rules !== undefined ? JSON.stringify(updates.rules) : JSON.stringify(existing.rules)
    // parentId 只在显式传入时变更（undefined = 不动；null = 移到根级）
    if (updates.parentId !== undefined) {
      this.assertValidParent(id, updates.parentId ?? null)
    }
    const parentId = updates.parentId !== undefined ? (updates.parentId ?? null) : existing.parentId
    this.db
      .prepare(
        `UPDATE photo_smart_albums SET name = ?, rules_json = ?, parent_id = ?, updated_at = ? WHERE id = ?`
      )
      .run(name, rulesJson, parentId, ts, id)
    return this.getById(id)
  }

  /** M4：移动到目标父级（null = 根级）。环防护走 update 同一条口径 */
  moveTo(id: string, parentId: string | null): SmartAlbum | undefined {
    return this.update(id, { parentId })
  }

  /** 软删除 */
  remove(id: string): boolean {
    const ts = now()
    const r = this.db
      .prepare(
        `UPDATE photo_smart_albums SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`
      )
      .run(ts, ts, id)
    return r.changes > 0
  }
}

export const smartAlbumRepository = new SmartAlbumRepository()
