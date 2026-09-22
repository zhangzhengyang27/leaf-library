// @vitest-environment node
/**
 * 查询分词单测。守两件事：
 * ① 中文连写词真的被切开（这是这条链的全部意义）；
 * ② 词典出问题时**必须静默回落而不是抛**——搜索是主路径，
 *    一个可选词典把搜索搞挂是比"搜不到"严重得多的事故。
 */
import { describe, it, expect } from 'vitest'
import { segmentQuery, dictionaryStatus, segmentLoadError } from '../querySegment'

describe('segmentQuery', () => {
  it('中文连写词切成词（不切就是整串匹配，搜不到「红色系海报」）', () => {
    expect(segmentQuery('红色海报')).toEqual(['红色', '海报'])
    expect(segmentQuery('雪山日落')).toEqual(['雪山', '日落'])
  })

  it('中英混排：英文按词、中文按词，全部小写', () => {
    const w = segmentQuery('POSTER 红色海报')
    expect(w).toContain('poster')
    expect(w).toContain('红色')
    expect(w).toContain('海报')
  })

  it('重复词去重、纯标点丢弃、词数封顶', () => {
    expect(segmentQuery('海报 海报')).toEqual(['海报'])
    // 纯符号串不再返回空（那会让谓词消失），而是整串回落匹配
    expect(segmentQuery('—— ——')).toEqual(['—— ——'])
    expect(segmentQuery('猫'.repeat(40) + ' ' + '狗'.repeat(40)).length).toBeLessThanOrEqual(12)
  })

  it('空串与空白不炸', () => {
    expect(segmentQuery('')).toEqual([])
    expect(segmentQuery('   ')).toEqual([])
  })

  it('同一串重复切给出同一结果（缓存不改变语义）', () => {
    expect(segmentQuery('红色海报')).toEqual(segmentQuery('红色海报'))
  })

  it('词典状态可查（"搜不到"排障第一个看这个），且当前确实在用词典', () => {
    const st = dictionaryStatus()
    expect(st.engine).toBe('jieba-wasm')
    expect(st.active).toBe(true)
    expect(st.error).toBe('')
    expect(segmentLoadError()).toBe('')
  })
})

describe('切不出词时的回落（谓词不能整个消失）', () => {
  it('纯符号查询退回整串匹配，而不是返回空词表', () => {
    // 空词表会让 buildSmartAlbumWhere 的词循环一次都不进 → where 塌成 1=1 → 返回全库
    for (const q of ['——', '！！！', '🐱', '***', '「」']) {
      expect(segmentQuery(q)).toEqual([q.toLowerCase()])
      expect(segmentQuery(q).length).toBeGreaterThan(0)
    }
  })

  it('正常查询不受回落影响（不会把整串再塞一份）', () => {
    expect(segmentQuery('红色海报')).toEqual(['红色', '海报'])
  })
})
