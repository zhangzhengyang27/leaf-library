/**
 * Leaf · 查询词（渲染层侧的取词缓存）
 *
 * 词典只在主进程一份（jieba-wasm）。渲染层的客户端回退匹配不自己切词——
 * 两边各切一次正是 docText 那个"静默搜错列"的成因，所以这里发一次 IPC 取同一套词。
 *
 * 取不到时退回按空白切（与改动前一致）：宁可暂时退化成旧行为，也不要拿一套
 * 主进程的词、另一套自己的词去拼结果。
 */
import { ref } from 'vue'

const CACHE_MAX = 100
const cache = ref(new Map<string, string[]>())
const status = ref<{ active: boolean; engine: string; error: string } | null>(null)

function put(key: string, words: string[]): void {
  if (cache.value.size >= CACHE_MAX) cache.value.clear()
  cache.value.set(key, words)
}

export function useQueryWords(): {
  prime: (query: string) => Promise<void>
  wordsFor: (query: string) => string[] | undefined
} {
  /** 预热一条查询的分词结果（搜索防抖回调里 await 它） */
  async function prime(query: string): Promise<void> {
    const key = query.trim()
    if (key === '' || cache.value.has(key)) return
    try {
      put(key, await window.api.search.segmentWords(key))
    } catch {
      /* 取词失败就不写缓存，匹配侧自然回落到空白切分 */
    }
  }

  function wordsFor(query: string): string[] | undefined {
    return cache.value.get(query.trim())
  }

  return { prime, wordsFor }
}
