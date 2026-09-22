// @vitest-environment happy-dom
/**
 * rules ⇄ 筛选状态 的往返不变式。
 *
 * 单向映射（tab → rules）出错会在筛选结果里立刻看见；反向（rules → tab）出错是静默的：
 * 保存的预设/编辑智能夹回填时悄悄少一条条件，用户看不出任何异常。
 * 所以这里断言的是：**摊回 chip 再序列化一次，必须得到逐字段相同的 rules**，
 * 且 buildFiltersSpec 能产出的每一项都不落进 unsupported。
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import { buildFiltersSpec } from '../usePhotoFilterSpec'
import { rulesToFilters } from '../rulesToFilters'

beforeAll(() => {
  setActivePinia(createPinia())
})

beforeEach(() => {
  localStorage.clear()
  useLibraryTabs().resetForTests()
})

/** 尽量把 chip 状态填满：每一项都对应 buildFiltersSpec 的一个产出字段 */
function seedWideFilters(): void {
  const t = useLibraryTabs().active
  t.view = 'all'
  t.kindFilter = 'image'
  t.colorFilter = null
  t.colorMatch = 'close'
  t.colorClose = { hex: '#FF0000', accuracy: 25 }
  t.ratingInclude = [4, 5]
  t.ratingExclude = [0]
  t.sizeRange = [1024, 204800]
  t.shapeInclude = ['landscape', 'square']
  t.shapeExclude = ['panoramicPortrait']
  t.ratioFilter = [16, 9]
  t.tagFilter = ['叶子', '植物']
  t.tagMatchAny = true
  t.tagMatchExact = false
  t.tagExclude = ['废弃']
  t.untaggedOnly = false
  t.folderFilter = ''
  t.folderFilterIds = ['f1', 'f2', 'none']
  t.folderExcludeIds = ['f9']
  t.customTime = [1_700_000_000_000, 1_750_000_000_000]
  t.timeFilter = ''
  t.modifiedTimeRange = [1_690_000_000_000, 1_760_000_000_000]
  t.durationRange = [1000, 60_000]
  t.noteKeyword = '截图备注'
  t.noteKeywordExact = true
  t.urlKeyword = 'github.com'
  t.urlKeywordExact = false
  t.excludeKeyword = '临时'
  t.formatInclude = ['png', 'webp']
  t.formatExclude = [' gif ']
  t.resolutionFilter = '2k'
  t.searchKeyword = 'cat dog'
}

describe('rulesToFilters · 往返不变式', () => {
  it('摊回 chip 再序列化，得到的 rules 逐字段相同', () => {
    seedWideFilters()
    const rules = buildFiltersSpec()
    const { fields, unsupported } = rulesToFilters(rules)

    // 正向能产出的东西不该反向表达不了——落进 unsupported 就是静默丢的入口
    expect(unsupported).toEqual([])

    const tabs = useLibraryTabs()
    tabs.resetForTests()
    Object.assign(tabs.active, fields)
    expect(buildFiltersSpec()).toEqual(rules)
  })

  it('多文件夹条件完整回来（缺陷4 同一形状的反向防线）', () => {
    const tabs = useLibraryTabs()
    tabs.resetForTests()
    tabs.active.folderFilterIds = ['fa', 'fb', 'fc']
    const rules = buildFiltersSpec()
    tabs.resetForTests()
    Object.assign(tabs.active, rulesToFilters(rules).fields)
    expect(tabs.active.folderFilterIds).toEqual(['fa', 'fb', 'fc'])
    expect(buildFiltersSpec().folderIds).toEqual(['fa', 'fb', 'fc'])
  })

  it('表达不了的条件进 unsupported 而不是悄悄消失', () => {
    const { fields, unsupported } = rulesToFilters({
      match: 'any',
      favorite: true,
      takenFrom: 1,
      minWidth: 800,
      tags: ['missing-in-dict']
    })
    expect(Object.keys(fields)).toEqual([])
    // 播报顺序无意义，按集合断言
    expect(unsupported).toHaveLength(5)
    expect(new Set(unsupported)).toEqual(
      new Set([
        '任一条件匹配',
        '仅看收藏',
        '自定义宽高上下限',
        '按 id 存的标签',
        '拍摄日期'
      ])
    )
  })

  it('旧的「≥N 星」写法展开成精确星级集合，筛选结果口径不变', () => {
    const { fields } = rulesToFilters({ minRating: 4 })
    expect(fields.ratingInclude).toEqual([4, 5])
  })

  it('搜索范围单列回传（它是全局单例，不在 tab 字段里）', () => {
    const { scopes } = rulesToFilters({ searchKeyword: 'x', searchScopes: ['name', 'docText'] })
    expect(scopes).toEqual(['name', 'docText'])
  })
})
