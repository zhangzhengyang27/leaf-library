/**
 * PsdThumbnail · PSD 内嵌缩略图提取（阶段 4.3）
 *
 * 手工构造最小 PSD：文件头 + 空颜色模式段 + 图像资源段（内嵌 1036 JPEG 缩略图），
 * 验证解析与输出；再验证「无缩略图资源」时抛错。
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'
import { extractPsdThumbnail } from '../../services/PsdThumbnail'

/** 构造 PSD 二进制（仅图像资源段 + 指定资源块） */
function buildPsd(resourceBlocks: Buffer[]): Buffer {
  const header = Buffer.alloc(26)
  header.write('8BPS', 0, 'latin1')
  header.writeUInt16BE(1, 4) // version
  header.writeUInt16BE(3, 12) // channels (RGB)
  header.writeUInt32BE(100, 14) // height
  header.writeUInt32BE(80, 18) // width
  header.writeUInt16BE(8, 22) // depth
  header.writeUInt16BE(3, 24) // color mode RGB

  const colorMode = Buffer.alloc(4) // 颜色模式数据长度 = 0

  const resourceData = Buffer.concat(resourceBlocks)
  const resources = Buffer.alloc(4)
  resources.writeUInt32BE(resourceData.length, 0)

  return Buffer.concat([header, colorMode, resources, resourceData])
}

/**
 * Pascal 字符串（1 字节长度 + 名称，整体补偶）+ 4 字节数据长度 + 数据。
 * 名称区占 1 + name.length + ((1 + name.length) % 2) 字节。
 */
function buildBlock(id: number, name: string, data: Buffer): Buffer {
  const nameBuf = Buffer.from(name, 'latin1')
  const nameArea = 1 + nameBuf.length + ((1 + nameBuf.length) % 2)
  const block = Buffer.alloc(4 + 2 + nameArea + 4 + data.length)
  let off = 0
  block.write('8BIM', off, 'latin1')
  off += 4
  block.writeUInt16BE(id, off)
  off += 2
  block[off] = nameBuf.length
  off += 1
  nameBuf.copy(block, off)
  off += nameBuf.length
  if ((1 + nameBuf.length) % 2 === 1) {
    block[off] = 0
    off += 1
  }
  block.writeUInt32BE(data.length, off)
  off += 4
  data.copy(block, off)
  return block
}

/** 构造单个 8BIM 资源块（JPEG 缩略图资源） */
function buildThumbBlock(id: number, jpeg: Buffer, width: number, height: number): Buffer {
  // 28 字节头 + JPEG 载荷
  const payload = Buffer.alloc(28)
  payload.writeUInt32BE(1, 0) // format = JPEG
  payload.writeUInt32BE(width, 4)
  payload.writeUInt32BE(height, 8)
  payload.writeUInt32BE(Math.ceil((width * 3) / 2) * 2, 12) // 行字节数（仅占位）
  payload.writeUInt32BE(28 + jpeg.length, 16) // 总大小
  payload.writeUInt32BE(jpeg.length, 20) // 压缩后大小
  payload.writeUInt16BE(24, 24)
  payload.writeUInt16BE(3, 26)
  return buildBlock(id, 'thumbnail', Buffer.concat([payload, jpeg]))
}

function writeTempPsd(blocks: Buffer[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'leaf-psd-test-'))
  const psdPath = join(dir, 'sample.psd')
  writeFileSync(psdPath, buildPsd(blocks))
  return psdPath
}

describe('PsdThumbnail.extractPsdThumbnail', () => {
  it('提取 1036 JPEG 内嵌缩略图并输出 PNG', async () => {
    const jpeg = await sharp({
      create: {
        width: 80,
        height: 100,
        channels: 3,
        background: { r: 200, g: 60, b: 30 }
      }
    })
      .jpeg()
      .toBuffer()
    const psdPath = writeTempPsd([buildThumbBlock(0x040c, jpeg, 80, 100)])
    const outDir = mkdtempSync(join(tmpdir(), 'leaf-psd-out-'))
    const outPng = join(outDir, 'thumb.png')

    try {
      const size = await extractPsdThumbnail(psdPath, outPng, 512)
      expect(size).toEqual({ width: 80, height: 100 })
      const meta = await sharp(outPng).metadata()
      expect(meta.format).toBe('png')
      expect(meta.width).toBe(80)
      expect(meta.height).toBe(100)
    } finally {
      rmSync(psdPath, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  it('无缩略图资源时抛错（上层保持 thumbStatus=2 兜底）', async () => {
    const block = buildBlock(0x07d0, 'res', Buffer.alloc(8)) // 任意其他资源 ID
    const psdPath = writeTempPsd([block])
    const outDir = mkdtempSync(join(tmpdir(), 'leaf-psd-out-'))
    const outPng = join(outDir, 'thumb.png')
    try {
      await expect(extractPsdThumbnail(psdPath, outPng)).rejects.toThrow(/未包含内嵌缩略图资源/)
    } finally {
      rmSync(psdPath, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  it('非 PSD 文件（签名不匹配）抛错', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'leaf-psd-test-'))
    const badPath = join(dir, 'fake.psd')
    writeFileSync(badPath, Buffer.from('not a psd file at all'))
    try {
      await expect(extractPsdThumbnail(badPath, join(dir, 'o.png'))).rejects.toThrow(
        /不是有效的 PSD/
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
