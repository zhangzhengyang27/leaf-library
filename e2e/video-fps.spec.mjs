/**
 * P1 · 视频实测帧率 + 同目录字幕 真机验收
 *
 * 单测能证明解析与匹配，证不了这三件事，所以必须有这条：
 *  1. `ffmpeg -i` 的真实 stderr 里那个 fps 正则真的取得到（样本是我手写的）；
 *  2. 帧率从处理管线一路走到**渲染进程的那个按钮**（中间隔着 SELECT *、fromRow、
 *     IPC 序列化、preload、Vue props —— 任一处漏字段都会静默回落成 30）；
 *  3. 字幕走 blob: URL 喂 `<track>` 在真 Chromium 里被 CSP 放行、cue 真解析出来
 *     （这是"渲染层验证盲区"里最容易假绿灯的一类）。
 *
 * 素材是现场用随包的 ffmpeg 合成的（不下载任何东西）：24fps 与 29.97fps 各一条，
 * 两条只差帧率，正好把"硬编码 1/30"和"按实测"区分开。
 * 字幕文件只放在**原始目录**不放库内 —— copy 模式入库后视频在库里、字幕还在外面，
 * 这一步同时验的是 source_path 那条回落。
 *
 * 用法：pnpm build && pnpm exec playwright test e2e/video-fps.spec.mjs
 */
import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN_ENTRY = join(ROOT, 'out/main/index.js')
const require = createRequire(join(ROOT, 'package.json'))
const ffmpegPath = (() => {
  try {
    return require('@ffmpeg-installer/ffmpeg').path
  } catch {
    return ''
  }
})()

let app = null
let userDataDir = null
let libraryDir = null
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

/** 素材目录要在合成之前建好（makeClip 直接往里写） */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
function newAssetsDir() {
  assetsDir = mkdtempSync(join(tmpdir(), 'leaf-fps-assets-'))
  return assetsDir
}

