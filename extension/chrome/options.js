/** Leaf Clipper · options：连接配置保存与探活 */
const baseUrlEl = document.getElementById('baseUrl')
const tokenEl = document.getElementById('token')
const statusEl = document.getElementById('status')

async function load() {
  const cfg = await chrome.storage.local.get(['baseUrl', 'token'])
  baseUrlEl.value = cfg.baseUrl || ''
  tokenEl.value = cfg.token || ''
}

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    baseUrl: baseUrlEl.value.trim(),
    token: tokenEl.value.trim()
  })
  statusEl.textContent = '已保存。'
})

document.getElementById('test').addEventListener('click', async () => {
  await chrome.storage.local.set({
    baseUrl: baseUrlEl.value.trim(),
    token: tokenEl.value.trim()
  })
  statusEl.textContent = '测试中…'
  const resp = await chrome.runtime.sendMessage({ type: 'leaf:ping' })
  statusEl.textContent = resp && resp.ok ? '✅ 连接成功，可以开始剪藏' : `❌ 连接失败：${(resp && resp.error) || '请检查地址/Token 与 Leaf 是否运行'}`
})

load()
