/**
 * 根因探针（一次性，跑完即删）：长 mp3 走 video:// 到底能不能播。
 *
 * 已确认的两件事把范围收窄了：
 *  - 6 s 的合成 m4a 走完整 UI 链路能播、能 seek（audio-waveform.spec.mjs 绿）；
 *  - 同一个字节的 blob: 永远秒播（AudioPlayer 的三级兜底）。
 * 剩下的问题是：用户那首 4 分钟的商业 mp3 偶发 MediaError 4 —— 差的是**时长/容器结构**
 * （ID3v2 + Xing + CBR 帧流）还是**协议响应形状**。所以这里做三组对照：
 *   A. 裸 <audio src="video://…">（不经过组件，没有兜底）
 *   B. 同 URL 的 fetch 回执（状态码 / content-type / 带 Range 的 206）
 *   C. 同字节 blob: 的 <audio>
 * 6 s 与 240 s、m4a 与 mp3 各一份，长的那份再走一遍真实 UI，看兜底是否被触发。
 *
 * 用法：pnpm exec playwright test e2e/.rootcause-audio.spec.mjs
 */
import { test } from 'playwright/test'
import { _electron as electron } from 'playwright'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN_ENTRY = process.env['LEAF_MAIN_ENTRY'] ?? join(ROOT, 'out/main/index.js')
const require = createRequire(join(ROOT, 'package.json'))
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path

let app = null
let userDataDir = null
let libraryDir = null
const assetsDir = mkdtempSync(join(tmpdir(), 'leaf-rootcause-assets-'))

const TMP = realpathSync(tmpdir())
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
function removeScratchDir(dir) {
  if (!dir) return
  const abs = realpathSync(dir)
  if (!abs.startsWith(TMP + '/') || !/^leaf-rootcause-/.test(basename(abs))) {
    throw new Error(`拒绝删除非常规临时目录：${abs}`)
  }
  rmSync(abs, { recursive: true, force: true })
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function launch() {
  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-rootcause-e2e-'))
  libraryDir = mkdtempSync(join(tmpdir(), 'leaf-rootcause-lib-'))
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
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    for (const w of app.windows()) {
      try {
        if (/本地工具箱|Leaf/.test(await w.title())) return w
      } catch {
        /* ignore */
      }
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  return app.firstWindow()
}

/**
 * 真素材形状的 mp3：ID3v2.3 + Xing/CBR + 标题元数据；秒数可给。
 * 240 s @192k ≈ 5.7 MB，跟用户那首的量级一致。
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
function makeAudio(name, seconds, codec, opts = {}) {
  const out = join(assetsDir, name)
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `aevalsrc=0.6*sin(2*PI*330*t)+0.3*sin(2*PI*660*t):d=${seconds}`,
    '-ac',
    '2',
    '-ar',
    '44100'
  ]
  if (codec === 'mp3') {
    args.push(
      opts.vbr ? '-q:a' : '-b:a',
      opts.vbr ? '2' : '192k',
      '-id3v2_version',
      '3',
      '-write_id3v1',
      '1',
      '-metadata',
      'title=The Sign',
      '-metadata',
      'artist=Ace Of Base',
      '-metadata',
      'album=The Collection'
    )
  } else {
    args.push('-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart')
  }
  execFileSync(ffmpegPath, [...args, out], { timeout: 180_000 })
  if (!opts.cover) return out
  /** 商业 mp3 的另一个结构特征：ID3v2 里塞一张 APIC 封面（把首个音频帧推后几十 KB） */
  const jpg = join(assetsDir, `${name}-cover.jpg`)
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
      'color=crimson:s=600x600:d=1',
      '-frames:v',
      '1',
      jpg
    ],
    { timeout: 60_000 }
  )
  const withCover = join(assetsDir, `${name}-tagged.mp3`)
  execFileSync(
    ffmpegPath,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      out,
      '-i',
      jpg,
      '-map',
      '0:a',
      '-map',
      '1:0',
      '-c',
      'copy',
      '-id3v2_version',
      '3',
      '-metadata:s:v',
      'title=Album cover',
      '-metadata:s:v',
      'comment=Cover (front)',
      withCover
    ],
    { timeout: 60_000 }
  )
  return withCover
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
const probe = async (page, url) =>
  page.evaluate(async (u) => {
    /** A. 裸元素：不带组件、没有兜底 */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- 页面内脚本
    const direct = await new Promise((resolve) => {
      const el = new Audio(u)
      el.controls = true
      document.body.appendChild(el)
      let playErr = 'ok'
      el.addEventListener('error', () => undefined)
      el.play()
        .then(() => undefined)
        .catch((e) => {
          playErr = `${e.name}`
        })
      setTimeout(() => {
        const o = {
          playErr,
          t: Number(el.currentTime.toFixed(2)),
          rs: el.readyState,
          ns: el.networkState,
          err: el.error ? `${el.error.code}/${el.error.message}` : null,
          dur: Number.isFinite(el.duration) ? Number(el.duration.toFixed(2)) : el.duration
        }
        el.pause()
        el.remove()
        resolve(o)
      }, 2500)
    })
    /** B. 协议回执：整份 + 带 Range */
    const r0 = await fetch(u)
    const b0 = await r0.arrayBuffer()
    const r1 = await fetch(u, { headers: { Range: 'bytes=0-1023' } })
    const b1 = await r1.arrayBuffer()
    const http = {
      get: `${r0.status}/${r0.headers.get('content-type')}/${r0.headers.get('accept-ranges')}/${b0.byteLength}`,
      range: `${r1.status}/${r1.headers.get('content-range')}/${b1.byteLength}`
    }
    /** C. 同字节 blob: */
    let blobErr = 'ok'
    const el2 = new Audio()
    el2.src = URL.createObjectURL(new Blob([b0], { type: r0.headers.get('content-type') || '' }))
    el2.controls = true
    document.body.appendChild(el2)
    await el2.play().catch((e) => {
      blobErr = e.name
    })
    await new Promise((r) => setTimeout(r, 1500))
    const blob = { blobErr, t: Number(el2.currentTime.toFixed(2)), rs: el2.readyState }
    el2.pause()
    el2.remove()
    /** D. file:// 直读同一路径（绕开协议层，看是不是自定义 scheme 本身的问题） */
    return { direct, http, blob }
  }, url)

