import { existsSync, readFileSync, writeFileSync, promises as fsp } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import sharp from 'sharp'
import PQueue from 'p-queue'

const execFileAsync = promisify(execFile)

/**
 * 将 HEIC/HEIF 文件转换为 PNG，返回可被 sharp 消费的文件路径。
 * 调用方负责在用完后删除临时文件。
 *
 * 为什么要自己转：随包 libvips 的 heif 只登记了 `.avif` 且没编 libde265，
 * 对 HEIC 一律报 "Support for this compression format has not been built in"。
 *
 * 两级：
 * - macOS：系统 sips（色彩管理与裁边最稳，失败则继续往下）
 * - 跨平台：heic-decode + libheif-js wasm（wasm 内嵌在 JS 里，不需要 asarUnpack）
 *
 * 用默认导出（`one`）而不是 `.all`：`.all` 返回的是懒解码图片描述数组、没有
 * 顶层 width/height，喂 ArrayBuffer 还会抛 "Spread syntax requires…"。
 * 这两个报错曾在排障时被误判成「libheif-js 1.23.2 坏了」，隔离 A/B 后确认
 * 1.19.8 与 1.23.2 都能正常解码，问题在调用形态——不要为此锁版本。
 */
export async function convertHeicToPng(filePath: string): Promise<string> {
  const tempFileName = `heic_${Date.now()}_${Math.random().toString(36).substring(7)}.png`
  const tempFilePath = join(tmpdir(), tempFileName)

  if (process.platform === 'darwin') {
    // 必须用 execFile（数组参数）：文件名可能含 $(...) / 反引号，
    // exec 字符串拼接只转义双引号挡不住命令替换
    try {
      await execFileAsync('sips', ['-s', 'format', 'png', filePath, '--out', tempFilePath], {
        timeout: 15000
      })
      if (existsSync(tempFilePath)) {
        return tempFilePath
      }
    } catch (sipsError) {
      console.error(`sips conversion failed for: ${filePath}`, sipsError)
    }
  }

  try {
    const png = await heicToPngBuffer(filePath)
    writeFileSync(tempFilePath, png)
    return tempFilePath
  } catch (wasmError) {
    console.error(`heic-decode conversion failed for: ${filePath}`, wasmError)
  }

  // 此处原有一条 nativeImage.createFromPath 兜底，实测（Electron 38 = Chromium
  // 140，真 HEIC / 真 avif 样本）它对 HEIC 与 AVIF 一律返回空图、只认 Chromium
  // 支持的位图，是条永不生效的死分支，已删。
  throw new Error(`HEIC 转换失败（${process.platform}）: ${filePath}`)
}

/**
 * 纯 wasm 解码档（不碰 sips），Windows 与单测都走这里——
 * 拆出来是因为在 mac 上直接测 convertHeicToPng 会被 sips 抢先命中，
 * wasm 分支等于永远没被验过。
 *
 * 解码输出已是正向行序，不要 flip（上红下蓝夹具验过：解出来 y0 仍为红）。
 * 因为是整块读入 + 全分辨率解码（w×h×4 两份），这里自带两道闸：
 * 体积上限 + 并发 1 的串行队列（`thumb://` 现场重生成那条路没有任何外部限流）。
 */
export async function heicToPngBuffer(filePath: string): Promise<Buffer> {
  const { size } = await fsp.stat(filePath)
  if (size > MAX_HEIC_BYTES) {
    // 解码后是 w×h×4 的 RGBA（还要两份），48MP 手机全景都远不到这个线，
    // 超的基本是误投或异常文件——拒绝比 OOM 整个主进程好
    throw new Error(`HEIC 超出解码体积上限 (${size}B > ${MAX_HEIC_BYTES}B)`)
  }
  return withHeicSlot(() => decodeHeicUnlocked(filePath))
}

/** 单文件上限：wasm 全分辨率解码要在主进程里吃 w×h×4 ×2 份内存 */
const MAX_HEIC_BYTES = 64 * 1024 * 1024

/**
 * 串行闸：并发 1。
 *
 * 为什么必须有：管线侧有 `PQueue({concurrency:2})`，但 `thumb://` 未命中缓存时
 * 现场重生成走的是 ThumbnailService.generate，**没有任何并发上限**——
 * 一屏几十张大 HEIC 就会起几十个 wasm 全解码，主进程直接被打穿。
 * sips 那一级不需要（它是子进程，且失败即降级到这里）。
 */
const heicQueue = new PQueue({ concurrency: 1 })
export function withHeicSlot<T>(task: () => Promise<T>): Promise<T> {
  return heicQueue.add(task) as Promise<T>
}

/** 测试点用的在飞量（并发闸是否真的生效，只有这里能观察到） */
export function heicQueueSize(): number {
  return heicQueue.pending + heicQueue.size
}

async function decodeHeicUnlocked(filePath: string): Promise<Buffer> {
  // CJS/ESM 双形状：包导出是 `module.exports = one`（函数）再挂 .all
  const mod = (await import('heic-decode')) as unknown
  const decode = (typeof mod === 'function' ? mod : (mod as { default?: unknown }).default) as (a: {
    buffer: Uint8Array
  }) => Promise<{
    width: number
    height: number
    data: Uint8ClampedArray
  }>
  const img = await decode({ buffer: new Uint8Array(readFileSync(filePath)) })
  // Buffer.from(view) 按视图拷贝；img.data.buffer 是整块 wasm 堆，不能直接喂
  return sharp(Buffer.from(img.data), {
    raw: { width: img.width, height: img.height, channels: 4 }
  })
    .png()
    .toBuffer()
}

export function isHeicPath(filePath: string): boolean {
  const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'))
  // .hif 是 HEIF 的另一等扩展名（Eagle 的格式表里也列了它），
  // 少了它就会被当普通图片喂给 sharp，报 unsupported 后落字母卡
  return ext === '.heic' || ext === '.heif' || ext === '.hif'
}
