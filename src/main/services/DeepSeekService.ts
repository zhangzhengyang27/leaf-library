/**
 * Leaf · DeepSeek 模型接入（D-017：文本；M3 看图工作流：视觉打标走 OpenAI 兼容端点）
 *
 * 两条硬约束决定了这里的一切形状：
 * 1. **文本链只有文本**。DeepSeek 当前官方 API 无视觉输入，文本能力入口按「素材有没有
 *    文字信号」判定（文档正文 doc_text / 图片 OCR ocr_text / 纯文本素材的文件内容），
 *    而不是按「是不是图片」——一张没有 OCR 文字的截图没有可交给它的东西，就不该出现按钮。
 *    （视觉链例外，见下：图片经缩略图出库，入口按「视觉模型已配置」判定。）
 * 2. **Key 不出主进程**。safeStorage 加密落 userData/deepseek.json（与 ClipServer 的
 *    token 同一口径），IPC 只回「是否已配置 + 末 4 位」，渲染层拿不到明文。
 *
 * 视觉打标（M3）：DeepSeek 官方 API 截至目前仍是纯文本（deepseek-chat/reasoner），
 * 视觉模型 DeepSeek-VL2 是开源权重、由 SiliconFlow 等 OpenAI 兼容平台托管。所以这里做成
 * **OpenAI 兼容通用视觉端点 + DeepSeek 预设**：视觉模型名 + 可选端点覆盖（空 = 用
 * DeepSeek 主端点），官方视觉档上线后用户在设置页改端点/模型名即可，不用改代码。
 * 图片输入只用**库内缩略图**（jpg 重编码封顶 768px / 200KB），原图绝不出库；
 * 入参一律收 photoId 而非文件路径：路径由 DB 反查，渲染层无从指到库外文件。
 */
import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { isTextFile } from '@shared/assetTypes'
import { isSafeRenamePattern } from '@shared/filename'
import { hasAiWorthyText } from '@shared/ocrText'
import { photoRepository } from '../db/repos/PhotoRepository'
import { tagRepository } from '../db/repos/TagRepository'
import { getThumbnailService } from './ThumbnailService'

const ENDPOINT = 'https://api.deepseek.com/chat/completions'
const MODEL = 'deepseek-chat'
/** 单次喂入的正文上限：模型上下文够长，但摘要用不着全灌，也顺带封顶请求体 */
const MAX_BODY_CHARS = 6000
/** 纯文本素材的读取上限（与 readTextFile 的预览上限同量级） */
const MAX_FILE_BYTES = 1_000_000
const REQUEST_TIMEOUT_MS = 30_000

// —— 视觉打标（M3）——
/** 视觉输入的缩略图重编码上限：768px 对识别「画面里有什么」足够，别为省 tokens 更小 */
export const VISION_MAX_EDGE = 768
/** 视觉输入的体积封顶：base64 会膨胀 4/3，200KB 原始字节 ≈ 270KB 请求体，可接受 */
export const VISION_MAX_BYTES = 200 * 1024
/** 视觉输入取库内 1024px 预览图做重编码源（256px 网格图太小，丢字） */
const VISION_SOURCE_SIZE = 1024

export interface ChatUsage {
  prompt: number
  completion: number
}

export type ChatResult =
  { ok: true; text: string; usage: ChatUsage | null } | { ok: false; error: string }

function cfgPath(): string {
  return join(app.getPath('userData'), 'deepseek.json')
}

function readStoredKey(): string | null {
  try {
    const raw = JSON.parse(readFileSync(cfgPath(), 'utf-8')) as { key?: string }
    if (!raw.key) return null
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(Buffer.from(raw.key, 'base64'))
      } catch {
        // 换机/换系统后钥匙环变了：密文解不开就是没有 Key，别把密文当明文用
        return null
      }
    }
    // 无系统加密后端时不落盘明文（见 setKey），因此这里不该有值
    return null
  } catch {
    return null
  }
}

