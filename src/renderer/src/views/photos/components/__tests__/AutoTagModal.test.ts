// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AutoTagModal from '../AutoTagModal.vue'
import type { PhotoFolder } from '../../../../types/photo'

/**
 * 二十四轮：自动标签可视化编辑器（Eagle 设置自动标签对话框）组件测试。
 * 覆盖：规则回填 / 胶囊增删 / 搜索建议与新建 / 保存语义（改名 + 规则下发）。
 * UModal 以 stub 内联渲染插槽（Teleport 在 happy-dom 下不进 wrapper）。
 */

const mockFolder: PhotoFolder = {
  id: 'f1',
  name: '测试文件',
  parentId: null,
  photoCount: 0,
  createdAt: 0,
  updatedAt: 0
}

const apiMocks = vi.hoisted(() => ({
  getFolderAutoTags: vi.fn(),
  setFolderAutoTags: vi.fn(),
  renamePhotoFolder: vi.fn()
}))

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      photos: {
        getFolderAutoTags: apiMocks.getFolderAutoTags,
        setFolderAutoTags: apiMocks.setFolderAutoTags,
        renamePhotoFolder: apiMocks.renamePhotoFolder
      }
    }
  })
})

const globalStubs = {
  stubs: {
    UModal: {
      template: '<div class="u-modal-stub"><slot name="title" /><slot /><slot name="footer" /></div>'
    }
  }
}

function mountModal(dictionaryTags: string[] = ['风景', '人像', '城市']) {
  return mount(AutoTagModal, {
    props: { folder: mockFolder, dictionaryTags },
    global: globalStubs
  })
}

async function typeQuery(w: ReturnType<typeof mountModal>, text: string): Promise<void> {
  const input = w.find('input[placeholder="添加标签"]')
  await input.setValue(text)
}

describe('AutoTagModal', () => {
  it('载入文件夹名称与已保存规则', async () => {
    apiMocks.getFolderAutoTags.mockResolvedValue(['风景', '旅行'])
    const w = mountModal()
    await flushPromises()
    expect(apiMocks.getFolderAutoTags).toHaveBeenCalledWith('f1')
    expect(w.html()).toContain('风景')
    expect(w.html()).toContain('旅行')
    const nameInput = w.find('input[type="text"]')
    expect((nameInput.element as HTMLInputElement).value).toBe('测试文件')
  })

  it('输入显示字典建议并排除已选；回车添加胶囊', async () => {
    apiMocks.getFolderAutoTags.mockResolvedValue(['风景'])
    const w = mountModal()
    await flushPromises()
    await typeQuery(w, '人像')
    expect(w.html()).toContain('人像')
    // 精确匹配字典标签 → 不出现「新建」按钮（带引号特征，避免误中模板注释文案）
    expect(w.html()).not.toContain('+ 新建 "')
    await w.find('input[placeholder="添加标签"]').trigger('keydown.enter')
    // 「人像」已选后建议消失，再输入部分匹配则出现「新建」
    await typeQuery(w, '人')
    expect(w.html()).toContain('+ 新建 "')
  })

  it('完全未匹配的输入出现「+ 新建」', async () => {
    apiMocks.getFolderAutoTags.mockResolvedValue([])
    const w = mountModal()
    await flushPromises()
    await typeQuery(w, '全新的标签')
    expect(w.html()).toContain('+ 新建')
  })

  it('保存：不改名时只下发规则并关闭', async () => {
    apiMocks.getFolderAutoTags.mockResolvedValue([])
    apiMocks.setFolderAutoTags.mockResolvedValue(undefined)
    const w = mountModal()
    await flushPromises()
    ;(w.vm as unknown as { tags: string[] }).tags = ['风景', '城市']
    await (w.vm as unknown as { save: () => Promise<void> }).save()
    expect(apiMocks.renamePhotoFolder).not.toHaveBeenCalled()
    expect(apiMocks.setFolderAutoTags).toHaveBeenCalledWith('f1', ['风景', '城市'])
    expect(w.emitted('changed')).toBeTruthy()
    expect(w.emitted('close')).toBeTruthy()
  })

  it('保存：名称变化时同时改名', async () => {
    apiMocks.getFolderAutoTags.mockResolvedValue([])
    apiMocks.renamePhotoFolder.mockResolvedValue({ ...mockFolder, name: '新名' })
    apiMocks.setFolderAutoTags.mockResolvedValue(undefined)
    const w = mountModal()
    await flushPromises()
    const nameInput = w.find('input[type="text"]')
    await nameInput.setValue('新名')
    await (w.vm as unknown as { save: () => Promise<void> }).save()
    expect(apiMocks.renamePhotoFolder).toHaveBeenCalledWith('f1', '新名')
    expect(apiMocks.setFolderAutoTags).toHaveBeenCalledWith('f1', [])
  })

  it('空名称保存被拒绝且不下发任何调用', async () => {
    apiMocks.getFolderAutoTags.mockResolvedValue([])
    const w = mountModal()
    await flushPromises()
    const nameInput = w.find('input[type="text"]')
    await nameInput.setValue('   ')
    await (w.vm as unknown as { save: () => Promise<void> }).save()
    expect(apiMocks.setFolderAutoTags).not.toHaveBeenCalled()
  })
})
