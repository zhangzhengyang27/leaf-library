<script setup lang="ts">
/**
 * M1 图片标注 overlay：贴在预览 img 正上方的一层交互面（消费端）。
 *
 * 职责分界：状态机与坐标换算全在 useAnnotationOverlay（可单测），这里只画——
 *  - 已有 rect 标注：描边框 + hover 显示 body，点一下选中，已选中再点弹改词框；
 *  - 拖拽新建：任意方向拖出矩形（归一化），小于 ANNOTATION_MIN_SIDE 的拖拽忽略；
 *  - 内联输入框：Enter 保存（create/update）、Esc 取消，样式沿用预览层输入框 token。
 *
 * 定位：根元素贴住 img 的 getBoundingClientRect（缩放/平移后同样成立），已知的框
 * 用百分比定位跟随；增删改直接调 window.api.annotations.*，成功后 emit('refresh')
 * 请父层（PhotoPreview）重载列表——父层改动保持最小。
 */
import { ref } from 'vue'
import type { PhotoAnnotation } from '@shared/annotations'
import { useAnnotationOverlay } from '../composables/useAnnotationOverlay'

const props = defineProps<{
  photoId: string
  /** img 的自然尺寸（@load 时由 PhotoPreview 写入）——rect 是源图像素，换算全靠它 */
  nat: { w: number; h: number }
  annotations: PhotoAnnotation[]
  /** img 元素本体：拖拽换算按它的实时显示矩形来 */
  imgEl: HTMLImageElement | null
  /** 以下四组是「会影响 img 显示矩形」的响应式量，仅用于触发重新贴位 */
  displayScale: number
  panX: number
  panY: number
  stageW: number
  stageH: number
}>()

const emit = defineEmits<{ refresh: [] }>()

const rootEl = ref<HTMLElement | null>(null)

const overlay = useAnnotationOverlay(
  {
    photoId: () => props.photoId,
    nat: () => props.nat,
    annotations: () => props.annotations,
    imgEl: () => props.imgEl,
    // 数组 getter 引用全部信号量：任一变化都会触发 watch（flush: 'post'）重新贴位
    syncSignals: () => [
      props.displayScale,
      props.panX,
      props.panY,
      props.stageW,
      props.stageH,
      props.nat.w,
      props.nat.h,
      props.imgEl
    ],
    onRefresh: () => emit('refresh')
  },
  rootEl
)

// 模板的 ref="editorInputRef" 只认顶层绑定：从 composable 解构出来（仍是同一个 ref 对象，
// composable 里的自动聚焦 watch 才能拿到这个元素）
const { editorInputRef } = overlay

defineExpose({
  /** Esc 优先级第一级：输入框开着就先关输入框（返回是否关了） */
  cancelEditorIfOpen: overlay.cancelEditorIfOpen
})
</script>

<template>
  <!-- 根元素不设 z-index：DOM 序在 HUD 之前，缩放 HUD / 标注键仍可点；
       cursor-crosshair 表明「标注模式下左键是框选不是平移」 -->
  <div
    ref="rootEl"
    class="absolute cursor-crosshair select-none touch-none"
    :style="overlay.rootStyle.value"
    data-annotation-overlay
    @pointerdown="overlay.onRootPointerDown"
  >
    <!-- 已有标注框：hover 提示 body；选中态琥珀色，未选中天蓝细框 -->
    <div
      v-for="a in overlay.rectList.value"
      :key="a.id"
      class="group absolute border"
      :class="
        overlay.selectedId.value === a.id
          ? 'border-amber-400 bg-amber-400/15'
          : 'border-sky-400/90 bg-sky-400/5 hover:bg-sky-400/15'
      "
      :style="overlay.rectStylePct(a.rect)"
      @pointerdown.stop="overlay.onBoxPointerDown(a, $event)"
    >
      <span
        class="pointer-events-none absolute bottom-full left-0 mb-1 hidden max-w-[220px] truncate rounded bg-black/85 px-1.5 py-0.5 text-[11px] text-white group-hover:block"
        >{{ a.body }}</span
      >
      <!-- 删除键只在选中时出现；pointerdown.stop 防止触发选框/拖拽 -->
      <button
        v-if="overlay.selectedId.value === a.id"
        type="button"
        class="absolute -right-2.5 -top-2.5 flex size-5 items-center justify-center rounded-full bg-red-500/90 text-[11px] leading-none text-white hover:bg-red-500"
        :aria-label="`删除标注：${a.body}`"
        @pointerdown.stop
        @click.stop="overlay.removeAnnotation(a.id)"
      >
        ✕
      </button>
    </div>

    <!-- 拖拽中的草稿框（源图像素坐标，按百分比贴回显示层） -->
    <div
      v-if="overlay.draft.value"
      class="pointer-events-none absolute border border-dashed border-amber-300 bg-amber-300/10"
      :style="overlay.rectStylePct(overlay.draft.value)"
    ></div>

    <!-- 内联输入框：新建填词 / 已有改词共用；pointerdown.stop 免得点进输入框被当成「点空白」收掉 -->
    <div
      v-if="overlay.editor.value"
      class="absolute z-20 flex items-center gap-1 rounded-md bg-black/80 p-1 shadow-xl backdrop-blur-sm"
      :style="overlay.editorStyle.value"
      @pointerdown.stop
    >
      <input
        ref="editorInputRef"
        v-model="overlay.editor.value.body"
        type="text"
        data-annotation-editor
        class="h-7 w-52 rounded bg-white/10 px-2 text-xs text-white placeholder-white/30 outline-none focus:bg-white/15"
        :placeholder="
          overlay.editor.value.mode === 'create' ? '给这个区域写点什么' : '修改批注内容'
        "
        @keydown.enter.prevent="overlay.commitEditor"
        @keydown.esc.stop.prevent="overlay.closeEditor"
      />
      <button
        type="button"
        class="shrink-0 rounded bg-white/10 px-1.5 py-1 text-[11px] text-white/80 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="overlay.busy.value"
        @click="overlay.commitEditor"
      >
        保存
      </button>
    </div>
  </div>
</template>
