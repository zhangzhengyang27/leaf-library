    tab.ratingInclude = [
      legacyRating,
      legacyRating + 1,
      legacyRating + 2,
      legacyRating + 3,
      legacyRating + 4
    ].filter((r) => r <= 5)
  }
  delete tab.formatFilter
  delete tab.orientation
  delete tab.ratingFilter
}

function loadPersisted(): PersistedState | null {
  try {
    // 三条一次性迁移标志必须无条件先写（审查 P2-22）：旧实现只在读到持久化数据时
    // 才写标志——新装用户首轮无 raw 提前 return，标志永不落盘，第二次启动时
    // 首轮产生的默认值（waterfall/showName/摘要）被误判为「旧数据」遭到改写
    const needHoverbarMigration = !localStorage.getItem('leaf.hoverbar-migrated-v1')
    const needLayoutMigration = !localStorage.getItem('leaf.layout-migrated-v4')
    const needDisplayMigration = !localStorage.getItem('leaf.display-migrated-v2')
    if (needHoverbarMigration) localStorage.setItem('leaf.hoverbar-migrated-v1', '1')
    if (needLayoutMigration) localStorage.setItem('leaf.layout-migrated-v4', '1')
    if (needDisplayMigration) localStorage.setItem('leaf.display-migrated-v2', '1')

    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    if (!parsed.tab || typeof parsed.tab.view !== 'string') return null
    // 二十六轮：旧单值字段迁入多选数组
    migrateLegacyFilterFields(parsed.tab as unknown as Record<string, unknown>)
    // 十八轮一次性迁移：Eagle 无卡片 hover 操作条，旧用户默认开启的统一关闭。
    if (needHoverbarMigration) {
      if (parsed.tab.display) parsed.tab.display.showHoverBar = false
    }
    // 二十三轮一次性迁移：布局语义对齐 Eagle——「自适应」=justified 行式（行高≈固定、
    // 宽度成比例、整行填满），旧瀑布流偏好（flex 定高行）迁入自适应；瀑布流改为 masonry 列式。
    if (needLayoutMigration) {
      if ((parsed.tab.layout as string) === 'waterfall') parsed.tab.layout = 'auto'
    }
    // 二十三轮一次性迁移：卡片下方名称/简介默认隐藏（对齐用户 Eagle 当前状态——纯净瀑布流；
    // 需要时可在布局弹层「显示名称 / 显示简介」重新打开）
    if (needDisplayMigration) {
      if (parsed.tab.display) {
        parsed.tab.display.showName = false
        parsed.tab.display.showSummary = 'none'
      }
    }
    // 字段容错：缺字段补默认值；display 嵌套对象逐字段合并（兼容旧版本增量加开关）
    return {
      tab: {
        ...makeTab(parsed.tab.view, parsed.tab.title),
        ...parsed.tab,
        display: { ...makeDisplayOptions(), ...(parsed.tab.display ?? {}) }
      },
      history:
        Array.isArray(parsed.history) && parsed.history.length > 0
          ? parsed.history.slice(-HISTORY_LIMIT)
          : [parsed.tab.view],
      histIdx: typeof parsed.histIdx === 'number' ? parsed.histIdx : 0
    }
  } catch {
    return null
  }
}

/** 十五轮 D18：消费窗口 URL 里的初始视图参数（#/photos?boot-view=folder:<id>），用完即清 */
function consumeBootView(): string | null {
  try {
    const m = /boot-view=([^&]+)/.exec(window.location.hash)
    if (!m) return null
    const view = decodeURIComponent(m[1])
