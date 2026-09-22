import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import {
  clampTarget,
  evaluateFit,
  isCacheFresh,
  pruneWallpaperCache,
  probeSource,
  renderWallpaper,
  safeHexColor,
  sanitizeMode,
  wallpaperCachePath
} from '../wallpaperFit'

const dir = mkdtempSync(join(tmpdir(), 'leaf-wallpaper-'))

async function makePng(
  name: string,
  width: number,
  height: number,
  band?: { color: string; top: number; height: number }
): Promise<string> {
  const path = join(dir, name)
  const base = sharp({ create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } } })
  if (band) {
    const strip = await sharp({
      create: { width, height: band.height, channels: 3, background: band.color }
    })
      .png()
      .toBuffer()
    await base
      .composite([{ input: strip, top: band.top, left: 0 }])
      .png()
      .toFile(path)
  } else {
    await base.png().toFile(path)
  }
  return path
}

/** 上 60×60 不透明红、其余全透明：真实透明区域的最小样本 */
async function makeHalfTransparent(name: string): Promise<string> {
  const path = join(dir, name)
  const block = await sharp({
    create: { width: 200, height: 60, channels: 3, background: '#ff0000' }
  })
    .png()
    .toBuffer()
  await sharp({
    create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: block, top: 0, left: 0 }])
    .png()
    .toFile(path)
  return path
}

/** 全图最大灰度值，用于判定「这条带有没有被裁掉」 */
async function maxLuma(path: string): Promise<number> {
  const { data } = await sharp(path).grayscale().raw().toBuffer({ resolveWithObject: true })
  let max = 0
  for (const v of data) if (v > max) max = v
  return max
}

const portraitPath = join(dir, 'portrait.png')
const halfAlphaPath = join(dir, 'half-alpha.png')

beforeAll(async () => {
  // 竖图（800×1600）底部一条纯白带：cover 到 16:9 必然把它裁掉，模糊底会保留
  await makePng('portrait.png', 800, 1600, { color: '#ffffff', top: 1560, height: 40 })
  await makeHalfTransparent('half-alpha.png')
}, 30_000)

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('wallpaperFit · evaluateFit 分档', () => {
  const screen = { width: 1920, height: 1080, label: 'Main' }

  it('比例吻合 → 原图直设，无重编码', () => {
    const fit = evaluateFit({ source: { width: 2560, height: 1440 }, hasAlpha: false }, screen)
    expect(fit.strategy).toBe('original')
    expect(fit.reasons).toEqual([])
  })

  it('吻合但低于屏幕分辨率 → 仍走原图，只报 resolution', () => {
    const fit = evaluateFit({ source: { width: 1280, height: 720 }, hasAlpha: false }, screen)
    expect(fit.strategy).toBe('original')
    expect(fit.reasons).toEqual(['resolution'])
    expect(fit.upscaleNeed).toBeCloseTo(1.5, 5)
  })

  it('4:3 → 16:9 丢 25% 面积，超过 cover 阈值改模糊底', () => {
    const fit = evaluateFit({ source: { width: 1600, height: 1200 }, hasAlpha: false }, screen)
    expect(fit.cropPercent).toBeCloseTo(0.25, 2)
    expect(fit.strategy).toBe('blurred')
    expect(fit.reasons).toEqual(['ratio', 'resolution'])
  })

  it('轻微偏差（16:9 → 16:10）丢 10% → 居中裁切', () => {
    const fit = evaluateFit(
      { source: { width: 2560, height: 1440 }, hasAlpha: false },
      { width: 1920, height: 1200 }
    )
    expect(fit.cropPercent).toBeCloseTo(0.1, 2)
    expect(fit.strategy).toBe('cover')
  })

  it('竖屏图放横屏 → 模糊底，且丢弃面积接近 7 成', () => {
    const fit = evaluateFit({ source: { width: 1080, height: 1920 }, hasAlpha: false }, screen)
    expect(fit.cropPercent).toBeCloseTo(0.6836, 3)
    expect(fit.strategy).toBe('blurred')
  })

  it('有透明区域但很小 → 不许原图直设，也不值得留黑边，走 cover 顺带 flatten', () => {
    const fit = evaluateFit({ source: { width: 1920, height: 1080 }, hasAlpha: true }, screen)
    expect(fit.strategy).toBe('cover')
    expect(fit.reasons).toEqual(['transparency'])
  })

  it('透明范围大 → 模糊底兜住', () => {
    const fit = evaluateFit(
      { source: { width: 1920, height: 1080 }, hasAlpha: true, alphaWide: true },
      screen
    )
    expect(fit.strategy).toBe('blurred')
  })

  it('透明且比例差很大 → 仍是模糊底', () => {
    const fit = evaluateFit({ source: { width: 1080, height: 1920 }, hasAlpha: true }, screen)
    expect(fit.strategy).toBe('blurred')
  })

  it('阈值边界：恰好 15% 归 cover，恰好 2% 归 original', () => {
    // 2000×1000 → 1700×1000 二进制下算出 0.15000000000000002
    expect(
      evaluateFit({ source: { width: 2000, height: 1000 }, hasAlpha: false }, { width: 1700, height: 1000 })
        .strategy
    ).toBe('cover')
    expect(
      evaluateFit({ source: { width: 1020, height: 1000 }, hasAlpha: false }, { width: 1000, height: 1000 })
        .strategy
    ).toBe('original')
  })
})

