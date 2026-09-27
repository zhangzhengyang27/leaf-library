// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ManagedPlugin } from '@shared/plugin'

/**
 * 插件中心 P1 · usePluginRegistry（D-025）
 * 渲染层单例：全量列表 + enabled 过滤 + 乐观启停（IPC 失败回滚）。
 */

const mp = (id: string, enabled: boolean, category = 'inspector'): ManagedPlugin =>
  ({
    id,
    name: id,
    version: '1.0.0',
    category,
    entry: 'index.html',
    formats: [],
    dir: `/tmp/plugins/${id}`,
    enabled,
    source: 'imported'
  }) as ManagedPlugin

const api = {
  plugins: {
    listAll: vi.fn<[], Promise<ManagedPlugin[]>>(),
    setEnabled: vi.fn<[string, boolean], Promise<{ ok: boolean; error?: string }>>()
  }
}

beforeEach(() => {
  vi.resetModules()
  api.plugins.listAll = vi.fn()
  api.plugins.setEnabled = vi.fn()
  ;(window as unknown as { api: unknown }).api = { plugins: api.plugins }
})

describe('usePluginRegistry', () => {
  it('enabledPlugins 只含 enabled=true；reload 拉全量', async () => {
    api.plugins.listAll.mockResolvedValue([mp('a', true), mp('b', false)])
    const { usePluginRegistry } = await import('../usePluginRegistry')
    const reg = usePluginRegistry()
    await reg.reload()
    expect(reg.plugins.value.map((p) => p.id)).toEqual(['a', 'b'])
    expect(reg.enabledPlugins.value.map((p) => p.id)).toEqual(['a'])
  })

  it('setEnabled 乐观更新；IPC 失败回滚并 rethrow', async () => {
    api.plugins.listAll.mockResolvedValue([mp('a', true), mp('b', false)])
    const { usePluginRegistry } = await import('../usePluginRegistry')
    const reg = usePluginRegistry()
    await reg.reload()
    api.plugins.setEnabled.mockResolvedValueOnce({ ok: true })
    await reg.setEnabled('b', true)
    expect(reg.enabledPlugins.value.map((p) => p.id)).toEqual(['a', 'b'])
    api.plugins.setEnabled.mockRejectedValueOnce(new Error('ipc down'))
    await expect(reg.setEnabled('b', false)).rejects.toThrow('ipc down')
    expect(reg.enabledPlugins.value.map((p) => p.id)).toEqual(['a', 'b']) // 回滚
    expect(api.plugins.setEnabled).toHaveBeenCalledWith('b', false)
  })

  it('单例：两次调用同一份状态', async () => {
    api.plugins.listAll.mockResolvedValue([mp('a', true)])
    const { usePluginRegistry } = await import('../usePluginRegistry')
    const r1 = usePluginRegistry()
    await r1.reload()
    const r2 = usePluginRegistry()
    expect(r2.plugins.value.map((p) => p.id)).toEqual(['a'])
  })
})
