<script setup lang="ts">
/**
 * NotificationCenter · 工具栏铃铛 + 下拉通知面板（阶段 4.6）
 *
 * 数据源：photos:processing（整批完成/失败）+ update:event（新版本/下载完成/失败）。
 * 弹层模式沿用 LayoutPopover：relative + absolute + document capture mousedown 点外关闭。
 * 打开面板即标记全部已读；未读数显示为铃铛红点徽标。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import { useNotifications, type NotificationItem } from '@composables/useNotifications'

const notif = useNotifications()
const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

function toggle(): void {
  open.value = !open.value
  if (open.value) notif.markAllRead()
}

function onDocDown(e: MouseEvent): void {
  if (open.value && rootRef.value && !rootRef.value.contains(e.target as Node)) {
    open.value = false
  }
}

function fmtTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function iconOf(item: NotificationItem): string {
  if (item.kind === 'update') return 'ic_refresh'
  return item.title.includes('失败') ? 'ic-modal-status-error' : 'ic-modal-status-success'
}

function colorOf(item: NotificationItem): string {
  if (item.kind === 'update') return 'text-sky-500'
  return item.title.includes('失败') ? 'text-danger' : 'text-emerald-500'
}

onMounted(() => {
  notif.bind()
  document.addEventListener('mousedown', onDocDown, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocDown, true)
})

/** 与 TitleBar 图标按钮一致的基类 */
const iconBtn =
  'flex h-8 w-8 items-center justify-center rounded-md text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg-primary focus-visible:shadow-ring-focus focus-visible:outline-none'
</script>

<template>
  <div ref="rootRef" class="relative">
    <button
      type="button"
      :class="iconBtn"
      :aria-label="notif.hasUnread.value ? `通知（${notif.unreadCount.value} 条未读）` : '通知'"
      @click="toggle"
    >
      <span class="relative">
        <AppIcon icon="ic_notification" />
        <span
          v-if="notif.hasUnread.value"
          class="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-danger text-[8px] font-semibold leading-none text-white"
        >
          {{ notif.unreadCount.value > 9 ? '9+' : notif.unreadCount.value }}
        </span>
      </span>
    </button>

    <!-- 铃铛在标题栏左段（距窗口左缘仅 ~209px），面板必须向右展开，否则被窗口裁掉 -->
    <div
      v-if="open"
      class="absolute left-0 top-full z-[1100] mt-1 w-80 overflow-hidden rounded-lg border border-line-default bg-surface-3 shadow-lg animate-in fade-in slide-in-from-top-1 duration-100"
    >
      <header class="flex items-center justify-between border-b border-line-subtle px-3 py-2">
        <span class="text-xs font-semibold text-fg-primary">通知</span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="text-[10px] text-fg-muted transition-colors hover:text-fg-primary"
            :disabled="notif.items.value.length === 0"
            @click="notif.clearAll"
          >
            清空
          </button>
        </div>
      </header>

      <div class="max-h-80 overflow-y-auto">
        <p
          v-if="notif.items.value.length === 0"
          class="px-4 py-10 text-center text-xs text-fg-muted"
        >
          暂无通知。素材处理完成、发现新版本时会出现在这里。
        </p>
        <ul v-else class="flex flex-col py-1">
          <li v-for="item in notif.items.value" :key="item.id">
            <button
              type="button"
              class="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors duration-instant hover:bg-surface-hover"
              :class="item.read ? 'opacity-60' : ''"
              @click="notif.markRead(item.id)"
            >
              <span :class="['mt-0.5 shrink-0', colorOf(item)]">
                <AppIcon :icon="iconOf(item)" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-xs font-medium text-fg-primary">
                  {{ item.title }}
                </span>
                <span
                  v-if="item.description"
                  class="mt-0.5 block truncate text-[11px] text-fg-tertiary"
                  :title="item.description"
                >
                  {{ item.description }}
                </span>
              </span>
              <span class="shrink-0 text-[10px] text-fg-muted">{{ fmtTime(item.ts) }}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
