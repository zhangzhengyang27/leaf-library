#!/usr/bin/env node
// dev 态 Electron 壳子改名：node_modules/electron/dist/Electron.app 的 CFBundleName
// 决定 macOS 菜单栏/程序坞的应用标题，不改就一直是 "Electron"（打包态由
// electron-builder 写自己的 Info.plist，不受影响）。
// 改 Info.plist 会破坏 adhoc 签名封印（arm64 强制验签），必须原地重签，否则直接被 kill。
// 幂等：已是目标名即跳过；任何失败都不阻塞 dev（顶多标题回退 Electron）。
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APP = join(ROOT, 'node_modules/electron/dist/Electron.app')
const PLIST = join(APP, 'Contents/Info.plist')
const NAME = 'Leaf 素材库'

if (!existsSync(PLIST)) process.exit(0)

const current = (() => {
  try {
    return execFileSync('plutil', ['-extract', 'CFBundleName', 'raw', '-o', '-', PLIST]).toString().trim()
  } catch {
    return ''
  }
})()
if (current === NAME) {
  console.log('[dev-electron] 已是', NAME)
  process.exit(0)
}

try {
  execFileSync('plutil', ['-replace', 'CFBundleName', '-string', NAME, PLIST])
  execFileSync('plutil', ['-replace', 'CFBundleDisplayName', '-string', NAME, PLIST])
  execFileSync('codesign', ['--force', '--sign', '-', APP])
  console.log('[dev-electron] dev 壳子已改名 + 重新 adhoc 签名 →', NAME)
} catch (e) {
  console.warn('[dev-electron] 补丁失败（不阻塞，标题将显示 Electron）:', e.message)
}
