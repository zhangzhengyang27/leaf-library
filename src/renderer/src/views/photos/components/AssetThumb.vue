<template>
  <!-- M3：整体包一层 relative 根容器——本组件模板是多分支碎片，各调用方容器未必
       relative（列表行小缩略图/自由网格），徽标需要确定贴住缩略图自身的定位上下文 -->
  <div class="relative h-full w-full">
    <!-- 位图/SVG/PDF：缩略图；生成失败（thumbStatus=2，如 PSD）→ 扩展名徽章兜底 -->
    <div
      v-if="photo.kind === 'image' && photo.thumbStatus === 2"
      class="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-rose-50 to-slate-200 dark:from-gray-800 dark:to-slate-900"
    >
      <span class="text-4xl">🖼️</span>
      <span class="mt-1 max-w-[90%] truncate px-1 text-[10px] text-gray-500">
        {{ fileExtension.toUpperCase() }}
      </span>
    </div>
    <img
      v-else-if="photo.kind === 'image'"
      :key="thumbRetryKey"
      :src="thumbFailed ? THUMB_PLACEHOLDER : thumbSrc"
      :alt="photo.fileName"
      :class="thumbSizeCls"
      loading="lazy"
      @error="handleImageError"
    />

    <!-- 视频：抽帧缩略图 + 悬停即播（六期） + 播放角标 + 时长 -->
    <div
      v-else-if="photo.kind === 'video'"
      class="relative w-full h-full"
      @mouseenter="hoverPlay = true"
      @mouseleave="hoverPlay = false"
    >
      <video
        v-if="hoverPlay"
        :src="videoUrl"
        muted
        autoplay
        loop
        playsinline
        class="w-full h-full object-cover"
        @error="hoverPlay = false"
      />
      <img
        v-else
        :key="thumbRetryKey"
        :src="thumbFailed ? THUMB_PLACEHOLDER : `thumb://256/${photo.id}`"
        :alt="photo.fileName"
        :class="thumbSizeCls"
        loading="lazy"
        @error="handleImageError"
      />
      <span
        v-if="durationLabel"
        class="absolute bottom-2.5 right-[5px] flex h-5 items-center rounded border border-black/20 bg-black/50 px-1 font-mono text-[12px] leading-none text-white"
      >
        {{ durationLabel }}
      </span>
    </div>

    <!-- 音频卡片 -->
    <div
      v-else-if="photo.kind === 'audio'"
      class="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-800 dark:to-teal-900/60"
    >
      <span class="text-4xl">🎵</span>
      <span v-if="durationLabel" class="mt-1 text-[10px] text-gray-500 dark:text-gray-300">
        {{ durationLabel }}
      </span>
    </div>

    <!-- 字体卡片 -->
    <div
      v-else-if="photo.kind === 'font'"
      class="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-200 dark:from-gray-800 dark:to-gray-900"
    >
      <span class="text-4xl font-serif text-gray-700 dark:text-gray-200">Aa</span>
      <span class="mt-1 max-w-[90%] truncate px-1 text-[10px] text-gray-500">
        {{ fontDisplayName }}
      </span>
    </div>

    <!-- 书签卡片（六期）：🌐 + 标题 + 域名 -->
    <div
      v-else-if="photo.kind === 'bookmark'"
      class="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-sky-50 to-indigo-100 dark:from-gray-800 dark:to-indigo-900/60"
    >
      <span class="text-4xl">🌐</span>
      <span
        class="max-w-[90%] truncate px-1 text-[11px] font-medium text-gray-600 dark:text-gray-200"
      >
        {{ bookmarkTitle }}
      </span>
      <span class="max-w-[90%] truncate px-1 text-[10px] text-gray-400">{{ bookmarkDomain }}</span>
    </div>

    <!-- 十五轮 D16 + 二十一轮：文本内容预览卡（Eagle：暗色面板底 + 加粗标题 + 正文预览） -->
    <div
      v-else-if="isTextFile && textContent"
      class="h-full w-full overflow-hidden bg-white p-2.5 dark:bg-surface-2"
    >
      <p class="mb-1 truncate text-[13px] font-bold leading-tight text-gray-800 dark:text-gray-100">
        {{ textTitle }}
      </p>
      <pre
        class="line-clamp-6 whitespace-pre-wrap break-all font-sans text-[11px] leading-snug text-gray-600 dark:text-gray-300"
        >{{ textContent }}</pre
      >
    </div>

    <!-- 兜底文件卡片 -->
    <div
      v-else
      class="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 dark:from-gray-800 dark:to-slate-900"
    >
      <span class="text-3xl">📄</span>
      <span
        class="mt-1 rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-gray-600 dark:text-gray-300"
      >
        {{ fileExtension }}
      </span>
    </div>

    <!-- M3（Eagle「标注数」）：卡片标注计数徽标（开关开 + 条数 >0 才渲染）。
         左下角：避让上缘的处理中/丢失角标与右缘的时长/预览钮；
         底色圆角照 PhotoGridOverlay 既有角标范式（黑底白字小胶囊）。 -->
    <span
      v-if="showAnnotationBadge"
      data-test="annotation-count-badge"
      class="absolute bottom-1.5 left-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-black/55 px-1 font-mono text-[10px] leading-none text-white"
      :title="`${annotationCount} 条标注`"
    >
      {{ annotationCount }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch, onUnmounted } from 'vue'
