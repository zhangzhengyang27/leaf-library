import { tagRepository, type TagRow } from '../db/repos/TagRepository'

export interface Tag {
  id: string
  name: string
  color?: string | null
  /** 六期标签分组：父标签 id（null=顶层） */
  parentId?: string | null
  /** 028：群组描述（Eagle group-description，仅父级标签当群组用） */
  description?: string | null
  /** 028：常用标签（Eagle starred，用户手动设定） */
  starred?: boolean
  /** 028：群组展示顺序 */
  sortOrder?: number
  /** 028：群组标记（Eagle 群组=容器；is_group 标签不进 chip 池） */
  isGroup?: boolean
  usageCount?: number
  createdAt: number
}

/**
 * TagDataStore — 5-7 纯转发层。
 */

export class TagDataStore {
  private toLegacy(row: TagRow): Tag {
    return {
      id: row.id,
      name: row.name,
      color: row.color,
      parentId: row.parent_id,
      description: row.description,
      starred: row.starred === 1,
      sortOrder: row.sort_order,
      isGroup: row.is_group === 1,
      usageCount: row.usage_count,
      createdAt: row.created_at
    }
  }

  getTags(): Tag[] {
    return tagRepository
      .all()
      .map((r) => this.toLegacy(r))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  getTagById(id: string): Tag | undefined {
    const row = tagRepository.getById(id)
    return row ? this.toLegacy(row) : undefined
  }

  getTagByName(name: string): Tag | undefined {
    const row = tagRepository.getByName(name)
    return row ? this.toLegacy(row) : undefined
  }

  addTag(
    name: string,
    opts?: { color?: string; icon?: string; parentId?: string; isGroup?: boolean }
  ): Tag {
    const row = tagRepository.create(name, opts)
    return this.toLegacy(row)
  }

  updateTag(id: string, updates: Partial<Omit<Tag, 'id' | 'createdAt'>>): Tag | undefined {
    const row = tagRepository.update(id, updates)
    return row ? this.toLegacy(row) : undefined
  }

  deleteTag(id: string): boolean {
    return tagRepository.softDelete(id)
  }

  /** F19：多标签合并为一个（Eagle 4.0 批量重命名语义） */
  mergeTags(ids: string[], name: string): Tag | undefined {
    const row = tagRepository.mergeTags(ids, name)
    return row ? this.toLegacy(row) : undefined
  }

  getTagsByIds(ids: string[]): Tag[] {
    return tagRepository.getByIds(ids).map((r) => this.toLegacy(r))
  }

  /** 028：批量设常用（Eagle starred） */
  setTagsStarred(ids: string[], starred: boolean): void {
    tagRepository.setStarred(Array.isArray(ids) ? ids : [], Boolean(starred))
  }

  /** 028：群组展示顺序落库（数组序 = sort_order） */
  setGroupsOrder(orderedIds: string[]): void {
    tagRepository.setGroupsOrder(Array.isArray(orderedIds) ? orderedIds : [])
  }

  /** 028：解散群组（成员标签改挂顶层，群组降级为普通标签） */
  dissolveGroup(groupId: string): boolean {
    return tagRepository.dissolveGroup(String(groupId ?? ''))
  }
}
