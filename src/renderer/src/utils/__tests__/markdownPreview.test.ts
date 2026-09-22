/** Markdown 预览渲染层：结构、高亮、清洗三件事各守一条底线 */
import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../markdownPreview'

describe('renderMarkdown · 结构', () => {
  it('标题层级完整（h4 不再被 preflight 拍平成正文）', () => {
    const html = renderMarkdown('# A\n## B\n### C\n#### D\n##### E')
    for (const t of ['h1', 'h2', 'h3', 'h4', 'h5']) expect(html).toContain(`<${t}>`)
  })

  it('表格与 GFM 任务列表都出结构', () => {
    const html = renderMarkdown('| 项目 | 内容 |\n| - | - |\n| a | b |\n\n- [x] 已完成\n- [ ] 待办')
    expect(html).toMatch(
      /<table>[\s\S]*<thead>[\s\S]*<th>项目<\/th>[\s\S]*<tbody>[\s\S]*<td>a<\/td>/
    )
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('checked')
  })

  it('linkify 把裸链接变成可点锚点，且强制 _blank + noopener', () => {
    const html = renderMarkdown('见 https://example.com/x 说明')
    expect(html).toContain('href="https://example.com/x"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('typographer 关闭：代码里的 -- 与直引号不被改写成排版符号', () => {
    const html = renderMarkdown('参数 `--dry-run` 与 "引号" 保持原样')
    expect(html).toContain('--dry-run')
    expect(html).toContain('"引号"')
    expect(html).not.toContain('“')
  })
})

describe('renderMarkdown · 代码高亮', () => {
  it('带语言标注的代码块产出 hljs token 与 language class', () => {
    const html = renderMarkdown('```ts\nconst a: number = 1\n```')
    expect(html).toContain('class="language-ts"')
    expect(html).toContain('hljs-keyword')
    expect(html).toContain('hljs-number')
  })

  it('未知语言不炸，退回纯转义代码块', () => {
    const html = renderMarkdown('```not-a-lang\n<x> & "y"\n```')
    expect(html).toContain('<pre>')
    expect(html).toContain('&lt;x&gt;')
  })
})

describe('renderMarkdown · 清洗（不可信输入）', () => {
  it('script / iframe / on* 一律剥掉', () => {
    const html = renderMarkdown(
      '<script>alert(1)</script><iframe src="https://evil"></iframe><img src="x" onerror="alert(1)">'
    )
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('alert(1)')
  })

  it('javascript: 与协议相对地址不会变成可点/可加载资源', () => {
    // markdown-it 自己就拒建这类链接（留纯文本），sanitize 侧再兜一层
    const link = renderMarkdown('[x](javascript:alert(1))')
    expect(link).not.toMatch(/href="javascript/i)
    expect(link).not.toContain('<a')
    expect(renderMarkdown('![i](//evil.example/a.png)')).not.toContain('//evil.example')
  })

  it('class 只允许 hljs-*/language-*，别把任意类名当免费属性带进来', () => {
    const html = renderMarkdown('<span class="pv-icon is-fav evil">t</span>')
    expect(html).not.toContain('pv-icon')
    expect(html).not.toContain('is-fav')
  })
})
