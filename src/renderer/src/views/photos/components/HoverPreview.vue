<script setup lang="ts">
/**
 * HoverPreview · 单卡缩略图 + 悬停预览层（代码审查：hover 态组件边界隔离）。
 *
 * 旧实现把 hovered 挂在 PhotoGrid 组件级 ref，v-for 卡片模板全部引用它，
 * 鼠标划过任意卡片都会触发整个网格（数百节点）重渲染。
 * 这里把 hover 状态收进单个卡片子组件：悬停只重渲染本卡片，兄弟卡片零开销。
 */
import { ref } from 'vue'
import AssetThumb from './AssetThumb.vue'
import { mediaUrl } from '@renderer/utils/mediaPath'
import type { Photo } from '../../../types/photo'

const props = withDefaults(
  defineProps<{
    photo: Photo
    /** 瀑布流模式：保持原始宽高比 */
    natural?: boolean
  }>(),
  { natural: false }
)

const hovered = ref(false)

const isGif = (p: Photo): boolean => p.kind === 'image' && /\.gif$/i.test(p.fileName)
const gifSrc = (p: Photo): string => mediaUrl('image', p.filePath)
const audioSrc = (p: Photo): string => mediaUrl('video', p.filePath)
</script>

<template>
  <div class="relative h-full w-full" @mouseenter="hovered = true" @mouseleave="hovered = false">
    <AssetThumb :photo="photo" :natural="props.natural" />
    <!-- §2.D GIF 悬停动图预览 -->
    <img
      v-if="hovered && isGif(photo)"
      :src="gifSrc(photo)"
      class="absolute inset-0 size-full object-cover"
      alt=""
    />
    <!-- §2.D 音频悬停即播（video:// 支持音频） -->
    <audio
      v-if="hovered && photo.kind === 'audio'"
      :src="audioSrc(photo)"
      autoplay
      loop
      class="absolute inset-x-0 bottom-0 z-10 w-full"
    />
  </div>
</template>
