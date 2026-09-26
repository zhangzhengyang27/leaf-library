/**
 * M1 图片标注 overlay 的状态机与坐标换算（消费端，形状单源在 @shared/annotations）。
 *
 * 为什么单独拆一个 composable：PhotoPreview 是 2100 行巨石，实施计划（M1 纪律）要求
 * overlay 逻辑独立、坐标换算可单测——rect 存的是**源图像素**，显示层按缩放比换算，
 * 这是最容易踩错的点，所以换算函数全部从这里导出给单测直打。
 *
 * 坐标口径（一处换算处处复用）：
 *  - 屏幕 → 源图：`imgPx = (clientX - imgRectLeft) * natW / imgRectWidth`，
 *    用 img 的 getBoundingClientRect（变换后的结果）按比例折算，对任意 scale/pan 都成立；
 *  - 源图 → 显示：overlay 根元素贴住 img 显示矩形，框用百分比定位，天然跟随缩放平移。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { useToast } from '@composables/useToast'
import {
  normalizeAnnotationInput,
  ANNOTATION_MIN_SIDE,
  type AnnotationRect,
  type PhotoAnnotation
} from '@shared/annotations'

/** getBoundingClientRect 的最小形状（真 DOM 与 happy-dom 都满足），纯函数只认这个 */
export interface RectLike {
  left: number
  top: number
  width: number
  height: number
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * 屏幕(client)坐标 → 源图像素坐标。
 *
 * 用 img 的显示矩形折算而不是 stage 坐标硬算：显示矩形本身就是
 * `translate(pan) scale(displayScale)` 之后的最终结果，比例关系在任意缩放/平移下
 * 都成立。出界点钳回图内——拖拽可以拖出图边，但标注必须落在原图坐标系里
 * （主进程校验拒绝负坐标，与其让它报错不如在源头钳住）。
 */
export function clientToImagePoint(
  clientX: number,
  clientY: number,
  imgRect: RectLike,
  natW: number,
  natH: number
): { x: number; y: number } {
  // 任一尺寸不可用（图没真正显示 / nat 还没写入）都退 0 点，不能除零出 NaN
  if (!(natW > 0) || !(natH > 0) || !(imgRect.width > 0) || !(imgRect.height > 0)) {
    return { x: 0, y: 0 }
  }
  return {
    x: clamp((clientX - imgRect.left) * (natW / imgRect.width), 0, natW),
    y: clamp((clientY - imgRect.top) * (natH / imgRect.height), 0, natH)
  }
}

/** 拖拽矩形归一化：任意方向拖（含从右下往左上）→ x/y 恒为左上角、w/h 非负 */
export function normalizeDragRect(x1: number, y1: number, x2: number, y2: number): AnnotationRect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1)
  }
}

/** 小于最小边（源图像素）的拖拽不算框选：点按空白、手抖都不该留下一个点 */
export function isRectTooSmall(r: AnnotationRect): boolean {
  return r.w < ANNOTATION_MIN_SIDE || r.h < ANNOTATION_MIN_SIDE
}

/**
 * atMs → 进度百分比（0~100）。时长不可用（0 / NaN / 负）时恒 0，
 * 刻度是否渲染由调用方按「时长可用 && 有标注」决定——不在这里硬造位置。
 */
export function atMsToPercent(atMs: number, durationSec: number): number {
  if (!Number.isFinite(atMs) || !Number.isFinite(durationSec) || atMs < 0 || !(durationSec > 0)) {
    return 0
  }
  return clamp((atMs / 1000 / durationSec) * 100, 0, 100)
}

/** 带有 rect 的标注（渲染框用；TS 收窄用谓词，模板里不必再 `!`） */
export type RectAnnotation = PhotoAnnotation & { rect: AnnotationRect }

export interface AnnotationOverlayDeps {
  photoId: () => string
  nat: () => { w: number; h: number }
  /** 该素材的全部标注（含纯文字 / atMs 条目，这里自己滤 rect） */
  annotations: () => PhotoAnnotation[]
  /** img 元素：拖拽换算按它的实时显示矩形来（overlay 自身盒子只管贴位） */
  imgEl: () => HTMLImageElement | null
  /** 任何会影响 img 显示矩形的响应式量（displayScale / pan / stageSize / nat），变了就重新贴位 */
  syncSignals: () => unknown[]
  /** 增删改成功后请父层重载列表 */
  onRefresh: () => void
}

