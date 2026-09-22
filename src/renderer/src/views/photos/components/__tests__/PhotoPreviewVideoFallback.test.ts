// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import PhotoPreview from '../PhotoPreview.vue'
import type { Photo } from '../../../../types/photo'

/**
 * 非可播容器（avi/wmv/flv/mpeg/ts/裸 hevc）的预览兜底：
 * 结构性断言「不渲染 <video>」+ 出现封面与系统播放器入口，
 * 以及可播容器（mp4）仍然渲染 <video>。取 textContent，不用 innerText
 * （happy-dom 的 innerText 不做渲染树裁剪，会给出假绿/假红）。
 */

const photo = (name: string, kind: Photo['kind']): Photo =>
  ({
    id: `id-${name}`,
    fileName: name,
    filePath: `/tmp/${name}`,
    kind,
    folderId: null,
    tagIds: [],
    thumbStatus: 1,
    createdAt: 0,
    importedAt: 0,
    fileSize: 1024
  }) as unknown as Photo

beforeEach(() => {
  // 组件挂载会打各种 IPC；用 Proxy 兜成「任何方法都 resolve null」，
  // 免得每加一个调用就要回来补 mock
  const anyApi = new Proxy(
    {},
    {
      get: (_t, key) =>
        key === 'then' ? undefined : Object.assign(async () => null, { [String(key)]: null })
    }
  )
  Object.defineProperty(window, 'api', { configurable: true, value: anyApi })
})

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- 测试辅助，返回类型由 vue 推导
const mountPreview = (p: Photo) =>
  mount(PhotoPreview, {
    props: { photo: p, photos: [p] },
    global: { plugins: [createPinia()], stubs: { PluginSandbox: true } }
  })

describe('预览器视频可播性分支', () => {
  it('avi 不渲染 <video>，给出封面 + 系统播放器入口', () => {
    const w = mountPreview(photo('clip.avi', 'video'))
    expect(w.find('video').exists()).toBe(false)
    const notice = w.text()
    expect(notice).toContain('无法在应用内播放')
    expect(notice).toContain('用系统播放器打开')
    const cover = w.find('img[alt=""]')
    expect(cover.exists()).toBe(true)
    expect(cover.attributes('src')).toBe('thumb://1024/id-clip.avi')
  })

  it('mp4 仍走 <video> 播放，不出现兜底文案', () => {
    const w = mountPreview(photo('clip.mp4', 'video'))
    expect(w.find('video').exists()).toBe(true)
    expect(w.text()).not.toContain('无法在应用内播放')
  })
})
