<template>
  <div
    v-if="photo"
    class="photo-preview fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-5"
    @click.self="$emit('close')"
    @mousemove="onPreviewMouseMove"
  >
    <div class="max-w-7xl w-full h-full flex flex-col">
      <!-- 工具栏（简报模式下隐藏）：Eagle 预览是「看图」的，不是第二个工具栏——
           全部收成 32px 图标键，只留 关闭/翻页/评分/收藏/幻灯片/更多，
           破坏性与低频动作（移除、找相似、设为壁纸、文件级动作）收进 ⋯ -->
      <div
        v-if="!briefMode"
        class="flex shrink-0 items-center gap-1.5 pb-2 text-white transition-opacity duration-300"
        :class="chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'"
        @mouseenter="pinChrome(true)"
        @mouseleave="pinChrome(false)"
      >
        <button class="pv-icon" title="关闭（Esc）" @click="$emit('close')">
          <AppIcon icon="ic-toolbar-close" :size="15" />
        </button>
        <button
          class="pv-icon"
          title="上一张（←）"
          :disabled="!hasPrevious"
          @click="handlePrevious"
        >
          <AppIcon icon="ic-toolbar-prev" :size="15" />
        </button>
        <button class="pv-icon" title="下一张（→）" :disabled="!hasNext" @click="handleNext">
          <AppIcon icon="ic-toolbar-next" :size="15" />
        </button>
        <div class="ml-1.5 flex min-w-0 items-baseline gap-2">
          <span class="truncate text-sm text-white/90" :title="photo.fileName">
            {{ photo.fileName }}
          </span>
          <span v-if="currentIndex >= 0" class="shrink-0 text-xs tabular-nums text-white/40">
            {{ currentIndex + 1 }}/{{ props.photos.length }}
          </span>
        </div>
        <!-- 快捷键只在开框时浮一次，不常驻占位 -->
        <span
          class="pv-hint pointer-events-none ml-3 hidden shrink-0 text-xs text-white/35 md:inline"
          >{{ shortcutHint }}</span
        >

        <div class="ml-auto flex shrink-0 items-center gap-1.5">
          <div class="flex items-center gap-0.5 pr-1" title="评分">
            <button
              v-for="star in 5"
              :key="star"
              class="px-0.5 text-[15px] leading-none transition-colors"
              :class="star <= (hoverRating ?? photo.rating) ? 'text-amber-400' : 'text-white/25'"
              :aria-label="`评 ${star} 星`"
              @click="$emit('set-rating', photo.id, star === photo.rating ? 0 : star)"
              @mouseenter="hoverRating = star"
              @mouseleave="hoverRating = null"
            >
              ★
            </button>
          </div>
          <button
            class="pv-icon"
            :class="photo.isFavorite ? 'is-fav' : ''"
            :title="photo.isFavorite ? '取消收藏' : '收藏'"
            @click="$emit('toggle-favorite', photo.id)"
          >
            <AppIcon
              :icon="photo.isFavorite ? 'ic-favorite-remove' : 'ic-favorite-add'"
              :size="15"
            />
          </button>
          <button
            class="pv-icon"
            :class="slideshow ? 'is-on' : ''"
            :disabled="props.photos.length <= 1"
            :title="slideshow ? '停止幻灯片（空格）' : '幻灯片播放（每 3 秒切换）'"
            @click="toggleSlideshow"
          >
            <AppIcon :icon="slideshow ? 'ic-status-pause' : 'ic-toolbar-play'" :size="15" />
          </button>
          <button
            class="pv-icon"
            title="找相似 / 设为壁纸 / 重命名 / 导出 / 移除"
            @click="openMoreMenu"
          >
            <AppIcon icon="ic-more-actions" :size="15" />
          </button>
        </div>
      </div>

      <!-- 图片显示区域 -->
      <div class="flex-1 flex flex-col items-center justify-center overflow-hidden gap-2">
        <div class="flex min-h-0 items-center justify-center">
          <!-- 视频：video:// 播放（容器可播性见 assetTypes 的实测清单） -->
          <video
            v-if="isVideo && canInlinePlay"
            ref="videoRef"
            :key="photo.id"
            :src="mediaUrl"
            :class="grayscale ? 'grayscale' : ''"
            controls
            autoplay
            class="max-w-full max-h-full"
          >
            <!-- 同目录 SRT/VTT（主进程只按 photoId 找兄弟文件）：blob: 喂给 <track>，
                 开关与语言选择交给 Chromium 原生 CC 菜单，不再自建一套 -->
            <track
              v-for="t in subtitleTracks"
              :key="t.src"
              kind="subtitles"
              :src="t.src"
              :label="t.label"
              :srclang="t.srclang"
              :default="t.default || undefined"
            />
          </video>
        </div>
        <!-- 六期：视频逐帧步进 / 倍速 -->
        <div v-if="isVideo && canInlinePlay" class="flex items-center gap-2 text-white">
          <button
            class="rounded bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20"
            :title="`后退一帧（${frameStepLabel}）`"
            @click="stepFrame(-1)"
          >
            ⏮ 帧−
          </button>
          <button
            class="rounded bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20"
            :title="`前进一帧（${frameStepLabel}）`"
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
        <!-- 容器/编码 Chromium 播不了（avi/wmv/flv/mpeg/ts/裸 hevc 及 ProRes 等）：
             退化为封面 + 系统播放器入口，不再丢一个必坏的 <video> 空壳 -->
        <div v-else-if="isVideo" class="flex max-w-xl flex-col items-center text-center text-white">
          <img
            :src="`thumb://1024/${photo.id}`"
            class="max-h-[55vh] rounded-lg object-contain"
            alt=""
          />
          <p class="mt-3 text-sm text-gray-300">.{{ fileExt }} 容器无法在应用内播放，已生成封面</p>
          <button
            class="mt-2 rounded bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
            @click="openWithSystemApp"
          >
            用系统播放器打开
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
                  : glyphScanError
                    ? `字形检测失败：${glyphScanError}`
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
            class="leaf-md min-h-0 flex-1 overflow-y-auto rounded-lg border border-line-subtle bg-surface-1 p-6 text-[14px] leading-relaxed text-fg-primary"
            v-html="renderedMarkdown"
          />
          <pre
            v-else-if="textContent !== null"
            class="leaf-code min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line-subtle bg-surface-1 p-5 font-mono text-[13px] leading-relaxed text-fg-primary"
            v-html="renderedCode.html"
          />
          <div
            v-else-if="textTooLarge"
            class="cursor-default text-center text-white"
            @dblclick="openWithSystemApp"
          >
            <div class="text-6xl">📃</div>
            <p class="mt-3 text-sm text-gray-400">文件过大（超过 1MB），不支持预览</p>
            <p class="mt-1 text-xs text-gray-500">可双击用系统程序打开</p>
          </div>
          <div v-else class="cursor-default text-center text-white" @dblclick="openWithSystemApp">
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
        <div
          v-else-if="isGenericFile"
          class="cursor-default text-center text-white"
          @dblclick="openWithSystemApp"
        >
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
        <!-- 图片：适应窗口（小图按上限放大铺满）+ 滚轮缩放 / 拖拽平移 / 双击 100% -->
        <div
          v-else
          ref="stageEl"
          class="preview-stage relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
          @click.self="emit('close')"
          @wheel.prevent="onStageWheel"
        >
          <img
            :src="previewSrc"
            :alt="photo.fileName"
            :class="[
              grayscale ? 'grayscale' : '',
              naturalKnown ? '' : 'max-w-full max-h-full object-contain',
              canPan ? (panning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
            ]"
            :style="imgStyle"
            draggable="false"
            class="select-none"
            @load="onImgLoad"
            @error="handleImageError"
            @dblclick="toggleActualSize"
            @mousedown="onPanStart"
          />
          <!-- 缩放 HUD（简报模式下随 UI 一起隐藏）：Eagle 同款图标键，百分比保留可读 -->
          <div
            v-if="!briefMode && naturalKnown"
            class="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-lg bg-black/55 px-1 py-1 text-xs text-white/85 backdrop-blur-sm transition-opacity duration-300"
            :class="chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'"
            @mouseenter="pinChrome(true)"
            @mouseleave="pinChrome(false)"
          >
            <button class="pv-hud" title="缩小（-）" @click="zoomBy(-1)">
              <AppIcon icon="ic-toolbar-zoom-out" :size="13" />
            </button>
            <button
              class="min-w-[46px] rounded px-1 py-0.5 text-center tabular-nums hover:bg-white/15"
              title="点击回到适应窗口"
              @click="zoomToFit"
            >
              {{ Math.round(displayScale * 100) }}%
            </button>
            <button class="pv-hud" title="放大（+）" @click="zoomBy(1)">
              <AppIcon icon="ic-toolbar-zoom-in" :size="13" />
            </button>
            <span class="mx-1 h-4 w-px bg-white/20"></span>
            <button
              class="pv-hud"
              :class="{ 'bg-white/15': isActualSize }"
              title="实际像素（1）"
              @click="zoomToActualSize"
            >
              <AppIcon icon="ic-toolbar-zoom-actual" :size="13" />
            </button>
            <button
              class="pv-hud"
              :class="{ 'bg-white/15': isFit }"
              title="适应窗口（0）"
              @click="zoomToFit"
            >
              <AppIcon icon="ic-toolbar-zoom-fit" :size="13" />
            </button>
          </div>
        </div>
      </div>

      <!-- 底部：默认只两行（注释 / 标签 + 一行元数据），完整元数据与 EXIF 收在「详情」之后。
           预览是看图的地方，不该再占三成窗口高度当第二块检查器 -->
      <div
        v-if="!briefMode"
        class="shrink-0 pt-2 text-white transition-opacity duration-300"
        :class="chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'"
        @mouseenter="pinChrome(true)"
        @mouseleave="pinChrome(false)"
      >
        <div
          v-if="metaOpen"
          class="mb-2 max-h-[38%] overflow-y-auto rounded-lg border border-white/10 bg-white/[0.06] p-3"
        >
          <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div class="flex gap-2">
              <span class="shrink-0 text-white/40">文件名</span>
              <span class="truncate" :title="photo.fileName">{{ photo.fileName }}</span>
            </div>
            <div class="flex gap-2">
              <span class="shrink-0 text-white/40">文件大小</span>
              <span>{{ formatFileSize(photo.fileSize) }}</span>
            </div>
            <div v-if="photo.width && photo.height" class="flex gap-2">
              <span class="shrink-0 text-white/40">尺寸</span>
              <span>{{ photo.width }} × {{ photo.height }}</span>
            </div>
            <div class="flex gap-2">
              <span class="shrink-0 text-white/40">
                {{ photo.takenAt ? '拍摄时间' : '文件时间' }}
              </span>
              <span>{{ formatDate(photo.takenAt ?? photo.createdAt) }}</span>
            </div>
          </div>

          <div class="mt-2.5 border-t border-white/10 pt-2">
            <p class="mb-1.5 text-[11px] text-white/40">EXIF</p>
            <div v-if="hasExif" class="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <div v-if="photo.cameraModel">
                <span class="text-white/40">相机 </span>{{ photo.cameraModel }}
              </div>
              <div v-if="photo.lensModel">
                <span class="text-white/40">镜头 </span>{{ photo.lensModel }}
              </div>
              <div v-if="photo.iso"><span class="text-white/40">ISO </span>{{ photo.iso }}</div>
              <div v-if="photo.aperture">
                <span class="text-white/40">光圈 </span>f/{{ photo.aperture }}
              </div>
              <div v-if="photo.shutter">
                <span class="text-white/40">快门 </span>{{ photo.shutter }}
              </div>
              <div v-if="photo.focalLength">
                <span class="text-white/40">焦距 </span>{{ photo.focalLength }}mm
              </div>
              <div v-if="photo.latitude != null && photo.longitude != null">
                <span class="text-white/40">GPS </span>{{ photo.latitude.toFixed(4) }},
                {{ photo.longitude.toFixed(4) }}
              </div>
              <div v-if="cityLabel">
                <span class="text-white/40">位置 </span>{{ cityLabel }}
                <span class="text-[10px] text-white/30">© OpenStreetMap</span>
              </div>
            </div>
            <p v-else class="text-[11px] text-white/35">
              {{
                photo.thumbStatus === 0
                  ? '元数据处理中，EXIF 稍后自动出现在这里。'
                  : '未检测到 EXIF 信息（截图/网络图片通常没有）。'
              }}
            </p>
          </div>
        </div>

        <!-- 注释：单行就地输入，随内容自增高 -->
        <div class="flex items-start gap-2">
          <textarea
            v-model="descriptionDraft"
            rows="1"
            class="pv-note min-w-0 flex-1 rounded-md bg-transparent px-2 py-1.5 text-sm text-white/90 placeholder-white/30 outline-none transition-colors hover:bg-white/[0.06] focus:bg-white/10"
            placeholder="添加注释（搜索时可用）"
            @blur="commitDescription"
          ></textarea>
          <!-- 只给有文字信号的素材（正文 / OCR / 纯文本文件）：
               DeepSeek 没有视觉输入，对着无文字的图只能瞎猜，就不摆按钮 -->
          <button
            v-if="hasTextSignal"
            type="button"
            class="shrink-0 rounded-md px-2 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="aiMetaBusy"
            title="依据素材已有文字生成摘要与标签建议"
            @click="handleAiMeta"
          >
            {{ aiMetaBusy ? '生成中…' : '✨ AI 摘要与标签' }}
          </button>
        </div>
        <p v-if="aiMetaError" class="mt-1 text-xs text-red-300">{{ aiMetaError }}</p>

        <!-- 标签 + 元数据一行：标签横向滚动，右侧元数据与「详情」永不被挤掉 -->
        <div class="mt-1 flex min-w-0 items-center gap-1.5">
          <div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
            <span
              v-for="tag in photo.tags"
              :key="tag"
              class="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/80"
            >
              {{ tag }}
              <button
                class="text-white/40 transition-colors hover:text-white"
                :aria-label="`移除标签 ${tag}`"
                @click="$emit('remove-tag', photo.id, tag)"
              >
                ×
              </button>
            </span>
            <input
              v-model="newTag"
              type="text"
              list="photo-tag-suggestions"
              placeholder="添加标签"
              class="h-6 w-28 shrink-0 rounded-md bg-white/10 px-2 text-[11px] text-white placeholder-white/30 outline-none focus:bg-white/15"
              @keyup.enter="handleAddTag"
            />
            <datalist id="photo-tag-suggestions">
              <option v-for="t in tagSuggestions" :key="t" :value="t" />
            </datalist>
            <button
              class="pv-icon pv-icon--sm"
              :disabled="!newTag.trim()"
              title="添加标签（回车）"
              @click="handleAddTag"
            >
              <AppIcon icon="ic-inspector-add-label" :size="12" />
            </button>
          </div>

          <div class="flex shrink-0 items-center gap-1.5">
            <span class="text-[11px] tabular-nums text-white/35">{{ metaLine }}</span>
            <button
              class="h-6 shrink-0 rounded px-1.5 text-[11px] transition-colors"
              :class="
                metaOpen
                  ? 'bg-white/15 text-white'
                  : 'text-white/40 hover:bg-white/10 hover:text-white/80'
              "
              :title="metaOpen ? '收起完整信息与 EXIF' : '展开完整信息与 EXIF'"
              @click="metaOpen = !metaOpen"
            >
              详情
            </button>
          </div>
        </div>
      </div>

      <!-- 左右边缘悬停浮现翻页键（Eagle 看图态）：外框淡出后仍能翻页；
         带内空白处 click.self 继续走「点背景关框」，不吞点击 -->
      <div
        v-if="!briefMode && hasPrevious"
        class="group absolute top-1/2 left-0 flex h-2/5 w-14 -translate-y-1/2 items-center justify-center sm:w-20"
        @click.self="$emit('close')"
      >
        <button class="pv-edge" title="上一张（←）" @click="handlePrevious">
          <AppIcon icon="ic-toolbar-prev" :size="18" />
        </button>
      </div>
      <div
        v-if="!briefMode && hasNext"
        class="group absolute top-1/2 right-0 flex h-2/5 w-14 -translate-y-1/2 items-center justify-center sm:w-20"
        @click.self="$emit('close')"
      >
        <button class="pv-edge" title="下一张（→）" @click="handleNext">
          <AppIcon icon="ic-toolbar-next" :size="18" />
        </button>
      </div>

      <!-- 简报模式控制栏（Eagle F5：底部半透明计数器+播放控制，鼠标静止自动隐藏） -->
      <div
        v-if="briefMode"
        class="pointer-events-none absolute bottom-0 left-0 right-0 flex items-center justify-center gap-4 bg-gradient-to-t from-black/70 to-transparent px-6 py-4 text-white transition-opacity duration-300"
        :class="chromeVisible ? 'opacity-100' : 'opacity-0'"
        @mouseenter="pinChrome(true)"
        @mouseleave="pinChrome(false)"
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
import { useToast } from '@composables/useToast'
import { useContextMenu } from '@composables/useContextMenu'
import { isArchiveFile, isFontFile, isPlayableVideoFile, isTextFile } from '@shared/assetTypes'
import { hasAiWorthyText } from '@shared/ocrText'
import type { Photo } from '../../../types/photo'
import { useDialogs } from '../composables/useDialogs'
import { highlightCodeFile, type CodeHighlight } from '@renderer/utils/codePreview'
import { useVideoSubtitles } from '../composables/useVideoSubtitles'
import { usePhotoActions } from '../composables/usePhotoActions'
import { useWallpaper } from '../composables/useWallpaper'
import PluginSandbox from '@components/plugins/PluginSandbox.vue'
import AppIcon from '@components/AppIcon.vue'
import { encodeMediaPath } from '@renderer/utils/mediaPath'
import { renderMarkdown } from '@renderer/utils/markdownPreview'
import type { InstalledPlugin } from '@renderer/types/plugin'

