/** 一次性探针共用件（跑完删）：BertTokenizer(WordPiece) + 向量工具 */
import { readFileSync } from 'node:fs'

export const l2n = (v) => {
  let s = 0
  for (const x of v) s += x * x
  s = Math.sqrt(s) || 1
  return v.map((x) => x / s)
}
export const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)

const PUNCT = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"
const isCJK = (cp) =>
  (cp >= 0x4e00 && cp <= 0x9fff) ||
  (cp >= 0x3400 && cp <= 0x4dbf) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0x3000 && cp <= 0x303f) ||
  (cp >= 0xff00 && cp <= 0xffef)

export function makeTokenizer(file) {
  const t = JSON.parse(readFileSync(file, 'utf8'))
  const vocab = t.model.vocab
  const unkToken = t.model.unk_token ?? '[UNK]'
  const unkId = vocab[unkToken]
  function basic(raw) {
    let s = raw.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    const out = []
    for (const ch of s) {
      const cp = ch.codePointAt(0)
      if (cp === 0 || (cp > 0 && cp < 0x20) || cp === 0x200b) continue
      if (isCJK(cp) || PUNCT.includes(ch)) out.push(' ', ch, ' ')
      else out.push(ch)
    }
    return out.join('').split(/\s+/).filter(Boolean)
  }
  function wordpiece(word) {
    if (word.length > 100) return [unkToken]
    const pieces = []
    let i = 0
    while (i < word.length) {
      let j = word.length - i
      let best = null
      while (j > 0) {
        const cand = i === 0 ? word.slice(i, i + j) : `##${word.slice(i, i + j)}`
        if (cand in vocab) {
          best = cand
          break
        }
        j--
      }
      if (best === null) return [unkToken]
      pieces.push(best)
      i += j
    }
    return pieces
  }
  return {
    vocabSize: Object.keys(vocab).length,
    unkId,
    encode(text, maxLen = 77) {
      const ids = []
      const toks = []
      for (const w of basic(text)) {
        for (const p of wordpiece(w)) {
          ids.push(vocab[p] ?? unkId)
          toks.push(p)
        }
      }
      const keep = Math.max(0, maxLen - 2)
      const trimmed = ids.slice(0, keep)
      const trimmedToks = toks.slice(0, keep)
      return {
        ids: [vocab['[CLS]'], ...trimmed, vocab['[SEP]']],
        tokens: ['[CLS]', ...trimmedToks, '[SEP]'],
        unkRate: trimmed.length ? trimmed.filter((v) => v === unkId).length / trimmed.length : 0
      }
    }
  }
}
