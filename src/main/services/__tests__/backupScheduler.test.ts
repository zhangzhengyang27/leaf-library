// @vitest-environment node
/**
 * BackupSchedulerService（F16）服务壳单测。
 *
 * selectBackupsToDelete 的排序/保留语义由 utils/__tests__/backupRetention.test.ts 覆盖，
 * 这里不重复；钉的是包在它外面的服务行为：
 * - 配置解析的兜底（非法 interval/keep/lastAt 回落默认）
 * - runNow：备份落盘 + last-at 落库 + 保留清理真的 unlink（且不碰前缀之外的文件）+ 并发互斥
 * - checkDue：未启用/未到期不动作；到期才静默备份；失败通知 24h 节流
 * - start/stop：30s 首查 + 每小时复查，重复 start 不叠加
 *
 * electron 边界用 vi.mock 抽掉：database.handle（db.backup 换成可控假件）、
 * libraryRegistry.activeRoot（库根指向临时目录）、NotificationService（记录调用）。
 * prefs 走构造器注入的内存 K-V——服务签名本来就允许注入，不需要真库。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { BackupSchedulerService } from '../BackupSchedulerService'

const state = vi.hoisted(() => ({
  root: '',
  /** db.backup 的替身：默认真写文件（模拟成功路径），测试可换成挂起/抛错/不落盘 */
  backupImpl: null as null | ((dest: string) => Promise<void>),
  notifications: [] as Array<{ title: string; body: string }>
}))

vi.mock('../../db/database', () => ({
  database: {
    get handle() {
      return {
        backup: async (dest: string) => {
          if (state.backupImpl) await state.backupImpl(dest)
          else writeFileSync(dest, 'leaf-backup-stub')
        }
      }
    }
  }
}))

vi.mock('../../modules/libraryRegistry', () => ({
  activeRoot: () => state.root
}))

vi.mock('../../services/NotificationService', () => ({
  NotificationService: {
    getInstance: () => ({
      showInfo: (title: string, body?: string) => {
        state.notifications.push({ title, body: body ?? '' })
      }
    })
  }
}))

const DAY_MS = 24 * 60 * 60 * 1000

describe('BackupSchedulerService · getConfig / setConfig（配置兜底与持久化）', () => {
  let root: string
  let prefStore: Map<string, string>
  let svc: BackupSchedulerService

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'leaf-backup-svc-'))
    state.root = root
    state.backupImpl = null
    state.notifications = []
    prefStore = new Map()
    svc = new BackupSchedulerService({
      get: (k: string) => prefStore.get(k) ?? null,
      set: (k: string, v: string) => {
        prefStore.set(k, v)
      }
    })
  })
  afterEach(() => {
    svc.stop()
    vi.useRealTimers()
    rmSync(root, { recursive: true, force: true })
  })

  it('无配置按默认值：enabled=false / intervalDays=7 / keep=10 / lastAt=null / dir=<库根>/backups', () => {
    expect(svc.getConfig()).toEqual({
      enabled: false,
      intervalDays: 7,
      keep: 10,
      lastAt: null,
      dir: join(root, 'backups')
    })
  })

  it('非法值兜底：interval/keep 非正数或非数字回落默认，lastAt 非数字视为从未备份', () => {
    prefStore.set('backup:interval-days', '0')
    prefStore.set('backup:keep', '-3')
    prefStore.set('backup:last-at', '不是数字')
    const bad = svc.getConfig()
    expect(bad.intervalDays).toBe(7)
    expect(bad.keep).toBe(10)
    expect(bad.lastAt).toBeNull()

    prefStore.set('backup:interval-days', '3')
    prefStore.set('backup:keep', '5')
    prefStore.set('backup:last-at', String(1234567890))
    const ok = svc.getConfig()
    expect(ok.intervalDays).toBe(3)
    expect(ok.keep).toBe(5)
    expect(ok.lastAt).toBe(1234567890)
  })

  it('setConfig 只落合法项，并按 enabled 启停定时器', async () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(svc, 'checkDue').mockResolvedValue(undefined)

    svc.setConfig({ enabled: true, intervalDays: 2, keep: 4 })
    expect(prefStore.get('backup:auto-enabled')).toBe('1')
    expect(prefStore.get('backup:interval-days')).toBe('2')
    expect(prefStore.get('backup:keep')).toBe('4')

    // 启用后 30s 首查跑一次
    await vi.advanceTimersByTimeAsync(30_000)
    expect(spy).toHaveBeenCalledTimes(1)

    // 关闭即停：之后不再有例行检查
    svc.setConfig({ enabled: false })
    expect(prefStore.get('backup:auto-enabled')).toBe('0')
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000)
    expect(spy).toHaveBeenCalledTimes(1)

    // 非法 patch 不落库：已有合法值不被冲掉
    svc.setConfig({ intervalDays: 0, keep: -1 })
    expect(prefStore.get('backup:interval-days')).toBe('2')
    expect(prefStore.get('backup:keep')).toBe('4')
  })
})

