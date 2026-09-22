/**
 * Leaf · DocTextService（文档正文抽取，D 轴「可检索」）
 *
 * 形状照 OcrService：pref 开关 + 串行队列 + 每条之间让出事件循环（导入/缩略图永远优先）
 * + 结果写库（NULL=未抽取，''=抽过但无正文/不可恢复失败，避免反复重试）。
 *
 * 与 OCR 的分工：OCR 认的是「图里长出来的字」，这里认的是「文件里本来就有的字」。
 * 两条链路各占一列（ocr_text / doc_text），都进同一个 photo_fts，
 * 因此搜索作用域里也是两个独立开关。
 *
 * 覆盖面：OFFICE_DOC 组走 officeparser（docx/xlsx/pptx/odt/ods/odp/rtf/epub/pdf），
 * TEXT 组直读 utf8。明确不支持 legacy .doc/.xls/.ppt（officeparser 无 OLE2 解析）。
 */
import { readFile, stat } from 'fs/promises'
import { prefRepository } from '../db/repos/PrefRepository'
import type { PrefRepository } from '../db/repos/PrefRepository'
import { photoRepository, type PhotoRepository } from '../db/repos/PhotoRepository'

/** DocTextService 用到的那一小片仓库面（便于单测注入真库） */
type DocTextRepo = Pick<PhotoRepository, 'getPhotoById' | 'updateDocText' | 'listDocTextPending'>
import {
  CODE_EXTENSIONS,
  extensionOf,
  isIndexableCodeFile,
  isTextFile,
  OFFICE_DOC_EXTENSIONS
} from '@shared/assetTypes'

const PREF_KEY = 'doctext:enabled'
const IDLE_YIELD_MS = 0
/** 单文件上限：更大的多是扫描图集/内嵌媒体，正文收益低、解析时间长 */
const MAX_SOURCE_BYTES = 64 * 1024 * 1024
/**
 * 代码类另给一个小上限：文档几百页也就那么点字，而代码一旦是打包产物，
 * 20K 截断取到的整片是压缩过的噪声（用户库里 >64KB 的代码文件基本都是这类）。
 * 实测：卡 64KB + 排除声明/min/bundle，可索引的从 3,547 条降到 2,171 条，
 * 正文从 13.2MB 降到 8.4MB（trigram 索引约 2.5 倍 ≈21MB）。
 */
const MAX_CODE_SOURCE_BYTES = 64 * 1024
/**
 * 正文落库上限（字符）。两处约束逼出来的小值：
 * - `PHOTO_SELECT` 是 `SELECT *`，`docText` 会随每次列表查询整批判式发到渲染层
 *   （500/页 × 200k 字符实测光物化就要 ~460ms，文档库直接卡死）
 * - trigram 索引体积随正文长度线性放大
 * 20k 字符已覆盖绝大多数文档的"可搜索主体"，超出部分截断。
 */
const MAX_TEXT_CHARS = 20_000

/**
 * 视为「瞬时故障、下次该重试」的错误码：留 NULL 不认账。
 * 与 OcrService P2-26 同一判据——把网络盘未挂载/TCC 拒绝写成本文档"没有正文"
 * 会让它永远从「待抽取」清单里消失，且没有任何 UI 路径能救回来。
 */
const TRANSIENT_CODES = new Set([
  'ENOENT',
  'EACCES',
  'EPERM',
  'ENOTCONN',
  'EBUSY',
  'EIO',
  'ETIMEDOUT',
  'ENODEV'
])

export class DocTextService {
  private queue: string[] = []
  private draining = false

  constructor(
    private readonly prefs: Pick<PrefRepository, 'get' | 'set'> = prefRepository,
    /** 仓库可注入：队列语义（门禁 / 瞬时留 NULL / 确定落 ''）只有拿真库才测得动 */
    private readonly photos: DocTextRepo = photoRepository
  ) {}

  isEnabled(): boolean {
    return this.prefs.get(PREF_KEY) === '1'
  }

  setEnabled(on: boolean): void {
    this.prefs.set(PREF_KEY, on ? '1' : '0')
    if (!on) this.queue = []
  }

  status(): { enabled: boolean; pending: number } {
    return { enabled: this.isEnabled(), pending: this.queue.length }
  }

  /** 处理管线完成后调用（未开启时忽略） */
  enqueue(photoId: string): void {
    if (!this.isEnabled() || this.queue.includes(photoId)) return
    this.queue.push(photoId)
    void this.drain()
  }

