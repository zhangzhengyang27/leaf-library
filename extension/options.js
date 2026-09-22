const portEl = document.getElementById('port')
const tokenEl = document.getElementById('token')
const msgEl = document.getElementById('msg')

chrome.storage.local.get(['port', 'token']).then(({ port, token }) => {
  portEl.value = port ?? ''
  tokenEl.value = token ?? ''
})

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    port: Number(portEl.value) || 41595,
    token: tokenEl.value.trim()
  })
  msgEl.textContent = '已保存 ✓'
  setTimeout(() => (msgEl.textContent = ''), 1500)
})
