/**
 * 子文件夹卡片（Eagle 标志性交互）+「显示子文件夹内容」拍平 真机验收
 *
 * 六步判别链：
 *  1. 建父夹 + 两个子夹 + 导入真图分配（父直属 1 张 / 每个子夹 2 张）
 *  2. 点父夹 → 网格出现 2 张文件夹卡片（名称/计数正确）+ 父夹直属素材
 *  3. 双击子夹卡片进入该文件夹（网格只剩子夹素材、无卡片——它没有子级）
 *  4. 回父夹 → 卡片仍在
 *  5. 开「显示子文件夹内容」→ 卡片消失，后代素材全部出现（拍平语义、分页池取数）
 *  6. 关开关 → 卡片恢复、只剩父夹直属素材
 *
 * 判别核心在第 2/5 步：卡片数据与素材池分属两条链路（childFolders / folderPhotos），
 * 计数徽标错口径（含后代）、拍平池错依赖 allPhotos 分页累积池，这里必红。
 *
 * 用法：pnpm build && pnpm exec playwright test e2e/folder-cards.spec.mjs
 */
import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN_ENTRY = join(ROOT, 'out/main/index.js')
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
const IMG = (name) => join(ROOT, 'e2e', 'fixtures', 'ai-probe', 'img', name)

const PARENT = '父夹'
const CHILD_A = '子夹甲'
const CHILD_B = '子夹乙'
/** 父直属 1 张；每个子夹各 2 张（计数徽标判别：直属口径，不含后代） */
const PARENT_IMG = 'bread.png'
const A_IMGS = ['cats.jpg', 'pikachu.png']
const B_IMGS = ['moraine-lake.png', 'sam-car.png']
const ALL_IMGS = [PARENT_IMG, ...A_IMGS, ...B_IMGS]

let app = null
let userDataDir = null
let libraryDir = null

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function launch() {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    launchOptions: { env }
  })
  let page = null
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline && !page) {
    for (const w of app.windows()) {
      try {
        if (/本地工具箱|Leaf/.test(await w.title())) page = w
      } catch {
        /* 窗口还在开 */
      }
    }
    if (!page) await new Promise((r) => setTimeout(r, 200))
  }
  if (!page) throw new Error('主窗口没起来')
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
}

/** 网格里当前可见素材卡的文件名集合（顺序不敏感；只认已知名，避开卡片噪音） */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function visibleNames(page) {
  const texts = await page.locator('[data-photo-id]').allInnerTexts()
  const names = []
  for (const t of texts) {
    const hit = ALL_IMGS.find((n) => t.split('\n').some((l) => l.trim() === n))
    if (hit) names.push(hit)
  }
  return [...new Set(names)].sort()
}

/** 网格顶部文件夹卡片的 { 名称 → 计数 } 映射 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function folderCards(page) {
  const cards = page.locator('[data-folder-card]')
  const out = {}
  const n = await cards.count()
  for (let i = 0; i < n; i++) {
    const el = cards.nth(i)
    out[await el.getAttribute('data-folder-name')] = Number(
      await el.getAttribute('data-folder-count')
    )
  }
  return out
}

/** 点侧栏树行进入文件夹（openItem 同款入口） */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function openFolderFromSidebar(page, name) {
  await page.locator('aside button', { hasText: name }).first().click()
  await page.waitForTimeout(300)
}

