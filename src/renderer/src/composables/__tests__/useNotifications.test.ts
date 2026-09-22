/**
 * useNotifications · 通知中心（阶段 4.6）
 *
 * 验证：bind 幂等（只挂一次监听）、update 事件入列、已读/清空操作。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useNotifications } from '../useNotifications'

const processingCbs: Array<(p: unknown) => void> = []
const updateCbs: Array<(e: unknown) => void> = []

function stubApi(): void {
  const api = {
    photos: {
      onProcessing: (cb: (p: unknown) => void) => {
        processingCbs.push(cb)
        return () => {}
      }
    },
    update: {
      onEvent: (cb: (e: unknown) => void) => {
        updateCbs.push(cb)
        return () => {}
      }
    }
  }
  vi.stubGlobal('window', { api } as unknown as Window & typeof globalThis)
}

beforeEach(() => {
  processingCbs.length = 0
  updateCbs.length = 0
  stubApi()
  // 模块单例：解绑监听并清空上个用例残留
  useNotifications().resetForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useNotifications', () => {
  it('bind 幂等：重复调用只注册一次监听', () => {
    const notif = useNotifications()
    notif.bind()
    notif.bind()
    expect(updateCbs).toHaveLength(1)
    expect(processingCbs).toHaveLength(1)
  })

  it('update 事件入列并初始未读', () => {
    const notif = useNotifications()
    notif.bind()
    expect(notif.items.value).toHaveLength(0)
    updateCbs[0]({ status: 'available', version: '1.1.0' })
    expect(notif.items.value).toHaveLength(1)
    expect(notif.items.value[0].title).toBe('发现新版本')
    expect(notif.items.value[0].read).toBe(false)
    expect(notif.unreadCount.value).toBe(1)
    expect(notif.hasUnread.value).toBe(true)
  })

  it('markAllRead / markRead / clearAll 生效', () => {
    const notif = useNotifications()
    notif.bind()
    updateCbs[0]({ status: 'available' })
    updateCbs[0]({ status: 'downloaded' })
    expect(notif.items.value).toHaveLength(2)

    notif.markAllRead()
    expect(notif.unreadCount.value).toBe(0)

    // 制造一条新未读后再 markRead
    updateCbs[0]({ status: 'error', error: '网络错误' })
    expect(notif.unreadCount.value).toBe(1)
    notif.markRead(notif.items.value[0].id)
    expect(notif.unreadCount.value).toBe(0)

    notif.clearAll()
    expect(notif.items.value).toHaveLength(0)
  })
})
