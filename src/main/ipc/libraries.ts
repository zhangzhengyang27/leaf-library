/**
 * Leaf · 多资源库 IPC（D-013）
 *
 * - list/create/rename/unregister：注册表读写
 * - switch：写激活库后 relaunch（重启切库，D-013 记录的稳健语义）
 * - mergeFrom：把另一库的素材并入当前库（文件为绝对路径引用，无文件搬运；
 *   按 file_path 去重；标签按名称映射进 tag_tags；soft-deleted 行不迁移）
 */
import { app, ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { installAppMenu } from '../modules/appMenu'
import {
  createLibrary,
  dbPathOf,
  getActiveLibrary,
  listLibraries,
  renameLibrary,
  setActiveLibrary,
  unregisterLibrary
} from '../modules/libraryRegistry'
import { database } from '../db/database'
import { log } from '../services/LogService'

export interface LibraryView {
  id: string
  name: string
  path: string
  legacy: boolean
  active: boolean
  createdAt: number
  lastOpenedAt: number
}

export interface MergeResult {
  photosAdded: number
  photosSkipped: number
  tagsAdded: number
}

export function registerLibrariesIpcHandlers(): void {
  ipcMain.removeHandler('libraries:list')
  ipcMain.handle('libraries:list', (): { activeId: string; libraries: LibraryView[] } => {
    const active = getActiveLibrary()
    return {
      activeId: active.id,
      libraries: listLibraries().map((l) => ({
        id: l.id,
        name: l.name,
        path: l.path,
        legacy: l.legacy,
        active: l.id === active.id,
        createdAt: l.createdAt,
        lastOpenedAt: l.lastOpenedAt
      }))
    }
  })

  ipcMain.removeHandler('libraries:create')
  ipcMain.handle(
    'libraries:create',
    (_e, name: string): { id: string; name: string; path: string } => {
      const { entry } = createLibrary(name)
      installAppMenu() // 库清单变化后重建原生菜单（审查 P3-24：旧实现启动时固化）
      return { id: entry.id, name: entry.name, path: entry.path }
    }
  )

  ipcMain.removeHandler('libraries:rename')
  ipcMain.handle('libraries:rename', (_e, id: string, name: string): boolean => {
    const ok = !!renameLibrary(id, name)
    if (ok) installAppMenu()
    return ok
  })

  ipcMain.removeHandler('libraries:unregister')
  ipcMain.handle('libraries:unregister', (_e, id: string): boolean => {
    const ok = unregisterLibrary(id)
    if (ok) installAppMenu()
    return ok
  })

  ipcMain.removeHandler('libraries:switch')
  ipcMain.handle('libraries:switch', (_e, id: string): void => {
    setActiveLibrary(id)
    log.info('libraries', `switching to ${id}, relaunching`)
    app.relaunch()
    app.quit()
  })

  ipcMain.removeHandler('libraries:mergeFrom')
  ipcMain.handle('libraries:mergeFrom', (_e, sourceId: string): MergeResult => {
    const reg = listLibraries().find((l) => l.id === sourceId)
    if (!reg) throw new Error('源资源库不存在')
    if (reg.id === getActiveLibrary().id) throw new Error('不能合并当前资源库')
    const sourcePath = dbPathOf(reg)
    if (!existsSync(sourcePath)) throw new Error('源资源库文件不存在')

    const source = new Database(sourcePath, { readonly: true })
    try {
      const target = database.handle
      const result: MergeResult = { photosAdded: 0, photosSkipped: 0, tagsAdded: 0 }

      // 标签字典按名称映射：source tag_tags.name → target tag_tags.id
      const targetTagByName = new Map<string, string>()
      const tagRows = target.prepare(`SELECT id, name FROM tag_tags`).all() as Array<{
        id: string
        name: string
      }>
      for (const t of tagRows) targetTagByName.set(t.name.toLowerCase(), t.id)
      const insertTag = target.prepare(
        `INSERT INTO tag_tags (id, name, color, parent_id, created_at, updated_at)
         VALUES (?, ?, NULL, NULL, ?, ?)`
      )
      const sourceTags = source
        .prepare(`SELECT id, name, created_at, updated_at FROM tag_tags`)
        .all() as Array<{ id: string; name: string; created_at: number; updated_at: number }>
      const tagIdMap = new Map<string, string>()
      for (const st of sourceTags) {
        const key = st.name.toLowerCase()
        const existing = targetTagByName.get(key)
        if (existing) {
          tagIdMap.set(st.id, existing)
        } else {
          const newId = cryptoRandomId()
          insertTag.run(newId, st.name, st.created_at, st.updated_at)
          targetTagByName.set(key, newId)
          tagIdMap.set(st.id, newId)
          result.tagsAdded += 1
        }
      }

      // 素材：按 file_path 去重
      const existsByPath = target.prepare(`SELECT 1 FROM photo_photos WHERE file_path = ? LIMIT 1`)
      const insertPhoto = target.prepare(
        `INSERT INTO photo_photos (id, file_path, file_name, file_size, width, height, mime_type,
                                   taken_at, imported_at, updated_at, hash, is_favorite, deleted_at,
                                   thumb_status, source, kind, source_url, description, rating,
                                   fs_created_at, fs_modified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?, ?, ?, ?)`
      )
      const insertPhotoTag = target.prepare(
        `INSERT OR IGNORE INTO photo_tags (photo_id, tag_id, created_at) VALUES (?, ?, ?)`
      )
      const photos = source.prepare(buildSourcePhotoSelect(source, 'deleted_at IS NULL')).all() as
        Array<Record<string, unknown>>
      const tagLinks = source.prepare(`SELECT tag_id FROM photo_tags WHERE photo_id = ?`)

      const tx = target.transaction((): void => {
        for (const row of photos) {
          const filePath = String(row.file_path)
          if (existsByPath.get(filePath)) {
            result.photosSkipped += 1
            continue
          }
          const newPhotoId = cryptoRandomId()
          insertPhoto.run(
            newPhotoId,
            filePath,
            row.file_name,
            row.file_size,
            row.width,
            row.height,
            row.mime_type,
            row.taken_at,
            row.imported_at,
            row.updated_at,
            row.hash,
            row.is_favorite,
            row.source ?? 'merged',
            row.kind ?? 'image',
            row.source_url,
            row.description,
            row.rating ?? 0,
            row.fs_created_at,
            row.fs_modified_at
          )
          result.photosAdded += 1
          const links = tagLinks.all(String(row.id)) as Array<{ tag_id: string }>
          for (const link of links) {
            const targetTagId = tagIdMap.get(link.tag_id)
            if (targetTagId) insertPhotoTag.run(newPhotoId, targetTagId, Date.now())
          }
        }
      })
      tx()
      log.info(
        'libraries',
        `merged from ${sourceId}: +${result.photosAdded} photos, ${result.photosSkipped} skipped, +${result.tagsAdded} tags`
      )
      return result
    } finally {
      source.close()
    }
  })
}

function cryptoRandomId(): string {
  return globalThis.crypto.randomUUID()
}

/** 跨库搬运关注的 photo_photos 列（与下方两处 INSERT 列清单一致） */
const MERGE_PHOTO_COLS = [
  'id',
  'file_path',
  'file_name',
  'file_size',
  'width',
  'height',
  'mime_type',
  'taken_at',
  'imported_at',
  'updated_at',
  'hash',
  'is_favorite',
  'thumb_status',
  'source',
  'kind',
  'source_url',
  'description',
  'rating',
  'fs_created_at',
  'fs_modified_at'
] as const

/**
 * 构建源库 SELECT：显式列名 + 缺列补 NULL。
 * 旧版源库不跑迁移即被只读打开，`SELECT *` 的行缺新列 → 绑定 undefined
 * 直接抛错、整个事务回滚；按 PRAGMA table_info 判定已有列，缺的补 NULL。
 */
function buildSourcePhotoSelect(db: Database.Database, where: string): string {
  const info = db.prepare(`PRAGMA table_info(photo_photos)`).all() as Array<{ name: string }>
  const have = new Set(info.map((c) => c.name))
  const list = MERGE_PHOTO_COLS.map((c) => (have.has(c) ? c : `NULL AS ${c}`))
  return `SELECT ${list.join(', ')} FROM photo_photos WHERE ${where}`
}

/** D-013 后续：库间移动选中素材（插目标库 + 源库软删；文件为绝对路径引用，不搬运） */
export interface MoveResult {
  moved: number
  skipped: number
}

ipcMain.removeHandler('libraries:moveTo')
ipcMain.handle(
  'libraries:moveTo',
  (_e, targetLibraryId: string, photoIds: string[]): MoveResult => {
    const target = listLibraries().find((l) => l.id === targetLibraryId)
    if (!target) throw new Error('目标资源库不存在')
    if (target.id === getActiveLibrary().id) throw new Error('目标库即当前库')
    const targetPath = dbPathOf(target)
    if (!existsSync(targetPath)) throw new Error('目标资源库文件不存在')
    if (!Array.isArray(photoIds) || photoIds.length === 0) return { moved: 0, skipped: 0 }

    const result: MoveResult = { moved: 0, skipped: 0 }
    const tdb = new Database(targetPath)
    try {
      const adb = database.handle
      // 目标库从未被打开过（新建后未切换）时没有表结构：明确报错而非崩溃
      const hasSchema = tdb
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='photo_photos'`)
        .get()
      if (!hasSchema) throw new Error('目标资源库尚未初始化：请先切换到该库一次后再移动')
      // 注意：buildSourcePhotoSelect 只防御了「源侧」旧 schema；目标库若存在
      // 但从未被应用打开过（缺新列的旧版本库），下方 INSERT 的 prepare 仍会报
      // no such column——属既有限制，等出现真实场景再对目标侧做列探测。

      // 标签按名称映射进目标库
      const targetTagByName = new Map<string, string>()
      for (const t of adb.prepare(`SELECT id, name FROM tag_tags`).all() as Array<{
        id: string
        name: string
      }>) {
        targetTagByName.set(t.name.toLowerCase(), t.id)
      }
      const insertTag = tdb.prepare(
        `INSERT INTO tag_tags (id, name, color, parent_id, created_at, updated_at)
         VALUES (?, ?, NULL, NULL, ?, ?)`
      )
      const insertPhoto = tdb.prepare(
        `INSERT INTO photo_photos (id, file_path, file_name, file_size, width, height, mime_type,
                                   taken_at, imported_at, updated_at, hash, is_favorite, deleted_at,
                                   thumb_status, source, kind, source_url, description, rating,
                                   fs_created_at, fs_modified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?, ?, ?, ?)`
      )
      const insertPhotoTag = tdb.prepare(
        `INSERT OR IGNORE INTO photo_tags (photo_id, tag_id, created_at) VALUES (?, ?, ?)`
      )
      const getPhoto = adb.prepare(buildSourcePhotoSelect(adb, 'id = ? AND deleted_at IS NULL'))
      const softDelete = adb.prepare(
        `UPDATE photo_photos SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`
      )
      const targetExistsByPath = tdb.prepare(
        `SELECT 1 FROM photo_photos WHERE file_path = ? LIMIT 1`
      )
      const sourceTagLinks = adb.prepare(`SELECT tag_id FROM photo_tags WHERE photo_id = ?`)
      const tagNameById = adb.prepare(`SELECT name FROM tag_tags WHERE id = ?`)

      const txTarget = tdb.transaction((rows: Array<Record<string, unknown>>): void => {
        for (const row of rows) {
          const filePath = String(row.file_path)
          if (targetExistsByPath.get(filePath)) {
            result.skipped += 1
            continue
          }
          const newPhotoId = cryptoRandomId()
          insertPhoto.run(
            newPhotoId,
            filePath,
            row.file_name,
            row.file_size,
            row.width,
            row.height,
            row.mime_type,
            row.taken_at,
            row.imported_at,
            row.updated_at,
            row.hash,
            row.is_favorite,
            row.source ?? 'moved',
            row.kind ?? 'image',
            row.source_url,
            row.description,
            row.rating ?? 0,
            row.fs_created_at,
            row.fs_modified_at
          )
          const links = sourceTagLinks.all(String(row.id)) as Array<{ tag_id: string }>
          for (const link of links) {
            const tagRow = tagNameById.get(link.tag_id) as { name: string } | undefined
            if (!tagRow) continue
            let targetTagId = targetTagByName.get(tagRow.name.toLowerCase())
            if (!targetTagId) {
              targetTagId = cryptoRandomId()
              const now = Date.now()
              insertTag.run(targetTagId, tagRow.name, now, now)
              targetTagByName.set(tagRow.name.toLowerCase(), targetTagId)
            }
            insertPhotoTag.run(newPhotoId, targetTagId, Date.now())
          }
          // 记录映射供补偿：源库软删失败时回删目标库已插入行（审查 P2-29）
          insertedPairs.push({ sourceId: String(row.id), newPhotoId })
          result.moved += 1
        }
      })

      const txSource = adb.transaction((ids: string[]): void => {
        const ts = Date.now()
        for (const id of ids) softDelete.run(ts, id)
      })

      const rows: Array<Record<string, unknown>> = []
      const movedSourceIds: string[] = []
      const insertedPairs: Array<{ sourceId: string; newPhotoId: string }> = []
      for (const id of photoIds) {
        const row = getPhoto.get(id) as Record<string, unknown> | undefined
        if (row) {
          rows.push(row)
          movedSourceIds.push(String(row.id))
        }
      }
      txTarget(rows)
      // 只软删实际移入目标库的素材；目标库已存在而跳过的保持原状。
      // 源库软删失败时补偿回删目标库已插入行（审查 P2-29）：
      // 否则两库同时可见同一素材，且重试会因 file_path 判重全部 skipped 而无法自愈
      try {
        txSource(movedSourceIds)
      } catch (err) {
        const compensate = tdb.transaction((pairs: Array<{ newPhotoId: string }>): void => {
          for (const { newPhotoId } of pairs) {
            tdb.prepare(`DELETE FROM photo_tags WHERE photo_id = ?`).run(newPhotoId)
            tdb.prepare(`DELETE FROM photo_photos WHERE id = ?`).run(newPhotoId)
          }
        })
        compensate(insertedPairs)
        result.moved = 0
        log.warn(
          'libraries',
          `moveTo source soft-delete failed, compensated ${insertedPairs.length} target rows: ${(err as Error).message}`
        )
        throw new Error(`移动失败且已回滚目标库写入：${(err as Error).message}`)
      }
      log.info(
        'libraries',
        `moved ${result.moved} photos (skipped ${result.skipped}) to ${targetLibraryId}`
      )
      return result
    } finally {
      tdb.close()
    }
  }
)
