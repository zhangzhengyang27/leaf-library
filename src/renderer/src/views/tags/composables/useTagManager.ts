/**
 * useTagManager · 标签管理页状态与动作（028，Eagle tag-manager 复刻）
 *
 * 布局口径对齐 Eagle 实包（js/directives/tag-manager.html + _tag-manager.scss）：
 * - 左栏：全部 / 未分类 / 常用标签 + 标签群组 (N) 行列表（is_group 标签，拖拽排序）
 * - 右区：群组分节（群组名 (计数) ＋ 描述）+ tag chip 行；空白右键排序/分组方式
 * - 常用标签 = starred 手动设定（Eagle 语义），不再是 usageCount 自动口径
 * - 单父级模型：Eagle 的「加入群组/移动到群组」在本模型下同义，收敛为移动到群组
 */
import { computed, ref } from 'vue'
import type { TagSummary } from '../../../types/photo'
import { useToast } from '@composables/useToast'
import { useDialogs } from '../../photos/composables/useDialogs'

export type TagViewMode = 'all' | 'unfiled' | 'starred'
export type TagSortBy = 'name' | 'usage'
export type TagGroupBy = 'alphabet' | 'group'
export type TagLayoutMode = 'grid' | 'list'

/** Eagle 8 色（_tag-manager.scss .color-red…pink） */
export const TAG_PRESET_COLORS = [
  '#ef4444',
  '#f97316',
  '#22c55e',
  '#14b8a6',
  '#eab308',
  '#3b82f6',
  '#a855f7',
  '#ec4899'
] as const

/** 分节显示模型（对齐 Eagle tagsResult.display：群组名行 + chip 行 + 分隔线） */
export interface TagSection {
  key: string
  /** group=群组分节（带描述/加号）；letter=字母分节；plain=无标题（unfiled/starred 单节） */
  kind: 'group' | 'letter' | 'plain'
  /** 群组 id（kind=group 时有效） */
  groupId?: string
  title: string
  count: number
  description?: string | null
  tags: TagSummary[]
}

const PREF_KEY = 'leaf.tagManager'

interface TagManagerPrefs {
  sortBy: TagSortBy
  sortIncrease: boolean
  groupBy: TagGroupBy
  layoutMode: TagLayoutMode
}

function loadPrefs(): TagManagerPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (raw) return { ...defaultPrefs(), ...(JSON.parse(raw) as Partial<TagManagerPrefs>) }
  } catch {
    /* 忽略坏 JSON */
  }
  return defaultPrefs()
}

