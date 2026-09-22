/**
 * Leaf 素材库 · AI 批量摘要与打标（DeepSeek，D-017 之后的能力面）
 *
 * 主进程串行跑（单并发 + 200 条上限），这里只管三件事：
 * 触发前的成本确认、进度流、跑完刷新素材。
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

  return { progress, run, bind }
}

type AiBatch = ReturnType<typeof build>

let singleton: AiBatch | null = null

export function useAiBatch(): AiBatch {
  if (!singleton) singleton = build()
  return singleton
}
