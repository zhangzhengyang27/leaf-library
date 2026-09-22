# Leaf · 数据库 Schema 设计文档

> 版本：v11（migration 累计到 `017_bookmarks_geo`）
> 引擎：SQLite via `better-sqlite3`
> 模式：WAL + `foreign_keys = ON` + `synchronous = NORMAL`
> 路径：`<userData>/leaf.db`

本文档是 Leaf 应用所有持久化表结构的**唯一真理来源**。修改表结构必须：①先追加新 migration，②更新本文档。

---

## 1. 设计目标

1. **单一数据库**：所有业务数据存一份 `leaf.db`，避免文件散落。
2. **零依赖内嵌**：不需要单独的服务进程；启动时自动迁移。
3. **崩溃可恢复**：WAL + NORMAL 在 SSD 上足以应付，掉电不丢数据。
4. **索引先行**：所有「最近」「按状态」类查询都有索引覆盖。
5. **软删除优先**：除了「设置」「日志」「migration meta」「使用记录」「歌单项」外，一律 `deleted_at`，避免误删。
6. **时间戳统一**：所有时间列用 `INTEGER`（unix 毫秒），绝不存字符串或 Date。

---

## 2. 命名约定

### 2.1 表前缀

每个模块独立前缀，作用域在模块内封闭。**禁止跨模块 JOIN**——如有关联，用 `tag_tags` + 中间表。

| 前缀       | 模块               |
| ---------- | ------------------ |
| `meta`     | 迁移跟踪（系统）   |
| `photo_`   | Photos 图片管理    |
| `rec_`     | Recording 屏幕录制 |
| `ss_`      | Screenshot 截图    |
| `pom_`     | Pomodoro 番茄钟    |
| `snip_`    | Snippet 代码片段   |
| `tag_`     | Tag 全局标签       |
| `folder_`  | Folder 文件夹      |
| `wall_`    | Wallpaper 壁纸     |
| `pref_`    | Preference 偏好    |
| `music_`   | Music 音乐（已随 013 下线删除） |
| `lib_`     | Library 本地文件库 |
| `usage_`   | Usage 模块使用记录 |
| `log_`     | Log 服务端日志     |

### 2.2 主键

所有业务表主键 = `TEXT PRIMARY KEY`，值为 UUIDv4 字符串。

- 例外：`meta.version INTEGER PRIMARY KEY`、`log_entries.id INTEGER PRIMARY KEY AUTOINCREMENT`、`music_playlist_items` 是复合主键。

### 2.3 时间戳列

| 列名          | 含义              | 索引方向                |
| ------------- | ----------------- | ----------------------- |
| `created_at`  | 行首次写入时间    | 一般无需索引            |
| `updated_at`  | 行最近修改时间    | `DESC` 用于「最近编辑」 |
| `deleted_at`  | 软删除时间        | 用于过滤 `NULL`         |
| `started_at`  | 业务开始时间      | `DESC`                  |
| `taken_at`    | 拍摄时间（照片）  | `DESC`                  |
| `imported_at` | 入库时间（照片）  | `DESC`                  |
| `captured_at` | 截图捕获时间      | `DESC`                  |
| `added_at`    | 加入集合/专辑时间 | `DESC`                  |

全部用 `INTEGER`（unix ms）。

### 2.4 软删除

除了 `meta` / `pref_preferences` / `log_entries`，**所有表都有 `deleted_at INTEGER` 列**，值为 `NULL` 表示未删除。Service 层必须默认 `WHERE deleted_at IS NULL`。

### 2.5 标签关联

跨模块标签一律走 `tag_tags.id` + 中间表（如 `photo_tags`）。中间表复合主键 `(parent_id, tag_id)`，便于两向查询。

---

## 3. 全局配置

```sql
PRAGMA journal_mode = WAL;       -- 并发读写 + 崩溃恢复
PRAGMA foreign_keys = ON;        -- 启用外键约束（默认 OFF）
PRAGMA synchronous = NORMAL;     -- WAL 下 NORMAL 等价 FULL 的崩溃安全 + 显著更快
PRAGMA temp_store = MEMORY;      -- 临时表/索引放内存
```

详见 `src/main/db/database.ts`。

---

## 4. 表清单（30 张业务表 + 1 张 FTS）

