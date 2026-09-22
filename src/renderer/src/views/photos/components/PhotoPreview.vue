<template>
  <div
    v-if="photo"
    class="photo-preview fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-5"
    @click.self="$emit('close')"
    @mousemove="onBriefMouseMove"
  >
    <div class="max-w-7xl w-full h-full flex flex-col">
      <!-- 工具栏（简报模式下隐藏） -->
      <div v-if="!briefMode" class="flex justify-between items-center mb-4 text-white">
        <div class="flex items-center gap-4">
          <button
            class="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            @click="$emit('close')"
          >
            ✕ 关闭
          </button>
          <button
            class="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            :disabled="!hasPrevious"
            @click="handlePrevious"
          >
            ← 上一张
          </button>
          <button
            class="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            :disabled="!hasNext"
            @click="handleNext"
          >
            下一张 →
          </button>
        </div>
        <div class="flex items-center gap-4">
          <!-- 评分 -->
          <div class="flex items-center gap-1" title="评分">
            <button
              v-for="star in 5"
              :key="star"
              class="text-xl leading-none transition-colors"
              :class="star <= (hoverRating ?? photo.rating) ? 'text-amber-400' : 'text-white/30'"
              @click="$emit('set-rating', photo.id, star === photo.rating ? 0 : star)"
              @mouseenter="hoverRating = star"
              @mouseleave="hoverRating = null"
            >
              ★
            </button>
          </div>
          <button
            :class="[
              'px-4 py-2 rounded-lg transition-colors',
              photo.isFavorite
                ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                : 'bg-white/20 text-white hover:bg-white/30'
            ]"
            @click="$emit('toggle-favorite', photo.id)"
          >
            {{ photo.isFavorite ? '⭐ 已收藏' : '☆ 收藏' }}
          </button>
          <button
            class="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors"
            title="在图库中查找与这张图相似的图片"
            @click="$emit('find-similar', photo.id)"
          >
            🔍 找相似
          </button>
          <button
            class="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors"
            title="根据内容为文件命名"
            :disabled="aiNaming"
            @click="handleSuggestName"
          >
            {{ aiNaming ? '命名中…' : '✨ AI 命名' }}
          </button>
          <button
            :class="[
              'px-4 py-2 rounded-lg transition-colors',
              slideshow
                ? 'bg-brand-500 text-white hover:bg-brand-600'
                : 'bg-white/20 text-white hover:bg-white/30'
            ]"
            :disabled="props.photos.length <= 1"
            :title="slideshow ? '停止幻灯片' : '幻灯片播放（每 3 秒切换）'"
            @click="toggleSlideshow"
          >
            {{ slideshow ? '⏸ 停止' : '▶ 幻灯片' }}
          </button>
          <button
            class="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors"
            title="将这张图设为桌面壁纸"
            @click="handleSetWallpaper"
          >
            🖼️ 设为壁纸
          </button>
          <button
            class="px-4 py-2 bg-red-500/80 hover:bg-red-600 text-white rounded-lg transition-colors"
            @click="handleDelete"
          >
            🗑️ 从库中移除
          </button>
        </div>
      </div>

      <!-- 图片显示区域 -->
      <div class="flex-1 flex flex-col items-center justify-center overflow-hidden gap-2">
        <div class="flex min-h-0 items-center justify-center">
          <!-- 视频：video:// 播放 -->
          <video
            v-if="isVideo"
            ref="videoRef"
            :key="photo.id"
            :src="mediaUrl"
            :class="grayscale ? 'grayscale' : ''"
            controls
            autoplay
            class="max-w-full max-h-full"
          />
        </div>
        <!-- 六期：视频逐帧步进 / 倍速 -->
        <div v-if="isVideo" class="flex items-center gap-2 text-white">
          <button
            class="rounded bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20"
            title="后退一帧（1/30s）"
            @click="stepFrame(-1)"
          >
            ⏮ 帧−
          </button>
          <button
            class="rounded bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20"
            title="前进一帧（1/30s）"
            @click="stepFrame(1)"
          >
            帧+ ⏭
          </button>
          <button
            class="rounded bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20"
            title="切换播放速度"
            @click="cyclePlaybackRate"
          >
            {{ playbackRateLabel }}
          </button>
        </div>
        <!-- 音频：卡片 + 播放器 -->
        <div v-else-if="isAudio" class="w-full max-w-lg text-center">
          <div class="text-8xl mb-8">🎵</div>
          <audio :key="photo.id" :src="mediaUrl" controls class="w-full" />
        </div>
        <!-- 字体：FontFace 样张（rawfile:// 加载原文件） -->
        <div
          v-else-if="isFontAsset"
          class="w-full h-full overflow-y-auto bg-white/5 rounded-xl p-8 text-white"
        >
          <p class="mb-6 text-sm text-gray-300">
            {{ fontRealName ?? photo.fileName }}
          </p>
          <p class="text-5xl font-medium break-all" :style="fontSampleStyle">AaBbCc 0123</p>
          <p class="text-3xl mt-6 break-all" :style="fontSampleStyle">永远相信美好的事情即将发生</p>
          <p class="text-xl mt-6 break-all" :style="fontSampleStyle">
            The quick brown fox jumps over the lazy dog. 0123456789
          </p>
          <!-- ⑤（Eagle 4.0 字体预览）：字形表——抽样字符逐个检测，缺字形标红 -->
          <button
            type="button"
            class="mt-6 rounded bg-white/10 px-3 py-1 text-xs text-gray-200 hover:bg-white/20"
            @click="toggleGlyphGrid"
          >
            {{ glyphGridOpen ? '收起字形表' : '字形表（查缺失字）' }}
          </button>
          <div v-if="glyphGridOpen" class="mt-3">
            <p class="mb-2 text-[11px] text-gray-400">
              {{
                glyphScanning
                  ? '检测中…'
                  : `ASCII + 常用汉字抽样 ${glyphChars.length} 字，缺字形 ${glyphMissingCount} 字标红`
              }}
            </p>
            <div class="grid max-h-72 grid-cols-[repeat(auto-fill,28px)] gap-0.5 overflow-y-auto">
              <span
                v-for="(ch, i) in glyphChars"
                :key="i"
                class="flex h-7 w-7 items-center justify-center rounded-sm text-[15px]"
                :class="glyphMissingSet.has(i) ? 'bg-red-500/25 text-red-300' : 'text-gray-200'"
                :style="fontSampleStyle"
                :title="`U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`"
                >{{ ch }}</span
              >
            </div>
          </div>
        </div>
        <!-- 书签（六期）：截图存档 + 标题 + 打开原链接 -->
        <div
          v-else-if="isBookmark"
          class="flex w-full max-w-3xl flex-col items-center gap-4 text-white"
        >
          <img
            v-if="photo.thumbStatus === 1"
            :src="`thumb://1024/${photo.id}`"
            :alt="photo.fileName"
            class="max-h-[46vh] rounded-lg shadow-2xl"
          />
          <p class="max-w-full truncate px-4 text-lg font-medium">{{ bookmarkTitle }}</p>
          <button
            class="max-w-full truncate rounded bg-white/10 px-4 py-1.5 text-sm text-blue-300 hover:bg-white/20"
            :title="photo.sourceUrl ?? ''"
            @click="openBookmarkUrl"
          >
            🔗 {{ photo.sourceUrl }}
          </button>
          <p v-if="photo.description" class="max-w-2xl text-sm text-gray-300">
            {{ photo.description }}
          </p>
        </div>
        <!-- F18：ZIP 内容浏览（Eagle 压缩包浏览；按需提取 ≤10MB 图片/文本项） -->
        <div v-else-if="isZip" class="flex h-full w-full max-w-4xl flex-col gap-2">
          <div class="flex items-center justify-between text-sm">
            <span class="truncate text-gray-300">{{ photo.fileName }}</span>
            <span class="shrink-0 text-xs text-gray-400">
              ZIP · {{ zipEntries.length }} 项<span v-if="zipEntries.length > 500"
                >（仅列出前 500）</span
              >
            </span>
          </div>
          <div class="flex min-h-0 flex-1 gap-2">
            <div class="min-h-0 w-72 shrink-0 overflow-y-auto rounded-lg bg-black/30 p-1">
              <button
                v-for="e in zipEntries.slice(0, 500)"
                :key="e.name"
                type="button"
                class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors"
                :class="
                  zipSelected === e.name
                    ? 'bg-white/15 text-white'
                    : 'text-gray-300 hover:bg-white/10'
                "
                @click="onZipEntry(e)"
              >
                <span class="shrink-0">{{ e.isDir ? '📁' : '📄' }}</span>
                <span class="min-w-0 flex-1 truncate">{{ e.name }}</span>
                <span class="shrink-0 text-[10px] text-gray-500">{{ fmtZipSize(e.size) }}</span>
              </button>
            </div>
            <div class="flex min-h-0 flex-1 items-center justify-center rounded-lg bg-black/40 p-3">
              <img
                v-if="zipPreview && zipPreview.mime.startsWith('image/')"
                :src="zipPreview.dataUrl"
                class="max-h-full max-w-full rounded"
                alt="zip entry"
              />
              <pre
                v-else-if="zipPreview"
                class="max-h-full w-full overflow-auto whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed text-gray-100"
                >{{ zipPreview.text }}</pre
              >
              <p v-else-if="zipMsg" class="text-xs text-gray-400">{{ zipMsg }}</p>
              <p v-else class="text-xs text-gray-500">选择左侧文件预览（图片/文本，≤10MB）</p>
            </div>
          </div>
        </div>
        <!-- F4：文本 / Markdown / HTML 预览（Eagle 文本素材预览） -->
        <div v-else-if="isTextAsset" class="flex h-full w-full max-w-4xl flex-col gap-2">
          <div class="flex items-center justify-between text-sm">
            <span class="truncate text-gray-300">{{ photo.fileName }}</span>
            <span class="shrink-0 text-xs text-gray-400">{{ fileExt.toUpperCase() }}</span>
          </div>
          <!-- HTML：禁脚本的沙箱 iframe（用户本地文件，仍不加 same-origin） -->
          <iframe
            v-if="isHtmlDoc && textContent"
            sandbox=""
            :srcdoc="htmlPreviewContent"
            class="min-h-0 flex-1 rounded-lg border-0 bg-white"
            title="HTML 预览"
          />
          <div
            v-else-if="isMarkdown && textContent"
            class="leaf-md min-h-0 flex-1 overflow-y-auto rounded-lg bg-white p-6 text-[14px] leading-relaxed text-gray-800"
            v-html="renderedMarkdown"
          />
          <pre
            v-else-if="textContent !== null"
            class="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-5 font-mono text-[13px] leading-relaxed text-gray-100"
            >{{ textContent }}</pre
          >
          <div v-else-if="textTooLarge" class="text-center text-white">
            <div class="text-6xl">📃</div>
            <p class="mt-3 text-sm text-gray-400">文件过大（超过 1MB），不支持预览</p>
          </div>
          <div v-else class="text-center text-white">
            <p class="text-sm text-gray-400">文件读取失败，可双击用系统程序打开</p>
          </div>
        </div>
        <!-- 阶段 5.1：格式预览插件（按扩展名注册的渲染器，沙箱 iframe） -->
        <div
          v-else-if="formatPlugin && textPreview"
          class="flex h-full w-full max-w-4xl flex-col rounded-xl bg-white/5 p-4 text-white"
        >
          <div class="mb-2 flex items-center justify-between text-sm">
            <span class="truncate text-gray-300">{{ textPreview.fileName }}</span>
            <span class="shrink-0 text-xs text-gray-400">
              {{ textPreview.ext }} · {{ formatPlugin.name }}
            </span>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto rounded-lg bg-white/10 p-1">
            <PluginSandbox :plugin="formatPlugin" :payload="textPreview" :height="320" />
          </div>
        </div>
        <!-- 兜底文件 -->
        <div v-else-if="isGenericFile" class="text-center text-white">
          <div class="text-8xl mb-4">📄</div>
          <p class="text-lg">{{ photo.fileName }}</p>
          <p class="mt-2 text-sm text-gray-400">该类型暂不支持预览，可双击用系统程序打开</p>
        </div>
        <!-- 阶段 4.3：PDF/AI 多页预览（pdfjs 渲染 + 翻页） -->
        <div v-else-if="isPdf" class="flex min-h-0 w-full flex-1 flex-col items-center gap-3">
          <div class="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
            <canvas
              v-show="!pdfLoading && !pdfError"
              ref="pdfCanvas"
              class="max-h-full max-w-full rounded-lg shadow-2xl"
            />
            <div v-if="pdfLoading" class="text-sm text-gray-300">正在加载 PDF…</div>
            <p v-else-if="pdfError" class="max-w-xl break-all text-center text-sm text-red-300">
              {{ pdfError }}
            </p>
          </div>
          <div v-if="pdfPageCount > 0 && !pdfError" class="flex items-center gap-4 text-white">
            <button
              class="rounded bg-white/10 px-3 py-1 text-xs transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="pdfPage <= 1"
              @click="gotoPdfPage(-1)"
            >
              ‹ 上一页
            </button>
            <span class="text-sm tabular-nums"> {{ pdfPage }} / {{ pdfPageCount }} </span>
            <button
              class="rounded bg-white/10 px-3 py-1 text-xs transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="pdfPage >= pdfPageCount"
              @click="gotoPdfPage(1)"
            >
              下一页 ›
            </button>
          </div>
        </div>
        <img
          v-else
          :src="previewSrc"
          :alt="photo.fileName"
          :class="grayscale ? 'grayscale' : ''"
          class="max-w-full max-h-full object-contain"
          @error="handleImageError"
        />
      </div>

      <!-- 图片信息（简报模式下隐藏） -->
      <div
        v-if="!briefMode"
        class="mt-4 bg-white/10 backdrop-blur-sm rounded-lg p-4 text-white max-h-[38%] overflow-y-auto"
      >
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <div class="text-sm text-gray-300 mb-1">文件名</div>
            <div class="font-medium">{{ photo.fileName }}</div>
          </div>
          <div>
            <div class="text-sm text-gray-300 mb-1">文件大小</div>
            <div class="font-medium">{{ formatFileSize(photo.fileSize) }}</div>
          </div>
          <div v-if="photo.width && photo.height">
            <div class="text-sm text-gray-300 mb-1">尺寸</div>
            <div class="font-medium">{{ photo.width }} × {{ photo.height }}</div>
          </div>
          <div>
            <div class="text-sm text-gray-300 mb-1">
              {{ photo.takenAt ? '拍摄时间' : '文件时间' }}
            </div>
            <div class="font-medium">{{ formatDate(photo.createdAt) }}</div>
          </div>
        </div>

        <!-- EXIF 元数据 -->
        <div class="border-t border-white/10 pt-3">
          <div class="text-sm text-gray-300 mb-2">EXIF</div>
          <div v-if="hasExif" class="grid grid-cols-4 gap-x-6 gap-y-2 text-sm">
            <div v-if="photo.cameraModel">
              <span class="text-gray-400">相机：</span>{{ photo.cameraModel }}
            </div>
            <div v-if="photo.lensModel">
              <span class="text-gray-400">镜头：</span>{{ photo.lensModel }}
            </div>
            <div v-if="photo.iso"><span class="text-gray-400">ISO：</span>{{ photo.iso }}</div>
            <div v-if="photo.aperture">
              <span class="text-gray-400">光圈：</span>f/{{ photo.aperture }}
            </div>
            <div v-if="photo.shutter">
              <span class="text-gray-400">快门：</span>{{ photo.shutter }}
            </div>
            <div v-if="photo.focalLength">
              <span class="text-gray-400">焦距：</span>{{ photo.focalLength }}mm
            </div>
            <div v-if="photo.latitude != null && photo.longitude != null">
              <span class="text-gray-400">GPS：</span>{{ photo.latitude.toFixed(4) }},
              {{ photo.longitude.toFixed(4) }}
            </div>
            <div v-if="cityLabel">
              <span class="text-gray-400">位置：</span>{{ cityLabel }}
              <span class="text-[10px] text-gray-500">© OpenStreetMap</span>
            </div>
          </div>
          <p v-else class="text-xs text-gray-400">
            {{
              photo.thumbStatus === 0
                ? '元数据处理中，EXIF 稍后自动出现在这里。'
                : '未检测到 EXIF 信息（截图/网络图片通常没有）。'
            }}
          </p>
        </div>

        <!-- 描述 -->
        <div class="border-t border-white/10 pt-3 mt-3">
          <div class="text-sm text-gray-300 mb-2 flex items-center justify-between">
            <span>描述</span>
            <!-- 阶段 5.3：AI 描述建议（基于 CLIP 候选标签） -->
            <button
              type="button"
              class="text-xs text-purple-300 hover:text-purple-200 disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="aiDescSuggesting"
              @click="handleSuggestDescription"
            >
              {{ aiDescSuggesting ? '生成中…' : '✨ AI 建议描述' }}
            </button>
          </div>
          <textarea
            v-model="descriptionDraft"
            rows="2"
            placeholder="为这张图添加备注（搜索时可用）..."
            class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-brand-400 resize-none"
            @blur="commitDescription"
          ></textarea>
        </div>

        <!-- 标签 -->
        <div class="border-t border-white/10 pt-3 mt-3">
          <div class="text-sm text-gray-300 mb-2">标签</div>
          <div class="flex flex-wrap gap-2 mb-2">
            <span
              v-for="tag in photo.tags"
              :key="tag"
              class="px-3 py-1 bg-blue-500/50 rounded-full text-sm flex items-center gap-2"
            >
              {{ tag }}
              <button class="hover:text-red-300" @click="$emit('remove-tag', photo.id, tag)">
                ×
              </button>
            </span>
          </div>
          <div class="flex gap-2">
            <input
              v-model="newTag"
              type="text"
              list="photo-tag-suggestions"
              placeholder="添加标签..."
              class="flex-1 px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-brand-400"
              @keyup.enter="handleAddTag"
            />
            <datalist id="photo-tag-suggestions">
              <option v-for="t in tagSuggestions" :key="t" :value="t" />
            </datalist>
            <button
              class="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
              @click="handleAddTag"
            >
              添加
            </button>
            <button
              class="px-4 py-2 bg-purple-500/60 hover:bg-purple-500 rounded-lg transition-colors text-sm"
              :disabled="aiSuggesting"
              title="AI 分析图片内容，给出标签建议"
              @click="handleSuggestTags"
            >
              {{ aiSuggesting ? '分析中…' : '✨ AI 建议' }}
            </button>
          </div>
          <!-- AI 建议结果 -->
          <div v-if="aiSuggestions.length > 0" class="mt-2 flex flex-wrap gap-2 items-center">
            <span class="text-xs text-gray-400">AI 建议：</span>
            <button
              v-for="s in aiSuggestions"
              :key="s.tag"
              class="px-2.5 py-1 rounded-full text-xs bg-purple-500/30 hover:bg-purple-500/60 transition-colors"
              :title="`匹配度 ${(s.score * 100).toFixed(0)}%，点击添加`"
              @click="handleAddSuggested(s.tag)"
            >
              + {{ s.tagName }}
            </button>
          </div>
          <p v-if="aiSuggestError" class="mt-2 text-xs text-red-300">{{ aiSuggestError }}</p>
        </div>
      </div>

      <!-- 简报模式控制栏（Eagle F5：底部半透明计数器+播放控制，鼠标静止自动隐藏） -->
      <div
        v-if="briefMode"
        class="pointer-events-none absolute bottom-0 left-0 right-0 flex items-center justify-center gap-4 bg-gradient-to-t from-black/70 to-transparent px-6 py-4 text-white transition-opacity duration-300"
        :class="briefControlsVisible ? 'opacity-100' : 'opacity-0'"
        @mouseenter="briefControlsVisible = true"
        @mouseleave="resetBriefControlsTimer"
      >
        <button
          class="pointer-events-auto flex size-9 items-center justify-center rounded-full bg-white/15 text-lg transition-colors hover:bg-white/30"
          :disabled="!hasPrevious"
          title="上一张（←）"
          @click="handlePrevious"
        >
          ‹
        </button>
        <button
          class="pointer-events-auto flex size-11 items-center justify-center rounded-full bg-white/20 text-xl transition-colors hover:bg-white/35"
          :title="slideshow ? '暂停（空格）' : '播放（空格）'"
          @click="toggleSlideshow"
        >
          {{ slideshow ? '⏸' : '▶' }}
        </button>
        <button
          class="pointer-events-auto flex size-9 items-center justify-center rounded-full bg-white/15 text-lg transition-colors hover:bg-white/30"
          :disabled="!hasNext"
          title="下一张（→）"
          @click="handleNext"
        >
          ›
        </button>
        <span class="pointer-events-auto ml-2 text-sm text-white/80">
          {{ currentIndex + 1 }} / {{ props.photos.length }}
        </span>
        <span class="pointer-events-auto ml-4 text-xs text-white/50">ESC 退出 · F5 切换简报</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'
