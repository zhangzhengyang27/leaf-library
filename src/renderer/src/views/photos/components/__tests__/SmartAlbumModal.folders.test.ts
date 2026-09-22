// @vitest-environment happy-dom
/**
 * 「所属文件夹」条件必须原样往返。
 *
 * 控件早先是单选 select，回填只读 folderIds[0]、保存只写回一个元素：
 * FilterBar「保存筛选」产出的多文件夹条件，用户一进编辑器点保存就静默丢剩一个，
 * 而引擎侧 folderIds 一直是数组语义（含 'none' = 未分类与真实文件夹混选）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
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
    // 按 'none'（未分类）那一项认出文件夹控件：弹窗里还有评分/匹配模式等其它 select
    const folderSelect = w
      .findAll('select')
      .find((s) => s.findAll('option').some((o) => o.element.value === 'none'))
    expect(folderSelect).toBeTruthy()
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
          folderExcludeIds: ['fx'],
          tags: ['tag-id-1']
        } as SmartAlbumRules),
        availableTags: []
      },
      global: globalStubs
    })
    await flushPromises()
    const note = w.find('p.text-warning-500').text()
    expect(note).toContain('搜索关键词')
    expect(note).toContain('排除文件夹')
    // tags 有控件（按 id 那组）→ 不算未接管，不写进提示
    expect(note).not.toContain('按 id')

    const saveBtn = w.findAll('button').find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()
    const sent: SmartAlbumRules = apiMocks.updateSmartAlbum.mock.calls[0][1].rules
    expect(sent.searchKeyword).toBe('cat dog')
    expect(sent.folderExcludeIds).toEqual(['fx'])
    expect(sent.tags).toEqual(['tag-id-1'])
    expect(sent).toHaveProperty('name2')
  })

  it('旧的 formats（带点）读进来、以 fileExtsInclude 写回，不再两种形状并存', async () => {
    const out = await editThenSave({ formats: ['.PNG', 'jpg'] })
    expect(out.formats).toBeUndefined()
    expect(out.fileExtsInclude).toEqual(['png', 'jpg'])
  })
})