import { CODE_EXTENSIONS, isFontFile, TEXT_EXTENSIONS } from '@shared/assetTypes'
import { mediaUrl } from '@renderer/utils/mediaPath'
import type { Photo } from '../../../types/photo'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import { usePhotoData } from '../composables/usePhotoData'

const props = withDefaults(
  defineProps<{
    photo: Photo
    /** 瀑布流模式：保持原始宽高比 */
    natural?: boolean
    /** 列表行内小缩略图：object-cover 且关闭缩放动画 */
    cover?: boolean
  }>(),
  { natural: false, cover: false }
)

// —— 六期：视频卡片悬停即播（video:// 协议，与 PhotoPreview 同构造） ——
const hoverPlay = ref(false)

/** 缩略图尺寸类：一律 object-cover 填满容器。
 *  二十一轮：瀑布流曾用 h-auto 保持原始比例，但缩略图实际高度与容器固定高度
 *  常差 1-2px，底部露缝导致选中环悬空（Eagle：边框紧贴图片）；
 *  容器宽高已按素材比例计算，cover 的裁切量不足 1px，无感知。 */
const thumbSizeCls = computed(() => {
  return 'w-full h-full object-cover'
})

const videoUrl = computed(() => {
  return mediaUrl('video', props.photo.filePath)
})

const THUMB_PLACEHOLDER =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3C/svg%3E'

/** 加载失败先显示占位图，之后两条路径会触发重试：
 *  1. replacePhotoLocal 换入新 photo 对象（缩略图/EXIF 回填完成等增量更新）
 *  2. 延时退避重试（thumb:// 是协议层按需生成，瞬时失败如生成队列忙，
 *     没有任何状态推送通道，只能自愈式重试；上限 2 次防永久坏文件反复请求） */
const thumbFailed = ref(false)
/** 变更 key 强制重建 img 元素重新发起加载（thumb:// URL 不变，仅换 src 不会触发请求） */
const thumbRetryKey = ref(0)
let thumbRetryTimer: number | undefined
let thumbRetryCount = 0

const retryThumb = (): void => {
  thumbFailed.value = false
  thumbRetryKey.value++
}

const handleImageError = (): void => {
  thumbFailed.value = true
  if (thumbRetryCount >= 2 || props.photo.thumbStatus === 2) return
  thumbRetryCount++
  if (thumbRetryTimer !== undefined) clearTimeout(thumbRetryTimer)
  thumbRetryTimer = window.setTimeout(() => {
    thumbRetryTimer = undefined
    if (!thumbFailed.value) return
    if (props.photo.thumbStatus === 2) return
    retryThumb()
  }, 5000)
}

watch(
  () => props.photo,
  (next) => {
    thumbRetryCount = 0 // 换入新对象 = 管线已有更新，重置重试预算
    if (!thumbFailed.value) return
    // thumbStatus=2 是最终失败态（有徽章兜底分支接管），其余情况重试加载
    if (next && next.thumbStatus !== 2) retryThumb()
  }
)

onUnmounted(() => {
  if (thumbRetryTimer !== undefined) clearTimeout(thumbRetryTimer)
})