import { useToast } from '@composables/useToast'
import { isFontFile } from '@shared/assetTypes'
import type { Photo } from '../../../types/photo'
import { useDialogs } from '../composables/useDialogs'
import { usePhotoActions } from '../composables/usePhotoActions'
import PluginSandbox from '@components/plugins/PluginSandbox.vue'
import { encodeMediaPath } from '@renderer/utils/mediaPath'
import type { InstalledPlugin } from '@renderer/types/plugin'

const actions = usePhotoActions()

const props = withDefaults(
  defineProps<{
    photo: Photo | null
    photos: Photo[]
    /** R5 黑白预览（Eagle ⌘G）：对预览媒体应用灰度滤镜 */
    grayscale?: boolean
    /** 十八轮 P3：简报模式（Eagle F5）——隐藏全部 UI，纯图片全屏展示+自动幻灯片 */
    briefMode?: boolean
  }>(),
  { grayscale: false, briefMode: false }
)

const emit = defineEmits<{
  close: []
  previous: []
  next: []
  'toggle-favorite': [photoId: string]
  'set-rating': [photoId: string, rating: number]
  'set-description': [photoId: string, description: string]
  'add-tag': [photoId: string, tag: string]
  'remove-tag': [photoId: string, tag: string]
  'find-similar': [photoId: string]
  renamed: [photoId: string]
  delete: [photoId: string]
}>()

