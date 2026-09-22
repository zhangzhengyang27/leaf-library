/**
 * Leaf · 同目录字幕轨（P1：Eagle 的「SRT/VTT 字幕自动挂同目录轨」）
 *
 * 约定与 Eagle 一致：字幕不入库、不进数据库，就是放在视频旁边的同名兄弟文件
 * （`旅行.mp4` 配 `旅行.zh.srt` / `旅行.srt` / `旅行.vtt`）。用户丢一堆素材进库里
 * 时不用做任何事，挂不挂得上看同目录有没有对得上的文件。
 *
 * 两条硬规矩：
 *  1. 只接受**主进程查出来的 file_path**（IPC 侧传 photoId，不传路径）——
 *     渲染层能传路径就等于把整个文件系统开放给 readdir（本模块栽过三次的那条 P0）；
 *  2. 只回文本，不回 URL：渲染层拿 blob: 喂 `<track>`。走自定义协议要为字幕
 *     开一条放行同目录任意文件的通路，那个口子比收益大得多。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { basename, dirname, extname } from 'path'

export interface SubtitleTrack {
  /** 显示名（语言后缀或文件名） */
  label: string
  /** BCP-47 语言标签；认不出来就不给（<track srclang> 允许缺省） */
  srclang?: string
  /** 归一化后的 WebVTT 正文 */
  vtt: string
  /** 只有一条字幕时默认打开（多条时让用户自己在 CC 菜单里挑） */
  isDefault: boolean
}

/**
 * 单次最多挂几条、单条最大多大。
 * 字幕是文本，512KB 已经是几万个 cue；超限的多半是误命名的整本书，
 * 而且这些字节要整段走一次 IPC 给渲染层，不能按"反正本地很快"来算。
 */
const MAX_TRACKS = 8
const MAX_BYTES = 512 * 1024
const SUBTITLE_EXTS = ['.srt', '.vtt']

/** `旅行.zh-CN.srt` → { stem: '旅行', suffixes: ['zh','CN'] } */
function parseSibling(fileName: string, stem: string): string[] | null {
  const ext = extname(fileName).toLowerCase()
  if (!SUBTITLE_EXTS.includes(ext)) return null
  const base = basename(fileName, extname(fileName))
  if (base === stem) return []
  if (!base.startsWith(`${stem}.`)) return null
  const rest = base
    .slice(stem.length + 1)
    .split('.')
    .filter(Boolean)
  // 只允许「语言/描述性后缀」这一段：再往下还有点的多半是 `电影.删减片段.srt`
  // 这种不相干文件，宁可少挂也别在播放器里塞一堆噪声菜单项
  return rest.length > 0 && rest.length <= 2 ? rest : null
}

/** 后缀里哪一段能当语言标签：2-3 字母，或 `zh-CN` 这类主-子结构 */
function pickLangTag(suffixes: string[]): string | undefined {
  for (const s of suffixes) {
    if (/^[a-zA-Z]{2,3}$/.test(s)) return s.toLowerCase()
    if (/^[a-zA-Z]{2,3}-[a-zA-Z0-9]{2,8}$/.test(s)) return s.toLowerCase()
  }
  return undefined
}

/**
 * SRT → WebVTT。
 *
 * SRT 与 VTT 的差别其实只有两处：时间戳用逗号分隔毫秒、SRT 没有 `WEBVTT` 头。
 * 序号行在 VTT 里是合法的 cue id，原样留着（丢掉会让某些播放器把相邻 cue 黏一起）。
 * VTT 输入只做「补头 + 逗号时间戳也认」，不做别的改写——字幕文本里的
 * `<i>`/`<b>` 两种格式通用，转义反而会显示成字面标签。
 */
export function normalizeToVtt(text: string): string {
  const body = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const withDots = body.replace(
    /(\d{1,2}:)?\d{2}:\d{2}[,]\d{3}\s*-->\s*(\d{1,2}:)?\d{2}:\d{2}[,]\d{3}/g,
    (m) => m.replace(/,/g, '.')
  )
  return withDots.startsWith('WEBVTT') ? withDots : `WEBVTT\n\n${withDots}`
}

/**
 * 依次在几个候选路径的同目录找字幕，第一批命中即用。
 *
 * 为什么要两个候选：copy 模式入库后视频在库内、字幕还在用户原来那个目录，
 * 只按库内路径找等于对半数素材失效。source_path（F11 记的原始路径）就是干这个的。
 * 两边都有同名兄弟时以库内为准（用户可能把字幕也一起搬进了库）。
 */
export function findSubtitleTracksAny(paths: Array<string | undefined>): SubtitleTrack[] {
  const seen = new Set<string>()
  for (const p of paths) {
    if (!p || seen.has(p)) continue
    seen.add(p)
    const found = findSubtitleTracks(p)
    if (found.length > 0) return found
  }
  return []
}

/** 给定视频路径，返回可挂载的字幕轨（找不到返回空数组，不抛） */
export function findSubtitleTracks(videoPath: string): SubtitleTrack[] {
  if (!videoPath || !existsSync(videoPath)) return []
  const dir = dirname(videoPath)
  const stem = basename(videoPath, extname(videoPath))
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const found: SubtitleTrack[] = []
  for (const name of names.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))) {
    const suffixes = parseSibling(name, stem)
    if (!suffixes) continue
    const full = `${dir}/${name}`
    try {
      const st = statSync(full)
      if (!st.isFile() || st.size === 0 || st.size > MAX_BYTES) continue
      const ext = extname(name).toLowerCase()
      const raw = readFileSync(full, 'utf-8')
      found.push({
        label: suffixes.length ? suffixes.join('-') : basename(name, ext),
        srclang: pickLangTag(suffixes),
        vtt: ext === '.srt' ? normalizeToVtt(raw) : normalizeToVtt(raw),
        isDefault: false
      })
      if (found.length >= MAX_TRACKS) break
    } catch {
      continue // 读不动的文件（权限/竞态删除）跳过，不连带整条链失败
    }
  }
  if (found.length === 1) found[0].isDefault = true
  return found
}
