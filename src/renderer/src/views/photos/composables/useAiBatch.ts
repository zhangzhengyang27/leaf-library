/**
 * Leaf 素材库 · AI 批量摘要与打标（DeepSeek 文本链，D-017；视觉链，M3 看图工作流）
 *
 * 主进程串行跑（单并发 + 200 条上限），这里只管三件事：
 * 触发前的成本确认、进度流、跑完刷新素材。
 * run() 走文本链（正文/OCR）；runVision() 位图走视觉链（带缩略图请求）、
 * 其余并到文本链，两段串行、确认与用量合并。
 */
import { ref } from 'vue'
import { useToast } from '@composables/useToast'
import { useDialogs } from './useDialogs'
import { usePhotoData } from './usePhotoData'

const progress = ref<{ done: number; total: number } | null>(null)
let running = false

function build() {
  const toast = useToast()
  const { requestConfirm } = useDialogs()
  const data = usePhotoData()

  /** 订阅主进程进度（index.vue 挂载时绑定一次） */
  function bind(): () => void {
    return window.api.ai.onBatch((p) => {
      progress.value = p.phase === 'running' ? { done: p.done, total: p.total } : null
    })
  }

  function run(ids: string[]): void {
    if (running || ids.length === 0) return
    requestConfirm(
      'AI 批量摘要与标签',
      `将对 ${ids.length} 个素材逐个调用 DeepSeek（每条一次请求，最多 200 条）。` +
        '\n\n只有带正文或 OCR 文字的素材会被处理；描述为空时才写入摘要，已有备注不覆盖；' +
        '标签按同名复用、重复跑不会长重复行。',
      '开始',
      async () => {
        running = true
        progress.value = { done: 0, total: Math.min(ids.length, 200) }
        try {
          const r = await window.api.ai.batchMeta(ids)
          await data.loadPhotos()
          const parts = [`已生成 ${r.done} 条`]
          if (r.skipped) parts.push(`无文字跳过 ${r.skipped}`)
          if (r.failed) parts.push(`失败 ${r.failed}`)
          if (r.requested < ids.length)
            parts.push(`超上限，本次只处理 ${r.requested}/${ids.length}`)
          // token 数按 API 回的 usage 累加：这是唯一能就地看见成本的地方
          const used = r.tokens.prompt + r.tokens.completion
          toast.success(parts.join(' · '), {
            description:
              used > 0
                ? `消耗 ${used.toLocaleString()} tokens（输入 ${r.tokens.prompt.toLocaleString()} / 输出 ${r.tokens.completion.toLocaleString()}）`
                : undefined
          })
        } catch (error) {
          toast.error('批量摘要失败', { description: (error as Error).message })
        } finally {
          running = false
          progress.value = null
        }
      }
    )
  }

  /**
   * M3 看图工作流：位图走视觉链（每条带一次缩略图请求），其余素材走文本链，
   * 两段串行、成本确认与 token 用量合并成一次。visionIds 由调用方按 kind==='image'
   * 筛好，且只在视觉模型已配置时才会被调用（入口门禁在 index.vue）。
   */
  function runVision(visionIds: string[], textIds: string[]): void {
    if (running || (visionIds.length === 0 && textIds.length === 0)) return
    const visionCount = Math.min(visionIds.length, 200)
    const textCount = Math.min(textIds.length, 200)
    const routes: string[] = []
    if (visionCount) routes.push(`${visionCount} 张图片走视觉模型`)
    if (textCount) routes.push(`${textCount} 个素材走文本模型`)
    const scope = routes.join('，')
    requestConfirm(
      'AI 摘要与标签',
      `将对 ${scope}（每条一次请求，最多 200 条）。` +
        '\n\n看图打标只把库内缩略图（≤768px）发给模型，原图不出库；' +
        '描述为空时才写入摘要，已有备注不覆盖；标签按同名复用、重复跑不会长重复行。',
      '开始',
      async () => {
        running = true
        // 预置合并总数让 chip 立即出现；两段各自的 running 事件会先后接管计数
        progress.value = { done: 0, total: visionCount + textCount }
        try {
          let done = 0
          let skipped = 0
          let failed = 0
          let prompt = 0
          let completion = 0
          for (const [fn, ids] of [
            [window.api.ai.batchVision, visionIds],
            [window.api.ai.batchMeta, textIds]
          ] as const) {
            if (ids.length === 0) continue
            const r = await fn(ids)
            done += r.done
            skipped += r.skipped
            failed += r.failed
            prompt += r.tokens.prompt
            completion += r.tokens.completion
          }
          await data.loadPhotos()
          const parts = [`已生成 ${done} 条`]
          if (skipped) parts.push(`跳过 ${skipped}`)
          if (failed) parts.push(`失败 ${failed}`)
          const used = prompt + completion
          toast.success(parts.join(' · '), {
            description:
              used > 0
                ? `消耗 ${used.toLocaleString()} tokens（输入 ${prompt.toLocaleString()} / 输出 ${completion.toLocaleString()}）`
                : undefined
          })
        } catch (error) {
          toast.error('批量打标失败', { description: (error as Error).message })
        } finally {
          running = false
          progress.value = null
        }
      }
    )
  }

  return { progress, run, runVision, bind }
}

type AiBatch = ReturnType<typeof build>

let singleton: AiBatch | null = null

export function useAiBatch(): AiBatch {
  if (!singleton) singleton = build()
  return singleton
}
