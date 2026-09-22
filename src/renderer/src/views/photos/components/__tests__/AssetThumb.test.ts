// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AssetThumb from '../AssetThumb.vue'
import type { Photo } from '../../../../types/photo'

/**
 * 六期 Vue 组件测试：AssetThumb 六类卡片渲染分支。
 * （此前渲染层零自动化覆盖——待办清单低优先级项的起步）
 * ④-4 起 AssetThumb 读取全局显示配置（useLibraryTabs）——需激活 Pinia。
 */

function makePhoto(kind: Photo['kind'], overrides: Partial<Photo> = {}): Photo {
  return {
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
    kind,
    ...overrides
  }
}

const globalStubs = {
  directives: {},
  mocks: {
    // 字体名解析 IPC（watch immediate 触发）
    'window.api': undefined
  }
}

describe('AssetThumb · 六类卡片渲染', () => {
  const apiMock = vi.fn()

  beforeAll(() => {
    // ④-4：组件 setup 内 useLibraryTabs() 需要 Pinia 上下文
    setActivePinia(createPinia())
    // happy-dom 环境下组件会访问 window.api.photos.fontInfo
    ;(globalThis as Record<string, unknown>).window = globalThis.window ?? {}
    ;(window as unknown as Record<string, unknown>).api = {
      photos: { fontInfo: apiMock }
    }
    apiMock.mockResolvedValue({ familyName: 'Test Font', subfamilyName: 'Regular' })
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('图片：渲染缩略图 img（thumb://256）', () => {
    const wrapper = mount(AssetThumb, {
      props: { photo: makePhoto('image') },
      global: globalStubs
    })
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('thumb://256/p1')
  })

  it('视频：缩略图 + 时长标签；未悬停不渲染 <video>；无居中播放键（对齐 Eagle）', async () => {
    const wrapper = mount(AssetThumb, {
      props: { photo: makePhoto('video', { durationMs: 65_000 }) },
      global: globalStubs
    })
    expect(wrapper.find('video').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('▶')
    expect(wrapper.text()).toContain('1:05')
  })

  it('音频：🎵 卡片 + 时长', () => {
    const wrapper = mount(AssetThumb, {
      props: { photo: makePhoto('audio', { durationMs: 3_500 }) },
      global: globalStubs
    })
    expect(wrapper.text()).toContain('🎵')
    expect(wrapper.text()).toContain('0:04') // 3.5s 四舍五入
    expect(wrapper.find('video').exists()).toBe(false)
  })

  it('字体：Aa 卡片 + 文件名兜底（IPC 未返回时）', async () => {
    apiMock.mockResolvedValue(null)
    const wrapper = mount(AssetThumb, {
      props: { photo: makePhoto('font', { fileName: 'SourceHan-Bold.ttf' }) },
      global: globalStubs
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Aa')
    expect(wrapper.text()).toContain('SourceHan Bold')
  })

  it('书签：🌐 + 标题（去时间戳前缀/扩展名）+ 域名', () => {
    const wrapper = mount(AssetThumb, {
      props: {
        photo: makePhoto('bookmark', {
          fileName: '1735689600000_深度学习论文精读.png',
          sourceUrl: 'https://example.com/article/deep-learning'
        })
      },
      global: globalStubs
    })
    expect(wrapper.text()).toContain('🌐')
    expect(wrapper.text()).toContain('深度学习论文精读')
    expect(wrapper.text()).toContain('example.com')
  })

  it('兜底文件：📄 + 扩展名', () => {
    const wrapper = mount(AssetThumb, {
      props: { photo: makePhoto('file', { fileName: 'archive.zip' }) },
      global: globalStubs
    })
    expect(wrapper.text()).toContain('📄')
    expect(wrapper.text()).toContain('zip') // 大写由 CSS uppercase 处理
  })

  it('缩略图失败（thumbStatus=2）的图片 → 扩展名徽章卡片而非裂图', () => {
    const wrapper = mount(AssetThumb, {
      props: { photo: makePhoto('image', { fileName: 'design.psd', thumbStatus: 2 }) },
      global: globalStubs
    })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('PSD')
  })
})
