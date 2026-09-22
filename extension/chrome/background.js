/**
 * Leaf Clipper · Background service worker（MV3）
 *
 * 职责：持有连接配置（chrome.storage.local），把 popup/content 传来的图片
 * 逐张 POST 到 Leaf ClipServer（由应用下载入库，规避扩展跨域与 CSP 限制）。
 * - http(s) 图片 → POST /api/v1/photos/fromUrl（Leaf 服务端下载，带 SSRF 防护）
 * - data: 图片   → POST /api/v1/photos/fromBase64
 */

const DEFAULT_CONFIG = { baseUrl: 'http://127.0.0.1:0', token: '' }

async function getConfig() {
  const cfg = await chrome.storage.local.get(['baseUrl', 'token'])
  return {
    baseUrl: (cfg.baseUrl || DEFAULT_CONFIG.baseUrl).replace(/\/+$/, ''),
    token: cfg.token || ''
  }
}

/** Leaf 侧端口是随机回退的：baseUrl 带端口 0 视为未配置 */
function isConfigured(cfg) {
  return Boolean(cfg.token) && !/:0$/.test(cfg.baseUrl)
}

async function saveOne(item, cfg) {
  const isData = item.url.startsWith('data:')
  const endpoint = isData ? '/api/v1/photos/fromBase64' : '/api/v1/photos/fromUrl'
  const body = isData
    ? { data: item.url, title: item.title || '' }
    : { url: item.url, title: item.title || '' }
  // F7.1：可选目标文件夹
  if (item.folder) body.folder = item.folder
  const resp = await fetch(cfg.baseUrl + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-leaf-token': cfg.token },
    body: JSON.stringify(body)
  })
  return resp.json()
}

/** F7.1：右键菜单反馈徽标（无需 notifications 权限） */
function flashBadge(text, color) {
  // SW 可能随时被回收：设置/清除徽标失败都容忍（下次 flash 会覆盖，不影响主流程）
  try {
    chrome.action.setBadgeText({ text })
    chrome.action.setBadgeBackgroundColor({ color })
    setTimeout(() => {
      try {
        chrome.action.setBadgeText({ text: '' })
      } catch {
        // 清除失败可容忍
      }
    }, 2500)
  } catch {
    // 设置失败可容忍
  }
}

// 右键菜单：图片上「收藏图片到 Leaf」（F7.1）
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'leaf-save-image',
      title: '收藏图片到 Leaf',
      contexts: ['image']
    })
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'leaf-save-image' || !info.srcUrl) return
  ;(async () => {
    const cfg = await getConfig()
    if (!isConfigured(cfg)) {
      flashBadge('!', '#dc2626')
      return
    }
    try {
      const res = await saveOne(
        { url: info.srcUrl, title: (tab && tab.title) || '', folder: cfg.lastFolder || '' },
        cfg
      )
      flashBadge(res && res.ok ? '✓' : '!', res && res.ok ? '#16a34a' : '#dc2626')
    } catch {
      flashBadge('!', '#dc2626')
    }
  })()
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'leaf:ping') {
    ;(async () => {
      const cfg = await getConfig()
      if (!isConfigured(cfg)) {
        sendResponse({ ok: false, error: '未配置：请先在扩展选项里填写 Leaf 地址与 Token' })
        return
      }
      try {
        const resp = await fetch(cfg.baseUrl + '/api/v1/ping', {
          headers: { 'x-leaf-token': cfg.token }
        })
        sendResponse({ ok: resp.ok })
      } catch (err) {
        sendResponse({ ok: false, error: String(err) })
      }
    })()
    return true
  }

  if (msg && msg.type === 'leaf:getFolders') {
    ;(async () => {
      const cfg = await getConfig()
      if (!isConfigured(cfg)) {
        sendResponse({ ok: false, error: 'not-configured', folders: [] })
        return
      }
      try {
        const resp = await fetch(cfg.baseUrl + '/api/v1/folders', {
          headers: { 'x-leaf-token': cfg.token }
        })
        const data = await resp.json()
        sendResponse({ ok: Boolean(data && data.ok), folders: (data && data.folders) || [] })
      } catch (err) {
        sendResponse({ ok: false, error: String(err), folders: [] })
      }
    })()
    return true
  }

  if (msg && msg.type === 'leaf:save') {
    // 形状校验：items 必须是数组，异常也要 sendResponse（否则 popup 永久等待）
    const items = Array.isArray(msg.items) ? msg.items : null
    ;(async () => {
      if (!items) {
        sendResponse({
          ok: false,
          error: 'invalid payload: msg.items 必须是数组',
          saved: 0,
          total: 0
        })
        return
      }
      const cfg = await getConfig()
      if (!isConfigured(cfg)) {
        sendResponse({ ok: false, error: 'not-configured', saved: 0, total: items.length })
        return
      }
      let saved = 0
      let lastError = ''
      for (const item of items) {
        try {
          // F7.1：popup 选定的目标文件夹随每张图片下发
          const res = await saveOne({ ...item, folder: msg.folder || '' }, cfg)
          if (res && res.ok) saved += 1
          else lastError = (res && res.error) || 'unknown error'
        } catch (err) {
          lastError = String(err)
        }
      }
      sendResponse({ ok: saved > 0, saved, total: items.length, error: lastError })
    })()
    return true
  }

  return undefined
})
