/**
 * Leaf 素材库 · 高级搜索解析器（round20）
 *
 * 支持 Eagle 4.0 Build 12 等价的高级搜索语法：
 * - OR 运算符：`cat OR dog`、`cat || dog`
 * - 括号分组：`(cat OR dog) black`
 * - 引号短语：`"cat food"`
 * - 排除词：`-pet`（在 AND 上下文中排除）
 * - 纯空格分隔默认 AND：`cat dog` = cat AND dog
 *
 * 无 OR/括号时走原快速路径（matchKeyword），保证性能。
 */
import type { Photo } from '@renderer/types/photo'

// ── AST 节点类型 ──

type AstNode =
  | { type: 'term'; value: string; exclude: boolean }
  | { type: 'phrase'; value: string; exclude: boolean }
  | { type: 'and'; children: AstNode[] }
  | { type: 'or'; children: AstNode[] }

// ── 词法分析 ──

type Token =
  | { type: 'word'; value: string }
  | { type: 'phrase'; value: string }
  | { type: 'or' }
  | { type: 'lparen' }
  | { type: 'rparen' }

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    // 跳过空白
    if (/\s/.test(input[i])) {
      i++
      continue
    }
    // 引号短语
    if (input[i] === '"') {
      i++
      let phrase = ''
      while (i < input.length && input[i] !== '"') {
        phrase += input[i]
        i++
      }
      if (i < input.length) i++ // 跳过闭合引号
      if (phrase.trim()) tokens.push({ type: 'phrase', value: phrase.trim() })
      continue
    }
    // 括号
    if (input[i] === '(') {
      tokens.push({ type: 'lparen' })
      i++
      continue
    }
    if (input[i] === ')') {
      tokens.push({ type: 'rparen' })
      i++
      continue
    }
    // 普通词（直到空白或括号）
    let word = ''
    while (i < input.length && !/\s/.test(input[i]) && input[i] !== '(' && input[i] !== ')') {
      word += input[i]
      i++
    }
    if (word) {
      // OR / || 运算符
      if (word === 'OR' || word === '||') {
        tokens.push({ type: 'or' })
      } else {
        tokens.push({ type: 'word', value: word })
      }
    }
  }
  return tokens
}

// ── 语法分析（递归下降） ──
//
// 文法：
//   expr    := or_expr
//   or_expr := and_expr ('OR' and_expr)*
//   and_expr := factor (factor)*
//   factor  := '-'? (word | phrase | '(' expr ')')

class Parser {
  private pos = 0
  constructor(private tokens: Token[]) {}

  parse(): AstNode | null {
    if (this.tokens.length === 0) return null
    const node = this.parseOr()
    // 忽略多余的右括号
    return node
  }

  private parseOr(): AstNode {
    const left = this.parseAnd()
    const children: AstNode[] = [left]
    while (this.peek()?.type === 'or') {
      this.pos++
      children.push(this.parseAnd())
    }
    if (children.length === 1) return children[0]
    return { type: 'or', children }
  }

  private parseAnd(): AstNode {
    const children: AstNode[] = []
    while (this.peek() && this.peek()!.type !== 'or' && this.peek()!.type !== 'rparen') {
      children.push(this.parseFactor())
    }
    if (children.length === 0) {
      // 空因子（如连续 OR），返回一个永远匹配的 term
      return { type: 'term', value: '', exclude: false }
    }
    if (children.length === 1) return children[0]
    return { type: 'and', children }
  }

  private parseFactor(): AstNode {
    const tok = this.peek()
    if (!tok) return { type: 'term', value: '', exclude: false }

    // 排除词前缀
    let exclude = false
    if (tok.type === 'word' && tok.value.startsWith('-') && tok.value.length > 1) {
      exclude = true
      const value = tok.value.slice(1)
      this.pos++
      return { type: 'term', value, exclude }
    }

    if (tok.type === 'word') {
      this.pos++
      return { type: 'term', value: tok.value, exclude: false }
    }
    if (tok.type === 'phrase') {
      this.pos++
      return { type: 'phrase', value: tok.value, exclude: false }
    }
    if (tok.type === 'lparen') {
      this.pos++
      const inner = this.parseOr()
      if (this.peek()?.type === 'rparen') this.pos++
      return inner
    }
    // 不应到达
    this.pos++
    return { type: 'term', value: '', exclude: false }
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }
}

// ── 求值 ──

function photoHaystack(p: Photo): string {
  return (
    p.fileName.toLowerCase() +
    '\n' +
    (p.description ?? '').toLowerCase() +
    '\n' +
    p.tags.map((t) => t.toLowerCase()).join('\n')
  )
}

