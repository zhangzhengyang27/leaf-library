# 实施计划 · AI 看图工作流（MCP 暴露图片内容 + 视觉打标）

> 立项：2026-09-25 差距核验 + Eagle 4.0.0 asar 清点的**定性修正**：Eagle 也没有内置看图打标——
> 它的官方路径是把库暴露为 **MCP 服务器**（mcp-server 插件），让外部 AI 客户端（Claude 等）看图打标；
> 其 AI 搜索是独立插件（Node + Python 后端本地向量检索，模型不在主包内）；另有一个 BYOK 云 API 的
> 「AI 模型套件」配置中心（OpenAI/Anthropic/Gemini）。
> Leaf 的既有底盘**更好**：Chinese-CLIP 内置（D-021）、MCP 端点内置（search/detail/stats +
> create_album/add_tags/import_paths/add_bookmark）。缺的只有一块：**AI 客户端看不到图**——
> detail 只回元数据，无文字信号的图片打了也是瞎猜（D-017 拆预览页 AI 按钮的同一条理由）。
> 状态：M1+M2 已落地（2026-09-26，勾账见文末）；M3 可选项未动。

## 分期

### M1 · MCP 图片内容暴露（核心）
- `McpHandler` 加 `get_image` 工具：`{ id, size: 'thumb' | 'original' }` → 返回可取的本地 HTTP URL
  （复用 ClipServer 的 token 鉴权与 `thumb://` 同源供给端点）或小图 base64。
- 安全边界（D-023 要裁决的）：token 是否复用 ClipServer 那把；原图 vs 缩略图的授权档位；
  URL 过期策略；路径白名单沿用 `resolveAssetPath`。
- 位图判定复用既有 kind/扩展名口径，非位图素材返回明确错误而非空图。

### M2 · 打标工作流闭环（用起来才算数）
- README / docs 给出真实可跑的示例：MCP 客户端连接 → `search` 取候选 → `get_image` 看图 →
  `add_tags` 写回 → `create_album` 归档——即 Eagle 官方 MCP 面板宣传的那三个场景的 Leaf 等价物。
- 加一条 e2e/探针：脚本化跑通 search→get_image→add_tags 全链（照 ai-probe 的闸模式，缺模型 skip）。

### M3 · 内置视觉打标（用户拍板做，2026-09-26）

> **路线依据**：用户指定 DeepSeek 视觉模型。已核实的现实（2026-09-26 检索）：DeepSeek 官方 API
> 仍为纯文本档（deepseek-chat/reasoner），官方口径多模态"在做"；视觉模型 DeepSeek-VL2 为开源权重，
> 由 SiliconFlow/Novita 等 OpenAI 兼容平台托管。故实现为 **OpenAI 兼容通用视觉端点 + DeepSeek 预设**：
> 官方视觉档上线填官方端点/模型名即可，现阶段填托管平台跑 deepseek-vl2 同样可用——两种现实同一套代码。
- 对标 Eagle「AI 模型套件」的 BYOK 模式：设置页接一个视觉云 API（候选：DeepSeek 视觉档 / 其他 BYOK），
  批量「看图打标/命名/描述」复用批量摘要的成本确认 + token 用量口径。
- 决策点：接哪家、免费额度现实性、与 M1 外部客户端路径的定位分工（内置=一键批量，MCP=灵活工作流）。
- **状态：已落地（2026-09-26，`efb2105`）**——OpenAI 兼容视觉端点 + DeepSeek 预设（见上节路线依据），
  位图素材「AI 摘要与标签」在视觉模型已配置时出现，缩略图 ≤768px/≤200KB 双闸。真模型手测需真实
  Key（SiliconFlow + deepseek-vl2 或官方视觉档），属用户手测项。
- **不做**：本地视觉模型推理跑进主进程（D-017 的教训：754MB 已是上限，再加视觉塔不现实）。

## 验收（判别性）

