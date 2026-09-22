/**
 * WordPieceTokenizer 单测：每一步都用「少了它就会静默出错」的样本钉住。
 * 词表是合成的（真 tokenizer.json 属于下载产物，不进仓库），
 * 但覆盖的都是 BertTokenizer 的真实规则：CJK 加空格、## 续接、去音符、整词 UNK。
 */
import { describe, it, expect } from 'vitest'
import { WordPieceTokenizer } from '../WordPieceTokenizer'

const VOCAB: Record<string, number> = {
  '[PAD]': 0,
  '[UNK]': 100,
  '[CLS]': 101,
  '[SEP]': 102,
  '[MASK]': 103,
  红: 1000,
  色: 1001,
  '##色': 1002,
  日: 1003,
  落: 1004,
  的: 1005,
  猫: 1006,
  山: 1007,
  cafe: 2000,
  '##fe': 2001,
  hello: 2002,
  world: 2003,
  cat: 2004,
  su: 2005,
  '##per': 2006,
  // 真词表里中英文标点都是独立 token（已对 chinese-clip vocab.txt 核过）
  ',': 3000,
  '，': 3001
}

const tok = new WordPieceTokenizer({ model: { vocab: VOCAB, unk_token: '[UNK]' } })
const body = (text: string, maxTokens = 77, t = tok): string[] =>
  t.tokenize(text, maxTokens).slice(1, -1)

describe('WordPieceTokenizer', () => {
  it('中文逐字切开：少这步整句会塌成一个 [UNK]', () => {
    expect(body('红色的猫')).toEqual(['红', '色', '的', '猫'])
  })

  it('词内贪心最长匹配优先，剩余片段带 ## 续接', () => {
    // 词表里有 cafe，所以不该退化成 c/##a/##f/##e
    expect(body('super')).toEqual(['su', '##per'])
    expect(body('CAFÉ')).toEqual(['cafe'])
  })

  it('大小写与重音：Café → cafe（do_lower_case + strip_accents 跟随 lowercase）', () => {
    expect(body('Café 的猫')).toEqual(['cafe', '的', '猫'])
  })

  it('标点独立成 token，英文逗号不粘连', () => {
    expect(body('hello,world')).toEqual(['hello', ',', 'world'])
  })

  it('任一片段不在词表 → 整词 UNK（HF 口径，不是逐字 UNK）', () => {
    expect(body('猫狗')).toEqual(['猫', '[UNK]'])
  })

  it('全角标点与中文标点也加空格', () => {
    expect(body('猫，山')).toEqual(['猫', '，', '山'])
  })

  it('控制字符按 HF 口径是"丢弃"而不是"替换成空格"，所以相邻两词会并成一个词', () => {
    expect(body('cat\u0000\u200bcat')).toEqual(['[UNK]'])
    expect(body('cat \u0000 cat')).toEqual(['cat', 'cat'])
  })

  it('encode 首尾是 [CLS]/[SEP]，且不超过 maxTokens', () => {
    const ids = tok.encode('红色的猫的猫的猫', 5)
    expect(ids[0]).toBe(101)
    expect(ids[ids.length - 1]).toBe(102)
    expect(ids.length).toBeLessThanOrEqual(5)
  })

  it('空串只剩两个特殊标记，不炸', () => {
    expect(tok.encode('')).toEqual([101, 102])
    expect(tok.unkRatio(['[CLS]', '[SEP]'])).toBe(0)
  })

  it('unkRatio 能认出分词退化', () => {
    expect(tok.unkRatio(tok.tokenize('红色的猫'))).toBe(0)
    expect(tok.unkRatio(tok.tokenize('🐱🐱'))).toBe(1)
  })

  it('词表缺特殊标记要在构造期就抛，不能拖到检索时静默 UNK', () => {
    expect(() => new WordPieceTokenizer({ model: { vocab: { '[UNK]': 0 } } })).toThrow(/\[CLS\]/)
    expect(() => new WordPieceTokenizer({})).toThrow(/model\.vocab/)
  })

  it('超过 100 字符的词整词 UNK（HF max_input_chars_per_word）', () => {
    expect(body(`a${'x'.repeat(120)}`)).toEqual(['[UNK]'])
  })
})

describe('空白与控制字符的 HF 口径', () => {
  it('制表/换行/NBSP 是分隔符，不是被丢弃的控制字符', () => {
    // 顺序写反会把 "cat\tposter" 粘成一个词 → token 序列静默改变
    const tok2 = new WordPieceTokenizer({
      model: {
        vocab: {
          ...VOCAB,
          poster: 4000,
          '2024': 4001,
          '2025': 4002
        },
        unk_token: '[UNK]'
      }
    })
    expect(body('cat\tposter', 77, tok2)).toEqual(['cat', 'poster'])
    expect(body('cat\nposter', 77, tok2)).toEqual(['cat', 'poster'])
    expect(body('cat\u00a0poster', 77, tok2)).toEqual(['cat', 'poster'])
    expect(body('2024\n2025', 77, tok2)).toEqual(['2024', '2025'])
  })
})

describe('非 BMP 字符按码点而不是 UTF-16 码元', () => {
  // U+20BB7（"𠮷"，扩展 B 区）：UTF-16 里是代理对，按码元切会从中间劈开
  const EXT = String.fromCodePoint(0x20bb7)
  it('劈开代理对会让整词 UNK，码点实现应正常推进', () => {
    const t = new WordPieceTokenizer({
      model: {
        vocab: { ...VOCAB, '[CLS]': 101, '[SEP]': 102, [EXT]: 5000, cat: 2004, '##cat': 2005 },
        unk_token: '[UNK]'
      }
    })
    expect(t.wordpiece(EXT)).toEqual([EXT])
    expect(t.wordpiece(EXT + 'cat')).toEqual([EXT, '##cat'])
  })
})
