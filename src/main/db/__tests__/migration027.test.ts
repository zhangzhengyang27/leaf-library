import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../migrations'

/**
 * 027 在"已有数据的库"上跑一次（照 migration026.test.ts 范式）：
 * 存量 photo_albums / photo_album_items 行连同表一起 DROP（D-027 撤销手动相册），
 * 其余表（photo_photos 等）不受影响。
 */
const UP_TO_26 = migrations.filter((m) => m.version < 27)
const M27 = migrations.find((m) => m.version === 27)

function dbAtV26(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = MEMORY')
  db.exec(`CREATE TABLE meta (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`)
  for (const m of UP_TO_26) {
    db.transaction(() => {
      m.up(db)
      db.prepare('INSERT INTO meta (version, applied_at) VALUES (?, ?)').run(m.version, 1)
    })()
  }
  return db
}

describe('迁移 027（存量库升级 · 撤销手动相册）', () => {
  it('升级前相册表存在且可写；升级后两张表都没了，素材表原样保留', () => {
    expect(M27).toBeTruthy()
    const db = dbAtV26()

    // 存量数据：一个相册、一条条目、一张素材
    db.prepare(
      `INSERT INTO photo_photos (id, file_name, file_path, kind, imported_at, updated_at)
       VALUES ('p-1', 'a.png', '/lib/a.png', 'image', 1, 1)`
    ).run()
    db.prepare(
      `INSERT INTO photo_albums (id, name, sort_order, created_at, updated_at)
       VALUES ('al-1', '测试相册', 0, 1, 1)`
    ).run()
    db.prepare(
      `INSERT INTO photo_album_items (album_id, photo_id, sort_order, added_at)
       VALUES ('al-1', 'p-1', 0, 1)`
    ).run()

    const hasTable = (name: string): boolean =>
      db
        .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`)
        .get(name) != null
    expect(hasTable('photo_albums')).toBe(true)
    expect(hasTable('photo_album_items')).toBe(true)

    db.transaction(() => {
      M27!.up(db)
      db.prepare('INSERT INTO meta (version, applied_at) VALUES (?, ?)').run(M27!.version, 1)
    })()

    expect(hasTable('photo_albums')).toBe(false)
    expect(hasTable('photo_album_items')).toBe(false)
    // 素材本体不受牵连
    const p = db
      .prepare(`SELECT id, deleted_at, folder_id FROM photo_photos WHERE id = 'p-1'`)
      .get() as { id: string; deleted_at: number | null; folder_id: string | null }
    expect(p).toEqual({ id: 'p-1', deleted_at: null, folder_id: null })
  })
})
