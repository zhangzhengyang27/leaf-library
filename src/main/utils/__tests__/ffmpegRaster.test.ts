import { describe, expect, it, afterAll } from 'vitest'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import sharp from 'sharp'
import { RASTER_EXTENSIONS } from '@shared/assetTypes'
import { isFfmpegRasterizable, rasterizeWithFfmpeg } from '../ffmpegRaster'
import { getFfmpegPath } from '../ffmpeg'

/**
 * 真跑兜底光栅化：逐个扩展名「ffmpeg 编码 → 我们的函数解码 → sharp 读回」。
 *
 * 这条用例是 RASTER_EXTENSIONS 的入场券：formatCapability 的白名单守卫把 RASTER
 * 组当作"有解码通道"，担保就落在这里——往里塞一个 ffmpeg 解不了的格式，
 * 下面那条参数化用例就会红（历史上 `.hdr` 正是这样被验出现实里没通道）。
 *
 * 夹具在模块顶层同步构造 + describe.skipIf：缺 ffmpeg 时显式 skip，不用
 * `if (!fixture) return` 把"没跑成"伪装成绿灯。
 */
const dir = mkdtempSync(join(tmpdir(), 'leaf-raster-'))
const SRC = { w: 64, h: 48 }
/** 扩展名 → ffmpeg 编码器名 */
const ENCODERS: Record<string, string> = {
  bmp: 'bmp',
  exr: 'exr',
  tga: 'targa',
  dpx: 'dpx',
  sgi: 'sgi',
  jp2: 'jpeg2000'
}

const fixtures: Record<string, string> = {}
let ready = false
try {
  const png = join(dir, 'src.png')
  await sharp({
    create: { width: SRC.w, height: SRC.h, channels: 3, background: { r: 10, g: 128, b: 240 } }
  })
    .png()
    .toBuffer()
    .then((b) => writeFileSync(png, b))
  for (const ext of RASTER_EXTENSIONS) {
    const enc = ENCODERS[ext]
    if (!enc) continue
    const file = join(dir, `src.${ext}`)
    execFileSync(getFfmpegPath(), [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      png,
      '-c:v',
      enc,
      file
    ])
    if (existsSync(file)) fixtures[ext] = file
  }
  ready = Object.keys(fixtures).length === RASTER_EXTENSIONS.length
} catch {
  ready = false
}

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('ffmpeg 兜底光栅化', () => {
  it('每个 RASTER 扩展名都能编出夹具（漏一个就是编码器表没跟上白名单）', () => {
    expect(Object.keys(fixtures).sort()).toEqual([...RASTER_EXTENSIONS].sort())
  })

  it.skipIf(!ready)(
    '逐个 RASTER 格式解码回 PNG，尺寸与源图一致',
    async () => {
      for (const [ext, file] of Object.entries(fixtures)) {
        const out = join(dir, `out-${ext}.png`)
        await rasterizeWithFfmpeg(file, out)
        const m = await sharp(out).metadata()
        expect(m.format, ext).toBe('png')
        expect([m.width, m.height], ext).toEqual([SRC.w, SRC.h])
      }
    },
    60000
  )

  it.skipIf(!ready)('指定 maxEdge 时缩小并保持宽高比', async () => {
    const out = join(dir, 'small.png')
    await rasterizeWithFfmpeg(fixtures.tga, out, 32)
    const m = await sharp(out).metadata()
    expect([m.width, m.height]).toEqual([32, 24])
  })

  it('RASTER 白名单全部命中该档（单一真源）', () => {
    for (const e of RASTER_EXTENSIONS) expect(isFfmpegRasterizable(`a.${e}`)).toBe(true)
    expect(isFfmpegRasterizable('a.png')).toBe(false)
  })
})