| #   | 表名                   | 行数预期     | 模块       | 引入版本 |
| --- | ---------------------- | ------------ | ---------- | -------- |
| 1   | `meta`                 | 1 行/版本    | 系统       | 001      |
| 2   | `photo_photos`         | 万级         | Photos     | 001 → 014 加处理列 |
| 3   | `photo_albums`         | 数十         | Photos     | 001      |
| 4   | `photo_album_items`    | 数千         | Photos     | 001      |
| 5   | `photo_tags`           | 数千         | Photos     | 001 → 014 绑定字典 |
| 30  | `photo_smart_albums`   | 数十         | Photos     | 014      |
| 6   | `rec_recordings`       | 数百         | Recording  | 001      |
| 7   | `rec_markers`          | 数千         | Recording  | 001      |
| 8   | `rec_clips`            | 数百         | Recording  | 001      |
| 9   | `ss_screenshots`       | 数千         | Screenshot | 001      |
| 10  | `pom_pomodoros`        | 数千         | Pomodoro   | 001      |
| 11  | `pom_tasks`            | 数百         | Pomodoro   | 001      |
| 12  | `snip_folders`         | 数十         | Snippet    | 001      |
| 13  | `snip_tags`            | 数千         | Snippet    | 001      |
| 14  | `snip_snippets`        | 数千         | Snippet    | 001      |
| 15  | `snip_snippets_fts`    | 同上（FTS5） | Snippet    | 001      |
| 16  | `tag_tags`             | 数百         | Tag        | 001 → 002 加 `deleted_at` |
| 17  | `folder_folders`       | 数百         | Folder     | 001      |
| 18  | `wall_collections`     | 数十         | Wallpaper  | 001      |
| 19  | `wall_files`           | 数千         | Wallpaper  | 001 → 003 加元数据列 |
| 20  | `pref_preferences`     | 数百         | Pref       | 001      |
| 21  | `music_tracks`         | 数千         | Music      | 001      |
| 22  | ~~`music_playlists`~~  | —            | Music      | 001 引入，013 删除 |
| 23  | ~~`music_playlist_items`~~ | —        | Music      | 001 引入，013 删除 |
| 24  | `log_entries`          | 自动截断     | Log        | 001      |
| 25  | `snip_snippet_contents`| 1:1 with snip_snippets | Snippet | 004（拆分 body / meta） |
| 26  | `lib_files`            | 数千         | Library    | 003      |
| 27  | `usage_modules`        | 数十         | Usage      | 007      |
| 28  | `usage_history`        | 数千         | Usage      | 007      |
| 29  | ~~`music_online_*`~~   | —            | Music      | 006 引入，013 删除（在线音乐模块下线） |

---

## 5. 模块详细 schema

> 完整 SQL 按版本分布在 `src/main/db/migrations/00X_*.ts`（001_init → 007_usage）。下面只列**每个表的设计意图和关键列**，反映 **v7 累计状态**。

### 5.1 Photos

#### `photo_photos`

照片主体。`file_path` 是绝对路径（**非侵入式**：不复制原文件）；`hash` 存文件 md5（精确去重）；
EXIF 列（`camera_model` / `lens_model` / `iso` / `aperture` / `shutter` / `focal_length` /
`latitude` / `longitude`）由 AssetProcessingService 用 exifr 解析后回填；
`phash` 为 64 位感知哈希（对 1024 预览计算，二期以图搜图/查重用）；
`color_dominant` 为主色 `#rrggbb`；`thumb_status` 状态机（0 待处理 / 1 完成 / 2 失败，支持断点续跑）；
`rating`（0-5）/ `description` / `source`（manual | screenshot | ...）。

索引：

- `(imported_at DESC)` — 主页默认时间线
- `(taken_at DESC)` — 按拍摄时间排序
- `(hash)` — 重复检测
- `(is_favorite)` — 收藏筛选
- `(thumb_status)` — 处理管线补漏扫描

#### `photo_albums` / `photo_album_items`

相册是一对多容器。`cover_id` 指向 `photo_photos.id`（无外键，应用层保证）。

#### `photo_tags`

照片↔标签多对多。复合主键 `(photo_id, tag_id)`。**014 起 `tag_id` 存全局字典 `tag_tags.id`**
（此前存裸字符串，迁移已把历史值转为字典行），读写经 PhotoRepository 解析为名称。

#### `photo_folders`（016）

素材库手动文件夹分组（Eagle 文件夹维度，与相册互补）。`parent_id` 预留层级；
删除文件夹按 Eagle `dialog.removeFolder` 口径：整棵子树连带删除，勾选「把文件夹内项目丢到回收站」
（默认勾）时子树内素材软删（`deleted_at` 非空）且 `folder_id` 置 NULL，未勾选则只置 NULL 落未分类。

