import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { PhotoRepository } from '../repos/PhotoRepository'
import {
  hammingDistance,
  findSimilar,
  clusterDuplicates,
  parsePhash,
  MultiIndexHasher,
  MIH_THRESHOLD
} from '../photoSimilarity'

describe('photoSimilarity · 纯函数', () => {
  it('parsePhash 校验 64 位比特串', () => {
    expect(parsePhash('0'.repeat(64))).toEqual([0, 0])
    expect(parsePhash('1'.repeat(64))).toEqual([0xffffffff, 0xffffffff])
    expect(parsePhash('0'.repeat(63))).toBeNull()
    expect(parsePhash('0'.repeat(63) + '2')).toBeNull()
    expect(parsePhash('')).toBeNull()
  })

  it('hammingDistance：全同 0、全反 64、逐位递增', () => {
    const zeros = '0'.repeat(64)
    const ones = '1'.repeat(64)
    expect(hammingDistance(zeros, zeros)).toBe(0)
    expect(hammingDistance(zeros, ones)).toBe(64)
    expect(hammingDistance(zeros, '1' + '0'.repeat(63))).toBe(1)
    expect(hammingDistance(zeros, '11' + '0'.repeat(62))).toBe(2)
    // 跨 hi/lo 边界（第 32/33 位）
    expect(hammingDistance(zeros, '0'.repeat(31) + '1' + '1' + '0'.repeat(31))).toBe(2)
    // 非法输入 → 最大距离
    expect(hammingDistance(zeros, 'xxx')).toBe(64)
  })

  it('findSimilar：按距离升序、排除自身、过滤超阈值', () => {
    const items = [
      { id: 'a', phash: '0'.repeat(64) },
      { id: 'b', phash: '0'.repeat(62) + '11' },
      { id: 'c', phash: '0'.repeat(58) + '1'.repeat(6) },
      { id: 'd', phash: '1'.repeat(64) }
    ]
    const result = findSimilar(items, 'a', 10)
    expect(result.map((r) => r.id)).toEqual(['b', 'c'])
    expect(result[0].distance).toBe(2)
    expect(result[1].distance).toBe(6)
    // 提高阈值后 d 也可能入选（全反距离 64 > 10，仍不入选）
    expect(findSimilar(items, 'a', 63).map((r) => r.id)).toEqual(['b', 'c'])
    // 目标不存在
    expect(findSimilar(items, 'zzz')).toEqual([])
  })

  it('clusterDuplicates：并查集聚类，仅保留 ≥2 张的组', () => {
    const items = [
      { id: 'a', phash: '0'.repeat(64) },
      { id: 'b', phash: '0'.repeat(63) + '1' }, // a-b 距离 1
      { id: 'c', phash: '0'.repeat(63) + '1' }, // 与 b 相同（a-b-c 传递成组）
      { id: 'd', phash: '1'.repeat(64) },
      { id: 'e', phash: '1'.repeat(63) + '0' } // d-e 距离 1
    ]
    const groups = clusterDuplicates(items, 10)
    expect(groups).toHaveLength(2)
    const ids = groups.map((g) => [...g].sort())
    expect(ids).toContainEqual(['a', 'b', 'c'])
    expect(ids).toContainEqual(['d', 'e'])
  })

  it('clusterDuplicates：无重复时返回空', () => {
    const items = [
      { id: 'a', phash: '0'.repeat(64) },
      { id: 'b', phash: '1'.repeat(64) }
    ]
    expect(clusterDuplicates(items, 10)).toEqual([])
  })
})

