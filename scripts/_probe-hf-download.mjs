/** 冷缓存下载验证：直连 huggingface.co 不通时，hf-mirror 能否供 transformers.js 用 */
import { mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const cacheDir = mkdtempSync(join(tmpdir(), 'leaf-hf-cold-'))
const { env, AutoTokenizer, CLIPTextModelWithProjection } = await import('@huggingface/transformers')
env.cacheDir = cacheDir + '/'
if (process.env.HF_ENDPOINT) env.remoteHost = process.env.HF_ENDPOINT.replace(/\/$/, '') + '/'
console.log('remoteHost =', env.remoteHost, ' cacheDir =', cacheDir)

const t0 = Date.now()
try {
  await AutoTokenizer.from_pretrained('Xenova/clip-vit-base-patch32')
  console.log(`tokenizer 下载完成 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  const t1 = Date.now()
  await CLIPTextModelWithProjection.from_pretrained('Xenova/clip-vit-base-patch32', {
    dtype: 'q8'
  })
  console.log(`text 塔 q8 下载完成 ${((Date.now() - t1) / 1000).toFixed(1)}s`)
  const walk = (dir, depth = 0) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p, depth + 1)
      else console.log(`  ${(statSync(p).size / 1048576).toFixed(1)}MB  ${p.replace(cacheDir, '')}`)
    }
  }
  walk(cacheDir)
  console.log('结论：镜像可用')
} catch (err) {
  console.log('结论：失败 →', err.message.split('\n')[0])
} finally {
  rmSync(cacheDir, { recursive: true, force: true })
}
