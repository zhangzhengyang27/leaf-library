import { describe, it, expect } from 'vitest'
import { cosine, l2Normalize, parseVector, vectorToBlob } from '../vectors'

describe('l2Normalize', () => {
  it('归一到单位长', () => {
    const v = l2Normalize(new Float32Array([3, 4]))
    expect(v).not.toBeNull()
    expect(v![0]).toBeCloseTo(0.6, 6)
    expect(v![1]).toBeCloseTo(0.8, 6)
  })

  it('零向量/NaN/Inf 一律拒（D-017 的"静默零向量"就是这么溜进来的）', () => {
    expect(l2Normalize(new Float32Array([0, 0, 0]))).toBeNull()
    expect(l2Normalize(new Float32Array([NaN, 1, 1]))).toBeNull()
    expect(l2Normalize(new Float32Array([Infinity, 1, 1]))).toBeNull()
    expect(l2Normalize(new Float32Array([1e-30, 0]))).toBeNull()
  })
})

describe('BLOB 往返', () => {
  it('存进去读出来逐位相同', () => {
    const v = new Float32Array([0.1, -0.2, 0.30000001, 0.9])
    const norm = l2Normalize(v)!
    const back = parseVector(vectorToBlob(norm), norm.length)
    expect(Array.from(back!)).toEqual(Array.from(norm))
  })

  it('维度不符 / 非单位长 / 长度不整除 4 都判为脏数据', () => {
    const unit = l2Normalize(new Float32Array([1, 2, 3]))!
    expect(parseVector(vectorToBlob(unit), 2)).toBeNull()
    // [1,0,0] 本身就是单位向量，容差窗 [0.9,1.1] 内 → 应当收
    expect(parseVector(vectorToBlob(new Float32Array([1, 0, 0])), 3)).not.toBeNull()
    const notUnit = new Float32Array([3, 4, 0])
    expect(parseVector(vectorToBlob(notUnit), 3)).toBeNull()
    expect(parseVector(Buffer.alloc(7), 2)).toBeNull()
  })
})

describe('cosine', () => {
  it('同向 1、正交 0、反向 -1', () => {
    const a = l2Normalize(new Float32Array([1, 0, 0]))!
    expect(cosine(a, a)).toBeCloseTo(1, 6)
    expect(cosine(a, l2Normalize(new Float32Array([0, 1, 0]))!)).toBeCloseTo(0, 6)
    expect(cosine(a, l2Normalize(new Float32Array([-1, 0, 0]))!)).toBeCloseTo(-1, 6)
  })

  it('维度不一致返回 -1 而不是算出个错数', () => {
    expect(cosine(new Float32Array([1, 0]), new Float32Array([1, 0, 0]))).toBe(-1)
  })
})