describe('wallpaperFit · 目标与配色', () => {
  it('长边封顶 4096 保持比例', () => {
    expect(clampTarget({ width: 6144, height: 3456 })).toEqual({ width: 4096, height: 2304 })
    expect(clampTarget({ width: 1920, height: 1080 })).toEqual({ width: 1920, height: 1080 })
  })

  it('主色仅接受 #rrggbb，异常值落回中性深色', () => {
    expect(safeHexColor('#2a3f55')).toBe('#2a3f55')
    expect(safeHexColor(null)).not.toBe(null)
    expect(safeHexColor('red')).toBe(safeHexColor(undefined))
  })
})

describe('wallpaperFit · probeSource', () => {
  it('按 EXIF orientation 交换呈现尺寸', async () => {
    const path = join(dir, 'rotated.jpg')
    await sharp({
      create: { width: 400, height: 200, channels: 3, background: '#336699' }
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toFile(path)
    const info = await probeSource(path)
    expect({ width: info.width, height: info.height }).toEqual({ width: 200, height: 400 })
  })

  it('带 alpha 通道但全不透明 → 不算透明', async () => {
    const path = join(dir, 'opaque-alpha.png')
    await sharp({ create: { width: 60, height: 60, channels: 3, background: '#00ff00' } })
      .ensureAlpha()
      .png()
      .toFile(path)
    const meta = await sharp(path).metadata()
    expect(meta.hasAlpha).toBe(true)
    expect((await probeSource(path)).hasAlpha).toBe(false)
  })

  it('真透明区域 → 判为透明', async () => {
    expect((await probeSource(halfAlphaPath)).hasAlpha).toBe(true)
  })

  it('sharp 解不动的格式回落 1024 预览', async () => {
    const broken = join(dir, 'fake.heic')
    writeFileSync(broken, Buffer.from('not-a-real-heic'))
    const info = await probeSource(broken, portraitPath)
    expect(info.path).toBe(portraitPath)
    expect(info.width).toBe(800)
  })
})

describe('wallpaperFit · renderWallpaper', () => {
  const target = { width: 1600, height: 900 }

  it('cover 铺满目标，输出无 alpha 的 JPEG', async () => {
    const out = join(dir, 'cover.jpg')
    await renderWallpaper({
      inputPath: portraitPath,
      outPath: out,
      target,
      strategy: 'cover',
      backdrop: '#101014'
    })
    const meta = await sharp(out).metadata()
    expect({ width: meta.width, height: meta.height }).toEqual(target)
    expect(meta.format).toBe('jpeg')
    expect(meta.hasAlpha).toBeFalsy()
    // 居中裁切只保留源图中段，底部白条被切掉
    expect(await maxLuma(out)).toBeLessThan(200)
  })

  it('模糊底保留完整画面（含底部白条）', async () => {
    const out = join(dir, 'blurred.jpg')
    await renderWallpaper({
      inputPath: portraitPath,
      outPath: out,
      target,
      strategy: 'blurred',
      backdrop: '#101014'
    })
    const meta = await sharp(out).metadata()
    expect({ width: meta.width, height: meta.height }).toEqual(target)
    expect(await maxLuma(out)).toBeGreaterThan(200)
  })

  it('透明素材适配后不再有 alpha（避免系统给黑底）', async () => {
    const out = join(dir, 'alpha-out.jpg')
    await renderWallpaper({
      inputPath: halfAlphaPath,
      outPath: out,
      target,
      strategy: 'blurred',
      backdrop: '#ffcc00'
    })
    expect((await sharp(out).metadata()).hasAlpha).toBeFalsy()
  })
})

describe('wallpaperFit · 缓存', () => {
  it('路径带目标尺寸与策略，两种策略互不覆盖', () => {
    const cover = wallpaperCachePath('/tmp/wp', 'p1', { width: 3840, height: 2160 }, 'cover')
    const blurred = wallpaperCachePath('/tmp/wp', 'p1', { width: 3840, height: 2160 }, 'blurred')
    expect(cover).toBe(join('/tmp/wp', 'p1', '3840x2160-cover.jpg'))
    expect(blurred).not.toBe(cover)
  })

  it('源文件更新后缓存失效', async () => {
    const out = join(dir, 'fresh.jpg')
    writeFileSync(out, 'x')
    utimesSync(out, new Date(1000), new Date(1000))
    expect(isCacheFresh(out, 500)).toBe(true)
    expect(isCacheFresh(out, 5000)).toBe(false)
    expect(isCacheFresh(join(dir, 'nope.jpg'), 0)).toBe(false)
  })

  it('LRU 只保留最新若干张', async () => {
    const root = join(dir, 'wp-cache')
    for (let i = 0; i < 6; i++) {
      const path = wallpaperCachePath(root, `p${i}`, { width: 100, height: 100 }, 'cover')
      mkdirSync(dirname(path), { recursive: true })
      await sharp({ create: { width: 2, height: 2, channels: 3, background: '#010203' } })
        .jpeg()
        .toFile(path)
      utimesSync(path, new Date(i * 1000), new Date(i * 1000))
    }
    expect(pruneWallpaperCache(root, 2)).toBe(4)
    expect(existsSync(wallpaperCachePath(root, 'p5', { width: 100, height: 100 }, 'cover'))).toBe(
      true
    )
    expect(existsSync(wallpaperCachePath(root, 'p1', { width: 100, height: 100 }, 'cover'))).toBe(
      false
    )
  })
})

/** 逐像素写 alpha：clear 区域内透明、其余不透明 */
async function alphaPng(
  name: string,
  width: number,
  height: number,
  clear: { x: number; y: number; w: number; h: number }
): Promise<string> {
  const path = join(dir, name)
  const px = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      px[i] = 128
      px[i + 1] = 128
      px[i + 2] = 128
      px[i + 3] = 255
      if (x >= clear.x && x < clear.x + clear.w && y >= clear.y && y < clear.y + clear.h) {
        px[i + 3] = 0
      }
    }
  }
  await sharp(px, { raw: { width, height, channels: 4 } }).png().toFile(path)
  return path
}

