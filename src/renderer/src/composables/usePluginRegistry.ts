/**
 * Leaf · usePluginRegistry（插件中心 P1，D-025）
 *
 * 渲染层插件单例：全量列表（含禁用）+ enabled 过滤视图 + 乐观启停。
 * 消费方（检查器区块 / 预览格式渲染器）一律读 enabledPlugins——禁用即从
 * 响应式集合消失，对应 UI 即时卸载；主进程持久化保证重启后一致。
 *
 * 乐观语义：setEnabled 先翻本地再发 IPC，失败回滚并 rethrow（调用方 toast）。
 */
import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { ManagedPlugin } from '@shared/plugin'

const plugins = ref<ManagedPlugin[]>([])
const loaded = ref(false)
let inflight: Promise<void> | null = null

async function reload(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      plugins.value = await window.api.plugins.listAll()
      loaded.value = true
    } catch (err) {
      // 后台加载器自吞错误：消费方 onMounted 里 void reload()，reject 只会变成
      // unhandled rejection（实测 13 条）。测试环境 mock 常缺 listAll——静默保持空集。
      console.warn('[usePluginRegistry] 插件列表加载失败:', (err as Error).message)
      loaded.value = true
    } finally {
      inflight = null
    }
  })()
  return inflight
}

async function setEnabled(id: string, enabled: boolean): Promise<void> {
  const prev = plugins.value.find((p) => p.id === id)
  if (!prev) return
  const before = prev.enabled
  prev.enabled = enabled // 乐观
  try {
    const res = await window.api.plugins.setEnabled(id, enabled)
    if (!res.ok) throw new Error(res.error ?? '启停失败')
  } catch (err) {
    prev.enabled = before // 回滚
    throw err
  }
}

export function usePluginRegistry(): {
  plugins: Ref<ManagedPlugin[]>
  enabledPlugins: ComputedRef<ManagedPlugin[]>
  loaded: Ref<boolean>
  reload: () => Promise<void>
  setEnabled: (id: string, enabled: boolean) => Promise<void>
} {
  return {
    plugins,
    enabledPlugins: computed(() => plugins.value.filter((p) => p.enabled)),
    loaded,
    reload,
    setEnabled
  }
}
