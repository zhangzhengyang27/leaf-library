/**
 * 同目录字幕轨（P1）：命名匹配、SRT→VTT 归一、各类上限。
 *
 * 用真临时目录而不是 mock fs：这条链的失效方式基本都是「目录里有什么文件」
 * 决定的（大小写、多点文件名、空文件、超尺寸），mock 出来只会锁死我的假设。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { findSubtitleTracks, normalizeToVtt } from '../SubtitleService'

let dir: string
const SRT = `1
00:00:01,000 --> 00:00:04,000
- 你好，世界

2
00:00:05,500 --> 00:00:08,200
<i>斜体一行</i>
`

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'leaf-subtitles-'))
  // 视频本体（内容无所谓，服务只看同目录）
  writeFileSync(join(dir, '旅行.mp4'), 'not-a-real-video')
  writeFileSync(join(dir, '旅行.srt'), SRT)
  writeFileSync(join(dir, '旅行.zh-CN.srt'), SRT)
  writeFileSync(join(dir, '旅行.en.vtt'), `WEBVTT\n\n00:00.000 --> 00:02.000\nhi\n`)
  // 不相干的邻居：不同前缀、后缀太多、非字幕扩展名、空文件
  writeFileSync(join(dir, '别的.srt'), SRT)
  writeFileSync(join(dir, '旅行.删减片段.花絮.srt'), SRT)
  writeFileSync(join(dir, '旅行.jpg'), 'x')
  writeFileSync(join(dir, '旅行.empty.srt'), '')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('normalizeToVtt', () => {
  it('补 WEBVTT 头并把逗号毫秒换成点', () => {
    const out = normalizeToVtt(SRT)
    expect(out.startsWith('WEBVTT\n\n')).toBe(true)
    expect(out).toContain('00:00:01.000 --> 00:00:04.000')
    expect(out).not.toContain('00:00:01,000')
    expect(out).toContain('你好，世界') // 正文里的中文逗号不能被动
    expect(out).toContain('<i>斜体一行</i>') // VTT 自己认 <i>，不该转义
  })

  it('已经是 VTT 的不重复加头，且吃 BOM 与 CRLF', () => {
    const vtt = '﻿WEBVTT\r\n\r\n00:00.000 --> 00:02.000\r\nhi\r\n'
    const out = normalizeToVtt(vtt)
    expect(out.startsWith('WEBVTT\n')).toBe(true)
    expect(out.match(/WEBVTT/g)).toHaveLength(1)
    expect(out).not.toContain('\r')
  })

  it('内嵌时间戳带小时的也能换点', () => {
    expect(normalizeToVtt('1\n01:02:03,040 --> 01:02:05,060\nx\n')).toContain(
      '01:02:03.040 --> 01:02:05.060'
    )
  })
})

describe('findSubtitleTracks', () => {
  it('按同名兄弟找，标签取后缀、语言只在像 BCP-47 时给', () => {
    const tracks = findSubtitleTracks(join(dir, '旅行.mp4'))
    const labels = tracks.map((t) => t.label)
    expect(labels).toEqual(expect.arrayContaining(['zh-CN', 'en', '旅行']))
    expect(labels).not.toContain('别的')
    expect(labels).not.toContain('删减片段') // 三段后缀 = 不相干文件
    expect(labels).not.toContain('empty') // 空文件不挂
    const byLabel = Object.fromEntries(tracks.map((t) => [t.label, t]))
    expect(byLabel['zh-CN'].srclang).toBe('zh-cn')
    expect(byLabel['en'].srclang).toBe('en')
    expect(byLabel['旅行'].srclang).toBeUndefined()
  })

  it('.srt 与 .vtt 都归一成 VTT 正文', () => {
    const tracks = findSubtitleTracks(join(dir, '旅行.mp4'))
    for (const t of tracks) expect(t.vtt.startsWith('WEBVTT')).toBe(true)
    const vtt = tracks.find((t) => t.label === 'en')
    expect(vtt?.vtt).toContain('00:00.000 --> 00:02.000')
  })

  it('只有一条时才默认打开（多条留给用户自己挑）', () => {
    const single = mkdtempSync(join(tmpdir(), 'leaf-sub-one-'))
    writeFileSync(join(single, 'a.mp4'), 'x')
    writeFileSync(join(single, 'a.srt'), SRT)
    expect(findSubtitleTracks(join(single, 'a.mp4')).map((t) => t.isDefault)).toEqual([true])
    expect(findSubtitleTracks(join(dir, '旅行.mp4')).some((t) => t.isDefault)).toBe(false)
    rmSync(single, { recursive: true, force: true })
  })

  it('视频不存在、目录读不动、传空串都返回空数组而不是抛', () => {
    expect(findSubtitleTracks(join(dir, '没这个文件.mp4'))).toEqual([])
    expect(findSubtitleTracks('')).toEqual([])
    const nested = join(dir, '子目录')
    mkdirSync(nested, { recursive: true })
    expect(findSubtitleTracks(nested)).toEqual([])
  })

  it('超过上限的轨被截住（IPC 要把整段文本搬过去）', () => {
    const many = mkdtempSync(join(tmpdir(), 'leaf-sub-many-'))
    writeFileSync(join(many, 'b.mp4'), 'x')
    for (let i = 0; i < 12; i++) writeFileSync(join(many, `b.l${i}.srt`), SRT)
    expect(findSubtitleTracks(join(many, 'b.mp4'))).toHaveLength(8)
    rmSync(many, { recursive: true, force: true })
  })
})
