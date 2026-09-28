// @vitest-environment happy-dom
/**
 * 「添加至文件夹」归组参数必须落 IPC 前摊平成普通数组。
 *
 * 父层 index.vue 绑定的是 selectedIds（ref 深转换后的 reactive Proxy），
 * 旧实现把 props.photoIdsToAdd 原样传给 ipcRenderer.invoke，V8 结构化克隆
 * 拒绝 Proxy → toast「归组失败：An object could not be cloned」，库里毫无写入。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive, isProxy } from 'vue'
import FolderModal from '../FolderModal.vue'

const apiMocks = vi.hoisted(() => ({
  listPhotoFolders: vi.fn(),
  assignPhotosToFolder: vi.fn(),
  createPhotoFolder: vi.fn(),
  setFolderViewSettings: vi.fn()
}))

// UModal 以 stub 内联渲染插槽（Teleport 在 happy-dom 下不进 wrapper）
const globalStubs = {
  stubs: {
    UModal: {
      template:
        '<div class="u-modal-stub"><slot name="title" /><slot /><slot name="footer" /></div>'
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'api', { configurable: true, value: { photos: apiMocks } })
  apiMocks.listPhotoFolders.mockResolvedValue([
    { id: 'fa', name: 'A 夹', photoCount: 1 },
    { id: 'fb', name: 'B 夹', photoCount: 2 }
  ])
  apiMocks.assignPhotosToFolder.mockResolvedValue(2)
  apiMocks.createPhotoFolder.mockResolvedValue({ id: 'fn', name: '新夹' })
  apiMocks.setFolderViewSettings.mockResolvedValue(undefined)
})

describe('FolderModal · photoIdsToAdd 过 IPC 不带 reactive Proxy', () => {
  it('点已有文件夹：归组参数是普通数组', async () => {
    const w = mount(FolderModal, {
      // 复刻真实绑定：index.vue 传 selectedIds.value（reactive 代理）
      props: { photoIdsToAdd: reactive(['p1', 'p2']) },
      global: globalStubs
    })
    await flushPromises()
    const row = w.find('.max-h-48 button')
    expect(row.exists()).toBe(true)
    await row.trigger('click')
    await flushPromises()
    expect(apiMocks.assignPhotosToFolder).toHaveBeenCalledTimes(1)
    const arg = apiMocks.assignPhotosToFolder.mock.calls[0][1]
    expect(arg).toEqual(['p1', 'p2'])
    expect(isProxy(arg)).toBe(false)
  })

  it('新建文件夹并归组：归组参数是普通数组', async () => {
    const w = mount(FolderModal, {
      props: { photoIdsToAdd: reactive(['p1']) },
      global: globalStubs
    })
    await flushPromises()
    await w.find('input[placeholder="新建文件夹..."]').setValue('新夹')
    const createBtn = w.findAll('button').find((b) => b.text() === '新建')
    expect(createBtn).toBeTruthy()
    await createBtn!.trigger('click')
    await flushPromises()
    expect(apiMocks.createPhotoFolder).toHaveBeenCalledTimes(1)
    expect(apiMocks.assignPhotosToFolder).toHaveBeenCalledTimes(1)
    const arg = apiMocks.assignPhotosToFolder.mock.calls[0][1]
    expect(arg).toEqual(['p1'])
    expect(isProxy(arg)).toBe(false)
  })
})
