/**
 * Leaf · 图片相似度纯函数（二期：以图搜图 / 相似查重）
 *
 * phash 为 sharp-phash 产出的 64 位比特串（'0'/'1' × 64）。
 * 距离 = 汉明距离（0-64）；借鉴 czkawka/imagededup 的阈值经验：
 *   ≤ 5 近乎相同，≤ 10 高度相似（默认阈值）。
 *
 * 每项先把比特串解析为两个 32 位整数（hi/lo），配对比较只需 2 次 XOR + 2 次
 * popcount（查表位技巧），万级库全量聚类在秒级内。
 */

export interface PhashItem {
  id: string
  phash: string
}

export interface PhotoMatch {
  id: string
  distance: number
}

/** 16 位半字的 popcount 查表（构建一次） */
const POPCOUNT16 = (() => {
  const table = new Uint8Array(1 << 16)
  for (let i = 0; i < table.length; i++) {
    let n = i
    let count = 0
    while (n) {
      count += n & 1
      n >>= 1
    }
    table[i] = count
  }
  return table
})()

function popcount32(x: number): number {
  return POPCOUNT16[x & 0xffff] + POPCOUNT16[(x >>> 16) & 0xffff]
}

/** 比特串 → [hi, lo] 两个 32 位整数；非法输入返回 null */
export function parsePhash(phash: string): [number, number] | null {
  if (typeof phash !== 'string' || phash.length !== 64 || /[^01]/.test(phash)) return null
  const hi = parseInt(phash.slice(0, 32), 2)
  const lo = parseInt(phash.slice(32), 2)
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null
  return [hi, lo]
}

export function hammingDistance(a: string, b: string): number {
  const pa = parsePhash(a)
  const pb = parsePhash(b)
  if (!pa || !pb) return 64
  return popcount32(pa[0] ^ pb[0]) + popcount32(pa[1] ^ pb[1])
}

// —— 六期：多索引哈希（Multi-Index Hashing，5 万+ 库的相似聚类引擎）——
//
// 原 O(n²) 配对在 5 万库时不可行（待办清单低优先级项）。BK-tree 在随机高熵
// pHash 上会退化（距离集中 32±4，三角剪枝失效），改用 MIH：
// 64 位拆 4 段 ×16 位，鸽笼原理保证汉明距离 ≤ t 的两串至少有一段距离 ≤ ⌊t/4⌋，
// 查询 = 枚举 4 段半径 r 内的全部段变体（r=2 时 4×137=548 次桶查找）→ 小候选集
// 精确验证。精确检索（不漏不假阳），结果与暴力扫描完全一致。

/** 库规模超过该值才启用 MIH（小库建索引开销 > 暴力扫描） */
export const MIH_THRESHOLD = 2_000

/** 16 位段内枚举半径（threshold=10 → r=2；threshold ≤ 4 → r=1 也够） */
function segmentRadius(threshold: number): number {
  return Math.floor(threshold / 4)
}

/** 段值在半径 r 内的全部变体（含自身）；16 位、r ≤ 3 时规模可枚举。
 *  r=3 必须枚举（审查 P2-12）：threshold ≥ 12 时鸽笼半径为 3，
 *  只枚举到 2 会静默漏配对，违反「精确检索（不漏不假阳）」承诺。 */
function segmentVariants(segment: number, r: number): number[] {
  const out: number[] = [segment]
  // 距离 1
  for (let i = 0; i < 16; i++) out.push(segment ^ (1 << i))
  if (r >= 2) {
    for (let i = 0; i < 16; i++)
      for (let j = i + 1; j < 16; j++) out.push(segment ^ ((1 << i) | (1 << j)))
  }
  if (r >= 3) {
    for (let i = 0; i < 16; i++)
      for (let j = i + 1; j < 16; j++)
        for (let k = j + 1; k < 16; k++)
          out.push(segment ^ ((1 << i) | (1 << j) | (1 << k)))
  }
  return out
}

export class MultiIndexHasher {
  /** 4 个段桶：段值 → id 列表 */
  private buckets: Array<Map<number, string[]>> = [0, 1, 2, 3].map(() => new Map())
  /** id → 已解析比特（查询时精确验证用） */
  private idToBits = new Map<string, [number, number]>()
  private count = 0