const newTag = ref('')
const hoverRating = ref<number | null>(null)
const descriptionDraft = ref('')
const tagSuggestions = ref<string[]>([])
const aiSuggestions = ref<Array<{ tag: string; tagName: string; score: number }>>([])
const aiSuggestError = ref('')
const aiSuggesting = ref(false)

/** CLIP 候选标签 → 用户可读短名 */
function candidateShortName(raw: string): string {
  const zh = raw.split(' ')[0]
  return zh || raw
}

async function handleSuggestTags(): Promise<void> {
  if (!props.photo || aiSuggesting.value) return
  aiSuggesting.value = true
  aiSuggestError.value = ''
  aiSuggestions.value = []
  try {
    const result = await window.api.photos.suggestTags(props.photo.id)
    aiSuggestions.value = result.map((r) => ({
      tag: r.tag,
      tagName: candidateShortName(r.tag),
      score: r.score
    }))
    if (result.length === 0) {
      aiSuggestError.value = 'AI 未给出建议（图片元数据尚未就绪或本机推理不可用）'
    }
  } catch (error) {
    aiSuggestError.value = `AI 建议失败：${(error as Error).message}`
  } finally {
    aiSuggesting.value = false
  }
}

function handleAddSuggested(tag: string): void {
  if (!props.photo) return
  emit('add-tag', props.photo.id, candidateShortName(tag))
  aiSuggestions.value = aiSuggestions.value.filter((s) => s.tag !== tag)
}

