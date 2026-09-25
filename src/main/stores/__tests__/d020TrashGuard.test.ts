// @vitest-environment node
/**
 * D-020 保命约束单测：清空回收站只删**库内副本**，绝不碰库外文件
 *
 * e2e/storage-copy.spec.mjs 的注释写着「这条链单测测不了：PhotoDataStore 用的是仓库
 * 单例 + electron app 上下文」——靠 vi.mock 两个边界（db/database 的 handle、
 * libraryRegistry 的 activeRoot）其实测得动：仓库单例的 db 是懒 getter，
 * 换成测试内存库后，clearRecycleBin 整条链（取回收站 → 硬删行 → 按库内判定 unlink）
 * 跑的都是真代码，只有「库根在哪」「数据库句柄」是假的。给 D-020 加上 e2e 之外的第二层防线。
 *
 * 钉住的事实：
 * - 软删阶段磁盘零改动（回收站必须可逆）
 * - 清空时库内普通文件被 unlink；D-020 之前的引用行（file_path 指向 ~/Desktop 一类）
 *   的原件字节不动；目录与软链一律绕开（lstatSync isFile + realpath 双守卫）
 * - isInsideLibrary 用 path.relative 判定：前缀相似的兄弟目录不算库内
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { createTestDb, closeTestDb } from '../../db/__tests__/testDb'
import { PhotoDataStore } from '../PhotoDataStore'
import { PhotoRepository } from '../../db/repos/PhotoRepository'

/** 测试库根与内存库句柄的注入口：被 mock 的两个生产模块懒读这里的值 */
const state = vi.hoisted(() => ({
  root: '',
  db: null as unknown as import('better-sqlite3').Database
}))

vi.mock('../../db/database', () => ({
  database: {
    get handle() {
      return state.db
    }
  }
}))

vi.mock('../../modules/libraryRegistry', () => ({
  activeRoot: () => state.root,
  activeSubdir: (name: string) => state.root + '/' + name,
  listLibraries: () => []
}))