test('子文件夹卡片：显示/双击进入/拍平开关联动', async () => {
  test.setTimeout(240_000)
  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-folder-cards-user-'))
  libraryDir = mkdtempSync(join(tmpdir(), 'leaf-folder-cards-lib-'))
  mkdirSync(join(libraryDir, 'images'), { recursive: true })
  // 预置非 legacy 库（不预置时启动走 userData 旧布局，网格停在空状态面板——真机踩过）
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

  try {
    const page = await launch()

    // ── 第 1 步 · 导入真图 + 建父夹/两个子夹 + 分配 ──
    const photos = await page.evaluate(
      async (paths) => {
        const ids = []
        for (const p of paths) {
          const rows = await window.api.photos.importPaths([p])
          ids.push(rows[0].id)
        }
        return ids
      },
      ALL_IMGS.map((n) => IMG(n))
    )
    expect(photos, JSON.stringify(photos)).toHaveLength(5)

    const ids = await page.evaluate(async () => {
      const parent = await window.api.photos.createPhotoFolder('父夹', null)
      const a = await window.api.photos.createPhotoFolder('子夹甲', parent.id)
      const b = await window.api.photos.createPhotoFolder('子夹乙', parent.id)
      return { parent: parent.id, a: a.id, b: b.id }
    })
    // 分配：父直属 1 张（bread），子夹甲/乙各 2 张
    await page.evaluate(
      async (ctx) => {
        await window.api.photos.assignPhotosToFolder(ctx.ids.parent, [ctx.photos[0]])
        await window.api.photos.assignPhotosToFolder(ctx.ids.a, [ctx.photos[1], ctx.photos[2]])
        await window.api.photos.assignPhotosToFolder(ctx.ids.b, [ctx.photos[3], ctx.photos[4]])
      },
      { ids, photos }
    )

    // IPC 直导不触发渲染层池子刷新 → reload 走真实用户路径
    await page.reload()
    await page.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'), undefined, {
      timeout: 25_000
    })

    // ── 第 2 步 · 点父夹：2 张卡片（名称/计数=直属口径）+ 父夹直属素材 ──
    await openFolderFromSidebar(page, PARENT)
    await expect
      .poll(() => folderCards(page), { timeout: 20_000 }, '父夹视图必须出现 2 张子文件夹卡片')
      .toEqual({ [CHILD_A]: 2, [CHILD_B]: 2 })
    await expect
      .poll(() => visibleNames(page), { timeout: 20_000 }, '父夹直属素材（bread.png）必须出现')
      .toEqual([PARENT_IMG])

    // ── 第 3 步 · 双击子夹卡片进入：只剩子夹素材、无卡片（它没有子级）──
    await page.locator(`[data-folder-card][data-folder-name="${CHILD_A}"]`).dblclick()
    await page.waitForTimeout(400)
    await expect
      .poll(() => folderCards(page), { timeout: 20_000 }, '子夹甲无子级，不得有卡片')
      .toEqual({})
    await expect.poll(() => visibleNames(page), { timeout: 20_000 }).toEqual([...A_IMGS].sort())

    // ── 第 4 步 · 回父夹：卡片仍在 ──
    await openFolderFromSidebar(page, PARENT)
    await expect
      .poll(() => folderCards(page), { timeout: 20_000 })
      .toEqual({
        [CHILD_A]: 2,
        [CHILD_B]: 2
      })

    // ── 第 5 步 · 开「显示子文件夹内容」：卡片消失，后代素材全部出现（拍平）──
    await page.getByRole('button', { name: '布局与显示选项' }).click()
    await page.getByRole('switch', { name: '显示子文件夹内容' }).click()
    await expect
      .poll(() => folderCards(page), { timeout: 20_000 }, '拍平语义下卡片必须隐藏')
      .toEqual({})
    await expect
      .poll(() => visibleNames(page), { timeout: 20_000 }, '父夹 ∪ 后代素材必须全部出现')
      .toEqual([...ALL_IMGS].sort())
    await page.getByRole('button', { name: '布局与显示选项' }).click() // 收弹层

    // ── 第 6 步 · 关开关：卡片恢复、回到父夹直属 ──
    await page.getByRole('button', { name: '布局与显示选项' }).click()
    await page.getByRole('switch', { name: '显示子文件夹内容' }).click()
    await expect
      .poll(() => folderCards(page), { timeout: 20_000 }, '关掉拍平后卡片必须恢复')
      .toEqual({ [CHILD_A]: 2, [CHILD_B]: 2 })
    await expect.poll(() => visibleNames(page), { timeout: 20_000 }).toEqual([PARENT_IMG])
  } finally {
    await closeApp()
    for (const d of [userDataDir, libraryDir]) if (d) rmSync(d, { recursive: true, force: true })
  }
})