/** 二十七轮：按「搜索范围」构建匹配文本（Eagle 搜索框 ˅ 下拉勾选的字段） */
export interface SearchScopeOptions {
  /** 勾选的范围集；undefined = 旧全字段行为（名称/描述/标签），向后兼容 */
  scopes?: readonly string[]
  /** 素材所属文件夹名（folderName 范围用） */
  folderName?: string
  /** 素材所属文件夹描述（folderDesc 范围用） */
  folderDesc?: string
}

function scopeHaystack(p: Photo, opts?: SearchScopeOptions): string {
  const s = opts?.scopes
  if (!s) return photoHaystack(p)
  const parts: string[] = []
  const has = (id: string): boolean => s.includes(id)
  if (has('name')) parts.push(p.fileName.toLowerCase())
  if (has('folderName') && opts?.folderName) parts.push(opts.folderName.toLowerCase())
  if (has('folderDesc') && opts?.folderDesc) parts.push(opts.folderDesc.toLowerCase())
  if (has('ext')) {
    const idx = p.fileName.lastIndexOf('.')
    if (idx >= 0) parts.push(p.fileName.slice(idx + 1).toLowerCase())
  }
  if (has('tags')) parts.push(p.tags.map((t) => t.toLowerCase()).join('\n'))
  if (has('link')) parts.push((p.sourceUrl ?? '').toLowerCase())
  if (has('note')) parts.push((p.description ?? '').toLowerCase())
  return parts.join('\n')
}

function evalNode(node: AstNode, haystack: string): boolean {
  switch (node.type) {
    case 'term': {
      if (!node.value) return true // 空 term 永远匹配
      const found = haystack.includes(node.value.toLowerCase())
      return node.exclude ? !found : found
    }
    case 'phrase': {
      const found = haystack.includes(node.value.toLowerCase())
      return node.exclude ? !found : found
    }
    case 'and':
      return node.children.every((c) => evalNode(c, haystack))
    case 'or':
      return node.children.some((c) => evalNode(c, haystack))
  }
}

// ── 公共 API ──

/**
 * 检测查询是否包含高级语法（OR/括号/引号/排除词）。
 * 必须与 tokenize/Parser 实际支持的语法一致（大写 OR、||、()、直引号短语、词首 `-` 排除），
 * 不含高级语法时调用方应走原快速路径。
 */
export function hasAdvancedSyntax(query: string): boolean {
  return /[()"]|\bOR\b|\|\||(?:^|\s)-\S/.test(query)
}

/**
 * 解析查询字符串为 AST（供测试和调试用）。
 */
export function parseSearchQuery(query: string): AstNode | null {
  const tokens = tokenize(query)
  if (tokens.length === 0) return null
  return new Parser(tokens).parse()
}

/**
 * AST 解析缓存。筛选每次变化都会对整个素材池逐图调 advancedMatch，
 * 10 万级库不缓存的话同一查询串会被重新词法/语法分析 10 万次。
 * 查询串全集很小（用户正在输入的内容），上限 100 实际永远触不到。
 */
const astCache = new Map<string, AstNode | null>()
const AST_CACHE_MAX = 100

function parseSearchQueryCached(query: string): AstNode | null {
  const hit = astCache.get(query)
  if (hit !== undefined) return hit
  const ast = parseSearchQuery(query)
  if (astCache.size >= AST_CACHE_MAX) {
    const oldest = astCache.keys().next().value
    if (oldest !== undefined) astCache.delete(oldest)
  }
  astCache.set(query, ast)
  return ast
}

/**
 * 高级搜索匹配：对单张 photo 求值。
 * 无高级语法时返回 null，调用方应回退到 matchKeyword。
 */
export function advancedMatch(p: Photo, query: string, opts?: SearchScopeOptions): boolean | null {
  if (!hasAdvancedSyntax(query)) return null
  const ast = parseSearchQueryCached(query)
  if (!ast) return null
  return evalNode(ast, scopeHaystack(p, opts))
}

/**
 * 统一搜索匹配入口：自动选择高级路径或快速路径。
 * 二十七轮：支持 Eagle「搜索范围」——只搜勾选字段；空范围集 = 无匹配。
 */
export function searchMatch(p: Photo, query: string, opts?: SearchScopeOptions): boolean {
  const q = query.trim()
  if (!q) return true
  const advanced = advancedMatch(p, q, opts)
  if (advanced !== null) return advanced
  if (opts?.scopes && opts.scopes.length === 0) return false
  // 快速路径：空格 AND
  const haystack = scopeHaystack(p, opts)
  return q.split(/\s+/).every((word) => haystack.includes(word.toLowerCase()))
}
