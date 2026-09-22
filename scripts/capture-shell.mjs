/**
 * 临时视觉走查：启动应用截图（D-008 重构验收用）
 * 用法：node scripts/capture-shell.mjs
 */
import { _electron as electron } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'test-results')

const app = await electron.launch({
  args: [join(ROOT, 'out/main/index.js')]
})

const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1200)
// 重置 UI 状态到默认（面板显示、默认缩略图档位），清掉历史残留
await win.evaluate(() => {
  localStorage.removeItem('leaf.library-panel-visible')
  localStorage.removeItem('leaf.filterbar-visible')
  try {
    const raw = localStorage.getItem('library.tab.v2')
    if (raw) {
      const st = JSON.parse(raw)
      st.tab = { ...st.tab, layout: 'grid', thumbSize: 'md', view: 'all', title: '全部图片' }
      st.history = ['all']
      st.histIdx = 0
      localStorage.setItem('library.tab.v2', JSON.stringify(st))
    }
  } catch {
    /* ignore */
  }
})
await win.reload()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1800)
// 防意外浮层（预览/菜单）：先按 Esc 收敛再截图
await win.keyboard.press('Escape')
await win.waitForTimeout(300)

// 1. 图库首屏（浅色）
await win.screenshot({ path: join(OUT, 'shell-light.png') })

// 2. 暗色
await win.evaluate(() => document.documentElement.classList.add('dark'))
await win.waitForTimeout(500)
await win.screenshot({ path: join(OUT, 'shell-dark.png') })
await win.evaluate(() => document.documentElement.classList.remove('dark'))

// 3. 新建一个标签页 + 切到收藏视图（验证 tab strip 与侧栏联动）
await win.evaluate(() => {
  localStorage.setItem('leaf.db-ready', '1')
})
await win.waitForTimeout(200)

// 隐藏侧栏状态
await win.evaluate(() => localStorage.setItem('leaf.library-panel-visible', '0'))
await win.reload()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1200)
await win.keyboard.press('Escape')
await win.waitForTimeout(300)
await win.screenshot({ path: join(OUT, 'shell-panel-hidden.png') })

// 4. ⌘K 命令面板（验证合并后的全局唯一面板）
await win.keyboard.press('Meta+k')
await win.waitForTimeout(500)
await win.screenshot({ path: join(OUT, 'shell-cmdk.png') })
await win.keyboard.press('Escape')

await app.close()
console.log('screenshots saved to test-results/')
