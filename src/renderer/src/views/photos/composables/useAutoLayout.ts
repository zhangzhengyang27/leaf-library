/**
 * useAutoLayout · 自适应布局解析（D-012，对齐 Eagle「自适应」布局方式）
 *
 * 布局方式选「自适应」时按内容区宽度在 网格/列表 间自动切换：
 * 宽 ≥640 → 网格；< 640 → 列表。
 * 二十一轮：瀑布流布局移除（用户决策），宽屏不再落入瀑布流。
 * ResizeObserver 监听内容区容器；宽度为 0（视图隐藏/切换）时保持上次结果。
 */
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export type EffectiveLayout = 'grid' | 'list'

export function useAutoLayout(container: Ref<HTMLElement | null>): Ref<EffectiveLayout> {
  const effective = ref<EffectiveLayout>('grid')
  let observer: ResizeObserver | null = null

  onMounted(() => {
    if (!container.value) return
    observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      if (w <= 0) return
      effective.value = w >= 640 ? 'grid' : 'list'
    })
    observer.observe(container.value)
  })
  onBeforeUnmount(() => observer?.disconnect())

  return effective
}
