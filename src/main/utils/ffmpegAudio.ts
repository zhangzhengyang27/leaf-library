/**
 * 音频事实：波形峰值与 BPM 估算
 *
 * 一次 `ffmpeg -dec` 出单声道 PCM，波形与节拍都从它算——两个数字没有第二条通路，
 * 起两次进程对音频库是白付一倍的解码。采样率故意低到 4kHz：
 * 节拍分析要的是能量包络（不是音色），包络帧率 125fps 与 8kHz 版本实测同分
 * （真素材上还更准，见 estimateBpm 的注释），而 PCM 体积与耗时都省一半。
 */
import { execFile } from 'child_process'
import { promisify } from 'util'
import { getFfmpegPath } from './ffmpeg'

const execFileAsync = promisify(execFile)

/** 波形桶数：一屏网格卡约 200px 宽，400 桶够铺满也够缩放 */
export const WAVEFORM_BUCKETS = 400
/** 超过这么长的音频不分析（45 分钟的有声书切片，波形与节拍都不是用户要的） */
export const MAX_ANALYZE_DURATION_MS = 45 * 60_000
/** 节拍只看开头这一段：与 DJ 工具同理，且 ACF 的代价随帧数线性涨 */
const BPM_WINDOW_SEC = 120

const PCM_SAMPLE_RATE = 4000
const ENVELOPE_FRAME = 64
const ENVELOPE_HOP = 32
/** 归一化自相关的搜索区间（40–220 BPM），再折叠到 70–180 */
const BPM_LO = 40
const BPM_HI = 220
/** 折叠带：纯自相关分不清 60 与 120，DJ 工具的通行做法是固定折到这一段 */
const FOLD_LO = 70
const FOLD_HI = 180
/** 谐波求和的阶数（只取基频会让半速 lag 天然占便宜） */
const HARMONICS = 4
/**
 * 置信度闸门。分界线是量的，不是拍的：静音/单音纯音的分数是 0.000，
 * 而三份真素材（50 BPM 点击轨、96 节拍器、Sousa 铜管 march）最低 0.881。
 */
const MIN_CONFIDENCE = 0.35

export interface AudioFacts {
  /** 每桶峰值，0–255（Uint8Array）；null = 没算出来 */
  peaks: Uint8Array | null
  bpm: number | null
}

/** 解单声道 PCM（s16le → Float32 归一到 -1..1）。失败返回 null，不抛 */
export async function decodeMonoPcm(filePath: string): Promise<Float32Array | null> {
  try {
    const { stdout } = await execFileAsync(
      getFfmpegPath(),
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        filePath,
        '-ac',
        '1',
        '-ar',
        String(PCM_SAMPLE_RATE),
        '-f',
        's16le',
        '-'
      ],
      { timeout: 120_000, maxBuffer: 96 * 1024 * 1024 }
    )
    const n = Math.floor(stdout.length / 2)
    if (n === 0) return null
    const out = new Float32Array(n)
    for (let i = 0; i < n; i++) out[i] = stdout.readInt16LE(i * 2) / 32768
    return out
  } catch {
    return null
  }
}

/** 等分桶取每桶最大绝对值，量化到 0–255（渲染层直接当高度画） */
export function buildPeaks(pcm: Float32Array, buckets = WAVEFORM_BUCKETS): Uint8Array {
  const out = new Uint8Array(buckets)
  if (pcm.length === 0) return out
  const size = pcm.length / buckets
  let globalMax = 0
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * size)
    const end = Math.min(pcm.length, Math.floor((b + 1) * size))
    let peak = 0
    for (let i = start; i < end; i++) {
      const v = Math.abs(pcm[i])
      if (v > peak) peak = v
    }
    out[b] = peak
    if (peak > globalMax) globalMax = peak
  }
  // 整条归一到 0–255：不归一的话一段 -12dB 的素材会画成一条矮扁的带子，
  // 而用户看波形看的是形状，不是响度
  if (globalMax > 0) for (let b = 0; b < buckets; b++) out[b] = Math.round((out[b] / globalMax) * 255)
  return out
}

