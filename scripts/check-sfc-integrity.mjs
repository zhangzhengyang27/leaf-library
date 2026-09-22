/**
 * SFC 完整性检查：把 vue-tsc 看不见的「模板段残缺」变成红灯。
 *
 * 为什么需要它：2026-09-21 误删后的恢复件里有一批 .vue 只回来一半——script 完整、
 * template 在元素中间截断（TitleBar.vue 一度只剩 289 B）。vue-tsc 对这种文件不报错
 * （解析器容错，最多报「无默认导出」），单测也只在真的 import 到它时才炸，
 * 于是「typecheck 全绿 + 一跑就 SyntaxError: Unexpected EOF in tag」。
 *
 * 用仓库自己的 @vue/compiler-sfc 真解析 + 真编译每个 .vue，
 * 三个硬条件：parse 无错、script setup 能生成默认导出、模板编译无错。
 */
import { createRequire } from 'node:module'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
// pnpm 的严格布局不把它提到顶层，按 .pnpm 目录解析
const sfcDir = readdirSync('node_modules/.pnpm').find((d) => d.startsWith('@vue+compiler-sfc@'))
if (!sfcDir) {
  console.error('找不到 @vue/compiler-sfc（先 pnpm install）')
  process.exit(1)
}
const sfc = require(path.resolve(`node_modules/.pnpm/${sfcDir}/node_modules/@vue/compiler-sfc`))

function collect(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e)
    if (e === 'node_modules') continue
    if (statSync(p).isDirectory()) collect(p, out)
    else if (p.endsWith('.vue')) out.push(p)
  }
  return out
}

const files = collect(process.argv[2] || 'src')
const bad = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const where = (msg) => `${f}  ← ${msg}`
  let descriptor
  try {
    const parsed = sfc.parse(src, { filename: f })
    if (parsed.errors.length) throw new Error(`parse: ${parsed.errors[0].message}`)
    descriptor = parsed.descriptor
  } catch (err) {
    bad.push(where(String(err.message).split('\n')[0]))
    continue
  }
  const { template, script, scriptSetup } = descriptor
  if (!template && !script && !scriptSetup) {
    bad.push(where('空 SFC（无 template 也无 script）'))
    continue
  }
  if (script || scriptSetup) {
    try {
      const compiled = sfc.compileScript(descriptor, { id: path.basename(f) })
      if (!/export default/.test(compiled.content)) bad.push(where('无默认导出（script 段被截断？）'))
    } catch (err) {
      bad.push(where(`compileScript: ${String(err.message).split('\n')[0]}`))
    }
  }
  if (template) {
    const t = sfc.compileTemplate({ source: template.content, filename: f, id: 'check' })
    if (t.errors.length) {
      bad.push(where(`模板: ${t.errors.map((e) => e.message || e).join(' / ')}`.slice(0, 180)))
    }
  }
}

console.log(`.vue 共 ${files.length} 个，编译不过 ${bad.length} 个`)
for (const b of bad) console.log('  ' + b)
process.exit(bad.length ? 1 : 0)
