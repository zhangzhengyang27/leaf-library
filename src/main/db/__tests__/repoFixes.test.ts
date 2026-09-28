/**
 * 修复回归测试（代码审查修复批次）：
 * - 文件夹删除：整棵子树连带删除（Eagle 口径），素材按勾选进回收站或落未分类
 * - 清空回收站：自由网格坐标孤儿清理 + 标签 usage_count 回退
 * - updatePhoto 标签整组替换：usage_count 差集维护
 * - IN 参数分块：>900 id 的批量路径不再超 SQLite 参数上限
 * - 侧栏徽章计数：全部/未标签/最近查看按 SQL 聚合，与 untaggedOnly 同口径
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { PhotoRepository } from '../repos/PhotoRepository'
import { PhotoFolderRepository } from '../repos/PhotoFolderRepository'
import { TagRepository } from '../repos/TagRepository'

describe('PhotoFolderRepository · remove 子树连带删除（Eagle dialog.removeFolder 口径）', () => {
  let db: Database.Database
  let folders: PhotoFolderRepository
  let photos: PhotoRepository

  beforeEach(() => {
    db = createTestDb()
    folders = new PhotoFolderRepository(db)
    photos = new PhotoRepository(db)
  })
  afterEach(() => closeTestDb(db))

  const trashedOf = (id: string): { deleted_at: number | null; folder_id: string | null } =>
    db.prepare(`SELECT deleted_at, folder_id FROM photo_photos WHERE id = ?`).get(id) as {
      deleted_at: number | null
      folder_id: string | null
    }

  it('删除中间节点：整棵子树一起消失，父级保留（旧实现是上提，Eagle 是连删）', () => {
    const root = folders.create('根')
    const mid = folders.create('中间', root.id)
    const child = folders.create('子', mid.id)
    const grandchild = folders.create('孙', child.id)
    const sibling = folders.create('旁支', root.id)

    expect(folders.remove(mid.id)).toBe(true)
    expect(folders.getById(mid.id)).toBeUndefined()
    expect(folders.getById(child.id)).toBeUndefined()
    expect(folders.getById(grandchild.id)).toBeUndefined()
    expect(folders.getById(root.id)).toBeDefined()
    expect(folders.getById(sibling.id)?.parentId).toBe(root.id)
  })

  it('勾选丢回收站：子树内素材软删且脱离文件夹（恢复后落未分类，不成黑户）', () => {
    const root = folders.create('根')
    const child = folders.create('子', root.id)
    const inRoot = photos.addPhoto('/in-root.jpg').id
    const inChild = photos.addPhoto('/in-child.jpg').id
    const elsewhere = photos.addPhoto('/elsewhere.jpg').id
    folders.assignPhotos(root.id, [inRoot])
    folders.assignPhotos(child.id, [inChild])
    folders.assignPhotos(null, [elsewhere])

    expect(folders.remove(root.id, true)).toBe(true)
    expect(trashedOf(inRoot)).toMatchObject({ folder_id: null })
    expect(trashedOf(inRoot).deleted_at).not.toBeNull()
    expect(trashedOf(inChild).deleted_at).not.toBeNull()
    // 不在子树内的素材不受影响
    expect(trashedOf(elsewhere).deleted_at).toBeNull()
    // 回收站视图查得到（deleted_at IS NOT NULL）
    expect(
      photos
        .getRecycleBinPhotos()
        .map((p) => p.id)
        .sort()
    ).toEqual([inChild, inRoot].sort())
  })

  it('不勾选：只脱离文件夹，素材本体不删（Eagle 未勾选分支）', () => {
    const root = folders.create('根')
    const inRoot = photos.addPhoto('/keep.jpg').id
    folders.assignPhotos(root.id, [inRoot])

    expect(folders.remove(root.id, false)).toBe(true)
    expect(trashedOf(inRoot)).toEqual({ deleted_at: null, folder_id: null })
  })

  it('回收站里本就躺着的素材也脱离 folder_id；自由网格坐标一并清理', () => {
    const root = folders.create('根')
    const doomed = photos.addPhoto('/already-trash.jpg').id
    folders.assignPhotos(root.id, [doomed])
    photos.deletePhoto(doomed)
    db.prepare(
      `INSERT INTO photo_freeform_pos (folder_id, photo_id, x, y, scale) VALUES (?, ?, 1, 2, 1)`
    ).run(root.id, doomed)

    folders.remove(root.id, true)
    expect(
      db.prepare(`SELECT folder_id FROM photo_photos WHERE id = ?`).get(doomed)?.folder_id
    ).toBeNull()
    expect(
      db.prepare(`SELECT COUNT(*) AS n FROM photo_freeform_pos WHERE folder_id = ?`).get(root.id).n
    ).toBe(0)
  })

  it('parent_id 自指的脏数据不会让子树遍历死循环', () => {
    const a = folders.create('环上的')
    db.prepare(`UPDATE photo_folders SET parent_id = id WHERE id = ?`).run(a.id)
    expect(folders.remove(a.id)).toBe(true)
    expect(folders.getById(a.id)).toBeUndefined()
  })

  it('删除不存在的文件夹返回 false', () => {
    expect(folders.remove('nope')).toBe(false)
  })
})

describe('PhotoRepository · clearRecycleBin 孤儿清理 + 计数回退', () => {
  let db: Database.Database
  let photos: PhotoRepository
  let tags: TagRepository
  let folders: PhotoFolderRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
    tags = new TagRepository(db)
    folders = new PhotoFolderRepository(db)
  })
  afterEach(() => closeTestDb(db))

  it('清空回收站删除自由网格坐标，回退标签计数', () => {
    const p1 = photos.addPhoto('/p1.jpg')
    const p2 = photos.addPhoto('/p2.jpg')

    photos.updatePhoto(p1.id, { tags: ['风景'] })
    photos.updatePhoto(p2.id, { tags: ['风景'] })
    const tag = tags.getByName('风景')
    expect(tag?.usage_count).toBe(2)

    // 自由网格坐标行（photo_freeform_pos，folder_id 非空）
    const canvas = folders.create('画布')
    db.prepare(
      `INSERT INTO photo_freeform_pos (folder_id, photo_id, x, y, scale) VALUES (?, ?, 10, 20, 1)`
    ).run(canvas.id, p1.id)

    photos.deletePhotos([p1.id])
    const purged = photos.clearRecycleBin()
    expect(purged).toContain(p1.id)

    // 自由网格坐标已清理
    const ff = db
      .prepare(`SELECT COUNT(*) AS n FROM photo_freeform_pos WHERE photo_id = ?`)
      .get(p1.id) as {
      n: number
    }
    expect(ff.n).toBe(0)
    // usage_count 回退到 1（p2 还挂着「风景」）
    expect(tags.getByName('风景')?.usage_count).toBe(1)
  })
})

describe('PhotoRepository · updatePhoto 标签替换维护 usage_count', () => {
  let db: Database.Database
  let photos: PhotoRepository
  let tags: TagRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
    tags = new TagRepository(db)
  })
  afterEach(() => closeTestDb(db))

  it('整组替换后 usage_count 与实际关联一致', () => {
    const p1 = photos.addPhoto('/p1.jpg')
    const p2 = photos.addPhoto('/p2.jpg')
    photos.updatePhoto(p1.id, { tags: ['风景', '旅行'] })
    photos.updatePhoto(p2.id, { tags: ['风景'] })
    expect(tags.getByName('风景')?.usage_count).toBe(2)
    expect(tags.getByName('旅行')?.usage_count).toBe(1)

    // p1 换标签：风景移除（-1），城市新增（+1）
    photos.updatePhoto(p1.id, { tags: ['旅行', '城市'] })
    expect(tags.getByName('风景')?.usage_count).toBe(1)
    expect(tags.getByName('旅行')?.usage_count).toBe(1)
    expect(tags.getByName('城市')?.usage_count).toBe(1)
  })

  it('重复标签名 / 大小写变体去重后计数不虚高', () => {
    const p = photos.addPhoto('/dup.jpg')
    // create() 走 LOWER(name) 复用 + INSERT OR IGNORE + Set 去重：
    // 三项实为同一个标签，计数必须仍是 1
    photos.updatePhoto(p.id, { tags: ['风景', '风景', '风景 '] })
    expect(tags.getByName('风景')?.usage_count).toBe(1)
    const links = db
      .prepare(`SELECT COUNT(*) AS n FROM photo_tags WHERE photo_id = ?`)
      .get(p.id) as { n: number }
    expect(links.n).toBe(1)
  })
})

describe('PhotoRepository · IN 参数分块', () => {
  let db: Database.Database
  let photos: PhotoRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
  })
  afterEach(() => closeTestDb(db))

  it('批量取/删/恢复超过单块大小（900）的 id 集合', () => {
    const ids: string[] = []
    for (let i = 0; i < 1000; i++) ids.push(photos.addPhoto(`/bulk-${i}.jpg`).id)
    expect(ids.length).toBe(1000)

    // 取：结果覆盖全部分块
    const got = photos.getPhotosByIds(ids)
    expect(got.length).toBe(1000)
    // 标签解析也走分块路径（取数必须在打标签之后）
    photos.updatePhoto(ids[0], { tags: ['批量'] })
    const refetched = photos.getPhotosByIds(ids)
    expect(refetched.find((p) => p.id === ids[0])?.tags).toEqual(['批量'])

    // 软删 + 恢复（getPhotosByIds 不过滤软删行，是导出/拖出场景的既有语义）
    expect(photos.deletePhotos(ids)).toBe(1000)
    const deletedCount = (
      db.prepare(`SELECT COUNT(*) AS n FROM photo_photos WHERE deleted_at IS NOT NULL`).get() as {
        n: number
      }
    ).n
    expect(deletedCount).toBe(1000)
    expect(photos.restorePhotos(ids)).toBe(1000)
    const liveCount = (
      db.prepare(`SELECT COUNT(*) AS n FROM photo_photos WHERE deleted_at IS NULL`).get() as {
        n: number
      }
    ).n
    expect(liveCount).toBe(1000)
  })

  it('清空回收站跨块（>900）统计标签计数也正确', () => {
    const ids: string[] = []
    for (let i = 0; i < 1000; i++) {
      const p = photos.addPhoto(`/trash-${i}.jpg`)
      photos.updatePhoto(p.id, { tags: ['批量删除'] })
      ids.push(p.id)
    }
    expect(photos.deletePhotos(ids)).toBe(1000)

    const purged = photos.clearRecycleBin()
    expect(purged.length).toBe(1000)
    // 跨块聚合后计数恰好回退到 0（错在块间重复扣或漏扣都会在这里暴露）
    expect(photos.getPhotoById(ids[0])).toBeUndefined()
    const usage = db.prepare(`SELECT usage_count FROM tag_tags WHERE name = ?`).get('批量删除') as {
      usage_count: number
    }
    expect(usage.usage_count).toBe(0)
  })
})

describe('PhotoRepository · listMissingIds（断链批量处置的取数）', () => {
  let db: Database.Database
  let photos: PhotoRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
  })
  afterEach(() => closeTestDb(db))

  it('只数活跃且已标断链的；软删与正常行都不进清单', () => {
    photos.addPhoto('/lib/a.png')
    const b = photos.addPhoto('/lib/b.png')
    const c = photos.addPhoto('/lib/c.png')
    photos.setMissing(b.id, Date.now())
    photos.setMissing(c.id, Date.now())
    photos.deletePhotos([c.id]) // 回收站里的丢失行不该被这次批量操作带走

    expect(photos.listMissingIds()).toEqual([b.id])
    // 只给 id：批量入口要把整库 filePath 传过 IPC 是纯浪费
    expect(photos.listMissing()).toEqual([{ id: b.id, filePath: '/lib/b.png' }])

    photos.setMissing(b.id, null)
    expect(photos.listMissingIds()).toEqual([])
  })
})

describe('PhotoRepository · sidebarCounts（侧栏徽章走 SQL 聚合）', () => {
  let db: Database.Database
  let photos: PhotoRepository
  let tags: TagRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
    tags = new TagRepository(db)
  })
  afterEach(() => closeTestDb(db))

  it('未标签按活动标签判定：字典软删而绑定残留时素材回到「未标签」', () => {
    const a = photos.addPhoto('/sb-a.png')
    const b = photos.addPhoto('/sb-b.png')
    photos.addPhoto('/sb-c.png')
    photos.addTagToPhotos([a.id], '叶子')
    const doomed = tags.create('将删')
    photos.addTagToPhotos([b.id], '将删')
    expect(photos.sidebarCounts()).toMatchObject({ all: 3, untagged: 1 })

    tags.softDelete(doomed.id)
    // 与 buildSmartAlbumWhere 的 untaggedOnly 同口径：不看绑定行，看标签是否活动
    expect(photos.sidebarCounts().untagged).toBe(2)
  })

  it('软删素材不计入任何一项；最近查看只数记录过查看的', () => {
    const a = photos.addPhoto('/sb-a.png')
    const b = photos.addPhoto('/sb-b.png')
    photos.setLastViewed(a.id)
    expect(photos.sidebarCounts()).toMatchObject({ all: 2, recentViewed: 1 })

    photos.deletePhoto(b.id)
    photos.deletePhoto(a.id)
    expect(photos.sidebarCounts()).toMatchObject({ all: 0, recentViewed: 0 })
  })
})
