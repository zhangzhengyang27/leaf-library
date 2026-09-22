// 七轮：Eagle 同款字体（OFL 开源协议，@fontsource 打包本地分发）
// Eagle UI 字体栈 = Lato + PingFang 兜底；等宽 = Fira Mono
import '@fontsource/lato/400.css'
import '@fontsource/lato/700.css'
import '@fontsource/fira-mono/400.css'
import '@fontsource/fira-mono/500.css'
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

/**
 * 启动闪屏：Vue mount 后立刻淡出 #splash。
 * 兜底机制：万一异常没移除，1.5s 后强制移除（防止永远挡住主界面）。
 */
function hideSplash(): void {
  const splash = document.getElementById('splash')
  if (!splash) return
  splash.classList.add('splash-fadeout')
  // 240ms 过渡结束后真正移除（不再占据 DOM）
  window.setTimeout(() => splash.remove(), 260)
}

if (typeof window !== 'undefined') {
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void) => number
    setTimeout: typeof setTimeout
  }
  // 用 rIC 等下一帧；mount 是同步的，但 Vue 响应式挂载完成是异步的
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(hideSplash)
  } else {
    w.setTimeout(hideSplash, 0)
  }
  // 兜底：1.5s 强移除
  w.setTimeout(hideSplash, 1500)
}
