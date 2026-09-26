// @vitest-environment happy-dom
/**
 * D-022 条件组（形状 v2）编辑器回合验证：
 * - 组结构往返：UI → rules_json（updateSmartAlbum 载荷）→ 读回 → UI 回显 → 再保存不变形
 * - v1 规则打开保存不变形：无 groups 的旧规则保存后不得长出 groups 键
 * - 组级「不满足」取反勾选往返
 * - 组内未知键原样保留并在界面上念出来
 * - 实时命中计数在嵌套形状下仍按整份规则下发（既有 debounce 通道，不另起炉灶）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import SmartAlbumModal from '../SmartAlbumModal.vue'
import type { SmartAlbum, SmartAlbumRules } from '../../../../types/photo'
import type { SmartAlbumRuleGroup } from '@shared/smartAlbumRules'

const apiMocks = vi.hoisted(() => ({
  listPhotoFolders: vi.fn(),
  queryPhotosByRules: vi.fn(),
  createSmartAlbum: vi.fn(),
  updateSmartAlbum: vi.fn()
}))

// UModal 以 stub 内联渲染插槽（Teleport 在 happy-dom 下不进 wrapper）
const globalStubs = {
  stubs: {
    UModal: {
      template:
        '<div class="u-modal-stub"><slot name="title" /><slot /><slot name="footer" /></div>'
    },
    ColorPalette: true
  }
}

const makeAlbum = (rules: SmartAlbumRules): SmartAlbum => ({
  id: 'sa1',
  name: '条件组',
  rules,
  parentId: null,
  sortOrder: 0,
  createdAt: 0,
  updatedAt: 0
})

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'api', { configurable: true, value: { photos: apiMocks } })
  apiMocks.listPhotoFolders.mockResolvedValue([])
  apiMocks.queryPhotosByRules.mockResolvedValue([])
  apiMocks.updateSmartAlbum.mockResolvedValue(undefined)
})

/** 以编辑模式打开、点「保存」，回传落到更新接口的规则 */
async function editThenSave(rules: SmartAlbumRules): Promise<SmartAlbumRules> {
  const w = mount(SmartAlbumModal, {
    props: { album: makeAlbum(rules), availableTags: [] },
    global: globalStubs
  })
  await flushPromises()
  const saveBtn = w.findAll('button').find((b) => b.text().includes('保存'))
  expect(saveBtn).toBeTruthy()
  await saveBtn!.trigger('click')
  await flushPromises()
  expect(apiMocks.updateSmartAlbum).toHaveBeenCalledTimes(1)
  return apiMocks.updateSmartAlbum.mock.calls[0][1].rules
}

/** 组区块的定位 helpers */
function groupFieldsets(w: VueWrapper): DOMWrapper<Element>[] {
  // 组 fieldset 含「不满足此组」标签；顶层「更多条件」fieldset 不含
  return w.findAll('fieldset').filter((f) => f.text().includes('不满足此组'))
}
function findButton(
  w: DOMWrapper<Element> | VueWrapper,
  text: string
): DOMWrapper<HTMLButtonElement> {
  const btn = w.findAll('button').find((b) => b.text().trim() === text)
  expect(btn, `找不到按钮「${text}」`).toBeTruthy()
  return btn!
}

describe('SmartAlbumModal · v1 规则打开保存不变形', () => {
  it('无 groups 的旧规则保存后不长出 groups 键，扁平键原样保留', async () => {
    const out = await editThenSave({ favorite: true, minRating: 2, match: 'any', keyword: '叶子' })
    expect(out.match).toBe('any')
    expect(out.favorite).toBe(true)
    expect(out.minRating).toBe(2)
    expect(out.keyword).toBe('叶子')
    expect(out.groups).toBeUndefined()
  })

  it('groups 为空数组时同样视为无组，保存后不产出该键', async () => {
    const out = await editThenSave({ favorite: true, groups: [] })
    expect(out.favorite).toBe(true)
    expect(out.groups).toBeUndefined()
  })
})

