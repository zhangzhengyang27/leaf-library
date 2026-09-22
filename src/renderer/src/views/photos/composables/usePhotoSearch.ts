/**
 * Leaf 素材库 · 关键词搜索（D-008 重构）
 *
 * 关键词存于活动 tab；匹配结果池注入 usePhotoFilters。
 * 带 250ms 防抖，避免逐字符触发全量筛选重算。
 *
 * 原此处的 AI 语义搜索（aiSearchMode / semanticSearch / 建索引进度）随 D-017 整条下线；
 * 二十九轮按 Chinese-CLIP 重做后回到这里，但状态与检索都在 constants/semanticSearch，
 * 本文件只在防抖回调里多等它一次——两档共用同一个结果池，不再各走一条路。
 */
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import { buildSearchSpec } from './usePhotoFilterSpec'
import { usePhotoData } from './usePhotoData'
import { useSemanticSearch } from '../constants/semanticSearch'
import { useToast } from '@composables/useToast'
import { useQueryWords } from './useQueryWords'

/** 关键词搜索防抖计时器 */
let keywordDebounceTimer: number | undefined

function build() {
  const tabs = useLibraryTabs()
  const data = usePhotoData()
  const semantic = useSemanticSearch()
  const toast = useToast()
  const queryWords = useQueryWords()

  /** 关键词输入（FilterBar/Toolbar 共用）：清空立即生效，否则 250ms 防抖 */
  function handleSearch(query: string): void {
    const tab = tabs.active
    window.clearTimeout(keywordDebounceTimer)
    // 清空时立即生效，避免残留结果（分页池随关键词比对自动失配回退客户端空路径）
    if (!query.trim()) {
      tab.searchKeyword = query
      return
    }
    keywordDebounceTimer = window.setTimeout(() => {
      void (async () => {
        // 上一发若是"以图搜库内"，这次改的是文字 → 先清掉图那一档的命中集，
        // 否则旧 id 会继续收窄，看起来像"改关键词没反应"
        if (semantic.state.value.mode === 'image' && !semantic.enabled.value) semantic.reset()
        // 语义档先跑：它决定 spec 里带不带 semanticIds，跑完才能装配下推
        // 分词取词与语义档并行：客户端回退匹配要用同一套词，不能各切一次
        void queryWords.prime(query)
        if (semantic.enabled.value) {
          const ids = await semantic.search(query)
          // null = 这一档没跑成（未就绪/请求失败）。退回关键词搜是好事，
          // 但必须说清楚：否则用户以为"AI 也没找到"，实际是模型根本没下。
          if (ids === null && semantic.state.value.error)
            toast.warning('AI 语义档没跑起来，已按关键词搜索', {
              description: `${semantic.state.value.error}（设置 › 内容识别 里下载模型后可用）`
            })
        }
        // 防抖窗口内切换页签则丢弃本次输入，避免关键词写到新页签
        if (tabs.active !== tab) return
        tab.searchKeyword = query
        // 阶段 3：全局搜索分页——关键词/范围/高级语法 AST 随 spec 一并下推
        // （装配统一在 buildSearchSpec，与筛选变化重载搜索池共用同一份）
        await data.loadSearchPage(true, query, buildSearchSpec(query))
      })()
    }, 250)
  }

  function dispose(): void {
    window.clearTimeout(keywordDebounceTimer)
  }

  return { handleSearch, dispose }
}

/** 模块单例：搜索状态（防抖计时器/语义档接线）全视图共享一份 */
let singleton: ReturnType<typeof build> | null = null

export function usePhotoSearch(): ReturnType<typeof build> {
  if (!singleton) singleton = build()
  return singleton
}
