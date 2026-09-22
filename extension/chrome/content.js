/**
 * Leaf Clipper · Content script
 *
 * 被动注入：仅响应 popup 的 leaf:getImages 消息，扫描当前页可收藏图片
 * （<img> src / srcset 最优档、<video> poster、内联背景图），绝对化去重后
 * 按显示面积降序返回。不做任何 DOM 注入/悬浮层（保持页面零打扰）。
 */

(function () {
  if (window.__leafClipperReady) return
  window.__leafClipperReady = true

  function abs(url) {
    try {
      return new URL(url, location.href).href
    } catch {
      return ''
    }
  }

  /** srcset 取（近似）最大候选 */
  function bestFromSrcset(srcset) {
    const candidates = String(srcset || '')
      .split(',')
      .map((part) => part.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map((parts) => ({
        url: parts[0],
        w: parts[1] && /^\d+w$/.test(parts[1]) ? parseInt(parts[1], 10) : 0
      }))
    if (candidates.length === 0) return ''
    candidates.sort((a, b) => b.w - a.w)
    return candidates[0].url
  }

  function collect() {
    const found = new Map()

    const add = (raw, w, h) => {
      const url = abs(raw)
      if (!url) return
      if (!/^(https?:|data:image\/)/i.test(url)) return
      const area = (w || 0) * (h || 0)
      const prev = found.get(url)
      if (!prev || prev.area < area) found.set(url, { url, area })
    }

    for (const img of document.images) {
      const rect = img.getBoundingClientRect()
      add(
        img.currentSrc || bestFromSrcset(img.srcset) || img.src,
        img.naturalWidth || rect.width,
        img.naturalHeight || rect.height
      )
    }

    for (const video of document.querySelectorAll('video[poster]')) {
      add(video.getAttribute('poster'), 0, 0)
    }

    // 背景图：抽样扫描（上限 3000 个元素，防超大页面卡顿）
    let scanned = 0
    for (const el of document.querySelectorAll('body *')) {
      if (scanned++ > 3000) break
      const bg = getComputedStyle(el).backgroundImage
      if (!bg || bg === 'none') continue
      const m = /url\(["']?([^"')]+)["']?\)/.exec(bg)
      if (m) {
        const rect = el.getBoundingClientRect()
        add(m[1], rect.width, rect.height)
      }
    }

    const list = [...found.values()]
      .sort((a, b) => b.area - a.area)
      .slice(0, 200)
      .map((it) => ({ url: it.url, title: document.title.slice(0, 80) }))
    return list
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'leaf:getImages') {
      sendResponse({ ok: true, images: collect() })
    }
    return undefined
  })
})()
