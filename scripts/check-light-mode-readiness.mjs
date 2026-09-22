#!/usr/bin/env node
/**
 * Leaf · Light-mode 静态兼容检查
 *
 * 报告三类问题：
 * 1. hardcoded hex 颜色（#xxx / #xxxxxx）—— light / dark 模式都锁定
 * 2. hex 颜色在 CSS / SFC <style> 内 —— 同样锁定
 * 3. inline style 属性里的颜色 / 背景图（light mode 下可能不适配）
 *
 * 不改代码，只是报告，便于后续人工核查或优先修复。
 *
 * 已有 lint:css:changed（增量必净），但存量未覆盖；
 * 本脚本覆盖「存量 + 增量」全部，作为 light mode review 的
 * 待办清单源。
 *
 * 用法：
 *   - pnpm check:light       （常规）
 *   - pnpm check:light --json （CI 输出 JSON）
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')
const SRC = resolve(ROOT, 'src')

const VALID_EXT = new Set(['.vue', '.css', '.less', '.scss'])

const HEX_RE = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g
// 匹配 inline style 中的 color / background-color / background-image
const INLINE_COLOR_RE =
  /(?:color|background(?:-color)?|fill|stroke|border(?:-color)?)\s*:\s*([^;]+)/gi

const jsonMode = process.argv.includes('--json')

const findings = []

function walk(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name === 'out' || name === '.git') continue
    const p = resolve(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) {
      walk(p)
      continue
    }
    if (!VALID_EXT.has(extname(p))) continue
    scan(p)
  }
}

function scan(file) {
  const content = readFileSync(file, 'utf-8')
  const rel = relative(ROOT, file)
  const lines = content.split('\n')

  lines.forEach((line, i) => {
    // 跳过纯注释行（// 或 * 或 <!--）
    const trimmed = line.trim()
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('<!--')
    )
      return

    // 1. hex 颜色
    const hexMatches = [...line.matchAll(HEX_RE)]
    for (const m of hexMatches) {
      findings.push({
        file: rel,
        line: i + 1,
        col: m.index + 1,
        type: 'hex-color',
        snippet: line.trim().slice(0, 80),
        value: m[0]
      })
    }

    // 2. inline 颜色 / 背景图
    const inlineMatches = [...line.matchAll(INLINE_COLOR_RE)]
    for (const m of inlineMatches) {
      const value = (m[1] || '').trim()
      if (!value || value === 'inherit' || value === 'transparent') continue
      // 只关心含 hex / rgba / url(...) / 命名色的
      if (/#[0-9a-fA-F]/.test(value) || /rgba?\(/.test(value) || /url\(/.test(value)) {
        findings.push({
          file: rel,
          line: i + 1,
          col: m.index + 1,
          type: 'inline-color',
          snippet: line.trim().slice(0, 80),
          value
        })
      }
    }
  })
}

walk(SRC)

if (jsonMode) {
  process.stdout.write(JSON.stringify({ total: findings.length, findings }, null, 2) + '\n')
  process.exit(0)
}

// 文本报告
if (findings.length === 0) {
  process.stdout.write('check:light — 0 个 hex / inline 颜色问题\n')
  process.exit(0)
}

const byFile = new Map()
for (const f of findings) {
  if (!byFile.has(f.file)) byFile.set(f.file, [])
  byFile.get(f.file).push(f)
}

process.stdout.write(`\ncheck:light — ${findings.length} 个发现（按文件归组）\n\n`)

const sorted = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)

for (const [file, list] of sorted) {
  process.stdout.write(`  ${file}  (${list.length})\n`)
  for (const f of list.slice(0, 5)) {
    process.stdout.write(
      `    L${f.line}:${f.col}  [${f.type}] ${f.value.slice(0, 50)}  ${f.snippet}\n`
    )
  }
  if (list.length > 5) {
    process.stdout.write(`    ... 还有 ${list.length - 5} 个\n`)
  }
  process.stdout.write('\n')
}

process.stdout.write(
  `总计 ${findings.length} 个 hex / inline 颜色未走 design token；建议优先改 light mode 可见的（导航 / 卡片 / 主区域）。\n`
)
process.exit(0)