describe('BackupSchedulerService · runNow（立即备份）', () => {
  let root: string
  let prefStore: Map<string, string>
  let svc: BackupSchedulerService

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'leaf-backup-svc-'))
    state.root = root
    state.backupImpl = null
    state.notifications = []
    prefStore = new Map()
    svc = new BackupSchedulerService({
      get: (k: string) => prefStore.get(k) ?? null,
      set: (k: string, v: string) => {
        prefStore.set(k, v)
      }
    })
  })
  afterEach(() => {
    svc.stop()
    vi.useRealTimers()
    rmSync(root, { recursive: true, force: true })
  })

  it('成功：备份落 <库根>/backups，last-at 更新，超出 keep 的旧份真被 unlink 且不碰前缀之外的文件', async () => {
    prefStore.set('backup:keep', '2')
    const dir = join(root, 'backups')
    mkdirSync(dir, { recursive: true })
    const old1 = join(dir, 'leaf-backup-2020-01-01T00-00-00-000Z.db')
    const old2 = join(dir, 'leaf-backup-2020-01-02T00-00-00-000Z.db')
    const decoy = join(dir, 'not-a-backup.db')
    writeFileSync(old1, 'old1')
    writeFileSync(old2, 'old2')
    writeFileSync(decoy, 'decoy')
    // utimesSync 传数字按「秒」解释，必须用 Date 对象才是毫秒口径
    const t = Date.now()
    utimesSync(old1, new Date(t), new Date(t - 5000))
    utimesSync(old2, new Date(t), new Date(t - 4000))

    const r = await svc.runNow()
    expect(r.ok).toBe(true)
    expect(r.file && existsSync(r.file)).toBe(true)
    // 三份 leaf-backup 里最旧的 old1 被清掉（保留策略的选择逻辑归 backupRetention 单测）
    const remaining = readdirSync(dir).filter((n) => n.startsWith('leaf-backup-')).sort()
    expect(remaining.length).toBe(2)
    expect(remaining).not.toContain('leaf-backup-2020-01-01T00-00-00-000Z.db')
    // prune 的前缀过滤：非备份文件不陪葬
    expect(existsSync(decoy)).toBe(true)
    // 备份时刻落库
    expect(Number(prefStore.get('backup:last-at'))).toBeGreaterThan(0)
  })

  it('并发互斥：上一次还没跑完时再次触发返回「备份进行中」', async () => {
    let release!: () => void
    const gate = new Promise<void>((res) => {
      release = res
    })
    state.backupImpl = async () => {
      await gate
    }

    const first = svc.runNow()
    const second = await svc.runNow()
    expect(second.ok).toBe(false)
    expect(second.error).toBe('备份进行中')
    release()
    await first
  })

  it('备份失败：返回 ok=false + error，不更新 last-at（留给下次到期重试）', async () => {
    prefStore.set('backup:last-at', '1000')
    state.backupImpl = async () => {
      throw new Error('磁盘空间不足')
    }

    const r = await svc.runNow()
    expect(r.ok).toBe(false)
    expect(r.error).toBe('磁盘空间不足')
    expect(prefStore.get('backup:last-at')).toBe('1000')
  })

  it('备份句柄没产出文件：按「备份文件未生成」失败', async () => {
    state.backupImpl = async () => {
      /* 什么都不写 */
    }
    const r = await svc.runNow()
    expect(r.ok).toBe(false)
    expect(r.error).toBe('备份文件未生成')
  })
})

