/**
 * 临时测量（跑完即删）：置顶分组表达式对 keyset 分页的代价。
 * 真实迁移 schema + 5 万行，EXPLAIN QUERY PLAN 与翻页计时对照。
 */
import { it } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../migrations'

it('__tmp 分页排序代价测量', () => {
  const db = new Database(':memory:')
  db.pragma('journal_mode = MEMORY')
  db.exec(`CREATE TABLE IF NOT EXISTS meta (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`)
  for (const m of migrations) {
    db.transaction(() => {
      m.up(db)
      db.prepare('INSERT INTO meta (version, applied_at) VALUES (?, ?)').run(m.version, Date.now())
    })()
  }
  const N = 50_000
  const ins = db.prepare(
    `INSERT INTO photo_photos (id, file_path, file_name, file_size, imported_at, updated_at, kind)
     VALUES (?, ?, ?, ?, ?, ?, 'image')`
  )
  db.transaction(() => {
    for (let i = 0; i < N; i++)
      ins.run(`id-${i}`, `/lib/${i}.png`, `photo-${i}.png`, 1000 + i, 1_700_000_000_000 + i, Date.now())
  })()
  db.prepare(`UPDATE photo_photos SET pinned_at = ? WHERE rowid % 100 = 0`).run(Date.now())
  console.log('[bench] rows =', (db.prepare('SELECT COUNT(*) n FROM photo_photos').get() as { n: number }).n)
  console.log(
    '[bench] indexes =',
    (
      db
        .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='photo_photos'`)
        .all() as Array<{ name: string }>
    )
      .map((r) => r.name)
      .join(', ')
  )

  const PIN = '(pinned_at IS NOT NULL)'
  const WHERE = 'deleted_at IS NULL'
  const plan = (orderBy: string) =>
    (
      db
        .prepare(`EXPLAIN QUERY PLAN SELECT id FROM photo_photos WHERE ${WHERE} ORDER BY ${orderBy} LIMIT 500`)
        .all() as Array<{ detail: string }>
    )
      .map((r) => r.detail)
      .join(' | ')

  function bench(label: string, orderBy: string, pages = 20) {
    let cImported: number | null = null
    let cPin: number | null = null
    const t0 = Date.now()
    let seen = 0
    for (let p = 0; p < pages; p++) {
      const first = cImported === null
      const sql = first
        ? `SELECT id, imported_at, ${PIN} AS __pin FROM photo_photos WHERE ${WHERE} ORDER BY ${orderBy} LIMIT 500`
        : `SELECT id, imported_at, ${PIN} AS __pin FROM photo_photos WHERE ${WHERE}
             AND (${PIN} < ? OR (${PIN} = ? AND (imported_at < ? OR (imported_at = ? AND rowid < ?))))
           ORDER BY ${orderBy} LIMIT 500`
      const params = first ? [] : [cPin, cPin, cImported, cImported, cImported]
      const rows = db.prepare(sql).all(...(params as never[])) as Array<{
        imported_at: number
        __pin: number
      }>
      seen += rows.length
      const last = rows[rows.length - 1]
      if (!last) break
      cImported = last.imported_at
      cPin = last.__pin
    }
    console.log(`[bench] ${label}: ${Date.now() - t0}ms / ${pages} 页 / ${seen} 行`)
  }

  const withPin = `${PIN} DESC, imported_at DESC, rowid DESC`
  const noPin = `imported_at DESC, rowid DESC`
  console.log('[bench] plan 带置顶(现状) =', plan(withPin))
  console.log('[bench] plan 无置顶(对照) =', plan(noPin))
  bench('带置顶 现状', withPin)
  bench('无置顶 对照', noPin)

  const idx0 = Date.now()
  // 表达式索引里不能直接写 rowid（且索引本身隐含 rowid 结尾）
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_pin_imported ON photo_photos ((pinned_at IS NOT NULL) DESC, imported_at DESC) WHERE deleted_at IS NULL`
  )
  console.log('[bench] 建候选索引耗时 =', Date.now() - idx0, 'ms')
  console.log('[bench] plan 带置顶+索引 =', plan(withPin))
  bench('带置顶 + 索引', withPin)

  const ti0 = Date.now()
  db.transaction(() => {
    for (let i = 0; i < 3000; i++)
      db
        .prepare(
          `INSERT INTO photo_photos (id, file_path, file_name, file_size, imported_at, updated_at, kind) VALUES (?,?,?,?,?,?, 'image')`
        )
        .run(`x-${i}`, `/x/${i}.png`, `x${i}.png`, i, Date.now(), Date.now())
  })()
  console.log('[bench] 索引就位后 3000 次插入 =', Date.now() - ti0, 'ms')

  const ti1 = Date.now()
  db.exec(`DROP INDEX idx_pin_imported`)
  db.transaction(() => {
    for (let i = 0; i < 3000; i++)
      db
        .prepare(
          `INSERT INTO photo_photos (id, file_path, file_name, file_size, imported_at, updated_at, kind) VALUES (?,?,?,?,?,?, 'image')`
        )
        .run(`y-${i}`, `/y/${i}.png`, `y${i}.png`, i, Date.now(), Date.now())
  })()
  console.log('[bench] 无该索引 3000 次插入 =', Date.now() - ti1, 'ms')
  db.close()
})
