/**
 * 标注消费端收尾 · 检查器 ↔ 预览 overlay 的选中联动（极小单例）。
 *
 * 为什么是模块级单例：检查器（PhotoInspector，右栏）与预览 overlay
 * （PhotoAnnotationOverlay，弹窗）分属两棵组件树，props 钻透要穿 index.vue 两层；
 * 照 usePreview / usePhotoData 的模块单例范式，这里只放一个「当前聚焦的标注 id」：
 *  - 检查器列表项 hover/click → set（预览关着时只当列表项自身高亮用，不开预览）；
 *  - overlay 点框选中 → set（预览开着时两边的框/列表项同时高亮）；
 *  - overlay 点空白/拖新框/删除选中项 → clear。
 * 只同步 id，不合并两处各自加载的列表数据源（改动最小原则）。
 */
import { ref } from 'vue'

/** 当前被聚焦的标注 id（null = 无）；跨组件树共享，两端各自按 id 匹配自家列表 */
const activeAnnotationId = ref<string | null>(null)

function setAnnotationFocus(id: string): void {
  activeAnnotationId.value = id
}

function clearAnnotationFocus(): void {
  activeAnnotationId.value = null
}

export function useAnnotationFocus(): {
  activeAnnotationId: typeof activeAnnotationId
  setAnnotationFocus: typeof setAnnotationFocus
  clearAnnotationFocus: typeof clearAnnotationFocus
} {
  return { activeAnnotationId, setAnnotationFocus, clearAnnotationFocus }
}
