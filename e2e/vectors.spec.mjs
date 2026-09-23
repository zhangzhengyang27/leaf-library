/**
 * G1 · 图文向量档真机验收（Chinese-CLIP：中文文搜图 + 找相似第二档 + 语义档下推）
 *
 * 单测只能证明服务本身能跑；这条走打包产物里的完整链路：
 * out/main 里注册的 vectors:* 通道、preload 暴露的 window.api.vectors、m021 建表、
 * indexAll 写库、vectors:search 的阈值行为、semanticIds 进 getPage 的 SQL 谓词，
 * 最后是搜索框开 AI 语义档真打中文看网格。
 * 少任何一环都会在这里红（尤其"d.ts 写了但 preload 没实现"这类只有真跑才暴露的）。
 *
 * 模型不下载：从 LEAF_MODEL_DIR（或 /tmp/cc-probe）把 model.onnx + tokenizer.json
 * 复制进独立的 userData，并在原位写 .ready —— 这同时验证了"ready 标记由 warm-up 打"
 * 这个约定：只放模型文件不放标记时，服务必须认"未就绪"、一条向量都不建。
 *
 * 评测图用真照片（/tmp/ai-probe/img，探针那批）：抽象色块对这座模型的文本侧不判别，
 * 拿它断言"搜到了"只会得到假阳性。
 *
 * 用法：
 *   pnpm build
 *   pnpm exec playwright test e2e/vectors.spec.mjs
 *   LEAF_VECTORS_NO_READY=1 … 只跑"未就绪"那一档
 */

import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN_ENTRY = join(ROOT, 'out/main/index.js')
const MODEL_ID = 'chinese-clip-vit-b-16'
// 同一条理由：探针图放 /tmp 等于把判据寄存在会被清的目录里，仓库内路径优先
const PHOTO_SRC =
  [join(ROOT, 'e2e', 'fixtures', 'ai-probe', 'img'), '/tmp/ai-probe/img'].find((d) =>
    existsSync(d)
  ) ?? join(ROOT, 'e2e', 'fixtures', 'ai-probe', 'img') // 都不在时指向仓库内路径，让下面的闸安静 skip

// 模型两件套的来源，与 ClipEmbeddingService.model.test.ts 同一条序：
// LEAF_MODEL_DIR → 应用自己下载的落点 → 探针目录。只认 /tmp 的话，
// 模型装好了这条电池也永远静默 skip（09-22 之后就是这状态）。
const MODEL_CANDIDATES = [
  process.env.LEAF_MODEL_DIR ?? '',
  join(
    homedir(),
    process.platform === 'darwin'
      ? 'Library/Application Support/leaf-library'
      : process.platform === 'win32'
        ? 'AppData/Roaming/leaf-library'
        : '.config/leaf-library',
    'models',
    MODEL_ID
  ),
  '/tmp/cc-probe',
  '/tmp/jina-text-probe'
].filter(Boolean)
const modelDir = MODEL_CANDIDATES.find(
  (d) => existsSync(join(d, 'model.onnx')) && existsSync(join(d, 'tokenizer.json'))
)
const haveModel = Boolean(modelDir)
const PHOTOS = ['cats.jpg', 'bread.png', 'pikachu.png', 'moraine-lake.png']
/** 库外查询图：一张暹罗猫（Oxford-IIIT Pets class 33），库里没有它，只能靠语义命中 */
const EXT_CAT =
  [join(ROOT, 'e2e', 'fixtures', 'ai-probe', 'ext-cat.webp'), '/tmp/ai-probe/ext-cat.webp'].find(
    (f) => existsSync(f)
  ) ?? join(ROOT, 'e2e', 'fixtures', 'ai-probe', 'ext-cat.webp')
const havePhotos = PHOTOS.every((f) => existsSync(join(PHOTO_SRC, f))) && existsSync(EXT_CAT)

const withMarker = process.env.LEAF_VECTORS_NO_READY !== '1'

let app = null
let userDataDir = null
let assetsDir = null

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

test.skip(!(haveModel && havePhotos), '缺 Chinese-CLIP 模型或评测照片（见文件头注释）')