describe('SmartAlbumModal · 组结构往返', () => {
  it('已存 groups 打开回显、保存后逐字段不变形（match/not/rules 全保留）', async () => {
    const src: SmartAlbumRuleGroup[] = [
      { match: 'any', not: true, rules: { favorite: true, minRating: 3, annotationFilter: 'any' } },
      { match: 'all', rules: { keyword: '海报', tagNamesAll: ['叶子', '植物'] } }
    ]
    const out = await editThenSave({ groups: src })
    expect(out.groups).toEqual(src)
  })

  it('组内值控件真的回显了（勾选态 / 枚举选中 / 文本值），不是内存里的原值', async () => {
    const w = mount(SmartAlbumModal, {
      props: {
        album: makeAlbum({
          groups: [
            { match: 'any', not: true, rules: { favorite: true, keyword: '海报', minRating: 3 } }
          ]
        }),
        availableTags: []
      },
      global: globalStubs
    })
    await flushPromises()
    const fieldset = groupFieldsets(w)[0]
    expect(fieldset).toBeTruthy()
    // 文本行的值
    const textRow = fieldset!.findAll('input[type=text]')[0]
    expect((textRow.element as HTMLInputElement).value).toBe('海报')
    // 仅收藏勾选态（组内的 bool 行）
    const boolRow = fieldset!.findAll('input[type=checkbox]')[1] // [0] = 不满足此组
    expect((boolRow.element as HTMLInputElement).checked).toBe(true)
    // 组级取反勾选态
    const notLabel = fieldset!.findAll('label').find((l) => l.text().includes('不满足此组'))
    expect((notLabel!.find('input').element as HTMLInputElement).checked).toBe(true)
    // 组内连接词
    const matchSelect = fieldset!.find('select')
    expect((matchSelect.element as HTMLSelectElement).value).toBe('any')
  })

  it('not 勾选往返：勾上保存 not:true，去掉后保存不产出 not', async () => {
    const w = mount(SmartAlbumModal, {
      props: {
        album: makeAlbum({ groups: [{ match: 'all', not: true, rules: { favorite: true } }] }),
        availableTags: []
      },
      global: globalStubs
    })
    await flushPromises()
    const notInput = groupFieldsets(w)[0]!
      .findAll('label')
      .find((l) => l.text().includes('不满足此组'))!
      .find('input')
    await notInput!.setValue(false)
    const saveBtn = w.findAll('button').find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()
    const sent: SmartAlbumRules = apiMocks.updateSmartAlbum.mock.calls[0][1].rules
    expect(sent.groups).toEqual([{ match: 'all', rules: { favorite: true } }])
  })

  it('UI 从零建组：添加组 → 添加条件 → 填值 → 组内 any + 取反，保存形状正确', async () => {
    const w = mount(SmartAlbumModal, {
      props: { album: makeAlbum({}), availableTags: [] },
      global: globalStubs
    })
    await flushPromises()
    await findButton(w, '+ 添加条件组').trigger('click')
    const fieldset = groupFieldsets(w)[0]!
    await findButton(fieldset, '+ 添加条件').trigger('click')
    // 默认行 = 文件名/描述含（text）
    await fieldset.findAll('input[type=text]')[0].setValue('海报')
    // 组内连接词切到「任一满足」+ 勾取反
    await fieldset.find('select').setValue('any')
    await fieldset
      .findAll('label')
      .find((l) => l.text().includes('不满足此组'))!
      .find('input')
      .setValue(true)
    // 再补一行枚举条件：换键为「标注」→ 值下拉选「有标注」
    await findButton(fieldset, '+ 添加条件').trigger('click')
    const keySelects = fieldset.findAll('select').filter((s) => s !== fieldset.find('select'))
    await keySelects[keySelects.length - 1].setValue('annotationFilter')
    const enumSelects = fieldset.findAll('select')
    await enumSelects[enumSelects.length - 1].setValue('any')

    const saveBtn = w.findAll('button').find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()
    const sent: SmartAlbumRules = apiMocks.updateSmartAlbum.mock.calls[0][1].rules
    expect(sent.groups).toEqual([
      { match: 'any', not: true, rules: { keyword: '海报', annotationFilter: 'any' } }
    ])
  })

  it('删除组后保存不再产出 groups', async () => {
    const w = mount(SmartAlbumModal, {
      props: {
        album: makeAlbum({ groups: [{ match: 'all', rules: { favorite: true } }] }),
        availableTags: []
      },
      global: globalStubs
    })
    await flushPromises()
    expect(groupFieldsets(w).length).toBe(1)
    await findButton(w, '删除组').trigger('click')
    const saveBtn = w.findAll('button').find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()
    const sent: SmartAlbumRules = apiMocks.updateSmartAlbum.mock.calls[0][1].rules
    expect(sent.groups).toBeUndefined()
  })

  it('组内未知键原样保留，并在组区块里念出来', async () => {
    const w = mount(SmartAlbumModal, {
      props: {
        album: makeAlbum({
          groups: [{ match: 'all', rules: { keyword: 'x', searchKeyword: 'y' } }]
        }),
        availableTags: []
      },
      global: globalStubs
    })
    await flushPromises()
    const hint = groupFieldsets(w)[0]!.find('p.text-warning-500')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('searchKeyword')
    const saveBtn = w.findAll('button').find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()
    const sent: SmartAlbumRules = apiMocks.updateSmartAlbum.mock.calls[0][1].rules
    expect(sent.groups![0].rules).toMatchObject({ keyword: 'x', searchKeyword: 'y' })
  })

  it('空组（没加任何条件）保存时不留死键', async () => {
    const w = mount(SmartAlbumModal, {
      props: { album: makeAlbum({}), availableTags: [] },
      global: globalStubs
    })
    await flushPromises()
    await findButton(w, '+ 添加条件组').trigger('click')
    const saveBtn = w.findAll('button').find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()
    const sent: SmartAlbumRules = apiMocks.updateSmartAlbum.mock.calls[0][1].rules
    expect(sent.groups).toBeUndefined()
  })

  it('条件组超过 30 个后「添加条件组」被禁用（Eagle 30 组口径，远在引擎 300 节点闸内）', async () => {
    const w = mount(SmartAlbumModal, {
      props: { album: makeAlbum({}), availableTags: [] },
      global: globalStubs
    })
    await flushPromises()
    const addBtn = findButton(w, '+ 添加条件组')
    for (let i = 0; i < 30; i++) await addBtn.trigger('click')
    expect(groupFieldsets(w).length).toBe(30)
    expect(addBtn.attributes('disabled')).toBeDefined()
  })
})