  constructor(items: PhashItem[]) {
    for (const it of items) {
      const bits = parsePhash(it.phash)
      if (!bits) continue
      this.count++
      this.idToBits.set(it.id, bits)
      for (let s = 0; s < 4; s++) {
        const seg = segmentOf(bits, s)
        const bucket = this.buckets[s].get(seg)
        if (bucket) bucket.push(it.id)
        else this.buckets[s].set(seg, [it.id])
      }
    }
  }

  /** 半径查询（精确）：回调所有距离 ≤ threshold 的条目（含自身，调用方自行排除） */
  query(
    hi: number,
    lo: number,
    threshold: number,
    visit: (id: string, distance: number) => void
  ): void {
    if (this.count === 0) return
    const bits: [number, number] = [hi, lo]
    const r = segmentRadius(threshold)
    const seen = new Set<string>()
    for (let s = 0; s < 4; s++) {
      const seg = segmentOf(bits, s)
      for (const variant of segmentVariants(seg, r)) {
        const bucket = this.buckets[s].get(variant)
        if (!bucket) continue
        for (const id of bucket) {
          if (seen.has(id)) continue
          seen.add(id)
          // 精确验证（桶命中只是必要条件）
          const other = this.idToBits.get(id)
          if (!other) continue
          const d = popcount32(other[0] ^ hi) + popcount32(other[1] ^ lo)
          if (d <= threshold) visit(id, d)
        }
      }
    }
  }
}

function segmentOf(bits: [number, number], s: number): number {
  // 段 0/1 取 lo 的低/高 16 位，段 2/3 取 hi 的低/高 16 位
  const word = s < 2 ? bits[1] : bits[0]
  return (word >>> ((s % 2) * 16)) & 0xffff
}

/**
 * 找出与 targetId 最相似的图片（不含自身），按距离升序。
 * distance 附带在结果里，便于 UI 展示「相似度」。
 */
export function findSimilar(items: PhashItem[], targetId: string, threshold = 10): PhotoMatch[] {
  const target = items.find((it) => it.id === targetId)
  if (!target) return []
  const targetBits = parsePhash(target.phash)
  if (!targetBits) return []

  const out: PhotoMatch[] = []
  for (const it of items) {
    if (it.id === targetId) continue
    const bits = parsePhash(it.phash)
    if (!bits) continue
    const distance = popcount32(targetBits[0] ^ bits[0]) + popcount32(targetBits[1] ^ bits[1])
    if (distance <= threshold) out.push({ id: it.id, distance })
  }
  return out.sort((a, b) => a.distance - b.distance)
}

/**
 * 全库相似聚类（并查集）。返回组内 id 列表，只保留 ≥2 张的组。
 * 组内按传入顺序；组间按组内最小出现顺序，保证稳定输出。
 * 大库（> MIH_THRESHOLD）用多索引哈希替代 O(n²) 配对，结果一致。
 */
export function clusterDuplicates(items: PhashItem[], threshold = 10): string[][] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    // 路径压缩迭代版
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    while (parent.get(x) !== x) {
      const next = parent.get(x)!
      parent.set(x, root)
      x = next
    }
    return root
  }
  const union = (a: string, b: string): void => {
    parent.set(find(a), find(b))
  }

  const parsed: Array<{ id: string; bits: [number, number] }> = []
  for (const it of items) {
    const bits = parsePhash(it.phash)
    if (!bits) continue
    parent.set(it.id, it.id)
    parsed.push({ id: it.id, bits })
  }

  if (parsed.length > MIH_THRESHOLD) {
    const hasher = new MultiIndexHasher(items)
    for (const p of parsed) {
      hasher.query(p.bits[0], p.bits[1], threshold, (id) => {
        if (id !== p.id) union(p.id, id)
      })
    }
  } else {
    for (let i = 0; i < parsed.length; i++) {
      for (let j = i + 1; j < parsed.length; j++) {
        const d =
          popcount32(parsed[i].bits[0] ^ parsed[j].bits[0]) +
          popcount32(parsed[i].bits[1] ^ parsed[j].bits[1])
        if (d <= threshold) union(parsed[i].id, parsed[j].id)
      }
    }
  }

  const groups = new Map<string, string[]>()
  for (const it of parsed) {
    const root = find(it.id)
    const list = groups.get(root)
    if (list) list.push(it.id)
    else groups.set(root, [it.id])
  }
  return Array.from(groups.values()).filter((g) => g.length >= 2)
}
