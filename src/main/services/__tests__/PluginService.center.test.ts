/**
 * 插件中心 P1 · PluginService 启停/来源/卸载/导入（D-025）
 * 夹具：临时目录建 builtin/extra/userData 三棵树；fakePrefs 用 Map 实现 get/set。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdirSync, writeFileSync, existsSync, rmSync, createWriteStream, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import yazl from 'yazl'
import { crc32 } from 'zlib'
import { PluginService } from '../PluginService'

/** 测试夹具：构造 .leafplugin zip（yazl 写、yauzl 读，同作者包配对） */
function makeLeafPlugin(
  zipPath: string,
  manifest: object,
  files: Record<string, string> = {}
): Promise<void> {
  const z = new yazl.ZipFile()
  z.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json')
  z.addBuffer(Buffer.from('<html><body>p</body></html>'), 'index.html')
  for (const [name, content] of Object.entries(files))
    z.addBuffer(Buffer.from(content), name)
  z.end()
  const out = createWriteStream(zipPath)
  return new Promise((res, rej) => {
    out.on('close', () => res())
    out.on('error', rej)
    ;(z as unknown as { outputStream: NodeJS.ReadableStream }).outputStream.pipe(out)
  })
}

function makePlugin(dir: string, id: string, category = 'inspector'): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({
      id,
      name: id,
      version: '1.0.0',
      category,
      entry: 'index.html',
      permissions: ['photos:read']
    })
  )
  writeFileSync(join(dir, 'index.html'), '<html></html>')
}

/** 手工构造最小 stored zip（无压缩）：slip 夹具用，绕过 yazl 的写侧校验 */
function storedZip(name: string, content: Buffer): Buffer {
  const enc = (n: number) => { const b = Buffer.alloc(n); return b }
  const nameBuf = Buffer.from(name)
  const crc = crc32(content)
  const local = Buffer.concat([
    enc(30), nameBuf, content
  ])
  // local header
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4) // version
  local.writeUInt16LE(0, 6) // flags
  local.writeUInt16LE(0, 8) // stored
  local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12) // time/date
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(content.length, 18)
  local.writeUInt32LE(content.length, 22)
  local.writeUInt16LE(nameBuf.length, 26)
  local.writeUInt16LE(0, 28)
  const off = 0
  const central = Buffer.alloc(46 + nameBuf.length)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0, 8); central.writeUInt16LE(0, 10)
  central.writeUInt16LE(0, 12); central.writeUInt16LE(0, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(content.length, 20)
  central.writeUInt32LE(content.length, 24)
  central.writeUInt16LE(nameBuf.length, 28)
  central.writeUInt32LE(off, 42)
  nameBuf.copy(central, 46)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 10); eocd.writeUInt16LE(1, 8)
  eocd.writeUInt32LE(central.length, 12)
  eocd.writeUInt32LE(local.length, 16)
  return Buffer.concat([local, central, eocd])
}

describe('PluginService · 中心启停与来源', () => {
  let base: string, root: string, builtin: string, extra: string, prefs: Map<string, string>
  beforeEach(() => {
    base = join(tmpdir(), 'leaf-pc-' + Math.random().toString(36).slice(2))
    root = join(base, 'plugins')
    builtin = join(base, 'builtin')
    extra = join(base, 'extra')
    mkdirSync(builtin, { recursive: true })
    mkdirSync(extra, { recursive: true })
    makePlugin(join(builtin, 'exif-metadata'), 'exif-metadata')
    makePlugin(join(extra, 'dev-plugin'), 'dev-plugin')
    prefs = new Map([['plugins:extraDir', extra]])
  })
  const svc = () =>
    new PluginService(
      root,
      { get: (k: string) => prefs.get(k) ?? null, set: (k: string, v: string) => prefs.set(k, v) },
      builtin
    )

  it('enabled 默认 true：pref 键缺失视为启用（存量兼容）', () => {
    const s = svc()
    mkdirSync(root, { recursive: true })
    makePlugin(join(root, 'exif-metadata'), 'exif-metadata')
    expect(s.isEnabled('exif-metadata')).toBe(true)
    expect(s.listAll().find((p) => p.id === 'exif-metadata')?.enabled).toBe(true)
  })

  it('setEnabled 持久化并可逆；未知 id 拒绝', () => {
    const s = svc()
    mkdirSync(root, { recursive: true })
    makePlugin(join(root, 'exif-metadata'), 'exif-metadata')
    expect(s.setEnabled('exif-metadata', false).ok).toBe(true)
    expect(s.isEnabled('exif-metadata')).toBe(false)
    expect(s.setEnabled('exif-metadata', true).ok).toBe(true)
    expect(s.isEnabled('exif-metadata')).toBe(true)
    expect(s.setEnabled('nope', true).ok).toBe(false)
  })

  it('listAll 的 source：内置复制件=builtin、extraDir=dev、userData 非内置来源=imported', () => {
    const s = svc()
    mkdirSync(root, { recursive: true })
    makePlugin(join(root, 'imported-one'), 'imported-one')
    expect(s.installBuiltin('exif-metadata').ok).toBe(true) // 内置复制件由 installBuiltin 落盘
    const all = s.listAll()
    expect(all.find((p) => p.id === 'exif-metadata')?.source).toBe('builtin')
    expect(all.find((p) => p.id === 'imported-one')?.source).toBe('imported')
    expect(all.find((p) => p.id === 'dev-plugin')?.source).toBe('dev')
  })
})