/** 合成一条纯色测试片：只有帧率不同 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
function makeClip(name, rate) {
  const out = join(assetsDir, name)
  execFileSync(
    ffmpegPath,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `testsrc=size=160x120:rate=${rate}:duration=3`,
      '-r',
      String(rate),
      '-pix_fmt',
      'yuv420p',
      out
    ],
    { timeout: 60_000 }
  )
  return out
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function launchModern() {
  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-fps-e2e-'))
  libraryDir = mkdtempSync(join(tmpdir(), 'leaf-fps-lib-'))
  mkdirSync(join(libraryDir, 'images'), { recursive: true })
  // 非 legacy 库：copy 模式入库，才会出现"视频在库内、字幕在库外"的真实形态
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
  for (const d of [userDataDir, libraryDir, assetsDir]) {
    if (d) rmSync(d, { recursive: true, force: true })
  }
}

/**
 * 按文件名后缀找 id。
 * copy 模式下库内文件会被改名成 `<uuid8>_c24.mp4`，等值匹配会找不到。
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
const idOf = async (page, fileName) =>
  page.evaluate(
    async (name) =>
      window.api.photos
        .getByDateSection()
        .then((s) => s.flatMap((x) => x.photos).find((p) => p.fileName.endsWith(name))?.id ?? ''),
    fileName
  )

test('管线把实测帧率写进库：24 与 29.97 各归各（不是同一个常数）', async () => {
  test.setTimeout(240_000)
  if (!ffmpegPath || !existsSync(ffmpegPath)) throw new Error('找不到随包 ffmpeg')
  newAssetsDir()
  const clip24 = makeClip('c24.mp4', 24)
  const clipNtsc = makeClip('cntsc.mp4', '30000/1001')
  const page = await launchModern()
  try {
    await page.evaluate(async (p) => await window.api.photos.importPaths([p]), clip24)
    await page.evaluate(async (p) => await window.api.photos.importPaths([p]), clipNtsc)
    const id24 = await idOf(page, 'c24.mp4')
    const idNtsc = await idOf(page, 'cntsc.mp4')
    expect(id24).not.toBe('')
    expect(idNtsc).not.toBe('')

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
    const fpsOf = (id) =>
      page.evaluate(async (pid) => window.api.photos.getById(pid).then((x) => x?.fps ?? -1), id)
    // 处理管线是异步的：先等缩略图完成（fps 与时长在同一次探测里写回）
    await expect
      .poll(
        () =>
          // 两条视频是并发处理的（队列 concurrency=2）：只等第一条会把第二条甩在后面
          page.evaluate(
            async (ids) =>
              (await Promise.all(ids.map((i) => window.api.photos.getById(i))))
                .map((x) => `${x?.thumbStatus ?? -1}|${x?.fps ?? '-'}`)
                .join(' '),
            [id24, idNtsc]
          ),
        { timeout: 90_000, intervals: [1000] }
      )
      .toBe('1|24 1|29.97')
    expect(await fpsOf(id24)).toBe(24)
    expect(await fpsOf(idNtsc)).toBe(29.97)
  } finally {
    await closeApp()
  }
})

test('帧率一路走到预览按钮，字幕在真 Chromium 里解析出 cue', async () => {
  test.setTimeout(240_000)
  if (!ffmpegPath || !existsSync(ffmpegPath)) throw new Error('找不到随包 ffmpeg')
  newAssetsDir()
  const clip = makeClip('c24.mp4', 24)
  // 字幕只放在原始目录：视频 copy 进库后，同目录找不到，得靠 source_path 回落
  writeFileSync(
    join(assetsDir, 'c24.zh.srt'),
    `1
00:00:00,500 --> 00:00:01,500
你好，世界

2
00:00:02,000 --> 00:00:02,600
第二条
`
  )
  const page = await launchModern()
  try {
    // 开 copy 模式：视频会被搬进库内，字幕文件留在外面 —— 下面断言的就是这条回落
    await page.evaluate(async () => await window.api.storage.setMode('copy'))
    await page.evaluate(async (p) => await window.api.photos.importPaths([p]), clip)
    const id = await idOf(page, 'c24.mp4')
    await expect
      .poll(
        () =>
          page.evaluate(
            async (pid) => window.api.photos.getById(pid).then((x) => x?.thumbStatus ?? -1),
            id
          ),
        { timeout: 90_000, intervals: [1000] }
      )
      .toBe(1)

    // ① 主进程侧：视频确实在库内（copy 生效），而字幕轨仍按 source_path 找得到
    const storedPath = await page.evaluate(
      async (pid) => window.api.photos.getById(pid).then((x) => x?.filePath ?? ''),
      id
    )
    expect(storedPath.startsWith(libraryDir)).toBe(true)
    const tracks = await page.evaluate(async (pid) => window.api.video.subtitles(pid), id)
    expect(tracks).toHaveLength(1)
    expect(tracks[0].label).toBe('zh')
    expect(tracks[0].srclang).toBe('zh')
    expect(tracks[0].isDefault).toBe(true)
    expect(tracks[0].vtt.startsWith('WEBVTT')).toBe(true)
    expect(tracks[0].vtt).toContain('00:00:00.500 --> 00:00:01.500')

    // ② 渲染层：双击卡片进预览，<video> 挂上轨且 cue 真被解析（CSP 放行 blob:）
    const card = page.locator('[data-photo-id]').filter({ hasText: 'c24.mp4' }).first()
    await card.waitFor({ timeout: 20_000 })
    await card.dblclick()
    await page.waitForFunction(() => !!document.querySelector('.fixed video'), undefined, {
      timeout: 20_000
    })
    // 视频元素是 autoplay + 原生 controls，先暂停免得步进被播放推进打断
    await page.evaluate(() => {
      document.querySelector('.fixed video')?.pause()
    })
    // 预览弹层里的 video：网格里 HoverPreview 也挂了一个 <video>，
    // 不加 .fixed 限定会摸到那个没字幕的（真机踩过，别改回去）
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const v = document.querySelector('.fixed video')
            return v ? v.textTracks.length : -1
          }),
        { timeout: 20_000, intervals: [500] }
      )
      .toBe(1)

    // cue 解析要等 track 元素加载完；mode 由 default 属性置为 showing
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const t = document.querySelector('.fixed video')?.textTracks?.[0]
            return t ? (t.cues?.length ?? -1) : -1
          }),
        { timeout: 20_000, intervals: [500] }
      )
      .toBe(2)

    // ③ 逐帧步进按实测帧率：按钮上写着 1/24s，步进落点必须是 1/24 的整数倍
    const back = page.locator('button[title^="后退一帧"]')
    const fwd = page.locator('button[title^="前进一帧"]')
    await expect(back).toHaveAttribute('title', /1\/24s/)
    await expect(fwd).toHaveAttribute('title', /1\/24s/)
    const delta = await page.evaluate(async () => {
      const v = document.querySelector('.fixed video')
      v.currentTime = 0
      await new Promise((r) => setTimeout(r, 150))
      const btn = Array.from(document.querySelectorAll('button')).find((b) =>
        (b.title || '').startsWith('前进一帧')
      )
      btn.click()
      await new Promise((r) => setTimeout(r, 250))
      return v.currentTime
    })
    // 1/24 = 0.041667；旧的硬编码 1/30 = 0.033333（Chromium 会把 seek 吸附到最近帧，
    // 所以这里断言的是"落在帧格点上"，配合上面那条 title 才能双双锁死）
    expect(Math.abs(delta - 1 / 24)).toBeLessThan(0.006)
  } finally {
    await closeApp()
  }
})