test('长 mp3 / 短 mp3 / m4a 三份对照', async () => {
  test.setTimeout(420_000)
  if (!ffmpegPath || !existsSync(ffmpegPath)) throw new Error('找不到随包 ffmpeg')
  const files = [
    makeAudio('short.mp3', 6, 'mp3'),
    makeAudio('long.mp3', 240, 'mp3'),
    makeAudio('long.m4a', 240, 'm4a'),
    makeAudio('vbr.mp3', 60, 'mp3', { vbr: true }),
    makeAudio('cover-src.mp3', 60, 'mp3', { cover: true, vbr: true })
  ]
  const page = await launch()
  try {
    await page.evaluate(async (ps) => await window.api.photos.importPaths(ps), files)
    const rows = await page.evaluate(async () =>
      (await window.api.photos.getByDateSection())
        .flatMap((s) => s.photos)
        .map((p) => ({ id: p.id, fileName: p.fileName, filePath: p.filePath, kind: p.kind }))
    )
    console.log('ROWS ' + JSON.stringify(rows.map((r) => `${r.fileName}:${r.kind}`)))
    await page.reload({ waitUntil: 'domcontentloaded' })
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs
    const urlOf = (fp) =>
      'video://' + fp.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/')
    for (const name of [
      'short.mp3',
      'long.mp3',
      'long.m4a',
      'vbr.mp3',
      'cover-src.mp3-tagged.mp3'
    ]) {
      const row = rows.find((r) => r.fileName === name)
      if (!row) {
        console.log(`RESULT ${name} 未入库`)
        continue
      }
      const r = await probe(page, urlOf(row.filePath))
      console.log(`RESULT ${name} ` + JSON.stringify(r))
    }
    // E. 真 UI：长 mp3 走组件，看三级兜底有没有被触发（src 变成 blob: 就是第一级就坏了）
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs
    const uiLeg = async (fileName) => {
      const card = page.locator('[data-photo-id]').filter({ hasText: fileName }).first()
      await card.waitFor({ timeout: 60_000 })
      await card.dblclick()
      const canvas = page.locator('.fixed canvas[data-waveform]')
      await canvas.waitFor({ timeout: 60_000 })
      const firstSrc = await page.evaluate(() => document.querySelector('.fixed audio')?.src)
      // 在点之前把 play() 包起来：拒什么、什么时候 resolve、当时元素什么状态
      await page.evaluate(() => {
        const w = window
        w.__playlog = []
        const proto = HTMLMediaElement.prototype
        const orig = proto.play
        proto.play = function () {
          const t0 = performance.now()
          const rec = () => ({
            src: (this.currentSrc || this.src).slice(0, 14),
            ms: Math.round(performance.now() - t0),
            rs: this.readyState,
            ns: this.networkState,
            paused: this.paused,
            t: Number(this.currentTime.toFixed(2)),
            err: this.error ? `${this.error.code}/${this.error.message}` : null
          })
          const p = orig.apply(this)
          p.then(() => w.__playlog.push({ ok: true, ...rec() })).catch((e) =>
            w.__playlog.push({ ok: false, rej: `${e.name}: ${e.message}`, ...rec() })
          )
          return p
        }
      })
      await page.locator('.fixed button[aria-label="播放"]').click()
      const trail = []
      const deadline = Date.now() + 20_000
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const s = await page.evaluate(() => {
          const a = document.querySelector('.fixed audio')
          return {
            t: Number((a?.currentTime ?? -1).toFixed(2)),
            scheme: a?.src?.slice(0, 8),
            paused: a?.paused,
            rs: a?.readyState ?? -1,
            ns: a?.networkState ?? -1,
            err: a?.error?.code ?? null,
            vis: document.visibilityState,
            focus: document.hasFocus(),
            toast: /应用内播放失败/.test(document.querySelector('.fixed')?.innerText ?? '')
          }
        })
        trail.push(s)
        if (s.t > 0.15 || Date.now() > deadline) break
        await new Promise((r) => setTimeout(r, 1000))
      }
      const playlog = await page.evaluate(() => window.__playlog ?? [])
      console.log(
        `RESULT UI ${fileName} first=${firstSrc?.slice(0, 8)} playlog=${JSON.stringify(
          playlog
        )} trail=${JSON.stringify(trail.slice(0, 6))}`
      )
      await page.keyboard.press('Escape')
      await new Promise((r) => setTimeout(r, 500))
    }
    await uiLeg('long.mp3')
    await uiLeg('cover-src.mp3-tagged.mp3')
  } finally {
    if (app) await app.close()
    app = null
    for (const d of [userDataDir, libraryDir, assetsDir]) removeScratchDir(d)
  }
})
