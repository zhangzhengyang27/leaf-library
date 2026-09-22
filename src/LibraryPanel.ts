/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$r = /* @__PURE__ */ defineComponent(
*/
{
  __name: "LibraryPanel",
  setup(__props) {
    const router = useRouter();
    const route = useRoute();
    const menu = useContextMenu();
    const tabs = useLibraryTabs();
    const data = usePhotoData();
    const actions = usePhotoActions();
    const photoImport = usePhotoImport();
    const fixedItems = computed(() => [
      {
        key: "all",
        view: "all",
        title: "全部",
        icon: "ic_all",
        count: data.sidebarCounts.value.all
      },
      {
        key: "unsorted",
        view: "unsorted",
        title: "未分类",
        icon: "ic_tagUncategorized",
        count: data.unsortedPhotos.value.length
      },
      {
        key: "untagged",
        view: "untagged",
        title: "未标签",
        icon: "ic_untaggeds",
        count: data.sidebarCounts.value.untagged
      },
      {
        key: "recents",
        view: "recents",
        title: "最近使用",
        icon: "ic_clock",
        count: data.sidebarCounts.value.recentViewed
      },
      { key: "random", view: "random", title: "随机模式", icon: "ic_random" },
      { key: "tag-manager", view: "", title: "标签管理", icon: "ic_tagAll" },
      {
        key: "trash",
        view: "trash",
        title: "回收站",
        icon: "ic_trashbin",
        count: data.recycleCount.value
      }
    ]);
    onMounted(() => {
      void data.loadUnsorted();
      void data.loadRecent();
    });
    const smartItems = computed(
      () => data.smartAlbums.value.map((a2) => ({
        key: `smart:${a2.id}`,
        view: `smart:${a2.id}`,
        title: a2.name,
        icon: "context-menu/ic-smart-folder-rule"
      }))
    );
    const albumItems = computed(
      () => data.albums.value.map((a2) => ({
        key: `album:${a2.id}`,
        view: `album:${a2.id}`,
        title: a2.name,
        icon: "ic_box",
        count: a2.photoCount
      }))
    );
    const quickAccessIds = ref(loadQuickAccess());
    function loadQuickAccess() {
      try {
        const raw = localStorage.getItem(QUICK_KEY);
        return new Set(raw ? JSON.parse(raw) : []);
      } catch {
        return /* @__PURE__ */ new Set();
      }
    }
    function toggleQuickAccess(fid) {
      const next = new Set(quickAccessIds.value);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      quickAccessIds.value = next;
      try {
        localStorage.setItem(QUICK_KEY, JSON.stringify([...next]));
      } catch {
      }
    }
    const quickItems = computed(
      () => data.folders.value.filter((f2) => quickAccessIds.value.has(f2.id)).map((f2) => ({
        key: `quick:${f2.id}`,
        view: `folder:${f2.id}`,
        title: f2.name,
        icon: "context-menu/ic-favorite-add",
        count: f2.photoCount
      }))
    );
    const folderSort = ref(loadFolderSort());
    function loadFolderSort() {
      const raw = localStorage.getItem(FOLDER_SORT_KEY);
      return raw === "name" || raw === "created" || raw === "modified" ? raw : "custom";
    }
    function setFolderSort(mode) {
      folderSort.value = mode;
      try {
        localStorage.setItem(FOLDER_SORT_KEY, mode);
      } catch {
      }
    }
    function sortFolderList(list2) {
      const arr = [...list2];
      if (folderSort.value === "name") arr.sort((a2, b2) => a2.name.localeCompare(b2.name, "zh"));
      else if (folderSort.value === "created") arr.sort((a2, b2) => b2.createdAt - a2.createdAt);
      else if (folderSort.value === "modified") arr.sort((a2, b2) => b2.updatedAt - a2.updatedAt);
      return arr;
    }
    function loadExpanded() {
      try {
        const raw = localStorage.getItem(EXPANDED_KEY);
        return new Set(raw ? JSON.parse(raw) : []);
      } catch {
        return /* @__PURE__ */ new Set();
      }
    }
    const expandedFolderIds = ref(loadExpanded());
    function toggleFolderExpand(fid) {
      const next = new Set(expandedFolderIds.value);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      expandedFolderIds.value = next;
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
      } catch {
      }
    }
    const flatFolders = computed(() => {
      const byParent = /* @__PURE__ */ new Map();
      for (const f2 of data.folders.value) {
        const key = f2.parentId ?? null;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push(f2);
      }
      const out = [];
      const walk = (parentId, depth) => {
        for (const f2 of sortFolderList(byParent.get(parentId) ?? [])) {
          const children = byParent.get(f2.id) ?? [];
          const expanded = expandedFolderIds.value.has(f2.id);
          out.push({
            item: {
              key: `folder:${f2.id}`,
              view: `folder:${f2.id}`,
              title: f2.hasPassword && !unlockedFolderIds.value.has(f2.id) ? `${f2.name} 🔒` : f2.name,
              icon: "ic_folder-close",
              count: f2.photoCount,
              color: f2.color ?? EAGLE_FOLDER_COLOR,
              tintIcon: true,
              coverUrl: f2.coverPhotoId ? `thumb://256/${f2.coverPhotoId}` : void 0,
              emoji: f2.icon
            },
            depth,
            hasChildren: children.length > 0,
            expanded
          });
          if (expanded) walk(f2.id, depth + 1);
        }
      };
      walk(null, 0);
      return out;
    });
    const isActive = (view) => tabs.activeView === view;
    const inTagManager = computed(() => String(route.name || "") === "tags");
    const renamingFolderId = computed(() => actions.renamingFolderId.value);
    watch(renamingFolderId, (fid) => {
      if (!fid) return;
      const folder = data.folders.value.find((f2) => f2.id === fid);
      if (!folder) return;
      if (folder.parentId) {
        const next = new Set(expandedFolderIds.value);
        let pid = folder.parentId;
        const seen = /* @__PURE__ */ new Set();
        while (pid && !seen.has(pid)) {
          seen.add(pid);
          next.add(pid);
          pid = data.folders.value.find((f2) => f2.id === pid)?.parentId ?? null;
        }
        expandedFolderIds.value = next;
        try {
          localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
        } catch {
        }
      }
      tabs.setView(`folder:${fid}`, folder.name);
      router.push("/photos").catch(() => {
      });
    });
    function commitFolderRename(fid, value) {
      void actions.commitFolderInlineRename(fid, value);
    }
    function cancelFolderRename() {
      actions.cancelFolderInlineRename();
    }
    function openItem(item) {
      if (item.key === "tag-manager") {
        openTagManager();
        return;
      }
      if (item.view.startsWith("folder:")) {
        const fid = item.view.slice(7);
        const folder = data.folders.value.find((f2) => f2.id === fid);
        if (folder?.hasPassword && !unlockedFolderIds.value.has(fid)) {
          requestPrompt({
            title: `「${folder.name}」已加密`,
            label: "输入文件夹密码",
            initialValue: "",
            confirmLabel: "解锁",
            onSubmit: async (pw) => {
              const ok = await window.api.photos.verifyFolderPassword(fid, pw);
              if (ok) {
                unlockedFolderIds.value.add(fid);
                tabs.setView(item.view, item.title);
                router.push("/photos").catch(() => {
                });
              } else {
                useToast().error("密码错误");
              }
            }
          });
          return;
        }
      }
      tabs.setView(item.view, item.title);
      router.push("/photos").catch(() => {
      });
    }
    function openAlbumMenu(item, e64) {
      menu.open(
        e64.clientX,
        e64.clientY,
        [
          { key: "open", label: "打开", icon: "ic-arrow-right" },
          { key: "d1", divider: true },
          { key: "rename", label: "重命名", icon: "context-menu/ic-rename" },
          { key: "delete", label: "删除相册", icon: "context-menu/ic-file-move-trash", danger: true }
        ],
        (key) => {
          if (key === "open") openItem(item);
          else if (key === "rename") actions.renameAlbumById(item.key.slice(6), item.title);
          else if (key === "delete") actions.deleteAlbumById(item.key.slice(6), item.title);
        }
      );
    }
    const FOLDER_COLORS = [
      { key: "无颜色", hex: "#e8e8e8" },
      { key: "红", hex: "#e54545" },
      { key: "橙", hex: "#f29a3a" },
      { key: "黄", hex: "#e8c93a" },
      { key: "绿", hex: "#5bb85d" },
      { key: "青", hex: "#3ac9d9" },
      { key: "蓝", hex: "#3a7af2" },
      { key: "紫", hex: "#9a5bf2" },
      { key: "粉", hex: "#f25bc8" }
    ];
    function applyFolderColor(fid, hex) {
      void window.api.photos.setFolderColor(fid, hex || null).then(() => data.loadFolders()).catch((err) => useToast().error("设置文件夹颜色失败", { description: err.message }));
    }
    function toggleExpand(fid) {
      toggleFolderExpand(fid);
    }
    function toggleSiblingExpand(fid) {
      const folder = data.folders.value.find((f2) => f2.id === fid);
      const siblings = data.folders.value.filter(
        (f2) => (f2.parentId ?? null) === (folder?.parentId ?? null) && f2.id !== fid
      );
      const allExpanded = siblings.every((f2) => expandedFolderIds.value.has(f2.id));
      const next = new Set(expandedFolderIds.value);
      for (const f2 of siblings) {
        if (allExpanded) next.delete(f2.id);
        else next.add(f2.id);
      }
      expandedFolderIds.value = next;
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
      } catch {
      }
    }
    function toggleAllExpand() {
      if (expandedFolderIds.value.size > 0) {
        expandedFolderIds.value = /* @__PURE__ */ new Set();
      } else {
        expandedFolderIds.value = new Set(data.folders.value.map((f2) => f2.id));
      }
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expandedFolderIds.value]));
      } catch {
      }
    }
    function folderIncludesSubfolders(fid) {
      const f2 = data.folders.value.find((x2) => x2.id === fid);
      if (!f2?.viewDisplay) return false;
      try {
        return JSON.parse(f2.viewDisplay).includeSubfolders === true;
      } catch {
        return false;
      }
    }
    function toggleShowSubContent(fid) {
      const f2 = data.folders.value.find((x2) => x2.id === fid);
      if (!f2) return;
      const display = {};
      if (f2.viewDisplay) {
        try {
          Object.assign(display, JSON.parse(f2.viewDisplay));
        } catch {
        }
      }
      display.includeSubfolders = !display.includeSubfolders;
      void window.api.photos.setFolderViewSettings(fid, {
        layout: f2.viewLayout ?? null,
        sort: f2.viewSort ?? null,
        display: JSON.stringify(display)
      }).then(() => data.loadFolders()).catch((err) => useToast().error("设置失败", { description: err.message }));
    }
    const FOLDER_ICON_EMOJIS = [
      "📁",
      "📂",
      "🗂️",
      "📅",
      "📷",
      "🎨",
      "🎬",
      "🎵",
      "💼",
      "🏠",
      "⭐",
      "❤️",
      "🔥",
      "📚",
      "💡",
      "🛠️"
    ];
    function isDescendantFolder(targetId, fid) {
      let pid = fid;
      const seen = /* @__PURE__ */ new Set();
      while (pid && !seen.has(pid)) {
        if (pid === targetId) return true;
        seen.add(pid);
        pid = data.folders.value.find((f2) => f2.id === pid)?.parentId ?? null;
      }
      return false;
    }
    function moveFolder(fid, target) {
      void window.api.photos.movePhotoFolder(fid, target).then(() => {
        void data.loadFolders();
        useToast().success(target ? "文件夹已移动" : "已移动到根目录");
      }).catch((err) => useToast().error("移动失败", { description: err.message }));
    }
    async function cloneFolder(fid) {
      const f2 = data.folders.value.find((x2) => x2.id === fid);
      if (!f2) return;
      try {
        const created = await window.api.photos.createPhotoFolder(`${f2.name} 副本`, f2.parentId);
        if (f2.description) await window.api.photos.setFolderDescription(created.id, f2.description);
        if (f2.color) await window.api.photos.setFolderColor(created.id, f2.color);
        if (f2.icon) await window.api.photos.setFolderIcon(created.id, f2.icon);
        if (f2.viewLayout || f2.viewSort || f2.viewDisplay) {
          await window.api.photos.setFolderViewSettings(created.id, {
            layout: f2.viewLayout ?? null,
            sort: f2.viewSort ?? null,
            display: f2.viewDisplay ?? null
          });
        }
        const autoTags = await window.api.photos.getFolderAutoTags(fid);
        if (autoTags.length > 0) await window.api.photos.setFolderAutoTags(created.id, autoTags);
        await data.loadFolders();
        useToast().success("文件夹已克隆", { description: created.name });
      } catch (error2) {
        useToast().error("克隆失败", { description: error2.message });
      }
    }
    const autoTagFolder = ref(null);
    function openAutoTagDialog(fid) {
      autoTagFolder.value = data.folders.value.find((f2) => f2.id === fid) ?? null;
    }
    function onAutoTagChanged(newName) {
      const fid = autoTagFolder.value?.id;
      void data.loadFolders();
      if (fid && newName && newName !== autoTagFolder.value?.name) {
        tabs.retitleByViewPrefix("folder:", fid, newName);
      }
      autoTagFolder.value = null;
    }
    async function copyText(text2) {
      try {
        await navigator.clipboard.writeText(text2);
        return true;
      } catch {
        try {
          const ta2 = document.createElement("textarea");
          ta2.value = text2;
          document.body.appendChild(ta2);
          ta2.select();
          const ok = document.execCommand("copy");
          ta2.remove();
          return ok;
        } catch {
          return false;
        }
      }
    }
    function openFolderMenu(item, e64) {
      const fid = item.key.slice(7);
      const folder = data.folders.value.find((f2) => f2.id === fid);
      const hasPw = folder?.hasPassword === true;
      const inQuick = quickAccessIds.value.has(fid);
      const otherLibs = libraryList.value.filter((l2) => !l2.active);
      const moveTargets = [
        {
          key: "to-root",
          label: "移动到根目录",
          icon: "context-menu/ic-folder-move",
          disabled: (folder?.parentId ?? null) === null
        },
        ...sortFolderList(data.folders.value).filter((f2) => f2.id !== fid && !isDescendantFolder(fid, f2.id)).map((f2) => ({
          key: f2.id,
          label: f2.name,
          icon: "context-menu/ic-search-scope-folder",
          disabled: (folder?.parentId ?? null) === f2.id
        }))
      ];
      menu.open(
        e64.clientX,
        e64.clientY,
        [
          {
            key: "new",
            label: "新增文件夹",
            icon: "context-menu/ic-folder-new-folder",
            shortcut: "⌘⇧N"
          },
          {
            key: "new-sub",
            label: "新增子文件夹",
            icon: "context-menu/ic-folder-new-sub-folder",
            shortcut: "⌥N"
          },
          {
            key: "move",
            label: "移动文件夹",
            icon: "context-menu/ic-folder-move",
            children: moveTargets
          },
          { key: "d0", divider: true },
          {
            key: "quick",
            label: inQuick ? '从"快速访问"移除' : '添加至"快速访问"',
            icon: "context-menu/ic-favorite-add"
          },
          { key: "d1", divider: true },
          { key: "rename", label: "重命名", icon: "context-menu/ic-rename", shortcut: "⌘R" },
          { key: "copy-link", label: "复制链接", icon: "context-menu/ic-folder-copy-link" },
          {
            key: "auto-tag",
            label: "设置自动标签",
            icon: "context-menu/ic-folder-auto-tag",
            shortcut: "⌘⇧R"
          },
          {
            key: "password",
            label: "密码保护",
            icon: "context-menu/ic-password",
            children: [
              {
                key: "pw-set",
                label: hasPw ? "更改密码" : "设置密码",
                icon: "context-menu/ic-password"
              },
              {
                key: "pw-remove",
                label: "移除密码",
                icon: "context-menu/ic-file-remove-folder",
                disabled: !hasPw
              }
            ]
          },
          {
            key: "sort",
            label: "排列",
            icon: "context-menu/ic-order-by",
            children: ["custom", "name", "created", "modified"].map((mode) => ({
              key: mode,
              label: {
                custom: "自定义",
                name: "名称",
                created: "添加日期",
                modified: "修改日期"
              }[mode],
              checked: folderSort.value === mode
            }))
          },
          { key: "d2", divider: true },
          { key: "expand-this", label: "展开/收起文件夹", icon: "context-menu/ic-expand" },
          {
            key: "expand-siblings",
            label: "展开/收起同阶层文件夹",
            icon: "context-menu/ic-expand-same"
          },
          {
            key: "expand-all",
            label: "展开/收起所有文件夹",
            icon: "context-menu/ic-expand-all",
            shortcut: "/"
          },
          { key: "d3", divider: true },
          { key: "clone", label: "克隆", icon: "context-menu/ic-clone" },
          { key: "d4", divider: true },
          {
            key: "export",
            label: "导出...",
            icon: "context-menu/ic-export",
            children: [
              {
                key: "do",
                label: "导出为文件夹",
                icon: "context-menu/ic-export-computer"
              }
            ]
          },
          {
            key: "add-lib",
            label: "添加至其它资源库...",
            icon: "context-menu/ic-folder-add-to",
            children: otherLibs.length > 0 ? otherLibs.map((l2) => ({ key: l2.id, label: l2.name })) : [{ key: "none", label: "没有其它资源库", disabled: true }]
          },
          { key: "d5", divider: true },
          {
            key: "show-sub",
            label: "在父文件夹显示子文件夹内容",
            icon: "context-menu/ic-folder-show-sub-folder-content",
            checked: folderIncludesSubfolders(fid)
          },
          {
            key: "folder-icon",
            label: "文件夹图标",
            icon: "context-menu/ic-emoji",
            grid: true,
            children: [
              {
                key: "__none",
                label: "无图标",
                icon: "context-menu/ic-folder-remove",
                checked: !folder?.icon
              },
              ...FOLDER_ICON_EMOJIS.map((em2) => ({
                key: em2,
                label: em2,
                checked: folder?.icon === em2
              }))
            ]
          },
          { key: "colors", colors: FOLDER_COLORS },
          { key: "d6", divider: true },
          {
            key: "delete",
            label: "删除文件夹",
            icon: "context-menu/ic-folder-remove",
            shortcut: "⌘⌫",
            danger: true
          }
        ],
        (key) => {
          if (key.startsWith("color:folder-icon:")) {
            const dotKey = key.split(":")[2];
            const hex = FOLDER_COLORS.find((c2) => c2.key === dotKey)?.hex ?? "";
            applyFolderColor(fid, hex === "#e8e8e8" ? "" : hex);
            return;
          }
          if (key.startsWith("sub:move:")) {
            const child = key.slice("sub:move:".length);
            moveFolder(fid, child === "to-root" ? null : child);
            return;
          }
          if (key === "quick") {
            toggleQuickAccess(fid);
            useToast().success(quickAccessIds.value.has(fid) ? "已添加至快速访问" : "已从快速访问移除");
            return;
          }
          if (key === "copy-link") {
            void copyText(`leaf://folder/${fid}`).then(
              (ok) => ok ? useToast().success("链接已复制", { description: `leaf://folder/${fid}` }) : useToast().error("复制失败")
            );
            return;
          }
          if (key === "auto-tag") {
            openAutoTagDialog(fid);
            return;
          }
          if (key === "sub:password:pw-set") {
            if (!hasPw) {
              requestPrompt({
                title: "设置文件夹密码",
                label: "输入文件夹密码",
                initialValue: "",
                confirmLabel: "保存",
                onSubmit: async (pw) => {
                  if (!pw) return;
                  await window.api.photos.setFolderPassword(fid, pw);
                  await data.loadFolders();
                  useToast().success("文件夹密码已设置", { description: "打开该文件夹需输入密码" });
                }
              });
              return;
            }
            requestPrompt({
              title: "更改文件夹密码",
              label: "输入当前密码",
              initialValue: "",
              confirmLabel: "下一步",
              onSubmit: async (oldPw) => {
                if (!oldPw) return;
                const ok = await window.api.photos.verifyFolderPassword(fid, oldPw).catch(() => false);
                if (!ok) {
                  useToast().error("当前密码不正确");
                  return;
                }
                setTimeout(() => {
                  requestPrompt({
                    title: "更改文件夹密码",
                    label: "输入新密码",
                    initialValue: "",
                    confirmLabel: "保存",
                    onSubmit: async (pw) => {
                      if (!pw) return;
                      await window.api.photos.setFolderPassword(fid, pw, oldPw);
                      await data.loadFolders();
                      useToast().success("文件夹密码已更新");
                    }
                  });
                }, 0);
              }
            });
            return;
          }
          if (key === "sub:password:pw-remove") {
            requestPrompt({
              title: "移除文件夹密码",
              label: "输入原密码",
              initialValue: "",
              confirmLabel: "移除",
              onSubmit: async (pw) => {
                const ok = await window.api.photos.removeFolderPassword(fid, pw);
                if (ok) {
                  await data.loadFolders();
                  useToast().success("已移除文件夹密码");
                } else {
                  useToast().error("密码错误，移除失败");
                }
              }
            });
            return;
          }
          if (key.startsWith("sub:sort:")) {
            const mode = key.slice("sub:sort:".length);
            if (mode === "name" || mode === "created" || mode === "modified" || mode === "custom") {
              setFolderSort(mode);
            }
            return;
          }
          if (key === "clone") {
            void cloneFolder(fid);
            return;
          }
          if (key === "sub:export:do") {
            void window.api.photos.exportFolder(fid).then((n2) => useToast().success(`已导出 ${n2} 个文件`, { description: "见所选目录" })).catch((err) => useToast().error("导出失败", { description: err.message }));
            return;
          }
          if (key.startsWith("sub:add-lib:")) {
            const libId = key.slice("sub:add-lib:".length);
            const target = libraryList.value.find((l2) => l2.id === libId);
            if (!target) return;
            void window.api.photos.getFolderPhotos(fid).then(
              (photos) => window.api.libraries.moveTo(
                libId,
                photos.map((p2) => p2.id)
              )
            ).then((result2) => {
              void data.loadFolders();
              useToast().success("已添加至其它资源库", {
                description: `「${target.name}」新增 ${result2.moved} 项；重复跳过 ${result2.skipped} 项`
              });
            }).catch((err) => useToast().error("添加失败", { description: err.message }));
            return;
          }
          if (key.startsWith("sub:folder-icon:")) {
            const emoji = key.slice("sub:folder-icon:".length);
            void window.api.photos.setFolderIcon(fid, emoji === "__none" ? null : emoji).then(() => data.loadFolders()).catch((err) => useToast().error("设置失败", { description: err.message }));
            return;
          }
          if (key === "new") {
            void actions.createFolderInline();
            return;
          }
          if (key === "new-sub") {
            void actions.createFolderInline(fid);
            return;
          }
          if (key === "expand-this") {
            toggleExpand(fid);
            return;
          }
          if (key === "expand-siblings") {
            toggleSiblingExpand(fid);
            return;
          }
          if (key === "expand-all") {
            toggleAllExpand();
            return;
          }
          if (key === "show-sub") {
            toggleShowSubContent(fid);
            return;
          }
          if (folder?.hasPassword && !unlockedFolderIds.value.has(fid)) {
            requestPrompt({
              title: `「${folder.name}」已加密`,
              label: "输入文件夹密码",
              initialValue: "",
              confirmLabel: "解锁",
              onSubmit: async (pw) => {
                const ok = await window.api.photos.verifyFolderPassword(fid, pw);
                if (!ok) {
                  useToast().error("密码错误");
                  return;
                }
                unlockedFolderIds.value.add(fid);
                if (key === "rename") actions.startFolderInlineRename(fid);
                else if (key === "delete") actions.deleteFolderById(fid, folder.name);
              }
            });
            return;
          }
          if (key === "rename") actions.startFolderInlineRename(fid);
          else if (key === "delete") actions.deleteFolderById(fid, folder?.name ?? item.title);
        },
        { searchable: true }
      );
    }
    function openQuickMenu(item, e64) {
      const fid = item.key.slice(6);
      menu.open(
        e64.clientX,
        e64.clientY,
        [
          { key: "open", label: "打开", icon: "ic-arrow-right" },
          { key: "d1", divider: true },
          {
            key: "remove",
            label: '从"快速访问"移除',
            icon: "context-menu/ic-favorite-remove"
          }
        ],
        (key) => {
          if (key === "open") openItem(item);
          else if (key === "remove") {
            toggleQuickAccess(fid);
            useToast().success("已从快速访问移除");
          }
        }
      );
    }
    function openSmartMenu(item, e64) {
      menu.open(
        e64.clientX,
        e64.clientY,
        [
          { key: "open", label: "打开", icon: "ic-arrow-right" },
          { key: "d1", divider: true },
          { key: "edit", label: "编辑规则", icon: "context-menu/ic-rename" },
          { key: "delete", label: "删除收藏夹", icon: "context-menu/ic-file-move-trash", danger: true }
        ],
        (key) => {
          if (key === "open") openItem(item);
          else if (key === "edit") {
            const album = data.smartAlbums.value.find((a2) => a2.id === item.key.slice(6));
            if (album) actions.openSmartAlbumModal(album);
          } else if (key === "delete") {
            const album = data.smartAlbums.value.find((a2) => a2.id === item.key.slice(6));
            if (album) actions.deleteSmartAlbumById(album);
          }
        }
      );
    }
    function openTagManager() {
      void router.push("/tags");
    }
    function loadCollapsed() {
      try {
        const raw = localStorage.getItem(COLLAPSED_KEY);
        return new Set(raw ? JSON.parse(raw) : []);
      } catch {
        return /* @__PURE__ */ new Set();
      }
    }
    const collapsedGroups = ref(loadCollapsed());
    function toggleGroup(id3) {
      const next = new Set(collapsedGroups.value);
      if (next.has(id3)) next.delete(id3);
      else next.add(id3);
      collapsedGroups.value = next;
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
      }
    }
    const sideFilter = ref("");
    function matchesFilter(name) {
      const q3 = sideFilter.value.trim().toLowerCase();
      return !q3 || name.toLowerCase().includes(q3);
    }
    const sidebarVis = ref(loadSidebarVis());
    function loadSidebarVis() {
      try {
        return JSON.parse(localStorage.getItem(SIDEBAR_VIS_KEY) ?? "{}");
      } catch {
        return {};
      }
    }
    function vis(key) {
      if (key === "albumGroup") return sidebarVis.value["albumGroup"] === true;
      return sidebarVis.value[key] !== false;
    }
    function onSidebarVisibility() {
      sidebarVis.value = loadSidebarVis();
    }
    onMounted(() => window.addEventListener("leaf:sidebar-visibility", onSidebarVisibility));
    onUnmounted(() => window.removeEventListener("leaf:sidebar-visibility", onSidebarVisibility));
    const unlockedFolderIds = ref(/* @__PURE__ */ new Set());
    const { requestPrompt, requestConfirm } = useDialogs();
    const libraryList = ref([]);
    const activeLibraryName = ref("默认资源库");
    async function reloadLibraries() {
      try {
        const res = await window.api.libraries.list();
        libraryList.value = res.libraries;
        activeLibraryName.value = res.libraries.find((l2) => l2.active)?.name ?? "默认资源库";
      } catch {
      }
    }
    void reloadLibraries();
    function openLibraryMenu(e64) {
      const rect = e64.currentTarget.getBoundingClientRect();
      const others = libraryList.value.filter((l2) => !l2.active);
      menu.open(
        rect.left,
        rect.bottom + 4,
        [
          ...libraryList.value.map((l2) => ({
            key: `lib-${l2.id}`,
            label: l2.active ? `✓ ${l2.name}` : l2.name,
            icon: l2.active ? "ic-check" : "ic-library-opened"
          })),
          { key: "d1", divider: true },
          { key: "create", label: "新建资源库…", icon: "ic-library-panel-create" },
          { key: "rename", label: "重命名当前资源库…", icon: "ic-manage-device-edit" },
          {
            key: "merge",
            label: "合并其它资源库…",
            icon: "ic-library-panel-merge",
            disabled: others.length === 0
          },
          {
            key: "remove",
            label: "移除资源库登记…",
            icon: "ic-manage-device-remove",
            disabled: libraryList.value.length < 2
          }
        ],
        async (key) => {
          if (key.startsWith("lib-")) {
            const id3 = key.slice(4);
            const target = libraryList.value.find((l2) => l2.id === id3);
            if (!target || target.active) return;
            requestConfirm(
              "切换资源库",
              `切换到「${target.name}」将重新加载应用。`,
              "切换",
              async () => {
                await window.api.libraries.switchTo(id3);
              }
            );
          } else if (key === "create") {
            requestPrompt({
              title: "新建资源库",
              label: "资源库名称",
              initialValue: "",
              confirmLabel: "创建",
              onSubmit: async (name) => {
                const created = await window.api.libraries.create(name);
                requestConfirm(
                  "切换到新资源库？",
                  `「${created.name}」已创建，切换将重新加载应用。`,
                  "切换",
                  async () => {
                    await window.api.libraries.switchTo(created.id);
                  }
                );
              }
            });
          } else if (key === "rename") {
            requestPrompt({
              title: "重命名资源库",
              label: "新名称",
              initialValue: activeLibraryName.value,
              confirmLabel: "重命名",
              onSubmit: async (name) => {
                const res = await window.api.libraries.list();
                if (res.activeId) await window.api.libraries.rename(res.activeId, name);
                await reloadLibraries();
              }
            });
          } else if (key === "merge") {
            requestPrompt({
              title: "合并其它资源库",
              label: "来源资源库名称",
              initialValue: "",
              confirmLabel: "合并",
              onSubmit: async (name) => {
                const source = libraryList.value.find((l2) => !l2.active && l2.name === name.trim());
                if (!source) {
                  useToast().error("未找到该资源库", { description: name });
                  return;
                }
                const result2 = await window.api.libraries.mergeFrom(source.id);
                useToast().success("合并完成", {
                  description: `新增 ${result2.photosAdded} 项素材、${result2.tagsAdded} 个标签；跳过重复 ${result2.photosSkipped} 项`
                });
              }
            });
          } else if (key === "remove") {
            requestPrompt({
              title: "移除资源库登记",
              label: "要移除的资源库名称（不删除磁盘文件）",
              initialValue: "",
              confirmLabel: "移除登记",
              onSubmit: async (name) => {
                const source = libraryList.value.find((l2) => l2.name === name.trim());
                if (!source) {
                  useToast().error("未找到该资源库", { description: name });
                  return;
                }
                const ok = await window.api.libraries.unregister(source.id);
                if (ok) useToast().success("已移除登记");
                else useToast().error("移除失败", { description: "默认资源库不可移除" });
                await reloadLibraries();
              }
            });
          }
        }
      );
    }
    function openTrashMenu(e64) {
      menu.open(
        e64.clientX,
        e64.clientY,
        [
          { key: "open", label: "打开回收站", icon: "context-menu/ic-file-move-trash" },
          { key: "d1", divider: true },
          {
            key: "clear",
            label: "清空回收站",
            icon: "context-menu/ic-trash-empty",
            danger: true,
            disabled: data.recycleCount.value === 0
          }
        ],
        (key) => {
          if (key === "open")
            openItem({ key: "trash", view: "trash", title: "回收站" });
          else if (key === "clear") actions.handleClearRecycleBin();
        }
      );
    }
    const dragOverKey = ref(null);
    function hasPhotoPayload(e64) {
      return e64.dataTransfer?.types.includes("application/x-leaf-photos") === true;
    }
    function onDrop(item, e64) {
      dragOverKey.value = null;
      if (!hasPhotoPayload(e64)) {
        if (item.view.startsWith("folder:") && e64.dataTransfer?.types.includes("Files")) {
          e64.stopPropagation();
          void photoImport.dropFilesTo(e64, item.key.slice(7));
        }
        return;
      }
      e64.preventDefault();
      const raw = e64.dataTransfer?.getData("application/x-leaf-photos");
      if (!raw) return;
      let ids = [];
      try {
        ids = JSON.parse(raw);
      } catch {
        return;
      }
      if (ids.length === 0) return;
      if (item.view.startsWith("album:")) {
        actions.addToAlbum(item.key.slice(6), ids);
      } else if (item.view.startsWith("folder:")) {
        actions.addToFolder(item.key.slice(7), ids);
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("aside", _hoisted_1$r, [
        createBaseVNode("div", _hoisted_2$r, [
          createBaseVNode("div", _hoisted_3$n, [
            createBaseVNode("button", {
              type: "button",
              class: "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left focus-visible:shadow-ring-focus focus-visible:outline-none",
              "aria-label": "切换资源库",
              onClick: _cache[0] || (_cache[0] = ($event) => openLibraryMenu($event))
            }, [
              createBaseVNode("span", _hoisted_4$k, [
                createVNode(_sfc_main$L, { icon: "ic_folder-close" })
              ]),
              createBaseVNode("span", _hoisted_5$k, toDisplayString(activeLibraryName.value), 1),
              createVNode(_sfc_main$L, {
                icon: "ic_unfold-more",
                size: 13,
                class: "ml-0.5 shrink-0 text-fg-muted"
              })
            ])
          ]),
          createBaseVNode("div", _hoisted_6$k, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(fixedItems.value.filter((i2) => i2.key === "all" ? true : vis(i2.key)), (item) => {
              return openBlock(), createBlock(_sfc_main$t, {
                key: item.key,
                item,
                active: item.key === "tag-manager" ? inTagManager.value : isActive(item.view),
                onOpen: ($event) => openItem(item),
                onContextmenu: ($event) => item.key === "trash" && openTrashMenu($event)
              }, null, 8, ["item", "active", "onOpen", "onContextmenu"]);
            }), 128))
          ]),
          vis("smartGroup") ? (openBlock(), createElementBlock("div", _hoisted_7$i, [
            createBaseVNode("div", _hoisted_8$g, [
              _cache[10] || (_cache[10] = createBaseVNode("span", { class: "mr-0.5 select-none text-xs font-medium text-fg-muted" }, "智能文件夹", -1)),
              createBaseVNode("button", {
                type: "button",
                class: "flex size-4 items-center justify-center rounded-sm text-fg-muted opacity-0 transition-all duration-fast group-hover:opacity-100 hover:text-fg-primary",
                "aria-expanded": !collapsedGroups.value.has("smart"),
                "aria-label": collapsedGroups.value.has("smart") ? "展开智能文件夹" : "折叠智能文件夹",
                onClick: _cache[1] || (_cache[1] = ($event) => toggleGroup("smart"))
              }, [
                createVNode(_sfc_main$L, {
                  icon: "ic-arrow-right",
                  size: 12,
                  class: normalizeClass(collapsedGroups.value.has("smart") ? "" : "rotate-90")
                }, null, 8, ["class"])
              ], 8, _hoisted_9$f),
              _cache[11] || (_cache[11] = createBaseVNode("div", { class: "min-w-2 flex-1" }, null, -1)),
              createVNode(UTooltip, {
                content: "新增智能文件夹",
                position: "right"
              }, {
                default: withCtx(() => [
                  createBaseVNode("button", {
                    type: "button",
                    class: "flex size-5 items-center justify-center rounded-sm text-fg-muted opacity-0 transition-all duration-fast group-hover:opacity-100 hover:bg-surface-hover hover:text-fg-primary",
                    "aria-label": "新增智能文件夹",
                    onClick: _cache[2] || (_cache[2] = ($event) => unref(actions).openSmartAlbumModal(null))
                  }, [
                    createVNode(_sfc_main$L, {
                      icon: "ic-sidebar-add",
                      size: 13
                    })
                  ])
                ]),
                _: 1
              })
            ]),
            !collapsedGroups.value.has("smart") ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(smartItems.value.filter((i2) => matchesFilter(i2.title)), (item) => {
              return openBlock(), createBlock(_sfc_main$t, {
                key: item.key,
                item,
                active: isActive(item.view),
                onOpen: ($event) => openItem(item),
                onContextmenu: ($event) => openSmartMenu(item, $event)
              }, null, 8, ["item", "active", "onOpen", "onContextmenu"]);
            }), 128)) : createCommentVNode("", true)
          ])) : createCommentVNode("", true),
          vis("quickGroup") && quickItems.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_10$f, [
            createBaseVNode("div", _hoisted_11$b, [
              _cache[12] || (_cache[12] = createBaseVNode("span", { class: "select-none text-xs font-medium text-fg-muted" }, "快速访问", -1)),
              createBaseVNode("button", {
                type: "button",
                class: "flex size-4 items-center justify-center rounded-sm text-fg-muted opacity-0 transition-all duration-fast group-hover:opacity-100 hover:text-fg-primary",
                "aria-expanded": !collapsedGroups.value.has("quick"),
                "aria-label": collapsedGroups.value.has("quick") ? "展开快速访问" : "折叠快速访问",
                onClick: _cache[3] || (_cache[3] = ($event) => toggleGroup("quick"))
              }, [
                createVNode(_sfc_main$L, {
                  icon: "ic-arrow-right",
                  size: 12,
                  class: normalizeClass(collapsedGroups.value.has("quick") ? "" : "rotate-90")
                }, null, 8, ["class"])
              ], 8, _hoisted_12$b)
            ]),
            !collapsedGroups.value.has("quick") ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(quickItems.value.filter((i2) => matchesFilter(i2.title)), (qItem) => {
              return openBlock(), createBlock(_sfc_main$t, {
                key: qItem.key,
                item: qItem,
                active: isActive(qItem.view),
                onOpen: ($event) => openItem(qItem),
                onContextmenu: ($event) => openQuickMenu(qItem, $event)
              }, null, 8, ["item", "active", "onOpen", "onContextmenu"]);
            }), 128)) : createCommentVNode("", true)
          ])) : createCommentVNode("", true),
          vis("folderGroup") ? (openBlock(), createElementBlock("div", _hoisted_13$a, [
            createBaseVNode("div", _hoisted_14$9, [
              createBaseVNode("span", _hoisted_15$9, "文件夹 (" + toDisplayString(unref(data).folders.value.length) + ")", 1),
              createBaseVNode("button", {
                type: "button",
                class: "flex size-4 items-center justify-center rounded-sm text-fg-muted opacity-0 transition-all duration-fast group-hover:opacity-100 hover:text-fg-primary",
                "aria-expanded": !collapsedGroups.value.has("folder"),
                "aria-label": collapsedGroups.value.has("folder") ? "展开文件夹" : "折叠文件夹",
                onClick: _cache[4] || (_cache[4] = ($event) => toggleGroup("folder"))
              }, [
                createVNode(_sfc_main$L, {
                  icon: "ic-arrow-right",
                  size: 12,
                  class: normalizeClass(collapsedGroups.value.has("folder") ? "" : "rotate-90")
                }, null, 8, ["class"])
              ], 8, _hoisted_16$8),
              _cache[13] || (_cache[13] = createBaseVNode("div", { class: "min-w-2 flex-1" }, null, -1)),
              createVNode(UTooltip, {
                content: "新建文件夹",
                position: "right"
              }, {
                default: withCtx(() => [
                  createBaseVNode("button", {
                    type: "button",
                    class: "flex size-5 items-center justify-center rounded-sm text-fg-muted opacity-0 transition-all duration-fast group-hover:opacity-100 hover:bg-surface-hover hover:text-fg-primary",
                    "aria-label": "新建文件夹",
                    onClick: _cache[5] || (_cache[5] = ($event) => unref(actions).createFolderInline())
                  }, [
                    createVNode(_sfc_main$L, {
                      icon: "ic-sidebar-add",
                      size: 13
                    })
                  ])
                ]),
                _: 1
              })
            ]),
            !collapsedGroups.value.has("folder") ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(flatFolders.value.filter((n2) => matchesFilter(n2.item.title)), (node2) => {
              return openBlock(), createBlock(_sfc_main$t, {
                key: node2.item.key,
                item: node2.item,
                active: isActive(node2.item.view),
                indent: false,
                style: normalizeStyle({ paddingLeft: `${8 + node2.depth * 16}px` }),
                expandable: node2.hasChildren,
                expanded: node2.expanded,
                depth: node2.depth,
                "drop-target": true,
                "drag-over": dragOverKey.value === node2.item.key,
                editing: renamingFolderId.value === node2.item.key.slice(7),
                onOpen: ($event) => openItem(node2.item),
                onToggleExpand: ($event) => toggleFolderExpand(node2.item.key.slice(7)),
                onContextmenu: ($event) => openFolderMenu(node2.item, $event),
                onEditCommit: ($event) => commitFolderRename(node2.item.key.slice(7), $event),
                onEditCancel: cancelFolderRename,
                onDragOver: ($event) => dragOverKey.value = node2.item.key,
                onDragLeave: ($event) => dragOverKey.value === node2.item.key && (dragOverKey.value = null),
                onDrop: ($event) => onDrop(node2.item, $event)
              }, null, 8, ["item", "active", "style", "expandable", "expanded", "depth", "drag-over", "editing", "onOpen", "onToggleExpand", "onContextmenu", "onEditCommit", "onDragOver", "onDragLeave", "onDrop"]);
            }), 128)) : createCommentVNode("", true)
          ])) : createCommentVNode("", true),
          vis("albumGroup") ? (openBlock(), createElementBlock("div", _hoisted_17$6, [
            createBaseVNode("div", _hoisted_18$5, [
              createBaseVNode("span", _hoisted_19$4, "相册 (" + toDisplayString(albumItems.value.length) + ")", 1),
              createBaseVNode("button", {
                type: "button",
                class: "flex size-4 items-center justify-center rounded-sm text-fg-muted opacity-0 transition-all duration-fast group-hover:opacity-100 hover:text-fg-primary",
                "aria-expanded": !collapsedGroups.value.has("album"),
                "aria-label": collapsedGroups.value.has("album") ? "展开相册" : "折叠相册",
                onClick: _cache[6] || (_cache[6] = ($event) => toggleGroup("album"))
              }, [
                createVNode(_sfc_main$L, {
                  icon: "ic-arrow-right",
                  size: 12,
                  class: normalizeClass(collapsedGroups.value.has("album") ? "" : "rotate-90")
                }, null, 8, ["class"])
              ], 8, _hoisted_20$4),
              _cache[14] || (_cache[14] = createBaseVNode("div", { class: "min-w-2 flex-1" }, null, -1)),
              createVNode(UTooltip, {
                content: "新建相册",
                position: "right"
              }, {
                default: withCtx(() => [
                  createBaseVNode("button", {
                    type: "button",
                    class: "flex size-5 items-center justify-center rounded-sm text-fg-muted opacity-0 transition-all duration-fast group-hover:opacity-100 hover:bg-surface-hover hover:text-fg-primary",
                    "aria-label": "新建相册",
                    onClick: _cache[7] || (_cache[7] = ($event) => unref(actions).openAlbumModal())
                  }, [
                    createVNode(_sfc_main$L, {
                      icon: "ic-sidebar-add",
                      size: 13
                    })
                  ])
                ]),
                _: 1
              })
            ]),
            !collapsedGroups.value.has("album") ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(albumItems.value.filter((i2) => matchesFilter(i2.title)), (item) => {
              return openBlock(), createBlock(_sfc_main$t, {
                key: item.key,
                item,
                active: isActive(item.view),
                "drop-target": true,
                "drag-over": dragOverKey.value === item.key,
                onOpen: ($event) => openItem(item),
                onContextmenu: ($event) => openAlbumMenu(item, $event),
                onDragOver: ($event) => dragOverKey.value = item.key,
                onDragLeave: ($event) => dragOverKey.value === item.key && (dragOverKey.value = null),
                onDrop: ($event) => onDrop(item, $event)
              }, null, 8, ["item", "active", "drag-over", "onOpen", "onContextmenu", "onDragOver", "onDragLeave", "onDrop"]);
            }), 128)) : createCommentVNode("", true)
          ])) : createCommentVNode("", true)
        ]),
        createBaseVNode("div", _hoisted_21$4, [
          createBaseVNode("div", _hoisted_22$3, [
            createBaseVNode("span", _hoisted_23$3, [
              createVNode(_sfc_main$L, {
                icon: "ic_search",
                size: 12
              })
            ]),
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => sideFilter.value = $event),
              type: "text",
              placeholder: "筛选",
              class: "h-8 w-full rounded-md border border-line-default bg-surface-1 pl-7 pr-2 text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-brand-500"
            }, null, 512), [
              [vModelText, sideFilter.value]
            ])
          ])
        ]),
        autoTagFolder.value ? (openBlock(), createBlock(_sfc_main$s, {
          key: 0,
          folder: autoTagFolder.value,
          "dictionary-tags": unref(data).dictionaryTags.value.map((t3) => t3.name),
          onClose: _cache[9] || (_cache[9] = ($event) => autoTagFolder.value = null),
          onChanged: onAutoTagChanged
        }, null, 8, ["folder", "dictionary-tags"])) : createCommentVNode("", true)
      ]);
    };
  }
}
