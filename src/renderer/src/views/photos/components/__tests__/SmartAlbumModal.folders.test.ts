// @vitest-environment happy-dom
/**
 * 「所属文件夹」条件必须原样往返。
 *
 * 控件早先是单选 select，回填只读 folderIds[0]、保存只写回一个元素：
 * FilterBar「保存筛选」产出的多文件夹条件，用户一进编辑器点保存就静默丢剩一个，
 * 而引擎侧 folderIds 一直是数组语义（含 'none' = 未分类与真实文件夹混选）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, type DOMWrapper } from '@vue/test-utils'
import SmartAlbumModal from '../SmartAlbumModal.vue'
import type { SmartAlbum, SmartAlbumRules } from '../../../../types/photo'

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
  name: '多文件夹',
  rules,
  sortOrder: 0,
  createdAt: 0,
  updatedAt: 0
})

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'api', { configurable: true, value: { photos: apiMocks } })
  apiMocks.listPhotoFolders.mockResolvedValue([
    { id: 'fa', name: 'A 夹' },
    { id: 'fb', name: 'B 夹' },
    { id: 'fc', name: 'C 夹' }
  ])
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

describe('SmartAlbumModal · 文件夹条件往返', () => {
  it('多文件夹条件编辑保存后一个不丢', async () => {
    expect(await editThenSave({ folderIds: ['fa', 'fb'] })).toMatchObject({
      folderIds: ['fa', 'fb']
    })
  })

  it('「未分类」与真实文件夹混选也原样保留', async () => {
    expect(await editThenSave({ folderIds: ['none', 'fc'] })).toMatchObject({
      folderIds: ['none', 'fc']
    })
  })

  it('回填真的落到控件上（不只是内存里的原值）', async () => {
    const w = mount(SmartAlbumModal, {
      props: { album: makeAlbum({ folderIds: ['fa', 'fc'] }), availableTags: [] },
      global: globalStubs
    })
    await flushPromises()
    // 文件夹多选 select 的判别属性是 multiple（M4 起弹窗里还有单选的「标注」select，
    // 它也有 value="none" 的选项，单按 'none' 认会误中）
    const folderSelect = w.find('select[multiple]')
    expect(folderSelect.exists()).toBe(true)
    const selected = folderSelect!
      .findAll('option')
      .filter((o) => o.element.selected)
      .map((o) => o.element.value)
    expect(selected).toEqual(['fa', 'fc'])
  })
})

/**
 * G2：编辑器此前只暴露十几个条件，「保存筛选」下发的规则里凡是它没有控件的
 * （形状/比例/添加与拍摄日期/标签按名三档/近似色/排除扩展名…）一进一出就被抹掉。
 * 现在要么有控件写回，要么进 passthrough 原样带走并在界面上念出来。
 */
describe('SmartAlbumModal · 条件往返不丢', () => {
  const dayStart = (y: number, m: number, d: number): number => new Date(y, m - 1, d).getTime()

  it('表单管得了的条件原样写回', async () => {
    const rules: SmartAlbumRules = {
      shapesInclude: ['landscape', 'square'],
      shapesExclude: ['portrait'],
      ratioWidth: 16,
      ratioHeight: 9,
      resolutionMin: 1920,
      maxWidth: 4000,
      maxHeight: 3000,
      importedFrom: dayStart(2026, 9, 1),
      importedTo: dayStart(2026, 9, 20),
      takenFrom: dayStart(2026, 1, 5),
      excludeKeyword: '临时',
      tagNamesAny: ['叶子', '植物'],
      tagNamesExclude: ['废弃'],
      untaggedOnly: true,
      colorClose: { hex: '#FF0000', accuracy: 25 },
      fileExtsExclude: ['gif']
    }
    const out = await editThenSave(rules)
    expect(out).toMatchObject({
      shapesInclude: ['landscape', 'square'],
      shapesExclude: ['portrait'],
      ratioWidth: 16,
      ratioHeight: 9,
      resolutionMin: 1920,
      maxWidth: 4000,
      maxHeight: 3000,
      takenFrom: dayStart(2026, 1, 5),
      excludeKeyword: '临时',
      tagNamesAny: ['叶子', '植物'],
      tagNamesExclude: ['废弃'],
      untaggedOnly: true,
      colorClose: { hex: '#FF0000', accuracy: 25 },
      fileExtsExclude: ['gif']
    })
    // 日期控件只有日粒度，结束日补齐到当天末尾（+86_399_000）是有意的语义
    expect(out.importedFrom).toBe(dayStart(2026, 9, 1))
    expect(out.importedTo).toBe(dayStart(2026, 9, 20) + 86_399_000)
  })

  it('表单管不了的键原样带走，并显示"将保留"提示', async () => {
    const w = mount(SmartAlbumModal, {
      props: {
        album: makeAlbum({
          name2: 'x' as never, // 未来新增、编辑器还不认识的键
          searchKeyword: 'cat dog',
          searchScopes: ['name', 'tags'],
          tags: ['tag-id-1']
        } as SmartAlbumRules),
        availableTags: []
      },
      global: globalStubs
    })
    await flushPromises()
    const note = w.find('p.text-warning-500').text()
    expect(note).toContain('搜索关键词')
    expect(note).toContain('搜索范围')
    // tags 有控件（按 id 那组）→ 不算未接管，不写进提示
    expect(note).not.toContain('按 id')

    const saveBtn = w.findAll('button').find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()
    const sent: SmartAlbumRules = apiMocks.updateSmartAlbum.mock.calls[0][1].rules
    expect(sent.searchKeyword).toBe('cat dog')
    expect(sent.searchScopes).toEqual(['name', 'tags'])
    expect(sent.tags).toEqual(['tag-id-1'])
    expect(sent).toHaveProperty('name2')
  })

  it('旧的 formats（带点）读进来、以 fileExtsInclude 写回，不再两种形状并存', async () => {
    const out = await editThenSave({ formats: ['.PNG', 'jpg'] })
    expect(out.formats).toBeUndefined()
    expect(out.fileExtsInclude).toEqual(['png', 'jpg'])
  })

  it('标注维「有标注」编辑保存后原样保留（M4）', async () => {
    expect(await editThenSave({ annotationFilter: 'any' })).toMatchObject({
      annotationFilter: 'any'
    })
  })

  it('标注维「无标注」编辑保存后原样保留（M4）', async () => {
    expect(await editThenSave({ annotationFilter: 'none' })).toMatchObject({
      annotationFilter: 'none'
    })
  })

  it('标注维不限档不下发（M4，缺省 = 不出现该键）', async () => {
    expect((await editThenSave({})).annotationFilter).toBeUndefined()
  })
})

