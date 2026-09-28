// @vitest-environment happy-dom
/**
 * 028 标签管理 Eagle 复刻：useTagManager 分节/排序/常用/入组 + TagChip 契约。
 *
 * 重点是两条 Eagle 语义与一条 IPC 纪律：
 * - 群组是容器（is_group 行不进 chip 池），ALL+按群组 = 群组分节 + 末尾「未分类」
 * - 常用标签 = starred 手动设定（不再是 usageCount 自动口径）
 * - 过 IPC 的 id 数组必须是普通数组（Proxy 直传会抛 An object could not be cloned）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { isProxy } from 'vue'
import { useTagManager } from '../composables/useTagManager'
import TagChip from '../components/TagChip.vue'
import type { TagSummary } from '../../../types/photo'

const apiMocks = vi.hoisted(() => ({
  getTags: vi.fn(),
  addTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
  mergeTags: vi.fn(),
  setTagsStarred: vi.fn(),
  setGroupsOrder: vi.fn(),
  dissolveGroup: vi.fn()
}))

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { tag: apiMocks }
  })
  localStorage.clear()
})

const group = (over: Partial<TagSummary>): TagSummary => ({
  id: 'g1',
  name: '风格',
  isGroup: true,
  sortOrder: 0,
  starred: false,
  parentId: null,
  ...over
})

const makeTags = (): TagSummary[] => [
  group({ id: 'g1', name: '风格', isGroup: true, sortOrder: 1 }),
  group({ id: 'g2', name: '地点', isGroup: true, sortOrder: 0 }),
  { id: 't1', name: '雪山', parentId: 'g1', usageCount: 3 },
  { id: 't2', name: '海边', parentId: 'g1', usageCount: 5 },
  { id: 't3', name: '城市', parentId: null, usageCount: 1 }
]

describe('useTagManager · Eagle 分节语义', () => {
  it('ALL+按群组：群组分节在前、未分类殿后；群组不进 chip 池', async () => {
    apiMocks.getTags.mockResolvedValue(makeTags())
    const m = useTagManager()
    await m.load()

    const titles = m.sections.value.map((s) => s.title)
    expect(titles).toEqual(['地点', '风格', '未分类']) // sort_order 序
    const allChips = m.sections.value.flatMap((s) => s.tags.map((t) => t.name))
    expect(allChips).toEqual(['海边', '雪山', '城市']) // 组内按名称排序；群组行不出现
    expect(m.sections.value[0]!.description ?? null).toBeNull()
  })

  it('ALL+按字母：单父级扁平字母分节', async () => {
    apiMocks.getTags.mockResolvedValue(makeTags())
    const m = useTagManager()
    await m.load()
    m.groupBy.value = 'alphabet'
    expect(m.sections.value.map((s) => s.title)).toEqual(['#'])
  })

  it('常用标签 = starred 过滤（与 usageCount 无关）', async () => {
    apiMocks.getTags.mockResolvedValue([
      { id: 'a', name: 'a', starred: true, usageCount: 0 },
      { id: 'b', name: 'b', starred: false, usageCount: 9 }
    ])
    const m = useTagManager()
    await m.load()
    m.openMode('starred')
    expect(m.starredTags.value.map((t) => t.name)).toEqual(['a'])
  })

  it('点选多选 → moveTagsToGroup 落普通数组（IPC 克隆纪律）', async () => {
    apiMocks.getTags.mockResolvedValue(makeTags())
    apiMocks.updateTag.mockResolvedValue({ id: 't3', name: '城市' })
    const m = useTagManager()
    await m.load()
    const ids = [...m.selection.value, 't3'] // 模拟选中集
    await m.moveTagsToGroup(ids, 'g1')
    expect(apiMocks.updateTag).toHaveBeenCalledWith('t3', { parentId: 'g1' })
    const arg = apiMocks.updateTag.mock.calls[0]![1]
    void arg
    const passedIds = apiMocks.updateTag.mock.calls.map((c) => c[0])
    expect(passedIds).toEqual(['t3'])
    // dataTransfer 载荷同纪律：任何过桥数组不得是 Proxy
    expect(isProxy(ids)).toBe(false)
  })

  it('reorderGroups 原样透传数组给 setGroupsOrder', async () => {
    apiMocks.getTags.mockResolvedValue(makeTags())
    const m = useTagManager()
    await m.load()
    await m.reorderGroups(['g1', 'g2'])
    expect(apiMocks.setGroupsOrder).toHaveBeenCalledWith(['g1', 'g2'])
  })
})

describe('TagChip · Eagle chip 契约', () => {
  const tag: TagSummary = { id: 't1', name: '雪山', usageCount: 3, parentId: 'g1' }

  it('渲染色点/名称/(使用数)，带 data-chip-id 供框选', () => {
    const w = mount(TagChip, {
      props: { tag, selected: false, dragIds: [] }
    })
    expect(w.find('[data-chip-id="t1"]').exists()).toBe(true)
    expect(w.text()).toContain('雪山')
    expect(w.text()).toContain('(3)')
    expect(w.find('.chip-dot').exists()).toBe(true)
  })

  it('关键词命中片段加粗高亮', () => {
    const w = mount(TagChip, {
      props: { tag, selected: false, keyword: '雪', dragIds: [] }
    })
    expect(w.find('.chip-name b').text()).toBe('雪')
  })

  it('点击带修饰键上抛；选中态渲染', async () => {
    const w = mount(TagChip, {
      props: { tag, selected: true, dragIds: [] }
    })
    await w.find('.tag-chip').trigger('click', { metaKey: true })
    const emitted = w.emitted('select')!
    expect(emitted[0]![0]).toMatchObject({ id: 't1' })
    expect((emitted[0]![1] as { metaKey: boolean }).metaKey).toBe(true)
    expect(w.find('.tag-chip').classes()).toContain('is-selected')
  })
})
