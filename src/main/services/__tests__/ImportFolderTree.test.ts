/**
 * 目录镜像导入（Eagle walkTreeSync/createFolderStruture 口径）：
 * - buildDirectoryTree 的层级、junk/软链/应用包、空目录、上限规则
 * - importDirectoryTree 的建夹形状、挂载点、同名复用、每级文件归本级夹
 * - PhotoFolderRepository.findByName 的同级判定
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from '../../db/__tests__/testDb'
import { PhotoFolderRepository } from '../../db/repos/PhotoFolderRepository'
import { buildDirectoryTree, importDirectoryTree, type ImportDeps } from '../ImportFolderTree'

let root = ''

/** 造一棵有代表性的目录树：嵌套、空目录、junk、应用包 */
function makeFixture(): string {
  root = mkdtempSync(join(tmpdir(), 'leaf-import-'))
  const touch = (p: string): void => {
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, 'x')
  }
  touch(join(root, 'a.png'))
  touch(join(root, 'b.txt'))
  touch(join(root, 'sub1/c.png'))
  touch(join(root, 'sub1/deep/d.jpg'))
  touch(join(root, '.DS_Store'))
  touch(join(root, '__MACOSX/resource.png'))
  touch(join(root, '.hidden/e.png'))
  // 应用包：目录形态但按单个素材收
  mkdirSync(join(root, 'Icon.app'), { recursive: true })
  touch(join(root, 'Icon.app/Contents.png'))
  // 空子目录（Eagle 也建）
  mkdirSync(join(root, 'sub2/inner'), { recursive: true })
  return root
}

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
  root = ''
})

/** 假写库侧：记录文件夹形状与每次归组，便于断言 */
function fakeDeps(
  existing: Array<{ id: string; name: string; parentId: string | null }> = [],
  opts: { everyFileAlreadyInLibrary?: boolean } = {}
) {
  const folders: Array<{ id: string; name: string; parentId: string | null }> = [...existing]
  const assignments: Array<{ folderId: string; ids: string[] }> = []
  let seq = 0
  const deps: ImportDeps<{ id: string }> = {
    findByName: (parentId, name) =>
      folders.find((f) => f.name === name && f.parentId === parentId)?.id ?? null,
    create: (parentId, name) => {
      const id = `folder-${++seq}`
      folders.push({ id, name, parentId })
      return id
    },
    addFiles: (paths) =>
      opts.everyFileAlreadyInLibrary ? [] : paths.map((p) => ({ id: `photo:${p}` })),
    assign: (folderId, ids) => assignments.push({ folderId, ids }),
    remove: (id) => {
      const gone = new Set([id])
      let grew = true
      while (grew) {
        grew = false
        for (const f of folders) {
          if (f.parentId && gone.has(f.parentId) && !gone.has(f.id)) {
            gone.add(f.id)
            grew = true
          }
        }
      }
      for (let i = folders.length - 1; i >= 0; i--)
        if (gone.has(folders[i].id)) folders.splice(i, 1)
    }
  }
  return { deps, folders, assignments }
}

/** 断言用短路径：fakeDeps 的素材 id 是 `photo:<绝对路径>` 形态 */
const rel = (id: string): string => {
  const abs = id.startsWith('photo:') ? id.slice('photo:'.length) : id
  return abs
    .slice(root.length + 1)
    .split(/[\\/]/)
    .join('/')
}

describe('buildDirectoryTree', () => {
  it('镜像层级；junk 与隐藏目录被跳过；空目录保留；应用包按单文件收', async () => {
    makeFixture()
    const { tree, fileCount, truncated } = await buildDirectoryTree(root)
    expect(truncated).toBe(false)
    expect(tree.name).toBe(root.split('/').pop())
    expect(tree.files.map(rel).sort()).toEqual(['Icon.app', 'a.png', 'b.txt'])
    expect(tree.folders.map((f) => f.name).sort()).toEqual(['sub1', 'sub2'])
    const sub1 = tree.folders.find((f) => f.name === 'sub1')!
    expect(sub1.files.map(rel)).toEqual(['sub1/c.png'])
    expect(sub1.folders.map((f) => f.name)).toEqual(['deep'])
    expect(sub1.folders[0].files.map(rel)).toEqual(['sub1/deep/d.jpg'])
    // 空目录（含只有空子目录的目录）仍然进树 —— 照 Eagle
    const sub2 = tree.folders.find((f) => f.name === 'sub2')!
    expect(sub2.files).toEqual([])
    expect(sub2.folders.map((f) => f.name)).toEqual(['inner'])
    expect(fileCount).toBe(5)
  })

  it('整目录没有可收文件时 fileCount 为 0', async () => {
    root = mkdtempSync(join(tmpdir(), 'leaf-import-'))
    mkdirSync(join(root, 'only-junk'), { recursive: true })
    writeFileSync(join(root, '.DS_Store'), 'x')
    const { fileCount } = await buildDirectoryTree(root)
    expect(fileCount).toBe(0)
  })
})