/** useAnnotationOverlay 的返回面（显式列出让 lint 满意，也方便组件侧解构时对型） */
export interface AnnotationOverlayApi {
  box: Ref<{ left: number; top: number; width: number; height: number }>
  rootStyle: ComputedRef<Record<string, string>>
  selectedId: Ref<string | null>
  draft: Ref<AnnotationRect | null>
  busy: Ref<boolean>
  editor: Ref<{
    mode: 'create' | 'update'
    annotationId?: string
    rect: AnnotationRect
    body: string
  } | null>
  editorInputRef: Ref<HTMLInputElement | null>
  editorStyle: ComputedRef<Record<string, string>>
  rectList: ComputedRef<RectAnnotation[]>
  syncBox: () => void
  rectStylePct: (rect: AnnotationRect) => Record<string, string>
  onRootPointerDown: (e: PointerEvent) => void
  onBoxPointerDown: (a: RectAnnotation, e: PointerEvent) => void
  removeAnnotation: (id: string) => Promise<void>
  commitEditor: () => Promise<void>
  closeEditor: () => void
  cancelEditorIfOpen: () => boolean
}

/**
 * overlay 的全部交互状态：贴位盒子、拖拽新建、选中、内联输入框（新建/改词共用）、增删改。
 * 组件（PhotoAnnotationOverlay.vue）只负责把这些状态画出来。
 */
