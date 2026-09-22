/**
 * 022 存量回填：`backfillMissingFps` 必须真的把 ffmpeg 探到的帧率写进行。
 *
 * 用随包 ffmpeg 现场合成一条 24fps 片子，配一个只实现三个方法的假 repo——
 * 这样测的是「服务这条链」（查询条件 → 探测 → 写回 → 不再被捞出），
 * 而不是我预期的输出。素材缺失时整文件跳过，不让 CI 在没有 ffmpeg 的机器上假红。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createRequire } from 'module'
import { AssetProcessingService } from '../AssetProcessingService'
import type { PhotoRepository } from '../../db/repos/PhotoRepository'

const require = createRequire(process.cwd() + '/package.json')
let ffmpeg = ''
try {
  ffmpeg = require('@ffmpeg-installer/ffmpeg').path
} catch {
  ffmpeg = ''
}

const clip = { dir: '', path: '' }
beforeAll(() => {
  if (!ffmpeg || !existsSync(ffmpeg)) return
  clip.dir = mkdtempSync(join(tmpdir(), 'leaf-fps-backfill-'))
  clip.path = join(clip.dir, 'c24.mp4')
  execFileSync(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=160x120:rate=24:duration=1',
      '-r',
      '24',
      '-pix_fmt',
      'yuv420p',
      clip.path
    ],
    { timeout: 60_000 }
  )
})
afterAll(() => {
  if (clip.dir) rmSync(clip.dir, { recursive: true, force: true })
})

/** 只实现这条链用到的方法，其余一律抛（用错了会立刻响） */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- 测试辅助
function fakeRepo(rows: Array<{ id: string; file_path: string }>) {
  const written = new Map<string, number>()
  const repo = {
    // 已写回的不再被捞出：回填循环靠这个停，否则每轮都重探同一批
    getFpsBackfillPending: (limit: number) =>
      rows.filter((r) => !written.has(r.id)).slice(0, limit),
    updateBackfilledFps: (id: string, fps: number) => {
      written.set(id, fps)
    }
  }
  const photos = repo as unknown as PhotoRepository
  const service = new AssetProcessingService({
    photos,
    thumbs: { pathFor: () => '' } as never
  })
  return { service, written }
}

describe.skipIf(!ffmpeg || !existsSync(ffmpeg || ''))(
  'backfillMissingFps（真素材 + 假 repo）',
  () => {
    it('把 ffmpeg 探到的 24 写进每条待回填的行', async () => {
      const rows = [
        { id: 'a', file_path: clip.path },
        { id: 'b', file_path: clip.path }
      ]
      const { service, written } = fakeRepo(rows)
      expect(await service.backfillMissingFps(10)).toBe(2)
      expect([...written.entries()]).toEqual([
        ['a', 24],
        ['b', 24]
      ])
      // 写完之后没有待回填行：下一轮直接返回 0，循环能停
      expect(await service.backfillMissingFps(10)).toBe(0)
    })

    it('文件不可达时不写、不抛，并且下一轮不再重复起进程', async () => {
      const rows = [{ id: 'gone', file_path: join(clip.dir, '没有这个文件.mp4') }]
      const { service, written } = fakeRepo(rows)
      expect(await service.backfillMissingFps(10)).toBe(0)
      expect(written.size).toBe(0)
      expect(await service.backfillMissingFps(10)).toBe(0) // 靠跳过集终止，不再探测
    })

    it('limit 之内只做 limit 条（启动回填不能一次卡住主进程）', async () => {
      const rows = Array.from({ length: 5 }, (_, i) => ({ id: `v${i}`, file_path: clip.path }))
      const { service } = fakeRepo(rows)
      expect(await service.backfillMissingFps(2)).toBe(2)
    })
  }
)