function writeStoredKey(key: string | null): { ok: true } | { ok: false; error: string } {
  const path = cfgPath()
  if (key === null) {
    try {
      if (existsSync(path))
        writeFileSync(path, JSON.stringify({ ...readVisionRaw() }), { mode: 0o600 })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: '本机系统密钥环不可用，无法安全保存 API Key' }
  }
  try {
    const enc = safeStorage.encryptString(key).toString('base64')
    writeFileSync(path, JSON.stringify({ key: enc, ...readVisionRaw() }), { mode: 0o600 })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// —— 视觉打标配置（M3）——
/**
 * deepseek.json 里除了 Key 还挂视觉档配置：
 *   { key: "<safeStorage 密文>", vision: { model, endpoint, enabled } }
 *
 * Key 是凭据，必须 safeStorage 加密；模型名与端点是**配置不是凭据**，
 * 明文存在同一个 0600 文件里即可（safeStorage 不可用的 Linux 上视觉档照样能配，
 * 只有 Key 保存会被挡——与文本链同一条限制）。
 */
export interface VisionConfig {
  /** 视觉模型名（如 deepseek-vl2）；空 = 未配置视觉，相关入口一律不出现 */
  model: string
  /** OpenAI 兼容端点覆盖；空 = 用 DeepSeek 主端点（官方视觉档上线后不用改代码） */
  endpoint: string
  /** 用户开关：关了就算 model 还在也不出入口 */
  enabled: boolean
}

interface StoredCfg {
  key?: string
  vision?: Partial<VisionConfig>
}

function readVisionRaw(): { vision?: Partial<VisionConfig> } {
  try {
    const raw = JSON.parse(readFileSync(cfgPath(), 'utf-8')) as StoredCfg
    return raw.vision ? { vision: raw.vision } : {}
  } catch {
    return {}
  }
}

function readVisionConfig(): VisionConfig {
  const v = readVisionRaw().vision ?? {}
  return {
    model: typeof v.model === 'string' ? v.model : '',
    endpoint: typeof v.endpoint === 'string' ? v.endpoint : '',
    enabled: v.enabled === true
  }
}

/** 视觉链入口判定：模型名 + 开关 + 主 Key 三者齐了才算配置好（缺 Key 视觉请求也发不出去） */
export function isVisionConfigured(): boolean {
  const v = readVisionConfig()
  return v.enabled && !!v.model.trim() && readStoredKey() !== null
}

function writeVisionConfig(cfg: VisionConfig): { ok: true } | { ok: false; error: string } {
  try {
    const raw = JSON.parse(
      existsSync(cfgPath()) ? readFileSync(cfgPath(), 'utf-8') : '{}'
    ) as StoredCfg
    raw.vision = cfg
    writeFileSync(cfgPath(), JSON.stringify(raw), { mode: 0o600 })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** 端点覆盖归一：接受 base（…/v1）或完整 URL，统一补到 /chat/completions */
export function resolveVisionEndpoint(endpointOverride: string): string {
  const base = endpointOverride.trim().replace(/\/+$/, '')
  if (!base) return ENDPOINT
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`
}

/** 设置页写入视觉档；enabled 不打开时不要求模型名已填（半配置是合法中间态）。字段做未知类型收窄 */
export function setVisionConfig(input: {
  model?: unknown
  endpoint?: unknown
  enabled?: unknown
}): { ok: true } | { ok: false; error: string } {
  const model = (typeof input.model === 'string' ? input.model : '').trim().slice(0, 120)
  const endpoint = (typeof input.endpoint === 'string' ? input.endpoint : '').trim().slice(0, 300)
  const enabled = input.enabled === true
  if (endpoint && !/^https?:\/\//i.test(endpoint)) {
    return { ok: false, error: '端点必须是 http(s) URL' }
  }
  if (enabled && !model) {
    return { ok: false, error: '要先填视觉模型名才能开启' }
  }
  return writeVisionConfig({ model, endpoint, enabled })
}

export function isConfigured(): boolean {
  return readStoredKey() !== null
}

/** 设置页展示用：永不回传 Key 本体 */
export function getConfig(): {
  configured: boolean
  model: string
  hint: string
  vision: VisionConfig & { configured: boolean }
} {
  const key = readStoredKey()
  const vision = readVisionConfig()
  return {
    configured: key !== null,
    model: MODEL,
    hint: key ? `…${key.slice(-4)}` : '',
    vision: { ...vision, configured: isVisionConfigured() }
  }
}

export function setApiKey(key: string): { ok: true } | { ok: false; error: string } {
  const trimmed = key.trim()
  if (!trimmed) return { ok: false, error: 'API Key 为空' }
  if (!/^sk-[A-Za-z0-9_-]{8,}$/.test(trimmed)) {
    return { ok: false, error: '看起来不是 DeepSeek 的 API Key（应为 sk- 开头）' }
  }
  return writeStoredKey(trimmed)
}

export function clearApiKey(): { ok: true } | { ok: false; error: string } {
  return writeStoredKey(null)
}

/**
 * OpenAI 兼容 chat.completions 的公共请求路径：文本链与视觉链唯一的差别是
 * 端点、模型名和 content 形状（视觉的 content 是 text/image_url 数组），
 * 超时、错误面、usage 提取完全同口径（M3）。label 只用于错误文案定源。
 */
async function postChat(
  endpoint: string,
  model: string,
  messages: Array<{ role: string; content: unknown }>,
  label: string
): Promise<ChatResult> {
  const key = readStoredKey()
  if (!key) return { ok: false, error: '未配置 DeepSeek API Key' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 600 })
    })
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 160)
      return { ok: false, error: `${label}返回 ${res.status}${detail ? `：${detail}` : ''}` }
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const text = data.choices?.[0]?.message?.content
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: '响应里没有内容' }
    // usage 是计费口径的唯一来源（DeepSeek 在响应里回 token 数），
    // 批量任务的「这次花了多少」全靠它，缺了也不能让整次调用算失败
    const usage: ChatUsage | null =
      typeof data.usage?.prompt_tokens === 'number'
        ? { prompt: data.usage.prompt_tokens, completion: data.usage.completion_tokens ?? 0 }
        : null
    return { ok: true, text, usage }
  } catch (err) {
    const e = err as Error
    return { ok: false, error: e.name === 'AbortError' ? '请求超时（30s）' : e.message }
  } finally {
    clearTimeout(timer)
  }
}

async function chat(messages: Array<{ role: string; content: string }>): Promise<ChatResult> {
  return postChat(ENDPOINT, MODEL, messages, 'DeepSeek')
}

/** 连通性自检（设置页「测试连接」） */
export async function testConnection(): Promise<ChatResult> {
  return chat([{ role: 'user', content: '只回复两个字：正常' }])
}

/** 素材元信息行：文本链与视觉链共用的上下文前缀（文件名/尺寸/时间/已有标签） */
function metaLineOf(p: {
  fileName: string
  width?: number
  height?: number
  takenAt?: number
  tags: string[]
}): string {
  const ext = p.fileName.slice(p.fileName.lastIndexOf('.') + 1).toLowerCase()
  return [
    `文件名：${p.fileName}`,
    ext ? `扩展名：${ext}` : '',
    p.width && p.height ? `尺寸：${p.width}×${p.height}` : '',
    p.takenAt ? `时间：${new Date(p.takenAt).toISOString().slice(0, 10)}` : '',
    p.tags.length ? `已有标签：${p.tags.join('、')}` : ''
  ]
    .filter(Boolean)
    .join(' / ')
}

/** 素材可交给模型的文字信号；没有则 null（能力入口据此缺席，而不是硬凑） */
function textSignalOf(photoId: string): string | null {
  const p = photoRepository.getPhotoById(photoId)
  if (!p) return null
  // 注：未知 id 与「有素材但没文字」都落到 null，调用方按 id 存在性分开报错
  const meta = metaLineOf(p)

  let body = (p.docText ?? '').trim() || (p.ocrText ?? '').trim()
  if (!body && (p.kind === 'text' || isTextFile(p.fileName))) {
    try {
      body = readFileSync(p.filePath, 'utf-8').slice(0, MAX_FILE_BYTES)
    } catch {
      body = ''
    }
  }
  body = body.slice(0, MAX_BODY_CHARS).trim()
  if (!hasAiWorthyText(body)) return null
  return `${meta}\n\n—— 正文 ——\n${body}`
}

export interface SuggestMeta {
  ok: boolean
  error?: string
  description?: string
  tags?: string[]
  tokens?: ChatUsage | null
}

/** 依据素材已有文字生成摘要与标签建议（不落库，由用户确认后写入） */
export async function suggestMeta(photoId: string): Promise<SuggestMeta> {
  if (!photoRepository.getPhotoById(photoId)) {
    return { ok: false, error: '素材不存在（可能已被移除）' }
  }
  const signal = textSignalOf(photoId)
  if (!signal) {
    return {
      ok: false,
      error: '该素材文字不足（无正文/OCR，或去空白后不足 12 字），不生成摘要'
    }
  }
  const result = await chat([
    {
      role: 'system',
      content:
        '你在为本地素材库生成条目信息。只依据用户给到的文字作答，不要臆测文字里没有的画面内容。' +
        '输出严格 JSON：{"description":"不超过两句的中文摘要","tags":["3-6个中文短标签"]}，不要任何解释或代码块。'
    },
    { role: 'user', content: signal }
  ])
  if (!result.ok) return { ok: false, error: result.error }
  const parsed = parseSuggest(result.text)
  if (!parsed) {
    return { ok: false, error: `模型返回的不是约定结构：${result.text.slice(0, 80)}` }
  }
  return { ok: true, ...parsed, tokens: result.usage }
}

// —— 视觉打标（M3 看图工作流）——

/**
 * 把一张库内缩略图压成视觉输入：≤768px、≤200KB 的 jpeg。
 *
 * 只收缩略图路径（1024px 预览图），绝不碰原图——视觉请求只需要
 * 「画面里有什么」级别的分辨率，原图出库既慢又越权。质量从 80 起步
 * 逐档降到位（768px 的 jpeg 在 q40 之前几乎总能进 200KB）。
 */
export async function toVisionJpeg(sourcePath: string): Promise<Buffer> {
  const encode = (quality: number): Promise<Buffer> =>
    sharp(sourcePath)
      .rotate()
      .resize(VISION_MAX_EDGE, VISION_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer()
  let buf = await encode(80)
  let quality = 80
  while (buf.length > VISION_MAX_BYTES && quality > 40) {
    quality -= 14
    buf = await encode(quality)
  }
  return buf
}

/**
 * 按 photoId 取视觉输入：库内 1024px 缩略图缓存，未命中现场生成（与 thumb:// 同语义）。
 * 返回 data URL——**路径只在这里、只在主进程出现**，渲染层/MCP 客户端只传 id。
 */
async function visionImageOf(photoId: string): Promise<string> {
  const p = photoRepository.getPhotoById(photoId)
  if (!p) throw new Error('素材不存在（可能已被移除）')
  const thumbs = getThumbnailService()
  const cached = thumbs.getCachedPath(photoId, VISION_SOURCE_SIZE)
  const source = cached ?? (await thumbs.generate(photoId, p.filePath, VISION_SOURCE_SIZE))
  const jpeg = await toVisionJpeg(source)
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

/** 视觉打标建议：模型看图说话，输出结构与文本链同款 JSON（不落库，由用户确认后写入） */
export async function suggestVisionMeta(photoId: string): Promise<SuggestMeta> {
  const p = photoRepository.getPhotoById(photoId)
  if (!p) return { ok: false, error: '素材不存在（可能已被移除）' }
  // 门禁按 kindOfExt 算好的 kind 判位图（IMAGE/RASTER 两组扩展口径）。
  // 与 D-017 的文本门禁同一条教训：没配置/不是位图就不出能力，不诱导瞎猜。
  if (p.kind !== 'image') return { ok: false, error: '该素材不是位图，无法看图打标' }
  if (!isVisionConfigured())
    return { ok: false, error: '未配置视觉模型（设置 › AI 助手 › 视觉打标）' }
  const v = readVisionConfig()
  let imageUrl: string
  try {
    imageUrl = await visionImageOf(photoId)
  } catch (err) {
    return { ok: false, error: `取缩略图失败：${(err as Error).message}` }
  }
  const result = await postChat(
    resolveVisionEndpoint(v.endpoint),
    v.model,
    [
      {
        role: 'system',
        content:
          '你在为本地素材库生成条目信息。仔细观察用户给到的图片，只描述画面中实际可见的内容，' +
          '不要臆测图片之外的背景故事。输出严格 JSON：' +
          '{"description":"不超过两句的中文摘要","tags":["3-6个中文短标签"]}，不要任何解释或代码块。'
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: `${metaLineOf(p)}\n请看图生成摘要与标签。` },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }
    ],
    '视觉端点'
  )
  if (!result.ok) return { ok: false, error: result.error }
  const parsed = parseSuggest(result.text)
  if (!parsed) {
    return { ok: false, error: `模型返回的不是约定结构：${result.text.slice(0, 80)}` }
  }
  return { ok: true, ...parsed, tokens: result.usage }
}

/**
 * 经典 1×1 透明 PNG：视觉档「测试连接」的探针图。
 * 单测里用 sharp 元数据验证过它确实是 1×1 PNG（断言见 DeepSeekService.vision.test.ts）。
 */
export const VISION_PROBE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

/** 视觉档连通性自检（设置页「测试连接」）：发一张 1×1 png，能回文本即通 */
export async function testVisionConnection(): Promise<ChatResult> {
  if (!isVisionConfigured()) {
    return { ok: false, error: '未配置视觉模型（设置 › AI 助手 › 视觉打标）' }
  }
  const v = readVisionConfig()
  return postChat(
    resolveVisionEndpoint(v.endpoint),
    v.model,
    [
      {
        role: 'user',
        content: [
          { type: 'text', text: '只回复两个字：正常' },
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${VISION_PROBE_PNG_BASE64}` }
          }
        ]
      }
    ],
    '视觉端点'
  )
}