// —— AI 动作扩展：AI 命名建议（top 标签 + 原名，确认后 renamePhotos） ——
const aiNaming = ref(false)
async function handleSuggestName(): Promise<void> {
  const p = props.photo
  if (!p || aiNaming.value) return
  aiNaming.value = true
  try {
    const name = await window.api.photos.suggestName(p.id)
    if (!name) {
      useToast().info('AI 未给出命名建议', { description: '图片元数据尚未就绪或本机推理不可用' })
      return
    }
    const { requestPrompt } = useDialogs()
    requestPrompt({
      title: 'AI 建议命名',
      label: '新的文件名（含扩展名）',
      initialValue: name,
      onSubmit: async (value) => {
        const trimmed = value.trim()
        if (!trimmed || trimmed === p.fileName) return
        const result = await window.api.photos.renamePhotos([
          { id: p.id, pattern: trimmed, start: 1 }
        ])
        if (result.renamed.length > 0) {
          useToast().success('已重命名', { description: result.renamed[0].fileName })
          emit('renamed', p.id)
        } else if (result.conflicts.length > 0) {
          useToast().error('重命名失败', { description: '同目录下已存在同名文件' })
        }
      }
    })
  } catch (error) {
    useToast().error('AI 命名失败', { description: (error as Error).message })
  } finally {
    aiNaming.value = false
  }
}

// —— 阶段 5.3：AI 描述建议（CLIP 候选标签拼接，写入描述草稿由用户确认） ——
const aiDescSuggesting = ref(false)
async function handleSuggestDescription(): Promise<void> {
  if (!props.photo || aiDescSuggesting.value) return
  aiDescSuggesting.value = true
  try {
    const text = await window.api.photos.suggestDescription(props.photo.id)
    if (text) descriptionDraft.value = text
    else aiSuggestError.value = 'AI 未生成建议（图片元数据尚未就绪或本机推理不可用）'
  } catch (error) {
    aiSuggestError.value = `AI 建议失败：${(error as Error).message}`
  } finally {
    aiDescSuggesting.value = false
  }
}

// 切换图片时同步描述草稿
watch(
  () => props.photo?.id,
  () => {
    descriptionDraft.value = props.photo?.description ?? ''
    hoverRating.value = null
    aiSuggestions.value = []
    aiSuggestError.value = ''
    void loadSuggestions()
  },
  { immediate: true }
)

