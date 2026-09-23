/**
 * 源码完整性检查：把「恢复遗留的截断件 / 丢了的资源 / 没人引用的死文件」变成红灯。
 *
 * 为什么需要它：2026-09-21 误删后重建成一半的三处暗伤，全部躲过了既有门禁——
 *  1. `e2e/extension-real.spec.mjs` 连文件头带尾段都不在（SyntaxError），而 `pnpm test`
 *     只跑 vitest、e2e 要人手动跑，且一旦手动跑是「整目录起不来」而不是「这条红了」；
 *  2. `extension/icons/` 整个目录没了，而 `extension/manifest.json` 还指着
 *     `icons/icon128.png` —— 只有真去 Chrome 加载扩展才会撞；
 *  3. 自研截图那 7 个组件从未接线（零引用）却卡在 typecheck 里，把 `pnpm build` 拖死。
 * `check-sfc-integrity.mjs` 只看 .vue，tsconfig 又把 .bundle.ts 排除在外，所以这三类
 * 需要各自不同的判据：能不能解析、资源在不在、有没有人引用。
 *
 * 硬失败（exit 1）：.mjs/.cjs 解析失败；manifest 引用的文件不存在。
 * 只报告（不挡门）：src 下零引用的 .ts/.vue（可能是排期中的骨架，需要人判）。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

/** 递归收文件 */
function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'out' || name === 'dist') continue
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const errors = []
const notices = []

// ── 1. 所有 JS/MJS/CJS 必须能解析（e2e 与 scripts 都在 vitest 与 tsc 的射程之外）──
const jsFiles = [
  ...walk('e2e').filter((p) => /\.(mjs|cjs|js)$/.test(p)),
  ...walk('scripts').filter((p) => /\.(mjs|cjs|js)$/.test(p)),
  ...walk('extension').filter((p) => p.endsWith('.js')),
  ...walk('plugins').filter((p) => p.endsWith('.js'))
]
for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' })
  if (r.status !== 0) {
    const first = (r.stderr || '').split('\n').find((l) => l.trim().startsWith('SyntaxError'))
    errors.push(`${f}  ← 解析失败：${first || 'node --check 非零退出'}（疑似截断的恢复件）`)
  }
}

// ── 2. .bundle.ts（de-Vite 反编译参考件，tsconfig 不编、eslint 不查）至少要能解析 ──
for (const f of walk('src').filter((p) => p.endsWith('.bundle.ts'))) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--check', f], {
    encoding: 'utf8'
  })
  if (r.status !== 0) {
    const first = (r.stderr || '').split('\n').find((l) => l.trim().startsWith('SyntaxError'))
    notices.push(`${f}  ← 反编译参考件解析不过（不是源码，只登记）：${first || '见 stderr'}`)
  }
}

// ── 3. manifest 引用的资源必须真的在盘上 ──
for (const mf of walk('extension').filter((p) => p.endsWith('manifest.json'))) {
  let doc
  try {
    doc = JSON.parse(readFileSync(mf, 'utf8'))
  } catch (err) {
    errors.push(`${mf}  ← JSON 解析失败：${err.message}`)
    continue
  }
  const base = path.dirname(mf)
  const refs = new Set()
  for (const v of Object.values(doc.icons || {})) refs.add(v)
  for (const k of [
    'default_popup',
    'default_icon',
    'options_page',
    'service_worker',
    'startup_url'
  ]) {
    if (typeof doc.action?.[k] === 'string') refs.add(doc.action[k])
    if (typeof doc.background?.[k] === 'string') refs.add(doc.background[k])
    if (typeof doc[k] === 'string') refs.add(doc[k])
  }
  for (const js of doc.content_scripts || []) {
    for (const f of js.js || []) refs.add(f)
    for (const f of js.css || []) refs.add(f)
  }
  for (const rel of refs) {
    if (!existsSync(path.join(base, rel))) {
      errors.push(`${mf}  ← 引用了 ${rel}，但文件不在盘上（扩展加载会直接报错）`)
    }
  }
}

// ── 4. 零引用文件清单（只报告）：曾经靠这张表发现截图骨架卡住 pnpm build ──
const ENTRIES = new Set([
  'src/main/index.ts',
  'src/preload/index.ts',
  'src/renderer/main.ts',
  'src/renderer/src/main.ts',
  'src/renderer/src/capture/main.ts',
  'src/renderer/src/capture/App.vue'
])
const candidates = walk('src').filter(
  (p) =>
    /\.m?ts$|\.vue$/.test(p) &&
    !p.endsWith('.bundle.ts') &&
    !p.endsWith('.d.ts') &&
    !p.includes('__tests__') &&
    !p.includes(`${path.sep}migrations${path.sep}`) &&
    !ENTRIES.has(p)
)
// 被引用 = 出现在别的文件的 import/export-from/require 说明符里，或（.vue）以组件标签出现
const allFiles = [...walk('src'), ...walk('e2e'), ...walk('scripts'), ...walk('plugins')]
const texts = new Map()
for (const p of [...allFiles, 'electron.vite.config.ts', 'package.json']) {
  try {
    texts.set(p, readFileSync(p, 'utf8'))
  } catch {
    /* 二进制或权限问题：跳过 */
  }
}
const refSets = new Map() // 文件 → 它引用到的模块名集合
for (const [p, t] of texts) {
  const names = new Set()
  for (const m of t.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
    names.add(path.basename(m[1]).replace(/\.(m?ts|js|json|vue)$/, ''))
  }
  for (const m of t.matchAll(/require\(\s*['"]([^'"]+)['"]/g)) {
    names.add(path.basename(m[1]).replace(/\.(m?ts|cjs|js|json)$/, ''))
  }
  for (const m of t.matchAll(/<([A-Z][\w]*)[\s/>]/g)) names.add(m[1]) // 组件标签用法
  refSets.set(p, names)
}
for (const f of candidates) {
  const stem = path.basename(f).replace(/\.(mts|ts|vue)$/, '')
  if (stem === 'index' || stem === 'main') continue // 桶文件/入口按目录引用，名字判不准
  let referenced = false
  for (const [p, names] of refSets) {
    if (p === f) continue // 自己引用自己不算
    if (names.has(stem)) {
      referenced = true
      break
    }
  }
  if (!referenced) notices.push(`${f}  ← 全仓无人 import（排期中的骨架？还是又一件死文件？）`)
}

for (const line of notices) console.log('提示  ' + line)
if (errors.length) {
  for (const line of errors) console.error('错误  ' + line)
  console.error(`\n源码完整性检查失败：${errors.length} 项`)
  process.exit(1)
}
console.log(
  `源码完整性检查通过：解析 ${jsFiles.length} 个 JS/MJS/CJS + 扩展 manifest 资源齐全` +
    (notices.length ? `；另有 ${notices.length} 条提示（不挡门）` : '')
)
