// @vitest-environment happy-dom
/**
 * D-023 算子补齐编辑器回合验证（SmartAlbumModal）：
 * - 顶层新控件回填 → 保存 → 载荷不变形（开头/结尾/正则/注释内容/添加日期相对窗）
 * - 正则即时校验：非法正则行内报错 + 保存按钮禁用（顶层与组内行两处），改合法后恢复
 * - 组内新行型：between 双输入（含 KB/秒 单位换算）、正则行、withinDays 单数字行
 * - between 组内往返：已存 [min,max] 数组回显成两个输入、保存不变形
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
  name: '算子补齐',
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

async function mountEditor(rules: SmartAlbumRules): Promise<VueWrapper> {
  const w = mount(SmartAlbumModal, {
    props: { album: makeAlbum(rules), availableTags: [] },
    global: globalStubs
  })
  await flushPromises()
  return w
}

async function savePayload(w: VueWrapper): Promise<SmartAlbumRules> {
  const saveBtn = w.findAll('button').find((b) => b.text().includes('保存'))
  expect(saveBtn).toBeTruthy()
  await saveBtn!.trigger('click')
  await flushPromises()
  expect(apiMocks.updateSmartAlbum).toHaveBeenCalledTimes(1)
  return apiMocks.updateSmartAlbum.mock.calls[0][1].rules
}

/** 组区块定位（含「不满足此组」标签的 fieldset） */
function groupFieldsets(w: VueWrapper): DOMWrapper<Element>[] {
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
function inputByPlaceholder(
  scope: DOMWrapper<Element> | VueWrapper,
  ph: string
): DOMWrapper<HTMLInputElement> {
  const input = scope.findAll('input').find((i) => i.attributes('placeholder') === ph)
  expect(input, `找不到 placeholder=${ph} 的输入框`).toBeTruthy()
  return input! as DOMWrapper<HTMLInputElement>
}

describe('SmartAlbumModal · D-023 顶层控件往返', () => {
  it('开头/结尾/正则/注释内容/添加 N 天：回填回显、保存不变形', async () => {
    const src: SmartAlbumRules = {
      nameBeginsWith: 'IMG_',
      nameEndsWith: '.png',
      nameRegex: '^IMG_\\d+\\.png$',
      descriptionEmpty: true,
      importedWithinDays: 7
    }
    const w = await mountEditor(src)
    expect((inputByPlaceholder(w, '如 IMG_').element as HTMLInputElement).value).toBe('IMG_')
    expect((inputByPlaceholder(w, '如 .png').element as HTMLInputElement).value).toBe('.png')
    expect((inputByPlaceholder(w, '如 ^IMG_\\d+\\.png$').element as HTMLInputElement).value).toBe(
      '^IMG_\\d+\\.png$'
    )
    const out = await savePayload(w)
    expect(out).toMatchObject({
      nameBeginsWith: 'IMG_',
      nameEndsWith: '.png',
      nameRegex: '^IMG_\\d+\\.png$',
      descriptionEmpty: true,
      importedWithinDays: 7
    })
    expect(out.descriptionHasContent).toBeUndefined()
  })

  it('注释「有内容」回填到下拉并写回 descriptionHasContent（不产出 descriptionEmpty）', async () => {
    const w = await mountEditor({ descriptionHasContent: true })
    const out = await savePayload(w)
    expect(out.descriptionHasContent).toBe(true)
    expect(out.descriptionEmpty).toBeUndefined()
  })

  it('顶层非法正则：行内报错 + 保存禁用 + 载荷不带 nameRegex；改合法后恢复', async () => {
    const w = await mountEditor({})
    const regexInput = inputByPlaceholder(w, '如 ^IMG_\\d+\\.png$')
    await regexInput.setValue('(')
    await flushPromises()
    // 行内报错
    const err = w.findAll('p').find((p) => p.text().includes('非法正则'))
    expect(err).toBeTruthy()
    // 保存禁用（按钮 disabled 属性）
    const saveBtn = w.findAll('button').find((b) => b.text().includes('保存'))!
    expect(saveBtn.attributes('disabled')).toBeDefined()
    // 改成合法 → 报错消失、保存恢复
    await regexInput.setValue('^ok_\\d+$')
    await flushPromises()
    expect(w.findAll('p').find((p) => p.text().includes('非法正则'))).toBeUndefined()
    expect(saveBtn.attributes('disabled')).toBeUndefined()
    const out = await savePayload(w)
    expect(out.nameRegex).toBe('^ok_\\d+$')
  })
})

describe('SmartAlbumModal · D-023 组内新行型', () => {
  /** 组内的「键 select」判别：含有 keyword 选项的才是键下拉（组头连接词 select 不是）。
   *  不能用 `s !== fieldset.find('select')` 过滤——每次 find 都新建 wrapper，恒不等 */
  function keySelectsOf(fieldset: DOMWrapper<Element>): DOMWrapper<HTMLSelectElement>[] {
    const found = fieldset
      .findAll('select')
      .filter((s) => s.findAll('option').some((o) => o.element.value === 'keyword'))
    expect(found.length, '键 select 判别失败').toBeGreaterThan(0)
    return found as unknown as DOMWrapper<HTMLSelectElement>[]
  }

  /** 从零建组加一行并把键切到指定 key */
  async function addRowWithKey(w: VueWrapper, key: string): Promise<DOMWrapper<Element>> {
    await findButton(w, '+ 添加条件组').trigger('click')
    const fieldset = groupFieldsets(w)[0]!
    await findButton(fieldset, '+ 添加条件').trigger('click')
    const keySelect = keySelectsOf(fieldset)[0]!
    await keySelect.setValue(key)
    return fieldset
  }

  it('组内正则行：非法时行内报错且禁保存，合法后载荷进组规则', async () => {
    const w = await mountEditor({})
    const fieldset = await addRowWithKey(w, 'nameRegex')
    const regexInput = fieldset.findAll('input[type=text]')[0]!
    await regexInput.setValue('a\\')
    await flushPromises()
    const rowError = fieldset.findAll('p').find((p) => p.text().includes('非法正则'))
    expect(rowError).toBeTruthy()
    const saveBtn = w.findAll('button').find((b) => b.text().includes('保存'))!
    expect(saveBtn.attributes('disabled')).toBeDefined()
    await regexInput.setValue('^叶子_\\d+$')
    await flushPromises()
    expect(fieldset.findAll('p').find((p) => p.text().includes('非法正则'))).toBeUndefined()
    const out = await savePayload(w)
    expect(out.groups).toEqual([{ match: 'all', rules: { nameRegex: '^叶子_\\d+$' } }])
  })

  it('组内 between 双输入：px 直接下发；KB 行按 1024 换算成字节', async () => {
    const w = await mountEditor({})
    await findButton(w, '+ 添加条件组').trigger('click')
    const fieldset = groupFieldsets(w)[0]!
    // 第一行：宽度介于
    await findButton(fieldset, '+ 添加条件').trigger('click')
    await keySelectsOf(fieldset)[0].setValue('widthBetween')
    let minInputs = fieldset.findAll('input[type=number]')
    expect(minInputs.length, 'between 行应渲染两个数字输入').toBe(2)
    await minInputs[0].setValue('1000')
    await minInputs[1].setValue('2000')
    // 第二行：大小介于（KB → 字节）
    await findButton(fieldset, '+ 添加条件').trigger('click')
    await keySelectsOf(fieldset)[1].setValue('fileSizeBetween')
    minInputs = fieldset.findAll('input[type=number]')
    await minInputs[2].setValue('1')
    await minInputs[3].setValue('2')
    const out = await savePayload(w)
    expect(out.groups).toEqual([
      { match: 'all', rules: { widthBetween: [1000, 2000], fileSizeBetween: [1024, 2048] } }
    ])
  })

  it('组内 between 往返：已存 [min,max] 回显成两个输入，保存不变形', async () => {
    const w = await mountEditor({
      groups: [{ match: 'all', rules: { widthBetween: [1000, 2000] } }]
    })
    const fieldset = groupFieldsets(w)[0]!
    const numInputs = fieldset.findAll('input[type=number]')
    expect((numInputs[0].element as HTMLInputElement).value).toBe('1000')
    expect((numInputs[1].element as HTMLInputElement).value).toBe('2000')
    const out = await savePayload(w)
    expect(out.groups).toEqual([{ match: 'all', rules: { widthBetween: [1000, 2000] } }])
  })

  it('组内 withinDays 单数字行：天数直接下发（引擎侧换算毫秒）', async () => {
    const w = await mountEditor({})
    const fieldset = await addRowWithKey(w, 'takenWithinDays')
    const numInput = fieldset.findAll('input[type=number]')[0]!
    await numInput.setValue('7')
    const out = await savePayload(w)
    expect(out.groups).toEqual([{ match: 'all', rules: { takenWithinDays: 7 } }])
  })

  it('已存组规则含 D-023 键时回填行草稿而不是落进「暂不支持」', async () => {
    const src: SmartAlbumRuleGroup[] = [
      {
        match: 'any',
        rules: {
          nameBeginsWith: 'IMG_',
          descriptionHasContent: true,
          durationMsBetween: [1000, 60000]
        }
      }
    ]
    const w = await mountEditor({ groups: src })
    const fieldset = groupFieldsets(w)[0]!
    // 没有任何「暂不支持」提示
    expect(fieldset.find('p.text-warning-500').exists()).toBe(false)
    // 文本行回显
    expect((fieldset.findAll('input[type=text]')[0]!.element as HTMLInputElement).value).toBe(
      'IMG_'
    )
    // between 行回显成两个输入（毫秒反向换算成秒：1000→1、60000→60）
    const numInputs = fieldset.findAll('input[type=number]')
    expect((numInputs[0].element as HTMLInputElement).value).toBe('1')
    expect((numInputs[1].element as HTMLInputElement).value).toBe('60')
    const out = await savePayload(w)
    expect(out.groups).toEqual(src)
  })
})