async function loadSuggestions(): Promise<void> {
  try {
    tagSuggestions.value = await window.api.photos.getAllTags()
  } catch {
    tagSuggestions.value = []
  }
}

const hasExif = computed(() => {
  const p = props.photo
  if (!p) return false
  return Boolean(
    p.cameraModel ||
      p.lensModel ||
      p.iso ||
      p.aperture ||
      p.shutter ||
      p.focalLength ||
      (p.latitude != null && p.longitude != null)
  )
})

const currentIndex = computed(() => {
  if (!props.photo) return -1
  return props.photos.findIndex((p) => p.id === props.photo!.id)
})

const hasPrevious = computed(() => {
  return currentIndex.value > 0
})

const hasNext = computed(() => {
  return currentIndex.value >= 0 && currentIndex.value < props.photos.length - 1
})

const handlePrevious = (): void => {
  if (hasPrevious.value) {
    emit('previous')
  }
}

const handleNext = (): void => {
  if (hasNext.value) {
    emit('next')
  }
}

const handleAddTag = (): void => {
  if (!props.photo || !newTag.value.trim()) return
  const tag = newTag.value.trim()
  if (props.photo.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
    newTag.value = ''
    return
  }
  emit('add-tag', props.photo.id, tag)
  newTag.value = ''
}

// —— §2.D 幻灯片播放 ——
const slideshow = ref(false)
let slideTimer: ReturnType<typeof setInterval> | null = null
const SLIDE_MS = 3000
function startSlideshow(): void {
  if (props.photos.length <= 1) return
  slideshow.value = true
  if (slideTimer) clearInterval(slideTimer)
  slideTimer = setInterval(() => {
    if (!hasNext.value) {
      stopSlideshow()
      return
    }
    emit('next')
  }, SLIDE_MS)
}
function stopSlideshow(): void {
  slideshow.value = false
  if (slideTimer) {
    clearInterval(slideTimer)
    slideTimer = null
  }
}
function toggleSlideshow(): void {
  if (slideshow.value) stopSlideshow()
  else startSlideshow()
}
onUnmounted(stopSlideshow)

// ── 十八轮 P3：简报模式（Eagle F5）控制栏显示/隐藏 + 自动播放 ──

const briefControlsVisible = ref(true)
let briefHideTimer: ReturnType<typeof setTimeout> | null = null

function resetBriefControlsTimer(): void {
  if (briefHideTimer) clearTimeout(briefHideTimer)
  briefControlsVisible.value = true
  briefHideTimer = setTimeout(() => {
    briefControlsVisible.value = false
  }, 2500)
}

function onBriefMouseMove(): void {
  if (props.briefMode) resetBriefControlsTimer()
}

// 简报模式开启时自动开始幻灯片 + 启动控制栏隐藏计时
watch(
  () => props.briefMode,
  (on) => {
    if (on) {
      startSlideshow()
      resetBriefControlsTimer()
    } else {
      stopSlideshow()
      if (briefHideTimer) clearTimeout(briefHideTimer)
      briefControlsVisible.value = true
    }
  },
  { immediate: true }
)

/** 自带 ESC 关闭 + 简报模式键盘导航（← → 切换 / 空格播放暂停 / F5 退出简报） */
function onKeydown(e: KeyboardEvent): void {
  // 输入控件内按 ESC 语义是取消输入，不再穿透关闭整个预览（审查 P3-52）
  if (
    e.key === 'Escape' &&
    !actions.locked.value &&
    !(e.target as HTMLElement | null)?.closest?.('input, textarea, select')
  ) {
    e.preventDefault()
    emit('close')
  } else if (props.briefMode) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      handlePrevious()
      resetBriefControlsTimer()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      handleNext()
      resetBriefControlsTimer()
    } else if (e.key === ' ') {
      e.preventDefault()
      toggleSlideshow()
      resetBriefControlsTimer()
    }
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
onUnmounted(closePdf)

const commitDescription = (): void => {
  if (!props.photo) return
  const next = descriptionDraft.value.trim()
  if ((props.photo.description ?? '') === next) return
  emit('set-description', props.photo.id, next)
}

// ---- 字体预览（三期 P3）：rawfile:// + FontFace 样张 ----

const isFontAsset = computed(() => (props.photo ? isFontFile(props.photo.fileName) : false))
const isVideo = computed(() => props.photo?.kind === 'video')
const isAudio = computed(() => props.photo?.kind === 'audio')

// —— 六期：视频逐帧步进 / 倍速 ——
const videoRef = ref<HTMLVideoElement | null>(null)
const playbackRate = ref(1)
const playbackRateLabel = computed(() =>
  playbackRate.value === 1 ? '1x' : `${playbackRate.value}x`
)

/** 逐帧步进：先暂停再挪 currentTime（假设 30fps） */
function stepFrame(direction: 1 | -1): void {
  const video = videoRef.value
  if (!video) return
  video.pause()
  const frame = 1 / 30
  const next = video.currentTime + direction * frame
  video.currentTime = Math.min(Math.max(0, next), video.duration || next)
}

const PLAYBACK_RATES = [0.5, 1, 2, 4]
function cyclePlaybackRate(): void {
  const video = videoRef.value
  const idx = PLAYBACK_RATES.indexOf(playbackRate.value)
  playbackRate.value = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length]
  if (video) video.playbackRate = playbackRate.value
}
const isGenericFile = computed(() => props.photo?.kind === 'file')

// —— F18：ZIP 内容浏览 ——

// fileExt 必须先于 isZip 声明：下方 watch immediate 会在 setup 期间求值 isZip
const fileExt = computed(() => {
  const name = props.photo?.fileName ?? ''
  const idx = name.lastIndexOf('.')
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : ''
})

const isZip = computed(() => fileExt.value === 'zip')
const zipEntries = ref<Array<{ name: string; size: number; isDir: boolean }>>([])
const zipSelected = ref('')
const zipPreview = ref<{ mime: string; dataUrl: string; text?: string } | null>(null)
const zipMsg = ref('')

function fmtZipSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

watch(
  [() => props.photo?.id, isZip],
  async ([photoId, isZipAsset]) => {
    zipEntries.value = []
    zipSelected.value = ''
    zipPreview.value = null
    zipMsg.value = ''
    if (!photoId || !isZipAsset) return
    try {
      const res = await window.api.photos.listZipEntries(photoId)
      // 竞态守卫（审查 P2-16）：await 期间可能已切换素材，过期响应不得覆盖新状态
      if (props.photo?.id !== photoId) return
      if (res.ok) zipEntries.value = res.entries.filter((e) => !e.isDir)
      else zipMsg.value = res.error ?? '读取失败'
    } catch (err) {
      if (props.photo?.id === photoId) zipMsg.value = (err as Error).message || '读取失败'
    }
  },
  { immediate: true }
)

