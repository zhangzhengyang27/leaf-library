// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { parseCaptureHash, parsePinHash } from '../session'

describe('parseCaptureHash', () => {
  it('解析完整参数', () => {
    const h =
      '#select?did=3&bx=0&by=0&bw=1440&bh=900&s=2&mode=last&ix=10&iy=20&iw=30&ih=40&ldid=3&lx=1&ly=2&lw=100&lh=80'
    const s = parseCaptureHash(h)
    expect(s).toMatchObject({
      displayId: 3,
      scale: 2,
      mode: 'last',
      initial: { x: 10, y: 20, width: 30, height: 40 },
      last: { displayId: 3, region: { x: 1, y: 2, width: 100, height: 80 } }
    })
    expect(s!.bounds).toEqual({ x: 0, y: 0, width: 1440, height: 900 })
  })
  it('无 last 参数时 last 为 null；scale 缺省 1', () => {
    const s = parseCaptureHash(
      '#select?did=1&bx=0&by=0&bw=800&bh=600&mode=region&ix=0&iy=0&iw=0&ih=0'
    )
    expect(s!.last).toBeNull()
    expect(s!.scale).toBe(1)
  })
  it('非 select hash 返回 null', () => {
    expect(parseCaptureHash('#pin?pid=abc')).toBeNull()
  })
})

describe('parsePinHash', () => {
  it('解析 payload id', () => expect(parsePinHash('#pin?pid=abc-1')).toBe('abc-1'))
  it('其它 hash 返回 null', () => expect(parsePinHash('#select?did=1')).toBeNull())
})
