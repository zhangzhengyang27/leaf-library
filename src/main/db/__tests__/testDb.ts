/**
 * Leaf · 测试基建：临时 in-memory sqlite + 跑 migrations
 *
 * 关键点：
 * - 测试不依赖 LeafDatabase 单例（避免与生产并发初始化互相影响）
 * - 每次 beforeEach 拿全新 :memory: db，所有测试彼此隔离
 * - 跑全部 migrations 重现生产 schema
 * - afterEach 关闭 + 还原
 */

import Database from 'better-sqlite3'
import { migrations } from '../migrations'
import { registerSqlFunctions } from '../registerFunctions'

export function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = MEMORY')
  db.pragma('foreign_keys = ON')
  // 与生产同一处注册：少了它 color_close 这类下推谓词在单测里根本跑不通
  registerSqlFunctions(db)

  // 跑全部迁移
  db.exec(`CREATE TABLE IF NOT EXISTS meta (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`)
  for (const m of migrations) {
    const tx = db.transaction(() => {
      m.up(db)
      db.prepare('INSERT INTO meta (version, applied_at) VALUES (?, ?)').run(m.version, Date.now())
    })
    tx()
  }
  return db
}

/** 关闭测试 db */
export function closeTestDb(db: Database.Database): void {
  try {
    db.close()
  } catch {
    // ignore
  }
}