const durationLabel = computed(() => {
  const ms = props.photo.durationMs
  if (!ms) return ''
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`
})

// ---- 字体真实名（fontkit，组件级 reactive 缓存，带上限避免无限增长） ----
const FONT_CACHE_MAX = 500
const fontNameCache = reactive(new Map<string, string>())

function cacheFontName(id: string, name: string): void {
  if (fontNameCache.size >= FONT_CACHE_MAX) {
    const oldest = fontNameCache.keys().next().value
    if (oldest !== undefined) fontNameCache.delete(oldest)
  }
  fontNameCache.set(id, name)
}

// 异步请求放在 watch（computed 不允许副作用/异步），结果写回 reactive 缓存驱动重算
const fallbackFontName = (fileName: string): string =>
  fileName.replace(/\.(ttf|otf|woff2?|ttc)$/i, '').replace(/[-_]/g, ' ')

const fontDisplayName = computed(() => {
  const photo = props.photo
  if (!isFontFile(photo.fileName)) return ''
  return fontNameCache.get(photo.id) ?? fallbackFontName(photo.fileName)
})

watch(
  () => props.photo.id,
  () => {
    const photo = props.photo
    if (!isFontFile(photo.fileName) || fontNameCache.has(photo.id)) return
    cacheFontName(photo.id, fallbackFontName(photo.fileName))
    void window.api.photos
      .fontInfo(photo.filePath)
      .then((info) => {
        if (info?.familyName) {
          const label =
            info.subfamilyName && !/^regular$/i.test(info.subfamilyName)
              ? `${info.familyName} ${info.subfamilyName}`
              : info.familyName
          cacheFontName(photo.id, label)
        }
      })
      .catch(() => {})
  },
  { immediate: true }
)

// —— 六期：书签卡片字段（文件名形如 `${ts}_${title}.png`） ——
const bookmarkTitle = computed(() =>
  props.photo.fileName.replace(/\.png$/i, '').replace(/^\d+_/, '')
)
const bookmarkDomain = computed(() => {
  try {
    return new URL(props.photo.sourceUrl ?? '').hostname
  } catch {
    return ''
  }
})

const fileExtension = computed(() => {
  const idx = props.photo.fileName.lastIndexOf('.')
  return idx >= 0 ? props.photo.fileName.slice(idx + 1) : 'file'
})

// —— ④-4（Eagle 4 文件列表选项）：GIF/WebP 自动播放 ——
// 开：缩略图直接用原图（浏览器原生持续动图）；关（默认）：静态 thumb://，悬停才动。
// 读全局显示配置（Eagle 该选项为全局行为，不做文件夹覆盖）。
const tabs = useLibraryTabs()
const isAnimated = computed(
  () => props.photo.kind === 'image' && /\.(gif|webp)$/i.test(props.photo.fileName)
)
const thumbSrc = computed(() => {
  if (isAnimated.value && tabs.active.display.autoPlayGif) {
    return mediaUrl('image', props.photo.filePath)
  }
  return `thumb://256/${props.photo.id}`
})

// —— M3（Eagle「标注数」）：卡片标注计数徽标 ——
// 计数由 usePhotoData 在各内容池落地后经 annotations:count 批量拉取（模块单例），
// 组件只读那张 Map，不逐卡发 IPC；开关关着或条数为 0 都不渲染（Eagle 默认关闭）。
const { annotationCounts } = usePhotoData()
const annotationCount = computed(() => annotationCounts.value.get(props.photo.id) ?? 0)
const showAnnotationBadge = computed(
  () => tabs.active.display.showAnnotationCount && annotationCount.value > 0
)

// —— 十五轮 D16：文本内容预览（kind=file/text 且文本扩展名；懒加载 + 组件级缓存；F4 起支持 text kind） ——
// 代码类也走文本卡（用户拍板）：库里 3,547 条源码素材原先是一片相同的 📄+扩展名，
// 认不出哪张是哪张。xml/sh 现在都在 CODE_EXTENSIONS 里，不必再手写。
// 读法不变：只取首 8KB 的前 400 字符，组件级 LRU 300 条封顶。
const TEXT_EXTS = new Set([...TEXT_EXTENSIONS, ...CODE_EXTENSIONS])
const isTextFile = computed(
  () =>
    (props.photo.kind === 'file' || props.photo.kind === 'text') &&
    TEXT_EXTS.has(fileExtension.value.toLowerCase())
)

/** 文本卡标题（Eagle：文件名去扩展名加粗置顶） */
const textTitle = computed(() => {
  const i = props.photo.fileName.lastIndexOf('.')
  return i > 0 ? props.photo.fileName.slice(0, i) : props.photo.fileName
})

const TEXT_CACHE_MAX = 300
const textCache = reactive(new Map<string, string | null>())
/** undefined=非文本卡/未加载完成；null=读取失败（回退兜底卡） */
const textContent = computed(() => (isTextFile.value ? textCache.get(props.photo.id) : undefined))

watch(
  () => props.photo.id,
  () => {
    const photo = props.photo
    if (!isTextFile.value || textCache.has(photo.id)) return
    textCache.set(photo.id, null)
    void window.api.photos
      // 只取首屏片段（8KB ≈ 数百汉字），避免为 400 字符的卡片读整个 1MB 文件
      .readTextFile(photo.filePath, 8192)
      .then((r) => {
        textCache.set(photo.id, r.ok ? r.content.slice(0, 400) : null)
      })
      .catch(() => textCache.set(photo.id, null))
    // 缓存上限：淘汰最早写入的条目
    if (textCache.size > TEXT_CACHE_MAX) {
      const oldest = textCache.keys().next().value
      if (oldest !== undefined) textCache.delete(oldest)
    }
  },
  { immediate: true }
)
</script>
