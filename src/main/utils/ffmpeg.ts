import { join } from 'path'
import { existsSync } from 'fs'

// 缓存 ffmpeg 路径，避免重复查找
let cachedFfmpegPath: string | null = null

/**
 * 获取 ffmpeg 可执行文件路径
 * 优先使用打包的 ffmpeg，如果不可用则回退到系统 ffmpeg
 */
export function getFfmpegPath(): string {
  if (cachedFfmpegPath !== null) {
    return cachedFfmpegPath
  }

  try {
    // 尝试加载打包的 ffmpeg

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 无类型声明的 CommonJS 包
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg')
    const ffmpegPath = ffmpegInstaller.path

    if (ffmpegPath) {
      const possiblePaths = [
        // 生产环境：app.asar.unpacked 中的路径
        ffmpegPath.replace('app.asar', 'app.asar.unpacked'),
        // 开发环境：原始路径
        ffmpegPath,
        // 如果路径包含 node_modules，也尝试直接使用
        ffmpegPath.replace(/.*node_modules/, join(process.cwd(), 'node_modules'))
      ]

      for (const p of possiblePaths) {
        if (p && existsSync(p)) {
          cachedFfmpegPath = p
          console.log('使用打包的 ffmpeg:', p)
          return p
        }
      }
    }
  } catch (error) {
    console.warn('无法加载打包的 ffmpeg，将使用系统 ffmpeg:', (error as Error).message)
  }

  // 回退到系统 ffmpeg
  cachedFfmpegPath = 'ffmpeg'
  return cachedFfmpegPath
}