#### `geo_cache`（017）

Nominatim 反地理编码缓存（六期）：key 为 2 位小数量化坐标（≈1.1km 格），命中不再请求；
负结果（无城市）也缓存。政策要求 UA + ≤1 req/s，实现在 `GeoCoder.ts`。

#### `photo_smart_albums`（014）

Eagle 式智能收藏夹：`rules_json` 存条件集（标签 id / 收藏 / 最低评分 / 格式 / 最小宽高 /
时间区间 / 关键词），查询时由 `smartAlbumRules.ts` 编译为 photo_photos 上的 WHERE。
软删除 `deleted_at`。

#### `photo_embeddings`（015）

CLIP 图像语义向量。`photo_id` 主键；`model`（如 `Xenova/clip-vit-base-patch32`）+ `dim` +
`embedding`（float32 BLOB）。检索采用「全量载入 + 暴力余弦」（EmbeddingService），
万级库毫秒级；库到 5 万+ 可迁 sqlite-vec，本表结构沿用。

### 5.2 Recording

#### `rec_recordings`

一次屏幕录制对应一行。`status ∈ {recording, paused, processing, completed, failed}`。`width/height/fps` 是录制参数快照，文件本身可能在不同设备录。

#### `rec_markers`

录制中打的标记（关键帧），按 `time_ms` 排序，用于剪辑定位。

#### `rec_clips`

从录制切片出来的视频片段。`status ∈ {pending, processing, done, failed}`，`output_path` 是 ffmpeg 输出的最终文件。

### 5.3 Screenshot

#### `ss_screenshots`

单张截图。`capture_mode ∈ {region, window, fullscreen, scrolling}`。`ocr_text` 是 OCR 完成后填入，触发条件是 `is_ocr_done = 1`。

### 5.4 Pomodoro

#### `pom_pomodoros`

一次番茄钟完成事件（focus / short_break / long_break）。`state` 决定类型。

#### `pom_tasks`

用户任务清单。`status ∈ {pending, in_progress, completed, abandoned}`，`priority` 越大越靠前。`actual_ms` 通过子表 `pom_pomodoros.task_id` 累加。

### 5.5 Snippet

#### `snip_folders`

树形文件夹，`parent_id` 指向自己。`sort_order` 同级排序。

#### `snip_snippets`

片段主体。`language` 对应 monaco-editor 的 language id。`usage_count` 用于「最常用」推荐。

#### `snip_snippets_fts`（FTS5 虚表）

全文搜索虚表，`content='snip_snippets'` 外部内容表模式。**写主表时必须同步写 FTS**（trigger 或应用层手动，001_init 没建 trigger，留给 service 层封装）。

#### `snip_tags`

片段↔标签多对多。

### 5.6 Tag

#### `tag_tags`

全局标签字典。`name UNIQUE`（应用层生成小写 slug 也行）。`parent_id` 支持两层标签树。

### 5.7 Folder

#### `folder_folders`

用户在应用中管理的文件夹索引（与 `snip_folders` 不同——这是磁盘文件夹）。`path` 是绝对路径，`last_scan_at` 用于增量同步。

### 5.8 Wallpaper

#### `wall_collections` / `wall_files`

壁纸集合 + 文件。`wall_files.collection_id NULL` 表示未分类。

### 5.9 Preference

#### `pref_preferences`

K-V 设置。`value` 总是 JSON 字符串，应用层解析。**没有软删除**——删除设置用 `DELETE` 即可。

### 5.10 Music（已下线）

> 音乐播放器 / 在线音乐模块已随 migration **013** 删除（`music_*` 3 表 + `om_*` 7 表）。
> 本地曲库数据原本写入共享的 `lib_files` 表，该表由 LocalFileLibrary 继续使用，未受影响。

### 5.11 Log

#### `log_entries`

服务层落地日志。`meta_json` 是额外上下文。**自动截断策略**：超过 10000 行时按 `ts ASC` 删除最老的，由 service 维护。

### 5.12 Meta

#### `meta`

migration 版本表。`version` 主键，`applied_at` 是落地时间。

---

## 6. 索引策略

### 6.1 必须有索引的场景

- 「最近」查询（任何 `ORDER BY time DESC`）
- 「按状态过滤」（如 `WHERE status = ?`）
- 「按外键连接」（中间表 `WHERE parent_id = ?`）

