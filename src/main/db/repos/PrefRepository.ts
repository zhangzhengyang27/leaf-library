/**
 * Leaf · PrefRepository
 *
 * 职责：管理 pref_preferences 表（K-V 偏好设置）。
 * 取代 PreferencesDataStore 的部分能力（K-V 透传到 SQLite）。
 * 注意：PreferencesDataStore 还有结构化默认（editor settings）—— 那部分保留在旧 store
 * 直到上层切换完成，本 Repository 只承担「持久化底层」。
 *
 * Schema: pref_preferences(key TEXT PK, value TEXT, updated_at INTEGER)
 */

import type Database from 'better-sqlite3'
import { database } from '../database'
import { now } from '../repo'

export class PrefRepository {
  constructor(private readonly _db?: Database.Database) {}

  private get db(): Database.Database {
    return this._db ?? database.handle
  }

  /** 取所有偏好（按 key 排序） */
  all(): Array<{ key: string; value: string; updated_at: number }> {
    return this.db
      .prepare('SELECT key, value, updated_at FROM pref_preferences ORDER BY key')
      .all() as Array<{ key: string; value: string; updated_at: number }>
  }

  /** 取单个偏好（不存在返回 null） */
  get(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM pref_preferences WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  }

  /** 设置偏好（key 不存在则插入） */
  set(key: string, value: string): void {
    const ts = now()
    this.db
      .prepare(
        `INSERT INTO pref_preferences (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(key, value, ts)
  }

  /** 删除偏好 */
  delete(key: string): boolean {
    const result = this.db.prepare('DELETE FROM pref_preferences WHERE key = ?').run(key)
    return result.changes > 0
  }

  /** 批量导入（用于一次性迁移） */
  importMany(entries: Array<{ key: string; value: string }>): number {
    const stmt = this.db.prepare(
      `INSERT INTO pref_preferences (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    const tx = this.db.transaction((rows: Array<{ key: string; value: string }>) => {
      let n = 0
      const ts = now()
      for (const r of rows) {
        stmt.run(r.key, r.value, ts)
        n += 1
      }
      return n
    })
    return tx(entries)
  }
}

export const prefRepository = new PrefRepository()
