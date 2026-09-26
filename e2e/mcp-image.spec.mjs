/**
 * AI 看图工作流 · MCP 全链路真机（import_paths → search → get_image → add_tags → detail）
 *
 * 打标工作流的判别性验收：MCP 客户端（此处用裸 JSON-RPC 模拟，鉴权/token 与真实
 * 客户端同一条链）连上 ClipServer 的 /mcp 端点后，能检索到图片、**真正拿到图片字节**
 * （base64 image content，魔数可验）、把看图结论写回标签。没有 get_image 之前，
 * detail 只回元数据，无文字信号的图片对 Agent 就是黑盒（计划文档的立项理由）。
 *
 * token 取法照 extension-real.spec.mjs：必须走渲染层 IPC `clipServer:getConfig`，
 * 不能读 clip-server.json——落盘的是 safeStorage 密文。
 *
 * 用法：pnpm build && pnpm exec playwright test e2e/mcp-image.spec.mjs
 */
import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtemp, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN_ENTRY = join(ROOT, 'out/main/index.js')
// 现成 fixture：真 PNG（640×480），AI 探针同款图片池
const FIXTURE_PNG = join(ROOT, 'e2e', 'fixtures', 'ai-probe', 'img', 'bread.png')

let app = null
let clipCfg = null
let userDataDir = null
let leafWin = null

/** POST /mcp 一条 JSON-RPC（Streamable HTTP 的「POST + JSON 单响应」模式） */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function mcpRpc(method, params, { token = clipCfg.token, port = clipCfg.port } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-leaf-token': token },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  // 独立 userData：测试素材/token 全落临时目录，不污染真实素材库
  userDataDir = await mkdtemp(join(tmpdir(), 'leaf-e2e-mcp-'))
  app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    launchOptions: { env }
  })

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
  leafWin = await getMainWindow()
  await leafWin.waitForFunction(
    () =>
      !!document.querySelector('#app .LeafAppShell') && document.getElementById('splash') === null,
    undefined,
    { timeout: 15_000 }
  )
  const deadline = Date.now() + 60_000
  let ready = false
  while (Date.now() < deadline && !ready) {
    clipCfg = await leafWin.evaluate(() => window.api.photos.clipServer.getConfig())
    if (!clipCfg?.port || !clipCfg?.token) {
      await new Promise((r) => setTimeout(r, 500))
      continue
    }
    ready = await mcpRpc('ping', {})
      .then((r) => r.status === 200)
      .catch(() => false)
    if (!ready) await new Promise((r) => setTimeout(r, 500))
  }
  if (!ready) throw new Error(`MCP 端点未在 60s 内可连（port=${clipCfg?.port}）`)
})

test.afterAll(async () => {
  if (app) await app.close()
  // 只删自己 mkdtemp 出来的那个根
  if (userDataDir) await rm(userDataDir, { recursive: true, force: true })
})

test('MCP 看图打标全链：tools/list → import → search → get_image → add_tags → detail', async () => {
  test.setTimeout(120_000)

  // 1. tools/list：get_image 已注册（8 工具 = 4 只读 + 4 可写）
  const list = await mcpRpc('tools/list', {})
  expect(list.status).toBe(200)
  const names = list.body.result.tools.map((t) => t.name)
  expect(names).toContain('leaf_get_image')

  // 2. import_paths：把 fixture 真导入库（库内路径白名单的入口侧）
  const imp = await mcpRpc('tools/call', {
    name: 'leaf_import_paths',
    arguments: { paths: [FIXTURE_PNG] }
  })
  expect(imp.status).toBe(200)
  const imported = JSON.parse(imp.body.result.content[0].text)
  expect(imported.added, JSON.stringify(imported)).toBe(1)
  const photoId = imported.items[0].id
  expect(photoId).toMatch(/^[0-9a-f-]{36}$/i)

  // 3. search：按文件名检索到刚导入的图（工作流第一步）
  const search = await mcpRpc('tools/call', {
    name: 'leaf_photos_search',
    arguments: { keyword: 'bread' }
  })
  const found = JSON.parse(search.body.result.content[0].text)
  expect(
    found.items.some((p) => p.id === photoId),
    JSON.stringify(found)
  ).toBe(true)

  // 4. get_image 缺省 size=thumb：MCP image content，JPEG 魔数可验
  //    （导入后后台管线未必轮到它——缩略图未命中现场生成，正好验证那条链）
  const thumb = await mcpRpc('tools/call', { name: 'leaf_get_image', arguments: { id: photoId } })
  expect(thumb.body.result.isError, JSON.stringify(thumb.body)).toBeUndefined()
  const thumbContent = thumb.body.result.content[0]
  expect(thumbContent.type).toBe('image')
  expect(thumbContent.mimeType).toBe('image/jpeg')
  const thumbBytes = Buffer.from(thumbContent.data, 'base64')
  expect(thumbBytes.subarray(0, 2).toString('hex')).toBe('ffd8') // \xFF\xD8 JPEG SOI

  // 5. get_image size=original：库里登记的原文件字节，PNG 魔数可验
  const orig = await mcpRpc('tools/call', {
    name: 'leaf_get_image',
    arguments: { id: photoId, size: 'original' }
  })
  const origContent = orig.body.result.content[0]
  expect(origContent.type).toBe('image')
  expect(origContent.mimeType).toBe('image/png')
  const origBytes = Buffer.from(origContent.data, 'base64')
  expect(origBytes.subarray(0, 4).toString('hex')).toBe('89504e47') // \x89PNG

  // 6. 错误面：不存在的 uuid / 形状非法的 id 都回 isError（不抛裸异常穿透 JSON-RPC）
  const missing = await mcpRpc('tools/call', {
    name: 'leaf_get_image',
    arguments: { id: '00000000-0000-4000-8000-000000000000' }
  })
  expect(missing.body.result.isError, JSON.stringify(missing.body)).toBe(true)

  const badId = await mcpRpc('tools/call', {
    name: 'leaf_get_image',
    arguments: { id: 'not-a-uuid' }
  })
  expect(badId.body.result.isError, JSON.stringify(badId.body)).toBe(true)

  // 7. 看图结论写回：add_tags → detail 里标签在（工作流最后一步）
  const tags = await mcpRpc('tools/call', {
    name: 'leaf_add_tags',
    arguments: { ids: [photoId], tags: ['ai-看图', 'e2e-mcp'] }
  })
  const tagged = JSON.parse(tags.body.result.content[0].text)
  expect(tagged.applied, JSON.stringify(tagged)).toBe(2)

  const detail = await mcpRpc('tools/call', {
    name: 'leaf_photo_detail',
    arguments: { id: photoId }
  })
  const detailData = JSON.parse(detail.body.result.content[0].text)
  expect(detailData.tags).toEqual(expect.arrayContaining(['ai-看图', 'e2e-mcp']))
})

test('无 token / 错 token 访问 /mcp 必须 401（AI 读图口复用同一把鉴权）', async () => {
  const denied = await mcpRpc('tools/list', {}, { token: 'wrong-token-value' })
  expect(denied.status).toBe(401)
  const anonymous = await fetch(`http://127.0.0.1:${clipCfg.port}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
  })
  expect(anonymous.status).toBe(401)
})