// —— 标签体系整理建议 ——

export interface TagSuggestion {
  kind: 'merge' | 'parent' | 'rename'
  /** 被改动的标签名（merge/rename 的源、parent 的子） */
  from: string
  /** 保留名 / 新名 / 父标签名 */
  to: string
  reason: string
}

export type TagSuggestionResult =
  { ok: true; suggestions: TagSuggestion[] } | { ok: false; error: string }

const SUGGESTION_LIMIT = 10

/**
 * 让模型看标签字典（名称 + 使用张数）给出合并/分组/改名的整理建议。
 *
 * 只依据标签名本身判断——模型看不到图片，任何「这张图其实是猫」的推断都是编的。
 * 返回的是建议，不自动落库：合并与改名会动到全局字典，必须人审。
 */
export async function suggestTagStructure(): Promise<TagSuggestionResult> {
  const rows = tagRepository.all()
  if (rows.length < 3) return { ok: false, error: '标签太少（少于 3 个），没有可整理的体系' }
  const byName = new Map(rows.map((r) => [r.name.toLowerCase(), r]))
  const lines = rows
    .slice(0, 200)
    .map((r) => `${r.name}（${r.usage_count} 张${r.parent_id ? '，已属某分组' : ''}）`)

  const result = await chat([
    {
      role: 'system',
      content:
        '你在整理素材库的标签体系，只依据标签名本身判断，不要臆测图片内容。' +
        '输出严格 JSON：{"merges":[{"from":"被合并标签","to":"保留的标签名"}],' +
        '"parents":[{"child":"子标签","parent":"分组标签"}],' +
        '"renames":[{"from":"现名","to":"建议名"}]}，' +
        '三类合计不超过 10 条，每条附 reason（不超过 20 字）。没有值得整理的就返回空数组。'
    },
    { role: 'user', content: `标签清单：\n${lines.join('\n')}` }
  ])
  if (!result.ok) return result

  const obj = parseJsonLoose(result.text) as {
    merges?: unknown
    parents?: unknown
    renames?: unknown
  } | null
  if (!obj) return { ok: false, error: `返回的不是约定结构：${result.text.slice(0, 80)}` }

  const suggestions: TagSuggestion[] = []
  const nameOf = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null
  const reasonOf = (v: unknown): string => (typeof v === 'string' ? v.trim().slice(0, 40) : '')
  const add = (kind: TagSuggestion['kind'], from: string, to: string, reason: string): void => {
    if (suggestions.length >= SUGGESTION_LIMIT) return
    suggestions.push({ kind, from, to, reason })
  }

  for (const m of asList(obj.merges)) {
    // 合并要求两端都是已有标签：目标名不存在时 mergeTags 会把源改名，语义就成了改名，
    // 那是 rename 一类该干的事，混在这里会让「合并」按钮做出改名效果
    const a = byName.get(nameOf(m.from)?.toLowerCase() ?? '')
    const b = byName.get(nameOf(m.to)?.toLowerCase() ?? '')
    if (a && b && a.id !== b.id) add('merge', a.name, b.name, reasonOf(m.reason))
  }
  for (const m of asList(obj.parents)) {
    const child = byName.get(nameOf(m.child)?.toLowerCase() ?? '')
    const parent = byName.get(nameOf(m.parent)?.toLowerCase() ?? '')
    if (child && parent && child.id !== parent.id && child.parent_id !== parent.id)
      add('parent', child.name, parent.name, reasonOf(m.reason))
  }
  for (const m of asList(obj.renames)) {
    const a = byName.get(nameOf(m.from)?.toLowerCase() ?? '')
    const to = nameOf(m.to)
    // 改名目标必须是「还没有这个名字」——撞名等于合并，不该走改名通道
    if (a && to && !byName.get(to.toLowerCase()) && to !== a.name)
      add('rename', a.name, to, reasonOf(m.reason))
  }
  return { ok: true, suggestions }
}

