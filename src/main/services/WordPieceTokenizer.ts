/**
 * Leaf · WordPieceTokenizer（G1 文本塔分词）
 *
 * Chinese-CLIP 的文本侧是 BertTokenizer（tokenizer_config.json 实测：do_lower_case=true、
 * strip_accents=null→跟随 lowercase、tokenize_chinese_chars=true），所以只需要
 * basic 切分 + WordPiece 贪心最长匹配，不需要 byte-BPE。
 *
 * 刻意不依赖 electron：tokenizer.json 由调用方读好传进来，单测直接喂字符串就能跑。
 * 分词错不会报错，只会静默把中文切成 [UNK] 然后检索出一堆看似合理的垃圾——
 * 所以这里每一步都按 HF 的实现口径写死，并在单测里逐条钉住。
 */

/** HF BasicTokenizer 的 CJK 判定范围（含假名/谚文与 CJK 兼容区，中文标点也一并加空格） */
function isCJKCodePoint(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK 统一表意文字
    (cp >= 0x3400 && cp <= 0x4dbf) || // 扩展 A
    (cp >= 0xf900 && cp <= 0xfaff) || // 兼容表意文字
    (cp >= 0x3040 && cp <= 0x30ff) || // 平假名/片假名
    (cp >= 0xac00 && cp <= 0xd7af) || // 谚文
    (cp >= 0x3000 && cp <= 0x303f) || // CJK 标点
    (cp >= 0xff00 && cp <= 0xffef) // 半角/全角形式
  )
}

const PUNCT = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"

function isWhitespace(cp: number): boolean {
  return cp === 0x20 || cp === 0x09 || cp === 0x0a || cp === 0x0d || /\s/.test(String.fromCodePoint(cp))
}

function isControl(cp: number): boolean {
  if (cp === 0 || cp === 0xfffd) return true
  // 0x21 起算：\t\n\r 与空格一类已由 isWhitespace 接走，这里只剩真正的控制码
  if (cp < 0x21) return true
  if (cp === 0x7f || (cp > 0x9f && cp < 0xa1)) return true
  return false
}

export interface TokenizerJson {
  model?: {
    vocab?: Record<string, number>
    unk_token?: string
  }
}

export class WordPieceTokenizer {
  private readonly vocab: Record<string, number>
  readonly unkToken: string
  readonly unkId: number

  constructor(tokenizerJson: TokenizerJson) {
    const vocab = tokenizerJson.model?.vocab
    if (!vocab) throw new Error('tokenizer.json 缺少 model.vocab')
    this.vocab = vocab
    this.unkToken = tokenizerJson.model?.unk_token ?? '[UNK]'
    const id = (t: string): number => {
      const v = vocab[t]
      if (v === undefined) throw new Error(`tokenizer.json 词表缺少特殊标记 ${t}`)
      return v
    }
    this.unkId = id(this.unkToken)
    // 只校验存在、不存值：encode 走的是标记名 → vocab 的映射
    id('[CLS]')
    id('[SEP]')
  }

  get size(): number {
    return Object.keys(this.vocab).length
  }

  /** BasicTokenizer：清洗 → 小写去音符 → CJK/标点两侧加空格 → 按空白切 */
  basic(text: string): string[] {
    const cleaned: string[] = []
    for (const ch of text) {
      const cp = ch.codePointAt(0) as number
      // 空白必须先判：HF BasicTokenizer 把 \t\n\r 与 Zs（含 NBSP）转成空格，
      // 而控制字符才是"丢弃"。顺序反了会把 "cat\tposter" 粘成一个词，
      // token 序列静默改变——从网页/PDF 粘贴进来的查询就是这么废掉的
      if (isWhitespace(cp)) {
        cleaned.push(' ')
        continue
      }
      if (isControl(cp)) continue
      if (isCJKCodePoint(cp) || PUNCT.includes(ch)) {
        cleaned.push(' ', ch, ' ')
      } else {
        cleaned.push(ch)
      }
    }
    const s = cleaned
      .join('')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
    return s.split(' ').filter(Boolean)
  }

  /** WordPiece：词内贪心最长匹配，非首片段带 `##`；任一片段匹配不上整词判 UNK */
  wordpiece(word: string): string[] {
    // 按码点切：UTF-16 码元会把非 BMP 字符（𠮷、扩展 B 表意文字）从中间劈开，
    // 两侧都不在词表 → 整词 UNK，连带丢掉同词内本可命中的拉丁片段
    const chars = [...word]
    if (chars.length > 100) return [this.unkToken]
    const pieces: string[] = []
    let start = 0
    while (start < chars.length) {
      let best: string | null = null
      let bestLen = 0
      for (let len = chars.length - start; len > 0; len--) {
        const sub = chars.slice(start, start + len).join('')
        const cand = start === 0 ? sub : `##${sub}`
        if (cand in this.vocab) {
          best = cand
          bestLen = len
          break
        }
      }
      if (best === null) return [this.unkToken]
      pieces.push(best)
      start += bestLen
    }
    return pieces
  }

  /** 文本 → 片段（含特殊标记），给单测和"为什么没搜到"排查用 */
  tokenize(text: string, maxTokens = 77): string[] {
    const pieces: string[] = []
    for (const w of this.basic(text)) {
      for (const p of this.wordpiece(w)) {
        pieces.push(p)
        if (pieces.length >= maxTokens - 2) break
      }
      if (pieces.length >= maxTokens - 2) break
    }
    return ['[CLS]', ...pieces, '[SEP]']
  }

  /** 文本 → token id 序列（[CLS] … [SEP]），长度不超过 maxTokens */
  encode(text: string, maxTokens = 77): number[] {
    return this.tokenize(text, maxTokens).map((t) => this.vocab[t] ?? this.unkId)
  }

  /** 片段里有多少真 UNK——分词退化成 [UNK] 袋子时这个值会飙到 1 */
  unkRatio(tokens: string[]): number {
    const body = tokens.filter((t) => t !== '[CLS]' && t !== '[SEP]')
    if (body.length === 0) return 0
    return body.filter((t) => t === this.unkToken).length / body.length
  }
}
