import type { BrowserWindow } from 'electron'
import {
  batchMeta,
  batchVisionMeta,
  clearApiKey,
  getConfig,
  setApiKey,
  setVisionConfig,
  suggestMeta,
  suggestRenamePattern,
  suggestTagStructure,
  testConnection,
  testVisionConnection
} from '../services/DeepSeekService'
import { registerHandlers } from './utils'

/**
 * DeepSeek 文本模型（D-017）与视觉打标（M3 看图工作流）。
 *
 * 只暴露 photoId 与 Key 的写入：Key 明文不回渲染层，正文与图片都由主进程按 id 反查
 * （视觉请求的图片 base64 只来自库内缩略图），渲染层无从指定路径。
 */
export function registerDeepSeekIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  const sendBatchProgress = (p: { done: number; total: number; phase: string }): void => {
    getMainWindow()?.webContents.send('ai:batch', p)
  }

  registerHandlers({
    'ai:config': () => getConfig(),

    'ai:setKey': (_e, key: unknown) => setApiKey(typeof key === 'string' ? key : ''),

    'ai:clearKey': () => clearApiKey(),

    'ai:test': () => testConnection(),

    'ai:setVisionConfig': (_e, cfg: unknown) =>
      setVisionConfig(
        cfg && typeof cfg === 'object'
          ? (cfg as { model?: unknown; endpoint?: unknown; enabled?: unknown })
          : {}
      ),
    'ai:testVision': () => testVisionConnection(),

    'ai:batchMeta': async (_e, ids: unknown) => {
      const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
      return batchMeta(list, sendBatchProgress)
    },

    'ai:batchVision': async (_e, ids: unknown) => {
      const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
      return batchVisionMeta(list, sendBatchProgress)
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
