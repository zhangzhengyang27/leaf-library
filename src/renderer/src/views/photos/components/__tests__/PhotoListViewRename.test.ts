// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PhotoListView from '../PhotoListView.vue'
import type { Photo, PhotoSection } from '../../../../types/photo'

/**
 * 列表布局的行内就地重命名（审查二轮：P1-11 只修了网格，列表/自由网格下
 * renamingId 无人消费 → 右键/F2 点了完全没反应）。
 * 覆盖：prop 驱动进入编辑态、预选主文件名、Enter 提交契约、Esc 取消、无变化取消。
 */

const api = {
  photos: {
    getById: vi.fn(),
    getTags: vi.fn(async () => []),
    renamePhotos: vi.fn(async () => ({ renamed: [], conflicts: [] }))
  },
  preferences: { get: vi.fn(async () => undefined) }
}

function makePhoto(over: Partial<Photo> = {}): Photo {
  return {
    id: 'p1',
    filePath: '/lib/cat food.png',
    fileName: 'cat food.png',
    fileSize: 1000,
    width: 100,
    height: 80,
    createdAt: 0,
    importedAt: 0,
    modifiedAt: 0,
    isFavorite: false,
    rating: 0,
    tags: [],
    kind: 'image',
    dateSection: '2026-09',
    ...over
  } as Photo
}

const sections: PhotoSection[] = [{ dateSection: '2026-09', photos: [makePhoto()] }]

function mountView(renamingId: string | null = null) {
  return mount(PhotoListView, {
    props: {
      sections,
      selectedSet: new Set<string>(),
      isSelectionMode: false,
      loading: false,
      mode: 'normal' as const,
      hasMore: false,
      renamingId
    },
    global: { plugins: [createPinia()], stubs: { AssetThumb: true } }
  })
}

describe('PhotoListView · 行内就地重命名', () => {
  beforeEach(() => {
    // PhotoListView → usePhotoClipboard → store，需要活动 Pinia
    setActivePinia(createPinia())
    vi.clearAllMocks()
    Object.defineProperty(window, 'api', { configurable: true, value: api })
  })

  it('renamingId prop 驱动进入编辑态并预选主文件名', async () => {
    const wrapper = mountView(null)
    expect(wrapper.find('input[data-rename-input]').exists()).toBe(false)

    await wrapper.setProps({ renamingId: 'p1' })
    await flushPromises()
    const input = wrapper.find('input[data-rename-input]')
    expect(input.exists()).toBe(true)
    // 扩展名保留在草稿里（与 PhotoGrid/CardMeta 一致，提交时按原名比对）
    expect((input.element as HTMLInputElement).value).toBe('cat food.png')
  })

  it('Enter 提交 rename-commit(photo, newName)，与原名相同则只 cancel', async () => {
    const wrapper = mountView('p1')
    await flushPromises()
    const input = wrapper.find('input[data-rename-input]')
    await input.setValue('renamed.png')
    await input.trigger('keydown', { key: 'Enter' })
    const commit = wrapper.emitted('rename-commit')
    expect(commit).toBeTruthy()
    expect(commit![0][1]).toBe('renamed.png')
    expect((commit![0][0] as Photo).id).toBe('p1')
    expect(wrapper.emitted('rename-cancel')).toBeFalsy()

    // 未改名：Enter/blur 不得产生多余的 commit
    const w2 = mountView('p1')
    await flushPromises()
    const i2 = w2.find('input[data-rename-input]')
    await i2.trigger('keydown', { key: 'Enter' })
    await i2.trigger('blur')
    expect(w2.emitted('rename-commit')).toBeFalsy()
    expect(w2.emitted('rename-cancel')).toBeTruthy()
  })

  it('Esc 取消且不提交', async () => {
    const wrapper = mountView('p1')
    await flushPromises()
    const input = wrapper.find('input[data-rename-input]')
    await input.setValue('will not apply.png')
    await input.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('rename-commit')).toBeFalsy()
    expect(wrapper.emitted('rename-cancel')).toBeTruthy()
    expect(wrapper.find('input[data-rename-input]').exists()).toBe(false)
  })

  it('prop 清空即退出编辑态（父层提交后复位）', async () => {
    const wrapper = mountView('p1')
    await flushPromises()
    expect(wrapper.find('input[data-rename-input]').exists()).toBe(true)
    await wrapper.setProps({ renamingId: null })
    expect(wrapper.find('input[data-rename-input]').exists()).toBe(false)
  })
})