describe('六期 · 多索引哈希（MIH）', () => {
  // 合成 pHash：随机 64 位串 + 按位翻转变体（模拟"近重复"）
  function randomBits(rng: () => number): string {
    let s = ''
    for (let i = 0; i < 64; i++) s += rng() < 0.5 ? '0' : '1'
    return s
  }
  function mutate(bits: string, flips: number, rng: () => number): string {
    const arr = bits.split('')
    for (let i = 0; i < flips; i++) {
      const idx = Math.floor(rng() * 64)
      arr[idx] = arr[idx] === '0' ? '1' : '0'
    }
    return arr.join('')
  }
  // 确定性伪随机（mulberry32），保证测试可复现
  function mulberry32(seed: number): () => number {
    return () => {
      seed |= 0
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  it('MIH 半径查询与暴力扫描完全一致', () => {
    const rng = mulberry32(42)
    const items = Array.from({ length: 800 }, (_, i) => ({
      id: `p${i}`,
      phash: randomBits(rng)
    }))
    const target = items[0].phash
    const bits = parsePhash(target)!
    const hasher = new MultiIndexHasher(items)
    const viaMih: Array<{ id: string; distance: number }> = []
    hasher.query(bits[0], bits[1], 8, (id, distance) => viaMih.push({ id, distance }))
    viaMih.sort((a, b) => a.id.localeCompare(b.id))
    const brute = items
      .map((it) => ({ id: it.id, distance: hammingDistance(target, it.phash) }))
      .filter((m) => m.distance <= 8)
      .sort((a, b) => a.id.localeCompare(b.id))
    expect(viaMih).toEqual(brute)
  })

  it('clusterDuplicates 聚类（MIH 手工并查集对拍）', () => {
    const rng = mulberry32(7)
    // 缩小阈值绕过规模分支：直接构造超过 BK_TREE_THRESHOLD 的库代价高，
    // 改为验证等价性——把同一份小库阈值下暴力结果与手建 tree 查询并查集结果对拍
    const seeds = Array.from({ length: 40 }, () => randomBits(rng))
    const items = seeds.flatMap((s, gi) =>
      Array.from({ length: 5 }, (_, k) => ({
        id: `g${gi}_k${k}`,
        phash: mutate(s, k * 2, rng) // 组内两两距离 ≤ 8
      }))
    )
    const brute = clusterDuplicates(items, 8)
    // 用 BkTree 手工跑同一并查集逻辑
    const parent = new Map<string, string>()
    const find = (x: string): string => {
      while (parent.get(x) !== x) x = parent.get(x)!
      return x
    }
    const hasher = new MultiIndexHasher(items)
    // 先全量初始化再 union：查询会返回外层循环尚未初始化的条目（此处踩过）
    for (const it of items) parent.set(it.id, it.id)
    for (const it of items) {
      const bits = parsePhash(it.phash)!
      hasher.query(bits[0], bits[1], 8, (id) => {
        parent.set(find(it.id), find(id))
      })
    }
    const groups = new Map<string, string[]>()
    for (const it of items) {
      const root = find(it.id)
      groups.set(root, [...(groups.get(root) ?? []), it.id])
    }
    const viaTree = Array.from(groups.values())
      .filter((g) => g.length >= 2)
      .map((g) => [...g].sort())
      .sort((a, b) => a[0].localeCompare(b[0]))
    const bruteSorted = brute.map((g) => [...g].sort()).sort((a, b) => a[0].localeCompare(b[0]))
    expect(viaTree).toEqual(bruteSorted)
  })

  it(`5 万条合成库（MIH 分支自动启用）在秒级完成且找出植入重复组`, () => {
    const rng = mulberry32(1234)
    const items: Array<{ id: string; phash: string }> = []
    // 5 万条随机
    for (let i = 0; i < MIH_THRESHOLD + 48_000; i++) {
      items.push({ id: `rnd${i}`, phash: randomBits(rng) })
    }
    // 植入 20 组"连拍"重复（基准串 + 4 个 4 位翻转变体）
    const planted: string[][] = []
    for (let g = 0; g < 20; g++) {
      const base = randomBits(rng)
      const group = ['base', 'v1', 'v2', 'v3', 'v4'].map((tag, k) => {
        const id = `dup${g}_${tag}`
        items.push({ id, phash: k === 0 ? base : mutate(base, 4, rng) })
        return id
      })
      planted.push(group)
    }
    const t0 = Date.now()
    const groups = clusterDuplicates(items, 8)
    const elapsed = Date.now() - t0
    expect(elapsed).toBeLessThan(45_000) // 宽松上限：MIH 纯算实测 ~1-2s（CI）；
    // x64 Mac 基线 ~22s，热降频时可到 ~37s（D-011 验证实测），故留余量
    // 每组植入的 5 条必须被聚到同一组
    const idToGroup = new Map<string, string[]>()
    for (const g of groups) for (const id of g) idToGroup.set(id, g)
    for (const group of planted) {
      const first = idToGroup.get(group[0])
      expect(first, `planted group ${group[0]}`).toBeDefined()
      for (const id of group.slice(1)) {
        expect(idToGroup.get(id)).toBe(first)
      }
    }
  }, 60_000)
})

describe('PhotoRepository · 以图搜图 / 查重', () => {
  let db: Database.Database
  let repo: PhotoRepository

  const seed = (id: string, phash: string): string => {
    const photo = repo.addPhoto(`/${id}.png`)
    repo.updateProcessingResult(photo.id, { phash })
    return photo.id
  }

  beforeEach(() => {
    db = createTestDb()
    repo = new PhotoRepository(db)
  })
  afterEach(() => closeTestDb(db))

  it('findSimilarPhotos 返回带距离的相似图片', () => {
    const a = seed('a', '0'.repeat(64))
    const b = seed('b', '0'.repeat(62) + '11')
    const c = seed('c', '0'.repeat(58) + '1'.repeat(6))
    seed('d', '1'.repeat(64))

    const matches = repo.findSimilarPhotos(a, 10)
    expect(matches.map((m) => m.photo.id)).toEqual([b, c])
    expect(matches[0].distance).toBe(2)
  })

  it('getDuplicatePhotoGroups 聚类并按组大小排序', () => {
    const a = seed('a', '0'.repeat(64))
    const b = seed('b', '0'.repeat(63) + '1')
    const c = seed('c', '0'.repeat(63) + '1')
    const d = seed('d', '1'.repeat(64))
    const e = seed('e', '1'.repeat(63) + '0')

    const groups = repo.getDuplicatePhotoGroups(10)
    expect(groups).toHaveLength(2)
    // 大组在前；成员逐一点名——旧断言拿 groups[0][2] 自己当预期值，
    // 只有 a 恰好排在返回数组末位时才成立，等于随机通过（审查二轮：测试有效性）
    expect(groups[0].map((p) => p.id).sort()).toEqual([a, b, c].sort())
    expect(groups[1].map((p) => p.id).sort()).toEqual([d, e].sort())
  })

  it('软删除的图片不参与相似/查重', () => {
    const a = seed('a', '0'.repeat(64))
    const b = seed('b', '0'.repeat(63) + '1')
    repo.deletePhotos([b])
    expect(repo.findSimilarPhotos(a, 10)).toEqual([])
    expect(repo.getDuplicatePhotoGroups(10)).toEqual([])
  })
})
