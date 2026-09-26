# 实施计划 · AI 看图工作流（MCP 暴露图片内容 + 视觉打标）

> 立项：2026-09-25 差距核验 + Eagle 4.0.0 asar 清点的**定性修正**：Eagle 也没有内置看图打标——
> 它的官方路径是把库暴露为 **MCP 服务器**（mcp-server 插件），让外部 AI 客户端（Claude 等）看图打标；
> 其 AI 搜索是独立插件（Node + Python 后端本地向量检索，模型不在主包内）；另有一个 BYOK 云 API 的
> 「AI 模型套件」配置中心（OpenAI/Anthropic/Gemini）。
> Leaf 的既有底盘**更好**：Chinese-CLIP 内置（D-021）、MCP 端点内置（search/detail/stats +
> create_album/add_tags/import_paths/add_bookmark）。缺的只有一块：**AI 客户端看不到图**——
> detail 只回元数据，无文字信号的图片打了也是瞎猜（D-017 拆预览页 AI 按钮的同一条理由）。
> 状态：待评审细化后开工；M1 涉及安全边界，**先立 D-023**（与智能夹计划的 regex 决策合并编号时顺延）。

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

### M3 · 内置视觉打标（可选，独立决策）
- 对标 Eagle「AI 模型套件」的 BYOK 模式：设置页接一个视觉云 API（候选：DeepSeek 视觉档 / 其他 BYOK），
  批量「看图打标/命名/描述」复用批量摘要的成本确认 + token 用量口径。
- 决策点：接哪家、免费额度现实性、与 M1 外部客户端路径的定位分工（内置=一键批量，MCP=灵活工作流）。
- **不做**：本地视觉模型推理跑进主进程（D-017 的教训：754MB 已是上限，再加视觉塔不现实）。

## 验收（判别性）

M1：MCP 客户端真连（照 extension-real 的真机范式）取到图且无 token 时 401；M2：示例提示词跑通全链，
`add_tags` 写回的标签出现在检查器；M3（若做）：批量前费用确认弹窗出现、跑完 toast 报用量。

## 风险

ClipServer token 复用把「剪藏写入口」和「AI 读图口」耦合（D-023 拆清楚）；base64 大图撑爆 MCP 消息
（默认缩略图、原图显式请求）；示例文档过时风险（与 README 同一轮维护）。
