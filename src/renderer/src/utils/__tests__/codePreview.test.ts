// @vitest-environment happy-dom
/**
 * 代码预览着色（utils/codePreview）
 *
 * 这个模块的输出会直接进 v-html，所以最关键的不是"有没有上色"，
 * 而是**每条分支交出去的东西都还是转义过的**：素材是用户从各处拖进来的，
 * 一个 .js 文件里写 `const x = "<img src=x onerror=...>"` 是日常内容，
 * 不是攻击——但它一旦没转义进 v-html 就是攻击。
 * 所以下面每一支都单独验转义，且刻意用**未着色**分支（未知语言 / 超上限）来验，
 * 那才是我可能写漏的地方。
 */
import { describe, it, expect } from 'vitest'
import { escapeHtml, highlightCodeFile, languageForFile, HIGHLIGHT_MAX_CHARS } from '../codePreview'

const JS_WITH_MARKUP = `const banner = "<img src=x onerror=alert(1)>"
export function greet(name) { return 'hi ' + name }
`

describe('languageForFile', () => {
  it('按最后一个点取扩展名（.d.ts 是 typescript，.test.ts 也是）', () => {
    expect(languageForFile('lib.dom.d.ts')).toBe('typescript')
    expect(languageForFile('repo.test.ts')).toBe('typescript')
    expect(languageForFile('index.JS')).toBe('javascript') // 大小写不敏感
    expect(languageForFile('package.json')).toBe('json')
    expect(languageForFile('a.b.c.mjs')).toBe('javascript')
  })

  it('不认识的扩展名、无扩展名、只有点没有基名的，一律 null', () => {
    expect(languageForFile('notes.txt')).toBeNull()
    expect(languageForFile('run.log')).toBeNull()
    expect(languageForFile('LICENSE')).toBeNull()
    expect(languageForFile('.eslintrc')).toBeNull() // dot 在 0 位：没有基名，不算扩展名
    expect(languageForFile('')).toBeNull()
    expect(languageForFile('data.map')).toBeNull() // source map：没人通读，不着色
  })
})

describe('highlightCodeFile', () => {
  it('认得的语言会产出 hljs token', () => {
    const r = highlightCodeFile('greet.js', JS_WITH_MARKUP)
    expect(r.language).toBe('javascript')
    expect(r.html).toContain('hljs-string')
    expect(r.html).toContain('hljs-keyword')
  })

  it('着色分支里文件内容的尖括号仍是转义过的（hljs 负责转义，这里锁死这个前提）', () => {
    const r = highlightCodeFile('greet.js', JS_WITH_MARKUP)
    expect(r.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(r.html).not.toContain('<img')
  })

  it('未知语言分支必须自己转义（这条最容易写漏）', () => {
    const r = highlightCodeFile('note.txt', JS_WITH_MARKUP)
    expect(r.language).toBeNull()
    expect(r.html).toContain('&lt;img')
    expect(r.html).not.toContain('<img')
    expect(r.html).not.toContain('hljs-')
  })

  it('超过上限不着色，但一样给转义过的原文', () => {
    const big = `<a>& "x"`.repeat(Math.floor(HIGHLIGHT_MAX_CHARS / 7) + 2)
    expect(big.length).toBeGreaterThan(HIGHLIGHT_MAX_CHARS)
    const r = highlightCodeFile('big.js', big)
    expect(r.language).toBeNull()
    expect(r.html).not.toContain('hljs-')
    expect(r.html).toContain('&lt;a&gt;')
  })

  it('引号与 & 也要转义（HTML 属性面的注入点）', () => {
    const r = highlightCodeFile('notes.txt', `a & b "quoted" <script>`)
    expect(r.html).toBe('a &amp; b &quot;quoted&quot; &lt;script&gt;')
  })
})

describe('escapeHtml', () => {
  it('四个字符都过一遍，且不重复转义已有实体的写法与预期一致', () => {
    expect(escapeHtml('&<>"')).toBe('&amp;&lt;&gt;&quot;')
    expect(escapeHtml('已 &amp; 未')).toBe('已 &amp;amp; 未') // 原文里的实体是文本，不该被当实体
  })
})
