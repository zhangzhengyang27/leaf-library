const listEl = document.getElementById('list')
const statusEl = document.getElementById('status')
const saveBtn = document.getElementById('save')
const selectAllBtn = document.getElementById('select-all')
const captureBtn = document.getElementById('capture')

let tabId = null

async function send(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve))
}

/** 在页面里收集 <img> 与背景大图（去重、过滤 data:） */
async function collectImages() {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const urls = new Set()
      for (const img of document.images) {
        if (img.src && !img.src.startsWith('data:') && img.naturalWidth >= 80) {
          urls.add(img.src)
        }
      }
      for (const a of document.querySelectorAll('[style*="background-image"]')) {
        const m = /url\(["']?(https?:[^"')]+)["']?\)/.exec(a.style.backgroundImage)
        if (m) urls.add(m[1])
      }
      return Array.from(urls).slice(0, 100)
    }
  })
  return res?.result ?? []
}

function render(urls) {
  if (urls.length === 0) {
    listEl.innerHTML = '<div id="empty">本页未发现可保存的图片</div>'
    return
  }
  listEl.innerHTML = ''
  for (const url of urls) {
    const label = document.createElement('label')
    label.className = 'item'
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = true
    checkbox.dataset.url = url
    const img = document.createElement('img')
    img.src = url
    img.loading = 'lazy'
    img.onerror = () => {
      img.src =
        'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="36" height="36"%3E%3C/svg%3E'
    }
    const span = document.createElement('span')
    span.textContent = url.split('/').pop().slice(0, 42) || url
    label.append(checkbox, img, span)
    listEl.appendChild(label)
  }
}

async function refreshStatus() {
  const ok = await send({ type: 'ping' })
  statusEl.textContent = ok ? '已连接 Leaf' : '未连接（检查 Leaf 是否运行/配置）'
  statusEl.className = ok ? 'ok' : 'fail'
}

saveBtn.addEventListener('click', async () => {
  const urls = Array.from(listEl.querySelectorAll('input:checked')).map((i) => i.dataset.url)
  if (urls.length === 0) return
  saveBtn.disabled = true
  saveBtn.textContent = '保存中…'
  const { results } = await send({ type: 'save-urls', urls })
  const failed = results.filter((r) => !r.ok)
  saveBtn.textContent = `完成 ${results.length - failed.length}/${results.length}`
  if (failed.length > 0) console.warn('failed:', failed)
  saveBtn.disabled = false
})

selectAllBtn.addEventListener('click', () => {
  const boxes = Array.from(listEl.querySelectorAll('input[type=checkbox]'))
  const allChecked = boxes.every((b) => b.checked)
  boxes.forEach((b) => (b.checked = !allChecked))
})

captureBtn.addEventListener('click', async () => {
  const win = await chrome.windows.getCurrent()
  const res = await send({ type: 'capture', windowId: win.id })
  captureBtn.textContent = res.ok ? '已保存 ✓' : '失败'
  setTimeout(() => (captureBtn.textContent = '截取可见区域'), 1500)
})

;(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  tabId = tab.id
  await refreshStatus()
  render(await collectImages())
})()
