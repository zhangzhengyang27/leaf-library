/** Leaf Clipper · popup：图片网格勾选 + 批量收藏 */
const tipEl = document.getElementById('tip')
const gridEl = document.getElementById('grid')
const countEl = document.getElementById('count')
const statusEl = document.getElementById('status')
const saveBtn = document.getElementById('save')
const toggleBtn = document.getElementById('toggle')

let images = []
const off = new Set()

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

/** content script 未注入时（安装扩展前已打开的标签页）补注入 */
async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'leaf:getImages' })
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
  }
}

async function ping() {
  const resp = await chrome.runtime.sendMessage({ type: 'leaf:ping' })
  return resp && resp.ok
}

async function init() {
  try {
    const tab = await getActiveTab()
    if (!tab || !tab.id) {
      tipEl.textContent = '无法访问当前标签页'
      return
    }
    if (!(await ping())) {
      tipEl.innerHTML = '尚未连接 Leaf。<br />请点右上角「设置」填写地址与 Token。'
      return
    }
    await ensureContentScript(tab.id)
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'leaf:getImages' })
    images = (resp && resp.images) || []
    if (images.length === 0) {
      tipEl.textContent = '本页没有发现可收藏的图片'
      return
    }
    tipEl.style.display = 'none'
    gridEl.style.display = ''
    await loadFolders()
    render()
  } catch {
    // executeScript / sendMessage 失败（chrome:// 页、无 host 权限等）：
    // 不再停留在「正在读取页面图片…」，给出明确提示并停用操作
    tipEl.textContent = '此页面不支持剪藏'
    toggleBtn.disabled = true
    saveBtn.disabled = true
  }
}

/** F7.1：拉取文件夹清单填充选择器（失败静默 = 收藏到未分组） */
async function loadFolders() {
  const row = document.getElementById('folderRow')
  const sel = document.getElementById('folder')
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'leaf:getFolders' })
    const folders = (resp && resp.folders) || []
    sel.textContent = ''
    const none = document.createElement('option')
    none.value = ''
    none.textContent = '未分组'
    sel.appendChild(none)
    for (const f of folders) {
      const opt = document.createElement('option')
      opt.value = f.id
      opt.textContent = f.name
      sel.appendChild(opt)
    }
    row.style.display = ''
  } catch {
    row.style.display = 'none'
  }
}

function render() {
  gridEl.textContent = ''
  images.forEach((item, i) => {
    const cell = document.createElement('div')
    cell.className = 'cell' + (off.has(i) ? ' off' : '')
    const img = document.createElement('img')
    img.src = item.url
    img.loading = 'lazy'
    img.title = item.url
    cell.appendChild(img)
    const tick = document.createElement('span')
    tick.className = 'tick'
    tick.textContent = '✓'
    cell.appendChild(tick)
    cell.addEventListener('click', () => {
      if (off.has(i)) off.delete(i)
      else off.add(i)
      render()
    })
    gridEl.appendChild(cell)
  })
  const n = images.length - off.size
  countEl.textContent = `已选 ${n} / ${images.length}`
  saveBtn.disabled = n === 0
}

toggleBtn.addEventListener('click', () => {
  images.forEach((_, i) => {
    if (off.has(i)) off.delete(i)
    else off.add(i)
  })
  render()
})

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true
  saveBtn.textContent = '收藏中…'
  const items = images.filter((_, i) => !off.has(i))
  const folder = document.getElementById('folder').value
  const resp = await chrome.runtime.sendMessage({ type: 'leaf:save', items, folder })
  if (resp && resp.ok) {
    statusEl.textContent = `已收藏 ${resp.saved}/${resp.total} 张到 Leaf`
    saveBtn.textContent = '已完成'
  } else if (resp && resp.error === 'not-configured') {
    statusEl.textContent = '未配置 Leaf 地址/Token'
    saveBtn.textContent = '收藏选中'
    saveBtn.disabled = false
  } else {
    statusEl.textContent = `失败：${(resp && resp.error) || '未知错误'}`
    saveBtn.textContent = '重试'
    saveBtn.disabled = false
  }
})

init()
