import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { TagRepository } from '../repos/TagRepository'
import { PhotoRepository } from '../repos/PhotoRepository'
import { buildSmartAlbumWhere } from '../smartAlbumRules'

describe('TagRepository', () => {
  let db: Database.Database
  let repo: TagRepository

  beforeEach(() => {
    db = createTestDb()
    repo = new TagRepository(db)
  })

  afterEach(() => {
    closeTestDb(db)
  })

  describe('basic CRUD', () => {
    it('空表时 all() 返回空数组', () => {
      expect(repo.all()).toEqual([])
    })

    it('create 分配 uuid 并写 ts', () => {
      const t = repo.create('work')
      expect(t.id).toBeTruthy()
      expect(t.name).toBe('work')
      expect(t.deleted_at).toBeNull()
      expect(t.created_at).toBeGreaterThan(0)
      expect(t.updated_at).toBe(t.created_at)
    })

    it('create 自动 trim 名称', () => {
      const t = repo.create('  hello  ')
      expect(t.name).toBe('hello')
    })

    it('create 空名抛错', () => {
      expect(() => repo.create('   ')).toThrow()
      expect(() => repo.create('')).toThrow()
    })

    it('create 同名（不区分大小写）返回已有行（不新建第二份）', () => {
      const a = repo.create('Foo')
      const b = repo.create('foo')
      const c = repo.create('FOO')
      expect(b.id).toBe(a.id)
      expect(c.id).toBe(a.id)
      expect(repo.all()).toHaveLength(1)
    })

    it('getById 命中', () => {
      const t = repo.create('x')
      expect(repo.getById(t.id)?.name).toBe('x')
    })

    it('getById 未命中返回 null', () => {
      expect(repo.getById('00000000-0000-0000-0000-000000000000')).toBeNull()
    })

    it('getByName 不区分大小写', () => {
      repo.create('JavaScript')
      expect(repo.getByName('javascript')?.name).toBe('JavaScript')
      expect(repo.getByName('JAVASCRIPT')?.name).toBe('JavaScript')
    })

    it('getByIds 批量取', () => {
      const a = repo.create('a')
      const b = repo.create('b')
      const c = repo.create('c')
      const out = repo.getByIds([a.id, b.id, c.id])
      expect(out.map((t) => t.name).sort()).toEqual(['a', 'b', 'c'])
    })

    it('getByIds 空数组返回空', () => {
      expect(repo.getByIds([])).toEqual([])
    })

    it('getByIds 包含不存在的 id 时只返回存在的', () => {
      const a = repo.create('a')
      const out = repo.getByIds([a.id, '00000000-0000-0000-0000-000000000000'])
      expect(out).toHaveLength(1)
    })
  })

  describe('update', () => {
    it('rename 写入新名字', () => {
      const t = repo.create('foo')
      const updated = repo.update(t.id, { name: 'bar' })
      expect(updated?.name).toBe('bar')
    })

    it('rename 冲突（已有同名）返回 null', () => {
      const a = repo.create('foo')
      repo.create('bar')
      expect(repo.update(a.id, { name: 'bar' })).toBeNull()
      // 老的名字还在
      expect(repo.getById(a.id)?.name).toBe('foo')
    })

    it('rename 为空字符串抛错', () => {
      const t = repo.create('foo')
      expect(() => repo.update(t.id, { name: '   ' })).toThrow()
    })

    it('update 不存在的 id 返回 null', () => {
      expect(repo.update('00000000-0000-0000-0000-000000000000', { name: 'x' })).toBeNull()
    })

    it('update 只改传入的字段（COALESCE 行为）', () => {
      const t = repo.create('foo', { color: 'red' })
      const updated = repo.update(t.id, { icon: 'star' })
      expect(updated?.name).toBe('foo')
      expect(updated?.color).toBe('red')
      expect(updated?.icon).toBe('star')
    })
  })

  describe('六期：parentId 分组', () => {
    it('create 带 parentId 落库', () => {
      const parent = repo.create('父')
      const child = repo.create('子', { parentId: parent.id })
      expect(repo.getById(child.id)?.parent_id).toBe(parent.id)
    })

    it('update 挂父级 / 清除父级', () => {
      const parent = repo.create('父')
      const child = repo.create('子')
      const updated = repo.update(child.id, { parentId: parent.id })
      expect(updated?.parent_id).toBe(parent.id)
      const cleared = repo.update(child.id, { parentId: '' })
      expect(cleared?.parent_id).toBeNull()
    })

    it('自挂与成环返回 null', () => {
      const a = repo.create('a')
      const b = repo.create('b', { parentId: a.id })
      expect(repo.update(a.id, { parentId: a.id })).toBeNull() // 自挂
      expect(repo.update(a.id, { parentId: b.id })).toBeNull() // a→b→a 成环
    })

    it('create 带不存在的 parentId 抛错（审查补齐）', () => {
      expect(() => repo.create('孤儿', { parentId: 'no-such-id' })).toThrow()
    })

    it('父不存在返回 null（不静默改库）', () => {
      const a = repo.create('a')
      expect(repo.update(a.id, { parentId: 'no-such-id' })).toBeNull()
      expect(repo.getById(a.id)?.parent_id).toBeNull()
    })
  })

  describe('soft delete', () => {
    it('softDelete 返回 true 并从 all() 移除', () => {
      const t = repo.create('a')
      expect(repo.softDelete(t.id)).toBe(true)
      expect(repo.all()).toEqual([])
    })

    it('软删除后 getById 返回 null', () => {
      const t = repo.create('a')
      repo.softDelete(t.id)
      expect(repo.getById(t.id)).toBeNull()
    })

    it('软删除后 getByName 返回 null（活跃列表里没有）', () => {
      const t = repo.create('a')
      repo.softDelete(t.id)
      expect(repo.getByName('a')).toBeNull()
    })

    it('软删除后可以同名重建（partial unique 不冲突）', () => {
      const t = repo.create('work')
      repo.softDelete(t.id)
      const t2 = repo.create('work')
      expect(t2.id).not.toBe(t.id)
      expect(repo.all()).toHaveLength(1)
    })

    it('二次软删除返回 false', () => {
      const t = repo.create('a')
      repo.softDelete(t.id)
      expect(repo.softDelete(t.id)).toBe(false)
    })
  })

  describe('importMany', () => {
    it('批量导入返回行数', () => {
      const n = repo.importMany([
        { id: 'id-1', name: 'first', createdAt: 100 },
        { id: 'id-2', name: 'second', createdAt: 200 }
      ])
      expect(n).toBe(2)
      expect(
        repo
          .all()
          .map((r) => r.name)
          .sort()
      ).toEqual(['first', 'second'])
    })

    it('按给定 id upsert', () => {
      const n = repo.importMany([{ id: 'id-1', name: 'old', createdAt: 100 }])
      expect(n).toBe(1)
      repo.importMany([{ id: 'id-1', name: 'new', createdAt: 100 }])
      expect(repo.getById('id-1')?.name).toBe('new')
    })
  })
})