/** 区域灰度统计（留白区该被糊平：std 低；留白若写成不透明黑：mean 掉到个位数） */
async function region(
  path: string,
  box: { left: number; top: number; width: number; height: number }
): Promise<{ mean: number; std: number }> {
  const { data } = await sharp(path).extract(box).grayscale().raw().toBuffer({
    resolveWithObject: true
  })
  let sum = 0
  for (const v of data) sum += v
  const mean = sum / data.length
  let sq = 0
  for (const v of data) sq += (v - mean) ** 2
  return { mean, std: Math.sqrt(sq / data.length) }
}

async function pixel(path: string, x: number, y: number): Promise<number[]> {
  const { data } = await sharp(path)
    .extract({ left: x, top: y, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true })
  return [data[0], data[1], data[2]]
}

describe('wallpaperFit · 透明像素口径', () => {
  it('小洞（真面积 0.077%）不再被漏判成不透明', async () => {
    // 旧口径按 alpha<250 占比 0.5% 卡：0.10% → 判不透明 → 直设原图 → 桌面一块黑底
    const path = await alphaPng('hole-40.png', 1920, 1080, { x: 0, y: 0, w: 40, h: 40 })
    const info = await probeSource(path)
    expect(info.hasAlpha).toBe(true)
    expect(info.alphaWide).toBe(false)
  })

  it('大洞（真面积 30%）判为透明范围大', async () => {
    const path = await alphaPng('hole-800.png', 1920, 1080, { x: 0, y: 0, w: 800, h: 800 })
    const info = await probeSource(path)
    expect(info.hasAlpha).toBe(true)
    expect(info.alphaWide).toBe(true)
  })

  it('大图上一条杂散透明行：承认有洞，但不升级为模糊底', async () => {
    // 真面积 0.033%，缩到 128×96 后 alpha<250 占 1.04%（旧口径据此判 wide，白留一圈边）
    const path = await alphaPng('row-4000.png', 4000, 3000, { x: 0, y: 1500, w: 4000, h: 1 })
    const info = await probeSource(path)
    expect(info.hasAlpha).toBe(true)
    expect(info.alphaWide).toBe(false)
  })
})

