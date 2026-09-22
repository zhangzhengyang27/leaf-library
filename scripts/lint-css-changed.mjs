#!/usr/bin/env node
/**
 * Leaf · lint-css:changed
 *
 * 增量 design token 检查：只跑 git status 中 changed / untracked 的
 * .vue / .css / .less 文件，强制 stylelint error 通过：
 * - color-no-hex
 * - color-named（禁止 white / black 等）
 *
 * 用途：pre-push / CI 增量检查。
 * 为什么不直接跑整套 lint:css？因为存量 946 个 warning（color-no-hex:884
 * + color-named:61 + length-zero:1），一次性清零风险大（多个 Material
 * Design 调色无对应 token 且会破坏视觉）。
 *
 * 用法：
 *   - 本地：pnpm lint:css:changed
 *   - CI（在 lint job 末尾跑）：pnpm lint:css:changed
 *
 * 行为：
 *   - 没有 changed → 静默通过
 *   - 有 changed → stylelint 只跑这些文件；违规 exit 1
 *   - 跳过删除的文件、跳过二进制
 */

import { execFileSync, execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { extname, join } from 'node:path'

const VALID_EXT = new Set(['.vue', '.css', '.less'])

/** @returns {string} */
function sh(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return ''
  }
}

// 1. git status --porcelain 拿 staged + unstaged + untracked
const porcelain = sh('git status --porcelain')
if (!porcelain) {
  process.stdout.write('lint:css:changed — no changes\n')
  process.exit(0)
}

const changed = []
for (const line of porcelain.split('\n')) {
  if (!line) continue
  // 格式：XY <路径>。兼容三种形态：
  //   " M path"（未暂存修改） / "M  path"（已暂存修改） / "?? path"（未跟踪）
  // 旧实现固定 line.slice(3) 在已暂存文件（"M  path" 少一个空格的 git 变体输出）上
  // 会截掉路径首字符 → existsSync 失败 → 静默跳过严格检查（BUGS.md B16）
  const m = line.match(/^(..)\s+(.+)$/)
  if (!m) continue
  const code = m[1]
  const path = m[2]
    .replace(/^"(.*)"$/, '$1')
    .split(' -> ')
    .pop()
  if (!path) continue
  // porcelain 的 XY 两列只要有一列是 D（暂存区或工作区删除）→ 跳过已删除文件
  // （原实现 code === 'D' 恒为 false：X/Y 各占一字符，"D "/" D" 都不是 'D'）
  if (code.includes('D')) continue
  if (!VALID_EXT.has(extname(path))) continue
  if (!existsSync(path)) continue
  changed.push(path)
}

if (changed.length === 0) {
  process.stdout.write('lint:css:changed — no .vue / .css / .less changed\n')
  process.exit(0)
}

process.stdout.write(`lint:css:changed — checking ${changed.length} file(s):\n`)
for (const f of changed) process.stdout.write(`  ${f}\n`)

// 2. 跑 stylelint 这些文件；strict 模式（STRICT_CSS_LINT=1）下
// color-no-hex / color-named 升级为 error
// execFileSync 免 shell：文件名含空格/引号/特殊字符也不会被二次解析
try {
  execFileSync(
    'pnpm',
    ['exec', 'stylelint', ...changed, '--config', join(process.cwd(), 'stylelint.config.mjs')],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        STRICT_CSS_LINT: '1'
      }
    }
  )
  process.exit(0)
} catch (e) {
  process.exit(e.status ?? 1)
}
