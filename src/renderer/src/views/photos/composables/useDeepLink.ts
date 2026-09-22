/**
 * leaf:// 深链的渲染层侧（订阅 + 冷启动补取）
 *
 * 两条路都要走：
 *  - 热启动（app 已开）：主进程 open-url → push `app:deepLink`；
 *  - 冷启动（双击链接把 app 拉起来）：push 到时页面还没 mount，没人听，
 *    所以起来后必须主动 take 一次把暂存的链接取走。
 * 只做其中一条，就会出现"app 开着能跳、没开时点了没反应"这类最难报的 bug。
 *
 * 跳转动作交给调用方注入：素材/文件夹的真实状态都在 index.vue 那侧
 * （展示池、tabs、预览），这里只管"什么时候该跳"。
 */
import { onMounted, onUnmounted } from 'vue'
import type { DeepLinkTarget } from '@shared/deepLink'

export function useDeepLink(onTarget: (target: DeepLinkTarget) => void): void {
  let off: (() => void) | null = null

  onMounted(async () => {
    off = window.api.onAppDeepLink(onTarget)
    // take 是"取走即清"，所以放在订阅之后：中间到达的链接会先被 push 接住
    const pending = await window.api.takeAppDeepLink()
    if (pending) onTarget(pending)
  })

  onUnmounted(() => {
    off?.()
    off = null
  })
}
