// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import Index from '../index.vue'

/**
 * 复现：点击文件夹切换 → shouldUpdateComponent 读 null.emitsOptions 崩溃。
 * 挂载真实 Index（photos/index.vue），mock window.api，切换 folder 视图。
 */

const errors: unknown[] = []

function mockApi(): void {
  const photo = {
    id: 'p1',
    filePath: '/tmp/a.png',
    fileName: 'a.png',
    fileSize: 100,
    createdAt: 0,
    importedAt: 0,
    modifiedAt: 0,
    tags: [],
    isFavorite: false,
    dateSection: '2026-09-01',
    rating: 0,
    source: 'manual',
    thumbStatus: 1,
    kind: 'image'
  }
  const folder = { id: 'f1', name: '测试文件夹', createdAt: 0, updatedAt: 0 }
  const w = window as unknown as Record<string, unknown>
  // 万能 mock：任何属性都是「可调用 + 可继续取属性」的函数对象
  const universal = (): unknown =>
    new Proxy(vi.fn(() => Promise.resolve([])), {
      get: (t, p) =>
        p in t ? (t as unknown as Record<string, unknown>)[p as string] : universal(),
      apply: () => Promise.resolve([])
    })
  w.api = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'photos') {
          return new Proxy(
            {},
            {
              get(_t2, m) {
                if (m === 'getByDateSection') return () => Promise.resolve([{ dateSection: '2026-09-01', photos: [photo] }])
                if (m === 'listPhotoFolders') return () => Promise.resolve([folder])
                if (m === 'listAlbums' || m === 'listSmartAlbums' || m === 'getUnsorted' || m === 'getRecent') return () => Promise.resolve([])
                if (m === 'getFolderPhotos') return () => Promise.resolve([photo])
                if (m === 'onProcessing' || m === 'onEmbedding') return () => () => {}
                if (typeof m === 'string' && m.startsWith('on')) return () => () => {}
                return () => Promise.resolve([])
              }
            }
          )
        }
        if (prop === 'tag') return { getTags: () => Promise.resolve([]) }
        if (typeof prop === 'string' && prop.startsWith('on')) return () => () => {}
        return universal()
      }
    }
  )
}

describe('复现文件夹切换崩溃', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    errors.length = 0
    localStorage.clear()
    mockApi()
    setActivePinia(createPinia())
  })

  it('setView 到 folder 视图不应抛 emitsOptions 错误', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/photos', component: Index }]
    })
    await router.push('/photos')

    const wrapper = mount(Index, {
      global: {
        plugins: [router]
      },
      attachTo: document.body
    })
    await flushPromises()

    // 模拟侧栏点击文件夹：LibraryPanel.openItem 的行为
    const { useLibraryTabs } = await import('@renderer/stores/libraryTabs')
    const tabs = useLibraryTabs()
    expect(() => tabs.setView('folder:f1', '测试文件夹')).not.toThrow()
    try {
      await flushPromises()
      await wrapper.vm.$nextTick()
    } catch (e) {
      errors.push(e)
    }

    // 二次切换（folder → folder）
    try {
      tabs.setView('folder:f2', '另一个')
      await flushPromises()
    } catch (e) {
      errors.push(e)
    }

    expect(errors).toEqual([])
    wrapper.unmount()
  })
})