describe('BackupSchedulerService · checkDue（到期判定与失败通知节流）', () => {
  let root: string
  let prefStore: Map<string, string>
  let svc: BackupSchedulerService

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'leaf-backup-svc-'))
    state.root = root
    state.backupImpl = null
    state.notifications = []
    prefStore = new Map()
    svc = new BackupSchedulerService({
      get: (k: string) => prefStore.get(k) ?? null,
      set: (k: string, v: string) => {
        prefStore.set(k, v)
      }
    })
  })
  afterEach(() => {
    svc.stop()
    vi.useRealTimers()
    rmSync(root, { recursive: true, force: true })
  })

  const backupFiles = (): string[] => {
    const dir = join(root, 'backups')
    return existsSync(dir) ? readdirSync(dir).filter((n) => n.startsWith('leaf-backup-')) : []
  }

  it('未启用：到期判定直接短路，不产生任何备份', async () => {
    prefStore.set('backup:auto-enabled', '0')
    prefStore.set('backup:interval-days', '7')
    prefStore.set('backup:last-at', '0') // 远古 = 必然到期，但开关没开
    await svc.checkDue()
    expect(backupFiles()).toEqual([])
    expect(prefStore.get('backup:last-at')).toBe('0')
  })

  it('启用但未到期（lastAt + intervalDays*DAY > now）：不备份', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-10T00:00:00Z'))
    prefStore.set('backup:auto-enabled', '1')
    prefStore.set('backup:interval-days', '7')
    prefStore.set('backup:last-at', String(Date.now() - 2 * DAY_MS))

    await svc.checkDue()
    expect(backupFiles()).toEqual([])
  })

  it('到期（距上次 ≥ intervalDays）：静默执行备份并刷新 last-at', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-10T00:00:00Z'))
    prefStore.set('backup:auto-enabled', '1')
    prefStore.set('backup:interval-days', '7')
    prefStore.set('backup:last-at', String(Date.now() - 8 * DAY_MS))

    await svc.checkDue()
    expect(backupFiles().length).toBe(1)
    // last-at 刚刚刷新（fake 时钟下 Date.now 就是当前系统时刻）
    expect(Number(prefStore.get('backup:last-at'))).toBeGreaterThan(Date.now() - 60_000)
  })

  it('自动备份失败要通知用户，且 24h 内不重复打扰', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-10T00:00:00Z'))
    prefStore.set('backup:auto-enabled', '1')
    prefStore.set('backup:interval-days', '1')
    prefStore.set('backup:last-at', String(Date.now() - 2 * DAY_MS))
    state.backupImpl = async () => {
      throw new Error('权限不足')
    }

    await svc.checkDue()
    expect(state.notifications).toEqual([{ title: '自动备份失败', body: '权限不足' }])

    // 1 小时后的下一次例行检查：仍在节流窗口内
    vi.setSystemTime(new Date('2026-01-10T01:00:00Z'))
    await svc.checkDue()
    expect(state.notifications.length).toBe(1)

    // 过了 24h：再失败要再提醒
    vi.setSystemTime(new Date('2026-01-11T02:00:00Z'))
    await svc.checkDue()
    expect(state.notifications.length).toBe(2)
  })
})

describe('BackupSchedulerService · start / stop（定时器壳）', () => {
  let root: string
  let svc: BackupSchedulerService

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'leaf-backup-svc-'))
    state.root = root
    state.backupImpl = null
    state.notifications = []
    svc = new BackupSchedulerService({
      get: () => null,
      set: () => undefined
    })
  })
  afterEach(() => {
    svc.stop()
    vi.useRealTimers()
    rmSync(root, { recursive: true, force: true })
  })

  it('start：30s 首查 + 每小时复查；重复 start 不叠加；stop 后彻底安静', async () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(svc, 'checkDue').mockResolvedValue(undefined)

    svc.start()
    svc.start() // 幂等：不叠加定时器
    await vi.advanceTimersByTimeAsync(30_000)
    expect(spy).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(spy).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(spy).toHaveBeenCalledTimes(3)

    svc.stop()
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000)
    expect(spy).toHaveBeenCalledTimes(3)
  })
})
