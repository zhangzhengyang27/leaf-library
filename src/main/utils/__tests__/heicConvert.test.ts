import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import { statSync, truncateSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { heicToPngBuffer, heicQueueSize, withHeicSlot } from '../imageConvert'

/**
 * HEIC 的 wasm 解码档（不依赖 sips，因此 Windows 走的也正是这条路）。
 *
 * 夹具是「上红下蓝」的 64×48 HEIC，断言按行取实际像素——这样能抓住
 * 误加/漏加 flip（上下颠倒看起来仍是"一张正常图"，只有按坐标取值才发现）
 * 以及把 `.all` 当默认导出用（返回数组、没有顶层 width/height）这两类静默错误。
 */
const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'halves.heic')

const pixelAt = async (png: Buffer, y: number): Promise<string> => {
  const px = await sharp(png).extract({ left: 32, top: y, width: 1, height: 1 }).raw().toBuffer()
  return `${px[0]},${px[1]},${px[2]}`
}

/** HEVC 是有损编码，判色相通道谁占优而不是比精确值 */
const isReddish = (rgb: string): boolean => {
  const [r, , b] = rgb.split(',').map(Number)
  return r > 150 && b < 100
}
const isBluish = (rgb: string): boolean => {
  const [r, , b] = rgb.split(',').map(Number)
  return b > 150 && r < 100
}

describe('heicToPngBuffer（HEIC wasm 解码）', () => {
  it('真 HEIC 解出正确尺寸', async () => {
    const png = await heicToPngBuffer(fixture)
    const m = await sharp(png).metadata()
    expect(m.format).toBe('png')
    expect([m.width, m.height]).toEqual([64, 48])
  })

  it('行序正确：首行是源图上半部的红，末行是下半部的蓝', async () => {
    const png = await heicToPngBuffer(fixture)
    const top = await pixelAt(png, 0)
    const bottom = await pixelAt(png, 47)
    expect(isReddish(top)).toBe(true)
    expect(isBluish(bottom)).toBe(true)
  })
})

describe('HEIC wasm 档的两道闸', () => {
  it('并发闸真的串行：3 个任务同时在飞时峰值并发为 1', async () => {
    let live = 0
    let peak = 0
    const task = () =>
      new Promise<number>((resolve) => {
        live++
        peak = Math.max(peak, live)
        setTimeout(() => {
          live--
          resolve(1)
        }, 30)
      })
    await Promise.all([withHeicSlot(task), withHeicSlot(task), withHeicSlot(task)])
    expect(peak).toBe(1)
    expect(heicQueueSize()).toBe(0) // 队列交还干净，不会累积在飞量
  })

  it('超过体积上限的文件在读取前就被拒', async () => {
    const big = join(tmpdir(), `leaf-huge-${Date.now()}.heic`)
    writeFileSync(big, '')
    truncateSync(big, 70 * 1024 * 1024) // 稀疏文件：stat 到 70MB，不真占盘
    expect(statSync(big).size).toBe(70 * 1024 * 1024)
    try {
      await expect(heicToPngBuffer(big)).rejects.toThrow(/体积上限/)
    } finally {
      unlinkSync(big)
    }
  })

  it('非 HEIC 文件明确抛错（不会被静默当图片解）', async () => {
    const fake = join(tmpdir(), `leaf-fake-${Date.now()}.heic`)
    writeFileSync(fake, 'not a heic at all')
    try {
      await expect(heicToPngBuffer(fake)).rejects.toThrow()
    } finally {
      unlinkSync(fake)
    }
  })
})
