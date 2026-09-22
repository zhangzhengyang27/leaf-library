import { tagRepository, type TagRow } from '../db/repos/TagRepository'

export interface Tag {
  id: string
  name: string
  color?: string | null
  /** 六期标签分组：父标签 id（null=顶层） */
  parentId?: string | null
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

  addTag(name: string, opts?: { color?: string; icon?: string; parentId?: string }): Tag {
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
}