function defaultPrefs(): TagManagerPrefs {
  return { sortBy: 'name', sortIncrease: true, groupBy: 'group', layoutMode: 'grid' }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- ReturnType 自引用不可显式标注
export function useTagManager() {
  const toast = useToast()

  // ── 数据 ──
  const tags = ref<TagSummary[]>([])
  const loading = ref(true)

  async function load(): Promise<void> {
    loading.value = true
    try {
      tags.value = (await window.api.tag.getTags()) as TagSummary[]
    } catch (error) {
      toast.error('加载标签失败', { description: (error as Error).message })
    } finally {
      loading.value = false
    }
  }

  // ── 视图状态 ──
  const viewMode = ref<TagViewMode>('all')
  /** 当前打开的群组（viewMode=all 时为 null；Eagle currentTagGroup） */
  const currentGroupId = ref<string | null>(null)
  const prefs = ref<TagManagerPrefs>(loadPrefs())
  const keyword = ref('')

  function savePrefs(): void {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs.value))
    } catch {
      /* 忽略 */
    }
  }

  const sortBy = computed({
    get: () => prefs.value.sortBy,
    set: (v: TagSortBy) => {
      prefs.value.sortBy = v
      savePrefs()
    }
  })
  const sortIncrease = computed({
    get: () => prefs.value.sortIncrease,
    set: (v: boolean) => {
      prefs.value.sortIncrease = v
      savePrefs()
    }
  })
  const groupBy = computed({
    get: () => prefs.value.groupBy,
    set: (v: TagGroupBy) => {
      prefs.value.groupBy = v
      savePrefs()
    }
  })
  const layoutMode = computed({
    get: () => prefs.value.layoutMode,
    set: (v: TagLayoutMode) => {
      prefs.value.layoutMode = v
      savePrefs()
    }
  })

  // ── 派生 ──

  /** 群组 = is_group 标签（Eagle 群组是容器；侧栏按 sort_order 展示） */
  const groups = computed<TagSummary[]>(() =>
    tags.value.filter((t) => isGroup(t)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  )

  function isGroup(t: TagSummary): boolean {
    return Boolean(t.isGroup)
  }

  /** 非群组标签（chip 池） */
  const plainTags = computed<TagSummary[]>(() => tags.value.filter((t) => !isGroup(t)))
  const unfiledTags = computed<TagSummary[]>(() => plainTags.value.filter((t) => !t.parentId))
  const starredTags = computed<TagSummary[]>(() => plainTags.value.filter((t) => t.starred))

  function childrenOf(groupId: string): TagSummary[] {
    return plainTags.value.filter((t) => t.parentId === groupId)
  }

  function sortChips(list: TagSummary[]): TagSummary[] {
    const out = [...list]
    const dir = sortIncrease.value ? 1 : -1
    if (sortBy.value === 'usage') {
      out.sort((a, b) => dir * ((a.usageCount ?? 0) - (b.usageCount ?? 0)))
    } else {
      out.sort((a, b) => dir * a.name.localeCompare(b.name, 'zh-Hans'))
    }
    return out
  }

  function matchKeyword(t: TagSummary): boolean {
    const q = keyword.value.trim().toLowerCase()
    return !q || t.name.toLowerCase().includes(q)
  }

  /** 右区分节（Eagle tagsResult.display 同构：群组名行 + chip 行） */
  const sections = computed<TagSection[]>(() => {
    const mode = viewMode.value

    // 单群组视图：群组描述 + 成员 chips
    if (mode === 'all' && currentGroupId.value) {
      const g = groups.value.find((x) => x.id === currentGroupId.value)
      if (!g) return []
      return [
        {
          key: `group:${g.id}`,
          kind: 'group',
          groupId: g.id,
          title: g.name,
          count: childrenOf(g.id).filter(matchKeyword).length,
          description: g.description ?? null,
          tags: sortChips(childrenOf(g.id).filter(matchKeyword))
        }
      ]
    }

    if (mode === 'starred') {
      return [
        {
          key: 'starred',
          kind: 'plain',
          title: '常用标签',
          count: starredTags.value.filter(matchKeyword).length,
          tags: sortChips(starredTags.value.filter(matchKeyword))
        }
      ]
    }

    if (mode === 'unfiled') {
      return [
        {
          key: 'unfiled',
          kind: 'plain',
          title: '未分类',
          count: unfiledTags.value.filter(matchKeyword).length,
          tags: sortChips(unfiledTags.value.filter(matchKeyword))
        }
      ]
    }

    // all + 按群组：每个群组一分节，末尾补「未分类」（Eagle ALL 口径）
    if (groupBy.value === 'group') {
      const out: TagSection[] = groups.value.map((g) => ({
        key: `group:${g.id}`,
        kind: 'group',
        groupId: g.id,
        title: g.name,
        count: childrenOf(g.id).filter(matchKeyword).length,
        description: g.description ?? null,
        tags: sortChips(childrenOf(g.id).filter(matchKeyword))
      }))
      out.push({
        key: 'unfiled',
        kind: 'plain',
        title: '未分类',
        count: unfiledTags.value.filter(matchKeyword).length,
        tags: sortChips(unfiledTags.value.filter(matchKeyword))
      })
      return out
    }

    // all + 按字母（Eagle groupBy=alphabet：全部 chip 按首字母分节）
    const pool = sortChips(plainTags.value.filter(matchKeyword))
    const byLetter = new Map<string, TagSummary[]>()
    for (const t of pool) {
      const letter = firstLetter(t.name)
      if (!byLetter.has(letter)) byLetter.set(letter, [])
      byLetter.get(letter)!.push(t)
    }
    return [...byLetter.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans'))
      .map(([letter, list]) => ({
        key: `letter:${letter}`,
        kind: 'letter' as const,
        title: letter,
        count: list.length,
        tags: list
      }))
  })

  const totalCount = computed(() => tags.value.filter((t) => !isGroup(t)).length)

  function firstLetter(name: string): string {
    const ch = name.trim().charAt(0).toUpperCase()
    return /[A-Z]/.test(ch) ? ch : '#'
  }

  // ── 动作 ──

  async function reload(): Promise<void> {
    await load()
  }

  /** 左栏导航：打开固定分区（全部/未分类/常用标签），清除群组焦点 */
  function openMode(mode: TagViewMode): void {
    viewMode.value = mode
    currentGroupId.value = null
  }

  /** 左栏导航：打开群组（Eagle currentTagGroup，内容区出描述行与加号） */
  function openGroup(groupId: string): void {
    viewMode.value = 'all'
    currentGroupId.value = groupId
  }

  async function createGroup(name: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await window.api.tag.addTag(trimmed, { isGroup: true })
      await load()
    } catch (error) {
      toast.error('添加群组失败', { description: (error as Error).message })
    }
  }

  async function createTag(name: string, parentId?: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await window.api.tag.addTag(trimmed, parentId ? { parentId } : undefined)
      await load()
    } catch (error) {
      toast.error('新建标签失败', { description: (error as Error).message })
    }
  }

  async function renameTag(id: string, name: string): Promise<boolean> {
    const trimmed = name.trim()
    if (!trimmed) return false
    try {
      const updated = await window.api.tag.updateTag(id, { name: trimmed })
      if (!updated) {
        toast.error('重命名失败', { description: '可能已存在同名标签' })
        return false
      }
      await load()
      return true
    } catch (error) {
      toast.error('重命名失败', { description: (error as Error).message })
      return false
    }
  }

  async function setGroupDescription(id: string, description: string): Promise<void> {
    try {
      await window.api.tag.updateTag(id, { description })
      await load()
    } catch (error) {
      toast.error('保存描述失败', { description: (error as Error).message })
    }
  }

  async function setColor(id: string, color: string | null): Promise<void> {
    try {
      await window.api.tag.updateTag(id, { color: color ?? undefined })
      await load()
    } catch (error) {
      toast.error('设置颜色失败', { description: (error as Error).message })
    }
  }

  /** 设常用/取消常用（Eagle starred） */
  async function setStarred(ids: string[], starred: boolean): Promise<void> {
    if (ids.length === 0) return
    try {
      await window.api.tag.setTagsStarred(ids, starred)
      await load()
    } catch (error) {
      toast.error('设置常用标签失败', { description: (error as Error).message })
    }
  }

  /** 移动到群组（单父级模型：加入 ≡ 移动；groupId=null = 从群组移除） */
  async function moveTagsToGroup(ids: string[], groupId: string | null): Promise<void> {
    if (ids.length === 0) return
    try {
      for (const id of ids) {
        await window.api.tag.updateTag(id, { parentId: groupId ?? '' })
      }
      await load()
    } catch (error) {
      toast.error('移动标签失败', { description: (error as Error).message })
    }
  }

  /** 解散群组（Eagle context.tagGroup.remove：成员改挂顶层，群组降级为普通标签） */
  function dissolveGroup(groupId: string, name: string): void {
    const { requestConfirm } = useDialogs()
    requestConfirm(
      '移除群组',
      `确定移除群组「${name}」吗？\n\n群组内的标签会移到「未分类」，标签和素材本身不受影响。`,
      '移除',
      async () => {
        try {
          await window.api.tag.dissolveGroup(groupId)
          if (currentGroupId.value === groupId) {
            currentGroupId.value = null
            viewMode.value = 'all'
          }
          await load()
        } catch (error) {
          toast.error('移除群组失败', { description: (error as Error).message })
        }
      }
    )
  }

  /** 群组拖拽排序落库（数组序 = sort_order） */
  async function reorderGroups(orderedIds: string[]): Promise<void> {
    try {
      await window.api.tag.setGroupsOrder(orderedIds)
      await load()
    } catch (error) {
      toast.error('群组排序失败', { description: (error as Error).message })
    }
  }

  async function deleteTags(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const { requestConfirm } = useDialogs()
    requestConfirm(
      '删除标签',
      `确定删除选中的 ${ids.length} 个标签吗？\n\n会从所有素材上移除这些标签，素材本身不受影响。此操作不可撤销。`,
      '全部删除',
      async () => {
        try {
          for (const id of ids) await window.api.tag.deleteTag(id)
          toast.success(`已删除 ${ids.length} 个标签`)
          selection.value = new Set()
          await load()
        } catch (error) {
          toast.error('删除标签失败', { description: (error as Error).message })
        }
      }
    )
  }

  /** F19：合并选中标签为一个（保留 Leaf 增强项） */
  function mergeSelected(ids: string[]): void {
    if (ids.length < 2) {
      toast.info('请至少选择 2 个标签')
      return
    }
    const { requestPrompt } = useDialogs()
    requestPrompt({
      title: '合并标签',
      label: `把 ${ids.length} 个标签的素材关联合并到`,
      initialValue: '',
      confirmLabel: '合并',
      onSubmit: async (name) => {
        const trimmed = name.trim()
        if (!trimmed) return
        try {
          const merged = await window.api.tag.mergeTags(ids, trimmed)
          if (!merged) {
            toast.error('合并失败', { description: '目标名称无效' })
            return
          }
          toast.success(`已合并 ${ids.length} 个标签为「${merged.name}」`)
          selection.value = new Set()
          await load()
        } catch (error) {
          toast.error('合并失败', { description: (error as Error).message })
        }
      }
    })
  }

  // ── 选择（chip 单击多选 + 框选共用同一集合） ──
  const selection = ref<Set<string>>(new Set())
  const shiftAnchor = ref<string | null>(null)

  /** 当前可见 chip 的有序 id（Shift 连选/框选的判定池） */
  const visibleChipIds = computed<string[]>(() =>
    sections.value.flatMap((s) => s.tags.map((t) => t.id))
  )

  function clickSelect(
    id: string,
    mods: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }
  ): void {
    if (mods.shiftKey && shiftAnchor.value) {
      const ids = visibleChipIds.value
      const a = ids.indexOf(shiftAnchor.value)
      const b = ids.indexOf(id)
      if (a >= 0 && b >= 0) {
        const next = new Set(selection.value)
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(ids[i])
        selection.value = next
        return
      }
    }
    if (mods.metaKey || mods.ctrlKey) {
      const next = new Set(selection.value)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      selection.value = next
      shiftAnchor.value = id
      return
    }
    // 裸点击 = 单选（Eagle chip 点选语义）
    selection.value = new Set([id])
    shiftAnchor.value = id
  }

  function setSelection(ids: string[]): void {
    selection.value = new Set(ids)
  }

  function clearSelection(): void {
    selection.value = new Set()
    shiftAnchor.value = null
  }

  /** 空白右键排序项（Eagle openTagGroupListContextMenu：A>Z / Z>A / 使用数） */
  function changeSort(by: TagSortBy, increase: boolean): void {
    prefs.value.sortBy = by
    prefs.value.sortIncrease = increase
    savePrefs()
  }

  return {
    // 数据
    tags,
    loading,
    load,
    reload,
    // 视图状态
    viewMode,
    currentGroupId,
    openMode,
    openGroup,
    keyword,
    sortBy,
    sortIncrease,
    groupBy,
    layoutMode,
    changeSort,
    // 派生
    groups,
    plainTags,
    unfiledTags,
    starredTags,
    childrenOf,
    sections,
    totalCount,
    isGroup,
    // 动作
    createGroup,
    createTag,
    renameTag,
    setGroupDescription,
    setColor,
    setStarred,
    moveTagsToGroup,
    dissolveGroup,
    reorderGroups,
    deleteTags,
    mergeSelected,
    // 选择
    selection,
    visibleChipIds,
    clickSelect,
    setSelection,
    clearSelection,
    TAG_PRESET_COLORS
  }
}

export type TagManagerStore = ReturnType<typeof useTagManager>
