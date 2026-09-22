import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { extractTextOf } from '../DocTextService'

/**
 * 正文抽取分派器的两条分支都要真跑：
 * - TEXT 组直读 utf8（控制字符要清掉，否则 trigram 索引吃到噪声）
 * - OFFICE_DOC 组走 officeparser（docx 夹具是手写的真 OOXML 包，不是 mock）
 * officeparser 未安装时该用例显式 skip，不伪装成绿灯。
 */
const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const parserReady = existsSync(join(process.cwd(), 'node_modules', 'officeparser', 'package.json'))

describe('extractTextOf', () => {
  it('md/txt 直读正文并清控制字符', async () => {
    const text = await extractTextOf(join(fixtures, 'note.md'))
    expect(text).toContain('发票号码 12345')
    expect(text).not.toContain('\x00')
  })

  it('非文本类扩展名返回空串（不误起解析器）', async () => {
    expect(await extractTextOf(join(fixtures, 'photo.jpg'))).toBe('')
  })

  it.skipIf(!parserReady)(
    'docx 走 officeparser 抽出正文',
    async () => {
      const text = await extractTextOf(join(fixtures, 'sample.docx'))
      expect(text).toContain('季度营收同比增长 18%')
      expect(text).toContain('Leaf 正文抽取回归夹具')
    },
    30000
  )
})

describe('网页类正文要剥掉标记', () => {
  it('html 只留可见文本，script/style 内容不进索引', async () => {
    const text = await extractTextOf(join(fixtures, 'page.html'))
    expect(text).toContain('季度营收同比增长 18%')
    expect(text).toContain('明细见附表 & 附图') // 实体解回来，否则"搜 & 搜不到"
    expect(text).not.toContain('&amp;')
    expect(text).not.toContain('hiddenImpl') // <script> 源码被索引过：搜 function 会命中一堆网页
    expect(text).not.toContain('color:red')
    expect(text).not.toContain('<h1>')
  })

  it('md 不受这条影响：仍按原文抽（代码块里本就有尖括号与 &）', async () => {
    const md = await extractTextOf(join(fixtures, 'note.md'))
    expect(md).toContain('发票号码 12345')
  })
})