async function onZipEntry(e: { name: string; size: number }): Promise<void> {
  const photoId = props.photo!.id
  zipSelected.value = e.name
  zipPreview.value = null
  zipMsg.value = '提取中…'
  try {
    const res = await window.api.photos.extractZipEntry(photoId, e.name)
    // 双重守卫：素材已切换或用户已选中其它条目时丢弃过期响应（审查 P2-16）
    if (props.photo?.id !== photoId || zipSelected.value !== e.name) return
    if (res.ok && res.dataUrl && res.mime) {
      zipMsg.value = ''
      // UTF-8 安全解码（atob 产出的是 latin1 串，中文文本会乱码）
      let text: string | undefined
      if (res.mime === 'text/plain') {
        const bin = atob(res.dataUrl.split(',')[1] ?? '')
        text = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
      }
      zipPreview.value = { mime: res.mime, dataUrl: res.dataUrl, text }
    } else {
      zipMsg.value = res.error ?? '无法预览该文件'
    }
  } catch (err) {
    if (props.photo?.id === photoId) zipMsg.value = (err as Error).message || '提取失败'
  }
}

// —— F4：文本 / Markdown / HTML 预览（kind='text'） ——
const isTextAsset = computed(() => props.photo?.kind === 'text')
const isMarkdown = computed(() => ['md', 'markdown'].includes(fileExt.value))
const isHtmlDoc = computed(() => ['html', 'htm'].includes(fileExt.value))
const textContent = ref<string | null>(null)
const textTooLarge = ref(false)

/** sandbox iframe 里相对路径资源（图片/样式）默认无法解析：
 *  注入 <base href="rawfile://素材所在目录/">，子资源经协议逐文件校验加载
 *  （同目录兄弟文件已入库时可用）；HTML 自带 <base> 时尊重原值不注入 */
const htmlPreviewContent = computed((): string | undefined => {
  const raw = textContent.value
  if (!isHtmlDoc.value || !raw || !props.photo) return undefined
  if (/<base[\s>]/i.test(raw)) return raw
  const dir = props.photo.filePath.replace(/[\\/][^\\/]*$/, '/')
  const baseTag = `<base href="rawfile://${encodeMediaPath(dir)}">`
  if (/<head[^>]*>/i.test(raw)) return raw.replace(/<head[^>]*>/i, (m) => `${m}${baseTag}`)
  return baseTag + raw
})

/** md 渲染：marked 输出经 sanitize-html allowlist 清洗。
 *  旧实现只剥 script 标签和 on* 事件属性，iframe、javascript: 链接等
 *  向量全部保留——剪藏/下载而来的 .md 属不可信输入，必须按不可信内容处理（XSS 入口）。 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    'img',
    'del',
    'ins',
    'input' // GFM 任务列表 checkbox
  ],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ['href', 'name', 'target', 'title'],
    img: ['src', 'srcset', 'alt', 'title', 'width', 'height', 'loading'],
    code: ['class'],
    span: ['class'],
    input: ['type', 'checked', 'disabled']
  },
  // img 允许 data:（内嵌 base64 图片在 md 中常见）；链接协议收紧
  allowedSchemesByTag: {
    img: ['http', 'https', 'data'],
    a: ['http', 'https', 'mailto']
  },
  allowProtocolRelative: false,
  // 链接一律 _blank：https 走 setWindowOpenHandler → 系统浏览器；
  // 相对链接等会被 window-open handler 拒绝，不会把主窗口 SPA 导航走
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' })
  }
}

const renderedMarkdown = computed(() => {
  if (!isMarkdown.value || !textContent.value) return ''
  const raw = marked.parse(textContent.value, { async: false })
  return sanitizeHtml(raw, SANITIZE_OPTIONS)
})

watch(
  [() => props.photo?.id, isTextAsset],
  async ([photoId, isText]) => {
    textContent.value = null
    textTooLarge.value = false
    if (!photoId || !isText) return
    const p = props.photo
    if (!p) return
    const res = await window.api.photos
      .readTextFile(p.filePath)
      .catch(() => ({ ok: false as const, error: 'read failed' }))
    if (!res.ok) {
      if (res.error === 'file too large') textTooLarge.value = true
      return
    }
    if (props.photo?.id === photoId) textContent.value = res.content
  },
  { immediate: true }
)

// —— 阶段 5.1：格式预览插件扩展点（category=format，按扩展名匹配） ——
const formatPlugins = ref<InstalledPlugin[]>([])
const textPreview = ref<{ fileName: string; ext: string; content: string } | null>(null)

const formatPlugin = computed(
  () => formatPlugins.value.find((p) => p.formats.includes(fileExt.value)) ?? null
)

// 插件声明该格式时读取文本内容注入沙箱；读取失败/非文本 → 交给兜底卡片
watch(
  [() => props.photo?.id, formatPlugin],
  async ([photoId, plugin]) => {
    textPreview.value = null
    if (!photoId || !plugin) return
    const p = props.photo
    if (!p) return
    const res = await window.api.photos
      .readTextFile(p.filePath)
      .catch(() => ({ ok: false as const, error: 'read failed' }))
    if (res.ok && props.photo?.id === photoId) {
      textPreview.value = { fileName: p.fileName, ext: fileExt.value, content: res.content }
    }
  },
  { immediate: true }
)

onMounted(async () => {
  try {
    const list = await window.api.plugins.list()
    formatPlugins.value = list.filter((p) => p.category === 'format')
  } catch {
    formatPlugins.value = []
  }
})

// —— 阶段 4.3：PDF/AI 多页预览（pdfjs 渲染 + 翻页；rawfile:// 加载原文件） ——
const isPdf = computed(() => /\.(pdf|ai)$/i.test(props.photo?.fileName ?? ''))

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjsMod: PdfJsModule | null = null
let pdfDoc: Awaited<ReturnType<PdfJsModule['getDocument']>['promise']> | null = null
let pdfLoadingTask: { destroy: () => Promise<void> } | null = null

const pdfCanvas = ref<HTMLCanvasElement | null>(null)
const pdfLoading = ref(false)
const pdfError = ref('')
const pdfPage = ref(1)
const pdfPageCount = ref(0)

/** 渲染当前页到 canvas（按视口等比缩放到长边 ≤ 1600）。
 *  串行化（审查 P3-53）：pdf.js 不允许并发渲染同一 canvas，快速翻页时
 *  旧实现并发 render 会抛错并显示「页面渲染失败」 */
