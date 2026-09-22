<script setup lang="ts">
/**
 * StatsView · 素材库统计面板（阶段 4.5）
 *
 * 顶部概览卡（总数/收藏/总大小/总时长）+ 五个分布维度：
 * 类型分布 / 格式分布 / 大小分布 / 近 12 月导入趋势 / 评分分布。
 * 数据来自主进程 SQL 聚合（PhotoRepository.getStatsDetail），纯 CSS 条形图无图表依赖。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@components/AppIcon.vue'
import UBadge from '@components/ui/UBadge.vue'
import { KIND_LABELS } from '@shared/assetTypes'

interface StatsDetail {
  total: number
  favorites: number
  totalSize: number
  totalDuration: number
  byKind: Record<string, number>
  byFormat: Array<{ format: string; count: number }>
  bySize: Array<{ label: string; count: number }>
  importTrend: Array<{ month: string; count: number }>
  ratingDist: Array<{ rating: number; count: number }>
}

const router = useRouter()

const goBack = (): void => {
  router.push('/photos').catch(() => {
    /* ignore */
  })
}

const stats = ref<StatsDetail | null>(null)
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    stats.value = await window.api.photos.getStats()
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    loading.value = false
  }
})

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function fmtDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total}s`
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h === 0) return `${m} 分钟`
  return `${h} 小时 ${m} 分钟`
}

/** 分布条最大值的占比（0-100） */
function pct(value: number, max: number): string {
  if (max <= 0) return '0%'
  return `${Math.round((value / max) * 100)}%`
}

const kindItems = computed(() =>
  Object.entries(stats.value?.byKind ?? {}).map(([kind, count]) => ({
    kind,
    label: KIND_LABELS[kind as keyof typeof KIND_LABELS] ?? kind,
    count
  }))
)
const maxKind = computed(() => Math.max(1, ...kindItems.value.map((k) => k.count)))
const maxFormat = computed(() => Math.max(1, ...(stats.value?.byFormat ?? []).map((f) => f.count)))
const maxSize = computed(() => Math.max(1, ...(stats.value?.bySize ?? []).map((s) => s.count)))
const maxTrend = computed(() =>
  Math.max(1, ...(stats.value?.importTrend ?? []).map((t) => t.count))
)
const maxRating = computed(() =>
  Math.max(1, ...(stats.value?.ratingDist ?? []).map((r) => r.count))
)
</script>

<template>
  <div class="StatsView mx-auto w-full max-w-[820px] px-10 py-12">
    <button
      type="button"
      class="mb-6 flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg-primary focus-visible:shadow-ring-focus focus-visible:outline-none"
      @click="goBack"
    >
      <AppIcon icon="ic-modal-back" />
      <span>返回素材库</span>
    </button>

    <div class="mb-6 flex items-center gap-2">
      <h1 class="text-lg font-semibold text-fg-primary">素材库统计</h1>
      <UBadge variant="brand">统计</UBadge>
    </div>

    <!-- 加载 / 空态 -->
    <div v-if="loading" class="py-20 text-center text-sm text-fg-muted">正在统计…</div>
    <div v-else-if="error" class="py-20 text-center text-sm text-danger">
      统计加载失败：{{ error }}
    </div>
    <div v-else-if="!stats || stats.total === 0" class="py-20 text-center text-sm text-fg-muted">
      图库还是空的，导入一些素材后这里会有更多统计。
    </div>

    <template v-else>
      <!-- 概览卡 -->
      <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="rounded-lg border border-line-subtle bg-surface-1 p-4 shadow-sm">
          <p class="text-xs text-fg-tertiary">素材总数</p>
          <p class="mt-1 text-2xl font-semibold text-fg-primary tabular-nums">{{ stats.total }}</p>
        </div>
        <div class="rounded-lg border border-line-subtle bg-surface-1 p-4 shadow-sm">
          <p class="text-xs text-fg-tertiary">收藏</p>
          <p class="mt-1 text-2xl font-semibold text-fg-primary tabular-nums">
            {{ stats.favorites }}
          </p>
        </div>
        <div class="rounded-lg border border-line-subtle bg-surface-1 p-4 shadow-sm">
          <p class="text-xs text-fg-tertiary">占用空间</p>
          <p class="mt-1 text-2xl font-semibold text-fg-primary tabular-nums">
            {{ fmtBytes(stats.totalSize) }}
          </p>
        </div>
        <div class="rounded-lg border border-line-subtle bg-surface-1 p-4 shadow-sm">
          <p class="text-xs text-fg-tertiary">视频/音频总时长</p>
          <p class="mt-1 text-2xl font-semibold text-fg-primary tabular-nums">
            {{ fmtDuration(stats.totalDuration) }}
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <!-- 类型分布 -->
        <div class="rounded-lg border border-line-subtle bg-surface-1 p-4 shadow-sm">
          <h2 class="mb-3 text-sm font-medium text-fg-primary">素材类型</h2>
          <div class="flex flex-col gap-2">
            <div v-for="item in kindItems" :key="item.kind" class="flex items-center gap-2">
              <span class="w-12 shrink-0 text-xs text-fg-secondary">{{ item.label }}</span>
              <div class="h-2 flex-1 overflow-hidden rounded-full bg-surface-hover">
                <div
                  class="h-full rounded-full bg-brand-500/80 transition-all duration-300"
                  :style="{ width: pct(item.count, maxKind) }"
                />
              </div>
              <span class="w-8 shrink-0 text-right text-xs text-fg-tertiary tabular-nums">
                {{ item.count }}
              </span>
            </div>
          </div>
        </div>

        <!-- 大小分布 -->
        <div class="rounded-lg border border-line-subtle bg-surface-1 p-4 shadow-sm">
          <h2 class="mb-3 text-sm font-medium text-fg-primary">文件大小</h2>
          <div class="flex flex-col gap-2">
            <div v-for="item in stats.bySize" :key="item.label" class="flex items-center gap-2">
              <span class="w-20 shrink-0 text-xs text-fg-secondary">{{ item.label }}</span>
              <div class="h-2 flex-1 overflow-hidden rounded-full bg-surface-hover">
                <div
                  class="h-full rounded-full bg-sky-500/80 transition-all duration-300"
                  :style="{ width: pct(item.count, maxSize) }"
                />
              </div>
              <span class="w-8 shrink-0 text-right text-xs text-fg-tertiary tabular-nums">
                {{ item.count }}
              </span>
            </div>
          </div>
        </div>

        <!-- 导入趋势（近 12 月，纯 CSS 柱状） -->
        <div class="rounded-lg border border-line-subtle bg-surface-1 p-4 shadow-sm">
          <h2 class="mb-3 text-sm font-medium text-fg-primary">导入趋势 · 近 12 月</h2>
          <div class="flex h-32 items-end gap-1.5">
            <div
              v-for="item in stats.importTrend"
              :key="item.month"
              class="group relative flex h-full flex-1 flex-col justify-end"
            >
              <div
                class="w-full rounded-t bg-brand-500/70 transition-all duration-300 group-hover:bg-brand-500"
                :style="{ height: pct(item.count, maxTrend) }"
              />
              <span
                class="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-fg-primary opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
              >
                {{ item.month }} · {{ item.count }}
              </span>
            </div>
          </div>
          <div class="mt-2 flex gap-1.5">
            <span
              v-for="item in stats.importTrend"
              :key="item.month"
              class="flex-1 truncate text-center text-[9px] text-fg-tertiary"
            >
              {{ item.month.slice(5) }}
            </span>
          </div>
        </div>

        <!-- 评分分布 -->
        <div class="rounded-lg border border-line-subtle bg-surface-1 p-4 shadow-sm">
          <h2 class="mb-3 text-sm font-medium text-fg-primary">评分分布</h2>
          <div class="flex flex-col gap-2">
            <div
              v-for="item in stats.ratingDist"
              :key="item.rating"
              class="flex items-center gap-2"
            >
              <span class="w-12 shrink-0 text-xs text-amber-400">
                {{ item.rating === 0 ? '未评分' : '★'.repeat(item.rating) }}
              </span>
              <div class="h-2 flex-1 overflow-hidden rounded-full bg-surface-hover">
                <div
                  class="h-full rounded-full bg-amber-400/80 transition-all duration-300"
                  :style="{ width: pct(item.count, maxRating) }"
                />
              </div>
              <span class="w-8 shrink-0 text-right text-xs text-fg-tertiary tabular-nums">
                {{ item.count }}
              </span>
            </div>
          </div>
        </div>

        <!-- 格式分布（Top 12） -->
        <div class="rounded-lg border border-line-subtle bg-surface-1 p-4 shadow-sm lg:col-span-2">
          <h2 class="mb-3 text-sm font-medium text-fg-primary">格式分布 · Top 12</h2>
          <div class="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            <div v-for="item in stats.byFormat" :key="item.format" class="flex items-center gap-2">
              <code class="w-16 shrink-0 truncate text-xs text-fg-secondary">
                .{{ item.format }}
              </code>
              <div class="h-2 flex-1 overflow-hidden rounded-full bg-surface-hover">
                <div
                  class="h-full rounded-full bg-emerald-500/80 transition-all duration-300"
                  :style="{ width: pct(item.count, maxFormat) }"
                />
              </div>
              <span class="w-8 shrink-0 text-right text-xs text-fg-tertiary tabular-nums">
                {{ item.count }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