describe('wallpaperFit · 渲染实际效果', () => {
  it('模糊底真的被糊开：棋盘留白区 std 远低于主体区', async () => {
    const W = 900
    const H = 1800
    const px = Buffer.alloc(W * H * 3)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = ((x / 60) | 0) % 2 === ((y / 60) | 0) % 2 ? 250 : 5
        const i = (y * W + x) * 3
        px[i] = v
        px[i + 1] = v
        px[i + 2] = v
      }
    }
    const board = join(dir, 'board.png')
    await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toFile(board)
    const out = join(dir, 'board-blurred.jpg')
    await renderWallpaper({
      inputPath: board,
      outPath: out,
      target: { width: 1600, height: 900 },
      strategy: 'blurred',
      backdrop: '#000000'
    })
    const padding = await region(out, { left: 40, top: 60, width: 400, height: 700 })
    const subject = await region(out, { left: 700, top: 60, width: 200, height: 700 })
    // 不糊开的话留白区与主体区同样是高对比棋盘（实测 std ≈ 119）
    expect(padding.std).toBeLessThan(80)
    expect(padding.mean).toBeGreaterThan(40)
    expect(subject.std).toBeGreaterThan(padding.std)
  })

  it('透明区补主色：cover 用原主色，模糊底的填充色随底一起压暗', async () => {
    const cut = join(dir, 'cut-1200.png')
    const px = Buffer.alloc(1200 * 1200 * 4)
    for (let y = 0; y < 1200; y++) {
      for (let x = 0; x < 1200; x++) {
        const i = (y * 1200 + x) * 4
        const inBlock = x > 250 && x < 950 && y > 250 && y < 950
        px[i] = inBlock ? 224 : 0
        px[i + 1] = inBlock ? 85 : 0
        px[i + 2] = inBlock ? 85 : 0
        px[i + 3] = inBlock ? 255 : 0
      }
    }
    await sharp(px, { raw: { width: 1200, height: 1200, channels: 4 } }).png().toFile(cut)
    const target = { width: 1600, height: 900 }
    const coverOut = join(dir, 'cut-cover.jpg')
    await renderWallpaper({
      inputPath: cut,
      outPath: coverOut,
      target,
      strategy: 'cover',
      backdrop: '#ffcc00'
    })
    expect(await pixel(coverOut, 8, 8)).toEqual([255, 204, 0])
    const blurOut = join(dir, 'cut-blurred.jpg')
    await renderWallpaper({
      inputPath: cut,
      outPath: blurOut,
      target,
      strategy: 'blurred',
      backdrop: '#ffcc00'
    })
    const [r, g] = await pixel(blurOut, 8, 8)
    expect(r).toBeLessThan(200)
    expect(g).toBeLessThan(160)
  })

  it('EXIF orientation 5~8：渲染与判定同向（标记带落在呈现后的边）', async () => {
    // 存储 400×200、白带贴在右侧；呈现为 200×400 时 5/6 转到底部、7/8 转到顶部
    // 5/7 是镜像的 90°/270°，把判据从 >=5 写成 >=6 只会错掉这两例，故四个都要钉
    for (const [orientation, edge] of [
      [5, 'bottom'],
      [6, 'bottom'],
      [7, 'top'],
      [8, 'top']
    ] as const) {
      const band = await sharp({ create: { width: 20, height: 200, channels: 3, background: '#ffffff' } })
        .png()
        .toBuffer()
      const path = join(dir, `rot-${orientation}.jpg`)
      await sharp({ create: { width: 400, height: 200, channels: 3, background: { r: 0, g: 0, b: 0 } } })
        .composite([{ input: band, top: 0, left: 380 }])
        .withMetadata({ orientation })
        .jpeg()
        .toFile(path)
      const info = await probeSource(path)
      expect({ width: info.width, height: info.height }).toEqual({ width: 200, height: 400 })
      const out = join(dir, `rot-${orientation}-out.jpg`)
      await renderWallpaper({
        inputPath: path,
        outPath: out,
        target: { width: 200, height: 400 },
        strategy: 'blurred',
        backdrop: '#000000'
      })
      const near = await region(out, { left: 60, top: edge === 'bottom' ? 356 : 20, width: 80, height: 20 })
      const far = await region(out, { left: 60, top: edge === 'bottom' ? 20 : 356, width: 80, height: 20 })
      expect(near.mean).toBeGreaterThan(far.mean + 60)
    }
  })
})

describe('wallpaperFit · 信任边界', () => {
  it('mode 白名单：非法值一律降级 auto', () => {
    expect(sanitizeMode('cover')).toBe('cover')
    expect(sanitizeMode(undefined)).toBe('auto')
    expect(sanitizeMode('../../../tmp/pwn')).toBe('auto')
    expect(sanitizeMode('ORIGINAL')).toBe('auto')
    expect(sanitizeMode({ toString: () => 'cover' })).toBe('auto')
  })

  it('缓存路径拒绝策略注入与 photoId 越界', () => {
    const root = join(dir, 'jail')
    const target = { width: 100, height: 100 }
    expect(() =>
      wallpaperCachePath(root, 'p1', target, '../../../tmp/pwn' as 'cover')
    ).toThrow()
    expect(() => wallpaperCachePath(root, '../../escape', target, 'cover')).toThrow()
    expect(wallpaperCachePath(root, 'p1', target, 'cover')).toContain(join('jail', 'p1'))
  })
})