### 6.2 不加索引的场景

- 低基数唯一列（如 `is_favorite` 单列）——和别的列组合加
- 全表扫描更快的场景（如 FTS 搜索结果已用虚表索引）
- 行数 < 1000 的表——SQLite 索引在小表上是负优化

### 6.3 当前索引汇总

001_init 创建 **30+ 索引**，覆盖上述规则。

---

## 7. 备份策略

由 `database.ts` 的 `maybeBackup()` 实现：

- 触发条件：db 文件大小 ≥ 50 MB
- 备份目标：`<userData>/leaf.db.bak.<unix_ms>`
- 保留数量：最多 3 份，超过按时间最旧删除
- 备份时机：每次 `ensureOpen()` 打开前

> **冷备份责任**：超过 50 MB 的应用数据，自动备份能挡住 1 次误操作崩溃。**周级冷备份仍由用户/OS 负责**。

---

## 8. 迁移规范

### 8.1 如何新增 migration

1. 在 `src/main/db/migrations/` 创建 `00X_xxx.ts`
2. 导出 `m00X_xxx: Migration`
3. 在 `src/main/db/migrations/index.ts` 末尾 `import` 并 push 到数组
4. **禁止修改已发布的版本**

### 8.2 迁移幂等性

每条 SQL 都用 `IF NOT EXISTS`，重复跑不会出错。这是调试 + 回滚的安全网。

### 8.3 迁移事务

`database.ts` 把每个 migration 包在 `db.transaction()` 里，单条失败整个回滚。

### 8.4 迁移历史（v1 → v7）

| 版本 | 文件                                  | 关键变更                                                     |
| ---- | ------------------------------------- | ------------------------------------------------------------ |
| 001  | `001_init.ts`                         | 24 张业务表 + 索引 + WAL/foreign_keys PRAGMA                |
| 002  | `002_tag_softdelete.ts`               | `tag_tags` 加 `deleted_at` + 索引，标签支持软删除            |
| 003  | `003_lib_files_and_wall_meta.ts`      | 新增 `lib_files` 表（本地文件库）；`wall_files` 加元数据列   |
| 004  | `004_snippet_contents_and_folder_meta.ts` | 拆出 `snip_snippet_contents`（body 单独存）+ folder 元数据 |
| 005  | `005_snippet_fts_triggers.ts`         | `snip_snippets_fts` 加 INSERT / UPDATE / DELETE trigger     |
| 006  | `006_online_music_schema.ts`          | 在线音乐表（`music_online_*`）+ 收藏/最近                    |
| 007  | `007_usage_schema.ts`                 | `usage_modules` + `usage_history`（Hub 最近/收藏来源）       |
| 014  | `014_assets_v1.ts`                    | 素材库一期：photo_photos 加 `phash`/`color_dominant`/`thumb_status`/`source`；新增 `photo_smart_albums`；`photo_tags` 裸字符串迁移为 `tag_tags.id` |
| 015  | `015_photo_embeddings.ts`             | 素材库三期：新增 `photo_embeddings`（CLIP 语义向量，float32 BLOB） |
| 016  | `016_asset_kinds.ts`                  | 素材库五期：photo_photos 加 `kind`/`duration_ms`/`folder_id`；新建 `photo_folders`；历史数据按扩展名回填 kind |
| 017  | `017_bookmarks_geo.ts`                | 素材库六期：photo_photos 加 `source_url`（书签来源）；新建 `geo_cache`（反地理编码缓存） |

> 字段细节以每个 migration 文件为准；本文档 §5 模块说明反映**最新累计**状态（v11）。

---

## 9. 未来扩展

预留但未实现：

- **`photo_embeddings` 表（photo_id + model + BLOB）**：CLIP 特征向量，语义搜索（二期，transformers.js）
- **`rec_recordings.transcript`**：录音转写
- **`tag_tags.icon`**：已有字段，等 UI 接入（color 已随素材库一期接入）
- **`usage_history` 多设备同步**：当前只本地使用，云同步时另起 migration

---

## 10. 性能基线

| 场景                 | 目标    | 实测 |
| -------------------- | ------- | ---- |
| 启动迁移（首次）     | < 500ms | 待测 |
| 启动迁移（已有库）   | < 50ms  | 待测 |
| 单条 INSERT          | < 1ms   | 待测 |
| 全文搜索（10k 片段） | < 50ms  | 待测 |
| Hub 最近/收藏查询    | < 5ms   | 待测（007 加索引后） |
