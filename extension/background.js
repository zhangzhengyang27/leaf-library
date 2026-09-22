/**
 * Leaf Clip · MV3 service worker
 *
 * 右键「存入 Leaf」→ 图片 URL 交桌面应用下载（fromUrl，应用端可带 Referer）
 * 弹窗批选 / 截取可见区域 → 扩展内 fetch 转 base64（fromBase64，绕过防盗链热链场景）
 */

const DEFAULTS = { port: 41595, token: '' }

async function getConfig() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(['port', 'token'])) }
}

async function api(path, body) {
  const { port, token } = await getConfig()
  if (!token) throw new Error('未配置 Leaf 端口与 Token（右键扩展图标 → 选项）')
  const resp = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-leaf-token': token },
    body: JSON.stringify(body)
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`)
  return data
}

async function ping() {
  const { port, token } = await getConfig()
  if (!token) return false
  const resp = await fetch(`http://127.0.0.1:${port}/api/v1/ping`, {
    headers: { 'x-leaf-token': token }
  }).catch(() => null)
  const data = await resp?.json().catch(() => null)
  return data?.ok === true
}

async function saveFromUrl(url, title) {
  return api('/api/v1/photos/fromUrl', { url, title })
}

async function saveFromBlob(url) {
  // 扩展内 fetch（host_permissions 放行），转 base64 交给应用入库
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`fetch HTTP ${resp.status}`)
  const blob = await resp.blob()
  if (!blob.type.startsWith('image/')) throw new Error(`非图片类型 ${blob.type}`)
  const buf = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode(...buf.subarray(i, i + CHUNK))
  }
  return api('/api/v1/photos/fromBase64', { data: `data:${blob.type};base64,${btoa(binary)}` })
}

async function captureVisibleTab(windowId) {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
  return api('/api/v1/photos/fromBase64', { data: dataUrl })
}

// ---- 安装：右键菜单 ----
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'leaf-save-image',
      title: '存入 Leaf 素材库',
      contexts: ['image']
    })
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'leaf-save-image' || !info.srcUrl) return
  try {
    await saveFromUrl(info.srcUrl, tab?.title)
    chrome.notifications?.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Leaf Clip',
      message: '已存入 Leaf 素材库'
    })
  } catch (err) {
    chrome.notifications?.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Leaf Clip 失败',
      message: String(err.message || err)
    })
  }
})

// ---- popup / 快捷指令消息 ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  ;(async () => {
    switch (msg.type) {
      case 'ping':
        sendResponse({ ok: await ping() })
        break
      case 'save-urls': {
        const results = []
        for (const url of msg.urls) {
          try {
            // 优先应用端下载（带 Referer 更强），失败再走扩展内 fetch
            await saveFromUrl(url, msg.title).catch(() => saveFromBlob(url))
            results.push({ url, ok: true })
          } catch (err) {
            results.push({ url, ok: false, error: String(err.message || err) })
          }
        }
        sendResponse({ results })
        break
      }
      case 'capture': {
        try {
          await captureVisibleTab(msg.windowId)
          sendResponse({ ok: true })
        } catch (err) {
          sendResponse({ ok: false, error: String(err.message || err) })
        }
        break
      }
      default:
        sendResponse({ ok: false, error: 'unknown message' })
    }
  })()
  return true // 异步 sendResponse
})
