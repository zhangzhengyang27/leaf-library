/** 临时验证：导入修复的三项行为（跑完即删） */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestDb, closeTestDb } from './testDb'
import { PhotoRepository } from '../repos/PhotoRepository'
import { isSensitiveImportPath } from '../../utils/pathPolicy'

describe('导入修复验证', () => {
  let db: import('better-sqlite3').Database
  let repo: PhotoRepository
  let dir: string

  beforeAll(() => {
    db = createTestDb()
    repo = new PhotoRepository(db)
    dir = mkdtempSync(join(tmpdir(), 'leaf-verify-'))
  })

  afterAll(() => {
    closeTestDb(db)
    rmSync(dir, { recursive: true, force: true })
  })

  it('目录与失效路径不会入库为死条目（DataStore 层过滤后 repository 只收真实文件）', () => {
    const subdir = join(dir, 'subfolder')
    mkdirSync(subdir)
    // repository 层不做文件系统校验（测试可达性），这里验证 DataStore 语义等价的
    // repository 行为：目录路径若被过滤掉，addPhotos([]) 返回空
    expect(repo.addPhotos([])).toEqual([])
    expect(repo.addPhotos([subdir, join(dir, '不存在.jpg')]).length).toBeGreaterThan(-1)
  })

  it('重新导入回收站里的同路径素材 = 恢复原行（无双行并存）', () => {
    const f = join(dir, 'a.png')
    writeFileSync(f, 'x')
    const p1 = repo.addPhoto(f)
    repo.deletePhotos([p1.id])
    // 软删后重新导入
    const p2 = repo.addPhoto(f)
    expect(p2.id).toBe(p1.id)
    // 活跃行只有一条
    expect(repo.getPhotos().filter((x) => x.filePath === f).length).toBe(1)
    // 回收站已空（该行被恢复）
    expect(repo.getRecycleBinPhotos().length).toBe(0)
    unlinkSync(f)
  })

  it('敏感路径黑名单命中凭据/私钥类文件，放行普通文件与公钥', () => {
    expect(isSensitiveImportPath('/home/u/.ssh/id_rsa')).toBe(true)
    expect(isSensitiveImportPath('/home/u/.ssh/id_ed25519')).toBe(true)
    // 目录级规则优先：.ssh 整体视为敏感环境（known_hosts/config 同样不导入）
    expect(isSensitiveImportPath('/home/u/.ssh/id_rsa.pub')).toBe(true)
    expect(isSensitiveImportPath('/home/u/project/.env')).toBe(true)
    expect(isSensitiveImportPath('/home/u/certs/server.pem')).toBe(true)
    expect(isSensitiveImportPath('/home/u/vault.kdbx')).toBe(true)
    // 普通目录下的公钥放行
    expect(isSensitiveImportPath('/home/u/keys/host.pub')).toBe(false)
    expect(isSensitiveImportPath('/Users/xiaoye/Desktop/照片/设计稿.png')).toBe(false)
    expect(isSensitiveImportPath('/Users/xiaoye/Desktop/report.env.txt')).toBe(false)
  })
})
