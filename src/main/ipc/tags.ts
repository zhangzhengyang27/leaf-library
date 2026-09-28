import { ipcMain } from 'electron'
import type { TagDataStore } from '../stores/TagDataStore'

export function registerTagIpcHandlers(tagStore: TagDataStore): void {
  ipcMain.handle('tag:getTags', () => {
    return tagStore.getTags()
  })

  ipcMain.handle('tag:getTagById', (_event, id: string) => {
    return tagStore.getTagById(id)
  })

  ipcMain.handle(
    'tag:addTag',
    (_event, name: string, opts?: { parentId?: string; isGroup?: boolean }) => {
      return tagStore.addTag(name, opts)
    }
  )

  ipcMain.handle('tag:updateTag', (_event, id: string, updates: any) => {
    return tagStore.updateTag(id, updates)
  })

  ipcMain.handle('tag:deleteTag', (_event, id: string) => {
    return tagStore.deleteTag(id)
  })

  // F19：多标签合并为一个（批量重命名语义）
  ipcMain.handle('tag:mergeTags', (_event, ids: string[], name: string) => {
    return tagStore.mergeTags(Array.isArray(ids) ? ids : [], String(name ?? ''))
  })

  ipcMain.handle('tag:getTagsByIds', (_event, ids: string[]) => {
    return tagStore.getTagsByIds(ids)
  })

  // 028（Eagle 标签管理复刻）：常用标签 / 群组排序 / 解散群组
  ipcMain.handle('tag:setTagsStarred', (_event, ids: string[], starred: boolean) => {
    tagStore.setTagsStarred(ids, starred)
    return true
  })

  ipcMain.handle('tag:setGroupsOrder', (_event, orderedIds: string[]) => {
    tagStore.setGroupsOrder(orderedIds)
    return true
  })

  ipcMain.handle('tag:dissolveGroup', (_event, groupId: string) => {
    return tagStore.dissolveGroup(groupId)
  })
}