let pdfRenderChain: Promise<void> = Promise.resolve()

function renderPdfPage(): Promise<void> {
  const run = pdfRenderChain.then(async () => {
    const canvas = pdfCanvas.value
    if (!canvas || !pdfDoc) return
    pdfLoading.value = true
    pdfError.value = ''
    try {
      const page = await pdfDoc.getPage(pdfPage.value)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(1600 / Math.max(base.width, base.height), 2)
      const viewport = page.getViewport({ scale })
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
    } catch (err) {
      pdfError.value = `页面渲染失败：${(err as Error).message}`
    } finally {
      pdfLoading.value = false
    }
  })
  pdfRenderChain = run.catch(() => {})
  return run
}

function gotoPdfPage(delta: -1 | 1): void {
  const next = pdfPage.value + delta
  if (next < 1 || next > pdfPageCount.value) return
  pdfPage.value = next
  void renderPdfPage()
}

async function openPdf(): Promise<void> {
  await closePdf()
  const p = props.photo
  if (!p) return
  pdfLoading.value = true
  pdfError.value = ''
  try {
    if (!pdfjsMod) pdfjsMod = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const url = `rawfile://${encodeMediaPath(p.filePath)}`
    // pdfres:// 协议（protocols.ts）暴露 pdfjs-dist 的辅助资源：缺了它们，
    // 含 CJK cmap/非嵌入标准字体的 PDF 预览缺字，JPEG2000/JBIG2 图像解不出。
    // useWorkerFetch 必须显式 true：pdfjs 默认只对 http(s) 资源启用 fetch 路径，
    // 否则会回退到不认自定义协议的 XHR
    const task = pdfjsMod.getDocument({
      url,
      useWorkerFetch: true,
      cMapUrl: 'pdfres://cmaps/',
      standardFontDataUrl: 'pdfres://standard_fonts/',
      wasmUrl: 'pdfres://wasm/',
      iccUrl: 'pdfres://iccs/'
    })
    pdfLoadingTask = task
    pdfDoc = await task.promise
    pdfPageCount.value = pdfDoc.numPages
    pdfPage.value = 1
    await renderPdfPage()
  } catch (err) {
    pdfError.value = `PDF 打开失败：${(err as Error).message}`
  } finally {
    pdfLoading.value = false
  }
}

async function closePdf(): Promise<void> {
  try {
    await pdfLoadingTask?.destroy()
  } catch {
    /* ignore */
  }
  pdfLoadingTask = null
  pdfDoc = null
  pdfPageCount.value = 0
  pdfPage.value = 1
  pdfError.value = ''
}

// 切照片 / 卸载时释放 PDF 文档
watch(
  [isPdf, () => props.photo?.id],
  async ([isPdfAsset]) => {
    if (!isPdfAsset) {
      await closePdf()
      return
    }
    await openPdf()
  },
  { immediate: true }
)

// —— 六期：书签 ——
const isBookmark = computed(() => props.photo?.kind === 'bookmark')
const bookmarkTitle = computed(() =>
  (props.photo?.fileName ?? '').replace(/\.png$/i, '').replace(/^\d+_/, '')
)
function openBookmarkUrl(): void {
  const url = props.photo?.sourceUrl
  if (url) {
    void window.api.system
      .openExternal(url)
      .catch((err: unknown) =>
        useToast().error('打开链接失败', { description: (err as Error).message })
      )
  }
}

// —— 六期：反地理编码（城市标注，Nominatim + 缓存，失败静默） ——
const cityLabel = ref('')
watch(
  () => props.photo?.id,
  async () => {
    cityLabel.value = ''
    // 换照片后 <video> 因 :key 重建回到 1x，倍速标签需同步重置（审查发现）
    playbackRate.value = 1
    const p = props.photo
    // 合法坐标含 0（赤道/本初子午线），必须用 != null 而非真值判断（审查 B5）
    if (p?.latitude == null || p?.longitude == null) return
    const info = await window.api.photos.reverseGeocode(p.latitude, p.longitude).catch(() => null)
    if (info && props.photo?.id === p.id) cityLabel.value = info.city
  },
  { immediate: true }
)
/** 视频/音频播放地址（video:// 协议，protocols.ts 已注册） */
const mediaUrl = computed(() => {
  if (!props.photo) return ''
  return `video://${encodeMediaPath(props.photo.filePath)}`
})
// —— ⑤（Eagle 4.0）：字形表缺字检测（canvas alpha 抽样） ——

const glyphGridOpen = ref(false)
const glyphScanning = ref(false)
/** ASCII 可打印区 + CJK 统一表意文字前 2000 字抽样 */
const glyphChars = ref<string[]>([])
const glyphMissingSet = ref<Set<number>>(new Set())
const glyphMissingCount = computed(() => glyphMissingSet.value.size)

function buildGlyphChars(): string[] {
  const out: string[] = []
  for (let c = 0x20; c <= 0x7e; c++) out.push(String.fromCodePoint(c))
  for (let c = 0x4e00; c < 0x4e00 + 2000; c++) out.push(String.fromCodePoint(c))
  return out
}

function toggleGlyphGrid(): void {
  glyphGridOpen.value = !glyphGridOpen.value
  if (glyphGridOpen.value && glyphChars.value.length === 0) {
    glyphChars.value = buildGlyphChars()
    void scanMissingGlyphs()
  }
}

/** 逐字符绘制到离屏 canvas，全部像素透明 = 字体缺该字形（渲染豆腐） */
async function scanMissingGlyphs(): Promise<void> {
  glyphScanning.value = true
  glyphMissingSet.value = new Set()
  try {
    await document.fonts.ready
    const family = fontSampleStyle.value.fontFamily
    if (!family) return
    const cv = document.createElement('canvas')
    cv.width = 24
    cv.height = 24
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    const chars = glyphChars.value
    for (let i = 0; i < chars.length; i++) {
      ctx.clearRect(0, 0, 24, 24)
      ctx.font = `20px ${family}`
      ctx.fillStyle = '#000'
      ctx.textBaseline = 'middle'
      ctx.fillText(chars[i], 2, 13)
      const data = ctx.getImageData(0, 0, 24, 24).data
      let inked = false
      for (let j = 3; j < data.length; j += 4) {
        if (data[j] > 8) {
          inked = true
          break
        }
      }
      if (!inked) glyphMissingSet.value.add(i)
      // 每 256 字让出主线程，避免长任务卡预览
      if (i % 256 === 255) await new Promise((r) => setTimeout(r, 0))
    }
  } finally {
    glyphScanning.value = false
  }
}