function asList(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []
}

/** 剥 ```json 围栏后取第一个对象 */
function parseJsonLoose(raw: string): unknown {
  const stripped = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(stripped.slice(start, end + 1))
  } catch {
    return null
  }
}

// —— 批量摘要 / 批量打标 ——

export interface BatchMetaProgress {
  done: number
  total: number
  phase: 'running' | 'idle'
}

export interface BatchMetaResult {
  done: number
  skipped: number
  failed: number
  /** 本次实际消耗的 token（按 API 回的 usage 累加；未回则 0） */
  tokens: ChatUsage
  /** 计划处理条数（入参截断到 BATCH_LIMIT 之后） */
  requested: number
}

/** 在飞标记：IPC 可重复触发，重入会让两条进度流互相覆盖计数（文本/视觉两路共用一把锁） */
let batchRunning = false
/** 单次批量上限：每条都是一次付费调用，宁可让人分批发也不要手滑跑穿库 */
const BATCH_LIMIT = 200

const ZERO_RESULT = (): BatchMetaResult => ({
  done: 0,
  skipped: 0,
  failed: 0,
  tokens: { prompt: 0, completion: 0 },
  requested: 0
})

/**
 * 批量主循环（文本链/视觉链共用）：串行单并发，每条一次请求；
 * 「预期缺席」（无文字信号 / 非位图）计 skipped 而不是 failed；
 * token 按 API 回的 usage 累加——这是批量任务唯一能就地看见成本的地方。
 */
