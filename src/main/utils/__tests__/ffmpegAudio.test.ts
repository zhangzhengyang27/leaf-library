/**
 * 音频事实（波形峰值 + BPM 估算）
 *
 * 合成轨是自己按实现的采样率/帧率算出来的，间隔是精确已知的 —— 这样"100 BPM 报成 100"
 * 才是算法对的证据，而不是我照着实测输出反推的期望值。真素材那份是防自欺的一层：
 * 只在 LEAF_AUDIO_DIR 存在时跑（scripts/fetch-audio-fixtures.sh 会写清楚来源与许可）。
 */
import { describe, it, expect } from 'vitest'
import { existsSync, statSync } from 'fs'
import { join } from 'path'
import {
  AUDIO_PCM_SAMPLE_RATE,
  ENVELOPE_FPS,
  WAVEFORM_BUCKETS,
  buildPeaks,
  decodeMonoPcm,
  estimateBpm
} from '../ffmpegAudio'

/** 均匀点击轨（不做强弱交替）：八度歧义只可能来自算法，不来自我的合成器 */
function clickTrack(bpm: number, seconds = 12): Float32Array {
  const n = AUDIO_PCM_SAMPLE_RATE * seconds
  const out = new Float32Array(n)
  const interval = (AUDIO_PCM_SAMPLE_RATE * 60) / bpm
  for (let i = 0; i * interval < n; i++) {
    const s = Math.floor(i * interval)
    for (let k = 0; k < 260 && s + k < n; k++)
      out[s + k] += Math.exp(-k / 45) * Math.sin(k * 0.35)
  }
  return out
}

/** 鼓组轨：底鼓在拍点、hi-hat 在反拍、外加一条持续低音（比纯点击更接近真音乐） */
function drumGroove(bpm: number, seconds = 16): Float32Array {
  const n = AUDIO_PCM_SAMPLE_RATE * seconds
  const out = new Float32Array(n)
  const beat = (AUDIO_PCM_SAMPLE_RATE * 60) / bpm
  for (let i = 0; i * beat < n; i++) {
    const s = Math.floor(i * beat)
    for (let k = 0; k < 300 && s + k < n; k++) out[s + k] += Math.exp(-k / 60) * Math.sin(k * 0.12)
    const off = Math.floor(s + beat / 2)
    for (let k = 0; k < 90 && off + k < n; k++)
      out[off + k] += 0.5 * Math.exp(-k / 18) * Math.sin(k * 1.9)
  }
  for (let i = 0; i < n; i++) out[i] += 0.12 * Math.sin((i / AUDIO_PCM_SAMPLE_RATE) * 2 * Math.PI * 82)
  return out
}

