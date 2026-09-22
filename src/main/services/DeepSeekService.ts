/**
 * Leaf · DeepSeek 文本模型接入（D-017：AI 能力从本地 CLIP 转向云端文本模型）
 *
 * 两条硬约束决定了这里的一切形状：
 * 1. **只有文本**。DeepSeek 当前 API 无视觉输入，所以能力入口按「素材有没有文字信号」
 *    判定（文档正文 doc_text / 图片 OCR ocr_text / 纯文本素材的文件内容），
 *    而不是按「是不是图片」——一张没有 OCR 文字的截图没有可交给它的东西，就不该出现按钮。
 * 2. **Key 不出主进程**。safeStorage 加密落 userData/deepseek.json（与 ClipServer 的
 *    token 同一口径），IPC 只回「是否已配置 + 末 4 位」，渲染层拿不到明文。
 *
 * 入参一律收 photoId 而非文件路径：路径由 DB 反查，渲染层无从指到库外文件。
 */
import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { isTextFile } from '@shared/assetTypes'
import { isSafeRenamePattern } from '@shared/filename'
import { hasAiWorthyText } from '@shared/ocrText'
import { photoRepository } from '../db/repos/PhotoRepository'
import { tagRepository } from '../db/repos/TagRepository'

const ENDPOINT = 'https://api.deepseek.com/chat/completions'
const MODEL = 'deepseek-chat'
/** 单次喂入的正文上限：模型上下文够长，但摘要用不着全灌，也顺带封顶请求体 */
const MAX_BODY_CHARS = 6000
/** 纯文本素材的读取上限（与 readTextFile 的预览上限同量级） */
const MAX_FILE_BYTES = 1_000_000
const REQUEST_TIMEOUT_MS = 30_000

export interface ChatUsage {
  prompt: number
  completion: number
}

export type ChatResult =
  | { ok: true; text: string; usage: ChatUsage | null }
  | { ok: false; error: string }

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
      if (existsSync(path)) writeFileSync(path, JSON.stringify({}), { mode: 0o600 })
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
    writeFileSync(path, JSON.stringify({ key: enc }), { mode: 0o600 })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export function isConfigured(): boolean {
  return readStoredKey() !== null
}

/** 设置页展示用：永不回传 Key 本体 */
export function getConfig(): { configured: boolean; model: string; hint: string } {
  const key = readStoredKey()
  return {
    configured: key !== null,
    model: MODEL,
    hint: key ? `…${key.slice(-4)}` : ''
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

async function chat(messages: Array<{ role: string; content: string }>): Promise<ChatResult> {
  const key = readStoredKey()
  if (!key) return { ok: false, error: '未配置 DeepSeek API Key' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.3, max_tokens: 600 })
    })
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 160)
      return { ok: false, error: `DeepSeek 返回 ${res.status}${detail ? `：${detail}` : ''}` }
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

/** 连通性自检（设置页「测试连接」） */
export async function testConnection(): Promise<ChatResult> {
  return chat([{ role: 'user', content: '只回复两个字：正常' }])
}

/** 素材可交给模型的文字信号；没有则 null（能力入口据此缺席，而不是硬凑） */
function textSignalOf(photoId: string): string | null {
  const p = photoRepository.getPhotoById(photoId)
  if (!p) return null
  // 注：未知 id 与「有素材但没文字」都落到 null，调用方按 id 存在性分开报错
  const ext = p.fileName.slice(p.fileName.lastIndexOf('.') + 1).toLowerCase()
  const meta = [
    `文件名：${p.fileName}`,
    ext ? `扩展名：${ext}` : '',
    p.width && p.height ? `尺寸：${p.width}×${p.height}` : '',
    p.takenAt ? `时间：${new Date(p.takenAt).toISOString().slice(0, 10)}` : '',
    p.tags.length ? `已有标签：${p.tags.join('、')}` : ''
  ].filter(Boolean)

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
  return `${meta.join(' / ')}\n\n—— 正文 ——\n${body}`
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
  | { ok: true; suggestions: TagSuggestion[] }
  | { ok: false; error: string }

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

/** 在飞标记：IPC 可重复触发，重入会让两条进度流互相覆盖计数 */
let batchRunning = false
/** 单次批量上限：每条都是一次付费调用，宁可让人分批发也不要手滑跑穿库 */
const BATCH_LIMIT = 200

/**
 * 对一批素材逐个跑摘要与标签（串行，单并发）。
 *
 * 描述只在为空时写入——用户自己写的备注不能被模型覆盖；标签走 addTagToPhotos
 * （同名复用 + INSERT OR IGNORE），重复跑不会长重复行。
 * 「没有文字信号」是预期缺席，计入 skipped 而不是 failed。
 */
export async function batchMeta(
  photoIds: string[],
  notify?: (p: BatchMetaProgress) => void
): Promise<BatchMetaResult> {
  if (batchRunning) {
    return { done: 0, skipped: 0, failed: 0, tokens: { prompt: 0, completion: 0 }, requested: 0 }
  }
  const targets = photoIds.filter((id) => typeof id === 'string' && id).slice(0, BATCH_LIMIT)
  batchRunning = true
  let done = 0
  let skipped = 0
  let failed = 0
  const tokens: ChatUsage = { prompt: 0, completion: 0 }
  try {
    notify?.({ done: 0, total: targets.length, phase: 'running' })
    for (const id of targets) {
      const r = await suggestMeta(id)
      tokens.prompt += r.tokens?.prompt ?? 0
      tokens.completion += r.tokens?.completion ?? 0
      if (!r.ok) {
        if (/文字不足/.test(r.error ?? '')) skipped += 1
        else failed += 1
      } else {
        const p = photoRepository.getPhotoById(id)
        if (r.description && !(p?.description ?? '').trim()) {
          photoRepository.setDescription(id, r.description)
        }
        for (const t of r.tags ?? []) photoRepository.addTagToPhotos([id], t)
        done += 1
      }
      notify?.({ done: done + skipped + failed, total: targets.length, phase: 'running' })
    }
    return { done, skipped, failed, tokens, requested: targets.length }
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
        '{n} 序号、{date} 导入日期 YYYYMMDD、{time} 导入时间 HHmmss、{parent} 所在文件夹名、{rand} 随机串。' +
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
