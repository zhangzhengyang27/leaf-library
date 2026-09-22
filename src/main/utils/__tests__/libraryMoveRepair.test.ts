/**
 * F17 库目录移动修复计划单测。
 */
import { describe, expect, it } from 'vitest'
import { planLibraryMoveRepair } from '../libraryMoveRepair'

const ALL_EXIST = (): boolean => true
const NONE_EXIST = (): boolean => false

describe('planLibraryMoveRepair', () => {
  const oldRoot = '/Users/me/OldLibrary'
  const newRoot = '/Volumes/HD/NewLibrary'

  it('库内素材按相对路径映射到新根', () => {
    const missing = [
      { id: 'a', filePath: '/Users/me/OldLibrary/images/2609/x.png' },
      { id: 'b', filePath: '/Users/me/OldLibrary/clips/1_img.jpg' }
    ]
    const plan = planLibraryMoveRepair(missing, oldRoot, newRoot, ALL_EXIST)
    expect(plan).toEqual([
      { id: 'a', newPath: '/Volumes/HD/NewLibrary/images/2609/x.png' },
      { id: 'b', newPath: '/Volumes/HD/NewLibrary/clips/1_img.jpg' }
    ])
  })

  it('新根下不存在的候选被过滤', () => {
    const missing = [{ id: 'a', filePath: '/Users/me/OldLibrary/images/x.png' }]
    expect(planLibraryMoveRepair(missing, oldRoot, newRoot, NONE_EXIST)).toEqual([])
  })

  it('旧根之外的路径（越界 ../）跳过', () => {
    const missing = [
      { id: 'a', filePath: '/Users/me/Elsewhere/y.png' },
      { id: 'b', filePath: '/Users/me/OldLibrary/images/z.png' }
    ]
    const plan = planLibraryMoveRepair(missing, oldRoot, newRoot, ALL_EXIST)
    expect(plan).toHaveLength(1)
    expect(plan[0].id).toBe('b')
  })

  it('库内已有正确路径的（新根=旧根且相同路径）不去重入', () => {
    const missing = [{ id: 'a', filePath: '/same/images/x.png' }]
    // candidate === filePath 时跳过（无意义换绑）
    expect(planLibraryMoveRepair(missing, '/same', '/same/', ALL_EXIST)).toEqual([])
  })

  it('旧根尾斜杠归一化', () => {
    const missing = [{ id: 'a', filePath: '/old/images/x.png' }]
    const plan = planLibraryMoveRepair(missing, '/old/', '/new', ALL_EXIST)
    expect(plan).toEqual([{ id: 'a', newPath: '/new/images/x.png' }])
  })
})
