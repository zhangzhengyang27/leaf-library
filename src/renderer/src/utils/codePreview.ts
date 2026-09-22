/**
 * 代码类素材的预览着色
 *
 * 库里 5,178 条活跃素材有 4,206 条是代码/数据文本（实测分布：js 1360 / d.ts 1193 /
 * js.map 474 / md 345 / ts 249 / json 247…），原先整片按纯文本渲染——345 个 .md 有 markdown-it 上色，代码反而没有。
 * highlight.js 本来就在依赖里但没人用过（markdown 走的是 marked，不出 token），
 * 这条是第一次把它接到渲染路径上。
 *
 * 三条约束，每条都对应一种会坏掉的方式：
 *  1. **每条返回路径都得给出转义过的 HTML**——模板那边换成了 v-html，漏一条就等于
 *     把素材内容当标记解析。素材是用户从各处拖进来的，不是可信源；
 *  2. **只按扩展名认语言，绝不做 `highlightAuto`**：实测 1MB 文本上指定语言 146ms、
 *     自动探测 1024ms，而预览是每次换素材都要重算的；
 *  3. **超上限不着色**：着色会把 HTML 撑到原文的 2.6 倍（821KB 的 index.esm.js
 *     实测产出 2.1MB / 数万个 span 节点），v-html 注入这么一段主线程还要再占一截。
 *     上限之下的文件按纯文本走，与加这条之前的表现一致。
 */
import hljs from 'highlight.js/lib/common'
// token 配色是全局样式：assets/main.css 里引的 code-preview.css。
// PhotoPreview.vue 内那套 .leaf-md :deep(.hljs-*) 是 scoped 的，盖不到这里。

/**
 * 着色上限（字符）。数字是量出来的，不是拍的：
 *  - 用户当前库 4,206 个代码类文件里 4,178 个（99.3%）在此之下；
 *  - 200KB 着色实测 41ms，而 821KB 那个要 148ms、产出 2.1MB 的 span 串
 *    （v-html 注入这么大一段会把主线程再占住一截）；
 *  - 超上限的正好是 source map、`lib.dom.d.ts`、打包产物这类没人通读的文件。
 */
export const HIGHLIGHT_MAX_CHARS = 200_000

/** 扩展名 → highlight.js 语言 id（只列库里真有的与常见的；不认识的走纯文本） */
const EXT_LANG: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  json: 'json',
  jsonc: 'json',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  svg: 'xml',
  vue: 'xml',
  css: 'css',
  scss: 'scss',
  less: 'less',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  hpp: 'cpp',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  sql: 'sql',
  php: 'php',
  pl: 'perl',
  lua: 'lua'
}

export interface CodeHighlight {
  /** 可以安全进 v-html 的片段：着色后的 hljs 输出，或转义过的原文 */
  html: string
  /** 实际用的语言 id；null = 整块按纯文本走 */
  language: string | null
}

/**
 * 扩展名 → hljs 语言 id。
 * 认不出、或随包的 common 构建里没这门语言，一律 null（宁可不上色也不能上错色）。
 */
export function languageForFile(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return null
  const lang = EXT_LANG[fileName.slice(dot + 1).toLowerCase()]
  if (!lang) return null
  return hljs.getLanguage(lang) ? lang : null
}

/**
 * 着色一个代码文件。
 *
 * `hljs.highlight` 会转义输入，所以着色分支可以直接进 v-html；
 * 未着色分支必须自己 escapeHtml——这两条路径少任何一条都是 XSS 面。
 */
export function highlightCodeFile(fileName: string, code: string): CodeHighlight {
  const language = languageForFile(fileName)
  if (!language || code.length > HIGHLIGHT_MAX_CHARS) {
    return { html: escapeHtml(code), language: null }
  }
  try {
    const r = hljs.highlight(code, { language, ignoreIllegals: true })
    return { html: r.value, language }
  } catch {
    // 着色器内部抛了不能把整块预览弄没
    return { html: escapeHtml(code), language: null }
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
