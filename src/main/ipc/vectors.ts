/**
 * G1 · 向量档 IPC（状态 / 下载 / 建索引 / 找相似 / 文搜图）
 *
 * 单列一个模块而不是塞进 photos.ts：photos 的处理器表已 150+ 项，
 * 而这一组要管外部进程与模型文件，出错面完全不同。
 *
 * IPC 信任边界（本模块反复踩过的那类 P0）：
 *  - topK 一律钳到 [1, 200]，渲染层传什么都不能把全库向量捞走；
 *  - 下载/建索引都只接受布尔与常量，不接路径、不接模型 id、不接 URL；
 *  - `vectors:similar` / `vectors:search` 只回当前库里的素材，且过滤掉取不到的行；
 *  - 查询串只用来做 embedding，长度钳到 200 个字符，绝不拼进 SQL。
 */
import { ipcMain } from 'electron'
import { readFileSync, statSync } from 'node:fs'
import { photoStore } from '../stores'
import { clipEmbeddings } from '../services/ClipEmbeddingService'
import { sanitizeIpcMessage } from './utils'

/** 外部图上限 32MB：搜图选中的是用户机器上任意文件，不能拿它去解一张 200MB 的巨图 */
const MAX_IMAGE_BYTES = 32 * 1024 * 1024

const clampK = (v: unknown): number => {
  const n = Number(v)
  if (!Number.isFinite(n)) return 24
  return Math.min(Math.max(Math.trunc(n), 1), 200)
}

export function registerVectorsIpcHandlers(): void {
  ipcMain.handle('vectors:status', () => clipEmbeddings.status())

  /** 下载模型（幂等：已就绪直接返回）。754MB，进度靠轮询 status 的 downloadGot/Total */
  ipcMain.handle('vectors:download', async () => {
    try {
      await clipEmbeddings.download()
      return { ok: true as const }
    } catch (error) {
      return { ok: false as const, error: sanitizeIpcMessage(error) }
    }
  })

  /**
   * 全库建索引。故意不 await：5 万张库要跑十几分钟，IPC 挂着会把渲染层的
   * 超时与取消语义搅成一团；进度与失败都从 status 读。
   */
  ipcMain.handle('vectors:indexAll', (_e, rebuild: unknown) => {
    if (clipEmbeddings.running) return { ok: false as const, error: '已有索引任务在跑' }
    void clipEmbeddings
      .indexAll(undefined, { onlyMissing: !rebuild })
      .catch((error: unknown) =>
        console.error('[vectors] indexAll failed', sanitizeIpcMessage(error))
      )
    return { ok: true as const }
  })

  ipcMain.handle('vectors:cancelIndex', () => {
    clipEmbeddings.cancelIndexing()
    return true
  })

  ipcMain.handle('vectors:clearVectors', () => ({ removed: clipEmbeddings.clearVectors() }))

  ipcMain.handle('vectors:removeModel', () => {
    clipEmbeddings.removeModel()
    return true
  })

  /** 向量档"找相似"：pHash 之外的那一档（模型未就绪时返回空，不报错） */
  ipcMain.handle('vectors:similar', async (_e, photoId: string, topK?: number) => {
    if (typeof photoId !== 'string' || photoId === '') return []
    if (!clipEmbeddings.isReady()) return []
    const photo = photoStore.getPhotoById(photoId)
    if (!photo) return []
    const hits = await clipEmbeddings.searchByPhoto(photoId, photo.filePath, clampK(topK))
    const out: Array<{ photo: ReturnType<typeof photoStore.getPhotoById>; score: number }> = []
    for (const hit of hits) {
      const p = photoStore.getPhotoById(hit.id)
      if (p) out.push({ photo: p, score: hit.score })
    }
    return out
  })

  /**
   * 以图搜库内：渲染层给的是文件选择器选中的路径，主进程必须自己验一遍
   * （本模块反复栽在同一类 P0 上：路径不能信渲染层）。
   * 只读、只当图片解码，落盘位置不做任何假设。
   */
  ipcMain.handle('vectors:similarByImage', async (_e, filePath: unknown, topK?: number) => {
    if (typeof filePath !== 'string' || filePath === '') return []
    if (!clipEmbeddings.isReady()) return []
    try {
      const st = statSync(filePath)
      if (!st.isFile() || st.size === 0 || st.size > MAX_IMAGE_BYTES) return []
      const hits = await clipEmbeddings.searchByImageBuffer(readFileSync(filePath), clampK(topK))
      const out: Array<{ photo: ReturnType<typeof photoStore.getPhotoById>; score: number }> = []
      for (const hit of hits) {
        const p = photoStore.getPhotoById(hit.id)
        if (p) out.push({ photo: p, score: hit.score })
      }
      return out
    } catch (error) {
      console.warn('[vectors] similarByImage failed', sanitizeIpcMessage(error))
      return []
    }
  })

  /** 文搜图：只回余弦过实测阈值的行，宁可空结果也不返回不相干的图 */
  ipcMain.handle('vectors:search', async (_e, query: unknown, topK?: number) => {
    if (typeof query !== 'string') return []
    const text = query.trim().slice(0, 200)
    if (text === '') return []
    if (!clipEmbeddings.isReady()) return []
    const hits = await clipEmbeddings.searchText(text, clampK(topK))
    const out: Array<{ photo: ReturnType<typeof photoStore.getPhotoById>; score: number }> = []
    for (const hit of hits) {
      const p = photoStore.getPhotoById(hit.id)
      if (p) out.push({ photo: p, score: hit.score })
    }
    return out
  })
}
