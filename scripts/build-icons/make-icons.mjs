#!/usr/bin/env node
// Leaf 图标产出线：SVG 母版 → dock icns/png + tray template 图标族
//
// 用法：
//   node scripts/_probes/icon-2026-09-28/make-icons.mjs            # 用内置 SVG 设计
//   node scripts/_probes/icon-2026-09-28/make-icons.mjs 底稿.png    # 接外部文生图底稿（白底叶子）
//
// 产物（直接覆盖，git 可审）：
//   build/icon.icns            mac dock 图标（全尺寸）
//   build/icon.png             512（win/linux 打包图标源，builder 自动转 ico）
//   resources/icon.png         512（BrowserWindow/通知图标）
//   resources/trayTemplate.png / @2x   mac 托盘 Template 图（黑+alpha，系统适配明暗）
//   resources/tray.png         32 彩色叶（win/linux 托盘）
import sharp from 'sharp'
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../..')
const WORK = join(HERE, 'work')
const BUILD = join(ROOT, 'build')
const RES = join(ROOT, 'resources')

// iconutil 要求的命名
const ICONSET_SIZES = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png']
]

async function cutoutWhite(buf) {
  // 白底 → alpha（Chebyshev 距离判白；平底稿可用，边缘 AA 半透明保留）
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .resize(1024, 1024, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const d = Math.max(255 - data[i], 255 - data[i + 1], 255 - data[i + 2])
      const a = d >= 24 ? Math.min(255, Math.round(d * 3)) : 0
      data[i + 3] = Math.min(data[i + 3], a)
      if (data[i + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) throw new Error('整图被判成白底——确认底稿是白底上的叶子')
  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  // 内容框：squircle 824 内叶高约 640
  const CONTENT = 640
  const scale = Math.min(CONTENT / bw, CONTENT / bh)
  const nw = Math.max(1, Math.round(bw * scale))
  const nh = Math.max(1, Math.round(bh * scale))
  return sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: minX, top: minY, width: bw, height: bh })
    .resize(nw, nh)
    .png()
    .toBuffer()
}

async function dockMaster() {
  const custom = process.argv[2]
  if (!custom) {
    return sharp(readFileSync(join(HERE, 'dock.svg'))).resize(1024, 1024).png().toBuffer()
  }
  const art = await cutoutWhite(readFileSync(custom))
  const base = await sharp(readFileSync(join(HERE, 'tile.svg'))).resize(1024, 1024).png().toBuffer()
  const meta = await sharp(art).metadata()
  return sharp(base)
    .composite([
      {
        input: art,
        left: Math.round((1024 - meta.width) / 2),
        top: Math.round((1024 - meta.height) / 2)
      }
    ])
    .png()
    .toBuffer()
}

async function main() {
  mkdirSync(WORK, { recursive: true })
  const master = await dockMaster()
  writeFileSyncSafe(join(WORK, 'icon-1024.png'), master)

  const setDir = join(WORK, 'Leaf.iconset')
  rmSync(setDir, { recursive: true, force: true })
  mkdirSync(setDir, { recursive: true })
  for (const [size, name] of ICONSET_SIZES) {
    if (size === 1024) writeFileSyncSafe(join(setDir, name), master)
    else await sharp(master).resize(size, size).png().toFile(join(setDir, name))
  }
  execFileSync('iconutil', ['-c', 'icns', setDir, '-o', join(BUILD, 'icon.icns')])

  await sharp(master).resize(512, 512).png().toFile(join(BUILD, 'icon.png'))
  await sharp(master).resize(512, 512).png().toFile(join(RES, 'icon.png'))

  // 托盘 18pt 彩色叶：tray.png(18) + tray@2x.png(36) 同名配对，系统按 18pt 画
  // （不带 @2x 配对的 32px 图会被当 32pt 撑满整条菜单栏——2026-09-28 实测）
  await sharp(readFileSync(join(HERE, 'tray-color.svg'))).resize(18, 18).png().toFile(join(RES, 'tray.png'))
  await sharp(readFileSync(join(HERE, 'tray-color.svg'))).resize(36, 36).png().toFile(join(RES, 'tray@2x.png'))

  console.log('OK icns/png → build/ 与 resources/；tray 三件套 → resources/')
}

function writeFileSyncSafe(p, buf) {
  writeFileSync(p, buf)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
