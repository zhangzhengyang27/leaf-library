/**
 * Leaf · 查询分词（主搜索链中文分词，对齐 Eagle 的 nodejieba 口径）
 *
 * 为什么需要：搜索词此前按空白切，「红色海报」是一个整词，
 * 于是搜不出「红色系海报.png」——中文不写空格，这条链对中文等于只能整串匹配。
 *
 * 词典只在这里载一份。渲染层那条客户端回退匹配不自己切词，
 * 而是走 photos:segmentWords 取同一套结果：两条路径各切一次正是 docText
 * 那个静默搜错列的成因，不能再犯一次。
 *
 * 回落是硬要求：wasm 在某个宿主里起不来时，搜索必须退化成"按空格切"继续工作，
 * 而不是整条链抛错。失败原因只打印一次，不刷日志。
 */

export interface SegmentApi {
  /** 查询串 → 词表（已小写、已去空、按出现序去重） */
  (query: string): string[]
  /** 词典是否真的在用（false = 已回落到空白切分，设置页/排查要看得到） */
  dictionaryActive: () => boolean
}

/** 一次查询最多带进 SQL 的词数：长句粘贴进来不该生成几百个 LIKE */
const MAX_WORDS = 12
/** 结果缓存：搜索框逐字符防抖，同一串会被反复切 */
const CACHE_MAX = 200

const cache = new Map<string, string[]>()
let cut: ((text: string, hmm: boolean) => string[]) | null = null
let loadAttempted = false
let loadError = ''

function loadDict(): void {
  if (loadAttempted) return
  loadAttempted = true
  try {
    // 惰性 require：加载失败也不能让这个模块 import 就炸
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const mod = require('jieba-wasm') as { cut?: (t: string, h: boolean) => string[] }
    if (typeof mod.cut !== 'function') throw new Error('jieba-wasm 未导出 cut')
    cut = mod.cut
  } catch (error) {
    cut = null
    loadError = error instanceof Error ? error.message : String(error)
    console.warn('[querySegment] 词典加载失败，回落空白切分：', loadError)
  }
}

/** 去空白、去重、丢单字符标点；大小写折叠交给调用方（SQL 侧列已 LOWER） */
function normalize(parts: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of parts) {
    const w = raw.trim().toLowerCase()
    if (w === '' || /^[^\p{L}\p{N}]+$/u.test(w)) continue
    if (seen.has(w)) continue
    seen.add(w)
    out.push(w)
    if (out.length >= MAX_WORDS) break
  }
  return out
}

/** 词典不可用时的兜底：按空白切（与改动前的行为一致） */
function splitBySpace(query: string): string[] {
  return normalize(query.split(/\s+/))
}

export const segmentQuery: SegmentApi = Object.assign(
  (query: string): string[] => {
    const q = query.trim()
    if (q === '') return []
    const hit = cache.get(q)
    if (hit) return hit
    loadDict()
    let words: string[]
    if (cut) {
      try {
        // hmm=false：快速模式。精确模式(HMM)对新词更准但慢一倍，
        // 搜索框是逐字符防抖触发的，这里的耗时直接进用户等待
        words = normalize(cut(q, false))
      } catch (error) {
        // 词典在个别串上抛（超长/奇异码点）也不能带崩搜索
        console.warn('[querySegment] 分词异常，本条回落空白切分：', String(error))
        words = splitBySpace(q)
      }
    } else {
      words = splitBySpace(q)
    }
    // 一个词都切不出来时（「——」「！！！」这类纯标点/符号查询）必须退回整串匹配。
    // 返回空数组会让调用方的词循环一次都不进，谓词整个消失 → 搜索框变成"返回全库"，
    // 而改动前 split(/\s+/) 至少留下一个 LIKE '%——%'（能命中文件名里的破折号）。
    if (words.length === 0) words = [q.toLowerCase()]
    if (cache.size >= CACHE_MAX) cache.clear()
    cache.set(q, words)
    return words
  },
  {
    dictionaryActive: (): boolean => {
      loadDict()
      return cut !== null
    }
  }
)

/** 给排查/测试用：词典加载失败的原因（在用则为空串） */
export function segmentLoadError(): string {
  loadDict()
  return loadError
}

/**
 * 词典状态。"搜不到"这类问题第一个要看这个：词典没起来时分词静默退化成
 * 空格切分，中文连写词就又搜不到了——现象和没做这个功能一模一样。
 */
export function dictionaryStatus(): { active: boolean; engine: string; error: string } {
  loadDict()
  return {
    active: cut !== null,
    engine: cut ? 'jieba-wasm' : 'whitespace-fallback',
    error: loadError
  }
}