const actions = usePhotoActions()
const wallpaper = useWallpaper()
const { open: openMenuAt } = useContextMenu()

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
/** 底部完整元数据/EXIF 面板默认折叠，只留一行摘要 */
const metaOpen = ref(false)
const descriptionDraft = ref('')
const tagSuggestions = ref<string[]>([])
// —— AI 动作扩展：AI 命名建议（top 标签 + 原名，确认后 renamePhotos） ——
/** 提交新文件名：AI 命名与「更多▸重命名」共用同一条 renamePhotos 通道 */
function promptRename(p: Photo, initial: string, title: string): void {
  const { requestPrompt } = useDialogs()
  requestPrompt({
    title,
    label: '新的文件名（含扩展名）',
    initialValue: initial,
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
}

// 切换图片时同步描述草稿
watch(
  () => props.photo?.id,
  () => {
    descriptionDraft.value = props.photo?.description ?? ''
    hoverRating.value = null
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

// ── 外框静止淡出（十八轮 P3 简报控制栏的同一套计时，现覆盖普通预览）──

/** 顶栏 / 缩放 HUD / 底部两行共用一个可见态：鼠标静止即淡出，动一下即回来 */
const chromeVisible = ref(true)
/** 指针停在外框上时钉住不收，否则淡出后点不回来 */
const chromePinned = ref(false)
const CHROME_IDLE_MS = 2200
let chromeHideTimer: ReturnType<typeof setTimeout> | null = null

/** 正在外框里的输入控件中打字时不收（注释 / 标签 / 命令面板） */
function isTypingInChrome(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el || !el.closest?.('.photo-preview')) return false
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
}

function hideChrome(): void {
  chromeHideTimer = null
  if (chromePinned.value || isTypingInChrome()) {
    chromeHideTimer = setTimeout(hideChrome, 600)
    return
  }
  chromeVisible.value = false
}

function bumpChrome(): void {
  chromeVisible.value = true
  if (chromeHideTimer) clearTimeout(chromeHideTimer)
  chromeHideTimer = setTimeout(hideChrome, CHROME_IDLE_MS)
}

function pinChrome(pinned: boolean): void {
  chromePinned.value = pinned
  if (pinned && chromeHideTimer) {
    clearTimeout(chromeHideTimer)
    chromeHideTimer = null
  } else if (!pinned) bumpChrome()
}

function onPreviewMouseMove(): void {
  bumpChrome()
}

onUnmounted(() => {
  if (chromeHideTimer) clearTimeout(chromeHideTimer)
})

/** 简报模式的自动播放仍由 slideshow 驱动；淡出机制与普通预览共用 */
watch(
  () => props.briefMode,
  (on) => {
    if (on) startSlideshow()
    else stopSlideshow()
    bumpChrome()
  },
  { immediate: true }
)

/** 自带 ESC 关闭 + 简报导航 + 缩放 / 视频播放空格（全局键盘层在 usePhotoKeyboard 侧配套让路） */
function onKeydown(e: KeyboardEvent): void {
  const field = (e.target as HTMLElement | null)?.closest?.('input, textarea, select')
  if (e.key === 'Escape' && !actions.locked.value) {
    // 输入控件内按 ESC 语义是退出输入，不穿透关闭整个预览（审查 P3-52）；
    // blur 让描述的 @blur 提交落库
    if (field) (field as HTMLElement).blur()
    else emit('close')
    return
  }
  // 空格/±/0/1 在输入控件里都属于打字
  if (field) return
  if (props.briefMode) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      handlePrevious()
      bumpChrome()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      handleNext()
      bumpChrome()
    } else if (e.key === ' ') {
      e.preventDefault()
      toggleSlideshow()
      bumpChrome()
    }
    return
  }
  // 缩放用无修饰键：⌘+ / ⌘0 被应用菜单的页面缩放（role: zoomIn/resetZoom）吃掉，不会到渲染层
  if (naturalKnown.value) {
    if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      zoomBy(1)
      return
    }
    if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      zoomBy(-1)
      return
    }
    if (e.key === '0') {
      e.preventDefault()
      zoomToFit()
      return
    }
    if (e.key === '1') {
      e.preventDefault()
      zoomToActualSize()
      return
    }
  }
  if (e.code === 'Space' && isVideoInline.value) {
    e.preventDefault()
    toggleVideoPlay()
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
onUnmounted(closePdf)

// —— DeepSeek 文本模型（D-017）：摘要 + 标签建议 ——
// 输入只有文字信号（doc_text / ocr_text / 纯文本文件内容）；模型无视觉输入
const hasTextSignal = computed(() => {
  const p = props.photo
  if (!p) return false
  return (
    p.kind === 'text' ||
    isTextFile(p.fileName) ||
    hasAiWorthyText(p.docText) ||
    hasAiWorthyText(p.ocrText)
  )
})
const aiMetaBusy = ref(false)
const aiMetaError = ref('')

async function handleAiMeta(): Promise<void> {
  const p = props.photo
  if (!p || aiMetaBusy.value) return
  aiMetaBusy.value = true
  aiMetaError.value = ''
  try {
    const r = await window.api.ai.suggestMeta(p.id)
    if (!r.ok) {
      aiMetaError.value = r.error ?? '生成失败'
      return
    }
    // 请求在飞时可能已切换素材：过期响应不得写进当前草稿
    if (props.photo?.id !== p.id) return
    if (r.description) descriptionDraft.value = r.description
    const fresh = (r.tags ?? []).filter(
      (t) => !p.tags.some((had) => had.toLowerCase() === t.toLowerCase())
    )
    for (const t of fresh) emit('add-tag', p.id, t)
    useToast().success('已生成摘要' + (fresh.length ? `与 ${fresh.length} 个标签` : ''), {
      description: '标签即时写入；描述需失焦才落库'
    })
  } catch (error) {
    aiMetaError.value = (error as Error).message
  } finally {
    aiMetaBusy.value = false
  }
}

const commitDescription = (): void => {
  if (!props.photo) return
  const next = descriptionDraft.value.trim()
  if ((props.photo.description ?? '') === next) return
  emit('set-description', props.photo.id, next)
}

// ---- 字体预览（三期 P3）：rawfile:// + FontFace 样张 ----

const isFontAsset = computed(() => (props.photo ? isFontFile(props.photo.fileName) : false))
const isVideo = computed(() => props.photo?.kind === 'video')
/** Chromium 实测能内联播放的视频容器；false 时退化为封面 + 系统播放器 */
const canInlinePlay = computed(() =>
  props.photo ? isPlayableVideoFile(props.photo.fileName) : false
)
/** 不可预览类型的出口：交系统默认应用（与网格「双击文件」同语义） */
const openWithSystemApp = (): void => {
  const path = props.photo?.filePath
  if (!path) return
  void window.api.system.openPath(path).then((ok) => {
    if (!ok) useToast().error('打开失败', { description: '文件不存在或已被移动' })
  })
}
const isAudio = computed(() => props.photo?.kind === 'audio')

// —— 六期：视频逐帧步进 / 倍速 ——
const videoRef = ref<HTMLVideoElement | null>(null)
const playbackRate = ref(1)
const playbackRateLabel = computed(() =>
  playbackRate.value === 1 ? '1x' : `${playbackRate.value}x`
)

/** 库里没探到帧率时的回落步长（与旧行为一致） */
const FALLBACK_FPS = 30

/**
 * 逐帧步进：先暂停再挪 currentTime。
 * 步长按库里实测帧率（022 起由 ffmpeg 探测入库），没探到才回落 30 ——
 * 原来硬编码 1/30，24fps 素材一次跳 1.25 帧、60fps 跳半帧，按钮却写着「一帧」。
 */
function stepFrame(direction: 1 | -1): void {
  const video = videoRef.value
  if (!video) return
  video.pause()
  const fps = props.photo?.fps
  const frame = 1 / (fps && Number.isFinite(fps) && fps > 0 ? fps : FALLBACK_FPS)
  const next = video.currentTime + direction * frame
  video.currentTime = Math.min(Math.max(0, next), video.duration || next)
}

/** 按钮上的步长说明：探到过报实测值，没探到说明用的是兜底 */
const frameStepLabel = computed(() => {
  const fps = props.photo?.fps
  return fps ? `1/${fps}s` : `1/${FALLBACK_FPS}s`
})

/** 空格语义：可内联播放的视频 = 播放/暂停，而不是关掉整个预览 */
const isVideoInline = computed(() => isVideo.value && canInlinePlay.value)

// P1：同目录字幕轨（主进程按 photoId 去找兄弟 .srt/.vtt，渲染层只拿文本包 blob）
const { subtitleTracks } = useVideoSubtitles(() =>
  isVideoInline.value ? props.photo?.id : undefined
)

function toggleVideoPlay(): void {
  const video = videoRef.value
  if (!video) return
  if (video.paused) void video.play()
  else video.pause()
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

// 归档判定走单一真源（此前是 'zip' 字面量，归档类也没进 assetTypes 白名单）
const isZip = computed(() => isArchiveFile(props.photo?.fileName ?? ''))
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
/** 判文本看扩展名而不是只看 kind：Eagle 导入与早期入库的 .txt 落库时 kind 是 'file'，
 *  只看 kind 会让它们掉进「该类型暂不支持预览」兜底卡（hasTextSignal 同一口径） */
const isTextAsset = computed((): boolean => {
  const p = props.photo
  if (!p) return false
  return p.kind === 'text' || (p.kind === 'file' && isTextFile(p.fileName))
})
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

/** md 渲染：解析 + 高亮 + 清洗都在 utils/markdownPreview 里（清洗必须是最后一道闸，
 *  剪藏/下载来的 .md 属不可信输入）。这里只补一步相对图片改写。 */
const renderedMarkdown = computed(() => {
  if (!isMarkdown.value || !textContent.value) return ''
  return rewriteMdRelativeSrc(renderMarkdown(textContent.value))
})

/**
 * Markdown 里的相对图片（`![](img.png)`）在应用文档下会解析到 out/renderer/ 而 404
 * （真机表现为 REQFAIL file:///…/out/renderer/ok.png）。按素材所在目录改写成
 * rawfile://，仍由协议侧的「必须是已入库素材」把关。
 * 刻意放在 sanitize 之后改写：不必为 rawfile: 放宽 img 的 scheme allowlist，
 * 清洗面保持原样。
 */
function rewriteMdRelativeSrc(html: string): string {
  const p = props.photo
  if (!p) return html
  const dir = p.filePath.replace(/[\\/][^\\/]*$/, '/')
  return html.replace(/(<img[^>]*\ssrc=")([^"]+)(")/gi, (m, head, src, tail) => {
    // 绝对 URL / scheme / 协议相对 / 根路径 / 锚点都不动
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(src)) return m
    return `${head}rawfile://${encodeMediaPath(dir + src)}${tail}`
  })
}

