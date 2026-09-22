# Leaf Clipper（Chrome 扩展）

把网页图片一键收藏进 Leaf 素材库。对应 `docs/eagle-parity-plan.md` F7。

## 安装（开发版，Chrome / Edge 通用）

1. 打开 Leaf → 设置 → 剪藏，记下「服务地址（含端口）」和「Token」。
2. Chrome 地址栏进入 `chrome://extensions`，右上角打开「开发者模式」。
3. 点「加载已解压的扩展程序」，选择本目录（`extension/chrome`）。
4. 点浏览器工具栏的 Leaf 图标 → 「设置」，把地址与 Token 粘贴进去 → 「测试连接」。

## 使用

- 点工具栏 Leaf 图标：弹出当前页图片网格（按显示面积排序），选择目标文件夹后「收藏选中」。
- 图片右键菜单「收藏图片到 Leaf」：一键收藏单图（工具栏图标短暂显示 ✓/! 反馈）。
- 支持普通 `img`、`srcset` 最优档、视频封面、内联背景图；`data:` 图片走 Base64 通道。

## 文件结构

- `manifest.json` — MV3 清单（activeTab 按需注入 + action popup + options_page，无 `<all_urls>` 常驻注入）
- `background.js` — service worker：读配置、逐张 POST 给 Leaf ClipServer
- `content.js` — 页面图片扫描（被动，仅响应 popup 请求）
- `popup.html/js` — 勾选与批量收藏
- `options.html/js` — 地址/Token 配置与探活

## 安全说明

- 全部请求走 `http://127.0.0.1` 且带 `x-leaf-token`；服务端另有 Origin/Host 校验与 SSRF 防护。
- 扩展不注入任何 UI 到页面，只在收到 popup 请求时读取图片 URL。
