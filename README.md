# Leaf 素材库（leaf-library）

> **一叶一世界，万叶成一集。** —— 把散落万处的叶，收成自己的一册。

本地优先的多类型素材管理桌面应用：**图片 / 视频 / 音频 / 字体 / 任意文件 / 书签** 一站式管理。
从本地项目 electron-tools（Leaf 本地工具箱）的素材库模块独立而来。

## 为什么叫 Leaf Library

- **叶是你** —— 以收藏者命名的私人藏馆：我的图书馆。leaf 是罕见的能同时担起「人名 / 书页 / 自然」三重词义的词。
- **leaf 本义是「页」** —— a leaf of a book = 一页纸（活页 loose-leaf 即由此来）。每份素材是一页活页，库是一部越写越厚的书；随取、随插、随重排，正如相册、标签与智能夹对素材的重组。
- **《万叶集》** —— Man'yōshū 直译即 *Collection of Ten Thousand Leaves*。Leaf Library 就是一部自己的《万叶集》：把散落万处的叶子收拢、编目、成册。
- **叶落归根 = local-first** —— 数据不假手云端，最终落回本地自己的根上。
- **一叶知秋** —— 快速预览、语义搜图，从一片叶读到整个秋天；反过来，五万片叶里也能一眼认出那一叶（pHash 查重 / 以图搜图）。
- **树与叶** —— 文件夹树是枝干，素材是叶；库是一棵会生长的树，不是一只死收纳柜。
- **两个彩蛋** —— B+ 树里只有叶节点存着真实数据，Leaf Library 存的就是「真实数据的那一层」（better-sqlite3 上字面成立）；叶子把光变成养分，库把收集来的光存成创作养分。

## 功能

- **多类型入库**：位图/SVG/HEIC、视频（ffmpeg 抽帧 + 时长）、音频（时长探测）、字体（fontkit 真实名 + 样张）、任意文件兜底卡片、**书签**（og:title 抓取 + offscreen 截图存档）、**PDF/AI**（pdfjs 首页渲染）
- **组织**：日期分组、收藏、评分、全局标签（颜色 + 分组树）、手动相册、智能收藏夹（含类型条件）、文件夹分组、回收站 + 撤销；`docs/DECISIONS.md` D-008
- **检索**：关键词、AI 语义搜索（Chinese-CLIP 中文文搜图 + 以图搜图，模型就绪前优雅降级，D-021）、pHash 以图搜图、相似查重（MIH 多索引哈希，5 万+ 库秒级）、9 色相桶、格式/分辨率/时间快筛、类型 chips
- **体验**：Eagle 式布局（D-011：单行工具栏 + 树形侧栏 + 卡片常驻元信息），瀑布流/方格/列表三布局 + 排序，右键菜单、键盘导航（方向键/⌘A/⌘F）、拖拽入相册/文件夹/标签、⌘/Shift 连选、空格快速预览、视频悬停即播 + 逐帧步进/倍速、EXIF 地图（城市反解）、密码锁（safeStorage）
- **收集**：浏览器剪藏插件（MV3，`extension/`）+ 本地 MCP 接入（`/mcp`，JSON-RPC：只读 `leaf_photos_search` / `leaf_photo_detail` / `leaf_library_stats` / `leaf_get_image`（返回图片内容，外部 AI 客户端可看图打标）+ 可写 `leaf_create_album` / `leaf_add_tags` / `leaf_import_paths` / `leaf_add_bookmark`）

## 开发

```bash
pnpm install
pnpm dev          # 开发
pnpm build        # typecheck + 构建
pnpm test         # vitest（345 用例）
pnpm test:e2e:smoke   # Electron 启动冒烟
pnpm exec playwright test e2e/extension-real.spec.mjs   # 剪藏插件真机验证
node scripts/check-ai-env.mjs   # AI（onnxruntime）环境自查
```

> CI：`.github/workflows/ci.yml`（master/main 双认）。
> License：MIT（见根目录 `LICENSE`）。

## 数据

- 数据库：`<userData>/leaf.db`（SQLite/WAL），schema 见 `docs/DB_SCHEMA.md`
- 缩略图缓存：`<userData>/thumbs/`；书签截图：`<userData>/bookmarks/`；剪藏：`<userData>/clips/`
- **从工具箱迁移旧库**：见 `docs/数据迁移-从工具箱.md`

## 架构速览

- Electron + Vue3 + better-sqlite3，electron-vite 构建
- 主进程：`services/`（处理管线/缩略图/剪藏服务器/GeoCoder/MCP/密码锁）+ `db/repos/`（仓储层）
- 渲染层：`views/photos/`（视图组装层 + `composables/` 逻辑层 + 组件），`thumb:// rawfile:// video:// image://` 自定义协议供图
- 壳层（D-011 Eagle 布局）：`TitleBar`（hiddenInset 单行工具栏：导入/布局/面包屑/缩略图滑块）+ `LibraryPanel`（树形资源侧栏），视图状态在 `stores/libraryTabs.ts`（单状态 + 视图历史栈）
- 共享：`src/shared/assetTypes.ts`（六类资源类型真理源）

## 致谢

- 交互与视觉设计参考了 [Eagle](https://eagle.cool/)——一款优秀的素材管理工具；本项目为独立实现，仓库内不含 Eagle 的代码或素材文件。
