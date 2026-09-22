import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { rmSync } from 'fs'
import sharp from 'sharp'
import type { Sharp } from 'sharp'

/**
 * PSD 嵌入缩略图提取（阶段 4.3）。
 *
 * PSD 无纯 JS 合成图解码器（bundled libvips 不支持），但大多数 PSD 在
 * 图像资源段（Image Resources）内嵌有缩略图资源：
 *   - ID 1033 (0x0409) Photoshop 4.0：JPEG
 *   - ID 1036 (0x040C) Photoshop 5.0+：RAW RGB 或 JPEG
 * 资源数据以 28 字节头开始：格式(1=JPEG)/宽/高/行字节数/总大小/压缩后大小/位深/平面数。
 * RAW RGB 为 bottom-up 行序，需垂直翻转。
 */

const PSD_THUMB_IDS = new Set([0x0409, 0x040c])
const THUMB_HEADER = 28

export function isPsdFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.psd')
}

/** 从 PSD 提取内嵌缩略图并保存为 PNG（长边不超过 maxEdge）；无缩略图资源时抛错 */
export async function extractPsdThumbnail(
  psdPath: string,
  outPngPath: string,
  maxEdge = 1024
): Promise<{ width: number; height: number }> {
  const buf = await readFile(psdPath)
  if (buf.length < 26 || buf.toString('latin1', 0, 4) !== '8BPS') {
    throw new Error('不是有效的 PSD 文件')
  }

  // 跳过文件头(26) + 颜色模式数据段
  const colorLen = buf.readUInt32BE(26)
  let offset = 30 + colorLen
  if (offset + 4 > buf.length) throw new Error('PSD 图像资源段缺失')

  // 图像资源段：4 字节长度 + 资源块序列
  const resLen = buf.readUInt32BE(offset)
  const resEnd = offset + 4 + resLen
  offset += 4

  while (offset + 12 <= resEnd) {
    // 资源块：'8BIM' + 2 字节 ID + Pascal 名（补偶）+ 4 字节数据长度
    if (buf.toString('latin1', offset, offset + 4) !== '8BIM') {
      throw new Error('图像资源块签名不匹配')
    }
    const id = buf.readUInt16BE(offset + 4)
    const nameLen = buf[offset + 6]
    const dataLenStart = offset + 7 + nameLen + ((nameLen + 1) % 2)
    const dataLen = buf.readUInt32BE(dataLenStart)
    const dataStart = dataLenStart + 4
    if (dataStart + dataLen > buf.length) break

    if (PSD_THUMB_IDS.has(id) && dataLen > THUMB_HEADER) {
      const fmt = buf.readUInt32BE(dataStart)
      const width = buf.readUInt32BE(dataStart + 4)
      const height = buf.readUInt32BE(dataStart + 8)
      if (width > 0 && height > 0 && width <= 20000 && height <= 20000) {
        const payload = buf.subarray(dataStart + THUMB_HEADER, dataStart + dataLen)
        return await rasterizeThumbPayload(payload, fmt, { width, height }, outPngPath, maxEdge)
      }
    }

    offset = dataStart + dataLen + (dataLen % 2)
  }

  throw new Error('PSD 未包含内嵌缩略图资源')
}

async function rasterizeThumbPayload(
  payload: Buffer,
  fmt: number,
  size: { width: number; height: number },
  outPngPath: string,
  maxEdge: number
): Promise<{ width: number; height: number }> {
  let pipeline: Sharp
  let rawTmp: string | null = null
  if (fmt === 1) {
    // JPEG 内嵌缩略图：直接解码
    pipeline = sharp(payload)
  } else {
    // RAW RGB（bottom-up 行序，channels=3），需垂直翻转
    const rawLen = size.width * size.height * 3
    if (payload.length < rawLen) throw new Error('PSD 内嵌缩略图数据不完整')
    const raw = payload.subarray(0, rawLen)
    const tmp = join(
      tmpdir(),
      `leaf-psd-raw_${Date.now()}_${Math.random().toString(36).slice(2)}.raw`
    )
    // 临时 raw 用 try/finally 全程清理（审查 P2-25）：旧实现只在 writeFile 失败分支
    // 清理，成功路径每张 RAW-PSD 向 tmpdir 泄漏 width*height*3 字节
    await writeFile(tmp, raw)
    rawTmp = tmp
    pipeline = sharp(tmp, {
      raw: { width: size.width, height: size.height, channels: 3 }
    }).flip()
  }

  try {
    const out = await pipeline
      .rotate()
      .resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()
    await writeFile(outPngPath, out)
    return size
  } finally {
    if (rawTmp) rmSync(rawTmp, { force: true })
  }
}
