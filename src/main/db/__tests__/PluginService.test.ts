/**
 * PluginService（阶段 5.1）：manifest 解析 / 目录扫描去重 / readAsset 路径穿越防护。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { PrefRepository } from '../repos/PrefRepository'
import { PluginService } from '../../services/PluginService'

describe('PluginService', () => {
  let db: Database.Database
  let prefs: PrefRepository
  let root: string
  let service: PluginService

  beforeEach(() => {
    db = createTestDb()
    prefs = new PrefRepository(db)
    root = mkdtempSync(join(tmpdir(), 'leaf-plugin-test-'))
    service = new PluginService(root, prefs)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    closeTestDb(db)
  })

  function writePlugin(id: string, manifest: Record<string, unknown>): void {
    const dir = join(root, id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest))
  }

  it('扫描并解析合法插件', () => {
    writePlugin('a', {
      id: 'a',
      name: '插件A',
      version: '1.0.0',
      category: 'inspector',
      entry: 'index.html',
      formats: ['txt', 'md']
    })
    writePlugin('bad', { id: 'bad' }) // 缺字段 → 跳过
    const list = service.list()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: 'a', name: '插件A', category: 'inspector' })
    expect(list[0].formats).toEqual(['txt', 'md'])
  })

  it('readAsset 读取插件内文件；路径穿越被拒绝', () => {
    writePlugin('a', {
      id: 'a',
      name: 'A',
      version: '1',
      category: 'development',
      entry: 'index.html'
    })
    writeFileSync(join(root, 'a', 'index.html'), '<html>hi</html>')
    writeFileSync(join(root, 'secret.txt'), 'top secret')

    const ok = service.readAsset('a', 'index.html')
    expect(ok).toMatchObject({ ok: true, content: '<html>hi</html>' })

    const escape = service.readAsset('a', '../secret.txt')
    expect(escape.ok).toBe(false)
  })

  it('未知插件 readAsset 返回 not found', () => {
    const res = service.readAsset('nope', 'index.html')
    expect(res).toEqual({ ok: false, error: 'plugin not found: nope' })
  })

  it('readAsset 拒绝目录内符号链接（防逃逸到插件目录外）', () => {
    writePlugin('a', {
      id: 'a',
      name: 'A',
      version: '1',
      category: 'development',
      entry: 'index.html'
    })
    writeFileSync(join(root, 'outside.txt'), 'top secret')
    symlinkSync(join(root, 'outside.txt'), join(root, 'a', 'link.txt'))
    const res = service.readAsset('a', 'link.txt')
    expect(res.ok).toBe(false)
    expect((res as { error: string }).error).toBe('symlink denied')
  })

  it('readAsset 拒绝大文件（>512KB）', () => {
    writePlugin('a', {
      id: 'a',
      name: 'A',
      version: '1',
      category: 'development',
      entry: 'index.html'
    })
    writeFileSync(join(root, 'a', 'big.txt'), 'x'.repeat(600 * 1024))
    const res = service.readAsset('a', 'big.txt')
    expect(res).toEqual({ ok: false, error: 'file too large' })
  })
})
