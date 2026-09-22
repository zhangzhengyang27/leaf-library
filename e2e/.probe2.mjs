// 一次性判别：Chromium 里 audio 的 computed display 到底由什么决定
import { _electron as electron } from 'playwright'

const app = await electron.launch({ args: ['--no-sandbox'], launchOptions: {} }).catch(async () => {
  // 没有主入口时 Electron 会退化成默认 app —— 这里只需要一个 Chromium 页面
  throw new Error('need entry')
})
await app.close()
