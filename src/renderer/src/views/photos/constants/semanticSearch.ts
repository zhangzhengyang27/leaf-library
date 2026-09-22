/**
 * Leaf · 语义搜索档（G1 文搜图，Chinese-CLIP）
 *
 * 开关与命中 id 集放模块级单例 ref，和 useSearchScopes 同一套形状：
 * TitleBar（开关 UI）、usePhotoSearch（发起检索）、usePhotoFilterSpec（装配下推 spec）
 * 三处共享同一实例，避免把状态塞进 tab store 再被切页签甩掉。
 *
 * 三态刻意区分清楚，因为线上表现完全不同：
 *  - null  这一档没跑（没开 / 模型没下 / 请求失败）→ 退回关键词搜索，并说明原因；
 *  - []    跑了但 AI 判定没有超过实测阈值的素材 → 真的出空结果，不假装找到了；
 *  - 非空  按 id 收窄，仍与文件夹/标签/维度筛选组合。
 */
import { ref, type Ref } from 'vue'

const STORAGE_KEY = 'leaf:semantic-search'
/** 以图搜库内一次返回的张数（排序取前 K，见 searchByImage 里的实测说明） */
const IMAGE_TOP_K = 24

export interface SemanticState {
  /** 模型是否已下载并 warm-up 过（决定开关能不能用） */
  ready: boolean
  /** 一次检索在飞 */
  loading: boolean
  /** 最近一次真正跑过的查询（用于判断结果池是不是语义的） */
  ranQuery: string
  /** 最近一次命中数；-1 = 没跑过 */
  count: number
  /** 上一次失败原因（下载失败 / 检索失败） */
  error: string
  /** 最近一次命中 id（装配 spec 时下推；与 ranQuery 同生同灭） */
  hits: string[]
  /**
   * 这一档是"按文字搜"还是"按外部图搜库内"。
   * image 模式刻意不吃 enabled 开关：用户点一次「以图搜库内」就该生效，
   * 不该先要求他把语义档打开。
   */
  mode: 'text' | 'image' | null
  /** 文本档相关性下限（跟着 status 拿，界面别手抄——重标阈值时只有代码会改） */
  minScoreText: number
}

const enabled = ref(readEnabled())
const state = ref<SemanticState>({
  ready: false,
  loading: false,
  ranQuery: '',
  count: -1,
  error: '',
  hits: [],
  mode: null,
  minScoreText: 0.4
})

/**
 * 图搜那一档的命中集，面对这条新查询该不该丢掉、要不要再跑一次文本档。
 *
 * 抽成纯函数是因为这条只能靠 UI 链路才暴露：TitleBar 选完图会把文件名回显进搜索框
 * 再调 handleSearch，若在这里当成"用户改词"，刚算出的命中集会被自己清掉，
 * 结果退化成按文件名搜——而直接打 IPC 的 e2e 全绿也发现不了（真栽过一次）。
 */
export function imageSearchFlow(
  state: Pick<SemanticState, 'mode' | 'ranQuery'>,
  enabledNow: boolean,
  query: string
): { keepHits: boolean; runText: boolean } {
  const q = query.trim()
  // 空查询没有可搜的东西：不跑文本档；命中集也不必清（spec 装配那侧要求
  // ranQuery 非空且与查询相等才生效，空串天然让它不生效）
  if (q === '') return { keepHits: true, runText: false }
  if (state.mode === 'image' && state.ranQuery !== '' && state.ranQuery === q) {
    // 就是刚才那张图的回显：命中集留着，也不再跑文本档去覆盖它。
    // 文本档开着时同样不能再跑——否则 mode 被改写成 'text'，图搜结果照样丢。
    return { keepHits: true, runText: false }
  }
  if (state.mode === 'image' && !enabledNow) return { keepHits: false, runText: false }
  return { keepHits: true, runText: enabledNow }
}

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** 状态问一次就够贵（要 stat 文件 + 数库），所以只在开/关与下载后主动刷 */
export async function refreshSemanticReady(): Promise<boolean> {
  try {
    const s = await window.api.vectors.status()
    state.value.ready = !!s.ready
    if (s?.minScore?.text) state.value.minScoreText = s.minScore.text
  } catch {
    state.value.ready = false
  }
  return state.value.ready
}