const fontSampleStyle = ref<Record<string, string>>({})
const fontRealName = ref<string | null>(null)
let lastFontFamily = ''

// 监听 photo id + 是否字体（审查修复：原只监听布尔值，两字体间切换不触发、样张错串）
watch(
  [isFontAsset, () => props.photo?.id],
  async ([isFont]) => {
    const photoIdAtStart = props.photo?.id
    // 审查修复：字形表结果按字体隔离——切换素材时重置，防止残留上一个字体的缺字集
    glyphGridOpen.value = false
    glyphChars.value = []
    glyphMissingSet.value = new Set()
    // 先释放上一个字体，避免 document.fonts 无限增长（审查修复：按 lastFamily 清理）
    if (lastFontFamily) {
      for (const f of Array.from(document.fonts)) {
        if (f.family === lastFontFamily) document.fonts.delete(f)
      }
      lastFontFamily = ''
    }
    if (!isFont || !props.photo) {
      fontSampleStyle.value = {}
      fontRealName.value = null
      return
    }
    // 真实字体名（fontkit）
    void window.api.photos
      .fontInfo(props.photo.filePath)
      .then((info) => {
        fontRealName.value =
          info?.subfamilyName && !/^regular$/i.test(info.subfamilyName)
            ? `${info.familyName} ${info.subfamilyName}`
            : (info?.familyName ?? null)
      })
      .catch(() => {})
    const url = `rawfile://${encodeMediaPath(props.photo.filePath)}`
    const family = `leaf-font-${props.photo.id}`
    try {
      const face = new FontFace(family, `url("${url}")`)
      await face.load()
      // await 期间可能已切换素材：过期结果直接丢弃（审查 P3-54），
      // 否则样张串字体且 lastFontFamily 指向旧字体造成泄漏
      if (props.photo?.id !== photoIdAtStart) {
        document.fonts.delete(face)
        return
      }
      document.fonts.add(face)
      lastFontFamily = family
      fontSampleStyle.value = { fontFamily: `"${family}", serif` }
    } catch (err) {
      console.error('字体加载失败:', err)
      fontSampleStyle.value = {}
    }
  },
  { immediate: true }
)

const handleSetWallpaper = async (): Promise<void> => {
  if (!props.photo) return
  try {
    const result = await window.api.setWallpaper(props.photo.filePath)
    if (result?.ok) {
      useToast().success('已设为桌面壁纸', { description: props.photo.fileName })
    } else {
      useToast().error('设置壁纸失败', { description: result?.error || '未知错误' })
    }
  } catch (error) {
    useToast().error('设置壁纸失败', { description: (error as Error).message })
  }
}

const handleDelete = (): void => {
  if (!props.photo) return
  // D-008：原生 confirm → 应用内确认框（useDialogs，index.vue 挂载渲染）
  const { requestConfirm } = useDialogs()
  requestConfirm(
    '移除素材',
    `确定要从图片库中移除「${props.photo.fileName}」吗？\n\n注意：这只会从应用中移除记录（可在回收站恢复），不会删除您的本地文件。`,
    '移除',
    async () => {
      emit('delete', props.photo!.id)
    }
  )
}

const getImageUrl = (filePath: string): string => {
  // 使用 image:// 协议加载本地原图（预览场景需要全分辨率）
  // 逐段编码：# ? % 等不再被 Chromium 当 fragment/query 截断（审查 P2-32）
  return `image://${encodeMediaPath(filePath)}`
}

const PLACEHOLDER_SVG =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="600"%3E%3Crect fill="%23333" width="800" height="600"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="24" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3E图片加载失败%3C/text%3E%3C/svg%3E'

/** 原图加载失败回退：PSD/TIFF 等格式 Chromium <img> 解不了原图，
 *  而缩略图管线（sharp / PSD 内嵌图提取）能正常出图——先退 1024 缩略图，
 *  仍失败才显示占位。image:// 因素材已删/HEIC 转换失败等 404 时同样受益。 */
const imgFailed = ref(false)
const thumbFallback = ref(false)

const previewSrc = computed(() => {
  if (imgFailed.value || !props.photo) return PLACEHOLDER_SVG
  if (thumbFallback.value) return `thumb://1024/${props.photo.id}`
  return getImageUrl(props.photo.filePath)
})

const handleImageError = (): void => {
  if (!thumbFallback.value && props.photo?.thumbStatus === 1) {
    thumbFallback.value = true
    return
  }
  imgFailed.value = true
}

watch(
  () => props.photo?.id,
  () => {
    imgFailed.value = false
    thumbFallback.value = false
  }
)

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<style scoped>
.photo-preview {
  backdrop-filter: blur(10px);
}

/* F4：Markdown 预览排版（v-html 内容需 :deep 穿透 scoped） */
.leaf-md :deep(h1) {
  font-size: 1.6em;
  font-weight: 700;
  margin: 0.8em 0 0.5em;
}
.leaf-md :deep(h2) {
  font-size: 1.35em;
  font-weight: 700;
  margin: 0.8em 0 0.5em;
}
.leaf-md :deep(h3) {
  font-size: 1.15em;
  font-weight: 600;
  margin: 0.7em 0 0.4em;
}
.leaf-md :deep(p) {
  margin: 0.5em 0;
}
.leaf-md :deep(ul) {
  list-style: disc;
  padding-left: 1.4em;
  margin: 0.5em 0;
}
.leaf-md :deep(ol) {
  list-style: decimal;
  padding-left: 1.4em;
  margin: 0.5em 0;
}
.leaf-md :deep(blockquote) {
  border-left: 3px solid #cbd5e1;
  padding-left: 0.8em;
  margin: 0.6em 0;
  color: #64748b;
}
.leaf-md :deep(code) {
  background: #f1f5f9;
  border-radius: 4px;
  padding: 0.1em 0.35em;
  font-size: 0.9em;
}
.leaf-md :deep(pre) {
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 8px;
  padding: 0.9em 1.1em;
  overflow-x: auto;
  margin: 0.6em 0;
}
.leaf-md :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
}
.leaf-md :deep(a) {
  color: #2563eb;
  text-decoration: underline;
}
.leaf-md :deep(img) {
  max-width: 100%;
  border-radius: 6px;
}
.leaf-md :deep(table) {
  border-collapse: collapse;
  margin: 0.6em 0;
}
.leaf-md :deep(th),
.leaf-md :deep(td) {
  border: 1px solid #e2e8f0;
  padding: 0.35em 0.7em;
}
</style>
