/**
 * Leaf · 通知中心（阶段 4.6 轻量版）
 *
 * 纯渲染层聚合，数据源两条：
 * - photos:processing 处理管线完成/失败事件（整批收尾才提示，3s 去抖防刷屏）
 * - update:event 更新事件（发现新版本/下载完成/失败）
 *
 * 模块单例：bind() 幂等（只挂一次监听），items 上限 30 条。
 */
import { computed, ref, type ComputedRef } from 'vue'
import type { UpdateEvent } from '../types/update'

export interface NotificationItem {
  id: string
  kind: 'processing' | 'update'
  title: string
  description?: string
  ts: number
  read: boolean
}

const MAX_ITEMS = 30
const BATCH_NOTIFY_GAP_MS = 3000

const items = ref<NotificationItem[]>([])
let unsubs: Array<() => void> | null = null
let lastBatchNotify = 0

function push(item: Omit<NotificationItem, 'id' | 'ts' | 'read'>): void {
  // 二十八轮：设置页·通知（localStorage，默认开；master 为「弹出通知」总开关）
  try {
    if (localStorage.getItem('leaf.notify.master') === '0') return
    if (localStorage.getItem(`leaf.notify.${item.kind}`) === '0') return
  } catch {
    /* ignore */
  }
  items.value.unshift({
    ...item,
    id: `${item.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: Date.now(),
    read: false
  })
  if (items.value.length > MAX_ITEMS) items.value.splice(MAX_ITEMS)
}

export function useNotifications(): {
  items: typeof items
  unreadCount: ComputedRef<number>
  hasUnread: ComputedRef<boolean>
  bind: () => void
  markAllRead: () => void
  markRead: (id: string) => void
  clearAll: () => void
  resetForTests: () => void
} {
  const unreadCount = computed(() => items.value.filter((i) => !i.read).length)
  const hasUnread = computed(() => unreadCount.value > 0)

  function bind(): void {
    if (unsubs) return
    const offs: Array<() => void> = []

    // 处理管线：整批收尾才提示（done>=total），失败单独提示；3s 去抖
    offs.push(
      window.api.photos.onProcessing((p) => {
        if (p.status === 'failed') {
          push({
            kind: 'processing',
            title: '素材处理失败',
            description: `已完成 ${p.done}/${p.total}，有素材处理出错`
          })
          return
        }
        if (p.done < p.total) return
        const now = Date.now()
        if (now - lastBatchNotify < BATCH_NOTIFY_GAP_MS) return
        lastBatchNotify = now
        push({
          kind: 'processing',
          title: '素材处理完成',
          description: `已完成 ${p.done}/${p.total} 项（缩略图/EXIF/哈希）`
        })
      })
    )

    // 更新事件
    offs.push(
      window.api.update.onEvent((e: UpdateEvent) => {
        if (e.status === 'available') {
          push({
            kind: 'update',
            title: '发现新版本',
            description: e.version ? `版本 ${e.version} 可下载` : undefined
          })
        } else if (e.status === 'downloaded') {
          push({
            kind: 'update',
            title: '新版本已下载',
            description: e.version ? `版本 ${e.version} 可在设置中重启安装` : undefined
          })
        } else if (e.status === 'error') {
          push({ kind: 'update', title: '更新失败', description: e.error ?? undefined })
        }
      })
    )

    unsubs = offs
  }

  function markAllRead(): void {
    for (const i of items.value) i.read = true
  }
  function markRead(id: string): void {
    const it = items.value.find((i) => i.id === id)
    if (it) it.read = true
  }
  function clearAll(): void {
    items.value = []
  }

  /** 测试辅助：解绑全部监听并清空状态 */
  function resetForTests(): void {
    items.value = []
    unsubs?.forEach((u) => u())
    unsubs = null
    lastBatchNotify = 0
  }

  return { items, unreadCount, hasUnread, bind, markAllRead, markRead, clearAll, resetForTests }
}
