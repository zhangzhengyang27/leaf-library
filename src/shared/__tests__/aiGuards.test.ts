import { describe, it, expect } from 'vitest'
import { normalizeOcrText, hasAiWorthyText, MIN_AI_TEXT_CHARS } from '../ocrText'
import { isSafeRenamePattern, sanitizeFileNameBase } from '../filename'

describe('normalizeOcrText（tesseract chi_sim 的汉字间空白）', () => {
  it('合并相邻汉字之间的空格，让 trigram 索引能命中整词', () => {
    expect(normalizeOcrText('拖 放 文件 到 这 里')).toBe('拖放文件到这里')
  })

  it('三连以上相邻汉字也要合完（单次 replace 会漏）', () => {
    expect(normalizeOcrText('安 装 浏 览 器 扩 展')).toBe('安装浏览器扩展')
  })

  it('中英混排的边界保持原样，不把 Chrome 和汉字粘死', () => {
    expect(normalizeOcrText('用 Chrome 扩展 导入')).toBe('用 Chrome 扩展导入')
  })

  it('幂等：跑两遍结果一致', () => {
    const once = normalizeOcrText('世 训 - 巩 z 昌 你 避 以 一 次 拖 搜')
    expect(normalizeOcrText(once)).toBe(once)
  })

  it('全角空格与制表符也算空白', () => {
    expect(normalizeOcrText('文\t件 到　这 里')).toBe('文件到这里')
  })
})

describe('hasAiWorthyText（喂给文本模型的最小正文）', () => {
  it('OCR 杂字符噪声不算文字料', () => {
    // 实测：一张图只 OCR 出「| 记 “」，模型只能吐「一张名为 xxx 的图片，尺寸为…」
    expect(hasAiWorthyText('| 记 “')).toBe(false)
    expect(hasAiWorthyText('')).toBe(false)
    expect(hasAiWorthyText(null)).toBe(false)
    expect(hasAiWorthyText('   \n\t  ')).toBe(false)
  })

  it('按去空白后的字数判定：OCR 插的空格不算内容', () => {
    // 实测能出可用摘要的那张截图 OCR（含空格 41 字符 / 去空格 21 字）
    const spaced = '拖 放 文 件 到 这 里 导 入 本 地 文 件 来 安 装 浏 览 器 扩 展'
    expect(spaced.length).toBe(41)
    expect(hasAiWorthyText(spaced)).toBe(true)
  })

  it('门槛两侧各卡一次', () => {
    expect(hasAiWorthyText('文'.repeat(MIN_AI_TEXT_CHARS - 1))).toBe(false)
    expect(hasAiWorthyText('文'.repeat(MIN_AI_TEXT_CHARS))).toBe(true)
  })
})

describe('isSafeRenamePattern（模型产出的命名模板先过闸）', () => {
  it('接受已知 token + 合法字面', () => {
    expect(isSafeRenamePattern('{parent}_{date}_{n}')).toBe(true)
    expect(isSafeRenamePattern('素材-{name}')).toBe(true)
    expect(isSafeRenamePattern('旅行 01')).toBe(true)
  })

  it('拒绝未知 token（模型爱编 {ext} / {title}）', () => {
    expect(isSafeRenamePattern('{name}.{ext}')).toBe(false)
    expect(isSafeRenamePattern('{title}-{n}')).toBe(false)
  })

  it('拒绝含路径分隔符与非法字符的字面', () => {
    expect(isSafeRenamePattern('a/b{name}')).toBe(false)
    expect(isSafeRenamePattern('a:b')).toBe(false)
    // 与 sanitizeFileNameBase 的口径一致：会被改写的字面就是不合格
    for (const bad of ['a/b', 'a\\b', 'a:b', 'a*b']) {
      expect(sanitizeFileNameBase(bad)).not.toBe(bad)
      expect(isSafeRenamePattern(bad)).toBe(false)
    }
  })

  it('拒绝空串与超长模板', () => {
    expect(isSafeRenamePattern('   ')).toBe(false)
    expect(isSafeRenamePattern('x'.repeat(121))).toBe(false)
  })
})
