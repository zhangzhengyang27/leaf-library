/**
 * P1 · 代码文件预览着色 真机验收
 *
 * 单测证明了纯函数每条分支都给转义过的 HTML，证不了的是**组件真的用 v-html 吃它**：
 * 模板改回 `{{ textContent }}` 的话单测全绿、界面上却一片空白（渲染的是原文本，
 * 着色串反而被当文本显示成 &lt;span&gt;）。所以这条必须在真 Chromium 里看 DOM。
 *
 * 顺带把安全面钉住：素材内容里写 `<img onerror>` 是日常代码，不是攻击，
 * 但一旦哪条分支漏转义，它在预览里就真变成一个元素——所以断言"图不存在、文本还在"。
 *
 * 用法：pnpm build && pnpm exec playwright test e2e/code-preview.spec.mjs
 */
import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN_ENTRY = join(ROOT, 'out/main/index.js')

let app = null
let userDataDir = null
let assetsDir = null
let libraryDir = null

const PAYLOAD = '<img src=x onerror=alert(1)>'
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
const getMainWindow = async () => {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    for (const w of app.windows()) {
      try {
        if (/本地工具箱|Leaf/.test(await w.title())) return w
      } catch {
        /* 窗口可能已关闭 */
      }
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  return app.firstWindow()
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function launch() {
  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-code-e2e-'))
  assetsDir = mkdtempSync(join(tmpdir(), 'leaf-code-assets-'))
  libraryDir = mkdtempSync(join(tmpdir(), 'leaf-code-lib-'))
  mkdirSync(join(libraryDir, 'images'), { recursive: true })
  // 预置一个非 legacy 库：不预置时启动走的是 userData 旧布局，网格停在空状态面板上，
  // 卡片摸不到（真机踩过一次，别去掉）
  writeFileSync(
    join(userDataDir, 'libraries.json'),
    JSON.stringify({
      activeLibraryId: 'probe',
      libraries: [
        {
          id: 'probe',
          name: '探针库',
          path: libraryDir,
          legacy: false,
          createdAt: Date.now(),
          lastOpenedAt: Date.now()
        }
      ]
    })
  )
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    launchOptions: { env }
  })
  const page = await getMainWindow()
  await page.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'), undefined, {
    timeout: 25_000
  })
  await page.evaluate(async () => {
    if (window.api?.preferences?.setOnboardingCompleted) {
      await window.api.preferences.setOnboardingCompleted()
    }
  })
  return page
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function closeApp() {
  if (app) await app.close()
  app = null
  for (const d of [userDataDir, assetsDir, libraryDir])
    if (d) rmSync(d, { recursive: true, force: true })
}