async function runBatchLoop(
  targets: string[],
  notify: ((p: BatchMetaProgress) => void) | undefined,
  runItem: (id: string) => Promise<SuggestMeta>,
  isExpectedSkip: (error: string) => boolean
): Promise<BatchMetaResult> {
  let done = 0
  let skipped = 0
  let failed = 0
  const tokens: ChatUsage = { prompt: 0, completion: 0 }
  notify?.({ done: 0, total: targets.length, phase: 'running' })
  for (const id of targets) {
    const r = await runItem(id)
    tokens.prompt += r.tokens?.prompt ?? 0
    tokens.completion += r.tokens?.completion ?? 0
    if (!r.ok) {
      if (isExpectedSkip(r.error ?? '')) skipped += 1
      else failed += 1
    } else {
      const p = photoRepository.getPhotoById(id)
      // 描述只在为空时写入——用户自己写的备注不能被模型覆盖；
      // 标签走 addTagToPhotos（同名复用 + INSERT OR IGNORE），重复跑不会长重复行
      if (r.description && !(p?.description ?? '').trim()) {
        photoRepository.setDescription(id, r.description)
      }
      for (const t of r.tags ?? []) photoRepository.addTagToPhotos([id], t)
      done += 1
    }
    notify?.({ done: done + skipped + failed, total: targets.length, phase: 'running' })
  }
  return { done, skipped, failed, tokens, requested: targets.length }
}

