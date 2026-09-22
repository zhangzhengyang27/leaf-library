import type { BrowserWindow } from 'electron'
import {
  batchMeta,
  clearApiKey,
  getConfig,
  setApiKey,
  suggestMeta,
  suggestRenamePattern,
  suggestTagStructure,
  testConnection
} from '../services/DeepSeekService'
import { registerHandlers } from './utils'

/**
 * DeepSeek 文本模型（D-017）。
 *
 * 只暴露 photoId 与 Key 的写入：Key 明文不回渲染层，正文由主进程按 id 反查，
 * 渲染层无从指定路径。
 */
export function registerDeepSeekIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  registerHandlers({
    'ai:config': () => getConfig(),

    'ai:setKey': (_e, key: unknown) => setApiKey(typeof key === 'string' ? key : ''),

    'ai:clearKey': () => clearApiKey(),

    'ai:test': () => testConnection(),

    'ai:batchMeta': async (_e, ids: unknown) => {
      const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
      const send = (p: { done: number; total: number; phase: string }): void => {
        getMainWindow()?.webContents.send('ai:batch', p)
      }
      return batchMeta(list, send)
    },

    'ai:tagStructure': () => suggestTagStructure(),

    'ai:renamePattern': async (_e, instruction: unknown, samples: unknown) =>
      suggestRenamePattern(
        typeof instruction === 'string' ? instruction : '',
        Array.isArray(samples) ? samples.filter((x): x is string => typeof x === 'string') : []
      ),

    'ai:suggestMeta': async (_e, photoId: unknown) =>
      typeof photoId === 'string' && photoId
        ? suggestMeta(photoId)
        : { ok: false, error: 'photoId 无效' }
  })
}
