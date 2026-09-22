/**
 * WatchedFoldersService · 监控文件夹偏好持久化（阶段 4.4）
 *
 * 注入测试 db 的 PrefRepository，验证 add/remove/list 的目录列表与
 * pref_preferences 持久化语义（尾部斜杠规范化、去重、移除）。
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { PrefRepository } from '../repos/PrefRepository'
import { WatchedFoldersService } from '../../services/WatchedFoldersService'

describe('WatchedFoldersService · 目录列表管理', () => {
  let db: Database.Database
  let prefs: PrefRepository
  let service: WatchedFoldersService

  beforeEach(() => {
    db = createTestDb()
    prefs = new PrefRepository(db)
    // photos 注入空实现，避免真实入库
    service = new WatchedFoldersService(prefs, { addPhotos: () => [] })
    service.setEnabled(false) // 测试不启动真实 fs.watch
  })

  afterEach(() => {
    service.setEnabled(false)
    closeTestDb(db)
  })

  it('初始为空列表', () => {
    expect(service.list()).toEqual([])
  })

  it('add 追加并持久化（尾部斜杠规范化 + 去重）', () => {
    service.add('/a')
    service.add('/b')
    service.add('/a/') // 规范化后与 /a 相同 → 去重
    expect(service.list()).toEqual(['/a', '/b'])
    expect(prefs.get('watched:folders')).toBe('["/a","/b"]')
  })

  it('remove 移除并持久化', () => {
    service.add('/a')
    service.add('/b')
    service.remove('/a')
    expect(service.list()).toEqual(['/b'])
    expect(prefs.get('watched:folders')).toBe('["/b"]')
  })

  it('从持久化恢复列表（init 读取已有偏好）', () => {
    prefs.set('watched:folders', JSON.stringify(['/x', '/y']))
    const fresh = new WatchedFoldersService(prefs, { addPhotos: () => [] })
    fresh.setEnabled(false)
    expect(fresh.list()).toEqual(['/x', '/y'])
  })
})
