// @vitest-environment happy-dom
/**
 * 批量重命名弹窗的接线测试（P1：正则替换 + 大小写四态）。
 *
 * 引擎本身有独立单测，这里只测"界面上填的东西有没有真的走到展开结果里"——
 * 这类接线错（忘了传 opts、预览没跟着重算）在纯函数测试里看不见，
 * 而起一个真实例点弹窗又会撞上同仓另一个会话的 dev 进程。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import BatchRenameModal from '../BatchRenameModal.vue'
import type { Photo } from '../../../../types/photo'

const photo = (name: string): Photo =>
  ({
    id: `id-${name}`,
    fileName: name,
    filePath: `/tmp/${name}`,
    kind: 'image',
    folderId: null,
    tagIds: [],
    thumbStatus: 1,
    createdAt: 0,
    importedAt: new Date(2026, 8, 16).getTime(),
    fileSize: 1024
  }) as unknown as Photo

const renamePhotos = vi.fn(async (_list: Array<{ id: string; name: string }>) => ({
  renamed: [],
  conflicts: []
}))

beforeEach(() => {
  renamePhotos.mockClear()
  // 组件挂载会碰各种 IPC；除 renamePhotos 外一律兜成 null
  const api: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, key: string) => {
        if (key === 'photos')
          return {
            renamePhotos,
            getFolders: async () => [],
            getById: async () => null
          }
        return new Proxy({}, { get: () => async () => null })
      }
    }
  )
  Object.defineProperty(window, 'api', { value: api, configurable: true })
})

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- 测试辅助
function mountModal(photos: Photo[]) {
  return mount(BatchRenameModal, {
    props: { photos },
    global: {
      plugins: [createPinia()],
      // UModal 把内容 teleport 到 body 外面，wrapper 里就只剩注释节点；
      // 用透传 stub 把默认槽与 footer 槽渲染回本地，才能点到里面的控件
      stubs: {
        AppIcon: true,
        UModal: {
          template: '<div><slot /><div><slot name="footer" /></div></div>',
          inheritAttrs: false
        }
      }
    },
    attachTo: document.body
  })
}

/** 预览区右侧的新名字（左侧故意保留旧名，所以只能按 span 取） */
function newNames(w: ReturnType<typeof mountModal>): string[] {
  return w.findAll('span.text-fg-brand').map((el) => el.text())
}

/**
 * 按可见文案点按钮。
 *
 * 不用 `button:has-text(...)`：那是 Playwright 的选择器语法，happy-dom 的
 * querySelector 认不下，find 只会静默返回空 wrapper。
 */
async function click(w: ReturnType<typeof mountModal>, label: string): Promise<void> {
  const btn = w.findAll('button').find((b) => b.text().trim().startsWith(label))
  if (!btn) throw new Error(`找不到按钮「${label}」`)
  await btn.trigger('click')
  await w.vm.$nextTick()
}

describe('正则与大小写的接线', () => {
  it('填了正则，预览的新名字反映替换结果', async () => {
    const w = mountModal([photo('IMG_1234.jpg'), photo('IMG_5678.jpg')])
    await w.find('input[placeholder^="例如："]').setValue('{name}')
    await w.find('input[placeholder^="查找"]').setValue('^IMG_')
    await w.find('input[placeholder^="替换为"]').setValue('photo-')
    expect(newNames(w)).toEqual(['photo-1234.jpg', 'photo-5678.jpg'])
  })

  it('非法正则标红并说明，且拦住提交（不静默按不替换执行）', async () => {
    const w = mountModal([photo('a.jpg')])
    await w.find('input[placeholder^="例如："]').setValue('{name}')
    await w.find('input[placeholder^="查找"]').setValue('[unclosed')
    expect(w.text()).toContain('正则不合法')
    await click(w, '重命名')
    expect(renamePhotos).not.toHaveBeenCalled()
  })

  it('大小写档按 token → 替换 → 大小写 的顺序作用到提交值上', async () => {
    const w = mountModal([photo('IMG_1234.jpg')])
    await w.find('input[placeholder^="例如："]').setValue('{name}')
    await w.find('input[placeholder^="查找"]').setValue('^IMG_')
    await w.find('input[placeholder^="替换为"]').setValue('Photo-')
    await click(w, '全小写')
    expect(newNames(w)).toEqual(['photo-1234.jpg']) // 大小写也吃替换结果
    await click(w, '重命名')
    expect(renamePhotos).toHaveBeenCalled()
    const sent = renamePhotos.mock.calls[0][0] as Array<{ name: string }>
    expect(sent[0].name).toBe('photo-1234')
  })
})
