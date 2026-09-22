/**
 * G1 · 搜索链 IPC（中文分词取词）
 *
 * 为什么单独一个模块而不塞进 photos.ts：photos.ts 此刻正被同仓另一个会话在飞改写，
 * 而词典只在主进程一份——渲染层要拿同一套词，就得有个稳定的入口。
 *
 * IPC 信任边界：入参只当查询串切词用，不碰路径、不拼 SQL；出参是词数组，
 * 长度已在 segmentQuery 里封顶。
 */
import { ipcMain } from 'electron'
import { dictionaryStatus, segmentQuery } from '../services/querySegment'

/** 与 vectors:search、semanticRules 同一道闸：查询串不能想塞多长就塞多长 */
const MAX_QUERY_CHARS = 200

export function registerSearchIpcHandlers(): void {
  /** 渲染层客户端回退匹配取词用：与 SQL 下推同一套，避免两条路径语义分叉 */
  ipcMain.handle('search:segmentWords', (_e, query: unknown) =>
    typeof query === 'string' ? segmentQuery(query.slice(0, MAX_QUERY_CHARS)) : []
  )

  /** 词典到底在不在用（false = 已回落空白切分，排查"为什么搜不到"第一个要看这个） */
  ipcMain.handle('search:segmentStatus', () => dictionaryStatus())
}
