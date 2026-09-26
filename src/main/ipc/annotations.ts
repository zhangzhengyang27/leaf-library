/**
 * P1 · 标注 comments[] IPC
 *
 * 形状与上限单源在 @shared/annotations：主进程拿它做入口判据，渲染层拿它做即时反馈，
 * 两边是同一个函数，不会出现「界面填得进去、落库直接崩 CHECK」。
 * id 一律先过 isAnnotationIdLike 再进 SQL——库里都是 uuid，形状不对的东西没有别的含义。
 */
import { ipcMain } from 'electron'
import { photoAnnotationRepository } from '../db/repos/PhotoAnnotationRepository'
import { isAnnotationIdLike, type PhotoAnnotation } from '@shared/annotations'
import { sanitizeIpcMessage } from './utils'

type CreateResult = { ok: true; id: string } | { ok: false; error: string }
/** 与 preload 的 AnnotationWriteResult 同形：写入类通道统一回全量列表，省掉「写完再拉一次」的竞态 */
type WriteResult = { ok: false; error: string } | { ok: true; id: string; items: PhotoAnnotation[] }

function afterWrite(photoId: string, r: CreateResult): WriteResult {
  if (!r.ok) return { ok: false, error: r.error }
  return {
    ok: true,
    id: r.id,
    items: isAnnotationIdLike(photoId) ? photoAnnotationRepository.listByPhotoId(photoId) : []
  }
}

export function registerAnnotationIpcHandlers(): void {
  ipcMain.handle('annotations:list', (_e, photoId: unknown) =>
    isAnnotationIdLike(photoId) ? photoAnnotationRepository.listByPhotoId(photoId) : []
  )

  ipcMain.handle('annotations:create', (_e, photoId: unknown, input: unknown): WriteResult => {
    if (!isAnnotationIdLike(photoId)) return { ok: false, error: '素材 id 不合法' }
    try {
      return afterWrite(photoId, photoAnnotationRepository.create(photoId, input))
    } catch (error) {
      return { ok: false, error: sanitizeIpcMessage(error) }
    }
  })

  ipcMain.handle(
    'annotations:update',
    (_e, id: unknown, photoId: unknown, input: unknown): WriteResult => {
      if (!isAnnotationIdLike(id) || !isAnnotationIdLike(photoId)) {
        return { ok: false, error: '参数不合法' }
      }
      try {
        const r = photoAnnotationRepository.update(id, input)
        return r.ok
          ? { ok: true, id, items: photoAnnotationRepository.listByPhotoId(photoId) }
          : { ok: false, error: r.error }
      } catch (error) {
        return { ok: false, error: sanitizeIpcMessage(error) }
      }
    }
  )

  ipcMain.handle('annotations:remove', (_e, id: unknown, photoId: unknown): WriteResult => {
    if (!isAnnotationIdLike(id) || !isAnnotationIdLike(photoId)) {
      return { ok: false, error: '参数不合法' }
    }
    try {
      const r = photoAnnotationRepository.remove(id)
      return r.ok
        ? { ok: true, id, items: photoAnnotationRepository.listByPhotoId(photoId) }
        : { ok: false, error: r.error }
    } catch (error) {
      return { ok: false, error: sanitizeIpcMessage(error) }
    }
  })

  /**
   * M3 · 批量计数（卡片角标用）：入参 photo id 列表，回 `{ photoId: 条数 }` 记录，
   * 没有标注的 id 不出现在记录里（渲染层 get 不到即不显示徽标）。
   * id 先过 isAnnotationIdLike 再进 SQL；repo 内部按 500 一片切片查询——
   * 超过 500 的部分被静默截断（不报错），渲染层应自行分片调用避免徽标丢失。
   */
  ipcMain.handle('annotations:count', (_e, ids: unknown): Record<string, number> => {
    if (!Array.isArray(ids)) return {}
    const valid = ids.filter((i) => isAnnotationIdLike(i))
    return Object.fromEntries(photoAnnotationRepository.countByPhotoIds(valid))
  })
}
