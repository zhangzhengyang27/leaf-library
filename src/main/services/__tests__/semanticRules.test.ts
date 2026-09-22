// @vitest-environment node
/**
 * 语义条件解析器的三态决策表。
 *
 * 这里守的是"退化"那一类 bug：任何一格把「没给」和「给了但是空」混掉，
 * 相册就会从"AI 说没有"变成"整库都是命中"，而且不报错。
 * 真模型那条路径由 ClipEmbeddingService.model.test.ts 与 e2e 覆盖，
 * 这里只测决策本身，所以检索函数是注入的。
 */
import { describe, it, expect, vi } from 'vitest'
import { applySemanticQuery } from '../semanticRules'
import { SEMANTIC_ID_CAP } from '@shared/smartAlbumRules'
import { buildSmartAlbumWhere } from '../../db/smartAlbumRules'

const hits = (...ids: string[]) => async () => ids.map((id) => ({ id }))

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('applySemanticQuery', () => {
  it('没有语义条件时原样返回（不复制、不跑检索）', async () => {
    const spy = vi.fn()
    const rules = { favorite: true }
    expect(await applySemanticQuery(rules, spy)).toBe(rules)
    expect(spy).not.toHaveBeenCalled()
  })

  it('只有空白串也算没有：不跑检索、不写空集', async () => {
    const spy = vi.fn()
    const out = await applySemanticQuery({ semanticQuery: '   ' }, spy)
    expect(spy).not.toHaveBeenCalled()
    expect(out.semanticIds).toBeUndefined()
  })

  it('无命中要落成空集而不是缺字段——空集编译成 1=0，缺字段编译成整库', async () => {
    const out = await applySemanticQuery({ semanticQuery: '一架黑色三角钢琴' }, hits())
    expect(out.semanticIds).toEqual([])
    const { whereSql } = buildSmartAlbumWhere(out)
    expect(whereSql).toContain('1=0')
    // 判别性：同一份规则若没这个字段，谓词必须不存在
    expect(buildSmartAlbumWhere({ semanticQuery: 'x' }).whereSql).not.toContain('1=0')
  })

  it('命中落成 id 集，并与其它维度一起相与', async () => {
    const out = await applySemanticQuery(
      { semanticQuery: '一只猫', favorite: true },
      hits(A, B)
    )
    expect(out.semanticIds).toEqual([A, B])
    const { whereSql, params } = buildSmartAlbumWhere(out)
    expect(whereSql).toContain('id IN (?,?)')
    expect(whereSql).toContain('is_favorite = 1')
    expect(params).toContain(A)
    expect(params).toContain(B)
    // 占位符数与参数数配对，是这条链路上最容易被破坏的不变量
    expect((whereSql.match(/\?/g) ?? []).length).toBe(params.length)
  })

  it('已经带快照的不重算（渲染层自己跑过 vectors:search 那条路）', async () => {
    const spy = vi.fn()
    const out = await applySemanticQuery({ semanticQuery: '猫', semanticIds: [] }, spy)
    expect(spy).not.toHaveBeenCalled()
    expect(out.semanticIds).toEqual([])
  })

  it('查询串按上限截断后交给检索，且带上封顶条数', async () => {
    const seen: Array<[string, number]> = []
    await applySemanticQuery({ semanticQuery: '猫'.repeat(500) }, async (t, k) => {
      seen.push([t, k])
      return []
    })
    expect(seen[0][0]).toHaveLength(200)
    expect(seen[0][1]).toBe(SEMANTIC_ID_CAP)
  })

  it('原规则对象不能被就地改坏（相册 rules 是缓存里的活对象）', async () => {
    const rules = { semanticQuery: '猫' }
    await applySemanticQuery(rules, hits(A))
    expect(rules).toEqual({ semanticQuery: '猫' })
  })
})
