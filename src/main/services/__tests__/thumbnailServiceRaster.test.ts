import { describe, expect, it, afterAll } from 'vitest'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import sharp from 'sharp'
import { ThumbnailService } from '../ThumbnailService'
import { getFfmpegPath } from '../../utils/ffmpeg'

/**
 * 兜底光栅化档在缩略图服务里的接线（真跑）：断言两级 JPEG 真的落盘、尺寸正确。
 *
 * 夹具在模块顶层同步构造 + describe.skipIf：环境缺 ffmpeg 时整组显式 skip，
 * 而不是用 `if (!fixture) return` 把「没跑成」伪装成绿灯。
 */
const work = mkdtempSync(join(tmpdir(), 'leaf-thumbs-'))
const svcRoot = join(work, 'thumbs')
const tga = join(work, 'src.tga')

let ready = false
try {
  const png = join(work, 'src.png')
  await sharp({
    create: { width: 320, height: 200, channels: 3, background: { r: 8, g: 200, b: 90 } }
  })
    .png()
    .toBuffer()
    .then((b) => writeFileSync(png, b))
  execFileSync(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-i', png, tga])
  ready = existsSync(tga)
} catch {
  ready = false
}

afterAll(() => rmSync(work, { recursive: true, force: true }))

describe('ThumbnailService 接 ffmpeg 兜底档', () => {
  it.skipIf(!ready)('tga 生成 256 / 1024 两级 JPEG，长边不放大原图', async () => {
    const svc = new ThumbnailService(svcRoot)
    const { thumb, preview } = await svc.ensure('photo-tga', tga)
    expect(existsSync(thumb)).toBe(true)
    expect(existsSync(preview)).toBe(true)
    // 源图 320×200 → 256 档缩到 256×160，1024 档不放大（withoutEnlargement）
    const t = await sharp(thumb).metadata()
    expect([t.width, t.height]).toEqual([256, 160])
    const p = await sharp(preview).metadata()
    expect([p.width, p.height]).toEqual([320, 200])
  })

  it.skipIf(!ready)('thumb:// 现场重生成路径（generate）同样覆盖 tga', async () => {
    const svc = new ThumbnailService(svcRoot)
    rmSync(join(svcRoot, 'photo-gen'), { recursive: true, force: true })
    const out = await svc.generate('photo-gen', tga, 256)
    expect(existsSync(out)).toBe(true)
    expect((await sharp(out).metadata()).format).toBe('jpeg')
  })

  it('png 仍走 sharp 原路径，不进 ffmpeg 档', async () => {
    const png = join(work, 'plain.png')
    await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 1, g: 2, b: 3 } }
    })
      .png()
      .toBuffer()
      .then((b) => writeFileSync(png, b))
    const svc = new ThumbnailService(svcRoot)
    const { preview } = await svc.ensure('photo-png', png)
    expect((await sharp(preview).metadata()).width).toBe(40)
  })
})
