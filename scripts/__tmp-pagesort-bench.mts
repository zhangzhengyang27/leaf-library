/**
 * 临时测量（跑完即删）：置顶分组表达式对 keyset 分页的代价。
 * 用真实迁移 schema 造 5 万行，EXPLAIN + 分页计时。
 */
import Database from 'better-sqlite3'
import { migrations } from '../../src/main/db/migrations'

const db = new Database(':memory:')
db.pragma('journal_mode = MEMORY')
db.exec(`CREATE TABLE IF NOT EXISTS meta (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`)
for (const m of migrations) {
  db.transaction(() => {
    m.up(db)
    db.prepare('INSERT INTO meta (version, applied_at) VALUES (?, ?)').run(m.version, Date.now())
  })()
}
const N = 50000
const ins = db.prepare(
  `INSERT INTO photo_photos (id, file_path, file_name, file_size, imported_at, updated_at, kind)
   VALUES (?, ?, ?, ?, ?, ?, 'image')`
)
db.transaction(() => {
  for (let i = 0; i < N; i++) {
    ins.run(`id-${i}`, `/lib/${i}.png`, `photo-${i}.png`, 1000 + i, 1_700_000_000_000 + i, Date.now())
  }
})()
// 1% 置顶
db.prepare(`UPDATE photo_photos SET pinned_at = ? WHERE rowid % 100 = 0`).run(Date.now())
console.log('rows:', (db.prepare('SELECT COUNT(*) n FROM photo_photos').get() as { n: number }).n)
console.log(
  'indexes:',
  (db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='photo_photos'`).all() as Array<{name:string}>).map(r=>r.name).join(', ')
)

const PIN = '(pinned_at IS NOT NULL)'
const WHERE = 'deleted_at IS NULL'

function bench(label: string, orderBy: string, pages = 12) {
  let cursorImported = null
  let cursorPin = null
  const t0 = Date.now()
  let seen = 0
  for (let p = 0; p < pages; p++) {
    const sql = cursorImported === null
      ? `SELECT id, imported_at, ${PIN} AS __pin FROM photo_photos WHERE ${WHERE}
          ORDER BY ${orderBy} LIMIT 500`
      : `SELECT id, imported_at, ${PIN} AS __pin FROM photo_photos WHERE ${WHERE}
          AND (${PIN} < ? OR (${PIN} = ? AND (imported_at < ? OR (imported_at = ? AND rowid < ?))))
          ORDER BY ${orderBy} LIMIT 500`
    const params = cursorImported === null ? [] : [cursorPin, cursorPin, cursorImported, cursorImported, cursorImported]
    const rows = db.prepare(sql).all(...params) as Array<{ imported_at: number; __pin: number }>
    seen += rows.length
    const last = rows[rows.length - 1]
    if (!last) break
    cursorImported = last.imported_at
    cursorPin = last.__pin
  }
  console.log(`${label}: ${Date.now() - t0}ms / ${pages} 页 / ${seen} 行`)
}

const plan = (orderBy: string) =>
  (db.prepare(`EXPLAIN QUERY PLAN SELECT id FROM photo_photos WHERE ${WHERE} ORDER BY ${orderBy} LIMIT 500`).all() as Array<{detail:string}>).map(r=>r.detail).join(' | ')

console.log('\n— 计划：带置顶 —\n', plan(`${PIN} DESC, imported_at DESC, rowid DESC`))
console.log('— 计划：无置顶 —\n', plan(`imported_at DESC, rowid DESC`))
console.log('')
bench('带置顶表达式（现状）', `${PIN} DESC, imported_at DESC, rowid DESC`)
bench('去掉置顶（对照）', `imported_at DESC, rowid DESC`)

// 候选索引：把置顶位下沉到索引里
db.exec(`CREATE INDEX IF NOT EXISTS idx_pin_imported ON photo_photos (${PIN} DESC, imported_at DESC, rowid) WHERE deleted_at IS NULL`)
console.log('\n— 加表达式偏索引后的计划 —\n', plan(`${PIN} DESC, imported_at DESC, rowid DESC`))
bench('带置顶 + 新索引', `${PIN} DESC, imported_at DESC, rowid DESC`)
const ti0 = Date.now()
db.transaction(() => {
  for (let i = 0; i < 2000; i++)
    db.prepare(`INSERT INTO photo_photos (id, file_path, file_name, file_size, imported_at, updated_at, kind) VALUES (?,?,?,?,?,'image')`).run(`x-${i}`, `/x/${i}.png`, `x${i}.png`, i, Date.now(), Date.now())
})()
console.log('2000 次插入（含新索引维护）:', Date.now() - ti0, 'ms')
db.close()
