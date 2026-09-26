// @vitest-environment happy-dom
/**
 * M3 · 标注数缓存（annotationCounts）刷新逻辑
 *
 * 覆盖：开关门控（关=零 IPC）、成功合并不清旧条目、失败静默清空、
 * 序号守卫（过期响应丢弃）、500 分片与 2000 单次总量上限。
 * 口径说明：repo 的 countByPhotoIds 没有既有测试文件、IPC handler 又不宜直测，
 * 按任务口径只测渲染层刷新逻辑；主进程切片语义沿用 repo 内注释约定。
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePhotoData } from '../usePhotoData'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'

const countMock = vi.fn()

beforeAll(() => {
  setActivePinia(createPinia())
  ;(globalThis as Record<string, unknown>).window = globalThis.window ?? {}
  ;(window as unknown as Record<string, unknown>).api = {
    annotations: { count: countMock }
  }
})

beforeEach(async () => {
  localStorage.clear()
  useLibraryTabs().resetForTests()
  countMock.mockReset()
  // 模块单例：跨用例清缓存，互不泄漏
  usePhotoData().annotationCounts.value = new Map()
  // 清空模块内的补拉源 lastCountIds（上一个用例可能留下大 id 列表），
  // 同时冲刷 resetForTests 入队的 watch 回调（开关 true→false，无操作）
  await usePhotoData().refreshAnnotationCounts([])
})

/** 让「开关打开瞬间补拉」的模块级 watch 回调先跑完（此时 lastCountIds 已空，补拉零 IPC），
 *  避免它中途插入测试内的刷新序列、撞乱序号守卫 */
const flushToggleWatch = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

/** 开开关并等补拉回调落地，之后测试内的刷新才是唯一在飞请求 */
async function enableBadge(): Promise<void> {
  useLibraryTabs().active.display.showAnnotationCount = true
  await flushToggleWatch()
}

const ids = (prefix: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}-${i}`)

describe('usePhotoData · 标注数刷新', () => {
  it('开关关闭（默认）：不发 IPC，也不写缓存', async () => {
    const data = usePhotoData()
    await data.refreshAnnotationCounts(['a', 'b'])
    expect(countMock).not.toHaveBeenCalled()
    expect(data.annotationCounts.value.size).toBe(0)
  })

  it('开关开：取回计数写入缓存，且合并不清其它池既有条目', async () => {
    await enableBadge()
    const data = usePhotoData()
    countMock.mockResolvedValue({ a: 2 })
    await data.refreshAnnotationCounts(['a'])
    expect(data.annotationCounts.value.get('a')).toBe(2)

    countMock.mockResolvedValue({ b: 5 })
    await data.refreshAnnotationCounts(['b'])
    expect(data.annotationCounts.value.get('a')).toBe(2)
    expect(data.annotationCounts.value.get('b')).toBe(5)
  })

  it('拉取失败：静默清空（徽标当无数据），不向上抛错', async () => {
    await enableBadge()
    const data = usePhotoData()
    countMock.mockResolvedValue({ a: 2 })
    await data.refreshAnnotationCounts(['a'])
    expect(data.annotationCounts.value.get('a')).toBe(2)

    countMock.mockRejectedValue(new Error('ipc down'))
    await expect(data.refreshAnnotationCounts(['b'])).resolves.toBeUndefined()
    expect(data.annotationCounts.value.size).toBe(0)
  })

  it('序号守卫：慢的旧请求后到，不得覆盖新结果', async () => {
    await enableBadge()
    const data = usePhotoData()
    const resolvers: Array<(v: Record<string, number>) => void> = []
    countMock.mockImplementation(
      () => new Promise<Record<string, number>>((res) => resolvers.push(res))
    )

    const oldCall = data.refreshAnnotationCounts(['old-1'])
    const newCall = data.refreshAnnotationCounts(['new-1'])
    // 后发起的请求先回来并写入
    resolvers[1]({ 'new-1': 7 })
    await newCall
    // 旧请求这才回来：应被序号守卫整体丢弃
    resolvers[0]({ 'old-1': 1 })
    await oldCall

    expect(data.annotationCounts.value.get('new-1')).toBe(7)
    expect(data.annotationCounts.value.has('old-1')).toBe(false)
  })

  it('分片与上限：1100 个 id → 3 次 IPC（500/500/100）；2500 个 id 只取前 2000', async () => {
    await enableBadge()
    const data = usePhotoData()
    countMock.mockResolvedValue({})

    await data.refreshAnnotationCounts(ids('chunk', 1100))
    expect(countMock).toHaveBeenCalledTimes(3)
    expect(countMock.mock.calls[0][0]).toHaveLength(500)
    expect(countMock.mock.calls[1][0]).toHaveLength(500)
    expect(countMock.mock.calls[2][0]).toHaveLength(100)

    countMock.mockClear()
    await data.refreshAnnotationCounts(ids('cap', 2500))
    expect(countMock).toHaveBeenCalledTimes(4) // 2000 = 4 × 500
    const requested = countMock.mock.calls.flatMap((c) => c[0] as string[])
    expect(requested).toHaveLength(2000)
  })
})
