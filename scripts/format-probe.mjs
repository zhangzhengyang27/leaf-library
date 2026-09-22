/**
 * F14 格式能力探针：输出本机 sharp / ffmpeg 的解码能力矩阵。
 *
 * 运行：node scripts/format-probe.mjs
 * 结论回填到 docs/eagle-parity-plan.md F14 小节与 assetTypes 扩展决策。
 * （AVIF 已在 IMAGE_EXTENSIONS；本脚本验证 JPEG-XL / HEVC 是否可用。）
 */
import sharp from 'sharp'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'

function makePng() {
  return sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 90, g: 140, b: 220 } }
  })
    .png()
    .toBuffer()
}

async function probeSharpJxl() {
  try {
    // 编码探测：sharp 预编译含 libjxl 才支持 jxl 输出
    const buf = await sharp(await makePng()).jxl({ quality: 80 }).toBuffer()
    const meta = await sharp(buf).metadata()
    return { encode: true, decode: meta.format === 'jxl' }
  } catch (err) {
    return { encode: false, decode: false, error: String(err.message ?? err).slice(0, 120) }
  }
}

async function probeSharpHeif() {
  // heic/avif 解码（libheif）
  try {
    const buf = await sharp(await makePng()).heif({}).toBuffer()
    const meta = await sharp(buf).metadata()
    return { encode: true, format: meta.format }
  } catch (err) {
    return { encode: false, error: String(err.message ?? err).slice(0, 120) }
  }
}

function probeFfmpeg() {
  const bin = ffmpegInstaller.path
  const out = execFileSync(bin, ['-hide_banner', '-decoders'], { encoding: 'utf8' })
  const has = (name) => new RegExp(`\\b${name}\\b`).test(out)
  return {
    bin,
    hevc: has('hevc'),
    h264: has('h264'),
    vp9: has('vp9'),
    av1: has('libaom-av1') || has('av1')
  }
}

const dir = mkdtempSync(join(tmpdir(), 'leaf-probe-'))
try {
  const jxl = await probeSharpJxl()
  const heif = await probeSharpHeif()
  let ff = { error: 'ffmpeg probe failed' }
  try {
    ff = probeFfmpeg()
  } catch (err) {
    ff = { error: String(err.message ?? err).slice(0, 120) }
  }
  console.log('=== sharp 能力 ===')
  console.log('sharp 版本:', sharp.versions?.vips ?? 'unknown', '| formats:', Object.keys(sharp.format).filter((f) => sharp.format[f].input.buffer).join(', '))
  console.log('JPEG-XL (jxl):', jxl)
  console.log('HEIF/HEIC:', heif)
  console.log('=== ffmpeg 解码器 ===')
  console.log(ff)
  console.log('=== 结论建议 ===')
  console.log('- avif：已在 IMAGE_EXTENSIONS（sharp libheif 支持时缩略图管线直接可用）')
  console.log(`- jxl：${jxl.decode ? '可加入 IMAGE_EXTENSIONS' : '保持 file 兜底（sharp 预编译无 libjxl）'}`)
  console.log(`- hevc/h265 视频：${ff.hevc ? 'ffmpeg 可解码，VIDEO_EXTENSIONS 可加 hevc/h265' : '保持现状'}`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