describe('TagRepository · mergeTags（F19 批量合并）', () => {
  let db: Database.Database
  let repo: TagRepository

  beforeEach(() => {
    db = createTestDb()
    repo = new TagRepository(db)
  })
  afterEach(() => closeTestDb(db))

  function link(photoId: string, tagId: string): void {
    db.prepare(`INSERT INTO photo_tags (photo_id, tag_id, created_at) VALUES (?, ?, 100)`).run(
      photoId,
      tagId
    )
  }

  it('来源关联合并到目标并软删来源，usage 重算、关联去重', () => {
    const a = repo.create('风景')
    const b = repo.create('山水')
    const c = repo.create('山丘')
    link('p1', b.id)
    link('p1', c.id) // p1 同时有 b/c → 合并后目标只记一次
    link('p2', c.id)

    const merged = repo.mergeTags([b.id, c.id], '风景')
    expect(merged?.id).toBe(a.id) // 已存在同名 → 以既有标签为目标
    expect(repo.getById(b.id)?.deleted_at).not.toBeNull()
    expect(repo.getById(c.id)?.deleted_at).not.toBeNull()
    const linked = db.prepare(`SELECT photo_id FROM photo_tags WHERE tag_id = ?`).all(a.id)
    expect(linked.map((r) => r.photo_id).sort()).toEqual(['p1', 'p2'])
    expect(repo.getById(a.id)?.usage_count).toBe(2)
  })

  it('无同名目标：第一个选中项改名充当目标', () => {
    const b = repo.create('旧名1')
    const c = repo.create('旧名2')
    link('p9', c.id)
    const merged = repo.mergeTags([b.id, c.id], '新名')
    expect(merged?.id).toBe(b.id)
    expect(merged?.name).toBe('新名')
    expect(repo.getById(c.id)?.deleted_at).not.toBeNull()
    expect(repo.getById(b.id)?.usage_count).toBe(1)
  })

  it('来源的子标签改挂到目标', () => {
    const target = repo.create('目标')
    const src = repo.create('来源')
    const child = repo.create('子标签', { parentId: src.id })
    const merged = repo.mergeTags([src.id], '目标')
    expect(merged?.id).toBe(target.id)
    expect(repo.getById(child.id)?.parent_id).toBe(target.id)
  })

  it('空 ids / 空名返回 null', () => {
    expect(repo.mergeTags([], 'x')).toBeNull()
    expect(repo.mergeTags([repo.create('t').id], '  ')).toBeNull()
  })
})

