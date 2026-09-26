import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../migrations'
import { SmartAlbumRepository } from '../repos/SmartAlbumRepository'

/**
 * 026 在"已有数据的库"上跑一次（照 migration018.test.ts 范式）：
 * 全量建库路径（createTestDb）覆盖不到真正的风险——存量 photo_smart_albums 行
 * 在 ALTER TABLE ADD COLUMN 之后要 parent_id 全 NULL、CRUD/树查询照常可用。
 */
const UP_TO_25 = migrations.filter((m) => m.version < 26)
const M26 = migrations.find((m) => m.version === 26)

function dbAtV25(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = MEMORY')
  db.exec(`CREATE TABLE meta (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`)
  for (const m of UP_TO_25) {
    db.transaction(() => {
      m.up(db)
      db.prepare('INSERT INTO meta (version, applied_at) VALUES (?, ?)').run(m.version, 1)
    })()
  }
  return db
}

describe('迁移 026（存量库升级 · 智能夹 parent_id）', () => {
  it('升级前列不存在；升级后加列+索引，存量行 parent_id 为 NULL 且可读', () => {
    expect(M26).toBeTruthy()
    const db = dbAtV25()
    // 存量行：025 形状的表上直接插两条
    db.prepare(
      `INSERT INTO photo_smart_albums (id, name, rules_json, sort_order, created_at, updated_at, deleted_at)
       VALUES ('a-1', '存量A', '{}', 0, 1, 1, NULL), ('b-1', '存量B', '{"favorite":true}', 0, 2, 2, NULL)`
    ).run()

    const cols = (): string[] =>
      (
        db.prepare(`SELECT name FROM pragma_table_info('photo_smart_albums')`).all() as Array<{
          name: string
        }>
      ).map((r) => r.name)
    expect(cols()).not.toContain('parent_id')

    db.transaction(() => {
      M26!.up(db)
      db.prepare('INSERT INTO meta (version, applied_at) VALUES (?, ?)').run(26, 2)
    })()

    // 1) 列与索引就位
    expect(cols()).toContain('parent_id')
    const indexes = (
      db.prepare(`SELECT name FROM pragma_index_list('photo_smart_albums')`).all() as Array<{
        name: string
      }>
    ).map((r) => r.name)
    expect(indexes).toContain('idx_photo_smart_albums_parent')

    // 2) 存量行读回：parent_id 为 NULL（根级），规则不受影响
    const repo = new SmartAlbumRepository(db)
    const listed = repo.list()
    expect(listed).toHaveLength(2)
    expect(listed.find((a) => a.id === 'a-1')?.parentId).toBeNull()
    expect(listed.find((a) => a.id === 'b-1')?.rules).toEqual({ favorite: true })
    expect(repo.listTree().map((n) => n.album.id).sort()).toEqual(['a-1', 'b-1'])
    db.close()
  })

  it('升级后 parent_id 可写：建子夹/树查询/环防护全部可用', () => {
    const db = dbAtV25()
    db.prepare(
      `INSERT INTO photo_smart_albums (id, name, rules_json, sort_order, created_at, updated_at, deleted_at)
       VALUES ('a-1', '存量A', '{}', 0, 1, 1, NULL)`
    ).run()
    db.transaction(() => {
      M26!.up(db)
    })()
    const repo = new SmartAlbumRepository(db)
    const legacy = repo.getById('a-1')
    expect(legacy).toBeTruthy()
    if (!legacy) return
    const child = repo.create('新子夹', { minRating: 3 }, legacy.id)
    expect(child.parentId).toBe('a-1')
    expect(repo.listTree()[0].children.map((n) => n.album.id)).toEqual([child.id])
    // 环防护在升级后的库上同样生效
    expect(() => repo.update('a-1', { parentId: child.id })).toThrowError(/循环嵌套/)
    db.close()
  })
})