/**
 * 对一批素材逐个跑摘要与标签（串行，单并发）。
 * 「没有文字信号」是预期缺席，计入 skipped 而不是 failed。
 */
export async function batchMeta(
  photoIds: string[],
  notify?: (p: BatchMetaProgress) => void
): Promise<BatchMetaResult> {
  if (batchRunning) return ZERO_RESULT()
  const targets = photoIds.filter((id) => typeof id === 'string' && id).slice(0, BATCH_LIMIT)
  batchRunning = true
  try {
    return await runBatchLoop(targets, notify, suggestMeta, (e) => /文字不足/.test(e))
  } finally {
    batchRunning = false
    notify?.({ done: targets.length, total: targets.length, phase: 'idle' })
  }
}

/**
 * 对一批位图素材逐个看图打标（M3；串行单并发，每条带一次缩略图请求）。
 *
 * 未配置视觉模型时直接抛错：渲染层的入口门禁挡住了正常路径，
 * 真走到这里就该让人在 toast 里看见原因，而不是悄悄 failed 一堆。
 * 「不是位图」是预期缺席，计入 skipped 而不是 failed。
 */
export async function batchVisionMeta(
  photoIds: string[],
  notify?: (p: BatchMetaProgress) => void
): Promise<BatchMetaResult> {
  if (batchRunning) return ZERO_RESULT()
  if (!isVisionConfigured()) {
    throw new Error('未配置视觉模型（设置 › AI 助手 › 视觉打标）')
  }
  const targets = photoIds.filter((id) => typeof id === 'string' && id).slice(0, BATCH_LIMIT)
  batchRunning = true
  try {
    return await runBatchLoop(targets, notify, suggestVisionMeta, (e) => /不是位图/.test(e))
  } finally {
    batchRunning = false
    notify?.({ done: targets.length, total: targets.length, phase: 'idle' })
  }
}