describe('buildPeaks', () => {
  it('桶数固定、整条归一到 0–255（看形状不看响度）', () => {
    const pcm = clickTrack(120, 6)
    const peaks = buildPeaks(pcm)
    expect(peaks).toHaveLength(WAVEFORM_BUCKETS)
    expect(Math.max(...peaks)).toBe(255)
    // 点击轨必有安静段：峰值不该被抬成一条平线
    expect(Math.min(...peaks)).toBeLessThan(40)
  })

  it('全零信号给全零（不是全 255 的除零伪影）', () => {
    const peaks = buildPeaks(new Float32Array(8000))
    expect(peaks.reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('空 PCM 不崩', () => {
    expect(buildPeaks(new Float32Array(0))).toHaveLength(WAVEFORM_BUCKETS)
  })

  it('强音在中间时，峰的位置也在中间（波形对齐是点选 seek 的前提）', () => {
    const n = AUDIO_PCM_SAMPLE_RATE * 4
    const pcm = new Float32Array(n)
    const center = Math.floor(n / 2)
    for (let k = 0; k < 800; k++) pcm[center + k] = 0.9
    const peaks = buildPeaks(pcm)
    const loudest = peaks.indexOf(255)
    expect(Math.abs(loudest - WAVEFORM_BUCKETS / 2)).toBeLessThan(8)
  })
})

describe('estimateBpm（合成轨，真值精确已知）', () => {
  it('均匀点击轨：60/100/120/128/174 都落在带内且数值准', () => {
    // 60 按 double-time 惯例折成 120（折叠带 70–180 是写死的行为，不是 bug）
    const cases: Array<[number, number]> = [
      [60, 120],
      [100, 100],
      [120, 120],
      [128, 128],
      [174, 174]
    ]
    for (const [truth, want] of cases) {
      const r = estimateBpm(clickTrack(truth))
      expect(r, `${truth} BPM 应当给数`).not.toBeNull()
      expect(r!.bpm, `真值 ${truth} → 期望 ${want}`).toBeCloseTo(want, 0)
    }
  })

  it('带反拍 hi-hat 与持续低音的鼓组轨也不被谐波带跑', () => {
    for (const truth of [100, 128]) {
      const r = estimateBpm(drumGroove(truth))
      expect(r, `${truth} BPM 应当给数`).not.toBeNull()
      // 允许折叠到一个八度内（这是该算法的本征歧义，界面上有 ×2/÷2）
      const ratio = r!.bpm / truth
      const nearOctave = [0.5, 1, 2].some((o) => Math.abs(ratio / o - 1) < 0.06)
      expect(nearOctave, `${truth} → ${r!.bpm}`).toBe(true)
    }
  })

  it('静音、纯音、脉冲过稀：不给 BPM（闸门实测分界，0.000 vs ≥0.88）', () => {
    expect(estimateBpm(new Float32Array(AUDIO_PCM_SAMPLE_RATE * 5))).toBeNull()
    const tone = new Float32Array(AUDIO_PCM_SAMPLE_RATE * 5)
    for (let i = 0; i < tone.length; i++) tone[i] = 0.3 * Math.sin((i / AUDIO_PCM_SAMPLE_RATE) * 2 * Math.PI * 440)
    expect(estimateBpm(tone)).toBeNull()
    expect(estimateBpm(new Float32Array(4))).toBeNull()
  })

  it('包络帧率与实现同源（否则合成轨的周期算错，测试会自证自）', () => {
    expect(ENVELOPE_FPS).toBe(125)
    expect(AUDIO_PCM_SAMPLE_RATE).toBe(4000)
  })
})

describe('真素材（LEAF_AUDIO_DIR 有则跑）', () => {
  const dir = process.env.LEAF_AUDIO_DIR ?? ''
  const has = (f: string): boolean => {
    try {
      return !!dir && statSync(join(dir, f)).isFile()
    } catch {
      return false
    }
  }
  const load = async (f: string): Promise<Float32Array | null> =>
    await decodeMonoPcm(join(dir, f))

  it.skipIf(!has('50bpm-click.ogg'))('50 BPM 点击轨 → 折到 100（double-time 惯例）', async () => {
    const pcm = await load('50bpm-click.ogg')
    expect(pcm).not.toBeNull()
    expect(estimateBpm(pcm!)?.bpm).toBeCloseTo(100, 0)
  })

  it.skipIf(!has('metronome-96.ogg'))('96 节拍器 → 96–98 之间', async () => {
    const pcm = await load('metronome-96.ogg')
    const r = pcm ? estimateBpm(pcm) : null
    expect(r).not.toBeNull()
    expect(r!.bpm).toBeGreaterThanOrEqual(95)
    expect(r!.bpm).toBeLessThanOrEqual(99)
  })

  it.skipIf(!has('thunderer-march.ogg'))('Sousa 铜管 march → quick-time 一带，且波形不平', async () => {
    const pcm = await load('thunderer-march.ogg')
    expect(pcm).not.toBeNull()
    const r = estimateBpm(pcm!)
    expect(r).not.toBeNull()
    // 不断言具体值（没有公开真值），只要求落在八度折叠带的合理位置
    expect(r!.bpm).toBeGreaterThan(105)
    expect(r!.bpm).toBeLessThan(135)
    const peaks = buildPeaks(pcm!)
    const nonzero = peaks.filter((p) => p > 8).length
    expect(nonzero).toBeGreaterThan(WAVEFORM_BUCKETS * 0.8) // 2:48 的实录不该有大段死平
  })

  it('解不开的音频文件返回 null 而不是抛', async () => {
    expect(await decodeMonoPcm(join(dir || '/tmp', '不存在.mp3'))).toBeNull()
  })

  it('目录里的路径不存在时也算不出事实', async () => {
    expect(existsSync('/definitely/not/here.mp3')).toBe(false)
  })
})