export function useAnnotationOverlay(
  deps: AnnotationOverlayDeps,
  rootEl: Ref<HTMLElement | null>
): AnnotationOverlayApi {
  const toast = useToast()

  /** overlay 根元素相对 stage 的盒子（贴住 img 的显示矩形；stage 是定位上下文） */
  const box = ref({ left: 0, top: 0, width: 0, height: 0 })
  const selectedId = ref<string | null>(null)
  /** 拖拽进行中的草稿框（已是源图像素、已归一化） */
  const draft = ref<AnnotationRect | null>(null)
  /** IPC 在飞：挡住连按 Enter 重复建条 */
  const busy = ref(false)

  interface EditorState {
    mode: 'create' | 'update'
    annotationId?: string
    rect: AnnotationRect
    body: string
  }
  /** 内联输入框（新建填词 / 已有改词共用一个）；null = 没开 */
  const editor = ref<EditorState | null>(null)
  const editorInputRef = ref<HTMLInputElement | null>(null)

  const rectList = computed<RectAnnotation[]>(() =>
    deps.annotations().filter((a): a is RectAnnotation => a.rect !== undefined)
  )

  /** 让根元素盒子贴住 img 的显示矩形：两个 getBoundingClientRect 相减（stage 为参照） */
  function syncBox(): void {
    const root = rootEl.value
    const img = deps.imgEl()
    const host = root?.parentElement
    if (!root || !img || !host) return
    const imgRect = img.getBoundingClientRect()
    const hostRect = host.getBoundingClientRect()
    if (!(imgRect.width > 0) || !(imgRect.height > 0)) return
    box.value = {
      left: imgRect.left - hostRect.left,
      top: imgRect.top - hostRect.top,
      width: imgRect.width,
      height: imgRect.height
    }
  }

  // flush: 'post'——必须在 img 的 style 落到 DOM 之后再量，否则量到的是上一帧
  watch(deps.syncSignals, () => syncBox(), { flush: 'post' })
  onMounted(() => syncBox())

  /** 源图像素 → overlay 内的百分比定位样式（overlay 盒子贴住整图，百分比即贴住缩放） */
  function rectStylePct(rect: AnnotationRect): Record<string, string> {
    const { w: nw, h: nh } = deps.nat()
    if (!(nw > 0) || !(nh > 0)) return { display: 'none' }
    return {
      left: `${(rect.x / nw) * 100}%`,
      top: `${(rect.y / nh) * 100}%`,
      width: `${(rect.w / nw) * 100}%`,
      height: `${(rect.h / nh) * 100}%`
    }
  }

  // getter 显式标注返回类型：联合分支会被 TS 归一化出 `x?: undefined`，与 index signature 对不上
  const rootStyle = computed((): Record<string, string> => ({
    left: `${box.value.left}px`,
    top: `${box.value.top}px`,
    width: `${box.value.width}px`,
    height: `${box.value.height}px`
  }))

  // —— 内联输入框的锚定：默认挂在矩形下方 6px，放不下改上方，横向钳在 overlay 内 ——
  const EDITOR_W = 272
  const EDITOR_H = 44
  const editorStyle = computed((): Record<string, string> => {
    const st = editor.value
    const { w: nw, h: nh } = deps.nat()
    const { width: bw, height: bh } = box.value
    if (!st || !(nw > 0) || !(nh > 0) || !(bw > 0) || !(bh > 0)) return { display: 'none' }
    const r = {
      left: (st.rect.x / nw) * bw,
      top: (st.rect.y / nh) * bh,
      width: (st.rect.w / nw) * bw,
      height: (st.rect.h / nh) * bh
    }
    let top = r.top + r.height + 6
    if (top + EDITOR_H > bh && r.top - EDITOR_H - 6 >= 0) top = r.top - EDITOR_H - 6
    return {
      left: `${clamp(r.left, 0, Math.max(0, bw - EDITOR_W))}px`,
      top: `${Math.max(0, top)}px`
    }
  })

  // 编辑框开着就自动聚焦，省一次点击
  watch(editor, async (st) => {
    if (!st) return
    await nextTick()
    editorInputRef.value?.focus()
  })

  function closeEditor(): void {
    editor.value = null
  }

  /** Esc 优先级的第一级（PhotoPreview 的全局键盘层调）：输入框开着就先关它 */
  function cancelEditorIfOpen(): boolean {
    if (!editor.value) return false
    closeEditor()
    return true
  }

  function openEditorFor(a: RectAnnotation): void {
    editor.value = { mode: 'update', annotationId: a.id, rect: { ...a.rect }, body: a.body }
  }

  // —— 拖拽新建 ——
  let stopDrag: (() => void) | null = null
  onBeforeUnmount(() => stopDrag?.())

  function teardownDrag(): void {
    stopDrag?.()
    stopDrag = null
    draft.value = null
  }

  function beginDrag(start: { x: number; y: number }, imgRect: RectLike): void {
    const nat = deps.nat()
    const onMove = (ev: PointerEvent): void => {
      const p = clientToImagePoint(ev.clientX, ev.clientY, imgRect, nat.w, nat.h)
      draft.value = normalizeDragRect(start.x, start.y, p.x, p.y)
    }
    const onUp = (ev: PointerEvent): void => {
      const p = clientToImagePoint(ev.clientX, ev.clientY, imgRect, nat.w, nat.h)
      const rect = draft.value ?? normalizeDragRect(start.x, start.y, p.x, p.y)
      teardownDrag()
      // 小于最小边的拖拽当没发生（点按空白 = 取消选中）
      if (isRectTooSmall(rect)) {
        selectedId.value = null
        return
      }
      editor.value = { mode: 'create', rect, body: '' }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    stopDrag = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      draft.value = null
    }
  }

  /** overlay 空白处按下：有输入框先收输入框，否则开始框选拖拽 */
  function onRootPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return
    if (editor.value) {
      closeEditor() // 点图上其它地方 = 放弃当前输入
      return
    }
    const img = deps.imgEl()
    if (!img) return
    const imgRect = img.getBoundingClientRect()
    if (!(imgRect.width > 0) || !(imgRect.height > 0)) return
    const start = clientToImagePoint(e.clientX, e.clientY, imgRect, deps.nat().w, deps.nat().h)
    selectedId.value = null
    beginDrag(start, imgRect)
  }

  /** 点已有框：第一击选中，已选中再点弹改词框（✕ 删除键自己 stop，不走这里） */
  function onBoxPointerDown(a: RectAnnotation, e: PointerEvent): void {
    if (e.button !== 0) return
    e.stopPropagation()
    if (editor.value?.annotationId === a.id) return // 正在这个框里改词，别打断输入
    if (editor.value) closeEditor()
    if (selectedId.value === a.id) openEditorFor(a)
    else selectedId.value = a.id
  }

  // —— 增删改（直接调 window.api，成功后 emit refresh 请父层重载，PhotoPreview 改动最小）——

  async function removeAnnotation(id: string): Promise<void> {
    const photoId = deps.photoId()
    if (!photoId || busy.value) return
    busy.value = true
    try {
      const r = await window.api.annotations.remove(id, photoId)
      if (!r.ok) {
        toast.error('没能删除标注', { description: r.error })
        return
      }
      if (selectedId.value === id) selectedId.value = null
      deps.onRefresh()
    } catch (error) {
      toast.error('没能删除标注', { description: (error as Error).message })
    } finally {
      busy.value = false
    }
  }

  /** Enter：新建走 create、改词走 update；空内容直接收框（不当成报错刷屏） */
  async function commitEditor(): Promise<void> {
    const st = editor.value
    const photoId = deps.photoId()
    if (!st || !photoId || busy.value) return
    const body = st.body.trim()
    if (!body) {
      closeEditor()
      return
    }
    // 渲染层即时反馈用 shared 的同一份校验（主进程仍会复核）：错误文案从这里出
    const check = normalizeAnnotationInput({ body, rect: st.rect })
    if (!check.ok) {
      toast.error('标注没存上', { description: check.error })
      return
    }
    busy.value = true
    try {
      const r =
        st.mode === 'create'
          ? await window.api.annotations.create(photoId, check.value)
          : await window.api.annotations.update(st.annotationId ?? '', photoId, check.value)
      if (!r.ok) {
        toast.error('标注没存上', { description: r.error ?? '保存失败' })
        return
      }
      closeEditor()
      deps.onRefresh()
    } catch (error) {
      toast.error('标注没存上', { description: (error as Error).message })
    } finally {
      busy.value = false
    }
  }

  return {
    // 状态
    box,
    rootStyle,
    selectedId,
    draft,
    busy,
    editor,
    editorInputRef,
    editorStyle,
    rectList,
    // 方法
    syncBox,
    rectStylePct,
    onRootPointerDown,
    onBoxPointerDown,
    removeAnnotation,
    commitEditor,
    closeEditor,
    cancelEditorIfOpen
  }
}
