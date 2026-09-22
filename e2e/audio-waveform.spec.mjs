/**
 * P1 · 音频波形 + BPM 真机验收
 *
 * 单测证不了这四件事，所以必须有这条：
 *  1. **波形真的落库并回到渲染层**：400 个峰值走 BLOB → better-sqlite3 的 Buffer →
 *     structuredClone → Vue props，任一环把 Uint8Array 当成对象序列化都会变成空数组；
 *  2. **BPM 从 ffmpeg 解码的裸 PCM 算出来**（合成的 120 BPM 节拍轨，实测落在 [110,130]）；
 *  3. **播放条在真 Chromium 里能播**：组件里的 `<audio>` 不带原生控件、只占 1px，
 *     这种写法正好落在「display:none 的媒体元素不加载」这条 Chromium 约束的边上，
 *     必须让 currentTime 真的往前走才算数；
 *  4. **点波形 = seek**：指针落在 75% 处，currentTime 要落到时长的 3/4 附近。
 *
 * 节拍轨用随包 ffmpeg 现做（不下载任何东西）：440 Hz 正弦 × 每 0.5 s 一次指数衰减包络
 * = 120 BPM 的"咔"声。
 *
 * 用法：pnpm build && pnpm exec playwright test e2e/audio-waveform.spec.mjs
 */
