<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { ICON_SIZES } from '../assets/eagle-icons/icon-sizes'

/**
 * Eagle 提取图标渲染器（assets/eagle-icons/）。
 *
 * Eagle 的 UI 图标为单色 SVG/PNG（fill #F7F8F8 系），统一用 CSS mask + background-color
 * 渲染：颜色取 currentColor（可用 Tailwind text-* 覆盖），随亮暗主题自动切换，无需双份资产。
 * 少数多色图标（标签色点等）在 MULTI_COLOR 白名单内，用 <img> 保留原色。
 *
 * 资产清单：icons/ 为工具栏·菜单·弹层 SVG，masks/ 为侧栏·内容类型 PNG（Eagle 原版的
 * .fake-svg 遮罩体系）。同名时优先 icons/。
 *
 * 尺寸（对齐 Eagle 原生显示行为）：
 * - 不传 size → SVG 按 svg 声明的画布尺寸渲染（ic-toolbar-* 为 24 画布、主体 16），
 *   masks/ 按 Eagle .fake-svg 的 20px 盒渲染（画布 40，ink 约 70-80%）。
 * - 显式传 size → 精确使用（密集小场景：搜索前缀、chips、行内箭头等）。
 */

const iconUrls = import.meta.glob<string>('../assets/eagle-icons/icons/**/*.{svg,png}', {
  eager: true,
  query: '?url',
  import: 'default'
})
const maskUrls = import.meta.glob<string>('../assets/eagle-icons/masks/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
})

interface IconEntry {
  url: string
  /** icons = SVG 资产；masks = 侧栏遮罩 PNG */
  kind: 'icons' | 'masks'
}

// 键 = 去扩展名的相对路径（如 "ic_add"、"context-menu/ic-rename"、"player/ic-toolbar-play"）。
// 子目录图标额外注册裸 basename，但浅层同名优先（icons/ic-tag-remove 胜过 context-menu/ic-tag-remove）。
const manifest: Record<string, IconEntry> = {}
const register = (relPath: string, url: string, kind: IconEntry['kind']): void => {
  const key = relPath.replace(/\.(svg|png)$/, '')
  if (!manifest[key]) manifest[key] = { url, kind }
  const short = key.split('/').pop()!
  if (!manifest[short]) manifest[short] = { url, kind }
}
// 先注册浅层文件（icons/ic-xxx 直接叫 xxx），再注册子目录（context-menu/…），保证裸名归属浅层
const entries = [
  ...Object.entries(iconUrls).map(
    ([p, u]) => [p.replace('../assets/eagle-icons/icons/', ''), u, 'icons'] as const
  ),
  ...Object.entries(maskUrls).map(
    ([p, u]) => [p.replace('../assets/eagle-icons/masks/', ''), u, 'masks'] as const
  )
].sort((a, b) => a[0].split('/').length - b[0].split('/').length)
for (const [path, url, kind] of entries) register(path, url, kind as IconEntry['kind'])

// 多色图标：色相是语义的一部分（标签颜色点），不能被 currentColor 染色
const MULTI_COLOR = new Set([
  'ic-tag-aqua',
  'ic-tag-blue',
  'ic-tag-green',
  'ic-tag-orange',
  'ic-tag-pink',
  'ic-tag-purple',
  'ic-tag-red',
  'ic-tag-yellow',
  'ic-eagle-logo'
])

const MASK_BOX = 20
const FALLBACK_SIZE = 16

interface Props {
  icon: string
  /** 缺省时按 Eagle 原生行为取图标画布尺寸（masks 取 20px 盒） */
  size?: string | number
  color?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: undefined,
  color: 'currentColor'
})

const attrs = useAttrs()

const resolved = computed<{ entry: IconEntry; key: string } | null>(() => {
  const hit = manifest[props.icon]
  return hit ? { entry: hit, key: props.icon } : null
})

/** Eagle 原生尺寸：icons/ 用 svg 画布尺寸，masks/ 用 20px 盒 */
const nativeSize = computed<number>(() => {
  if (!resolved.value) return FALLBACK_SIZE
  if (resolved.value.entry.kind === 'masks') return MASK_BOX
  return ICON_SIZES[resolved.value.key]?.[0] ?? FALLBACK_SIZE
})

const isMultiColor = computed(() => MULTI_COLOR.has(props.icon))

const iconStyle = computed(() => {
  const px = props.size !== undefined ? (typeof props.size === 'number' ? `${props.size}px` : props.size) : `${nativeSize.value}px`
  const style: Record<string, string> = {
    width: px,
    height: px,
    flexShrink: '0',
    display: 'inline-block',
    verticalAlign: 'middle'
  }
  if (!resolved.value || isMultiColor.value) return style

  // url() 必须带引号：内联 data URL 含未转义的 `(`，裸写会导致整条声明被 CSSOM 拒绝
  const image = `url("${resolved.value.entry.url}")`
  style.maskImage = image
  style.maskSize = 'contain'
  style.maskRepeat = 'no-repeat'
  style.maskPosition = 'center'
  style.backgroundColor = props.color
  return style
})

const mergedClass = computed(() => {
  const classes = ['eagle-icon']
  if (attrs.class) {
    if (typeof attrs.class === 'string') {
      classes.push(attrs.class)
    } else if (Array.isArray(attrs.class)) {
      classes.push(...attrs.class)
    }
  }
  return classes.join(' ')
})

if (import.meta.env.DEV && !resolved.value) {
  console.warn(`[AppIcon] 未知 Eagle 图标: "${props.icon}"`)
}
</script>

<template>
  <img
    v-if="resolved && isMultiColor"
    :class="mergedClass"
    :style="iconStyle"
    :src="resolved.entry.url"
    alt=""
  />
  <span v-else :class="mergedClass" :style="iconStyle" />
</template>