describe('SmartAlbumModal · 嵌套形状下的实时计数', () => {
  it('计数通道按整份规则（含 groups）下发，不另起第二套通道', async () => {
    vi.useFakeTimers()
    try {
      const w = mount(SmartAlbumModal, {
        props: {
          album: makeAlbum({
            favorite: true,
            groups: [{ match: 'all', not: true, rules: { kinds: ['video'] } }]
          }),
          availableTags: []
        },
        global: globalStubs
      })
      await flushPromises()
      vi.advanceTimersByTime(300)
      await flushPromises()
      expect(apiMocks.queryPhotosByRules).toHaveBeenCalled()
      const arg = apiMocks.queryPhotosByRules.mock.calls.at(-1)![0] as SmartAlbumRules
      expect(arg.favorite).toBe(true)
      expect(arg.groups).toEqual([{ match: 'all', not: true, rules: { kinds: ['video'] } }])
      void w
    } finally {
      vi.useRealTimers()
    }
  })

  it('引擎拒编译（如超限）时错误念在计数行上，而不是永远「正在计算」', async () => {
    vi.useFakeTimers()
    try {
      apiMocks.queryPhotosByRules.mockRejectedValue(
        new Error(
          '[buildSmartAlbumWhere] 条件组节点数超过上限 300（当前 301）：规则过复杂，请简化条件组'
        )
      )
      const w = mount(SmartAlbumModal, {
        props: { album: makeAlbum({ groups: [{ rules: { favorite: true } }] }), availableTags: [] },
        global: globalStubs
      })
      await flushPromises()
      vi.advanceTimersByTime(300)
      await flushPromises()
      const counter = w.findAll('p').find((p) => p.text().includes('实时计数失败'))
      expect(counter).toBeTruthy()
      expect(counter!.text()).toContain('上限 300')
    } finally {
      vi.useRealTimers()
    }
  })
})
