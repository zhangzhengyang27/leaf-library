/**
 * M4 嵌套智能夹（D-022 / 迁移 026）回归：
 *
 * - repo：parent_id 贯通 CRUD、listTree 按 parentId 组织（孤儿挂根、环脏数据兜底）、
 *   getAncestorChain 截断语义、环防护（父级=自己 / 自己的后代 / 不存在 / 已删）；
 * - 求值：子级命中 = 子级规则 AND 全部祖先规则（真内存库断言）。多层祖先、
 *   空规则父级（不约束）、祖先带 v2 嵌套组（match:any 组）、祖先带正则键、
 *   祖先语义空集 fail-closed（1=0 把子级拖空）。
 *
 * 求值组合路径与生产一致：SmartAlbumRepository.getAncestorChain →
 * buildSmartAlbumWhere 逐夹编译 → PhotoRepository.queryByRules(rules, ancestorWheres)
 * （PhotoDataStore.getSmartAlbumPhotos 只是把这三步串起来 + 语义解析）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { PhotoRepository } from '../repos/PhotoRepository'
import { SmartAlbumRepository } from '../repos/SmartAlbumRepository'
import { buildSmartAlbumWhere, type SmartAlbumRules } from '../smartAlbumRules'

describe('SmartAlbumRepository · M4 嵌套', () => {
  let db: Database.Database
  let repo: SmartAlbumRepository

  beforeEach(() => {
    db = createTestDb()
    repo = new SmartAlbumRepository(db)
  })
  afterEach(() => closeTestDb(db))

  it('create/update 带 parentId；getById/list 读回父级；moveTo 移回根级', () => {
    const root = repo.create('根', { favorite: true })
    const child = repo.create('子', { minRating: 3 }, root.id)
    expect(child.parentId).toBe(root.id)
    expect(root.parentId).toBeNull()
    expect(repo.getById(child.id)?.parentId).toBe(root.id)
    expect(repo.list().find((a) => a.id === child.id)?.parentId).toBe(root.id)

    // 挪到另一个父级再挪回根
    const other = repo.create('另一支', {})
    const moved = repo.moveTo(child.id, other.id)
    expect(moved?.parentId).toBe(other.id)
    expect(repo.moveTo(child.id, null)?.parentId).toBeNull()
    // 不传 parentId 的 update 不动父级（旧调用方语义不变）
    expect(repo.update(child.id, { name: '改名' })?.parentId).toBeNull()
    expect(repo.update(child.id, { name: '改名' })?.name).toBe('改名')
  })

  it('listTree 按 parentId 组织成树，同级按 sort_order/created_at 稳定排序', () => {
    const a = repo.create('A', {})
    const b = repo.create('B', {}, a.id)
    repo.create('B1', {}, b.id)
    repo.create('B2', {}, b.id)
    const tree = repo.listTree()
    expect(tree).toHaveLength(1)
    expect(tree[0].album.id).toBe(a.id)
    expect(tree[0].children).toHaveLength(1)
    expect(tree[0].children[0].album.id).toBe(b.id)
    expect(tree[0].children[0].children.map((n) => n.album.name)).toEqual(['B1', 'B2'])
  })

  it('listTree：父级被删后子级挂根（删除不级联、孤儿提升）；环脏数据只挂一次不丢行', () => {
    const parent = repo.create('父', {})
    repo.create('子', {}, parent.id)
    repo.remove(parent.id) // 软删父级
    let tree = repo.listTree()
    expect(tree.map((n) => n.album.name).sort()).toEqual(['子']) // 孤儿挂根，不丢行

    // 手改库造环：两条互指（正常写入路径被 assertValidParent 挡死，这里是脏数据兜底）
    const x = repo.create('X', {})
    const y = repo.create('Y', {})
    db.prepare(`UPDATE photo_smart_albums SET parent_id = ? WHERE id = ?`).run(y.id, x.id)
    db.prepare(`UPDATE photo_smart_albums SET parent_id = ? WHERE id = ?`).run(x.id, y.id)
    tree = repo.listTree()
    // 环链到不了的第一个节点（X）兜底挂根，Y 作为它的子节点被收编；
    // 外加前半段留下的孤儿「子」。每个节点恰好出现一次、不挂死
    const names = tree.map((n) => n.album.name).sort()
    expect(names).toEqual(['X', '子'])
    const xNode = tree.find((n) => n.album.id === x.id)
    expect(xNode?.children.map((c) => c.album.id)).toEqual([y.id])
    expect(
      tree.filter((n) => n.album.id === y.id || n.children.some((c) => c.album.id === y.id))
    ).toHaveLength(1) // Y 只挂一次
  })

  it('getAncestorChain：直接父级在前、根在后；链上祖先被删即整条截断（子链被扶正，与孤儿挂根同口径）', () => {
    const root = repo.create('根', {})
    const mid = repo.create('中', {}, root.id)
    const leaf = repo.create('叶', {}, mid.id)
    expect(repo.getAncestorChain(leaf.parentId).map((a) => a.id)).toEqual([mid.id, root.id])
    expect(repo.getAncestorChain(null)).toEqual([])

    // 中层被删：链在它那里整条截断（不是跳过死节点继续向上）——
    // 删除即把整棵子树重新扶正为根级，侧栏挂根与求值口径一致
    repo.remove(mid.id)
    expect(repo.getAncestorChain(leaf.parentId)).toEqual([])

    // excludeId：自引用脏数据下撞到正在编辑的夹即停
    expect(repo.getAncestorChain(mid.id, mid.id)).toEqual([])
  })

  it('环防护：父级=自己 / 自己的后代 / 不存在 / 已删除，均拒绝并给中文错误', () => {
    const a = repo.create('A', {})
    const b = repo.create('B', {}, a.id)
    const c = repo.create('C', {}, b.id)

    // 父级=自己
    expect(() => repo.update(a.id, { parentId: a.id })).toThrowError('不能把智能夹设为自己的父级')
    // 父级=自己的后代（a ← c 成环）
    expect(() => repo.update(a.id, { parentId: c.id })).toThrowError(/循环嵌套/)
    // create 时父级不存在 / 已删除
    expect(() => repo.create('孤', {}, 'no-such-id')).toThrowError(/不存在或已删除/)
    repo.remove(c.id)
    expect(() => repo.create('孤2', {}, c.id)).toThrowError(/不存在或已删除/)
    // moveTo 走同一口径；合法移动不受影响
    expect(() => repo.moveTo(b.id, c.id)).toThrowError(/不存在或已删除/)
    expect(repo.moveTo(b.id, null)?.parentId).toBeNull()
    // 根级永远合法；合法的新父级照常落库
    expect(repo.update(b.id, { parentId: null })?.parentId).toBeNull()
  })
})

describe('求值 · 子级 AND 全部祖先链（真内存库）', () => {
  let db: Database.Database
  let photos: PhotoRepository
  let repo: SmartAlbumRepository
  let ids: Record<string, string>

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
    repo = new SmartAlbumRepository(db)
    const add = (name: string, m?: Partial<Parameters<PhotoRepository['addPhoto']>[1]>): string => {
      const p = photos.addPhoto(`/${name}`, m)
      return p.id
    }
    ids = {
      // 四条样本覆盖真值表的四个象限：
      imgFav5: add('IMG_5star.png', { kind: 'image' }), // 名字√ 评分5 收藏√ → 全链通过
      imgLow: add('IMG_2star.png', { kind: 'image' }), // 名字√ 评分2 收藏× → 卡在祖先 A
      raw5: add('raw_5star.png', { kind: 'image' }), // 名字× 评分5 收藏√ → 卡在祖先 B（正则）
      vid5: add('IMG_clip.mp4', { kind: 'video' }) // 名字√ 评分5 收藏√ → 卡在子级自身规则（image）
    }
    photos.setRating(ids.imgFav5, 5)
    photos.toggleFavorite(ids.imgFav5)
    photos.setRating(ids.imgLow, 2)
    photos.setRating(ids.raw5, 5)
    photos.toggleFavorite(ids.raw5)
    photos.setRating(ids.vid5, 5)
    photos.toggleFavorite(ids.vid5)
  })
  afterEach(() => closeTestDb(db))

  /** 与 PhotoDataStore.getSmartAlbumPhotos 相同的组合路径 */
  const evalAlbum = (albumId: string): string[] => {
    const album = repo.getById(albumId)!
    const chain = repo.getAncestorChain(album.parentId, album.id)
    const ancestorWheres = chain.map((a) => buildSmartAlbumWhere(a.rules))
    return photos
      .queryByRules(album.rules, ancestorWheres)
      .map((p) => p.id)
      .sort()
  }
  const hitSet = (...keys: string[]): string[] => keys.map((k) => ids[k]).sort()

  it('多层祖先：叶 = 自身规则 AND 逐级祖先（空规则父级不约束、祖先带 v2 嵌套组与正则键）', () => {
    // 根 R：空规则 → 编译为 1=1，不约束
    const root = repo.create('根', {})
    // 中间 A：v2 嵌套组（match:any 组）→ (rating>=5 OR favorite)
    const mid = repo.create(
      '中',
      {
        match: 'all',
        groups: [{ match: 'any', not: false, rules: { minRating: 5, favorite: true } }]
      },
      root.id
    )
    // 中间 B：正则键（祖先维的 UDF 下推谓词）
    const leaf = repo.create('叶', { nameRegex: '^IMG_' }, mid.id)
    // 深层 C：自身规则 kinds=['image']
    const deep = repo.create('深', { kinds: ['image'] }, leaf.id)

    // 各层命中集（父级计数 = 自身规则 AND 自己的祖先链，不叠加子级——Eagle 口径）：
    expect(evalAlbum(root.id)).toEqual(hitSet('imgFav5', 'imgLow', 'raw5', 'vid5'))
    expect(evalAlbum(mid.id)).toEqual(hitSet('imgFav5', 'raw5', 'vid5')) // imgLow 卡 (rating>=5 OR favorite)
    expect(evalAlbum(leaf.id)).toEqual(hitSet('imgFav5', 'vid5')) // raw5 卡正则
    expect(evalAlbum(deep.id)).toEqual(hitSet('imgFav5')) // vid5 卡子级自身的 kinds

    // 无关子级不拖累父级：给叶再挂一个别的子夹，叶/根的命中集不变
    repo.create('旁支', { minRating: 5 }, leaf.id)
    expect(evalAlbum(leaf.id)).toEqual(hitSet('imgFav5', 'vid5'))
    expect(evalAlbum(root.id)).toEqual(hitSet('imgFav5', 'imgLow', 'raw5', 'vid5'))
  })

  it('祖先语义空集 fail-closed：semanticIds=[] 的祖先把整条子链拖成空', () => {
    const root = repo.create('AI无命中', { semanticIds: [] })
    const child = repo.create('子', { favorite: true }, root.id)
    // 祖先的空集在 buildSmartAlbumWhere 入口短路成 1=0，AND 进子级后整册为空
    expect(evalAlbum(child.id)).toEqual([])
    expect(evalAlbum(root.id)).toEqual([])
  })

  it('祖先的 match:any 顶层不被子级拆散：分别编译再求交，OR 组整体 AND 进子级', () => {
    // 祖先顶层是 any（rating>=5 OR favorite=true），子级是 minRating=2。
    // 若错误地把祖先扁平键并进子级的 AND 层，rating>=5 会单独 AND 进去，
    // imgFav5（rating 5 ✓）之外、favorite=true 的 raw5 也该凭 OR 支路通过。
    const parent = repo.create('any父', { match: 'any', minRating: 5, favorite: true })
    const child = repo.create('and子', { minRating: 2 }, parent.id)
    expect(evalAlbum(child.id)).toEqual(hitSet('imgFav5', 'raw5', 'vid5'))
  })

  it('删除中间祖先后的求值：整条子链被重新扶正（与侧栏孤儿挂根同口径）', () => {
    const root = repo.create('根', { minRating: 5 })
    const mid = repo.create('中', { favorite: true }, root.id)
    const leaf = repo.create('叶', { kinds: ['image'] }, mid.id)
    // 叶 = kinds image AND(favorite AND rating>=5) → raw5 也过（image/5星/收藏），vid5 卡 kinds
    expect(evalAlbum(leaf.id)).toEqual(hitSet('imgFav5', 'raw5'))
    // 中层被删：叶的父链在它那里截断（祖先约束整体消失，与侧栏「孤儿挂根」一致），
    // 只剩叶自身规则 kinds=['image']
    repo.remove(mid.id)
    expect(evalAlbum(leaf.id)).toEqual(hitSet('imgFav5', 'imgLow', 'raw5'))
  })

  it('queryByRules 不传祖先参数时行为与升级前一致（旧调用方回归）', () => {
    const rules: SmartAlbumRules = { favorite: true }
    expect(
      photos
        .queryByRules(rules)
        .map((p) => p.id)
        .sort()
    ).toEqual(hitSet('imgFav5', 'raw5', 'vid5'))
  })
})
