<template>
  <!-- 处理中角标（右上方；缩略图生成期间的唯一常驻指示） -->
  <div
    v-if="photo.thumbStatus === 0"
    class="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white"
    title="正在生成缩略图与元数据"
  >
    处理中
  </div>

  <!-- F11：断链角标（原文件丢失；右键「重新定位文件…」可修复） -->
  <div
    v-else-if="photo.missingAt"
    class="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-medium text-white"
    title="原文件丢失：可在右键菜单重新定位"
  >
    ⚠ 丢失
  </div>

  <!-- Eagle 式右下角预览角标：hover 时浮现，点击预览。
       用 Eagle 原版 ic-hover-zoom（自带半透明黑底 + 白放大镜，贴角放置、外角随卡片 3px 圆角裁齐）；
       不能用 ic-toolbar-zoom-in——那是查看器工具栏的纯加号缩放件，不是预览语义 -->
  <button
    v-if="mode === 'normal'"
    type="button"
    class="absolute bottom-0 right-0 flex opacity-0 transition-opacity duration-fast group-hover:opacity-100 hover:brightness-125"
    title="预览"
    aria-label="预览"
    @click.stop="$emit('preview')"
  >
    <AppIcon icon="ic-hover-zoom" :size="28" />
  </button>

  <!-- 回收站模式：恢复按钮 -->
  <button
    v-if="mode === 'trash'"
    type="button"
    class="absolute bottom-2 right-2 rounded-md bg-white/90 px-3 py-1.5 text-sm font-medium text-gray-800 opacity-0 transition-opacity duration-fast group-hover:opacity-100 hover:bg-white"
    @click.stop="$emit('restore')"
  >
    恢复
  </button>
</template>

<script setup lang="ts">
import AppIcon from '@components/AppIcon.vue'
import type { Photo } from '../../../types/photo'

withDefaults(
  defineProps<{
    photo: Photo
    selected: boolean
    mode: 'normal' | 'trash'
    /** 兼容旧 API：Eagle 复刻后不再使用底部横栏 */
    showBar?: boolean
  }>(),
  { showBar: false }
)

defineEmits<{
  restore: []
  preview: []
}>()
</script>
