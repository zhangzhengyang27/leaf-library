import { ipcMain } from 'electron'
import type { TagDataStore } from '../stores/TagDataStore'

export function registerTagIpcHandlers(tagStore: TagDataStore): void {
  ipcMain.handle('tag:getTags', () => {
    return tagStore.getTags()
  })

  ipcMain.handle('tag:getTagById', (_event, id: string) => {
    return tagStore.getTagById(id)
  })

  ipcMain.handle('tag:addTag', (_event, name: string, opts?: { parentId?: string }) => {
    return tagStore.addTag(name, opts)
  })

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
}
