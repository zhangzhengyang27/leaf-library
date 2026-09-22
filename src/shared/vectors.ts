/**
 * Leaf · 向量存储的公共件（G1 图像向量塔）
 *
 * 单位向量存 Float32 little-endian BLOB。写入前一律 L2 归一，读取后余弦就退化成点积。
 *
 * 为什么要 `parseVector` 里那一串校验：D-017 那轮踩过「建索引静默零向量」——
 * 零向量的余弦恒为 0，界面表现为"检索永远无结果"但没有任何报错。
 * 所以归一化失败（模长为 0 / 含 NaN / 含 Infinity）必须显式拒绝，
 * 而不是存一个看着正常的 3KB BLOB 下去。
 */

export function l2Normalize(v: Float32Array): Float32Array | null {
  let sum = 0
  for (let i = 0; i < v.length; i++) {
    const x = v[i]
    if (!Number.isFinite(x)) return null
    sum += x * x
  }
  const norm = Math.sqrt(sum)
  if (!Number.isFinite(norm) || norm < 1e-8) return null
  const out = new Float32Array(v.length)
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm
  return out
}

export function vectorToBlob(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength)
}

/** 长度/维度/有限性任一不合格返回 null（调用方按"这条没有向量"处理） */
export function parseVector(blob: Buffer | Uint8Array, dim: number): Float32Array | null {
  if (!blob || blob.byteLength !== dim * 4) return null
  const copy = new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength)
  const v = new Float32Array(copy.buffer.slice(0))
  if (v.length !== dim) return null
  let sum = 0
  for (let i = 0; i < v.length; i++) {
    if (!Number.isFinite(v[i])) return null
    sum += v[i] * v[i]
  }
  // 存进去的应当已经是单位向量；模长明显不为 1 说明写入方绕过了归一化
  if (sum < 0.9 || sum > 1.1) return null
  return v
}

/** 两个（已归一的）向量余弦 = 点积；维度不一致返回 -1（不可比） */
export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return -1
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}
