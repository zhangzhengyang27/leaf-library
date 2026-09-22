#!/usr/bin/env node
/**
 * AI（CLIP 语义搜索）运行环境检查（六期交付）。
 *
 * 背景：EmbeddingService 链路完整，但 x64 Mac 缺 onnxruntime 原生二进制只能优雅降级
 * （详见 docs/素材库待办清单.md 中优先级项）。本脚本输出当前机器能否启用真实 CLIP，
 * 供「真机调优」前快速判断，无需启动应用。
 *
 * 用法：node scripts/check-ai-env.mjs
 */
import { existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const platform = process.platform
const arch = process.arch

console.log(`平台: ${platform}/${arch}  Node ${process.version}`)

let ortDir
try {
  ortDir = join(require.resolve('onnxruntime-node/package.json'), '..', 'bin', 'napi-v6')
} catch {
  // pnpm 严格布局下 onnxruntime-node 是 transformers.js 的传递依赖，从 .pnpm store 找
  const pnpmDir = join(process.cwd(), 'node_modules', '.pnpm')
  const entry = existsSync(pnpmDir)
    ? readdirSync(pnpmDir).find((d) => d.startsWith('onnxruntime-node@'))
    : undefined
  if (!entry) {
    console.log('onnxruntime-node: 未安装（transformers.js 的可选依赖缺失）')
    process.exit(0)
  }
  ortDir = join(pnpmDir, entry, 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6')
}

const platformDir = join(ortDir, platform)
const hasPlatform = existsSync(platformDir)
const variants = hasPlatform ? readdirSync(platformDir) : []
const hasCurrentArch = variants.includes(arch)

console.log(
  `onnxruntime-node bin/napi-v6/${platform}: ${hasPlatform ? variants.join(', ') : '（无）'}`
)

if (hasCurrentArch) {
  console.log('✅ 当前架构有原生二进制——真实 CLIP 可用，可进行语义搜索真机调优：')
  console.log('   1) 启动应用 → 素材库 AI 搜索应不再降级；2) 全库建索引进度；3) 中文检索质量评估')
  console.log('   （不达标换 jina-clip 系模型：替换 ClipEmbedder 的 modelId 与分词）')
} else {
  console.log('❌ 当前架构无原生二进制——AI 语义搜索将维持优雅降级（预期行为，非 bug）')
  console.log(
    '   解冻条件：换 Apple Silicon 机器，或 onnxruntime 发布该架构预编译包后 pnpm up onnxruntime-node'
  )
}