M1：MCP 客户端真连（照 extension-real 的真机范式）取到图且无 token 时 401；M2：示例提示词跑通全链，
`add_tags` 写回的标签出现在检查器；M3（若做）：批量前费用确认弹窗出现、跑完 toast 报用量。

## 风险

ClipServer token 复用把「剪藏写入口」和「AI 读图口」耦合（D-023 拆清楚）；base64 大图撑爆 MCP 消息
（默认缩略图、原图显式请求）；示例文档过时风险（与 README 同一轮维护）。

## 勾账 · M1+M2（2026-09-26 落地）

**M1 · `leaf_get_image`**（`src/main/services/McpHandler.ts`）：
- 入参 `{ id, size?: 'thumb' | 'original' }`（缺省 thumb）；id 先过 `isAnnotationIdLike` uuid 形状守卫
  （与标注链同款），素材必须存在；返回 MCP image content `{ type:'image', data:<base64>, mimeType }`。
- **实现口径与原计划的差异**：计划里的「返回可取的本地 HTTP URL」做成了**直接回 base64 image content**
  （MCP 规范原生支持 image content 项）——URL 方案要引入第二把鉴权与过期策略，base64 让客户端
  零额外握手；大图风险用「默认 thumb + 原图 8MB 上限（超限 isError 提示用 thumb）」双闸兜住。
- 路径解析走既有链、不在工具里新写：`McpContext` 新增注入位 `resolveImage`，由 ClipServer 组装——
  thumb 照 `thumb://` 协议同语义（`ThumbnailService.getCachedPath` 未命中现场生成），original 直取
  库里登记的 `photo.filePath`（客户端只传 id，**绝不接受外部传路径**，与 resolveAssetPath 的
  白名单语义同源）。缩略图文件恒为落盘 .jpg（mimeType 固定 image/jpeg）；original 按扩展名映射
  （png/jpg/jpeg/webp/gif/bmp/svg/avif/tiff），映射不到兜底 image/png，且仅位图扩展放行
  （`IMAGE_EXTENSIONS`/`RASTER_EXTENSIONS`，即 kindOfExt 判 image 的那两组口径），mp4/ttf 等明确报错。
- description 写明工作流链：「search 检索 → get_image 看图 → add_tags 写回 → create_album 归档」。
- 安全边界（原 D-023 想裁决的点，随实现落定，正式决策条目待补）：token 复用 ClipServer 既有那把
  （`/mcp` 路由本就过 x-leaf-token + Origin + Host 三关）；无 URL 无过期策略；字节上限 8MB。

**M2 · 全链验收 + 文档**：
- `e2e/mcp-image.spec.mjs`（真启 app + 独立 userData，token 走渲染层 IPC `clipServer:getConfig`，
  照 extension-real 范式）：断言 tools/list 含 get_image → import_paths 入库 fixture（bread.png）→
  search 命中 → get_image thumb 解出 JPEG 魔数 `\xFF\xD8`、original 解出 PNG 魔数 `\x89PNG` →
  不存在 uuid / 非法 id 均 isError → add_tags 写回后 detail 标签在 → 无 token/错 token 401。
- README 收集行改现势（列出全部 8 个工具名）；CHANGELOG 09-26 节记用户可感知项。
- 验证口径：`pnpm run typecheck:node` 过；`pnpm exec eslint --cache .` 0 error；
  `pnpm exec vitest run src/main` 全绿（McpHandler 单测 7→14 条，tools/list 断言改 8 工具）；
  `pnpm build` 过；`pnpm exec playwright test e2e/mcp-image.spec.mjs` 2 passed。

**留给后续**：~~D-023 正式决策条目（token 档位/字节上限的背书）待与智能夹 regex 决策合并编号时顺延~~
→ 已按内容量**拆为 D-024 单独立案**（2026-09-26，见 docs/DECISIONS.md，三个裁决正式背书）；
M3（内置视觉打标 BYOK）独立决策；导入大图（>8MB）想看原图的场景若真实出现再议分档或分片。