/** 自然语言 → 批量重命名模板（模型只许吐已知 token，过 isSafeRenamePattern 闸） */
export async function suggestRenamePattern(
  instruction: string,
  samples: string[]
): Promise<{ ok: true; pattern: string } | { ok: false; error: string }> {
  const ask = instruction.trim()
  if (!ask) return { ok: false, error: '还没有描述命名规则' }
  const list = samples
    .filter((s) => typeof s === 'string' && s.trim())
    .slice(0, 8)
    .map((s) => s.slice(0, 120))
  const result = await chat([
    {
      role: 'system',
      content:
        '你在为素材库的批量重命名生成模板。可用变量只有：{name} 原文件名（不含扩展名）、' +
        '{n} 序号、{date} 导入日期 YYYYMMDD、{time} 导入时间 HHmmss、{parent} 所在文件夹名、{rand} 随机串、' +
        '{add date} 添加日期 YYYY-MM-DD、{today} 今天 YYYY-MM-DD、{create date} 创建日期 YYYY_MM_DD、' +
        '{modified date} 修改日期 YYYY_MM_DD、{taken date} 拍摄日期 YYYY_MM_DD、{size} 文件大小（如 1.5MB）、' +
        '{rating} 评分 0-5、{duration} 时长（如 3m05s）、{width} 像素宽、{height} 像素高、{id} 素材 id、' +
        '{tags} 标签（- 连接）、{library} 库名。' +
        '扩展名自动保留，不要写 {ext} 或任何后缀。变量之外是字面文本，不得含 / \\ : * ? " < > |。' +
        '示例文件名只是给你看现状的，不要把其中的名字写进模板——要引用原名就用 {name}。' +
        '输出严格 JSON：{"pattern":"…"}，不要解释。'
    },
    {
      role: 'user',
      content: `规则要求：${ask.slice(0, 500)}\n\n示例原文件名：\n${list.join('\n')}`
    }
  ])
  if (!result.ok) return result
  const parsed = parseRenamePattern(result.text)
  if (!parsed) return { ok: false, error: `没有解析出模板：${result.text.slice(0, 80)}` }
  if (!isSafeRenamePattern(parsed)) {
    return { ok: false, error: `模型给出的模板含不支持的写法：${parsed.slice(0, 60)}` }
  }
  return { ok: true, pattern: parsed }
}

/** 容错解析：剥 ```json 围栏后取 pattern 字段 */
function parseRenamePattern(raw: string): string | null {
  const stripped = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(stripped.slice(start, end + 1)) as { pattern?: unknown }
    return typeof obj.pattern === 'string' && obj.pattern.trim() ? obj.pattern.trim() : null
  } catch {
    return null
  }
}

/** 容错解析：剥掉可能的 ```json 围栏，再取第一个对象 */
function parseSuggest(raw: string): { description: string; tags: string[] } | null {
  const stripped = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let obj: unknown
  try {
    obj = JSON.parse(stripped.slice(start, end + 1))
  } catch {
    return null
  }
  const o = obj as { description?: unknown; tags?: unknown }
  const description = typeof o.description === 'string' ? o.description.trim() : ''
  const tags = Array.isArray(o.tags)
    ? o.tags
        .filter((t): t is string => typeof t === 'string' && !!t.trim())
        .map((t) => t.trim().slice(0, 20))
        .slice(0, 6)
    : []
  if (!description && tags.length === 0) return null
  return { description, tags }
}