/**
 * G2 补两处残留控件：folderExcludeIds（排除文件夹）与 ratingsInclude/ratingsExclude
 * （精确评分多选）——引擎（buildSmartAlbumWhere）早就支持这三个键，编辑器此前没有
 * 控件，只能靠 passthrough 兜底且界面上念英文键名。现在有控件：往返不丢 + 回显正确。
 */
describe('SmartAlbumModal · 排除文件夹与精确评分往返', () => {
  it('排除文件夹条件编辑保存后原样保留（含未分类混选）', async () => {
    expect(await editThenSave({ folderExcludeIds: ['none', 'fb'] })).toMatchObject({
      folderExcludeIds: ['none', 'fb']
    })
  })

  it('评分包含/排除编辑保存后原样保留（含 0=尚未评分）', async () => {
    expect(await editThenSave({ ratingsInclude: [5, 0], ratingsExclude: [1] })).toMatchObject({
      ratingsInclude: [5, 0],
      ratingsExclude: [1]
    })
  })

  it('排除文件夹回填真的落到控件上，且不与所属文件夹串门', async () => {
    const w = mount(SmartAlbumModal, {
      props: {
        album: makeAlbum({ folderIds: ['fa'], folderExcludeIds: ['none', 'fb'] }),
        availableTags: []
      },
      global: globalStubs
    })
    await flushPromises()
    // 两个文件夹多选 select 都含 'none' 项，按块内 label 文本认出排除那个
    // （判据用 multiple：M4 的单选「标注」select 同样含 value="none" 的选项）
    const selects = w
      .findAll('select[multiple]')
      .filter((s) => s.findAll('option').some((o) => o.element.value === 'none'))
    expect(selects.length).toBe(2)
    const excludeSelect = selects.find((s) =>
      (s.element.parentElement?.textContent ?? '').includes('排除文件夹')
    )
    expect(excludeSelect).toBeTruthy()
    const selected = excludeSelect!
      .findAll('option')
      .filter((o) => o.element.selected)
      .map((o) => o.element.value)
    expect(selected).toEqual(['none', 'fb'])
  })

  it('评分包含/排除回显为对应按钮态（包含=高亮，排除=划线）', async () => {
    const w = mount(SmartAlbumModal, {
      props: {
        album: makeAlbum({ ratingsInclude: [5], ratingsExclude: [0] }),
        availableTags: []
      },
      global: globalStubs
    })
    await flushPromises()
    const btnByLabel = (label: string): DOMWrapper<HTMLButtonElement> | undefined =>
      w.findAll('button').find((b) => b.text() === label)
    expect(btnByLabel('★★★★★')?.classes()).toContain('border-brand-500')
    expect(btnByLabel('尚未评分')?.classes()).toContain('line-through')
    // 没选的保持未选态
    expect(btnByLabel('★☆☆☆☆')?.classes()).toContain('border-line-default')
  })

  it('左键点评分写入包含集、右键写进排除集，保存不丢', async () => {
    const w = mount(SmartAlbumModal, {
      props: { album: makeAlbum({}), availableTags: [] },
      global: globalStubs
    })
    await flushPromises()
    const btnByLabel = (label: string): DOMWrapper<HTMLButtonElement> | undefined =>
      w.findAll('button').find((b) => b.text() === label)
    await btnByLabel('★★★★★')!.trigger('click') // 左键 → 包含
    await btnByLabel('尚未评分')!.trigger('contextmenu') // 右键 → 排除
    await flushPromises()
    const saveBtn = w.findAll('button').find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()
    const sent: SmartAlbumRules = apiMocks.updateSmartAlbum.mock.calls[0][1].rules
    expect(sent.ratingsInclude).toEqual([5])
    expect(sent.ratingsExclude).toEqual([0])
  })
})