export function useSemanticSearch(): {
  enabled: Ref<boolean>
  state: Ref<SemanticState>
  toggle: () => Promise<void>
  search: (query: string) => Promise<string[] | null>
  searchByImage: (filePath: string) => Promise<string[] | null>
  reset: () => void
  refreshReady: () => Promise<boolean>
} {
  async function toggle(): Promise<void> {
    enabled.value = !enabled.value
    try {
      localStorage.setItem(STORAGE_KEY, enabled.value ? '1' : '0')
    } catch {
      /* 隐私模式下 localStorage 会抛，开关本身仍然生效 */
    }
    if (enabled.value) await refreshSemanticReady()
    if (!enabled.value) reset()
  }

  /** 清掉上一档的命中集，避免残留 id 继续收窄结果 */
  function reset(): void {
    state.value.ranQuery = ''
    state.value.count = -1
    state.value.hits = []
    state.value.mode = null
  }

  /**
   * 跑一次文搜图。返回 null 表示"这一档没跑成"（调用方退回关键词搜索并提示原因），
   * 返回数组（含空数组）表示跑成了。
   */
  async function search(query: string): Promise<string[] | null> {
    const text = query.trim()
    if (!enabled.value || text === '') return null
    state.value.loading = true
    try {
      if (!state.value.ready) {
        const ok = await refreshSemanticReady()
        if (!ok) {
          state.value.error = '模型未下载'
          return null
        }
      }
      const hits = await window.api.vectors.search(text, 200)
      const ids = (hits ?? [])
        .map((h) => h?.photo?.id)
        .filter((x): x is string => typeof x === 'string')
      state.value.error = ''
      state.value.mode = 'text'
      state.value.ranQuery = text
      state.value.count = ids.length
      state.value.hits = ids
      return ids
    } catch (error) {
      state.value.error = error instanceof Error ? error.message : String(error)
      return null
    } finally {
      state.value.loading = false
    }
  }

  /**
   * 以图搜库内：选中的是用户机器上任意一张图，走图像向量档。
   * 命中集直接写进 `hits`，标签用文件名——搜索框里显示的就是"我用什么搜的"。
   */
  async function searchByImage(filePath: string): Promise<string[] | null> {
    if (!state.value.ready) {
      const ok = await refreshSemanticReady()
      if (!ok) {
        state.value.error = '模型未下载'
        return null
      }
    }
    state.value.loading = true
    try {
      // 取前 24 而不是 200：图像↔图像余弦的分布重叠（同品种 p50=0.858 vs 跨品种
      // p50=0.743/max=0.958），分数撑不起"够不够像"的绝对判定，只能当排序用，
      // 所以这一档的语义是"排在前面的若干张"，不是"全部过阈值的"
      const hits = await window.api.vectors.similarByImage(filePath, IMAGE_TOP_K)
      const ids = (hits ?? [])
        .map((h) => h?.photo?.id)
        .filter((x): x is string => typeof x === 'string')
      const label = filePath.split(/[\\/]/).pop() ?? filePath
      state.value.error = ''
      state.value.mode = 'image'
      state.value.ranQuery = label
      state.value.count = ids.length
      state.value.hits = ids
      return ids
    } catch (error) {
      state.value.error = error instanceof Error ? error.message : String(error)
      return null
    } finally {
      state.value.loading = false
    }
  }

  return {
    enabled,
    state,
    toggle,
    search,
    searchByImage,
    reset,
    refreshReady: refreshSemanticReady
  }
}
