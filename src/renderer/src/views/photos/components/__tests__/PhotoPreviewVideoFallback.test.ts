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

/**
 * 视频态 Shift+←/→ = ±10 帧步进（对标 Eagle mpv；普通 ←/→ 仍归全局键盘层翻页）。
 * 这里只验证 PhotoPreview 侧：按实测 fps 挪 currentTime、首尾 clamp、
 * 无 Shift 的 ←/→ 不动 currentTime（usePhotoKeyboard 的让路链路不在本挂载环境里）。
 */
describe('视频 Shift+←/→ ±10 帧步进', () => {
  const videoPhoto = (): Photo => ({ ...photo('clip.mp4', 'video'), fps: 30 })

  it('Shift+→ 按实测 fps 前进 10 帧；连按累加，不出 NaN', () => {
    const w = mountPreview(videoPhoto())
    const video = w.find('video').element as HTMLVideoElement
    video.currentTime = 1
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }))
    // 1s + 连按两次 × 10 帧（fps 30）= 1 + 20/30
    expect(video.currentTime).toBeCloseTo(1 + 20 / 30, 5)
    expect(Number.isNaN(video.currentTime)).toBe(false)
    w.unmount()
  })

  it('Shift+← 越过片头 clamp 到 0，不出负时间', () => {
    const w = mountPreview(videoPhoto())
    const video = w.find('video').element as HTMLVideoElement
    video.currentTime = 5 / 30 // 不足 10 帧的余量
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true }))
    expect(video.currentTime).toBe(0)
    expect(Number.isNaN(video.currentTime)).toBe(false)
    w.unmount()
  })

  it('Shift+→ 越过片尾 clamp 到 duration', () => {
    const w = mountPreview(videoPhoto())
    const video = w.find('video').element as HTMLVideoElement
    // happy-dom 未加载媒体元数据时 duration 是 NaN，实例级 mock 一个 0.5s 时长
    Object.defineProperty(video, 'duration', { value: 0.5, configurable: true })
    video.currentTime = 0.49
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }))
    expect(video.currentTime).toBeCloseTo(0.5, 5)
    w.unmount()
  })

  it('不带 Shift 的 ←/→ 不做帧步进（翻页语义归全局键盘层）', () => {
    const w = mountPreview(videoPhoto())
    const video = w.find('video').element as HTMLVideoElement
    video.currentTime = 1
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    expect(video.currentTime).toBe(1)
    w.unmount()
  })
})
