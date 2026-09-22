/**
 * 标注输入校验（@shared/annotations）
 *
 * 这个函数是渲染层与主进程共用的**唯一**判据：主进程拿它挡脏数据，
 * 检查器拿它给即时反馈。判错一个方向都很贵——放太松会把 SQLITE_CONSTRAINT
 * 抛给用户看（一句没有上下文的失败），放太紧用户写满 2,000 字的批注会被莫名拒掉。
 */
import { describe, it, expect } from 'vitest'
import {
  ANNOTATION_BODY_MAX,
  ANNOTATION_MIN_SIDE,
  isAnnotationIdLike,
  normalizeAnnotationInput
} from '../annotations'

const ID = '3f2b1c4a-5d6e-4f70-8a9b-0c1d2e3f4a5b'
const rect = { x: 12, y: 34, w: 100, h: 60 }

function okValue(raw: unknown): Record<string, unknown> | null {
  const r = normalizeAnnotationInput(raw)
  return r.ok ? (r.value as unknown as Record<string, unknown>) : null
}

describe('normalizeAnnotationInput', () => {
  it('三种形状都收：素材级 / 区域 / 时间点', () => {
    expect(okValue({ body: '这块留白很好' })).toEqual({ body: '这块留白很好' })
    expect(okValue({ body: 'logo', rect })).toEqual({ body: 'logo', rect })
    expect(okValue({ body: '开头节奏慢', atMs: 1500 })).toEqual({ body: '开头节奏慢', atMs: 1500 })
  })

  it('正文去首尾空白；空正文、纯空白都拒', () => {
    expect(okValue({ body: '  带空格  ' })?.body).toBe('带空格')
    expect(normalizeAnnotationInput({ body: '' }).ok).toBe(false)
    expect(normalizeAnnotationInput({ body: '   \n\t ' }).ok).toBe(false)
  })

  it('正文上限是硬拒，不截断（截断会让用户以为存下了全文）', () => {
    const tooLong = { body: '字'.repeat(ANNOTATION_BODY_MAX + 1) }
    const r = normalizeAnnotationInput(tooLong)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain(String(ANNOTATION_BODY_MAX))
    expect(okValue({ body: '字'.repeat(ANNOTATION_BODY_MAX) })).not.toBeNull()
  })

  it('区域与时间点互斥（一张图上的框不可能同时是个时刻）', () => {
    expect(normalizeAnnotationInput({ body: 'x', rect, atMs: 100 }).ok).toBe(false)
  })

  it('区域四值必须齐全，且不小于 10×10', () => {
    expect(normalizeAnnotationInput({ body: 'x', rect: { x: 1, y: 2, w: 3 } }).ok).toBe(false)
    expect(
      normalizeAnnotationInput({ body: 'x', rect: { ...rect, w: ANNOTATION_MIN_SIDE - 1 } }).ok
    ).toBe(false)
    expect(normalizeAnnotationInput({ body: 'x', rect: { ...rect, h: 0 } }).ok).toBe(false)
    expect(normalizeAnnotationInput({ body: 'x', rect: { ...rect, x: -1 } }).ok).toBe(false)
  })

  it('非有限数字一律拒：NaN/Infinity 进 REAL 列是能存进去的，读出来才坏', () => {
    for (const bad of [
      { body: 'x', rect: { x: NaN, y: 1, w: 20, h: 20 } },
      { body: 'x', rect: { x: Infinity, y: 1, w: 20, h: 20 } },
      { body: 'x', rect: { x: 1, y: 1, w: 20, h: Infinity } },
      { body: 'x', atMs: NaN },
      { body: 'x', atMs: -1 },
      { body: 'x', atMs: '123' }
    ])
      expect(normalizeAnnotationInput(bad).ok, JSON.stringify(bad)).toBe(false)
  })

  it('荒谬坐标（十万像素级）拒掉——那是传错，不是"图很大"', () => {
    expect(normalizeAnnotationInput({ body: 'x', rect: { x: 1e6, y: 1, w: 20, h: 20 } }).ok).toBe(
      false
    )
  })

  it('时间点四舍五入到整数毫秒（与 duration_ms 同单位）', () => {
    expect(okValue({ body: 'x', atMs: 1234.6 })?.atMs).toBe(1235)
  })

  it('非对象输入不抛', () => {
    for (const bad of [null, undefined, 'x', 42, [], true])
      expect(normalizeAnnotationInput(bad).ok).toBe(false)
  })
})

describe('isAnnotationIdLike', () => {
  it('只认 uuid 形状', () => {
    expect(isAnnotationIdLike(ID)).toBe(true)
    expect(isAnnotationIdLike(ID.toUpperCase())).toBe(true)
    for (const bad of ['', '  ', 'item/1', `${ID}-extra`, ID.replace(/-/g, ''), null, 7])
      expect(isAnnotationIdLike(bad)).toBe(false)
  })
})
