/**
 * Leaf · SmartAlbumRepository
 *
 * Schema: photo_smart_albums（Eagle 式智能收藏夹：条件即相册）
 * rules_json 由 smartAlbumRules.ts 编译为 SQL WHERE，由 PhotoRepository.queryByRules 执行。
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
  sortOrder: number
  createdAt: number
  updatedAt: number
}

interface SmartAlbumRow {
  id: string
  name: string
  rules_json: string
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
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
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

  create(name: string, rules: SmartAlbumRules): SmartAlbum {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('[SmartAlbumRepository] name is required')
    const ts = now()
    const id = uuidv4()
    this.db
      .prepare(
        `INSERT INTO photo_smart_albums (id, name, rules_json, sort_order, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, 0, ?, ?, NULL)`
      )
      .run(id, trimmed, JSON.stringify(rules), ts, ts)
    return this.getById(id)!
  }

  update(id: string, updates: { name?: string; rules?: SmartAlbumRules }): SmartAlbum | undefined {
    const existing = this.getById(id)
    if (!existing) return undefined
    const ts = now()
    const name = updates.name !== undefined ? updates.name.trim() : existing.name
    if (!name) throw new Error('[SmartAlbumRepository] name cannot be empty')
    const rulesJson =
      updates.rules !== undefined ? JSON.stringify(updates.rules) : JSON.stringify(existing.rules)
    this.db
      .prepare(
        `UPDATE photo_smart_albums SET name = ?, rules_json = ?, updated_at = ? WHERE id = ?`
      )
      .run(name, rulesJson, ts, id)
    return this.getById(id)
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
