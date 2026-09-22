/**
 * P1 · 图片就地编辑 IPC（旋转 / 翻转）
 *
 * 信任边界：渲染层只递 photoId，文件路径由主进程从库里取；角度与轴向在这里过白名单，
 * 不让它们原样流到 sharp——ImageEditService 自己也会抛，但那句错误会变成 sanitize 后的
 * 内部信息，用户在界面上看到的就不是「只能旋转 90/180/270 度」了。
 */
import { ipcMain } from 'electron'
import { imageEdit, type FlipAxis } from '../services/ImageEditService'
import { sanitizeIpcMessage } from './utils'

const DEGREES: readonly number[] = [90, 180, 270]
const AXES: readonly FlipAxis[] = ['horizontal', 'vertical']

export function registerEditIpcHandlers(): void {
  ipcMain.handle('edit:canRotate', (_e, photoId: unknown) =>
    typeof photoId === 'string'
      ? imageEdit.canEdit(photoId)
      : { ok: false, reason: '参数不合法' }
  )

  ipcMain.handle('edit:rotate', async (_e, photoId: unknown, degrees: unknown) => {
    if (typeof photoId !== 'string' || photoId === '') return { ok: false, error: '参数不合法' }
    const d = Number(degrees)
    if (!DEGREES.includes(d)) return { ok: false, error: '只能旋转 90/180/270 度' }
    try {
      await imageEdit.rotate(photoId, d)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: sanitizeIpcMessage(error) }
    }
  })

  ipcMain.handle('edit:flip', async (_e, photoId: unknown, axis: unknown) => {
    if (typeof photoId !== 'string' || photoId === '') return { ok: false, error: '参数不合法' }
    if (!AXES.includes(axis as FlipAxis)) return { ok: false, error: '翻转方向不合法' }
    try {
      await imageEdit.flip(photoId, axis as FlipAxis)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: sanitizeIpcMessage(error) }
    }
  })
}