  /** 手动批量抽取：把当前所有待抽取项入队，返回入队数 */
  runPending(limit = 200): number {
    if (!this.isEnabled()) return 0
    const items = this.photos.listDocTextPending(limit)
    for (const it of items) this.enqueue(it.id)
    return items.length
  }

  private async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      while (this.queue.length > 0) {
        const id = this.queue.shift()
        if (id === undefined) break
        // 单条失败不能把整条队列撂下：extract 内部已兜大部分，
        // 这里挡掉 getPhotoById / updateDocText 自身抛错（否则 draining 复位后
        // 剩余 id 一直躺到下次无关的 enqueue 才被带动）
        try {
          await this.extract(id)
        } catch (err) {
          console.warn('[DocText] drain item failed:', id, err)
        }
        // 让出事件循环：缩略图/导入永远优先
        await new Promise((res) => setTimeout(res, IDLE_YIELD_MS))
      }
    } finally {
      this.draining = false
    }
  }

  private async extract(photoId: string): Promise<void> {
    const photo = this.photos.getPhotoById(photoId)
    if (!photo) return
    try {
      const { size } = await stat(photo.filePath)
      if (size > MAX_SOURCE_BYTES) {
        // 落 ''（认账）而不是留 NULL：否则每轮批量回填都重新撞同一个大文件
        console.warn(`[DocText] 跳过超大文件 (${size}B): ${photo.filePath}`)
        this.photos.updateDocText(photoId, '')
        return
      }
      // 代码类的两道窄闸：待抽取清单只能按扩展名粗筛（SQL 里没有名字模式），
      // 所以声明文件/min 产物会先被捞进来，在这里判掉并落 ''。
      // 反过来（SQL 窄、这里宽）会让这些行永远留在待抽取清单里空转。
      if (CODE_EXTENSIONS.includes(extensionOf(photo.fileName))) {
        if (!isIndexableCodeFile(photo.fileName) || size > MAX_CODE_SOURCE_BYTES) {
          this.photos.updateDocText(photoId, '')
          return
        }
      }
      const text = await extractTextOf(photo.filePath)
      this.photos.updateDocText(photoId, text.slice(0, MAX_TEXT_CHARS).trim())
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      if (TRANSIENT_CODES.has(code)) {
        // 读不到文件 ≠ 文档没正文：留 NULL，挂载回来/授权给了自然重试
        console.warn(`[DocText] 瞬时失败，保留待重试 (${code}):`, photoId)
        return
      }
      console.warn('[DocText] extract failed:', photoId, err)
      this.photos.updateDocText(photoId, '')
    }
  }
}

/**
 * 按扩展名取正文：纯文本直读，officeparser 组懒加载（首次用到才进解析器代码）。
 * 单独导出，不依赖 electron/pref，便于单测与「按文件夹重建索引」复用。
 */
/** 网页类要剥标签：否则 <script>/<style> 的源码会被当正文索引，搜 function/color 命中一堆网页 */
const MARKUP_EXTENSIONS = ['html', 'htm']

export async function extractTextOf(filePath: string): Promise<string> {
  const ext = extensionOf(filePath)
  // 纯文本直读：TEXT 组 + 代码组（isTextFile 是这两者的单源，别在这儿再抄一份列表）
  if (isTextFile(filePath)) {
    const raw = await readFile(filePath, 'utf8')
    if (!MARKUP_EXTENSIONS.includes(ext)) return normalize(raw)
    const { default: sanitizeHtml } = await import('sanitize-html')
    // allowedTags: [] 走的是真 HTML 解析器（tree-parser），正则删标签会漏掉
    // 未闭合标签与属性里的尖括号；非标签文本拼成纯文本
    const text = sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} })
    return normalize(decodeBasicEntities(text))
  }
  if (!OFFICE_DOC_EXTENSIONS.includes(ext)) return ''
  const { parseOffice } = await import('officeparser')
  const ast = await parseOffice(filePath)
  // v8 的生成器返回 { value, messages }（不是裸字符串）；兼容 string 形态以防版本回摆
  const out = (await ast.to('text')) as unknown
  const value = typeof out === 'string' ? out : ((out as { value?: unknown })?.value ?? '')
  return normalize(String(value))
}

/** sanitize-html 不把文本节点里的实体解回来，留 &amp; 会让"搜 & 搜不到" */
function decodeBasicEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

// eslint-disable-next-line no-control-regex -- 这里要清的就是控制字符本身
const CTRL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g

/** 清掉 NUL 与零散控制字符（保留 \t\n\r）：它们会被 FTS trigram 切成噪声 token */
function normalize(raw: string): string {
  return raw.replace(CTRL_RE, '')
}

export const docTextService = new DocTextService()