import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// LEAF_MAIN_ENTRY：让它能指向另一份构建产物（对账/回归时用，例如 21:22 的构建快照）
const MAIN_ENTRY = process.env['LEAF_MAIN_ENTRY'] ?? join(ROOT, 'out/main/index.js')
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

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function launch() {
  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-wave-e2e-'))
  libraryDir = mkdtempSync(join(tmpdir(), 'leaf-wave-lib-'))
  mkdirSync(join(libraryDir, 'images'), { recursive: true })
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

/**
 * 只删本用例自己 mkdtemp 出来的目录，且必须在 os.tmpdir() 下面、带我们的前缀。
 *
 * 护栏是有原因的：昨天这条用例的清理函数写成 `dirname×4(MAIN_ENTRY)`，
 * MAIN_ENTRY 指向 out/main/index.js 时那四层正好等于 `~/Desktop` ——
 * recursive+force 把整个桌面删了（详见 ~/Desktop/_恢复报告-2026-09-22.md）。
 * 所以这里不用裸 rmSync：路径不合规则直接抛，宁可留一堆临时目录也不猜。
 */
const TMP = realpathSync(tmpdir())
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
function removeScratchDir(dir) {
  if (!dir) return
  const abs = realpathSync(dir)
  const ours = /^leaf-(wave|probe)-/.test(basename(abs))
  if (!abs.startsWith(TMP + '/') || !ours) {
    throw new Error(`拒绝删除非常规临时目录：${abs}（应为 ${TMP} 下 leaf-wave-* 之类的目录）`)
  }
  rmSync(abs, { recursive: true, force: true })
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function closeApp() {
  if (app) await app.close()
  app = null
  for (const d of [userDataDir, libraryDir, assetsDir]) removeScratchDir(d)
  // 必须清空：否则下一个 test 的 makeClickTrack 往已删掉的目录里写，
  // ffmpeg 报 "No such file or directory"（真踩过，第二条用例因此假失败）
  userDataDir = libraryDir = assetsDir = null
}

/** 每 0.5 s 一次衰减音 = 120 BPM */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
function makeClickTrack(name) {
  assetsDir = mkdtempSync(join(tmpdir(), 'leaf-wave-assets-'))
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
      // 转义给 ffmpeg 的滤镜解析器：表达式里的逗号不是参数分隔符
      `aevalsrc=0.9*sin(2*PI*440*t)*exp(-13*mod(t\\,0.5)):d=6`,
      '-ac',
      '2',
      '-ar',
      '44100',
      out
    ],
    { timeout: 60_000 }
  )
  return out
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
const idOf = async (page, fileName) =>
  page.evaluate(
    async (name) =>
      window.api.photos
        .getByDateSection()
        .then((s) => s.flatMap((x) => x.photos).find((p) => p.fileName.endsWith(name))?.id ?? ''),
    fileName
  )

test('波形与 BPM 落库并回到 IPC：400 峰 + 120 BPM ±10', async () => {
  test.setTimeout(240_000)
  if (!ffmpegPath || !existsSync(ffmpegPath)) throw new Error('找不到随包 ffmpeg')
  const track = makeClickTrack('click-120.m4a')
  const page = await launch()
  try {
    await page.evaluate(async (p) => await window.api.photos.importPaths([p]), track)
    const id = await idOf(page, 'click-120.m4a')
    expect(id).not.toBe('')
    await expect
      .poll(
        () =>
          page.evaluate(
            async (pid) => {
              const facts = await window.api.audio.waveform(pid)
              return `${facts?.peaks?.length ?? -1}|${facts?.bpm ?? '-'}`
            },
            id
          ),
        { timeout: 90_000, intervals: [1000] }
      )
      .toMatch(/^400\|\d+$/)
    const facts = await page.evaluate(async (pid) => window.api.audio.waveform(pid), id)
    expect(facts.peaks).toHaveLength(400)
    // 节拍轨不是静音：最大格归一化成 255，且"咔"之间确实落回去。
    // 阈值是量出来的（6 s / 400 格 = 每格 15 ms，12 声咔占三十来格；AAC 编码把噪声底
    // 抬到了 10/255 以上，所以"安静格"实测 187 而不是 380）——断的是包络有起伏，
    // 不是"其它全是零"。
    expect(Math.max(...facts.peaks)).toBe(255)
    expect(facts.peaks.filter((v) => v > 60).length).toBeGreaterThanOrEqual(8)
    expect(facts.peaks.filter((v) => v < 10).length).toBeGreaterThan(100)
    expect(facts.bpm).not.toBeNull()
    expect(facts.bpm).toBeGreaterThanOrEqual(110)
    expect(facts.bpm).toBeLessThanOrEqual(130)
    expect(facts.durationMs).toBeGreaterThan(5_000)
    expect(facts.durationMs).toBeLessThan(7_000)
  } finally {
    await closeApp()
  }
})

test('预览里的波形条能播、能点着 seek', async () => {
  test.setTimeout(240_000)
  if (!ffmpegPath || !existsSync(ffmpegPath)) throw new Error('找不到随包 ffmpeg')
  const track = makeClickTrack('click-120.m4a')
  const page = await launch()
  try {
    await page.evaluate(async (p) => await window.api.photos.importPaths([p]), track)
    const id = await idOf(page, 'click-120.m4a')
    await expect
      .poll(
        () =>
          page.evaluate(
            async (pid) => (await window.api.audio.waveform(pid))?.peaks?.length ?? -1,
            id
          ),
        { timeout: 90_000, intervals: [1000] }
      )
      .toBe(400)
    await page.reload({ waitUntil: 'domcontentloaded' })
    const card = page.locator('[data-photo-id]').filter({ hasText: 'click-120.m4a' }).first()
    await card.waitFor({ timeout: 20_000 })
    await card.dblclick()
    const canvas = page.locator('.fixed canvas[data-waveform]')
    await canvas.waitFor({ timeout: 20_000 })

    // ① 组件里那个「不带 controls、1px 透明」的 <audio> 在真 Chromium 里确实出声。
    //    这条是本用例存在的理由：UA 样式表把 `audio:not([controls])` 定成 display:none，
    //    而 display:none 的媒体元素根本不发起加载（实测 readyState 0 + MediaError 4，
    //    点播放永远 0）——只改 CSS 类不改 display 的话，界面全对但一声不响。
    const play = page.locator('.fixed button[aria-label="播放"]')
    await expect(play).toHaveCount(1)
    await play.click()
    try {
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const a = document.querySelector('.fixed audio')
              return a ? a.currentTime : -1
            }),
          { timeout: 20_000, intervals: [300] }
        )
        .toBeGreaterThan(0.15)
    } catch (err) {
      // 失败时把元素原始状态打出来：只报 "0" 分不清是没点着、没加载还是被谁暂停了
      console.log(
        'PLAYFAIL ' +
          JSON.stringify(
            await page.evaluate(async () => {
              const a = document.querySelector('.fixed audio')
              return {
                audio: a
                  ? {
                      t: a.currentTime,
                      rs: a.readyState,
                      paused: a.paused,
                      err: a.error?.code ?? null,
                      disp: getComputedStyle(a).display,
                      src: a.src,
                      // 协议层回执：404 与「解码器不认」要分开看（/private 那条坑就是这么抓到的）
                      http: a ? await fetch(a.src).then((r) => `${r.status}/${r.headers.get('content-type')}`) : null
                    }
                  : null,
                playBtns: [...document.querySelectorAll('.fixed button[aria-label="播放"]')].length,
                toast: /应用内播放失败/.test(document.querySelector('.fixed')?.innerText ?? ''),
                // 页面不可见时 Chromium 会挂起媒体加载（fetch 不受影响），
                // 这条就是用来把"环境不给看"和"代码坏了"分开的
                blobPlay: await (async () => {
                  const b = await (await fetch(a.src)).blob()
                  const el = new Audio(URL.createObjectURL(b))
                  el.controls = true
                  document.body.appendChild(el)
                  let j = 'ok'
                  try { await el.play() } catch (e) { j = e.name }
                  await new Promise((x) => setTimeout(x, 900))
                  const o = `${j} t=${el.currentTime.toFixed(2)} ${b.type}/${b.size}B`
                  el.pause(); el.remove()
                  return o
                })(),
                visibility: document.visibilityState,
                hasFocus: document.hasFocus()
              }
            })
          )
      )
      throw err
    }
    const pause = page.locator('.fixed button[aria-label="暂停"]')
    await expect(pause).toHaveCount(1)
    await pause.click()
    await expect
      .poll(() => page.evaluate(() => !!document.querySelector('.fixed audio')?.paused))
      .toBe(true)

    // ② 点波形 75% 处 = seek 到 3/4 时长
    const box = await canvas.boundingBox()
    const durRaw = await page.evaluate(() => document.querySelector('.fixed audio').duration)
    // 元素报不出时长时（部分容器 NaN）组件回落库里探测到的 durationMs，断言同口径
    const dur =
      Number.isFinite(durRaw) && durRaw > 0
        ? durRaw
        : (await page.evaluate(async (pid) => (await window.api.audio.waveform(pid))?.durationMs, id)) /
          1000
    console.log(`WAVE 元素时长=${durRaw} · 用于换算的时长=${dur}`)
    await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2)
    const after = await page.evaluate(() => document.querySelector('.fixed audio').currentTime)
    expect(after / dur).toBeGreaterThan(0.68)
    expect(after / dur).toBeLessThan(0.82)

    // ③ BPM 显示在播放条上（估算值带"≈"，不装作是准的）
    await expect(page.locator('.fixed [title^="节拍估计"]')).toHaveCount(1)
  } finally {
    await closeApp()
  }
})
