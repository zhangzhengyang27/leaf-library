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
