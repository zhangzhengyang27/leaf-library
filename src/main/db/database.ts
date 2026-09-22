/**
 * Leaf · SQLite 数据库单例
 *
 * 职责：
 * - 维护全局唯一的 better-sqlite3.Database handle
 * - 首次访问时懒打开 userData/leaf.db
 * - 启用 WAL / foreign_keys / synchronous=NORMAL
 * - 按版本号顺序跑 migrations
 * - app.on('will-quit') 时 close
 *
 * 任何 prepare / exec 失败必须抛错，不静默吞错。
 */

import { app } from 'electron'
import Database from 'better-sqlite3'
import { registerSqlFunctions } from './registerFunctions'
import { join } from 'node:path'
import { copyFileSync, existsSync, statSync, readdirSync, unlinkSync } from 'node:fs'
import { migrations, type Migration } from './migrations'

const DB_FILE = 'leaf.db'
const BACKUP_THRESHOLD_BYTES = 50 * 1024 * 1024 // 50 MB
const BACKUP_KEEP = 3

/** D-013：激活库 db 路径覆盖（启动早期 setDatabasePath，重启切库） */
let dbPathOverride: string | null = null
export function setDatabasePath(p: string): void {
  dbPathOverride = p
}

class LeafDatabase {
  private db: Database.Database | null = null
  private dbPath: string | null = null

  /** 拿到 raw Database handle（仅供 service 层使用，不外泄到 IPC） */
  get handle(): Database.Database {
    this.ensureOpen()
    return this.db as Database.Database
  }

  /** 主动打开数据库（幂等）；通常用于 app.whenReady() 之后的预热 */
  open(): void {
    this.ensureOpen()
  }

  /** 仅在已打开时返回，否则 null（用于 service 容错） */
  get maybeHandle(): Database.Database | null {
    return this.db
  }

  /** 解析 leaf.db 绝对路径 */
  resolvePath(): string {
    // D-013 多资源库：启动早期由 libraryRegistry 设定激活库的 db 路径
    if (dbPathOverride) return dbPathOverride
    return join(app.getPath('userData'), DB_FILE)
  }

  private ensureOpen(): void {
    if (this.db) return
    if (!app.isReady()) {
      throw new Error('[database] called before app.isReady(); defer until whenReady')
    }

    const dbPath = this.resolvePath()
    this.dbPath = dbPath

    this.maybeBackup(dbPath)

    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.pragma('synchronous = NORMAL')
    db.pragma('temp_store = MEMORY')
    // better-sqlite3 默认 5000ms，显式声明防止上游默认变更
    db.pragma('busy_timeout = 5000')
    // 自定义 SQL 函数（color_close 等）必须在任何下推查询之前注册
    registerSqlFunctions(db)

    // 先迁移成功再缓存 handle：迁移失败时绝不能让后续 ensureOpen()
    // 拿到缺列 schema 的连接「带病运行」（表现为各处 no such column 随机报错）
    try {
      this.runMigrations(db)
    } catch (e) {
      try {
        db.close()
      } catch {
        // ignore
      }
      throw e
    }
    this.db = db
  }

  private maybeBackup(dbPath: string): void {
    try {
      if (!existsSync(dbPath)) return
      const size = statSync(dbPath).size
      if (size < BACKUP_THRESHOLD_BYTES) return

      const dir = join(app.getPath('userData'))
      const ts = Date.now()
      const bak = join(dir, `${DB_FILE}.bak.${ts}`)
      copyFileSync(dbPath, bak)
      // 主文件之外还有 -wal 未 checkpoint 的最近提交；一并拷贝才能完整恢复
      const wal = `${dbPath}-wal`
      if (existsSync(wal)) copyFileSync(wal, `${bak}-wal`)
      this.pruneOldBackups(dir)
    } catch (e) {
      // 备份失败不应阻塞启动；交给 LogService 上层记录
      console.warn('[database] backup skipped:', (e as Error).message)
    }
  }

  private pruneOldBackups(dir: string): void {
    try {
      const baks = readdirSync(dir)
        .filter((f) => f.startsWith(`${DB_FILE}.bak.`))
        .sort()
        .reverse()
      const stale = baks.slice(BACKUP_KEEP)
      for (const f of stale) {
        try {
          unlinkSync(join(dir, f))
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }

  private runMigrations(db: Database.Database): void {
    // meta 表用于跟踪 migration 版本
    db.exec(`CREATE TABLE IF NOT EXISTS meta (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )`)

    const row = db.prepare('SELECT MAX(version) AS v FROM meta').get() as { v: number | null }
    let current = row.v ?? 0

    for (const m of migrations) {
      if (m.version <= current) continue
      const tx = db.transaction(() => {
        m.up(db)
        db.prepare('INSERT INTO meta (version, applied_at) VALUES (?, ?)').run(
          m.version,
          Date.now()
        )
      })
      tx()
      current = m.version
    }
  }

  close(): void {
    if (this.db) {
      // SQLite 官方建议：连接关闭前跑一次 optimize，把本次会话的查询模式
      // 沉淀为统计信息（等价 ANALYZE 的增量版），长期让查询计划更优
      try {
        this.db.pragma('optimize')
      } catch {
        // ignore
      }
      try {
        this.db.close()
      } catch (e) {
        console.warn('[database] close failed:', (e as Error).message)
      }
      this.db = null
    }
  }

  /** 调试/测试用：拿到当前已应用版本 */
  currentVersion(): number {
    this.ensureOpen()
    const row = this.db.prepare('SELECT MAX(version) AS v FROM meta').get() as { v: number | null }
    return row.v ?? 0
  }

  /** 调试/测试用：db 文件绝对路径 */
  path(): string {
    if (!this.dbPath) this.dbPath = this.resolvePath()
    return this.dbPath
  }
}

export const database = new LeafDatabase()

/**
 * 主进程入口安装函数。
 * 必须在 app.whenReady() 之后调用一次。
 */
export function installDatabase(): void {
  database.open()
}

/**
 * 主进程退出前清理。
 */
export function uninstallDatabase(): void {
  database.close()
}

export type { Migration }