/**
 * 代码文件整片着色（库里 4,206 条代码/数据文本原先是纯文本）。
 * 认不出语言的、以及超 HIGHLIGHT_MAX_CHARS 的，返回的都是转义过的原文，
 * 所以模板可以无条件 v-html——见 utils/codePreview.ts 的三条约束。
 */
const renderedCode = computed((): CodeHighlight => {
  const raw = textContent.value
  if (raw === null || !props.photo) return { html: '', language: null }
  return highlightCodeFile(props.photo.fileName, raw)
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
/** pdfjs worker（每次打开文档时按需新建，closePdf 显式 terminate + 回收 blob） */
let pdfWorker: Worker | null = null
let pdfWorkerBlobUrl: string | null = null

/**
 * 预置 pdfjs 的 worker。pdfjs v6 在 try 块外解构 GlobalWorkerOptions.workerSrc，
 * 没有 worker 时 getDocument 直接同步抛错 → 预览整体打不开。
 *
 * 走 workerPort 而不是 workerSrc：worker 源码以 ?raw 内联成 blob module worker
 * （pdf.worker.mjs 零静态依赖，不需要 pdfjs 的 CDN wrapper 二次 import()，
 * 也不用往 CSP 里加 file:/http 源）。必须是**真 worker**而不是主线程 fake worker：
 * ICC/wasm 取数用同步 XHR，Chromium 只在 worker 里允许给它设 responseType。
 */
async function ensurePdfWorker(mod: PdfJsModule): Promise<void> {
  if (pdfWorker) return
  const src = await import('pdfjs-dist/legacy/build/pdf.worker.mjs?raw')
  pdfWorkerBlobUrl = URL.createObjectURL(new Blob([src.default], { type: 'text/javascript' }))
  pdfWorker = new Worker(pdfWorkerBlobUrl, { type: 'module' })
  mod.GlobalWorkerOptions.workerPort = pdfWorker as unknown as Worker & { port?: never }
}
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
    await ensurePdfWorker(pdfjsMod)
    const url = `rawfile://${encodeMediaPath(p.filePath)}`
    // pdfres:// 协议（protocols.ts）暴露 pdfjs-dist 的辅助资源：缺了它们，
    // 含 CJK cmap/非嵌入标准字体的 PDF 预览缺字，JPEG2000/JBIG2 图像解不出。
    // useWorkerFetch 显式 true：pdfjs 默认只对 http(s) 判定为可 fetch，
    // false 时辅助资源会改走页面上下文的同步 XHR（拿不到 ICC/wasm）
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
  // port 形态的 worker 不会被 pdfjs 回收（它只 terminate 自己 new出来的 #webWorker）
  if (pdfWorker) {
    pdfWorker.terminate()
    pdfWorker = null
  }
  if (pdfWorkerBlobUrl) {
    URL.revokeObjectURL(pdfWorkerBlobUrl)
    pdfWorkerBlobUrl = null
  }
  if (pdfjsMod) pdfjsMod.GlobalWorkerOptions.workerPort = null
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
// —— ⑤（Eagle 4.0）：字形表缺字检测（主进程 fontkit cmap） ——

const glyphGridOpen = ref(false)
const glyphScanning = ref(false)
const glyphScanError = ref('')
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

/** 缺字判定走主进程 fontkit 的 cmap：canvas 逐字绘制测不出来（见 fontGlyphs 注释） */
async function scanMissingGlyphs(): Promise<void> {
  const p = props.photo
  if (!p) return
  glyphScanning.value = true
  glyphScanError.value = ''
  glyphMissingSet.value = new Set()
  try {
    const chars = glyphChars.value
    const codePoints = chars.map((ch) => ch.codePointAt(0) ?? 0)
    const res = await window.api.photos.fontGlyphs(p.filePath, codePoints)
    // await 期间可能已切换素材：过期结果不得写进当前网格
    if (props.photo?.id !== p.id) return
    if (!res.ok) {
      glyphScanError.value = res.error
      return
    }
    const missing = new Set(res.missing)
    const hit = new Set<number>()
    codePoints.forEach((cp, i) => {
      if (missing.has(cp)) hit.add(i)
    })
    glyphMissingSet.value = hit
  } catch (err) {
    glyphScanError.value = (err as Error).message || '字形检测失败'
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
    glyphScanError.value = ''
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

/** 主按钮：按屏自动适配并设置；▾：展开策略菜单（菜单顶部说明会裁掉多少） */
const handleSetWallpaper = (): void => {
  if (!props.photo) return
  void wallpaper.set(props.photo)
}

const openWallpaperMenu = (x: number, y: number): void => {
  if (!props.photo) return
  void wallpaper.openMenu(props.photo, x, y)
}

/** PDF/AI 也归 kind='image'（要进缩略图与文档索引链路），但按位图设计的动作对它们无意义 */
const isRasterImage = computed(
  () => props.photo?.kind === 'image' && !/\.(pdf|ai)$/i.test(props.photo.fileName)
)

const shortcutHint = computed((): string => {
  if (isVideoInline.value) return '←→ 翻页 · 空格 播放/暂停 · Esc 关闭'
  // 自然尺寸未知（SVG 无宽高 / 图未加载完）时不吹缩放能力
  const zoom = naturalKnown.value ? ' · 滚轮缩放 · 双击 100%' : ''
  return `←→ 翻页 · 空格/Esc 关闭 · F5 简报 · ⌘G 黑白${zoom}`
})

/** 文件级动作：网格右键菜单有，预览此前是死角（只能退出再回网格） */
function openMoreMenu(event: MouseEvent): void {
  if (!props.photo) return
  const items: Array<{ key: string; label?: string; divider?: boolean }> = []
  if (isRasterImage.value) {
    items.push({ key: 'find-similar', label: '找相似' })
    items.push({ key: 'wallpaper', label: '设为壁纸（按屏适配）' })
    items.push({ key: 'wallpaper-mode', label: '壁纸适配方式…' })
    items.push({ key: 'd0', divider: true })
  }
  items.push(
    { key: 'rename', label: '重命名…' },
    { key: 'reveal', label: '在文件夹中显示' },
    { key: 'open', label: '用默认应用打开' },
    { key: 'copy-path', label: '复制文件路径' },
    { key: 'export', label: '导出…' },
    { key: 'd1', divider: true },
    { key: 'delete', label: '丢到回收站（仅移除记录）' }
  )
  openMenuAt(
    event.clientX,
    event.clientY,
    items,
    (key) => void onMorePick(key, { x: event.clientX, y: event.clientY })
  )
}

async function onMorePick(key: string, at: { x: number; y: number }): Promise<void> {
  const p = props.photo
  if (!p) return
  if (key === 'find-similar') emit('find-similar', p.id)
  else if (key === 'wallpaper') handleSetWallpaper()
  else if (key === 'wallpaper-mode') openWallpaperMenu(at.x, at.y)
  else if (key === 'rename') promptRename(p, p.fileName, '重命名')
  else if (key === 'reveal') actions.revealInFolder([p])
  else if (key === 'open') openWithSystemApp()
  else if (key === 'copy-path') {
    await window.api.photos.copyText(p.filePath)
    useToast().success('已复制文件路径')
  } else if (key === 'export') await actions.exportSelected([p.id])
  else if (key === 'delete') handleDelete()
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
    nat.value = { w: 0, h: 0 }
    resetView()
  }
)

// —— 图片缩放与平移 ——
// 基准是「适应窗口」：小图允许放大铺满（上限 MAX_UPSCALE，再大就糊成一片），
// 大图按 contain 缩小；userZoom 在此基准上叠乘，1 = 适应。
const MAX_UPSCALE = 4
const MIN_USER_ZOOM = 0.2
const MAX_USER_ZOOM = 12

const stageEl = ref<HTMLElement | null>(null)
/** 实际加载资源的自然尺寸：缩略图兜底时与 photo.width/height 不一致，只信 img 元素 */
const nat = ref({ w: 0, h: 0 })
const stageSize = ref({ w: 0, h: 0 })
const userZoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const panning = ref(false)

const naturalKnown = computed(
  () => nat.value.w > 0 && nat.value.h > 0 && stageSize.value.w > 0 && stageSize.value.h > 0
)
const fitScale = computed(() => {
  if (!naturalKnown.value) return 1
  return Math.min(stageSize.value.w / nat.value.w, stageSize.value.h / nat.value.h, MAX_UPSCALE)
})
const displayScale = computed(() => fitScale.value * userZoom.value)
const isFit = computed(() => userZoom.value === 1 && pan.value.x === 0 && pan.value.y === 0)
const isActualSize = computed(() => naturalKnown.value && Math.abs(displayScale.value - 1) < 0.005)
const canPan = computed(() => {
  if (!naturalKnown.value) return false
  return (
    nat.value.w * displayScale.value > stageSize.value.w + 1 ||
    nat.value.h * displayScale.value > stageSize.value.h + 1
  )
})
const imgStyle = computed(() => {
  if (!naturalKnown.value) return {}
  return {
    width: `${nat.value.w}px`,
    height: `${nat.value.h}px`,
    // translate 在 scale 之前 → 平移量按舞台像素计，不随缩放倍率放大
    transform: `translate(${pan.value.x}px, ${pan.value.y}px) scale(${displayScale.value})`
  }
})

function clampPan(): void {
  if (!naturalKnown.value) return
  const maxX = Math.max(0, (nat.value.w * displayScale.value - stageSize.value.w) / 2)
  const maxY = Math.max(0, (nat.value.h * displayScale.value - stageSize.value.h) / 2)
  pan.value = {
    x: Math.min(maxX, Math.max(-maxX, pan.value.x)),
    y: Math.min(maxY, Math.max(-maxY, pan.value.y))
  }
}

function resetView(): void {
  userZoom.value = 1
  pan.value = { x: 0, y: 0 }
}

/** @param anchor 以舞台中心为原点的指针位置；给定则缩放到光标处，否则以中心缩放 */
function setUserZoom(next: number, anchor?: { x: number; y: number }): void {
  const clamped = Math.min(MAX_USER_ZOOM, Math.max(MIN_USER_ZOOM, next))
  if (clamped === userZoom.value) return
  if (anchor) {
    const ratio = clamped / userZoom.value
    pan.value = {
      x: anchor.x - (anchor.x - pan.value.x) * ratio,
      y: anchor.y - (anchor.y - pan.value.y) * ratio
    }
  }
  userZoom.value = clamped
  clampPan()
}

function onStageWheel(e: WheelEvent): void {
  if (!naturalKnown.value) return
  const rect = stageEl.value?.getBoundingClientRect()
  const anchor = rect
    ? { x: e.clientX - (rect.left + rect.width / 2), y: e.clientY - (rect.top + rect.height / 2) }
    : undefined
  // exp 让每格倍率恒定，且触控板捏合（ctrlKey+wheel）与滚轮共用一条曲线
  setUserZoom(userZoom.value * Math.exp(-e.deltaY * 0.0018), anchor)
}

function zoomBy(dir: 1 | -1): void {
  setUserZoom(userZoom.value * (dir > 0 ? 1.25 : 0.8))
}

function zoomToFit(): void {
  resetView()
}

function zoomToActualSize(): void {
  if (!naturalKnown.value) return
  setUserZoom(1 / fitScale.value)
}

/** 双击：适应 ⇄ 实际像素 */
function toggleActualSize(): void {
  if (isActualSize.value) zoomToFit()
  else zoomToActualSize()
}

function onImgLoad(e: Event): void {
  const el = e.target as HTMLImageElement | null
  if (!el?.naturalWidth) return
  nat.value = { w: el.naturalWidth, h: el.naturalHeight }
  resetView()
}

function onPanStart(e: MouseEvent): void {
  if (!canPan.value || e.button !== 0) return
  const startX = e.clientX
  const startY = e.clientY
  const base = { ...pan.value }
  panning.value = true
  const onMove = (ev: MouseEvent): void => {
    pan.value = { x: base.x + (ev.clientX - startX), y: base.y + (ev.clientY - startY) }
    clampPan()
  }
  const onUp = (): void => {
    panning.value = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// 舞台尺寸变化（窗口缩放 / 信息面板高度变化）跟随重算；元素随分支切换重建
let stageObserver: ResizeObserver | null = null
watch(stageEl, (el) => {
  stageObserver?.disconnect()
  stageObserver = null
  if (!el) {
    stageSize.value = { w: 0, h: 0 }
    return
  }
  stageSize.value = { w: el.clientWidth, h: el.clientHeight }
  if (typeof ResizeObserver === 'undefined') return
  stageObserver = new ResizeObserver(() => {
    stageSize.value = { w: el.clientWidth, h: el.clientHeight }
    clampPan()
  })
  stageObserver.observe(el)
})

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

/** 底部常驻的那一行元数据摘要：尺寸 · 大小 · 格式 · 时间（完整信息与 EXIF 收在 ⓘ 之后） */
const metaLine = computed((): string => {
  const p = props.photo
  if (!p) return ''
  const bits: string[] = []
  if (p.width && p.height) bits.push(`${p.width}×${p.height}`)
  bits.push(formatFileSize(p.fileSize))
  const ext = p.fileName.includes('.') ? (p.fileName.split('.').pop() as string).toUpperCase() : ''
  if (ext) bits.push(ext)
  bits.push(formatDate(p.takenAt ?? p.createdAt))
  return bits.join(' · ')
})
</script>

<style scoped>
.photo-preview {
  backdrop-filter: blur(10px);
}
/* 顶栏是 48px 高的 -webkit-app-region: drag 条，而本外框 p-5 让工具栏落在 y=20..52：
   ✕ 的命中点正落在拖拽带里——那段区域不向页面派发 mousemove/点击，鼠标停在上面
   既唤不醒淡出的外框、点击也被当成拖窗，表现就是「只有左上角那个键点了没反应」。
   app-region 不继承，必须连子元素一起声明 no-drag */
.photo-preview,
.photo-preview * {
  -webkit-app-region: no-drag;
}

/* 预览条的图标键：Eagle 的预览顶栏是 32px 纯图标，不放带文字的按钮 */
.pv-icon {
  @apply flex size-8 shrink-0 items-center justify-center rounded-md text-white/70 transition-colors duration-fast hover:bg-white/15 hover:text-white;
}
.pv-icon:disabled {
  @apply cursor-not-allowed opacity-30 hover:bg-transparent;
}
/* 状态类只能写成 .pv-icon.x 并排在后面：scoped 会把 .pv-icon 编译成
   .pv-icon[data-v-*]（0-2-0），同元素上直接挂 Tailwind 工具类（0-1-0）永远压不过它
   ——收藏点亮不变琥珀色、小键 size 不生效都是这个原因 */
.pv-icon.is-fav {
  @apply text-amber-400;
}
.pv-icon.is-on {
  @apply bg-white/20 text-white;
}
.pv-icon--sm {
  @apply size-6;
}
.pv-hud {
  @apply flex size-6 items-center justify-center rounded text-white/85 transition-colors hover:bg-white/15;
}
/* 边缘翻页键：平时透明，指针进入侧边带即浮现（要命中键必然先经过带，浮现与点击同时发生） */
.pv-edge {
  @apply pointer-events-auto flex size-10 items-center justify-center rounded-full bg-black/45 text-white/75 opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 hover:bg-black/70 hover:text-white;
}
/* 注释框随内容自增高（Chromium ≥123 的 field-sizing），rows=1 是初始高度 */
.pv-note {
  @apply border border-transparent;
  field-sizing: content;
  max-height: 5.5rem;
  resize: none;
}
.pv-note:focus {
  @apply border-white/20;
}
/* 快捷键提示只在建框时浮一次，不常驻占掉工具栏一整列 */
.pv-hint {
  animation: pv-hint-fade 5s ease-out forwards;
}
@keyframes pv-hint-fade {
  0%,
  60% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

/* F4：Markdown 预览排版（v-html 内容需 :deep 穿透 scoped）。
   颜色一律走语义 token：这里曾写 bg-white + text-gray-800，而 --gray-800 在暗色端
   被 tokens.css 反转成浅灰前景（#d5dae1），于是白底配近白字、整篇像蒙了层灰 */
.leaf-md :deep(h1),
.leaf-md :deep(h2),
.leaf-md :deep(h3),
.leaf-md :deep(h4),
.leaf-md :deep(h5),
.leaf-md :deep(h6) {
  color: var(--text-primary);
  font-weight: 700;
  line-height: 1.3;
}
.leaf-md :deep(h1) {
  font-size: 1.6em;
  margin: 0.8em 0 0.5em;
}
.leaf-md :deep(h2) {
  font-size: 1.35em;
  margin: 0.9em 0 0.45em;
}
.leaf-md :deep(h3) {
  font-size: 1.15em;
  font-weight: 600;
  margin: 0.8em 0 0.4em;
}
/* h4~h6 此前没有规则，被 Tailwind preflight 拍平成正文大小，读起来像丢了层级 */
.leaf-md :deep(h4) {
  font-size: 1.05em;
  font-weight: 600;
  margin: 0.7em 0 0.35em;
}
.leaf-md :deep(h5),
.leaf-md :deep(h6) {
  font-size: 1em;
  font-weight: 600;
  margin: 0.6em 0 0.3em;
  color: var(--text-secondary);
}
.leaf-md :deep(p) {
  margin: 0.5em 0;
}
.leaf-md :deep(ul),
.leaf-md :deep(ol) {
  padding-left: 1.4em;
  margin: 0.5em 0;
}
.leaf-md :deep(ul) {
  list-style: disc;
}
.leaf-md :deep(ol) {
  list-style: decimal;
}
.leaf-md :deep(li) {
  margin: 0.2em 0;
}
.leaf-md :deep(li)::marker {
  color: var(--text-muted);
}
.leaf-md :deep(strong) {
  font-weight: 650;
  color: var(--text-primary);
}
.leaf-md :deep(hr) {
  margin: 1.1em 0;
  border: 0;
  border-top: 1px solid var(--border-subtle);
}
.leaf-md :deep(blockquote) {
  border-left: 3px solid var(--border-default);
  padding-left: 0.8em;
  margin: 0.6em 0;
  color: var(--text-secondary);
}
.leaf-md :deep(code) {
  background: var(--surface-hover);
  border-radius: 4px;
  padding: 0.1em 0.35em;
  font-size: 0.9em;
  font-family: var(--font-mono);
}
.leaf-md :deep(pre) {
  background: var(--surface-0);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 0.9em 1.1em;
  overflow-x: auto;
  margin: 0.6em 0;
  line-height: 1.55;
}
.leaf-md :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
}
.leaf-md :deep(a) {
  color: var(--text-brand);
  text-decoration: underline;
}
.leaf-md :deep(img) {
  max-width: 100%;
  border-radius: 6px;
}
/* 宽表格横向滚，不把卡片撑破 */
.leaf-md :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  margin: 0.6em 0;
}
.leaf-md :deep(th),
.leaf-md :deep(td) {
  border: 1px solid var(--border-subtle);
  padding: 0.35em 0.7em;
  text-align: left;
}
.leaf-md :deep(th) {
  background: var(--surface-hover);
  font-weight: 600;
  color: var(--text-primary);
}
/* GFM 任务列表：markdown-it 输出的是 disabled checkbox */
.leaf-md :deep(li input[type='checkbox']) {
  margin-right: 0.4em;
  accent-color: var(--brand-500);
}
/* highlight.js token 配色：只用既有语义色，不新增 hex */
.leaf-md :deep(.hljs-comment),
.leaf-md :deep(.hljs-quote) {
  color: var(--text-muted);
  font-style: italic;
}
.leaf-md :deep(.hljs-keyword),
.leaf-md :deep(.hljs-selector-tag),
.leaf-md :deep(.hljs-doctag) {
  color: var(--brand-500);
}
.leaf-md :deep(.hljs-string),
.leaf-md :deep(.hljs-regexp),
.leaf-md :deep(.hljs-addition) {
  color: var(--color-success);
}
.leaf-md :deep(.hljs-number),
.leaf-md :deep(.hljs-literal),
.leaf-md :deep(.hljs-symbol),
.leaf-md :deep(.hljs-bullet) {
  color: var(--color-warning);
}
.leaf-md :deep(.hljs-title),
.leaf-md :deep(.hljs-section),
.leaf-md :deep(.hljs-name) {
  color: var(--text-primary);
  font-weight: 600;
}
.leaf-md :deep(.hljs-type),
.leaf-md :deep(.hljs-class .hljs-title),
.leaf-md :deep(.hljs-built_in) {
  color: var(--color-info);
}
.leaf-md :deep(.hljs-attr),
.leaf-md :deep(.hljs-attribute),
.leaf-md :deep(.hljs-variable),
.leaf-md :deep(.hljs-property) {
  color: var(--accent-500);
}
.leaf-md :deep(.hljs-meta),
.leaf-md :deep(.hljs-deletion) {
  color: var(--text-tertiary);
}
.leaf-md :deep(.hljs-emphasis) {
  font-style: italic;
}
.leaf-md :deep(.hljs-strong) {
  font-weight: 650;
}
</style>
