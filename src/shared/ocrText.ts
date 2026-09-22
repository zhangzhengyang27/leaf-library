/**
 * 跨进程共享 · OCR 文本归一化。
 *
 * tesseract 的 chi_sim 会在相邻汉字之间插空格（「拖 放 文 件 到 这 里」），
 * 而 photo_fts 用 trigram 分词——带空格的串既搜不到整词，喂给模型也全是噪声。
 * 只合并「汉字 ↔ 汉字」之间的空白，中英混排的边界（`Chrome 扩展`）保持原样。
 */
const HAN_PAIR = /(\p{Script=Han})[ \t\u3000]+(?=\p{Script=Han})/gu

export function normalizeOcrText(raw: string): string {
  let out = raw
  // 三连以上相邻汉字需要迭代收敛：单次 replace 会把「a b c」只吃成「a bc」
  let prev = ''
  do {
    prev = out
    out = out.replace(HAN_PAIR, '$1')
  } while (out !== prev)
  return out.replace(/[ \t]{2,}/g, ' ').trim()
}

/**
 * 交给文本模型的最小正文字数（去空白后计）。
 *
 * 门槛按实测数据定：2 个杂字符 OCR 的图，模型只能吐「一张名为 xxx 的图片，
 * 尺寸为 4110×2642」这种没有信息量的空话；而 21 个有效字的截图 OCR
 * 已经能出可用摘要。取 12——高于噪声、低于一句像样的话。
 * 宁可直说「文字不足」，也不要假摘要。
 */
export const MIN_AI_TEXT_CHARS = 12

export function hasAiWorthyText(text: string | null | undefined): boolean {
  return (text ?? '').replace(/\s+/g, '').length >= MIN_AI_TEXT_CHARS
}