/**
 * 二轮审查：软删标签必须连带清理素材绑定。
 * 旧实现只打 deleted_at → 读标签的 LEFT JOIN 失配后 COALESCE 回退到 pt.tag_id，
 * 卡片标签条直接显示裸 UUID；usage_count 不回退；这批行再也无法按标签名解绑。
 */
describe('TagRepository · softDelete 与素材绑定', () => {
  let db: Database.Database
  let tags: TagRepository
  let photos: PhotoRepository

  beforeEach(() => {
    db = createTestDb()
    tags = new TagRepository(db)
    photos = new PhotoRepository(db)
  })
  afterEach(() => closeTestDb(db))

  const countWhere = (where: string, params: unknown[]): number =>
    (
      db.prepare(`SELECT COUNT(*) AS n FROM photo_photos WHERE ${where}`).get(...params) as {
        n: number
      }
    ).n

  it('删标签：素材标签清空、绑定行删除、usage 归零、回到「未加标签」', () => {
    const p = photos.addPhoto('/t-sd.png')
    const t = tags.create('小猫')
    photos.addTagToPhotos([p.id], '小猫')
    expect(photos.getPhotoById(p.id)!.tags).toEqual(['小猫'])

    expect(tags.softDelete(t.id)).toBe(true)

    expect(photos.getPhotoById(p.id)!.tags).toEqual([])
    expect(photos.getAllTags()).toEqual([])
    expect(
      (
        db.prepare('SELECT COUNT(*) AS n FROM photo_tags WHERE tag_id = ?').get(t.id) as {
          n: number
        }
      ).n
    ).toBe(0)
    expect(tags.getById(t.id)).toBeNull() // 字典已过滤软删行
    const dictRow = db
      .prepare('SELECT usage_count, deleted_at FROM tag_tags WHERE id = ?')
      .get(t.id) as { usage_count: number; deleted_at: number | null }
    expect(dictRow.usage_count).toBe(0)
    expect(dictRow.deleted_at).not.toBeNull()
    const untagged = buildSmartAlbumWhere({ untaggedOnly: true })
    expect(countWhere(untagged.whereSql, untagged.params as never)).toBe(1)
  })

  it('存量孤儿绑定（字典行不存在/已软删）不再显示为 UUID', () => {
    const p = photos.addPhoto('/t-orphan.png')
    db.prepare('INSERT INTO photo_tags (photo_id, tag_id, created_at) VALUES (?, ?, ?)').run(
      p.id,
      'no-such-tag-id',
      Date.now()
    )
    expect(photos.getPhotoById(p.id)!.tags).toEqual([])
    const untagged = buildSmartAlbumWhere({ untaggedOnly: true })
    expect(countWhere(untagged.whereSql, untagged.params as never)).toBe(1)
  })
})