describe('PhotoDataStore · D-020 清空回收站守卫（只删库内副本）', () => {
  let db: Database.Database
  let store: PhotoDataStore
  let libRoot: string
  let outsideRoot: string

  beforeEach(() => {
    db = createTestDb()
    state.db = db
    // macOS 的 tmpdir 是 /var/...（/private/var 的别名）：两个根都先 realpath 成同一口径，
    // 否则「不存在路径按字面比」的 fallback 会把库内路径误判成库外（生产里 userData 才有这别名）
    libRoot = realpathSync(mkdtempSync(join(tmpdir(), 'leaf-d020-lib-')))
    outsideRoot = realpathSync(mkdtempSync(join(tmpdir(), 'leaf-d020-out-')))
    state.root = libRoot
    store = new PhotoDataStore()
  })
  afterEach(() => {
    closeTestDb(db)
    rmSync(libRoot, { recursive: true, force: true })
    rmSync(outsideRoot, { recursive: true, force: true })
    rmSync(libRoot + '-sibling', { recursive: true, force: true })
  })

  /** 在指定根下落一个真实文件；store.addPhoto 不拷贝，正好构造指定形状的行 */
  function seedFile(root: string, rel: string, body: string): string {
    const p = join(root, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, body)
    return p
  }

  it('库内素材：软删不碰磁盘，清空回收站才 unlink 库内副本并硬删行', () => {
    const inside = seedFile(libRoot, 'images/2609/库内.png', '库内副本')
    const p = store.addPhoto(inside)

    store.deletePhotos([p.id])
    // 软删阶段：文件还在（回收站可逆），行进回收站
    expect(existsSync(inside)).toBe(true)
    expect(store.getRecycleBinPhotos().map((x) => x.id)).toEqual([p.id])

    const purged = store.clearRecycleBin()
    expect(purged).toEqual([p.id])
    expect(existsSync(inside)).toBe(false)
    expect(store.getPhotoById(p.id)).toBeUndefined()
    expect(store.getRecycleBinPhotos()).toEqual([])
  })

  it('库外旧引用行（D-020 前指向 ~/Desktop 的形状）：清空回收站绝不碰原件字节', () => {
    const body = '用户自己磁盘上的文件，库不该动它\n'
    const outside = seedFile(outsideRoot, '桌面原图.png', body)
    const p = store.addPhoto(outside)
    expect(store.isInsideLibrary(outside)).toBe(false)

    store.deletePhotos([p.id])
    const purged = store.clearRecycleBin()
    // 行没了，但磁盘上的原件原样：内容一字节不动
    expect(purged).toEqual([p.id])
    expect(store.getPhotoById(p.id)).toBeUndefined()
    expect(existsSync(outside)).toBe(true)
    expect(readFileSync(outside, 'utf8')).toBe(body)
  })

  it('混合批次一次清空：库内的删、库外的留，两条分支互不牵连', () => {
    const inside = seedFile(libRoot, 'images/2609/副本.png', 'copy')
    const outside = seedFile(outsideRoot, '原件.png', 'original')
    const inId = store.addPhoto(inside).id
    const outId = store.addPhoto(outside).id

    store.deletePhotos([inId, outId])
    const purged = store.clearRecycleBin()
    expect([...purged].sort()).toEqual([inId, outId].sort())
    expect(existsSync(inside)).toBe(false)
    expect(existsSync(outside)).toBe(true)
  })

  it('回收站为空时清空是 no-op：返回 []，库内库外文件都原样', () => {
    const inside = seedFile(libRoot, 'images/2609/活的.png', 'alive')
    const outside = seedFile(outsideRoot, '活的原件.png', 'alive-out')
    store.addPhoto(inside)
    store.addPhoto(outside)

    expect(store.clearRecycleBin()).toEqual([])
    expect(existsSync(inside)).toBe(true)
    expect(existsSync(outside)).toBe(true)
  })

  it('file_path 指向目录的行不被 unlink（lstatSync isFile 守卫），目录连同内容保留', () => {
    const dir = join(libRoot, 'images', '2609', 'bundle-dir')
    const inner = join(dir, 'inside.txt')
    mkdirSync(dir, { recursive: true })
    writeFileSync(inner, 'keep')
    // PhotoDataStore.addPhoto 会拒收目录；目录形状的行只能由历史数据/异常产生，直接落库
    const id = new PhotoRepository(db).addPhoto(dir).id

    store.deletePhotos([id])
    store.clearRecycleBin()
    expect(existsSync(dir)).toBe(true)
    expect(readFileSync(inner, 'utf8')).toBe('keep')
  })

  it('库内软链指向库外文件：realpath 解析后判为库外，链与目标都不删', () => {
    const target = seedFile(outsideRoot, '真身.png', 'target')
    const link = join(libRoot, 'linked.png')
    symlinkSync(target, link)
    // lstat 看到的是软链，store 入口会拒收；引用行的形状只能直接落库
    const id = new PhotoRepository(db).addPhoto(link).id

    store.deletePhotos([id])
    store.clearRecycleBin()
    // 按字面比会把这条算成「库内」然后顺着链删掉用户的原件——realpath 守卫就是防这个
    expect(existsSync(link)).toBe(true)
    expect(readFileSync(target, 'utf8')).toBe('target')
  })

  it('isInsideLibrary 判定表：库根/库内路径（含尚不存在的新副本路径）为真，其余为假', () => {
    // 库根本身
    expect(store.isInsideLibrary(libRoot)).toBe(true)
    // 尚不存在的新副本目标路径（copyIntoLibrary 的落点）：不存在也必须按字面判成库内
    expect(store.isInsideLibrary(join(libRoot, 'images', '2701', 'new.png'))).toBe(true)
    // 库外目录下的文件
    expect(store.isInsideLibrary(join(outsideRoot, 'x.png'))).toBe(false)
    // 前缀相似的兄弟目录：字符串前缀匹配会误判，path.relative 判定不会
    const evil = seedFile(libRoot + '-sibling', '伪装库内.png', 'evil')
    expect(store.isInsideLibrary(evil)).toBe(false)
  })

  it('从回收站还原：库内库外文件都原样，行回到活跃列表（软删-还原是纯库操作）', () => {
    const inside = seedFile(libRoot, 'images/2609/误删.png', 'data')
    const outside = seedFile(outsideRoot, '引用原件.png', 'orig')
    const ids = [store.addPhoto(inside).id, store.addPhoto(outside).id]

    store.deletePhotos(ids)
    expect(store.restorePhotos(ids)).toBe(2)
    expect(store.getRecycleBinPhotos()).toEqual([])
    expect(store.getPhotos().map((p) => p.id).sort()).toEqual([...ids].sort())
    expect(existsSync(inside)).toBe(true)
    expect(existsSync(outside)).toBe(true)
  })

  it('断链批量处置：moveMissingToTrash 只带走断链行；随后清空删掉的是库内副本', () => {
    const missing = seedFile(libRoot, 'images/2608/丢了.png', 'gone-soon')
    const alive = seedFile(libRoot, 'images/2608/活的.png', 'stay')
    const missingId = store.addPhoto(missing).id
    const aliveId = store.addPhoto(alive).id
    const repo = new PhotoRepository(db)
    repo.setMissing(missingId, Date.now())

    expect(store.moveMissingToTrash()).toBe(1)
    // 断链行进回收站，活行不动，磁盘零改动
    expect(store.getRecycleBinPhotos().map((p) => p.id)).toEqual([missingId])
    expect(existsSync(missing)).toBe(true)
    expect(existsSync(alive)).toBe(true)

    // 清空：库内副本被删（missing 只是标记，文件还在磁盘上，照样按「库内」判删）
    store.clearRecycleBin()
    expect(existsSync(missing)).toBe(false)
    expect(existsSync(alive)).toBe(true)
    expect(store.getPhotoById(aliveId)).toBeDefined()
  })
})
