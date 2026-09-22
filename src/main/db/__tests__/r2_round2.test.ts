/**
 * 二轮 Eagle 对齐（R2~R5）数据层测试：
 * - photo_photos.pinned_at 置顶（004）
 * - photo_folders.password / cover_photo_id / description（004）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { PhotoRepository } from '../repos/PhotoRepository'
import { PhotoFolderRepository } from '../repos/PhotoFolderRepository'

let db: Database.Database
let photos: PhotoRepository
let folders: PhotoFolderRepository

beforeEach(() => {
  db = createTestDb()
  photos = new PhotoRepository(db)
  folders = new PhotoFolderRepository(db)
})

afterEach(() => {
  closeTestDb(db)
})

describe('004 置顶', () => {
  it('setPinned 写入/清除 pinned_at', () => {
    const p = photos.addPhoto('/tmp/pin-test-a.png')
    expect(p.pinnedAt).toBeUndefined()

    const pinned = photos.setPinned(p.id, true)
    expect(pinned?.pinnedAt).toBeGreaterThan(0)

    const cleared = photos.setPinned(p.id, false)
    expect(cleared?.pinnedAt).toBeUndefined()
  })

  it('置顶素材进入回收站后仍可列出（软删语义不受置顶影响）', () => {
    const p = photos.addPhoto('/tmp/pin-test-b.png')
    photos.setPinned(p.id, true)
    photos.deletePhoto(p.id)
    const bin = photos.getRecycleBin()
    expect(bin.some((x) => x.id === p.id)).toBe(true)
  })
})

describe('004 文件夹密码/封面/描述', () => {
  it('setPassword/getPassword 往返', () => {
    const f = folders.create('加密文件夹')
    expect(folders.getPassword(f.id)).toBeNull()

    folders.setPassword(f.id, 'ENCRYPTED_BLOB')
    expect(folders.getPassword(f.id)).toBe('ENCRYPTED_BLOB')

    folders.setPassword(f.id, null)
    expect(folders.getPassword(f.id)).toBeNull()
  })

  it('list() 暴露 password/coverPhotoId/description 字段', () => {
    const f = folders.create('封面文件夹')
    const photo = photos.addPhoto('/tmp/cover.png')
    folders.setCover(f.id, photo.id)
    folders.setDescription(f.id, '测试描述')
    folders.setPassword(f.id, 'BLOB')

    const hit = folders.list().find((x) => x.id === f.id)!
    expect(hit.coverPhotoId).toBe(photo.id)
    expect(hit.description).toBe('测试描述')
    expect(hit.password).toBe('BLOB')
  })

  it('setCover 可清除（null）', () => {
    const f = folders.create('清封测试')
    const photo = photos.addPhoto('/tmp/cover2.png')
    folders.setCover(f.id, photo.id)
    folders.setCover(f.id, null)
    expect(folders.list().find((x) => x.id === f.id)?.coverPhotoId).toBeUndefined()
  })
})