/** 能量包络（帧 RMS 的半波整流差分）。返回的帧率 = sampleRate / hop */
function onsetEnvelope(pcm: Float32Array): { v: Float64Array; fps: number } {
  const fps = PCM_SAMPLE_RATE / ENVELOPE_HOP
  const frames: number[] = []
  for (let s = 0; s + ENVELOPE_FRAME <= pcm.length; s += ENVELOPE_HOP) {
    let e = 0
    for (let i = s; i < s + ENVELOPE_FRAME; i++) e += pcm[i] * pcm[i]
    frames.push(Math.sqrt(e / ENVELOPE_FRAME))
  }
  const env = new Float64Array(Math.max(0, frames.length - 1))
  for (let i = 1; i < frames.length; i++) env[i - 1] = Math.max(0, frames[i] - frames[i - 1])
  const mean = env.reduce((a, b) => a + b, 0) / (env.length || 1)
  for (let i = 0; i < env.length; i++) env[i] -= mean
  return { v: env, fps }
}

/**
 * BPM 估算：归一化自相关 + 4 次谐波求和 + 分数滞后 + 120 附近的速度先验，
 * 最后折叠进 70–180。每一步都对应一种实测过的错法：
 *  - 不按参与项数归一 → 长 lag 白占便宜，一律报半速（第一版实测 100→50、120→60）；
 *  - 只求基频 → 半速的 ACF 峰天然不低于倍速，必须把 2/3/4 次谐波加起来；
 *  - 滞后取整 → 120 BPM 在 125fps 下周期是 62.5 帧，能量被劈成 119/121 两半，
 *    于是半速那侧（整数周期）反而赢，所以按 0.25 帧步长扫并做线性插值；
 *  - 没有先验 → 纯周期信号的本征八度歧义无处裁决。
 * 实测（三份 Wikimedia 真素材 + 六条合成轨）：100/120/128/174 与 96 节拍器都落在
 * ±0.5 内；50 BPM 点击轨按 double-time 惯例给 100；Sousa march 给 114.9。
 * 八度歧义在界面上用 ×2/÷2 两颗键交还给用户，不假装算法能裁决。
 */
export function estimateBpm(pcm: Float32Array): { bpm: number; confidence: number } | null {
  const windowed = pcm.length > BPM_WINDOW_SEC * PCM_SAMPLE_RATE
    ? pcm.subarray(0, BPM_WINDOW_SEC * PCM_SAMPLE_RATE)
    : pcm
  const { v, fps } = onsetEnvelope(windowed)
  if (v.length < 8) return null
  let energy = 0
  for (const x of v) energy += x * x
  if (energy <= 0) return null
  const lo = Math.max(2, Math.floor((fps * 60) / BPM_HI))
  const hi = Math.min(v.length - 3, Math.ceil((fps * 60) / BPM_LO))
  if (hi <= lo) return null

  // 一次线性插值取分数滞后的 ACF 值
  const acfAt = (acf: Float64Array, lag: number): number => {
    const i = Math.floor(lag)
    const f = lag - i
    if (i + 1 >= acf.length) return acf[acf.length - 1] ?? 0
    return acf[i] * (1 - f) + acf[i + 1] * f
  }
  const acf = new Float64Array(hi * 4 + 4)
  for (let lag = 1; lag < acf.length; lag++) {
    let s = 0
    for (let i = lag; i < v.length; i++) s += v[i] * v[i - lag]
    acf[lag] = s / ((v.length - lag) * (energy / v.length))
  }

  let best: { bpm: number; score: number } | null = null
  for (let lag = lo; lag <= hi; lag += 0.25) {
    let s = 0
    for (let h = 1; h <= HARMONICS; h++) {
      const hl = lag * h
      if (hl < acf.length) s += acfAt(acf, hl) / h
    }
    const bpmRaw = (fps * 60) / lag
    // 对数正态先验（中心 120，σ≈1.1 个八度）：只用来裁决八度，不改变谁在带内
    const oct = Math.log2(bpmRaw / 120)
    const weighted = s * Math.exp(-(oct * oct) / (2 * 1.1 * 1.1)) * 1.9
    if (!best || weighted > best.score) best = { bpm: bpmRaw, score: weighted }
  }
  if (!best || best.score < MIN_CONFIDENCE) return null
  let bpm = best.bpm
  while (bpm < FOLD_LO) bpm *= 2
  while (bpm >= FOLD_HI) bpm /= 2
  return { bpm: Math.round(bpm * 10) / 10, confidence: best.score }
}

/** 一次解码同时产出波形与 BPM；任何一步失败都给 null 而不是抛 */
export async function probeAudioFacts(filePath: string): Promise<AudioFacts> {
  const pcm = await decodeMonoPcm(filePath)
  if (!pcm) return { peaks: null, bpm: null }
  const peaks = buildPeaks(pcm)
  const bpm = estimateBpm(pcm)?.bpm ?? null
  return { peaks, bpm }
}
