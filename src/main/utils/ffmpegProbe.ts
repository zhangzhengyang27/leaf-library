/**
 * ffmpeg 元信息探测（不解码）
 *
 * `ffmpeg -i <file>` 在没有输出文件时以非零码退出，但 stderr 里就是完整元信息
 * （Duration / 每条 Stream）。项目里没有随包 ffprobe，所以用这一条命令同时取
 * 时长与帧率——探一次起一个进程，不能再探第二次。
 */
import { execFile } from 'child_process'
import { promisify } from 'util'
import { getFfmpegPath } from './ffmpeg'

const execFileAsync = promisify(execFile)

export interface MediaProbe {
  durationMs: number | null
  fps: number | null
}

/** 探测媒体时长与帧率；ffmpeg 缺失/文件不可读时两项都为 null（不抛） */
export async function probeMedia(filePath: string): Promise<MediaProbe> {
  try {
    await execFileAsync(getFfmpegPath(), ['-i', filePath], { timeout: 20000 })
  } catch (err) {
    const stderr = String((err as { stderr?: string }).stderr ?? '')
    return { durationMs: parseDurationMs(stderr), fps: parseFps(stderr) }
  }
  // 正常退出反而说明没拿到诊断输出
  return { durationMs: null, fps: null }
}

/** `Duration: 00:00:05.00` → 毫秒（第四组是百分之一秒） */
export function parseDurationMs(stderr: string): number | null {
  const m = /Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/.exec(stderr)
  if (!m) return null
  return Number(m[1]) * 3600000 + Number(m[2]) * 60000 + Number(m[3]) * 1000 + Number(m[4]) * 10
}

/**
 * 帧率只认 Video 那条流：一个文件可以同时有音频流与数据流，
 * 整串 stderr 上直接找 `fps` 会挑错流（音频行里的 `44100 Hz` 之类也不该参与）。
 * ffmpeg 打的是四舍五入到两位小数的十进制（29.97 而非 30000/1001），
 * 逐帧步进的误差在毫秒级，够用。
 */
export function parseFps(stderr: string): number | null {
  const line = stderr.split('\n').find((l) => /Stream #\d+:\d+.*: Video:/.test(l))
  const m = line ? /(\d+(?:\.\d+)?)\s*fps/.exec(line) : undefined
  if (!m) return null
  const v = Number(m[1])
  return Number.isFinite(v) && v > 0 && v < 1000 ? v : null
}
