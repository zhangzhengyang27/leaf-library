// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import PhotoPreview from '../PhotoPreview.vue'
import type { Photo } from '../../../../types/photo'

/**
 * ✨AI 摘要与标签 的门禁与错误路径（D-017：AI 能力改接 DeepSeek）。
 *
 * DeepSeek 只有文本输入，所以按钮只对「有文字信号」的素材出现——
 * 文档正文 doc_text、图片 OCR ocr_text，或纯文本素材。
 * 没有文字信号还摆按钮，就是在诱导模型瞎猜画面内容。
 */

const photo = (over: Partial<Photo> & { fileName: string }): Photo =>
  ({
    id: `id-${over.fileName}`,
    filePath: `/tmp/${over.fileName}`,
    kind: 'image',
    folderId: null,
    tagIds: [],
    tags: [],
    thumbStatus: 1,
    createdAt: 0,
    importedAt: 0,
    fileSize: 1024,
    ...over
  }) as unknown as Photo

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- 测试辅助，返回类型由 vue 推导
const mountPreview = (p: Photo) =>
  mount(PhotoPreview, {
    props: { photo: p, photos: [p] },
    global: { plugins: [createPinia()], stubs: { PluginSandbox: true } }
  })

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- 测试辅助
const stubAi = (suggestMeta: () => Promise<unknown>) => {
  // 挂载会打到的 IPC 逐个显式兜底（Proxy 桩在嵌套调用上会露馅：
  // api.photos 拿到的是函数而不是对象，readTextFile 就没了）
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ai: { suggestMeta },
      photos: {
        readTextFile: async () => ({ ok: false, error: 'stub' }),
        getAllTags: async () => [],
        reverseGeocode: async () => null,
        fontInfo: async () => null,
        listZipEntries: async () => ({ ok: false, entries: [], error: 'stub' })
      },
      plugins: { list: async () => [] },
      system: { openPath: async () => true, openExternal: async () => true }
    }
  })
}

beforeEach(() => {
  stubAi(async () => ({ ok: false, error: '未配置 DeepSeek API Key' }))
})

describe('预览器 AI 摘要门禁', () => {
  it('有文档正文的素材出现按钮', () => {
    const w = mountPreview(photo({ fileName: 'a.docx', kind: 'file', docText: '本季度营收同比增长说明与下季度展望' }))
    expect(w.text()).toContain('AI 摘要与标签')
  })

  it('纯文本素材出现按钮', () => {
    const w = mountPreview(photo({ fileName: 'note.txt', kind: 'text' }))
    expect(w.text()).toContain('AI 摘要与标签')
  })

  it('Eagle 导入的文本素材 kind 是 file，仍按扩展名出现按钮', () => {
    const w = mountPreview(photo({ fileName: '未命名.txt', kind: 'file' }))
    expect(w.text()).toContain('AI 摘要与标签')
  })

  it('有 OCR 文字的图片出现按钮，无文字信号的普通图片不出现', () => {
    const withOcr = mountPreview(photo({ fileName: 'shot.png', ocrText: '终端里输出一段部署脚本文字' }))
    expect(withOcr.text()).toContain('AI 摘要与标签')
    const plain = mountPreview(photo({ fileName: 'leaf.jpg' }))
    expect(plain.text()).not.toContain('AI 摘要与标签')
  })

  it('OCR 只出杂字符噪声（低于门槛）不出按钮', () => {
    const w = mountPreview(photo({ fileName: 'leaf.jpg', ocrText: '| 记 “' }))
    expect(w.text()).not.toContain('AI 摘要与标签')
  })

  it('点击后失败信息落在描述区内，不抛异常', async () => {
    const w = mountPreview(photo({ fileName: 'a.docx', kind: 'file', docText: '本季度营收同比增长说明与下季度展望' }))
    await w.get('button[title="依据素材已有文字生成摘要与标签建议"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
    expect(w.text()).toContain('未配置 DeepSeek API Key')
    expect(w.find('.photo-preview').exists()).toBe(true)
  })
})