/** 导入一个素材并双击进预览 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function openPreviewOf(page, file) {
  await page.evaluate(async (p) => await window.api.photos.importPaths([p]), file)
  const name = file.split('/').pop()

  // 走 IPC 直接导入不会触发渲染层那套池子刷新（拖拽路径才会），所以重加载一次
  // 让网格从库里读——wallpaper-fit 那条也是这么做的
  await page.reload()
  await page.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'), undefined, {
    timeout: 25_000
  })
  const card = page.locator('[data-photo-id]').filter({ hasText: name }).first()
  await card.waitFor({ timeout: 20_000 })
  await card.dblclick()
  await page.waitForFunction(() => !!document.querySelector('.fixed pre.leaf-code'), undefined, {
    timeout: 20_000
  })
}

test('js 文件按语言上色，且内容里的标记不会被当元素解析', async () => {
  test.setTimeout(180_000)
  const page = await launch()
  try {
    const jsFile = join(assetsDir, 'greet.js')
    writeFileSync(
      jsFile,
      `export function greet(name) {\n  const banner = "${PAYLOAD}"\n  return 'hi ' + name\n}\n`
    )
    await openPreviewOf(page, jsFile)

    const state = await page.evaluate(() => {
      const pre = document.querySelector('.fixed pre.leaf-code')
      return {
        tokens: pre ? pre.querySelectorAll('span[class^="hljs-"]').length : -1,
        keyword: !!pre?.querySelector('span.hljs-keyword'),
        injectedImg: pre ? pre.querySelectorAll('img').length : -1,
        text: pre?.textContent ?? '',
        // 色值本身：token 结构与 code-preview.css 是两回事——@import 断了的话
        // 类名全在、颜色一点没有，界面上看就是"没上色"
        keywordColor: pre ? getComputedStyle(pre.querySelector('span.hljs-keyword')).color : '',
        baseColor: pre ? getComputedStyle(pre).color : ''
      }
    })
    expect(state.tokens).toBeGreaterThan(3) // 真上了色（关键字/字符串/函数名…）
    expect(state.keywordColor).not.toBe('')
    expect(state.keywordColor).not.toBe(state.baseColor)
    expect(state.keyword).toBe(true)
    expect(state.injectedImg).toBe(0) // 没被解析成元素
    expect(state.text).toContain(PAYLOAD) // 但原文还完整看得见
  } finally {
    await closeApp()
  }
})

test('扩展名认不出的仍是纯文本，不吞内容也不假着色', async () => {
  test.setTimeout(180_000)
  const page = await launch()
  try {
    const txtFile = join(assetsDir, 'notes.txt')
    writeFileSync(txtFile, `第一行\n第二行 ${PAYLOAD} 尾巴\n`)
    await openPreviewOf(page, txtFile)
    const state = await page.evaluate(() => {
      const pre = document.querySelector('.fixed pre.leaf-code')
      return {
        html: pre?.innerHTML ?? '',
        text: pre?.textContent ?? '',
        injectedImg: pre ? pre.querySelectorAll('img').length : -1
      }
    })
    expect(state.html).not.toContain('hljs-')
    expect(state.text).toContain('第二行')
    expect(state.text).toContain(PAYLOAD)
    expect(state.injectedImg).toBe(0)
  } finally {
    await closeApp()
  }
})

/**
 * 代码正文进不进全文索引，是「只收人写的」这条窄闸唯一能被真机证明的地方：
 *  - 手写 .js 里的独有串要能搜到（证明 SQL 的宽清单 + 服务侧的窄判定 + FTS 触发器三处接通）；
 *  - 声明文件里的独有串必须搜不到（证明 d.ts 被挡在索引外，而不是被抽成 '' 后仍进索引）。
 * 只断言"能搜到"是不够的：那条即使把 d.ts 也索引了照样绿。
 */
test('代码正文可被搜到，声明文件正文不进索引', async () => {
  test.setTimeout(180_000)
  const page = await launch()
  try {
    await page.evaluate(async () => await window.api.photos.setDocTextEnabled(true))
    const hand = join(assetsDir, 'lookup.js')
    writeFileSync(hand, 'export function find() {\n  return "leafcode9911"\n}\n')
    const decl = join(assetsDir, 'types.d.ts')
    writeFileSync(decl, 'declare const hidden: "leafdecl7722"\n')
    await page.evaluate(async (p) => await window.api.photos.importPaths([p]), hand)
    await page.evaluate(async (p) => await window.api.photos.importPaths([p]), decl)
    await page.evaluate(async () => await window.api.photos.runDocText())

    // 先等两条都 settled 再断言：队列是 fire-and-forget，抽取还没跑完时
    // "搜不到 d.ts 正文"会因为时序而假绿（真机验过：把窄闸删掉这条照样过）
    await expect
      .poll(
        () => page.evaluate(() => window.api.photos.docTextStatus().then((x) => x.pendingTotal)),
        { timeout: 60_000, intervals: [1000] }
      )
      .toBe(0)

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
    const hitsFor = (token) =>
      page.evaluate(
        async (q) => window.api.photos.search(q).then((r) => (r?.items ?? r ?? []).length),
        token
      )
    // 手写代码：正文里的独有串要能搜到（SQL 宽清单 + 服务侧窄判 + FTS 触发器三处都通）
    expect(await hitsFor('leafcode9911')).toBe(1)
    // 声明文件：按名字仍搜得到，但正文里的串不该命中
    expect(await hitsFor('leafdecl7722')).toBe(0)
    expect(await hitsFor('types.d.ts')).toBe(1)
    // 判掉的声明文件算"认账"（落 ''），不会留在待抽取清单里空转
    const status = await page.evaluate(() => window.api.photos.docTextStatus())
    expect(status.enabled).toBe(true)
    expect(status.pendingTotal).toBe(0)
  } finally {
    await closeApp()
  }
})
