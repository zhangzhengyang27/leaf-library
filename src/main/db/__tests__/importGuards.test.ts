/**
 * 导入防线行为回归（导入功能排查修复配套）：
 * - 重新导入回收站软删行 = 恢复原行（file_path 无 UNIQUE，防双行并存）
 * - 敏感路径黑名单：凭据/私钥类文件拒绝入库，阻断「入库→image:// 读内容」绕过链
 * 「目录/失效路径不入库」的过滤在 PhotoDataStore 入口层（依赖真实文件系统 +
 *   electron app 上下文，repository 保持纯数据层），不在本文件覆盖范围。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { PhotoRepository } from '../repos/PhotoRepository'
import { isSensitiveImportPath } from '../../utils/pathPolicy'

describe('PhotoRepository · 回收站软删行重新导入', () => {
  let db: Database.Database
  let photos: PhotoRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
  })
  afterEach(() => closeTestDb(db))

  it('软删后重新导入同路径 → 恢复原行，无双行并存', () => {
    const p1 = photos.addPhoto('/lib/a.png')
    photos.deletePhotos([p1.id])
    const p2 = photos.addPhoto('/lib/a.png')
    expect(p2.id).toBe(p1.id)
    expect(photos.getPhotos().filter((x) => x.filePath === '/lib/a.png').length).toBe(1)
    expect(photos.getRecycleBinPhotos().length).toBe(0)
  })

  it('活跃行重复导入仍幂等返回已有行，不恢复/不新增', () => {
    const p1 = photos.addPhoto('/lib/b.png')
    expect(photos.addPhoto('/lib/b.png').id).toBe(p1.id)
    expect(photos.getPhotos().length).toBe(1)
  })
})

describe('PhotoRepository · hasPhotoBySourcePath（检查器「显示原件」的白名单依据）', () => {
  let db: Database.Database
  let photos: PhotoRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
  })
  afterEach(() => closeTestDb(db))

  it('只认被登记为出处的路径；file_path 与 source_path 各查各的', () => {
    photos.addPhoto('/lib/images/2609/海报.png', { sourcePath: '/Users/xiaoye/Desktop/海报.png' })
    // 拷贝行的 file_path 是库内副本，用户要跳的是磁盘上那个出处
    expect(photos.hasPhotoBySourcePath('/Users/xiaoye/Desktop/海报.png')).toBe(true)
    expect(photos.hasPhotoBySourcePath('/lib/images/2609/海报.png')).toBe(false)
    // 白名单不是"任意路径都放行"：没登记过的出处必须为假
    expect(photos.hasPhotoBySourcePath('/Users/xiaoye/.ssh/id_rsa')).toBe(false)
  })

  it('迁移过的行（updateMigrationBatch 换绑）也能按出处查到', () => {
    const p = photos.addPhoto('/Users/xiaoye/Desktop/旧位置.txt')
    photos.updateMigrationBatch([
      {
        id: p.id,
        filePath: '/lib/images/2609/旧位置.txt',
        fileName: '旧位置.txt',
        sourcePath: '/Users/xiaoye/Desktop/旧位置.txt'
      }
    ])
    expect(photos.hasPhotoBySourcePath('/Users/xiaoye/Desktop/旧位置.txt')).toBe(true)
    expect(photos.hasPhotoByPath('/Users/xiaoye/Desktop/旧位置.txt')).toBe(false)
  })
})

describe('pathPolicy · isSensitiveImportPath', () => {
  it('凭据/私钥类文件命中黑名单', () => {
    expect(isSensitiveImportPath('/home/u/.ssh/id_rsa')).toBe(true)
    expect(isSensitiveImportPath('/home/u/.ssh/id_ed25519')).toBe(true)
    // 目录级规则优先：.ssh 整体视为敏感环境（known_hosts/config 同样不导入）
    expect(isSensitiveImportPath('/home/u/.ssh/id_rsa.pub')).toBe(true)
    expect(isSensitiveImportPath('/home/u/project/.env')).toBe(true)
    expect(isSensitiveImportPath('/home/u/certs/server.pem')).toBe(true)
    expect(isSensitiveImportPath('/home/u/vault.kdbx')).toBe(true)
  })

  it('普通素材与公钥放行', () => {
    expect(isSensitiveImportPath('/home/u/keys/host.pub')).toBe(false)
    expect(isSensitiveImportPath('/Users/xiaoye/Desktop/照片/设计稿.png')).toBe(false)
    expect(isSensitiveImportPath('/Users/xiaoye/Desktop/report.env.txt')).toBe(false)
  })
})
