/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main = /* @__PURE__ */ defineComponent(
*/
{
  __name: "index",
  setup(__props) {
    const router = useRouter();
    const tabs = useLibraryTabs();
    const { panelVisible, filterBarVisible } = useLibraryUI();
    const photoImport = usePhotoImport();
    const clipboard = usePhotoClipboard();
    const wallpaper = useWallpaper();
    const importDragActive = photoImport.dragActive;
    const data = usePhotoData();
    const filters = usePhotoFilters();
    const search = usePhotoSearch();
    const scan = useDuplicateScan();
    const actions = usePhotoActions();
    const aiBatch = useAiBatch();
    const preview = usePreview();
    const keyboard = usePhotoKeyboard();
    const { pendingConfirm } = useDialogs();
    const { loading, allPhotos, dictionaryTags } = data;
    const { previewPhoto } = preview;
    const {
      locked,
      unlockPassword,
      smartAlbumModalOpen,
      albumModalOpen,
      folderModalOpen,
      batchRenameOpen,
      bookmarkModalOpen,
      lockModalOpen,
      editingSmartAlbum
    } = actions;
    const { pendingPrompt, requestPrompt } = useDialogs();
    const { selectedIds, isSelectionMode, clearSelection, handleSelectPhoto, selectAll } = usePhotoSelection();
    const filterBarRef = ref(null);
    const contentScrollRef = ref(null);
    const effectiveLayout = computed(() => filters.viewLayout.value);
    const showInspector = computed(
      () => filters.viewDisplay.value.showInspector && selectedIds.value.length > 0
    );
    const showLibraryInfo = computed(
      () => filters.viewDisplay.value.showInspector && !filters.activeFolder.value && !filters.isMapView.value && !filters.isDuplicateView.value
    );
    const selectedSet = computed(() => new Set(selectedIds.value));
    function handleDragPhotos({ photo, e: e64 }) {
      const ids = selectedIds.value.includes(photo.id) ? [...selectedIds.value] : [photo.id];
      e64.dataTransfer?.setData("application/x-leaf-photos", JSON.stringify(ids));
      if (e64.dataTransfer) {
        e64.dataTransfer.effectAllowed = "copyMove";
        const photos = data.byIds(ids);
        const uris = photos.map((p2) => `file://${p2.filePath.replace(/\\/g, "/")}`).join("\r\n");
        if (uris) e64.dataTransfer.setData("text/uri-list", uris);
      }
    }
    const menu = useContextMenu();
    const toast2 = useToast();
    const renamingId = ref(null);
    const convertIds = ref(null);
    const extensionGuideOpen = ref(false);
    const previewGrayscale = ref(false);
    function toggleGrayscale() {
      previewGrayscale.value = !previewGrayscale.value;
      useToast().info(previewGrayscale.value ? "黑白预览已开启" : "黑白预览已关闭");
    }
    const briefMode = ref(false);
    const inspectorExpanded = ref(false);
    function beginInlineRename(photo) {
      if (effectiveLayout.value === "freeform") {
        requestPrompt({
          title: "重命名",
          label: "文件名",
          initialValue: photo.fileName,
          confirmLabel: "保存",
          onSubmit: async (name) => {
            await onRenameCommit(photo, name);
          }
        });
        return;
      }
      renamingId.value = photo.id;
    }
    async function onRenameCommit(photo, newName) {
      renamingId.value = null;
      const trimmed = newName.trim();
      if (!trimmed || trimmed === photo.fileName) return;
      const result2 = await window.api.photos.renamePhotos([{ id: photo.id, name: trimmed }]);
      if (result2.renamed.length > 0) {
        toast2.success("已重命名", { description: result2.renamed[0].fileName });
      } else if (result2.conflicts.length > 0) {
        toast2.error("重命名失败", { description: `「${result2.conflicts[0].fileName}」已存在同名文件` });
      }
    }
    function openBlankContextMenu(e64) {
      if (filters.isMapView.value || filters.isDuplicateView.value) return;
      const target = e64.target;
      if (target?.closest("[data-photo-id], .photo-item, [data-rename-input]")) return;
      const items2 = [
        { key: "new-folder", label: "新建文件夹", icon: "context-menu/ic-folder-new-folder" },
        { key: "new-smart", label: "新增智能文件夹", icon: "context-menu/ic-smart-folder-rule" },
        { key: "d1", divider: true },
        { key: "paste", label: "粘贴 ⌘V", icon: "context-menu/ic-file-copy" },
        { key: "d2", divider: true },
        { key: "select-all", label: "全选 ⌘A", icon: "batch-save-select-all" },
        { key: "d3", divider: true },
        // ⌘R 已绑定「重命名」（对齐 Eagle），这里去掉 ⌘R 标注避免同一组合键两个语义
        { key: "reload", label: "重新加载", icon: "ic_refresh" }
      ];
      if (filters.activeFolder.value) {
        items2.push(
          { key: "d4", divider: true },
          {
            key: "folder-settings",
            label: "打开文件夹设置…",
            icon: "ic_cog"
          }
        );
      }
      menu.open(e64.clientX, e64.clientY, items2, (key) => {
        if (key === "new-folder") void actions.createFolderInline();
        else if (key === "new-smart") actions.openSmartAlbumModal(null);
        else if (key === "paste") {
          if (clipboard.cutPhotoIds.value.length > 0) void clipboard.pasteMove();
          else void photoImport.pasteFromClipboard();
        } else if (key === "select-all") selectAll(filters.flatDisplayPhotos.value.map((p2) => p2.id));
        else if (key === "reload") void loadAll();
        else if (key === "folder-settings")
          actions.openFolderSettings(filters.activeFolder.value?.id ?? null);
      });
    }
    function pagedViewTarget() {
      if (filters.isTrashView.value) return "trash";
      if (filters.isSearchMode.value && data.usePagedSearch()) return "search";
      if (filters.tab.value.view === "favorites" && data.usePagedFavorites()) return "favorites";
      if (filters.activeFolderId.value && data.usePagedFolder() && !filters.tab.value.display.includeSubfolders) {
        return "folder";
      }
      return "main";
    }
    const hasMoreForView = computed(() => {
      const view = filters.tab.value.view;
      if (!filters.isTrashView.value && ["untagged", "unsorted", "recent", "recents"].includes(view)) {
        return false;
      }
      const t3 = pagedViewTarget();
      if (t3 === "trash") return data.trashHasMore.value;
      if (t3 === "search") return data.searchHasMore.value;
      if (t3 === "favorites") return data.favoritesHasMore.value;
      if (t3 === "folder") return data.folderHasMore.value;
      return data.mainHasMore.value;
    });
    function onLoadMore() {
      const t3 = pagedViewTarget();
      if (t3 === "trash") return data.loadMoreTrash();
      if (t3 === "search") return data.loadMoreSearch();
      if (t3 === "favorites") return data.loadMoreFavorites();
      if (t3 === "folder") return data.loadMoreFolder();
      data.loadMoreMain();
    }
    function openPhotoContextMenu({ photo, x: x2, y: y2 }) {
      if (filters.isMapView.value) return;
      const inTrash = filters.isTrashView.value;
      if (!selectedIds.value.includes(photo.id)) {
        replaceSelection([photo.id]);
      }
      const ids = selectedIds.value.includes(photo.id) ? [...selectedIds.value] : [photo.id];
      if (inTrash) {
        menu.open(
          x2,
          y2,
          [
            { key: "restore", label: "恢复", icon: "ic_refresh" },
            { key: "d1", divider: true },
            { key: "reveal", label: "在访达中打开", icon: "context-menu/ic-open-finder" }
          ],
          (key) => {
            if (key === "restore") actions.handleRestoreIds(ids);
            else if (key === "reveal") actions.revealInFolder(byIds(ids));
          }
        );
        return;
      }
      const isSingle = ids.length === 1;
      const lastFolderId = (() => {
        try {
          return localStorage.getItem("leaf.last-used-folder");
        } catch {
          return null;
        }
      })();
      const items2 = [
        { key: "open", label: "打开预览", icon: "context-menu/ic-open-eagle" },
        { key: "new-window", label: "在新窗口打开", icon: "context-menu/ic-open-new-window" },
        {
          key: "open-default",
          label: "在默认应用打开",
          icon: "context-menu/ic-open-default",
          disabled: !isSingle
        },
        // 十八轮 P3：在其它应用打开（Eagle 在其它应用打开▸；弹出应用选择器）
        {
          key: "open-with",
          label: "在其它应用打开…",
          icon: "context-menu/ic-open-other",
          disabled: !isSingle
        },
        { key: "reveal", label: "在访达中打开", icon: "context-menu/ic-open-finder" },
        // 十八轮 P3：打开文件所在的位置▸——动态列出已安装的第三方文件管理器
        ...fileManagers.value.map((fm2) => ({
          key: `reveal-app:${fm2.name}`,
          label: `在${fm2.name}中打开`,
          icon: "context-menu/ic-open-finder",
          disabled: !isSingle
        })),
        { key: "d1", divider: true },
        { key: "plugins", label: "插件…", icon: "ic-toolbar-plugin" },
        { key: "d2", divider: true },
        {
          key: "add-last-folder",
          label: "添加至上次使用的文件夹…",
          icon: "context-menu/ic-folder-add-to",
          disabled: !lastFolderId
        },
        { key: "add-folder", label: "添加至文件夹…", icon: "context-menu/ic-folder-add-to" },
        {
          key: "new-folder-with",
          label: ids.length > 1 ? `用所选项目新建文件夹（${ids.length} 项）` : "用所选项目新建文件夹",
          icon: "context-menu/ic-folder-new-with-selection"
        },
        { key: "add-album", label: "加入相册…", icon: "ic_box" },
        { key: "move-lib", label: "添加至其它资源库…", icon: "context-menu/ic-library-add-to" },
        { key: "export", label: "导出…", icon: "context-menu/ic-export" },
        { key: "export-csv", label: "导出 CSV…", icon: "context-menu/ic-export-csv" },
        ...ids.length >= 2 ? [
          {
            key: "collage",
            label: `创建拼图（${ids.length} 张）`,
            icon: "context-menu/ic-file-combine",
            disabled: !byIds(ids).every((p2) => p2.kind === "image")
          }
        ] : [],
        // F3（Eagle 格式转换器）：转换为子菜单
        {
          key: "convert",
          label: "转换为…",
          icon: "context-menu/ic-export",
          children: [
            { key: "webp", label: "WebP（质量 82）" },
            { key: "png", label: "PNG" },
            { key: "jpg", label: "JPG" },
            { key: "avif", label: "AVIF" },
            { key: "custom", label: "质量 / 尺寸自定…" }
          ]
        },
        { key: "d3", divider: true },
        { key: "share", label: "分享", icon: "ic_earth" },
        { key: "d4", divider: true },
        {
          key: "batch-rename",
          label: ids.length > 1 ? `批量重命名（${ids.length} 项）…` : "批量重命名…",
          icon: "context-menu/ic-rename"
        },
        {
          key: "ai-batch-meta",
          label: `AI 摘要与标签（${ids.length} 项）…`,
          icon: "context-menu/ic-ai"
        },
        { key: "rename", label: "重命名 ⌘R", icon: "context-menu/ic-rename", disabled: !isSingle },
        // F1（Eagle）：剪切 → 目标文件夹 ⌘V 粘贴移动
        { key: "cut", label: "剪切 ⌘X", icon: "context-menu/ic-file-copy" },
        // 复制…▸（Eagle 4 子菜单形态；原 10 项平铺收敛）
        {
          key: "copy-more",
          label: "复制…",
          icon: "context-menu/ic-file-copy",
          children: [
            { key: "copy", label: "复制文件 ⌘C" },
            { key: "copy-path", label: "复制文件路径 ⌥⌘C" },
            { key: "copy-title", label: "复制标题", disabled: !isSingle },
            {
              key: "copy-tags",
              label: "复制标签",
              disabled: !isSingle || photo.tags.length === 0
            },
            { key: "copy-url", label: "复制来源 URL", disabled: !isSingle || !photo.sourceUrl },
            { key: "copy-desc", label: "复制注释", disabled: !isSingle || !photo.description },
            { key: "copy-folder-path", label: "复制文件夹路径", disabled: !isSingle },
            { key: "copy-thumb", label: "复制缩略图", disabled: !isSingle },
            { key: "copy-base64", label: "复制 Base64", disabled: !isSingle }
          ]
        },
        { key: "paste-tags", label: "粘贴标签 ⌘V", icon: "context-menu/ic-tag-paste" },
        { key: "d5", divider: true },
        { key: "duplicate", label: "创建副本 ⌘D", icon: "context-menu/ic-clone", disabled: !isSingle },
        { key: "replace-file", label: "替换文件…", icon: "ic_refresh", disabled: !isSingle },
        // F11：断链素材重新定位
        ...photo.missingAt ? [
          {
            key: "relink-file",
            label: "重新定位文件…",
            icon: "ic_refresh",
            disabled: !isSingle
          }
        ] : [],
        // 视频/GIF：重新抓取封面帧（Eagle 设当前画面为封面/刷新缩略图的落地版）
        ...photo.kind === "video" || photo.fileName.toLowerCase().endsWith(".gif") ? [
          {
            key: "reextract-cover",
            label: "重新抓取封面",
            icon: "context-menu/ic-video-update-thumbnail",
            disabled: !isSingle
          },
          {
            key: "copy-frame",
            label: "拷贝当前画面",
            icon: "context-menu/ic-file-copy",
            disabled: !isSingle
          },
          {
            key: "save-frame",
            label: "保存当前画面",
            icon: "context-menu/ic-export",
            disabled: !isSingle
          }
        ] : [],
        { key: "refresh-thumb", label: "刷新缩略图", icon: "context-menu/ic-video-update-thumbnail" },
        { key: "reanalyze-color", label: "重新分析颜色", icon: "context-menu/ic-filter-item-color" },
        { key: "similar", label: "以图搜图", icon: "context-menu/ic-search-by-image" },
        {
          key: "reverse-search",
          label: "以图找图（谷歌）",
          icon: "context-menu/ic-reverse-search",
          disabled: !isSingle
        },
        { key: "gray-preview", label: "黑白预览", icon: "context-menu/ic-grayscale" },
        // 缩略图背景▸（Eagle 子菜单形态）
        { key: "d-thumbbg", divider: true },
        {
          key: "thumbbg",
          label: "缩略图背景…",
          icon: "context-menu/ic-file-transparent-grid",
          children: [
            {
              key: "auto",
              label: "自动",
              checked: tabs.active.display.thumbBackground === "auto"
            },
            {
              key: "white",
              label: "白色",
              checked: tabs.active.display.thumbBackground === "white"
            },
            {
              key: "dark",
              label: "深色棋盘",
              checked: tabs.active.display.thumbBackground === "dark"
            },
            {
              key: "transparent",
              label: "透明",
              checked: tabs.active.display.thumbBackground === "transparent"
            }
          ]
        },
        {
          key: "brief",
          label: "进入简报模式 F5",
          icon: "player/ic-toolbar-play",
          disabled: !isSingle
        },
        {
          key: "advanced",
          label: "进入高级模式 F8",
          icon: "player/ic-toolbar-fullscreen",
          disabled: !isSingle
        },
        { key: "d6", divider: true },
        { key: "pin", label: photo.pinnedAt ? "取消置顶" : "置顶", icon: "ic-toolbar-pin" },
        {
          key: "set-cover",
          label: "设为文件夹封面",
          icon: "context-menu/ic-folder-set-cover",
          disabled: !isSingle || !filters.activeFolder.value
        },
        {
          key: "set-wallpaper",
          label: "设为壁纸",
          icon: "ic_texture",
          disabled: ids.length > 1 || photo.kind !== "image",
          // 父项与首子项都是自动适配（父项在子菜单展开时不易点，故子菜单里也给出）
          children: ["auto", "cover", "blurred", "original"].map((key) => ({
            key,
            label: key === "auto" ? `${MODE_LABEL.auto}（按屏判定）` : MODE_LABEL[key]
          }))
        },
        {
          key: "favorite",
          label: photo.isFavorite ? "取消收藏" : "收藏",
          icon: photo.isFavorite ? "context-menu/ic-favorite-remove" : "ic_star"
        },
        ...[1, 2, 3, 4, 5].map((n2) => ({
          key: `rate-${n2}`,
          label: "★".repeat(n2),
          checked: byIds(ids).every((p2) => p2.rating === n2)
        })),
        { key: "rate-0", label: "清除评分", disabled: byIds(ids).every((p2) => p2.rating === 0) }
      ];
      if (filters.activeAlbum.value) {
        items2.push({
          key: "remove-from-album",
          label: `移出「${filters.activeAlbum.value.name}」`,
          icon: "ic-modal-close"
        });
      }
      if (filters.activeFolder.value) {
        items2.push({
          key: "remove-from-folder",
          label: `移出「${filters.activeFolder.value.name}」`,
          icon: "ic-modal-close"
        });
      }
      items2.push({ key: "d7", divider: true });
      items2.push({
        key: "delete",
        label: "丢到回收站 ⌘⌫",
        icon: "context-menu/ic-file-move-trash",
        danger: true
      });
      menu.open(
        x2,
        y2,
        items2,
        (rawKey) => {
          void (async () => {
            try {
              await handleMenuAction(rawKey, ids, photo);
            } catch (err) {
              useToast().error("操作失败", { description: err.message });
            }
          })();
        },
        { searchable: true }
      );
    }
    async function handleMenuAction(rawKey, ids, photo) {
      {
        let key = rawKey;
        if (key.startsWith("sub:copy-more:")) key = key.slice("sub:copy-more:".length);
        if (key.startsWith("sub:thumbbg:")) key = `thumbbg-${key.slice("sub:thumbbg:".length)}`;
        if (key.startsWith("sub:set-wallpaper:"))
          key = `wallpaper-${key.slice("sub:set-wallpaper:".length)}`;
        if (key === "new-window") {
          void window.api.createNewWindow(`/photos?boot-view=${encodeURIComponent(tabs.activeView)}`);
        } else if (key === "plugins") {
          window.dispatchEvent(new CustomEvent("leaf:open-plugins"));
        } else if (key === "add-last-folder") {
          const fid = localStorage.getItem("leaf.last-used-folder");
          if (fid) {
            actions.addToFolder(fid, ids);
            useToast().success(`已添加 ${ids.length} 项至文件夹`);
          }
        } else if (key === "share") {
          const paths = byIds(ids).map((p2) => p2.filePath);
          const opened = await window.api.system.shareFiles(paths);
          if (opened) {
            useToast().success("分享面板已打开");
          } else {
            const ok = await window.api.photos.copyToClipboard(paths);
            if (ok) useToast().success("已复制文件", { description: "可在 Finder / 聊天应用粘贴分享" });
            else useToast().error("分享失败", { description: "文件不存在或已被移动" });
          }
        } else if (key === "open") {
          onPreviewPhoto(photo);
        } else if (key === "favorite") {
          for (const id3 of ids) void actions.handleToggleFavorite(id3);
        } else if (key.startsWith("rate-")) {
          const rating = Number(key.slice(5));
          for (const id3 of ids) void actions.handleSetRating(id3, rating);
        } else if (key === "rename") {
          beginInlineRename(photo);
        } else if (key === "open-default") {
          const ok = await window.api.photos.openWithDefault(photo.filePath);
          if (!ok) useToast().error("打开失败", { description: "文件不存在或已被移动" });
        } else if (key === "open-with") {
          const appPath = await window.api.system.pickApp();
          if (appPath) {
            const ok = await window.api.system.openWith(photo.filePath, appPath);
            if (!ok) useToast().error("打开失败", { description: "无法用所选应用打开文件" });
          }
        } else if (key === "pin") {
          const target = !photo.pinnedAt;
          for (const id3 of ids) {
            const updated = await window.api.photos.setPinned(id3, target);
            if (updated) data.replacePhotoLocal(updated);
          }
        } else if (key === "set-cover") {
          if (filters.activeFolder.value) {
            await window.api.photos.setFolderCover(filters.activeFolder.value.id, photo.id);
            await data.loadFolders();
            useToast().success("已设为文件夹封面", { description: photo.fileName });
          }
        } else if (key === "copy-path") {
          await window.api.photos.copyText(
            byIds(ids).map((p2) => p2.filePath).join("\n")
          );
          useToast().success("已复制文件路径");
        } else if (key === "copy-title") {
          const base2 = photo.fileName.replace(/\.[^.]+$/, "");
          await window.api.photos.copyText(base2);
          useToast().success("已复制标题", { description: base2 });
        } else if (key === "copy-tags") {
          await window.api.photos.copyText(photo.tags.join(", "));
          useToast().success("已复制标签", { description: photo.tags.join(", ") });
        } else if (key === "copy-url") {
          if (photo.sourceUrl) {
            await window.api.photos.copyText(photo.sourceUrl);
            useToast().success("已复制来源 URL", { description: photo.sourceUrl });
          }
        } else if (key === "copy-desc") {
          if (photo.description) {
            await window.api.photos.copyText(photo.description);
            useToast().success("已复制注释");
          }
        } else if (key === "paste-tags") {
          const raw = await window.api.photos.getClipboardText();
          const tags = raw.split(/[\s,，、]+/).map((t3) => t3.trim()).filter(Boolean);
          if (tags.length === 0) {
            useToast().warning("剪贴板中没有可用的标签", {
              description: "请先复制标签或输入标签文本"
            });
            return;
          }
          for (const tag of tags) await actions.addTagToMany(ids, tag);
          useToast().success(`已粘贴 ${tags.length} 个标签`);
        } else if (key === "duplicate") {
          const created = await window.api.photos.duplicate(photo.id);
          await loadAll();
          useToast().success("已创建副本", {
            description: created.fileName,
            action: {
              label: "在访达中打开",
              onClick: () => actions.revealInFolder([created])
            }
          });
        } else if (key === "replace-file") {
          const result2 = await window.api.photos.replaceFile(photo.id);
          if (result2.ok) {
            await loadAll();
            useToast().success("已替换文件", {
              description: "标签、评分和分类已保留，正在重建缩略图"
            });
          } else if (result2.error !== "已取消") {
            useToast().error("替换失败", { description: result2.error });
          }
        } else if (key === "relink-file") {
          try {
            const res = await window.api.storage.relinkPhoto(photo.id);
            if (res.ok) {
              await loadAll();
              useToast().success("已重新定位", {
                description: res.photo?.filePath
              });
            } else if (res.error !== "已取消") {
              useToast().error("重新定位失败", { description: res.error });
            }
          } catch (error2) {
            useToast().error("重新定位失败", { description: error2.message });
          }
        } else if (key === "gray-preview") {
          toggleGrayscale();
        } else if (key.startsWith("thumbbg-")) {
          const mode = key.slice(8);
          tabs.active.display.thumbBackground = mode;
          const label = { auto: "自动", white: "白色", dark: "深色棋盘", transparent: "透明" }[mode];
          useToast().info(`缩略图背景：${label}`);
        } else if (key === "cut") {
          clipboard.cutSelection(ids);
        } else if (key.startsWith("sub:convert:")) {
          const child = key.slice("sub:convert:".length);
          if (child === "custom") convertIds.value = ids;
          else void actions.convertTo(ids, child);
        } else if (key === "copy-folder-path") {
          const p2 = byIds(ids)[0];
          if (p2) {
            const dir = p2.filePath.slice(
              0,
              Math.max(p2.filePath.lastIndexOf("/"), p2.filePath.lastIndexOf("\\"))
            );
            const ok = await window.api.photos.copyText(dir);
            if (ok) useToast().success("已复制文件夹路径", { description: dir });
          }
        } else if (key === "copy-thumb") {
          const ok = await window.api.photos.copyThumbToClipboard(photo.id);
          if (ok) useToast().success("已复制缩略图", { description: "可在聊天/文档应用直接粘贴" });
          else useToast().error("复制失败", { description: "缩略图尚未生成或不可读" });
        } else if (key === "copy-base64") {
          const r2 = await window.api.photos.copyBase64(photo.id);
          if (r2.ok) useToast().success("已复制 Base64", { description: "原文件编码，5MB 以内" });
          else useToast().error("复制失败", { description: r2.error });
        } else if (key === "copy") {
          const paths = byIds(ids).map((p2) => p2.filePath);
          const ok = await window.api.photos.copyToClipboard(paths);
          if (ok)
            useToast().success(`已复制 ${paths.length} 个文件`, { description: "可在 Finder 粘贴" });
          else useToast().error("复制失败", { description: "文件不存在或已被移动" });
        } else if (key === "move-lib") {
          requestPrompt({
            title: `移动 ${ids.length} 项到资源库`,
            label: "目标资源库名称",
            initialValue: "",
            confirmLabel: "移动",
            onSubmit: async (name) => {
              const res = await window.api.libraries.list();
              const target = res.libraries.find((l2) => !l2.active && l2.name === name.trim());
              if (!target) {
                useToast().error("未找到该资源库", { description: name });
                return;
              }
              const result2 = await window.api.libraries.moveTo(target.id, ids);
              useToast().success("移动完成", {
                description: `已移动 ${result2.moved} 项；目标库已有重复跳过 ${result2.skipped} 项`,
                action: {
                  label: `前往「${target.name}」`,
                  onClick: () => void window.api.libraries.switchTo(target.id)
                }
              });
              clearSelection();
              await loadAll();
            }
          });
        } else if (key === "set-wallpaper" || key.startsWith("wallpaper-")) {
          const mode = key === "set-wallpaper" ? "auto" : key.slice("wallpaper-".length);
          await wallpaper.set(photo, mode);
        } else if (key === "add-album") {
          albumModalOpen.value = true;
        } else if (key === "add-folder") {
          actions.openFolderModal();
        } else if (key === "export") {
          void actions.exportSelected(ids);
        } else if (key === "export-csv") {
          void actions.exportCsv(ids);
        } else if (key === "advanced") {
          inspectorExpanded.value = !inspectorExpanded.value;
        } else if (key === "refresh-thumb") {
          const r2 = await window.api.photos.reanalyzeAssets(ids, { thumbs: true, palette: false });
          if (r2.ok > 0) {
            await loadAll();
            useToast().success(`已刷新 ${r2.ok} 张缩略图`);
          } else useToast().error("刷新失败", { description: "没有可处理的图片/视频" });
        } else if (key === "reanalyze-color") {
          const r2 = await window.api.photos.reanalyzeAssets(ids, { thumbs: false, palette: true });
          if (r2.ok > 0) {
            await loadAll();
            useToast().success(`已重新分析 ${r2.ok} 项的主色`);
          } else useToast().error("分析失败", { description: "没有可处理的图片/视频" });
        } else if (key === "batch-rename") {
          batchRenameOpen.value = true;
        } else if (key === "ai-batch-meta") {
          aiBatch.run(ids);
        } else if (key === "new-folder-with") {
          requestPrompt({
            title: ids.length > 1 ? `用所选项目新建文件夹（${ids.length} 项）` : "用所选项目新建文件夹",
            label: "文件夹名称",
            initialValue: "",
            confirmLabel: "创建",
            onSubmit: async (name) => {
              const folder = await window.api.photos.createPhotoFolder(name.trim(), null);
              await data.loadFolders();
              actions.addToFolder(folder.id, ids);
              useToast().success("文件夹已创建", {
                description: `已将 ${ids.length} 项添加至「${name.trim()}」`
              });
            }
          });
        } else if (key === "reextract-cover") {
          const r2 = await window.api.photos.reextractVideoCover(ids);
          if (r2.ok > 0) {
            await loadAll();
            useToast().success(`已重新抓取 ${r2.ok} 张封面`);
          } else useToast().error("抓取失败", { description: "没有可处理的视频/GIF" });
        } else if (key === "copy-frame") {
          const r2 = await window.api.photos.copyVideoFrame(photo.id);
          if (r2.ok) useToast().success("画面已复制", { description: "可在聊天/文档应用粘贴" });
          else useToast().error("拷贝失败", { description: r2.error });
        } else if (key === "save-frame") {
          const r2 = await window.api.photos.saveVideoFrame(photo.id);
          if (r2.ok) {
            await loadAll();
            useToast().success("画面已入库", { description: r2.filePath?.split(/[\\/]/).pop() });
          } else useToast().error("保存失败", { description: r2.error });
        } else if (key === "collage") {
          const r2 = await window.api.photos.createCollage(ids);
          if (r2.ok) {
            await loadAll();
            useToast().success("拼图已创建并入库", { description: r2.filePath?.split(/[\\/]/).pop() });
          } else useToast().error("创建拼图失败", { description: r2.error });
        } else if (key === "reverse-search") {
          const ok = await window.api.photos.copyToClipboard([photo.filePath]);
          if (ok) {
            void window.api.system.openExternal("https://images.google.com/");
            useToast().success("已复制图片并打开谷歌识图", {
              description: "在网页搜索框使用 ⌘V 粘贴图片"
            });
          } else useToast().error("以图找图失败", { description: "文件不存在或已被移动" });
        } else if (key === "brief") {
          briefMode.value = true;
          onPreviewPhoto(photo);
        } else if (key === "similar") {
          void scan.handleFindSimilar(photo.id);
        } else if (key === "reveal") {
          actions.revealInFolder(byIds(ids));
        } else if (key.startsWith("reveal-app:")) {
          const fmName = key.slice(11);
          const fm2 = fileManagers.value.find((f2) => f2.name === fmName);
          if (fm2) {
            const ok = await window.api.system.revealInApp(photo.filePath, fm2.appPath);
            if (!ok) useToast().error("打开失败", { description: `无法在 ${fmName} 中打开` });
          }
        } else if (key === "remove-from-album" && filters.activeAlbum.value) {
          actions.removeSelectedFromAlbum(filters.activeAlbum.value.id, ids);
        } else if (key === "remove-from-folder" && filters.activeFolder.value) {
          actions.removeSelectedFromFolder(filters.activeFolder.value.id, ids);
        } else if (key === "delete") {
          actions.handleDeleteIds(ids);
        }
      }
    }
    function byIds(ids) {
      return data.byIds(ids);
    }
    function openFolderFromInspector(folderId) {
      const folder = data.folders.value.find((f2) => f2.id === folderId);
      tabs.setView(`folder:${folderId}`, folder?.name ?? "文件夹");
      router.push("/photos").catch(() => {
      });
    }
    useDeepLink((target) => void openFromDeepLink(target));
    async function openFromDeepLink(target) {
      if (target.kind === "folder") {
        if (!data.folders.value.some((f2) => f2.id === target.id)) {
          toast2.warning("链接里的文件夹不在当前资源库");
          return;
        }
        openFolderFromInspector(target.id);
        return;
      }
      const photo = await window.api.photos.getById(target.id);
      if (!photo) {
        toast2.warning("链接里的素材不在当前资源库");
        return;
      }
      router.push("/photos").catch(() => {
      });
      onPreviewPhoto(photo);
    }
    function onPreviewFindSimilar(photoId) {
      void scan.handleFindSimilar(photoId);
    }
    function onPreviewDelete(photoId) {
      preview.close();
      actions.deleteIdsConfirmed([photoId]);
    }
    function onPreviewPhoto(photo) {
      preview.openPhoto(photo);
      void data.setLastViewed(photo.id);
    }
    function onOpenPhotoExternal(photo) {
      void window.api.system.openPath(photo.filePath).then((ok) => {
        if (!ok) {
          useToast().error("打开失败", { description: "文件不存在或已被移动" });
        }
      });
    }
    function onPreviewById(id3) {
      preview.openById(id3);
      void data.setLastViewed(id3);
    }
    function onAddTag(photo) {
      const ids = [photo.id];
      requestPrompt({
        title: "添加标签",
        label: "标签名称",
        initialValue: "",
        confirmLabel: "添加",
        onSubmit: async (tag) => {
          await actions.addTagToMany(ids, tag);
        }
      });
    }
    keyboard.bind({
      selectedIds,
      isSelectionMode,
      anyModalOpen,
      // D-012：搜索框移入 TitleBar，⌘F/⌘J 直接聚焦其输入框
      focusSearch: () => document.getElementById("library-search")?.focus(),
      // 八轮：⌘⇧N 新增文件夹 / ⌘⇧T 标签筛选（Eagle keybinds）
      createFolder: () => actions.createFolderInline(),
      openTagFilter: () => filterBarRef.value?.openTagFilter(),
      beginRename: () => {
        if (selectedIds.value.length !== 1) return;
        const only = data.byIds(selectedIds.value)[0];
        if (only) beginInlineRename(only);
      },
      toggleAdvancedMode: () => {
        inspectorExpanded.value = !inspectorExpanded.value;
      },
      toggleGrayscale,
      // 十八轮 P3 F5：简报模式——预览已开则切换；未开则用选中项/导航项打开预览并进入简报
      isBriefMode: () => briefMode.value,
      toggleBriefMode: () => {
        if (previewPhoto.value) {
          briefMode.value = !briefMode.value;
          return;
        }
        const targetId = selectedIds.value.length === 1 ? selectedIds.value[0] : keyboard.navActiveId.value;
        if (targetId) {
          const p2 = data.byIds([targetId])[0];
          if (p2) {
            briefMode.value = true;
            onPreviewPhoto(p2);
          }
        }
      },
      duplicateSelected: () => {
        if (selectedIds.value.length !== 1) return;
        void window.api.photos.duplicate(selectedIds.value[0]).then((created) => {
          void loadAll();
          useToast().success("已创建副本", { description: created.fileName });
        });
      },
      copyPath: () => {
        void window.api.photos.copyText(
          data.byIds(selectedIds.value).map((p2) => p2.filePath).join("\n")
        ).then(() => useToast().success("已复制文件路径"));
      },
      // 对齐菜单「复制文件 ⌘C」：原文件进系统剪贴板（Finder 可粘贴）
      copyFiles: () => {
        void (async () => {
          const paths = data.byIds(selectedIds.value).map((p2) => p2.filePath);
          const ok = await window.api.photos.copyToClipboard(paths);
          if (ok) {
            useToast().success(`已复制 ${paths.length} 个文件`, { description: "可在 Finder 粘贴" });
          } else {
            useToast().error("复制失败", { description: "文件不存在或已被移动" });
          }
        })();
      },
      scrollToPhoto: (id3) => {
        document.querySelector(`[data-photo-id="${id3}"]`)?.scrollIntoView({ block: "nearest" });
      },
      selectMaybeAll: () => selectAll(filters.flatDisplayPhotos.value.map((p2) => p2.id))
    });
    function anyModalOpen() {
      return folderModalOpen.value || albumModalOpen.value || batchRenameOpen.value || smartAlbumModalOpen.value || bookmarkModalOpen.value || lockModalOpen.value || pendingConfirm.value !== null || pendingPrompt.value !== null || previewPhoto.value !== null;
    }
    watch(
      () => tabs.activeView,
      () => {
        selectedIds.value = [];
        isSelectionMode.value = false;
        preview.close();
        briefMode.value = false;
        keyboard.clearNav();
      }
    );
    watch(previewPhoto, (p2) => {
      if (!p2) briefMode.value = false;
    });
    watch(
      () => [
        filters.activeAlbum.value?.name,
        filters.activeFolder.value?.name,
        filters.activeSmartAlbum.value?.name
      ],
      () => {
        const view = tabs.activeView;
        if (view.startsWith("album:") && filters.activeAlbum.value) {
          tabs.syncTitle(filters.activeAlbum.value.name);
        } else if (view.startsWith("folder:") && filters.activeFolder.value) {
          tabs.syncTitle(filters.activeFolder.value.name);
        } else if (view.startsWith("smart:") && filters.activeSmartAlbum.value) {
          tabs.syncTitle(filters.activeSmartAlbum.value.name);
        }
      }
    );
    function replaceSelection(ids) {
      clearSelection();
      for (const id3 of ids) handleSelectPhoto(id3, true);
      keyboard.navActiveId.value = ids.length === 1 ? ids[0] : null;
    }
    const loadAll = async () => {
      await Promise.all([
        data.loadPhotos(),
        data.loadSmartAlbums(),
        data.loadAlbums(),
        data.loadFolders(),
        data.loadRecycleBin()
      ]);
    };
    let unbindKeyboard = null;
    let unbindAiBatch = null;
    let unbindProcessing = null;
    let unbindViewWatcher = null;
    let unbindDrag = null;
    let unbindPaste = null;
    let unbindBackfilled = null;
    const refreshHandler = () => void data.loadPhotos();
    const fileManagers = ref([]);
    onMounted(async () => {
      unbindKeyboard = keyboard.bindWindow();
      unbindAiBatch = aiBatch.bind();
      unbindProcessing = bindProcessingProgress();
      unbindViewWatcher = bindViewWatcher();
      unbindDrag = photoImport.bindWindowDrag();
      unbindPaste = photoImport.bindWindowPaste();
      unbindBackfilled = window.api.photos.onBackfilled(() => void data.loadPhotos());
      window.addEventListener("leaf:refresh-photos", refreshHandler);
      onUnmounted(() => window.removeEventListener("leaf:refresh-photos", refreshHandler));
      void actions.refreshLockState();
      void loadAll();
      try {
        fileManagers.value = await window.api.system.listFileManagers();
      } catch {
        fileManagers.value = [];
      }
    });
    onUnmounted(() => {
      unbindKeyboard?.();
      unbindAiBatch?.();
      unbindProcessing?.();
      unbindViewWatcher?.();
      unbindDrag?.();
      unbindPaste?.();
      unbindBackfilled?.();
      search.dispose();
      clearSelection();
      for (const key of [
        "tagManagerOpen",
        "smartAlbumModalOpen",
        "albumModalOpen",
        "folderModalOpen",
        "batchRenameOpen",
        "bookmarkModalOpen",
        "lockModalOpen"
      ]) {
        actions[key].value = false;
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        unref(locked) ? (openBlock(), createElementBlock("div", _hoisted_2, [
          _cache[21] || (_cache[21] = createBaseVNode("span", { class: "text-6xl" }, "🔒", -1)),
          _cache[22] || (_cache[22] = createBaseVNode("p", { class: "text-lg text-fg-primary" }, "素材库已锁定", -1)),
          createBaseVNode("div", _hoisted_3, [
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => isRef(unlockPassword) ? unlockPassword.value = $event : null),
              type: "password",
              placeholder: "输入密码解锁",
              class: "w-56 rounded-md border border-line-default bg-surface-1 h-8 px-3 text-sm text-fg-primary focus:outline-none focus:border-brand-500",
              onKeyup: _cache[1] || (_cache[1] = withKeys(
                //@ts-ignore
                (...args) => unref(actions).handleUnlock && unref(actions).handleUnlock(...args),
                ["enter"]
              ))
            }, null, 544), [
              [vModelText, unref(unlockPassword)]
            ]),
            createVNode(_sfc_main$N, {
              variant: "primary",
              onClick: unref(actions).handleUnlock
            }, {
              default: withCtx(() => [..._cache[20] || (_cache[20] = [
                createTextVNode("解锁", -1)
              ])]),
              _: 1
            }, 8, ["onClick"])
          ])
        ])) : createCommentVNode("", true),
        createVNode(Transition, { name: "fade" }, {
          default: withCtx(() => [
            unref(importDragActive) ? (openBlock(), createElementBlock("div", _hoisted_4, [
              createBaseVNode("div", _hoisted_5, [
                createVNode(_sfc_main$L, {
                  icon: "context-menu/ic-import-local",
                  size: 28,
                  class: "mx-auto mb-2 text-brand-400"
                }),
                _cache[23] || (_cache[23] = createBaseVNode("p", { class: "text-sm font-medium" }, "松开以导入素材", -1))
              ])
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        }),
        createBaseVNode("div", _hoisted_6, [
          createVNode(TitleBar),
          createBaseVNode("div", _hoisted_7, [
            withDirectives(createBaseVNode("div", _hoisted_8, [
              createVNode(_sfc_main$r)
            ], 512), [
              [vShow, unref(panelVisible)]
            ]),
            createBaseVNode("div", _hoisted_9, [
              withDirectives(createVNode(FilterBar, {
                ref_key: "filterBarRef",
                ref: filterBarRef
              }, null, 512), [
                [vShow, unref(filterBarVisible)]
              ]),
              createBaseVNode("div", {
                ref_key: "contentScrollRef",
                ref: contentScrollRef,
                class: "app-scroll flex min-h-0 flex-1 flex-col overflow-auto",
                onContextmenu: withModifiers(openBlankContextMenu, ["prevent"])
              }, [
                unref(filters).isDuplicateView.value ? (openBlock(), createBlock(_sfc_main$a, {
                  key: 0,
                  groups: unref(scan).duplicateGroups.value,
                  loading: unref(scan).duplicateLoading.value,
                  threshold: unref(scan).SIMILARITY_THRESHOLD,
                  "scan-label": unref(scan).scanLabel.value,
                  onRemoveOthers: unref(scan).handleRemoveOthers,
                  onPreviewPhoto: unref(preview).openPhoto,
                  onOpenScanSettings: unref(scan).openDuplicateScan
                }, null, 8, ["groups", "loading", "threshold", "scan-label", "onRemoveOthers", "onPreviewPhoto", "onOpenScanSettings"])) : unref(filters).isMapView.value ? (openBlock(), createElementBlock("div", _hoisted_10, [
                  createVNode(_sfc_main$9, {
                    photos: unref(allPhotos),
                    loading: unref(loading),
                    onSelectPhoto: onPreviewById
                  }, null, 8, ["photos", "loading"])
                ])) : effectiveLayout.value === "freeform" ? (openBlock(), createBlock(_sfc_main$1, {
                  key: 2,
                  photos: unref(filters).flatDisplayPhotos.value,
                  "selected-set": selectedSet.value,
                  onClickSelect: unref(keyboard).handleClickSelect,
                  onPreviewPhoto,
                  onContextMenu: openPhotoContextMenu
                }, null, 8, ["photos", "selected-set", "onClickSelect"])) : effectiveLayout.value === "list" ? (openBlock(), createBlock(PhotoListView, {
                  key: 3,
                  sections: unref(filters).displaySections.value,
                  "selected-set": selectedSet.value,
                  "is-selection-mode": unref(isSelectionMode),
                  loading: unref(loading),
                  mode: unref(filters).isTrashView.value ? "trash" : "normal",
                  "has-more": hasMoreForView.value,
                  "nav-active-id": unref(keyboard).navActiveId.value,
                  "renaming-id": renamingId.value,
                  onSelectPhoto: unref(handleSelectPhoto),
                  onPreviewPhoto,
                  onOpenPhoto: onOpenPhotoExternal,
                  onRestorePhoto: _cache[2] || (_cache[2] = ($event) => unref(actions).handleRestoreIds([$event])),
                  onContextMenu: openPhotoContextMenu,
                  onDragPhotos: handleDragPhotos,
                  onClickSelect: unref(keyboard).handleClickSelect,
                  onMarqueeSelect: replaceSelection,
                  onRenameCommit,
                  onRenameCancel: _cache[3] || (_cache[3] = ($event) => renamingId.value = null),
                  onLoadMore
                }, null, 8, ["sections", "selected-set", "is-selection-mode", "loading", "mode", "has-more", "nav-active-id", "renaming-id", "onSelectPhoto", "onClickSelect"])) : (openBlock(), createBlock(PhotoGrid, {
                  key: 4,
                  sections: unref(filters).displaySections.value,
                  "selected-set": selectedSet.value,
                  "is-selection-mode": unref(isSelectionMode),
                  loading: unref(loading),
                  layout: effectiveLayout.value,
                  "thumb-size": unref(filters).tab.value.thumbSize,
                  display: unref(filters).viewDisplay.value,
                  mode: unref(filters).isTrashView.value ? "trash" : "normal",
                  "has-more": hasMoreForView.value,
                  "nav-active-id": unref(keyboard).navActiveId.value,
                  "renaming-id": renamingId.value,
                  onLoadMore,
                  onRenameCommit,
                  onRenameCancel: _cache[4] || (_cache[4] = ($event) => renamingId.value = null),
                  onImportFolder: _cache[5] || (_cache[5] = ($event) => unref(actions).handleImportFolder()),
                  onInstallExtension: _cache[6] || (_cache[6] = ($event) => extensionGuideOpen.value = true),
                  onSelectPhoto: unref(handleSelectPhoto),
                  onPreviewPhoto,
                  onOpenPhoto: onOpenPhotoExternal,
                  onToggleFavorite: unref(actions).handleToggleFavorite,
                  onRestorePhoto: _cache[7] || (_cache[7] = ($event) => unref(actions).handleRestoreIds([$event])),
                  onContextMenu: openPhotoContextMenu,
                  onDragPhotos: handleDragPhotos,
                  onAddTag,
                  onClickSelect: unref(keyboard).handleClickSelect,
                  onMarqueeSelect: replaceSelection
                }, null, 8, ["sections", "selected-set", "is-selection-mode", "loading", "layout", "thumb-size", "display", "mode", "has-more", "nav-active-id", "renaming-id", "onSelectPhoto", "onToggleFavorite", "onClickSelect"]))
              ], 544)
            ])
          ])
        ]),
        showInspector.value ? (openBlock(), createBlock(PhotoInspector, {
          key: 1,
          photos: unref(data).byIds(unref(selectedIds)),
          expanded: inspectorExpanded.value,
          onClose: unref(clearSelection),
          onOpenFolder: openFolderFromInspector,
          onAddToFolder: _cache[8] || (_cache[8] = ($event) => unref(actions).openFolderModal()),
          onRelinked: loadAll
        }, null, 8, ["photos", "expanded", "onClose"])) : unref(filters).activeFolder.value && !unref(previewPhoto) ? (openBlock(), createBlock(_sfc_main$g, {
          key: 2,
          folder: unref(filters).activeFolder.value,
          onChanged: loadAll,
          onOpenSettings: _cache[9] || (_cache[9] = ($event) => unref(actions).openFolderSettings(unref(filters).activeFolder.value?.id ?? null))
        }, null, 8, ["folder"])) : showLibraryInfo.value ? (openBlock(), createBlock(_sfc_main$f, {
          key: 3,
          photos: unref(filters).flatDisplayPhotos.value
        }, null, 8, ["photos"])) : createCommentVNode("", true),
        unref(previewPhoto) ? (openBlock(), createBlock(PhotoPreview, {
          key: 4,
          photo: unref(previewPhoto),
          grayscale: previewGrayscale.value,
          "brief-mode": briefMode.value,
          photos: unref(filters).flatDisplayPhotos.value,
          onClose: unref(preview).close,
          onPrevious: unref(preview).previous,
          onNext: unref(preview).next,
          onToggleFavorite: unref(actions).handleToggleFavorite,
          onSetRating: unref(actions).handleSetRating,
          onSetDescription: unref(actions).handleSetDescription,
          onAddTag: unref(actions).handleAddTag,
          onRemoveTag: unref(actions).handleRemoveTag,
          onFindSimilar: onPreviewFindSimilar,
          onRenamed: unref(data).loadPhotos,
          onDelete: onPreviewDelete
        }, null, 8, ["photo", "grayscale", "brief-mode", "photos", "onClose", "onPrevious", "onNext", "onToggleFavorite", "onSetRating", "onSetDescription", "onAddTag", "onRemoveTag", "onRenamed"])) : createCommentVNode("", true),
        unref(smartAlbumModalOpen) ? (openBlock(), createBlock(_sfc_main$d, {
          key: 5,
          album: unref(editingSmartAlbum),
          "preset-rules": unref(actions).smartPresetRules.value,
          "available-tags": unref(dictionaryTags),
          onClose: _cache[10] || (_cache[10] = ($event) => smartAlbumModalOpen.value = false),
          onSaved: unref(data).loadSmartAlbums
        }, null, 8, ["album", "preset-rules", "available-tags", "onSaved"])) : createCommentVNode("", true),
        unref(albumModalOpen) ? (openBlock(), createBlock(_sfc_main$8, {
          key: 6,
          "photo-ids-to-add": unref(selectedIds),
          onClose: _cache[11] || (_cache[11] = ($event) => albumModalOpen.value = false),
          onChanged: unref(data).loadAlbums
        }, null, 8, ["photo-ids-to-add", "onChanged"])) : createCommentVNode("", true),
        unref(folderModalOpen) ? (openBlock(), createBlock(_sfc_main$6, {
          key: 7,
          "photo-ids-to-add": unref(selectedIds),
          "initial-parent": unref(actions).folderModalParentId.value,
          "edit-folder-id": unref(actions).folderSettingsId.value ?? void 0,
          onClose: _cache[12] || (_cache[12] = ($event) => folderModalOpen.value = false),
          onChanged: unref(data).loadFolders
        }, null, 8, ["photo-ids-to-add", "initial-parent", "edit-folder-id", "onChanged"])) : createCommentVNode("", true),
        unref(batchRenameOpen) ? (openBlock(), createBlock(_sfc_main$5, {
          key: 8,
          photos: unref(data).byIds(unref(selectedIds)),
          onClose: _cache[13] || (_cache[13] = ($event) => batchRenameOpen.value = false),
          onRenamed: unref(data).loadPhotos
        }, null, 8, ["photos", "onRenamed"])) : createCommentVNode("", true),
        unref(bookmarkModalOpen) ? (openBlock(), createBlock(_sfc_main$c, {
          key: 9,
          onClose: _cache[14] || (_cache[14] = ($event) => bookmarkModalOpen.value = false),
          onSaved: loadAll
        })) : createCommentVNode("", true),
        convertIds.value ? (openBlock(), createBlock(_sfc_main$4, {
          key: 10,
          ids: convertIds.value,
          onClose: _cache[15] || (_cache[15] = ($event) => convertIds.value = null)
        }, null, 8, ["ids"])) : createCommentVNode("", true),
        unref(scan).scanModalOpen.value ? (openBlock(), createBlock(_sfc_main$3, {
          key: 11,
          onClose: _cache[16] || (_cache[16] = ($event) => unref(scan).scanModalOpen.value = false)
        })) : createCommentVNode("", true),
        extensionGuideOpen.value ? (openBlock(), createBlock(ExtensionGuideModal, {
          key: 12,
          onClose: _cache[17] || (_cache[17] = ($event) => extensionGuideOpen.value = false)
        })) : createCommentVNode("", true),
        unref(lockModalOpen) ? (openBlock(), createBlock(_sfc_main$b, {
          key: 13,
          onClose: _cache[18] || (_cache[18] = ($event) => lockModalOpen.value = false),
          onChanged: _cache[19] || (_cache[19] = () => {
            lockModalOpen.value = false;
            void unref(actions).refreshLockState();
          }),
          onLock: unref(actions).handleQuickLock
        }, null, 8, ["onLock"])) : createCommentVNode("", true),
        createVNode(UContextMenu)
      ]);
    };
  }
}