/**
 * 打开搜索范围面板。˅ 是开关式的：焦点一进输入框面板就关，
 * 再点一次反而把它关掉——所以点开之后必须验一下按钮可不可见，不可见就再点一次。
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function openScopePanel(page) {
  await page.getByLabel('搜索范围').click()
  const btn = page.getByRole('button', { name: /AI 语义/ })
  try {
    await btn.waitFor({ state: 'visible', timeout: 2000 })
  } catch {
    await page.getByLabel('搜索范围').click()
    await btn.waitFor({ state: 'visible', timeout: 5000 })
  }
}

test.beforeAll(async () => {
  if (!existsSync(MAIN_ENTRY)) throw new Error(`缺产物 ${MAIN_ENTRY}：先跑 pnpm build`)
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-vectors-e2e-'))
  assetsDir = mkdtempSync(join(tmpdir(), 'leaf-vectors-assets-'))

  // 先把两件套摆进这个库的 userData，再起进程（避免测试等 754MB 下载）
  const dst = join(userDataDir, 'models', MODEL_ID)
  mkdirSync(dst, { recursive: true })
  copyFileSync(join(modelDir, 'model.onnx'), join(dst, 'model.onnx'))
  copyFileSync(join(modelDir, 'tokenizer.json'), join(dst, 'tokenizer.json'))
  if (withMarker) writeFileSync(join(dst, '.ready'), JSON.stringify({ at: Date.now() }))

  // 素材：4 张真照片 + 1 张 cats 的 jpeg 重编码变体（"同一张图的轻微扰动"）
  const files = []
  for (const f of PHOTOS) {
    copyFileSync(join(PHOTO_SRC, f), join(assetsDir, f))
    files.push(join(assetsDir, f))
  }
  await sharp(join(PHOTO_SRC, 'cats.jpg'))
    .resize({ width: 640, height: 640, fit: 'cover' })
    .jpeg({ quality: 72 })
    .toFile(join(assetsDir, 'cats-variant.jpg'))
  files.push(join(assetsDir, 'cats-variant.jpg'))

  app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    launchOptions: { env }
  })
  const page = await getMainWindow()
  await page.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'), undefined, {
    timeout: 20_000
  })
  await page.evaluate(async () => {
    if (window.api?.preferences?.setOnboardingCompleted) {
      await window.api.preferences.setOnboardingCompleted()
    }
  })

  for (const f of files) {
    // evaluate 的第二个实参就是页面函数的唯一入参，不能再包一层数组
    await page.evaluate(async (p) => await window.api.photos.importPaths([p]), f)
  }
  // 索引只收 thumb_status=1 的素材，先等后台处理管线把它们都做完
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.api.photos
            .getByDateSection()
            .then((s) => s.flatMap((x) => x.photos).filter((p) => p.thumbStatus === 1).length)
        ),
      { timeout: 60_000, intervals: [1000] }
    )
    .toBe(files.length)
}, 300_000)

test.afterAll(async () => {
  if (app) await app.close()
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  if (assetsDir) rmSync(assetsDir, { recursive: true, force: true })
})

test('vectors:status 贯通 preload，ready 判定认 .ready 标记', async () => {
  const page = await getMainWindow()
  const s = await page.evaluate(() => window.api.vectors.status())
  expect(s.installed).toBe(true)
  expect(s.ready).toBe(withMarker)
  expect(s.modelId).toBe(MODEL_ID)
  expect(s.bytesOnDisk).toBeGreaterThan(100_000_000)
  // 入库即建向量（AssetProcessingService 的 G1 钩子）：模型就绪时走到这里 5 张应当
  // 已经有向量了，不需要用户先手动"建索引"。兜住"钩子接了但没生效"这种最隐蔽的失效。
  // 反证同样要紧：没有 .ready 标记时钩子必须一条都不建，否则"未下载"的判定形同虚设。
  expect(s.indexed).toBe(withMarker ? 5 : 0)
  expect(s.pending).toBe(withMarker ? 0 : 5)
})

test('indexAll 写库后，找相似把"jpeg 重编码变体"排在所有别的图之前', async () => {
  test.skip(!withMarker, '无 .ready 标记时这一档本就该不可用，由上一条测试断言')
  const page = await getMainWindow()
  await page.evaluate(() => window.api.vectors.clearVectors())
  expect(await page.evaluate(() => window.api.vectors.status().then((x) => x.indexed))).toBe(0)
  const started = await page.evaluate(() => window.api.vectors.indexAll(true))
  expect(started.ok).toBe(true)

  await expect
    .poll(() => page.evaluate(() => window.api.vectors.status().then((x) => x.indexed)), {
      timeout: 180_000,
      intervals: [1000]
    })
    .toBe(5)

  const ids = await page.evaluate(() =>
    window.api.photos
      .getByDateSection()
      .then((s) => s.flatMap((x) => x.photos).map((p) => [p.fileName, p.id]))
  )
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
  const idOf = (name) => ids.find(([f]) => f === name)[1]

  const hits = await page.evaluate(
    async (id) => (await window.api.vectors.similar(id, 10)).map((h) => h.photo.fileName),
    idOf('cats.jpg')
  )
  expect(hits[0]).toBe('cats-variant.jpg')
  // 只断言排序，不断言"不相干的也得在列表里"：图像↔图像余弦的分布重叠
  // （同品种 p50=0.858 vs 跨品种 p50=0.743、max=0.958），绝对分数撑不起
  // "够不够像"的判定，这一档的语义就是"排在前面的几张"
  expect(hits.length).toBeGreaterThan(0)
  expect(hits).not.toContain('cats.jpg') // 自身被排除
})

test('中文文搜图：查询命中目标图，"池子里没有"的被阈值挡成空', async () => {
  test.skip(!withMarker, '向量档整体不可用')
  const page = await getMainWindow()
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
  const names = async (q, k) =>
    page.evaluate(
      async ([qq, kk]) => (await window.api.vectors.search(qq, kk)).map((h) => h.photo.fileName),
      [q, k]
    )

  // cats-variant.jpg 是同一只猫的 jpeg 重编码，它排在前面是"对"，不是"脏数据"
  expect(['cats.jpg', 'cats-variant.jpg']).toContain((await names('一只猫', 5))[0])
  expect((await names('面包房货架上的长条面包', 5))[0]).toBe('bread.png')
  expect((await names('雪山倒映在湖水里', 5))[0]).toBe('moraine-lake.png')

  // 判别性两半：命中侧必须带着 ≥0.40 的分数回来（证明阈值不是"永远返回空"的幌子），
  // 无命中侧必须空（证明阈值真的在挡，而不是给一张最接近的糊上去）。
  const hitScores = await page.evaluate(
    async () => (await window.api.vectors.search('一只猫', 5)).map((h) => h.score),
    []
  )
  expect(hitScores.length).toBeGreaterThan(0)
  expect(Math.min(...hitScores)).toBeGreaterThanOrEqual(0.4)
  expect(await names('一架黑色三角钢琴', 5)).toEqual([])
})

test('semanticIds 下推分页搜索：非空收窄、空集出零条、与维度筛选相与', async () => {
  test.skip(!withMarker, '向量档整体不可用')
  const page = await getMainWindow()
  const ids = await page.evaluate(() =>
    window.api.photos
      .getByDateSection()
      .then((s) => s.flatMap((x) => x.photos).map((p) => [p.fileName, p.id]))
  )
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
  const idOf = (name) => ids.find(([f]) => f === name)[1]

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
  const pageNames = async (filters) =>
    page.evaluate(
      async (f) =>
        (await window.api.photos.getPage({ view: 'search', filters: f, limit: 50 })).items.map(
          (p) => p.fileName
        ),
      filters
    )

  expect(await pageNames({ semanticIds: [idOf('cats.jpg')] })).toEqual(['cats.jpg'])
  // 空集 ≠ 没给：没给是整库，空集是"AI 判定无命中"
  expect(await pageNames({ semanticIds: [] })).toEqual([])
  expect((await pageNames({})).length).toBe(5)
  // 与关键词相与：语义命中集里再按名字筛
  expect(
    await pageNames({
      semanticIds: [idOf('cats.jpg'), idOf('bread.png')],
      searchKeyword: 'bread',
      searchScopes: ['name']
    })
  ).toEqual(['bread.png'])
  // 非 uuid 的 id 不能混进 IN
  expect(await pageNames({ semanticIds: ["1'; DROP TABLE photo_photos; --"] })).toEqual([])
  expect((await pageNames({})).length).toBe(5)
})

test('搜索框开 AI 语义档后打中文，网格只剩那张猫', async () => {
  test.skip(!withMarker, '开关在模型未就绪时是置灰的，由第一条测试覆盖')
  // 首次文本推理要把 754MB 会话装进内存，30s 默认超时会被它吃满
  test.setTimeout(180_000)
  const page = await getMainWindow()
  await page.reload()
  await page.waitForFunction(() => !!document.querySelector('[data-photo-id]'), undefined, {
    timeout: 30_000
  })
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
  const gridIds = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-photo-id]')).map((e) => e.dataset.photoId)
    )
  // 默认视图按导入序分页，5 张里 cats 与它的变体都在
  expect((await gridIds()).length).toBe(5)

  await openScopePanel(page)
  const toggle = page.getByRole('button', { name: /AI 语义/ })
  await expect(toggle).toBeEnabled({ timeout: 10_000 })
  await toggle.click()
  await page.fill('#library-search', '一只猫')
  const catIds = await page.evaluate(
    () =>
      window.api.photos.getByDateSection().then((s) =>
        s
          .flatMap((x) => x.photos)
          .filter((p) => p.fileName.startsWith('cats'))
          .map((p) => p.id)
      ),
    []
  )
  expect(catIds.length).toBe(2)
  // 猫与它的 jpeg 变体在 0.40 阈值边界上（实测一张过、一张差一点），所以断言"只剩猫"
  // 而不是"剩几张"。轮询条件必须带内容：只看数量会在搜索落地前假通过。
  await expect
    .poll(
      async () => {
        const ids = await gridIds()
        return ids.length > 0 && ids.every((id) => catIds.includes(id))
      },
      { timeout: 30_000, intervals: [500] }
    )
    .toBe(true)

  // 关掉档位必须回到关键词那一档：残留的语义 id 集继续收窄是最难查的脏状态
  await openScopePanel(page)
  await page.getByRole('button', { name: /AI 语义/ }).click()
  await page.fill('#library-search', 'pikachu')
  await expect
    .poll(async () => (await gridIds()).length, { timeout: 30_000, intervals: [500] })
    .toBe(1)
})

test('语义条件存进智能文件夹后仍能生效（存文本、每次求值现算向量）', async () => {
  test.skip(!withMarker, '向量档整体不可用')
  test.setTimeout(180_000)
  const page = await getMainWindow()
  const album = await page.evaluate(() =>
    window.api.photos.createSmartAlbum('e2e-语义条件', { semanticQuery: '一只猫' })
  )
  try {
    expect(album?.id).toBeTruthy()
    const names = await page.evaluate(
      async (id) => (await window.api.photos.getSmartAlbumPhotos(id)).map((p) => p.fileName),
      album.id
    )
    expect(names.length).toBeGreaterThan(0)
    expect(names.every((n) => n.startsWith('cats'))).toBe(true)

    // 存回来的必须是文本而不是某一次的 id 快照：否则模型重建后相册会永远空着
    const stored = await page.evaluate(
      async (id) =>
        (await window.api.photos.listSmartAlbums()).find((a) => a.id === id)?.rules ?? null,
      album.id
    )
    expect(stored.semanticQuery).toBe('一只猫')
    expect(Array.isArray(stored.semanticIds)).toBe(false)

    // 池子里没有的描述：fail-closed 出空，而不是"条件被忽略、整库都算命中"
    const none = await page.evaluate(async (id) => {
      await window.api.photos.updateSmartAlbum(id, {
        name: 'e2e-语义条件',
        rules: { semanticQuery: '一架黑色三角钢琴' }
      })
      return (await window.api.photos.getSmartAlbumPhotos(id)).length
    }, album.id)
    expect(none).toBe(0)
  } finally {
    if (album?.id) await page.evaluate((id) => window.api.photos.deleteSmartAlbum(id), album.id)
  }
})

test('以图搜库内：库外的一张猫图能命中库里的猫，路径不合法的一律空', async () => {
  test.skip(!withMarker, '向量档整体不可用')
  test.setTimeout(180_000)
  const page = await getMainWindow()
  const hits = await page.evaluate(
    async (p) => (await window.api.vectors.similarByImage(p, 5)).map((h) => h.photo.fileName),
    EXT_CAT
  )
  expect(hits.length).toBeGreaterThan(0)
  // 库里只有 cats.jpg 与它的 jpeg 变体是猫，命中必须落在这两张里
  expect(hits.slice(0, 2).every((n) => n.startsWith('cats'))).toBe(true)

  // 边界：目录 / 不存在的路径 / 非字符串，都不能进 readFileSync 也不能抛给渲染层
  const bad = await page.evaluate(async (dir) => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
    const one = async (v) => (await window.api.vectors.similarByImage(v, 3)).length
    return [await one(dir), await one(dir + '/nope-does-not-exist'), await one(12345)]
  }, assetsDir)
  expect(bad).toEqual([0, 0, 0])
})

test('topK 越界不会把全库捞走（IPC 边界钳位）', async () => {
  test.skip(!withMarker, '无 .ready 标记时向量档整体不可用')
  const page = await getMainWindow()
  const ids = await page.evaluate(() =>
    window.api.photos.getByDateSection().then((s) => s.flatMap((x) => x.photos).map((p) => p.id))
  )
  for (const k of [-5, 0, 1e9, 'abc']) {
    const n = await page.evaluate(
      async ([id, kk]) => (await window.api.vectors.similar(id, kk)).length,
      [ids[0], k]
    )
    expect(n).toBeLessThanOrEqual(4) // 库里 5 张，去掉自身最多 4 条
  }
})
