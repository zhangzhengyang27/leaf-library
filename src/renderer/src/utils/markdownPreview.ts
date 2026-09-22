/**
 * Markdown 预览渲染（F4）：markdown-it 解析 → highlight.js 上色 → sanitize-html 白名单清洗。
 *
 * 三层各管一件事，顺序不能换：剪藏/下载来的 .md 属不可信输入，清洗必须是最后一道闸
 * （旧实现只剥 script 标签与 on* 属性，iframe、javascript: 链接等向量全部放过）。
 */
import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import hljs from 'highlight.js/lib/common'
import sanitizeHtml from 'sanitize-html'

/** 只放行高亮器与语言标记会产生的 class，别把「攻击者可控的 class 名」当免费属性放进来 */
const SAFE_CLASS = /^(?:hljs-[a-z0-9_-]+|language-[a-z0-9+#._-]+)$/

function pickSafeClass(attribs: Record<string, string>): Record<string, string> {
  const next = { ...attribs }
  const kept = (attribs.class ?? '').split(/\s+/).filter((c) => SAFE_CLASS.test(c))
  if (kept.length) next.class = kept.join(' ')
  else delete next.class
  return next
}

const md = new MarkdownIt({
  // 允许内联 HTML：技术笔记里 <br>/<details> 常见，能不能留由下面的白名单裁决
  html: true,
  linkify: true,
  // 关掉 typographer：它把 -- 变成 –、把直引号变弯引号，代码语境里那是字面量
  typographer: false,
  breaks: false,
  highlight(code, lang) {
    // 返回空串 = 让 markdown-it 自己转义输出 <pre><code>，不在此处插手
    if (!lang) return ''
    const target = hljs.getLanguage(lang) ? lang : undefined
    if (!target) return ''
    try {
      return hljs.highlight(code, { language: target, ignoreIllegals: true }).value
    } catch {
      return ''
    }
  }
})

// GFM 任务列表：markdown-it 核心不带这条，不补上 `- [x]` 会退回纯文本
// （复选框保持 disabled——预览不是编辑器）
md.use(taskLists)

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    'img',
    'del',
    'ins',
    'input' // GFM 任务列表 checkbox
  ],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ['href', 'name', 'target', 'title', 'rel'],
    img: ['src', 'srcset', 'alt', 'title', 'width', 'height', 'loading'],
    code: ['class'],
    pre: ['class'],
    span: ['class'],
    input: ['type', 'checked', 'disabled']
  },
  // img 允许 data:（内嵌 base64 图片在 md 中常见）；链接协议收紧
  allowedSchemesByTag: {
    img: ['http', 'https', 'data'],
    a: ['http', 'https', 'mailto']
  },
  allowProtocolRelative: false,
  // 链接一律 _blank：https 走 setWindowOpenHandler → 系统浏览器；
  // 相对链接等会被 window-open handler 拒绝，不会把主窗口 SPA 导航走
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    span: (tag, attribs) => ({ tagName: tag, attribs: pickSafeClass(attribs) }),
    code: (tag, attribs) => ({ tagName: tag, attribs: pickSafeClass(attribs) }),
    pre: (tag, attribs) => ({ tagName: tag, attribs: pickSafeClass(attribs) })
  }
}

/** 渲染 Markdown 为可安全 v-html 的 HTML 片段 */
export function renderMarkdown(source: string): string {
  return sanitizeHtml(md.render(source), SANITIZE_OPTIONS)
}
