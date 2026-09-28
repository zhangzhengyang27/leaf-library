/**
 * 028 标签管理 Eagle 复刻：starred / sort_order / is_group 三列的仓储行为。
 *
 * 布局语义对齐 Eagle tag-manager：群组是容器不是标签（is_group 行不进 chip 池）、
 * 群组行拖拽排序整体落库（数组序 = sort_order）、解散群组成员回顶层且群组降级。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { TagRepository } from '../repos/TagRepository'

describe('TagRepository · 028 starred/sort_order/is_group', () => {
  let db: Database.Database
  let repo: TagRepository

  beforeEach(() => {
    db = createTestDb()
    repo = new TagRepository(db)
  })

  afterEach(() => {
    closeTestDb(db)
  })

  it('create 默认非群组、sort_order 递增', () => {
    const a = repo.create('a')
    const b = repo.create('b')
    expect(a.is_group).toBe(0)
    expect(b.sort_order).toBeGreaterThan(a.sort_order)
  })

  it('create({ isGroup }) 建群组行', () => {
    const g = repo.create('风格', { isGroup: true })
    expect(g.is_group).toBe(1)
  })

  it('setStarred 批量置位/清除', () => {
    const a = repo.create('a')
    const b = repo.create('b')
    const c = repo.create('c')
    repo.setStarred([a.id, b.id], true)
    expect(repo.getById(a.id)!.starred).toBe(1)
    expect(repo.getById(b.id)!.starred).toBe(1)
    expect(repo.getById(c.id)!.starred).toBe(0)
    repo.setStarred([a.id], false)
    expect(repo.getById(a.id)!.starred).toBe(0)
    expect(repo.getById(b.id)!.starred).toBe(1)
  })

  it('update({ starred/description }) 落库；空串描述清除', () => {
    const t = repo.create('t')
    expect(repo.update(t.id, { starred: true })!.starred).toBe(1)
    const withDesc = repo.update(t.id, { description: ' 风景类 ' })
    expect(withDesc!.description).toBe('风景类')
    expect(repo.update(t.id, { description: '' })!.description).toBeNull()
    expect(repo.update(t.id, { description: null })!.description).toBeNull()
  })

  it('update({ sortOrder }) 落库；color 传 null 保持不变更（旧契约）', () => {
    const t = repo.create('t', { color: '#ff0000' })
    expect(repo.update(t.id, { sortOrder: 7 })!.sort_order).toBe(7)
    expect(repo.update(t.id, { color: null })!.color).toBe('#ff0000')
  })

  it('挂父级成功时父级自动升位为群组', () => {
    const parent = repo.create('parent')
    const child = repo.create('child')
    expect(repo.getById(parent.id)!.is_group).toBe(0)
    repo.update(child.id, { parentId: parent.id })
    expect(repo.getById(parent.id)!.is_group).toBe(1)
  })

  it('setGroupsOrder 按数组序落库', () => {
    const g1 = repo.create('g1', { isGroup: true })
    const g2 = repo.create('g2', { isGroup: true })
    const g3 = repo.create('g3', { isGroup: true })
    repo.setGroupsOrder([g3.id, g1.id, g2.id])
    expect(repo.getById(g3.id)!.sort_order).toBe(0)
    expect(repo.getById(g1.id)!.sort_order).toBe(1)
    expect(repo.getById(g2.id)!.sort_order).toBe(2)
  })

  it('dissolveGroup：成员回顶层 + 群组降级为普通标签，成员素材关联不动', () => {
    const g = repo.create('g', { isGroup: true })
    const a = repo.create('a')
    repo.update(a.id, { parentId: g.id })
    // 群组自身也可有素材关联（降级后作为普通标签保留）
    expect(repo.getById(a.id)!.parent_id).toBe(g.id)

    expect(repo.dissolveGroup(g.id)).toBe(true)
    expect(repo.getById(a.id)!.parent_id).toBeNull()
    expect(repo.getById(g.id)!.is_group).toBe(0)
    expect(repo.getById(g.id)!.deleted_at).toBeNull()
    expect(repo.dissolveGroup('missing')).toBe(false)
  })
})