describe('importDirectoryTree', () => {
  it('根夹挂在 parentId 下，每级文件归本级夹，空目录也建', async () => {
    makeFixture()
    const { deps, folders, assignments } = fakeDeps()
    const r = await importDirectoryTree(root, 'parent-view', deps)

    const byId = new Map(folders.map((f) => [f.id, f]))
    const treeRoot = folders.find((f) => f.parentId === 'parent-view')!
    expect(treeRoot.name).toBe(root.split('/').pop())
    // 根级 3 个文件（含 Icon.app）归进根夹
    expect(
      assignments
        .find((a) => a.folderId === treeRoot.id)!
        .ids.map(rel)
        .sort()
    ).toEqual(['Icon.app', 'a.png', 'b.txt'])
    const sub1 = folders.find((f) => f.parentId === treeRoot.id && f.name === 'sub1')!
    expect(assignments.find((a) => a.folderId === sub1.id)!.ids.map(rel)).toEqual(['sub1/c.png'])
    const deep = folders.find((f) => f.parentId === sub1.id)!
    expect(deep.name).toBe('deep')
    expect(assignments.find((a) => a.folderId === deep.id)!.ids.map(rel)).toEqual([
      'sub1/deep/d.jpg'
    ])
    // sub2/inner 没有文件，但夹照样建出来，且没有归组动作
    const sub2 = folders.find((f) => f.parentId === treeRoot.id && f.name === 'sub2')!
    expect(byId.get(sub2.id)!.name).toBe('sub2')
    expect(folders.find((f) => f.parentId === sub2.id)?.name).toBe('inner')
    expect(assignments.some((a) => a.folderId === sub2.id)).toBe(false)
    // 根级 + sub1 + deep + sub2 + inner = 5
    expect(r.folders.length).toBe(5)
    expect(r.photos.length).toBe(5)
  })

  it('同名同级复用已有文件夹，不建第二棵树', async () => {
    makeFixture()
    const name = root.split('/').pop()!
    const { deps, folders } = fakeDeps([{ id: 'pre', name, parentId: null }])
    const r = await importDirectoryTree(root, null, deps)
    expect(folders.length).toBe(1 + 4) // 根级复用，只新增 sub1/deep/sub2/inner
    expect(r.folders).not.toContain('pre')
    expect(folders.find((f) => f.parentId === null)!.id).toBe('pre')
  })

  it('整目录都已在库中（零新增素材）→ 回滚掉空镜像树，不留一堆空壳', async () => {
    makeFixture()
    const { deps, folders } = fakeDeps([], { everyFileAlreadyInLibrary: true })
    const r = await importDirectoryTree(root, 'other-parent', deps)
    expect(r.photos).toEqual([])
    expect(r.folders).toEqual([])
    expect(folders).toEqual([])
  })

  it('整个目录一个文件都没有 → 不建任何夹、不入库', async () => {
    root = mkdtempSync(join(tmpdir(), 'leaf-import-'))
    mkdirSync(join(root, 'empty'), { recursive: true })
    const { deps, folders, assignments } = fakeDeps()
    const r = await importDirectoryTree(root, null, deps)
    expect(r.fileCount).toBe(0)
    expect(folders).toEqual([])
    expect(assignments).toEqual([])
  })
})

describe('PhotoFolderRepository.findByName', () => {
  let db: Database.Database
  let folders: PhotoFolderRepository
  afterEach(() => closeTestDb(db))

  it('同名不同级各归各的；根级查 parent_id IS NULL', () => {
    db = createTestDb()
    folders = new PhotoFolderRepository(db)
    const a = folders.create('素材')
    const b = folders.create('素材')
    const child = folders.create('素材', a.id)
    expect(folders.findByName('素材', null)).toBe(a.id)
    expect(folders.findByName('素材', a.id)).toBe(child.id)
    expect(folders.findByName('素材', b.id)).toBeNull()
    expect(folders.findByName('不存在', null)).toBeNull()
  })
})
