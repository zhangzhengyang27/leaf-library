/**
 * 022：ffmpeg stderr 解析（时长 + 实测帧率）。
 *
 * 样本是**本机 @ffmpeg-installer 那个 4.4 真跑出来的输出**（`ffmpeg -i` 后 grep
 * Stream/Duration 两行），不是照记忆编的格式——编的话这条测试只会锁死我的猜测。
 * 生成命令见 e2e/video-fps.spec.mjs（同一份 ffmpeg 合成 24fps / 29.97fps 素材）。
 */
import { describe, it, expect } from 'vitest'
import { parseDurationMs, parseFps } from '../ffmpegProbe'

const STDERR_24 = `
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'small.mp4':
  Metadata:
    major_brand     : isom
  Duration: 00:00:01.00, start: 0.000000, bitrate: 46 kb/s
    Stream #0:0(und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 160x120 [SAR 1:1 DAR 4:3], 38 kb/s, 24 fps, 24 tbr, 12288 tbn, 24 tbc (default)
`

/** NTSC 抽帧率：ffmpeg 打成 29.97（真值 30000/1001），后面还跟着 29.97 tbr / 59.94 tbc */
const STDERR_2997 = `
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'ntsc.mp4':
  Duration: 00:00:01.00, start: 0.000000, bitrate: 55 kb/s
    Stream #0:0(und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 160x120 [SAR 1:1 DAR 4:3], 47 kb/s, 29.97 fps, 29.97 tbr, 30k tbn, 59.94 tbc (default)
`

const STDERR_AUDIO_ONLY = `
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'audio.m4a':
  Duration: 00:00:01.00, start: 0.000000, bitrate: 79 kb/s
    Stream #0:0(und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 71 kb/s (default)
`

/** 音频流在前、视频流在后（手机视频常见）：不能拿第一条流的行去算帧率 */
const STDERR_AUDIO_FIRST = `
  Duration: 00:00:07.24, start: 0.000000, bitrate: 1200 kb/s
    Stream #0:0(und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 125 kb/s (default)
    Stream #0:1(und): Video: hevc (HEVC / 0x43564548), yuv420p(tv, bt709), 1920x1080, 1050 kb/s, 60 fps, 60 tbr, 90k tbn, 90k tbc (default)
`

describe('parseFps', () => {
  it('整数与小数帧率都取到（24 / 29.97）', () => {
    expect(parseFps(STDERR_24)).toBe(24)
    expect(parseFps(STDERR_2997)).toBe(29.97)
  })

  it('纯音频文件没有帧率，不是 0 也不是 NaN', () => {
    expect(parseFps(STDERR_AUDIO_ONLY)).toBeNull()
  })

  it('音频流在前时也认 Video 那条流（60fps）', () => {
    expect(parseFps(STDERR_AUDIO_FIRST)).toBe(60)
  })

  it('退回基线用：只看第一条 Stream 行的实现会在音频优先样本上给出 null', () => {
    // 这条断言存在的意义：证明 parseFps 不是"随便抓个 fps 字样"
    const firstStreamLine = STDERR_AUDIO_FIRST.split('\n').find((l) => l.includes('Stream #'))
    expect(firstStreamLine ? /(\d+(?:\.\d+)?)\s*fps/.exec(firstStreamLine) : null).toBeNull()
    expect(parseFps(STDERR_AUDIO_FIRST)).toBe(60)
  })

  it('没有 fps 字段的视频行、乱码、越界值都返回 null', () => {
    expect(
      parseFps(`    Stream #0:0(und): Video: rawvideo, gray, 320x240, q=2-31, 90 kb/s`)
    ).toBeNull()
    expect(parseFps('')).toBeNull()
    expect(parseFps('Stream #0:0(und): Video: h264, 0 fps')).toBeNull()
    expect(parseFps('Stream #0:0(und): Video: h264, 99999 fps')).toBeNull()
  })
})

describe('parseDurationMs', () => {
  it('取到毫秒（00:00:01.00 = 1000，含百分之一秒那一组）', () => {
    expect(parseDurationMs(STDERR_24)).toBe(1000)
    expect(parseDurationMs('Duration: 00:01:02.03,')).toBe(62030)
    expect(parseDurationMs(STDERR_AUDIO_FIRST)).toBe(7240)
  })

  it('没有 Duration 行返回 null', () => {
    expect(parseDurationMs('Input #0, mov')).toBeNull()
  })
})