describe('PluginService · 卸载边界', () => {
  let base: string, root: string, builtin: string, extra: string, prefs: Map<string, string>
  beforeEach(() => {
    base = join(tmpdir(), 'leaf-pc-' + Math.random().toString(36).slice(2))
    root = join(base, 'plugins')
    builtin = join(base, 'builtin')
    extra = join(base, 'extra')
    mkdirSync(builtin, { recursive: true })
    mkdirSync(extra, { recursive: true })
    makePlugin(join(extra, 'dev-plugin'), 'dev-plugin')
    prefs = new Map()
  })
  const svc = () =>
    new PluginService(
      root,
      { get: (k: string) => prefs.get(k) ?? null, set: (k: string, v: string) => prefs.set(k, v) },
      builtin
    )

  it('uninstall 只删 userData 安装件；extraDir 与内置原件拒绝；幂等', () => {
    const s = svc()
    mkdirSync(root, { recursive: true })
    makePlugin(join(root, 'exif-metadata'), 'exif-metadata')
    expect(s.uninstall('exif-metadata').ok).toBe(true)
    expect(existsSync(join(root, 'exif-metadata'))).toBe(false)
    expect(s.uninstall('exif-metadata').ok).toBe(false) // 目录已不在 → 不存在即拒绝
    expect(s.uninstall('dev-plugin').ok).toBe(false) // extraDir 不归卸载管
    expect(existsSync(join(extra, 'dev-plugin'))).toBe(true)
    expect(s.uninstall('builtin-only').ok).toBe(false) // 不在 userData/plugins 的 id 拒绝
    void builtin
    void rmSync
  })
})

describe('PluginService · .leafplugin 导入', () => {
  let base: string, root: string, builtin: string, prefs: Map<string, string>
  beforeEach(() => {
    base = join(tmpdir(), 'leaf-pc-' + Math.random().toString(36).slice(2))
    root = join(base, 'plugins')
    builtin = join(base, 'builtin')
    mkdirSync(builtin, { recursive: true })
    prefs = new Map()
  })
  const svc = () =>
    new PluginService(
      root,
      { get: (k: string) => prefs.get(k) ?? null, set: (k: string, v: string) => prefs.set(k, v) },
      builtin
    )

  it('合法包：解出 manifest/entry，落 userData/plugins/<id>，source=imported', async () => {
    const s = svc()
    const zip = join(base, 'good.leafplugin')
    await makeLeafPlugin(
      zip,
      { id: 'nice', name: 'Nice', version: '1.0.0', category: 'inspector', entry: 'index.html', permissions: ['photos:read'] }
    )
    const res = await s.importPlugin(zip)
    if (!res.ok) console.error('importPlugin res:', JSON.stringify(res))
    expect(res.ok).toBe(true)
    expect(existsSync(join(root, 'nice', 'index.html'))).toBe(true)
    expect(s.listAll().find((p) => p.id === 'nice')?.source).toBe('imported')
  })

  it('zip slip（../ 逃逸）整包拒绝且不落盘', async () => {
    const s = svc()
    // yazl 会拒绝不安全 entry 名，slip 夹具用手工 stored-zip 绕过写侧校验，
    // 验证的是「读侧（yauzl + extractPluginZip）必须自己挡」
    const zip = join(base, 'slip.leafplugin')
    writeFileSync(zip, storedZip('../evil.txt', Buffer.from('x')))
    const res = await s.importPlugin(zip)
    expect(res.ok).toBe(false)
    expect(existsSync(join(base, 'evil.txt'))).toBe(false)
  })

  it('id 路径穿越（../../../ 逃逸）整包拒绝且不写盘（终审 C1）', async () => {
    const s = svc()
    const zip = join(base, 'idslip.leafplugin')
    await makeLeafPlugin(
      zip,
      { id: '../../../pwned', name: 'p', version: '1', category: 'inspector', entry: 'index.html' }
    )
    const res = await s.importPlugin(zip)
    expect(res.ok).toBe(false)
    expect(existsSync(join(base, 'pwned'))).toBe(false)
    expect(existsSync(join(root, 'pwned'))).toBe(false)
  })

  it('deflate 数据损坏：读流 error 被接住返回明确错误，不崩进程（终审 I2）', async () => {
    const s = svc()
    const zip = join(base, 'corrupt.leafplugin')
    // yazl 默认 deflate → 破坏压缩字节（保留 local header/文件名）→ inflate 流 emit error
    await makeLeafPlugin(
      zip,
      { id: 'c', name: 'c', version: '1', category: 'inspector', entry: 'index.html' }
    )
    const buf = readFileSync(zip)
    const dataOff = 30 + 'manifest.json'.length
    buf[dataOff + 8] ^= 0xff
    buf[dataOff + 9] ^= 0xff
    writeFileSync(zip, buf)
    const res = await s.importPlugin(zip)
    expect(res.ok).toBe(false)
    expect(existsSync(join(root, 'c'))).toBe(false)
  })

  it('manifest 非法 / entry 缺失 / 同 id 已装，各自拒绝且不覆盖', async () => {
    const s = svc()
    mkdirSync(root, { recursive: true })
    makePlugin(join(root, 'nice'), 'nice')
    const bad1 = join(base, 'bad1.leafplugin')
    await makeLeafPlugin(bad1, { id: 'x', name: 'x' }) // 缺 version/category/entry
    expect((await s.importPlugin(bad1)).ok).toBe(false)
    const bad2 = join(base, 'bad2.leafplugin')
    await makeLeafPlugin(bad2, { id: 'y', name: 'y', version: '1', category: 'format', entry: 'missing.html' })
    expect((await s.importPlugin(bad2)).ok).toBe(false)
    const dup = join(base, 'dup.leafplugin')
    await makeLeafPlugin(dup, { id: 'nice', name: 'n', version: '2', category: 'inspector', entry: 'index.html' })
    expect((await s.importPlugin(dup)).ok).toBe(false)
    expect(existsSync(join(root, 'nice', 'manifest.json'))).toBe(true) // 未被覆盖
  })
})
