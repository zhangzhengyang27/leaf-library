/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(SettingsView-DBMPMz14.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main = /* @__PURE__ */ defineComponent(
*/
{
  __name: "SettingsView",
  setup(__props) {
    const { theme, setTheme, initTheme } = useTheme();
    initTheme();
    const router = useRouter();
    const actions = usePhotoActions();
    const goBack = () => {
      router.push("/photos").catch(() => {
      });
    };
    const NAV = [
      { id: "general", label: "常用", icon: "ic_home" },
      { id: "sidebar", label: "左栏", icon: "ic_toggle-sidebar" },
      { id: "control", label: "操控", icon: "ic-settings" },
      { id: "shortcuts", label: "快捷键", glyph: "⌘" },
      { id: "screenshot", label: "截图", glyph: "✂" },
      { id: "notification", label: "通知", icon: "ic_notification" },
      { id: "privacy", label: "密码保护", icon: "ic-lock" },
      { id: "autoimport", label: "自动导入", icon: "ic_download" },
      { id: "ai", label: "内容识别", icon: "ic-ai" },
      { id: "assistant", label: "AI 助手", icon: "ic-ai" },
      { id: "plugins", label: "插件", icon: "ic-toolbar-plugin" },
      { id: "clip", label: "剪藏", icon: "ic_chrome" },
      { id: "developer", label: "开发者选项", icon: "ic-developer" }
    ];
    const activeTab = ref("general");
    const activeNav = computed(() => NAV.find((n) => n.id === activeTab.value) ?? NAV[0]);
    const navQuery = ref("");
    const filteredNav = computed(() => {
      const q = navQuery.value.trim().toLowerCase();
      if (!q) return NAV;
      return NAV.filter((n) => n.label.toLowerCase().includes(q));
    });
    function gotoTab(id) {
      activeTab.value = id;
    }
    const themeSwatches = [
      { id: "light", label: "浅色", style: "background:#f5f5f5" },
      {
        id: "dark",
        label: "深色",
        style: "background:#1d1e21"
      },
      {
        id: "auto",
        label: "跟随系统",
        style: "background:linear-gradient(90deg,#f5f5f5 50%,#1d1e21 50%)"
      }
    ];
    const onSelectTheme = async (id) => {
      await setTheme(id);
    };
    const dblClickAction = ref(loadDoubleClickAction());
    function setDblClickAction(v) {
      dblClickAction.value = v;
      try {
        localStorage.setItem("leaf.pref.double-click-action", v);
      } catch {
      }
    }
    const sidebarRows = [
      { key: "unsorted", label: "未分类" },
      { key: "untagged", label: "未标签" },
      { key: "random", label: "随机模式" },
      { key: "tag-manager", label: "标签管理" },
      { key: "trash", label: "回收站" }
    ];
    const sidebarRows2 = [
      { key: "smartGroup", label: "智能文件夹组" },
      { key: "folderGroup", label: "文件夹组" },
      { key: "albumGroup", label: "相册组" }
    ];
    const sidebarVisibility = ref(loadSidebarVisibility());
    function loadSidebarVisibility() {
      try {
        return JSON.parse(localStorage.getItem(SIDEBAR_VIS_KEY) ?? "{}");
      } catch {
        return {};
      }
    }
    function isSidebarVisible(key) {
      return key === "albumGroup" ? sidebarVisibility.value[key] === true : sidebarVisibility.value[key] !== false;
    }
    function setSidebarVisible(key, v) {
      sidebarVisibility.value = { ...sidebarVisibility.value, [key]: v };
      try {
        localStorage.setItem(SIDEBAR_VIS_KEY, JSON.stringify(sidebarVisibility.value));
      } catch {
      }
      window.dispatchEvent(new CustomEvent("leaf:sidebar-visibility"));
    }
    const shortcutGroups = [
      {
        name: "全局",
        rows: [
          { label: "命令面板", keys: "⌘ K" },
          { label: "聚焦搜索框", keys: "⌘ F" },
          { label: "跳到素材库", keys: "⌘ 1" },
          { label: "设置", keys: "⌘ ," },
          { label: "开发者工具", keys: "⌥ ⌘ I" }
        ]
      },
      {
        name: "选择与导航",
        rows: [
          { label: "全选（当前视图）", keys: "⌘ A" },
          { label: "⌘ 点击 / Shift 点击", keys: "连选 / 范围连选" },
          { label: "移动高亮", keys: "↑ ↓ ← →" },
          { label: "预览高亮项", keys: "Enter" },
          { label: "空格快速预览", keys: "Space" },
          { label: "关预览 / 退选择", keys: "Esc" },
          { label: "重命名选中项", keys: "F2" },
          { label: "高级模式（检查器信息全展开）", keys: "F8" }
        ]
      },
      {
        name: "文件",
        rows: [
          { label: "导入文件夹", keys: "⌘ O" },
          { label: "导入文件", keys: "⇧ ⌘ O" },
          { label: "新建智能收藏夹", keys: "⌥ ⌘ N" },
          { label: "创建副本（单选）", keys: "⌘ D" },
          { label: "复制文件路径", keys: "⌥ ⌘ C" },
          { label: "移入回收站", keys: "⌫" }
        ]
      },
      {
        name: "界面",
        rows: [
          { label: "显示/隐藏侧栏", keys: "⌘ B" },
          { label: "显示/隐藏筛选行", keys: "⇧ ⌘ F" },
          { label: "切换布局", keys: "⌘ \\" }
        ]
      }
    ];
    const shortcutQuery = ref("");
    const filteredShortcutGroups = computed(() => {
      const q = shortcutQuery.value.trim().toLowerCase();
      if (!q) return shortcutGroups;
      return shortcutGroups.map((g) => ({
        ...g,
        rows: g.rows.filter((r) => r.label.toLowerCase().includes(q))
      })).filter((g) => g.rows.length > 0);
    });
    const notifyMaster = ref(loadNotifyMaster());
    function loadNotifyMaster() {
      try {
        return localStorage.getItem("leaf.notify.master") !== "0";
      } catch {
        return true;
      }
    }
    function setNotifyMaster(v) {
      notifyMaster.value = v;
      try {
        localStorage.setItem("leaf.notify.master", v ? "1" : "0");
      } catch {
      }
    }
    function notifyToggle(kind) {
      return localStorage.getItem(`leaf.notify.${kind}`) !== "0";
    }
    const notifyProcessing = ref(notifyToggle("processing"));
    const notifyUpdate = ref(notifyToggle("update"));
    function setNotify(kind, v) {
      if (kind === "processing") notifyProcessing.value = v;
      else notifyUpdate.value = v;
      try {
        localStorage.setItem(`leaf.notify.${kind}`, v ? "1" : "0");
      } catch {
      }
    }
    function goPrivacySettings() {
      actions.lockModalOpen.value = true;
      router.push("/photos").catch(() => {
      });
    }
    const watchedFolders = ref([]);
    const watchedEnabled = ref(loadWatchedEnabled());
    function loadWatchedEnabled() {
      try {
        return localStorage.getItem("leaf.watched-enabled") !== "0";
      } catch {
        return true;
      }
    }
    async function loadWatchedFolders() {
      try {
        watchedFolders.value = await window.api.watchedFolders.list();
      } catch {
        watchedFolders.value = [];
      }
    }
    async function addWatchedFolder() {
      try {
        const dirs = await window.api.photos.selectFolder();
        const folder = dirs[0];
        if (!folder) return;
        watchedFolders.value = await window.api.watchedFolders.add(folder);
        useToast().success("已添加监控文件夹", { description: folder });
      } catch (error) {
        useToast().error("添加失败", { description: error.message });
      }
    }
    async function removeWatchedFolder(folder) {
      try {
        watchedFolders.value = await window.api.watchedFolders.remove(folder);
        useToast().success("已停止监控", { description: folder });
      } catch (error) {
        useToast().error("停止监控失败", { description: error.message });
      }
    }
    async function toggleWatchedEnabled(on) {
      const prev = watchedEnabled.value;
      watchedEnabled.value = on;
      try {
        localStorage.setItem("leaf.watched-enabled", on ? "1" : "0");
        await window.api.watchedFolders.setEnabled(on);
        useToast().success(on ? "自动导入已开启" : "自动导入已暂停");
      } catch (error) {
        watchedEnabled.value = prev;
        try {
          localStorage.setItem("leaf.watched-enabled", prev ? "1" : "0");
        } catch {
        }
        useToast().error("切换失败", { description: error.message });
      }
    }
    const storageMode = ref("reference");
    const storageMsg = ref("");
    const scanningMissing = ref(false);
    const migrating = ref(false);
    async function loadStorageMode() {
      try {
        storageMode.value = await window.api.storage.getMode();
      } catch {
        storageMode.value = "reference";
      }
    }
    async function setStorageMode(mode) {
      if (storageMode.value === mode) return;
      const prev = storageMode.value;
      storageMode.value = mode;
      try {
        storageMode.value = await window.api.storage.setMode(mode);
        useToast().success(mode === "copy" ? "已切换为拷贝入库" : "已切换为引用原文件");
      } catch (error) {
        storageMode.value = prev;
        useToast().error("切换失败", { description: error.message });
      }
    }
    async function onScanMissing() {
      scanningMissing.value = true;
      try {
        const r = await window.api.storage.scanMissing();
        storageMsg.value = r.ok ? `扫描 ${r.scanned ?? 0} 个素材：${r.missing ?? 0} 个文件丢失，自动恢复 ${r.restored ?? 0} 个。` : `扫描失败：${r.error ?? "未知错误"}`;
      } catch (error) {
        storageMsg.value = `扫描失败：${error.message}`;
      } finally {
        scanningMissing.value = false;
      }
    }
    async function onMigrate(dryRun) {
      migrating.value = true;
      try {
        const r = await window.api.storage.migrateIntoLibrary(dryRun);
        if (!r.ok) {
          storageMsg.value = `迁移失败：${r.error ?? "未知错误"}`;
          return;
        }
        storageMsg.value = `扫描 ${r.scanned ?? 0} 个引用素材，已拷贝 ${r.copied ?? 0} 个入库（失败 ${r.failed ?? 0} 个）。`;
      } catch (error) {
        storageMsg.value = `迁移失败：${error.message}`;
      } finally {
        migrating.value = false;
      }
    }
    async function onRepairMovedLibrary() {
      try {
        const dirs = await window.api.photos.selectFolder();
        const oldRoot = dirs[0];
        if (!oldRoot) return;
        const dry = await window.api.storage.repairMovedLibrary(oldRoot, true);
        if (!dry.ok) {
          storageMsg.value = `修复失败：${dry.error}`;
          return;
        }
        if ((dry.repairable ?? 0) === 0) {
          storageMsg.value = `未找到可修复项（丢失 ${dry.missing ?? 0} 个素材，但都未在所选目录下找到对应文件）。请确认选择的是移动前的原库目录。`;
          return;
        }
        const ok = window.confirm(
          `在所选目录下找到 ${dry.repairable} 个丢失素材的对应文件（共丢失 ${dry.missing} 个）。
将把引用路径批量改到当前资源库内的对应位置（元数据保留）。

执行修复？`
        );
        if (!ok) {
          storageMsg.value = "已取消修复。";
          return;
        }
        const r = await window.api.storage.repairMovedLibrary(oldRoot, false);
        storageMsg.value = r.ok ? `修复完成：已重新定位 ${r.repaired ?? 0} 个素材。` : `修复失败：${r.error}`;
      } catch (error) {
        storageMsg.value = `修复失败：${error.message}`;
      }
    }
    async function onMigrateConfirm() {
      let first;
      try {
        migrating.value = true;
        first = await window.api.storage.migrateIntoLibrary(true);
      } catch (error) {
        storageMsg.value = `迁移失败：${error.message}`;
        return;
      } finally {
        migrating.value = false;
      }
      if (!first.ok) {
        storageMsg.value = `迁移失败：${first.error ?? "未知错误"}`;
        return;
      }
      if ((first.candidates ?? 0) === 0) {
        storageMsg.value = `没有库外引用素材（共扫描 ${first.scanned ?? 0} 项），无需迁移。`;
        return;
      }
      const mb = ((first.totalSize ?? 0) / 1048576).toFixed(1);
      const ok = window.confirm(
        `将把 ${first.candidates} 个库外文件（约 ${mb} MB）拷贝入资源库 images/ 目录。
原文件不会被删除，迁移后素材改用库内副本。

继续迁移？`
      );
      if (!ok) {
        storageMsg.value = "已取消迁移。";
        return;
      }
      await onMigrate(false);
    }
    const ocrStatus = ref(null);
    const ocrBusy = ref(false);
    async function loadOcrStatus() {
      try {
        ocrStatus.value = await window.api.photos.ocrStatus();
      } catch {
        ocrStatus.value = null;
      }
    }
    async function toggleOcr(on) {
      try {
        ocrStatus.value = await window.api.photos.setOcrEnabled(on);
        useToast().success(on ? "文字识别已开启" : "文字识别已关闭");
      } catch (error) {
        useToast().error("切换失败", { description: error.message });
      }
    }
    async function runOcrAll() {
      ocrBusy.value = true;
      try {
        const r = await window.api.photos.runOcr();
        useToast().info(`已加入识别队列 ${r.queued} 张`, {
          description: "识别在后台低优先级进行，完成后即可按图片内文字搜索"
        });
      } catch (error) {
        useToast().error("加入识别队列失败", { description: error.message });
      } finally {
        ocrBusy.value = false;
      }
    }
    const docTextStatus = ref(null);
    const docTextBusy = ref(false);
    async function loadDocTextStatus() {
      try {
        docTextStatus.value = await window.api.photos.docTextStatus();
      } catch {
        docTextStatus.value = null;
      }
    }
    async function toggleDocText(on) {
      try {
        docTextStatus.value = await window.api.photos.setDocTextEnabled(on);
        useToast().success(on ? "正文抽取已开启" : "正文抽取已关闭");
      } catch (error) {
        useToast().error("切换失败", { description: error.message });
      }
    }
    async function runDocTextAll() {
      docTextBusy.value = true;
      try {
        const r = await window.api.photos.runDocText();
        useToast().info(`已加入抽取队列 ${r.queued} 个`, {
          description: "后台低优先级进行，完成后文档正文与图片内文字一样可全文搜索"
        });
      } catch (error) {
        useToast().error("加入抽取队列失败", { description: error.message });
      } finally {
        docTextBusy.value = false;
      }
    }
    const vecStatus = ref(null);
    const vecBusy = ref("");
    let vecQuietTicks = 0;
    let vecTimer;
    const vecMb = (bytes) => Math.round(bytes / 1024 / 1024);
    async function loadVectorStatus() {
      try {
        vecStatus.value = await window.api.vectors.status();
      } catch {
        vecStatus.value = null;
      }
    }
    function watchVectorProgress() {
      if (vecTimer !== void 0) return;
      vecTimer = window.setInterval(async () => {
        await loadVectorStatus();
        const s = vecStatus.value;
        const pr = s?.progress ?? null;
        if (vecBusy.value === "download") return;
        if (vecBusy.value === "index" && pr === null && ++vecQuietTicks < 10) return;
        const running = vecBusy.value === "index" && pr !== null && pr.done < pr.total;
        if (!running) {
          vecBusy.value = "";
          vecQuietTicks = 0;
          if (vecTimer !== void 0) {
            window.clearInterval(vecTimer);
            vecTimer = void 0;
          }
        }
      }, 1500);
    }
    async function downloadVectorModel() {
      vecBusy.value = "download";
      try {
        const r = await window.api.vectors.download();
        if (r.ok) useToast().success("视觉模型已就绪", { description: "现在可以给全库建向量索引了" });
        else useToast().error("模型下载失败", { description: r.error ?? "" });
      } catch (error) {
        useToast().error("模型下载失败", { description: error.message });
      } finally {
        vecBusy.value = "";
        await loadVectorStatus();
      }
    }
    async function startIndex(rebuild) {
      vecBusy.value = "index";
      vecQuietTicks = 0;
      try {
        const r = await window.api.vectors.indexAll(rebuild);
        if (!r.ok) {
          useToast().info(r.error ?? "索引任务已在跑");
          return;
        }
        watchVectorProgress();
      } catch (error) {
        useToast().error("启动索引失败", { description: error.message });
        vecBusy.value = "";
      }
    }
    async function cancelIndex() {
      await window.api.vectors.cancelIndex();
      useToast().info("已请求停止索引");
    }
    async function clearVectors() {
      const r = await window.api.vectors.clearVectors();
      useToast().info(`已清空 ${r.removed} 条向量`, { description: "模型文件保留，可重新建索引" });
      await loadVectorStatus();
    }
    async function removeVectorModel() {
      await window.api.vectors.removeModel();
      useToast().info("模型文件已删除");
      await loadVectorStatus();
    }
    const backupCfg = ref(null);
    const backupKeep = ref(10);
    const backupRunning = ref(false);
    const backupMsg = ref("");
    async function loadBackupConfig() {
      try {
        backupCfg.value = await window.api.backup.getConfig();
        backupKeep.value = backupCfg.value.keep;
      } catch {
        backupCfg.value = null;
      }
    }
    async function saveBackupConfig(patch) {
      try {
        backupCfg.value = await window.api.backup.setConfig(patch);
        backupKeep.value = backupCfg.value.keep;
      } catch (error) {
        useToast().error("备份设置保存失败", { description: error.message });
      }
    }
    function setBackupEnabled(on) {
      void saveBackupConfig({ enabled: on });
      useToast().success(on ? "自动备份已开启" : "自动备份已关闭");
    }
    function setBackupInterval(days) {
      void saveBackupConfig({ intervalDays: days });
    }
    function setBackupKeep() {
      if (!backupKeep.value || backupKeep.value < 1) backupKeep.value = 10;
      void saveBackupConfig({ keep: backupKeep.value });
    }
    async function onBackupNow() {
      backupRunning.value = true;
      backupMsg.value = "";
      try {
        const r = await window.api.backup.runNow();
        if (r.ok) {
          backupMsg.value = `备份完成：${r.file}`;
          await loadBackupConfig();
        } else {
          backupMsg.value = `备份失败：${r.error}`;
        }
      } finally {
        backupRunning.value = false;
      }
    }
    function onOpenBackupDir() {
      void window.api.backup.openDir();
    }
    const screenshotSettings = ref(null);
    async function loadScreenshotSettings() {
      try {
        screenshotSettings.value = await window.api.screenshot.getSettings();
      } catch (error) {
        useToast().error("读取截图设置失败", { description: error.message });
      }
    }
    async function patchScreenshot(patch) {
      try {
        screenshotSettings.value = await window.api.screenshot.setSettings(patch);
      } catch (error) {
        useToast().error("保存截图设置失败", { description: error.message });
        await loadScreenshotSettings();
      }
    }
    async function onPickScreenshotDir() {
      const dirs = await window.api.photos.selectFolder();
      if (dirs && dirs[0]) await patchScreenshot({ saveDir: dirs[0] });
    }
    const clipboardWatchEnabled = ref(false);
    async function loadClipboardWatch() {
      try {
        clipboardWatchEnabled.value = await window.api.clipboardWatch.getEnabled();
      } catch {
        clipboardWatchEnabled.value = false;
      }
    }
    async function toggleClipboardWatch(on) {
      const prev = clipboardWatchEnabled.value;
      clipboardWatchEnabled.value = on;
      try {
        await window.api.clipboardWatch.setEnabled(on);
        useToast().success(on ? "剪贴板监听已开启" : "剪贴板监听已关闭", {
          description: on ? "复制文件或图片会自动入库" : void 0
        });
      } catch (error) {
        clipboardWatchEnabled.value = prev;
        useToast().error("切换失败", { description: error.message });
      }
    }
    const aiCfg = ref(null);
    const aiKeyInput = ref("");
    const aiBusy = ref(false);
    const aiTest = ref("");
    async function loadAiConfig() {
      try {
        aiCfg.value = await window.api.ai.config();
      } catch {
        aiCfg.value = null;
      }
    }
    async function onSaveAiKey() {
      aiBusy.value = true;
      aiTest.value = "";
      const r = await window.api.ai.setKey(aiKeyInput.value);
      if (r.ok) {
        aiKeyInput.value = "";
        useToast().success("已保存 API Key", { description: "经系统密钥环加密存本机" });
        await loadAiConfig();
      } else {
        useToast().error("保存失败", { description: r.error });
      }
      aiBusy.value = false;
    }
    async function onTestAi() {
      aiBusy.value = true;
      const r = await window.api.ai.test();
      aiTest.value = r.ok ? `模型回复：${r.text.trim().slice(0, 40)}` : `失败：${r.error}`;
      aiBusy.value = false;
    }
    async function onClearAiKey() {
      const r = await window.api.ai.clearKey();
      if (r.ok) {
        aiTest.value = "";
        useToast().success("已清除 API Key");
        await loadAiConfig();
      } else {
        useToast().error("清除失败", { description: r.error });
      }
    }
    const plugins = ref([]);
    async function loadPlugins() {
      try {
        plugins.value = await window.api.plugins.list();
      } catch {
        plugins.value = [];
      }
    }
    const clipRunning = ref(false);
    const clipPort = ref(null);
    const clipToken = ref(null);
    const clipShowToken = ref(false);
    const clipRegenerating = ref(false);
    const clipTokenMasked = computed(() => {
      if (!clipToken.value) return "—";
      if (clipShowToken.value) return clipToken.value;
      return `${clipToken.value.slice(0, 6)}••••••${clipToken.value.slice(-4)}`;
    });
    const clipServiceUrl = computed(
      () => clipPort.value != null && clipToken.value ? `http://localhost:${clipPort.value}/?token=${clipToken.value}` : ""
    );
    async function loadClipConfig() {
      try {
        const cfg = await window.api.photos.clipServer.getConfig();
        clipRunning.value = cfg.running;
        clipPort.value = cfg.port;
        clipToken.value = cfg.token;
      } catch {
      }
    }
    async function onRegenerateClipToken() {
      clipRegenerating.value = true;
      try {
        const next = await window.api.photos.clipServer.regenerateToken();
        clipToken.value = next.token;
        useToast().success("Token 已重新生成", { description: "请在浏览器扩展中同步更新" });
      } catch {
        useToast().error("重新生成失败");
      } finally {
        clipRegenerating.value = false;
      }
    }
    function copyClipField(value, label) {
      void navigator.clipboard.writeText(value).then(() => {
        useToast().success(`${label}已复制`);
      });
    }
    const appVersion = ref("—");
    const systemInfo = ref(null);
    const onOpenDataDir = () => {
      if (systemInfo.value?.userDataPath) {
        void window.api.system.openPath(systemInfo.value.userDataPath);
      }
    };
    const telemetryMode = ref("local");
    const telemetryOptions = [
      { id: "local", label: "本地", description: "错误日志保存到本机 SQLite，重启可清。" },
      { id: "off", label: "关闭", description: "只保留内存 ring buffer，重启即清零。" },
      { id: "remote", label: "远程（1.0 暂未启用）", description: "当前等同本地。" }
    ];
    const onSelectTelemetry = async (id) => {
      const prev = telemetryMode.value;
      telemetryMode.value = id;
      try {
        telemetryMode.value = await window.api.log.setMode(id);
      } catch (e) {
        console.warn("[SettingsView] setMode failed:", e);
        telemetryMode.value = prev;
      }
    };
    const onExportLogs = async () => {
      try {
        await window.api.log.export();
      } catch (e) {
        console.warn("[SettingsView] export failed:", e);
      }
    };
    const updateStatus = ref("idle");
    const updateVersion = ref("");
    const updateProgress = ref(0);
    const updateError = ref("");
    let unsubscribe = null;
    let escScope = null;
    const onKeydown = (e) => {
      if (e.key === "Escape" && escScope && isEscTop(escScope)) goBack();
    };
    const onCheckUpdate = async () => {
      await window.api.update.check();
    };
    const onDownload = async () => {
      await window.api.update.download();
    };
    const onInstall = () => {
      window.api.update.install();
    };
    const statusText = (s) => {
      switch (s) {
        case "idle":
          return "未检查";
        case "checking":
          return "检查中…";
        case "available":
          return `有可用更新 v${updateVersion.value}`;
        case "not-available":
          return "已是最新版本";
        case "downloading":
          return `下载中 ${updateProgress.value}%`;
        case "downloaded":
          return `已下载 v${updateVersion.value}，点击重启安装`;
        case "error":
          return `错误：${updateError.value}`;
        default:
          return s;
      }
    };
    const canCheck = () => updateStatus.value === "idle" || updateStatus.value === "not-available" || updateStatus.value === "error";
    const canDownload = () => updateStatus.value === "available";
    const canInstall = () => updateStatus.value === "downloaded";
    function onSaveSettings() {
      useToast().success("设置已保存", { description: "Leaf 的设置为即改即存" });
    }
    onMounted(() => {
      void loadVectorStatus();
      unsubscribe = window.api.update.onEvent((e) => {
        updateStatus.value = e.status;
        updateError.value = e.error ?? "";
        if (e.version) updateVersion.value = e.version;
        if (e.progress) updateProgress.value = Math.round(e.progress.percent);
      });
      window.api.update.getStatus().then((s) => updateStatus.value = s).catch(() => {
      });
      window.addEventListener("keydown", onKeydown);
      escScope = pushEscScope();
      void loadInitialData();
    });
    async function loadInitialData() {
      await loadClipConfig();
      await loadWatchedFolders();
      void loadClipboardWatch();
      void loadOcrStatus();
      void loadDocTextStatus();
      void loadBackupConfig();
      void loadStorageMode();
      void loadScreenshotSettings();
      try {
        appVersion.value = await window.api.update.getCurrentVersion();
      } catch {
      }
      try {
        systemInfo.value = await window.api.system.info();
      } catch {
      }
      await loadPlugins();
      await loadAiConfig();
      try {
        telemetryMode.value = await window.api.log.getMode();
      } catch {
      }
    }
    onBeforeUnmount(() => {
      if (vecTimer !== void 0) {
        window.clearInterval(vecTimer);
        vecTimer = void 0;
      }
      window.removeEventListener("keydown", onKeydown);
      unsubscribe?.();
      if (escScope) {
        popEscScope(escScope);
        escScope = null;
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "fixed inset-0 z-40 grid place-items-center bg-black/50 p-6",
        onClick: withModifiers(goBack, ["self"])
      }, [
        createBaseVNode("div", _hoisted_1, [
          createBaseVNode("aside", _hoisted_2, [
            _cache[19] || (_cache[19] = createBaseVNode("h1", { class: "px-4 pt-4 text-sm font-semibold text-fg-primary" }, "偏好设置", -1)),
            createBaseVNode("div", _hoisted_3, [
              createBaseVNode("div", _hoisted_4, [
                createVNode(_sfc_main$2, {
                  icon: "ic_search",
                  size: 12,
                  class: "pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted"
                }),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => navQuery.value = $event),
                  type: "text",
                  placeholder: "搜索…",
                  class: "h-7 w-full rounded-md border border-line-subtle bg-surface-1 pl-7 pr-2 text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none"
                }, null, 512), [
                  [vModelText, navQuery.value]
                ])
              ])
            ]),
            createBaseVNode("nav", _hoisted_5, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(filteredNav.value, (n) => {
                return openBlock(), createElementBlock("button", {
                  key: n.id,
                  type: "button",
                  class: normalizeClass([
                    "flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-left text-xs transition-colors duration-fast",
                    activeTab.value === n.id ? "bg-surface-active text-fg-primary" : "text-fg-secondary hover:bg-surface-hover hover:text-fg-primary"
                  ]),
                  onClick: ($event) => gotoTab(n.id)
                }, [
                  n.glyph ? (openBlock(), createElementBlock("span", _hoisted_7, toDisplayString(n.glyph), 1)) : n.icon ? (openBlock(), createBlock(_sfc_main$2, {
                    key: 1,
                    icon: n.icon,
                    size: 15,
                    class: "shrink-0 text-fg-secondary"
                  }, null, 8, ["icon"])) : createCommentVNode("", true),
                  createBaseVNode("span", _hoisted_8, toDisplayString(n.label), 1)
                ], 10, _hoisted_6);
              }), 128)),
              filteredNav.value.length === 0 ? (openBlock(), createElementBlock("p", _hoisted_9, " 无匹配的页签 ")) : createCommentVNode("", true)
            ])
          ]),
          createBaseVNode("section", _hoisted_10, [
            createBaseVNode("header", _hoisted_11, [
              createBaseVNode("div", _hoisted_12, [
                createBaseVNode("h2", _hoisted_13, toDisplayString(activeNav.value.label), 1)
              ]),
              createBaseVNode("button", {
                type: "button",
                class: "flex size-6 items-center justify-center rounded-md text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg-primary",
                title: "关闭偏好设置",
                "aria-label": "关闭偏好设置",
                onClick: goBack
              }, [
                createVNode(_sfc_main$2, {
                  icon: "ic-modal-close",
                  size: 12
                })
              ])
            ]),
            createBaseVNode("div", _hoisted_14, [
              activeTab.value === "general" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                createBaseVNode("section", _hoisted_15, [
                  _cache[21] || (_cache[21] = createBaseVNode("h3", { class: "mb-3 text-xs font-medium text-fg-primary" }, "外观", -1)),
                  createBaseVNode("div", _hoisted_16, [
                    _cache[20] || (_cache[20] = createBaseVNode("span", { class: "text-xs text-fg-secondary" }, "主题", -1)),
                    createBaseVNode("div", _hoisted_17, [
                      (openBlock(), createElementBlock(Fragment, null, renderList(themeSwatches, (t) => {
                        return createBaseVNode("button", {
                          key: t.id,
                          type: "button",
                          class: normalizeClass([
                            "size-[22px] rounded-md border transition-shadow duration-fast",
                            unref(theme) === t.id ? "border-brand-500 ring-1 ring-brand-500 ring-offset-2 ring-offset-surface-2" : "border-line-strong"
                          ]),
                          style: normalizeStyle(t.style),
                          title: t.label,
                          "aria-label": `主题：${t.label}`,
                          onClick: ($event) => onSelectTheme(t.id)
                        }, null, 14, _hoisted_18);
                      }), 64))
                    ])
                  ]),
                  _cache[22] || (_cache[22] = createBaseVNode("div", { class: "grid grid-cols-[96px_1fr] items-center gap-x-4 py-1.5" }, [
                    createBaseVNode("span", { class: "text-xs text-fg-secondary" }, "语言"),
                    createBaseVNode("select", {
                      disabled: "",
                      title: "Leaf 当前仅提供简体中文",
                      class: "h-7 w-32 rounded-md border border-line-subtle bg-surface-1 px-2 text-xs text-fg-primary"
                    }, [
                      createBaseVNode("option", null, "简体中文")
                    ])
                  ], -1))
                ]),
                createBaseVNode("section", _hoisted_19, [
                  _cache[25] || (_cache[25] = createBaseVNode("h3", { class: "mb-3 text-xs font-medium text-fg-primary" }, "更新", -1)),
                  createBaseVNode("div", _hoisted_20, [
                    createBaseVNode("div", _hoisted_21, [
                      createBaseVNode("p", _hoisted_22, "自动更新 · Leaf v" + toDisplayString(appVersion.value), 1),
                      createBaseVNode("p", _hoisted_23, toDisplayString(statusText(updateStatus.value)), 1),
                      updateStatus.value === "downloading" ? (openBlock(), createBlock(UProgress, {
                        key: 0,
                        value: updateProgress.value,
                        class: "mt-2 max-w-60"
                      }, null, 8, ["value"])) : createCommentVNode("", true)
                    ]),
                    createBaseVNode("div", _hoisted_24, [
                      canCheck() ? (openBlock(), createBlock(_sfc_main$3, {
                        key: 0,
                        size: "sm",
                        variant: "secondary",
                        loading: updateStatus.value === "checking",
                        onClick: onCheckUpdate
                      }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(updateStatus.value === "checking" ? "检查中…" : "检查更新"), 1)
                        ]),
                        _: 1
                      }, 8, ["loading"])) : createCommentVNode("", true),
                      canDownload() ? (openBlock(), createBlock(_sfc_main$3, {
                        key: 1,
                        size: "sm",
                        variant: "primary",
                        onClick: onDownload
                      }, {
                        default: withCtx(() => [..._cache[23] || (_cache[23] = [
                          createTextVNode(" 下载 ", -1)
                        ])]),
                        _: 1
                      })) : createCommentVNode("", true),
                      canInstall() ? (openBlock(), createBlock(_sfc_main$3, {
                        key: 2,
                        size: "sm",
                        variant: "primary",
                        onClick: onInstall
                      }, {
                        default: withCtx(() => [..._cache[24] || (_cache[24] = [
                          createTextVNode(" 重启安装 ", -1)
                        ])]),
                        _: 1
                      })) : createCommentVNode("", true)
                    ])
                  ])
                ]),
                createBaseVNode("section", _hoisted_25, [
                  _cache[29] || (_cache[29] = createBaseVNode("h3", { class: "text-xs font-medium text-fg-primary" }, "资源库存储", -1)),
                  createBaseVNode("div", _hoisted_26, [
                    createBaseVNode("button", {
                      type: "button",
                      class: normalizeClass([
                        "rounded-md border px-3 py-1 text-xs transition-colors",
                        storageMode.value === "reference" ? "border-brand-500 bg-brand-500/10 text-brand-600" : "border-line-subtle bg-surface-1 text-fg-secondary hover:border-brand-400"
                      ]),
                      onClick: _cache[1] || (_cache[1] = ($event) => setStorageMode("reference"))
                    }, " 引用原文件（默认） ", 2),
                    createBaseVNode("button", {
                      type: "button",
                      class: normalizeClass([
                        "rounded-md border px-3 py-1 text-xs transition-colors",
                        storageMode.value === "copy" ? "border-brand-500 bg-brand-500/10 text-brand-600" : "border-line-subtle bg-surface-1 text-fg-secondary hover:border-brand-400"
                      ]),
                      onClick: _cache[2] || (_cache[2] = ($event) => setStorageMode("copy"))
                    }, " 导入时拷贝入库 ", 2)
                  ]),
                  _cache[30] || (_cache[30] = createBaseVNode("p", { class: "mt-2 text-[11px] leading-5 text-fg-tertiary" }, " 拷贝模式：新导入的文件会复制到资源库 images/ 目录（Eagle 行为），原文件不动；已有素材可用下方「迁移」批量拷入。 ", -1)),
                  createBaseVNode("div", _hoisted_27, [
                    createVNode(_sfc_main$3, {
                      size: "sm",
                      variant: "secondary",
                      loading: scanningMissing.value,
                      onClick: onScanMissing
                    }, {
                      default: withCtx(() => [..._cache[26] || (_cache[26] = [
                        createTextVNode(" 扫描丢失文件 ", -1)
                      ])]),
                      _: 1
                    }, 8, ["loading"]),
                    createVNode(_sfc_main$3, {
                      size: "sm",
                      variant: "ghost",
                      onClick: onRepairMovedLibrary
                    }, {
                      default: withCtx(() => [..._cache[27] || (_cache[27] = [
                        createTextVNode(" 库目录已移动？修复… ", -1)
                      ])]),
                      _: 1
                    }),
                    createVNode(_sfc_main$3, {
                      size: "sm",
                      variant: "secondary",
                      loading: migrating.value,
                      disabled: storageMode.value !== "copy",
                      title: storageMode.value !== "copy" ? "先切换到拷贝模式" : "",
                      onClick: onMigrateConfirm
                    }, {
                      default: withCtx(() => [..._cache[28] || (_cache[28] = [
                        createTextVNode(" 迁移引用文件入库… ", -1)
                      ])]),
                      _: 1
                    }, 8, ["loading", "disabled", "title"])
                  ]),
                  storageMsg.value ? (openBlock(), createElementBlock("p", _hoisted_28, toDisplayString(storageMsg.value), 1)) : createCommentVNode("", true)
                ]),
                createBaseVNode("section", _hoisted_29, [
                  createBaseVNode("div", _hoisted_30, [
                    _cache[31] || (_cache[31] = createBaseVNode("h3", { class: "text-xs font-medium text-fg-primary" }, "自动备份", -1)),
                    createVNode(_sfc_main$4, {
                      size: "sm",
                      "model-value": backupCfg.value?.enabled ?? false,
                      "aria-label": "自动备份",
                      "onUpdate:modelValue": setBackupEnabled
                    }, null, 8, ["model-value"])
                  ]),
                  _cache[37] || (_cache[37] = createBaseVNode("p", { class: "mt-2 text-[11px] leading-5 text-fg-tertiary" }, " 定期把数据库备份到资源库 backups/ 目录（素材引用模式下的原文件不在备份范围内）。备份在后台静默进行，不阻塞素材操作。 ", -1)),
                  backupCfg.value?.enabled ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                    createBaseVNode("div", _hoisted_31, [
                      _cache[32] || (_cache[32] = createBaseVNode("span", { class: "text-xs text-fg-muted" }, "备份频率", -1)),
                      (openBlock(), createElementBlock(Fragment, null, renderList([1, 7, 30], (d) => {
                        return createBaseVNode("button", {
                          key: d,
                          type: "button",
                          class: normalizeClass([
                            "rounded-md border px-2.5 py-1 text-xs transition-colors",
                            backupCfg.value.intervalDays === d ? "border-brand-500 bg-brand-500/10 text-brand-600" : "border-line-subtle bg-surface-1 text-fg-secondary hover:border-brand-400"
                          ]),
                          onClick: ($event) => setBackupInterval(d)
                        }, toDisplayString(d === 1 ? "每天" : d === 7 ? "每周" : "每月"), 11, _hoisted_32);
                      }), 64)),
                      _cache[33] || (_cache[33] = createBaseVNode("span", { class: "ml-2 text-xs text-fg-muted" }, "保留", -1)),
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => backupKeep.value = $event),
                        type: "number",
                        min: "1",
                        max: "100",
                        class: "h-7 w-16 px-2 text-xs rounded-md border border-line-default bg-surface-1 text-fg-primary",
                        onChange: setBackupKeep
                      }, null, 544), [
                        [
                          vModelText,
                          backupKeep.value,
                          void 0,
                          { number: true }
                        ]
                      ]),
                      _cache[34] || (_cache[34] = createBaseVNode("span", { class: "text-xs text-fg-muted" }, "份", -1))
                    ]),
                    backupCfg.value.lastAt ? (openBlock(), createElementBlock("p", _hoisted_33, " 上次备份：" + toDisplayString(new Date(backupCfg.value.lastAt).toLocaleString()), 1)) : createCommentVNode("", true)
                  ], 64)) : createCommentVNode("", true),
                  createBaseVNode("div", _hoisted_34, [
                    createVNode(_sfc_main$3, {
                      size: "sm",
                      variant: "secondary",
                      loading: backupRunning.value,
                      onClick: onBackupNow
                    }, {
                      default: withCtx(() => [..._cache[35] || (_cache[35] = [
                        createTextVNode(" 立即备份 ", -1)
                      ])]),
                      _: 1
                    }, 8, ["loading"]),
                    createVNode(_sfc_main$3, {
                      size: "sm",
                      variant: "ghost",
                      onClick: onOpenBackupDir
                    }, {
                      default: withCtx(() => [..._cache[36] || (_cache[36] = [
                        createTextVNode("打开备份目录", -1)
                      ])]),
                      _: 1
                    })
                  ]),
                  backupMsg.value ? (openBlock(), createElementBlock("p", _hoisted_35, toDisplayString(backupMsg.value), 1)) : createCommentVNode("", true)
                ])
              ], 64)) : activeTab.value === "sidebar" ? (openBlock(), createElementBlock("section", _hoisted_36, [
                _cache[39] || (_cache[39] = createBaseVNode("h3", { class: "mb-3 text-xs font-medium text-fg-primary" }, "在侧栏显示的文件：", -1)),
                createBaseVNode("div", _hoisted_37, [
                  createBaseVNode("span", _hoisted_38, [
                    createBaseVNode("span", _hoisted_39, [
                      createVNode(_sfc_main$2, {
                        icon: "ic-check",
                        size: 9,
                        class: "text-fg-secondary"
                      })
                    ]),
                    _cache[38] || (_cache[38] = createTextVNode(" 全部 ", -1))
                  ]),
                  (openBlock(), createElementBlock(Fragment, null, renderList(sidebarRows, (row) => {
                    return createBaseVNode("button", {
                      key: row.key,
                      type: "button",
                      role: "checkbox",
                      "aria-checked": isSidebarVisible(row.key),
                      class: "flex items-center gap-2 text-left text-xs text-fg-primary",
                      onClick: ($event) => setSidebarVisible(row.key, !isSidebarVisible(row.key))
                    }, [
                      createBaseVNode("span", {
                        class: normalizeClass([
                          "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                          isSidebarVisible(row.key) ? "border-brand-500 bg-brand-500" : "border-line-strong"
                        ])
                      }, [
                        isSidebarVisible(row.key) ? (openBlock(), createBlock(_sfc_main$2, {
                          key: 0,
                          icon: "ic-check",
                          size: 9,
                          class: "text-white"
                        })) : createCommentVNode("", true)
                      ], 2),
                      createTextVNode(" " + toDisplayString(row.label), 1)
                    ], 8, _hoisted_40);
                  }), 64))
                ]),
                _cache[40] || (_cache[40] = createBaseVNode("div", { class: "my-3 border-t border-line-subtle" }, null, -1)),
                createBaseVNode("div", _hoisted_41, [
                  (openBlock(), createElementBlock(Fragment, null, renderList(sidebarRows2, (row) => {
                    return createBaseVNode("button", {
                      key: row.key,
                      type: "button",
                      role: "checkbox",
                      "aria-checked": isSidebarVisible(row.key),
                      class: "flex items-center gap-2 text-left text-xs text-fg-primary",
                      onClick: ($event) => setSidebarVisible(row.key, !isSidebarVisible(row.key))
                    }, [
                      createBaseVNode("span", {
                        class: normalizeClass([
                          "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                          isSidebarVisible(row.key) ? "border-brand-500 bg-brand-500" : "border-line-strong"
                        ])
                      }, [
                        isSidebarVisible(row.key) ? (openBlock(), createBlock(_sfc_main$2, {
                          key: 0,
                          icon: "ic-check",
                          size: 9,
                          class: "text-white"
                        })) : createCommentVNode("", true)
                      ], 2),
                      createTextVNode(" " + toDisplayString(row.label), 1)
                    ], 8, _hoisted_42);
                  }), 64))
                ])
              ])) : activeTab.value === "control" ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
                createBaseVNode("section", _hoisted_43, [
                  _cache[44] || (_cache[44] = createBaseVNode("h3", { class: "mb-3 text-xs font-medium text-fg-primary" }, "鼠标", -1)),
                  createBaseVNode("div", _hoisted_44, [
                    _cache[43] || (_cache[43] = createBaseVNode("span", { class: "text-xs text-fg-secondary" }, "双击文件", -1)),
                    createBaseVNode("div", _hoisted_45, [
                      createBaseVNode("button", {
                        type: "button",
                        role: "radio",
                        "aria-checked": dblClickAction.value === "preview",
                        class: "flex items-center gap-1.5 text-xs text-fg-primary",
                        onClick: _cache[4] || (_cache[4] = ($event) => setDblClickAction("preview"))
                      }, [
                        createBaseVNode("span", {
                          class: normalizeClass([
                            "flex size-3.5 items-center justify-center rounded-full border",
                            dblClickAction.value === "preview" ? "border-brand-500" : "border-line-strong"
                          ])
                        }, [
                          createBaseVNode("span", {
                            class: normalizeClass(["size-1.5 rounded-full", dblClickAction.value === "preview" ? "bg-brand-500" : ""])
                          }, null, 2)
                        ], 2),
                        _cache[41] || (_cache[41] = createTextVNode(" 预览 ", -1))
                      ], 8, _hoisted_46),
                      createBaseVNode("button", {
                        type: "button",
                        role: "radio",
                        "aria-checked": dblClickAction.value === "system",
                        class: "flex items-center gap-1.5 text-xs text-fg-primary",
                        title: "用系统默认应用打开文件",
                        onClick: _cache[5] || (_cache[5] = ($event) => setDblClickAction("system"))
                      }, [
                        createBaseVNode("span", {
                          class: normalizeClass([
                            "flex size-3.5 items-center justify-center rounded-full border",
                            dblClickAction.value === "system" ? "border-brand-500" : "border-line-strong"
                          ])
                        }, [
                          createBaseVNode("span", {
                            class: normalizeClass(["size-1.5 rounded-full", dblClickAction.value === "system" ? "bg-brand-500" : ""])
                          }, null, 2)
                        ], 2),
                        _cache[42] || (_cache[42] = createTextVNode(" 在默认应用打开 ", -1))
                      ], 8, _hoisted_47)
                    ])
                  ])
                ]),
                _cache[45] || (_cache[45] = createStaticVNode('<section class="mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4"><h3 class="mb-3 text-xs font-medium text-fg-primary">键盘</h3><div class="grid grid-cols-[96px_1fr] items-center gap-x-4 py-1.5"><span class="text-xs text-fg-secondary">空格键</span><div class="flex items-center gap-10"><span class="flex items-center gap-1.5 text-xs text-fg-primary"><span class="flex size-3.5 items-center justify-center rounded-full border border-brand-500"><span class="size-1.5 rounded-full bg-brand-500"></span></span> 快速预览 </span><span class="flex cursor-not-allowed items-center gap-1.5 text-xs text-fg-muted" title="Leaf 暂不支持 Quick Look"><span class="size-3.5 rounded-full border border-line-strong"></span> Quick Look </span><span class="flex cursor-not-allowed items-center gap-1.5 text-xs text-fg-muted" title="空格键固定为快速预览"><span class="size-3.5 rounded-full border border-line-strong"></span> 滚动页面 </span></div></div></section>', 1))
              ], 64)) : activeTab.value === "shortcuts" ? (openBlock(), createElementBlock(Fragment, { key: 3 }, [
                createBaseVNode("div", _hoisted_48, [
                  createVNode(_sfc_main$2, {
                    icon: "ic_search",
                    size: 12,
                    class: "pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted"
                  }),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => shortcutQuery.value = $event),
                    type: "text",
                    placeholder: "搜索…",
                    class: "h-8 w-full rounded-md border border-line-subtle bg-surface-0 pl-7 pr-2 text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none"
                  }, null, 512), [
                    [vModelText, shortcutQuery.value]
                  ])
                ]),
                (openBlock(true), createElementBlock(Fragment, null, renderList(filteredShortcutGroups.value, (g) => {
                  return openBlock(), createElementBlock("section", {
                    key: g.name,
                    class: "mb-4 rounded-lg border border-line-subtle bg-surface-2 p-4"
                  }, [
                    createBaseVNode("h3", _hoisted_49, [
                      createTextVNode(toDisplayString(g.name) + " ", 1),
                      createBaseVNode("span", _hoisted_50, "(" + toDisplayString(g.rows.length) + ")", 1)
                    ]),
                    createBaseVNode("div", _hoisted_51, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(g.rows, (r) => {
                        return openBlock(), createElementBlock("div", {
                          key: r.label,
                          class: "flex items-center justify-between rounded-md bg-surface-0 px-3 py-1.5"
                        }, [
                          createBaseVNode("span", _hoisted_52, toDisplayString(r.label), 1),
                          createBaseVNode("span", _hoisted_53, toDisplayString(r.keys), 1)
                        ]);
                      }), 128))
                    ])
                  ]);
                }), 128))
              ], 64)) : activeTab.value === "screenshot" ? (openBlock(), createElementBlock("section", _hoisted_54, [
                _cache[55] || (_cache[55] = createBaseVNode("h3", { class: "mb-3 text-xs font-medium text-fg-primary" }, "截图选项", -1)),
                createBaseVNode("div", _hoisted_55, [
                  _cache[47] || (_cache[47] = createBaseVNode("span", { class: "text-xs text-fg-secondary" }, "截图快捷键", -1)),
                  createBaseVNode("div", _hoisted_56, [
                    createVNode(_sfc_main$4, {
                      "model-value": screenshotSettings.value?.shortcutEnabled ?? true,
                      "onUpdate:modelValue": _cache[7] || (_cache[7] = (v) => patchScreenshot({ shortcutEnabled: v }))
                    }, null, 8, ["model-value"]),
                    _cache[46] || (_cache[46] = createBaseVNode("span", { class: "text-[11px] text-fg-tertiary" }, "⌘⇧A 全局唤起截图", -1))
                  ])
                ]),
                createBaseVNode("div", _hoisted_57, [
                  _cache[49] || (_cache[49] = createBaseVNode("span", { class: "text-xs text-fg-secondary" }, "输出格式", -1)),
                  createBaseVNode("select", {
                    class: "h-7 w-36 rounded-md border border-line-subtle bg-surface-1 px-2 text-xs text-fg-primary",
                    value: screenshotSettings.value?.format ?? "png",
                    onChange: _cache[8] || (_cache[8] = ($event) => patchScreenshot({
                      format: $event.target.value
                    }))
                  }, [..._cache[48] || (_cache[48] = [
                    createBaseVNode("option", { value: "png" }, "PNG（无损）", -1),
                    createBaseVNode("option", { value: "jpg" }, "JPG（体积小）", -1)
                  ])], 40, _hoisted_58)
                ]),
                screenshotSettings.value?.format === "jpg" ? (openBlock(), createElementBlock("div", _hoisted_59, [
                  _cache[50] || (_cache[50] = createBaseVNode("span", { class: "text-xs text-fg-secondary" }, "质量", -1)),
                  createBaseVNode("input", {
                    type: "range",
                    min: "1",
                    max: "100",
                    value: screenshotSettings.value?.quality ?? 90,
                    class: "w-40",
                    onChange: _cache[9] || (_cache[9] = ($event) => patchScreenshot({ quality: Number($event.target.value) }))
                  }, null, 40, _hoisted_60)
                ])) : createCommentVNode("", true),
                createBaseVNode("div", _hoisted_61, [
                  _cache[52] || (_cache[52] = createBaseVNode("span", { class: "text-xs text-fg-secondary" }, "保存路径", -1)),
                  createBaseVNode("div", _hoisted_62, [
                    createBaseVNode("span", _hoisted_63, toDisplayString(screenshotSettings.value?.saveDir || "当前资源库/screenshots"), 1),
                    createVNode(_sfc_main$3, {
                      size: "sm",
                      variant: "secondary",
                      onClick: onPickScreenshotDir
                    }, {
                      default: withCtx(() => [..._cache[51] || (_cache[51] = [
                        createTextVNode("选择…", -1)
                      ])]),
                      _: 1
                    })
                  ])
                ]),
                createBaseVNode("div", _hoisted_64, [
                  _cache[54] || (_cache[54] = createBaseVNode("span", { class: "text-xs text-fg-secondary" }, "自动标签", -1)),
                  createBaseVNode("div", _hoisted_65, [
                    createVNode(_sfc_main$4, {
                      "model-value": screenshotSettings.value?.autoTag ?? true,
                      "onUpdate:modelValue": _cache[10] || (_cache[10] = (v) => patchScreenshot({ autoTag: v }))
                    }, null, 8, ["model-value"]),
                    _cache[53] || (_cache[53] = createBaseVNode("span", { class: "text-[11px] text-fg-tertiary" }, "入库时自动添加「截图」标签", -1))
                  ])
                ])
              ])) : activeTab.value === "notification" ? (openBlock(), createElementBlock("section", _hoisted_66, [
                createBaseVNode("div", _hoisted_67, [
                  _cache[56] || (_cache[56] = createBaseVNode("h3", { class: "text-xs font-medium text-fg-primary" }, "弹出通知", -1)),
                  createVNode(_sfc_main$4, {
                    size: "sm",
                    "model-value": notifyMaster.value,
                    "aria-label": "启用弹出通知",
                    "onUpdate:modelValue": setNotifyMaster
                  }, null, 8, ["model-value"])
                ]),
                createBaseVNode("div", {
                  class: normalizeClass(["mt-3 flex flex-col gap-2.5", notifyMaster.value ? "" : "opacity-40"]),
                  inert: !notifyMaster.value
                }, [
                  createBaseVNode("button", {
                    type: "button",
                    role: "checkbox",
                    "aria-checked": notifyProcessing.value,
                    class: "flex items-center gap-2 text-left text-xs text-fg-primary",
                    onClick: _cache[11] || (_cache[11] = ($event) => setNotify("processing", !notifyProcessing.value))
                  }, [
                    createBaseVNode("span", {
                      class: normalizeClass([
                        "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                        notifyProcessing.value ? "border-brand-500 bg-brand-500" : "border-line-strong"
                      ])
                    }, [
                      notifyProcessing.value ? (openBlock(), createBlock(_sfc_main$2, {
                        key: 0,
                        icon: "ic-check",
                        size: 9,
                        class: "text-white"
                      })) : createCommentVNode("", true)
                    ], 2),
                    _cache[57] || (_cache[57] = createTextVNode(" 素材处理完成时，弹出通知 ", -1))
                  ], 8, _hoisted_69),
                  createBaseVNode("button", {
                    type: "button",
                    role: "checkbox",
                    "aria-checked": notifyUpdate.value,
                    class: "flex items-center gap-2 text-left text-xs text-fg-primary",
                    onClick: _cache[12] || (_cache[12] = ($event) => setNotify("update", !notifyUpdate.value))
                  }, [
                    createBaseVNode("span", {
                      class: normalizeClass(["flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border", notifyUpdate.value ? "border-brand-500 bg-brand-500" : "border-line-strong"])
                    }, [
                      notifyUpdate.value ? (openBlock(), createBlock(_sfc_main$2, {
                        key: 0,
                        icon: "ic-check",
                        size: 9,
                        class: "text-white"
                      })) : createCommentVNode("", true)
                    ], 2),
                    _cache[58] || (_cache[58] = createTextVNode(" 应用更新可用时，弹出通知 ", -1))
                  ], 8, _hoisted_70)
                ], 10, _hoisted_68)
              ])) : activeTab.value === "privacy" ? (openBlock(), createElementBlock("section", _hoisted_71, [
                createBaseVNode("div", _hoisted_72, [
                  _cache[59] || (_cache[59] = createBaseVNode("h3", { class: "text-xs font-medium text-fg-primary" }, "启用密码锁", -1)),
                  createVNode(_sfc_main$4, {
                    size: "sm",
                    "model-value": unref(actions).lockEnabled.value,
                    "aria-label": "启用密码锁",
                    title: "前往素材库设置密码锁",
                    "onUpdate:modelValue": goPrivacySettings
                  }, null, 8, ["model-value"])
                ]),
                createBaseVNode("p", _hoisted_73, " 密码锁可保护您的内容在您不在时不被窥视。在密码锁设置完成后，可以通过菜单 「Leaf」→「锁定」进行上锁。 " + toDisplayString(unref(actions).lockEnabled.value ? "当前已启用——进入素材库需解锁。" : "当前未启用。"), 1)
              ])) : activeTab.value === "autoimport" ? (openBlock(), createElementBlock(Fragment, { key: 7 }, [
                createBaseVNode("section", _hoisted_74, [
                  createBaseVNode("div", _hoisted_75, [
                    _cache[60] || (_cache[60] = createBaseVNode("h3", { class: "text-xs font-medium text-fg-primary" }, "启用自动导入", -1)),
                    createVNode(_sfc_main$4, {
                      size: "sm",
                      "model-value": watchedEnabled.value,
                      "aria-label": "启用自动导入",
                      "onUpdate:modelValue": toggleWatchedEnabled
                    }, null, 8, ["model-value"])
                  ]),
                  _cache[62] || (_cache[62] = createBaseVNode("p", { class: "mt-2 text-[11px] leading-5 text-fg-tertiary" }, " “自动导入”功能可监控指定的文件夹，发现新文件后自动导入素材库。设置之后，只需将文件放入被监控的文件夹，Leaf 便会自动将这些文件导入到素材库中。 ", -1)),
                  watchedEnabled.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                    createBaseVNode("button", {
                      type: "button",
                      class: "mt-4 flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left text-xs text-fg-primary transition-colors duration-fast hover:bg-surface-hover",
                      onClick: addWatchedFolder
                    }, [
                      createVNode(_sfc_main$2, {
                        icon: "preferences/ic-watch-folder",
                        size: 15,
                        class: "shrink-0 text-fg-secondary"
                      }),
                      _cache[61] || (_cache[61] = createBaseVNode("span", { class: "flex-1" }, "添加监视的文件夹...", -1)),
                      createVNode(_sfc_main$2, {
                        icon: "preferences/ic-next",
                        size: 12,
                        class: "text-fg-muted"
                      })
                    ]),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(watchedFolders.value, (folder) => {
                      return openBlock(), createElementBlock("div", {
                        key: folder,
                        class: "flex items-center gap-2 rounded-md px-1 py-1.5 text-xs hover:bg-surface-hover"
                      }, [
                        createVNode(_sfc_main$2, {
                          icon: "preferences/ic-folder",
                          size: 15,
                          class: "shrink-0 text-fg-secondary"
                        }),
                        createBaseVNode("span", {
                          class: "min-w-0 flex-1 truncate text-fg-primary",
                          title: folder
                        }, toDisplayString(folder), 9, _hoisted_76),
                        createBaseVNode("button", {
                          type: "button",
                          class: "shrink-0 text-xs text-fg-brand hover:underline",
                          onClick: ($event) => removeWatchedFolder(folder)
                        }, " 停止监控 ", 8, _hoisted_77)
                      ]);
                    }), 128)),
                    watchedFolders.value.length === 0 ? (openBlock(), createElementBlock("p", _hoisted_78, " 还没有监控文件夹，点击上方「添加监视的文件夹...」开始。 ")) : createCommentVNode("", true)
                  ], 64)) : createCommentVNode("", true)
                ]),
                createBaseVNode("section", _hoisted_79, [
                  createBaseVNode("div", _hoisted_80, [
                    _cache[63] || (_cache[63] = createBaseVNode("h3", { class: "text-xs font-medium text-fg-primary" }, "监听剪贴板", -1)),
                    createVNode(_sfc_main$4, {
                      size: "sm",
                      "model-value": clipboardWatchEnabled.value,
                      "aria-label": "监听剪贴板",
                      "onUpdate:modelValue": toggleClipboardWatch
                    }, null, 8, ["model-value"])
                  ]),
                  _cache[64] || (_cache[64] = createBaseVNode("p", { class: "mt-2 text-[11px] leading-5 text-fg-tertiary" }, " 开启后，复制到剪贴板的文件路径或图片会自动导入素材库（系统通知提醒）。应用内复制素材操作不会被重复导入。 ", -1))
                ])
              ], 64)) : activeTab.value === "ai" ? (openBlock(), createElementBlock(Fragment, { key: 8 }, [
                createBaseVNode("section", _hoisted_81, [
                  createBaseVNode("div", _hoisted_82, [
                    _cache[65] || (_cache[65] = createBaseVNode("h3", { class: "text-xs font-medium text-fg-primary" }, "文字识别（OCR）", -1)),
                    createVNode(_sfc_main$4, {
                      size: "sm",
                      "model-value": ocrStatus.value?.enabled ?? false,
                      "aria-label": "文字识别",
                      "onUpdate:modelValue": toggleOcr
                    }, null, 8, ["model-value"])
                  ]),
                  _cache[67] || (_cache[67] = createBaseVNode("p", { class: "mt-2 text-[11px] leading-5 text-fg-tertiary" }, " 开启后自动识别图片中的文字（首次使用需下载约 20MB 语言包），识别完成后可直接按图片内文字搜索，检查器中可查看与复制。 ", -1)),
                  ocrStatus.value?.enabled ? (openBlock(), createElementBlock("div", _hoisted_83, [
                    createBaseVNode("span", null, "待识别 " + toDisplayString(ocrStatus.value.pendingTotal) + " 张", 1),
                    createVNode(_sfc_main$3, {
                      size: "sm",
                      variant: "secondary",
                      loading: ocrBusy.value,
                      onClick: runOcrAll
                    }, {
                      default: withCtx(() => [..._cache[66] || (_cache[66] = [
                        createTextVNode(" 识别全部缺失 ", -1)
                      ])]),
                      _: 1
                    }, 8, ["loading"])
                  ])) : createCommentVNode("", true)
                ]),
                createBaseVNode("section", _hoisted_84, [
                  createBaseVNode("div", _hoisted_85, [
                    _cache[68] || (_cache[68] = createBaseVNode("h3", { class: "text-xs font-medium text-fg-primary" }, "文档正文抽取", -1)),
                    createVNode(_sfc_main$4, {
                      size: "sm",
                      "model-value": docTextStatus.value?.enabled ?? false,
                      "aria-label": "文档正文抽取",
                      "onUpdate:modelValue": toggleDocText
                    }, null, 8, ["model-value"])
                  ]),
                  _cache[70] || (_cache[70] = createBaseVNode("p", { class: "mt-2 text-[11px] leading-5 text-fg-tertiary" }, " 开启后自动抽取 docx / xlsx / pptx / odf / rtf / epub / pdf 以及 txt / md / csv 等文本类素材的正文，抽取后可直接按文档内容搜索（旧版 .doc / .xls / .ppt 不支持，需要外部转换器）。 ", -1)),
                  docTextStatus.value?.enabled ? (openBlock(), createElementBlock("div", _hoisted_86, [
                    createBaseVNode("span", null, "待抽取 " + toDisplayString(docTextStatus.value.pendingTotal) + " 个", 1),
                    createVNode(_sfc_main$3, {
                      size: "sm",
                      variant: "secondary",
                      loading: docTextBusy.value,
                      onClick: runDocTextAll
                    }, {
                      default: withCtx(() => [..._cache[69] || (_cache[69] = [
                        createTextVNode(" 抽取全部缺失 ", -1)
                      ])]),
                      _: 1
                    }, 8, ["loading"])
                  ])) : createCommentVNode("", true)
                ]),
                createBaseVNode("section", _hoisted_87, [
                  createBaseVNode("div", _hoisted_88, [
                    _cache[73] || (_cache[73] = createBaseVNode("h3", { class: "text-xs font-medium text-fg-primary" }, "图文向量检索（中文文搜图 + 视觉相似）", -1)),
                    vecStatus.value?.ready ? (openBlock(), createBlock(_sfc_main$5, {
                      key: 0,
                      variant: "success"
                    }, {
                      default: withCtx(() => [
                        createTextVNode(" 模型就绪 · 已索引 " + toDisplayString(vecStatus.value.indexed), 1)
                      ]),
                      _: 1
                    })) : vecStatus.value?.installed ? (openBlock(), createBlock(_sfc_main$5, {
                      key: 1,
                      variant: "warning"
                    }, {
                      default: withCtx(() => [..._cache[71] || (_cache[71] = [
                        createTextVNode("模型未通过自检", -1)
                      ])]),
                      _: 1
                    })) : (openBlock(), createBlock(_sfc_main$5, {
                      key: 2,
                      variant: "neutral"
                    }, {
                      default: withCtx(() => [..._cache[72] || (_cache[72] = [
                        createTextVNode("未下载模型", -1)
                      ])]),
                      _: 1
                    }))
                  ]),
                  createBaseVNode("p", _hoisted_89, " 在素材本机跑一个中文图文模型（Chinese-CLIP ViT-B/16，约 " + toDisplayString(vecMb(vecStatus.value?.approxBytes ?? 0)) + " MB，首次需要联网下载；推理全程本地，不上传任何图片）。建好索引后多出两档： ", 1),
                  _cache[78] || (_cache[78] = createBaseVNode("ul", { class: "mt-1 space-y-0.5 text-[11px] leading-5 text-fg-tertiary" }, [
                    createBaseVNode("li", null, [
                      createTextVNode(" · 搜索框开 "),
                      createBaseVNode("span", { class: "text-fg-secondary" }, "AI 语义"),
                      createTextVNode(" 就能用中文按画面内容搜图（「红色日落的海边」），可与文件夹/标签/维度筛选组合 ")
                    ]),
                    createBaseVNode("li", null, " · 「找相似」在 pHash 之外多一档：pHash 只认近乎同一张的图， 这一档认改过一版、换过封面、构图相似的那类 ")
                  ], -1)),
                  createBaseVNode("p", _hoisted_90, " 实测口径（48 张真图池）：中文查询 top-1 命中 18/18；「池子里确实没有」的查询最高分 低于阈值 " + toDisplayString((vecStatus.value?.minScore?.text ?? 0.4).toFixed(2)) + " 时宁可返回空结果，也不给一张不相干的图充数。 ", 1),
                  createBaseVNode("div", _hoisted_91, [
                    !vecStatus.value ? (openBlock(), createElementBlock("span", _hoisted_92, "读不到向量服务状态（主进程未就绪？）")) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                      !vecStatus.value.ready ? (openBlock(), createElementBlock("button", {
                        key: 0,
                        type: "button",
                        class: "rounded bg-brand-500 px-2 py-1 text-[11px] text-white disabled:opacity-50",
                        disabled: vecBusy.value === "download",
                        onClick: downloadVectorModel
                      }, toDisplayString(vecBusy.value === "download" ? "下载中…" : "下载模型"), 9, _hoisted_93)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                        createVNode(_sfc_main$3, {
                          size: "sm",
                          variant: "secondary",
                          loading: vecBusy.value === "index",
                          disabled: vecStatus.value.pending === 0,
                          onClick: _cache[13] || (_cache[13] = ($event) => startIndex(false))
                        }, {
                          default: withCtx(() => [
                            createTextVNode(" 补齐缺失（" + toDisplayString(vecStatus.value.pending) + "） ", 1)
                          ]),
                          _: 1
                        }, 8, ["loading", "disabled"]),
                        createVNode(_sfc_main$3, {
                          size: "sm",
                          variant: "ghost",
                          onClick: _cache[14] || (_cache[14] = ($event) => startIndex(true))
                        }, {
                          default: withCtx(() => [..._cache[74] || (_cache[74] = [
                            createTextVNode("全量重建", -1)
                          ])]),
                          _: 1
                        }),
                        createVNode(_sfc_main$3, {
                          size: "sm",
                          variant: "ghost",
                          onClick: clearVectors
                        }, {
                          default: withCtx(() => [..._cache[75] || (_cache[75] = [
                            createTextVNode(" 清空向量 ", -1)
                          ])]),
                          _: 1
                        }),
                        createVNode(_sfc_main$3, {
                          size: "sm",
                          variant: "ghost",
                          onClick: removeVectorModel
                        }, {
                          default: withCtx(() => [..._cache[76] || (_cache[76] = [
                            createTextVNode(" 删除模型 ", -1)
                          ])]),
                          _: 1
                        })
                      ], 64)),
                      vecBusy.value === "index" ? (openBlock(), createBlock(_sfc_main$3, {
                        key: 2,
                        size: "sm",
                        variant: "ghost",
                        onClick: cancelIndex
                      }, {
                        default: withCtx(() => [..._cache[77] || (_cache[77] = [
                          createTextVNode(" 取消 ", -1)
                        ])]),
                        _: 1
                      })) : createCommentVNode("", true),
                      vecStatus.value.progress ? (openBlock(), createElementBlock("span", _hoisted_94, [
                        createTextVNode(" 进度 " + toDisplayString(vecStatus.value.progress.done) + "/" + toDisplayString(vecStatus.value.progress.total) + " ", 1),
                        vecStatus.value.progress.failed > 0 ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                          createTextVNode(" · 失败 " + toDisplayString(vecStatus.value.progress.failed), 1)
                        ], 64)) : createCommentVNode("", true)
                      ])) : (openBlock(), createElementBlock("span", _hoisted_95, "模型文件 " + toDisplayString(vecMb(vecStatus.value.bytesOnDisk)) + " MB", 1)),
                      createBaseVNode("button", {
                        type: "button",
                        class: "text-[11px] text-fg-muted underline disabled:opacity-0",
                        disabled: !vecStatus.value.lastError,
                        title: vecStatus.value.lastError ?? "",
                        onClick: loadVectorStatus
                      }, toDisplayString(vecStatus.value.lastError ? `上次失败：${vecStatus.value.lastError}` : ""), 9, _hoisted_96)
                    ], 64))
                  ])
                ])
              ], 64)) : activeTab.value === "assistant" ? (openBlock(), createElementBlock("section", _hoisted_97, [
                createBaseVNode("div", _hoisted_98, [
                  _cache[80] || (_cache[80] = createBaseVNode("h3", { class: "text-xs font-medium text-fg-primary" }, "DeepSeek 文本模型", -1)),
                  aiCfg.value?.configured ? (openBlock(), createBlock(_sfc_main$5, {
                    key: 0,
                    variant: "success"
                  }, {
                    default: withCtx(() => [
                      createTextVNode("已配置 " + toDisplayString(aiCfg.value.hint), 1)
                    ]),
                    _: 1
                  })) : (openBlock(), createBlock(_sfc_main$5, {
                    key: 1,
                    variant: "neutral"
                  }, {
                    default: withCtx(() => [..._cache[79] || (_cache[79] = [
                      createTextVNode("未配置", -1)
                    ])]),
                    _: 1
                  }))
                ]),
                _cache[84] || (_cache[84] = createBaseVNode("p", { class: "mt-2 text-[11px] leading-5 text-fg-tertiary" }, " 只处理文字：给「有正文或 OCR 文字」的素材生成摘要与标签建议，结果由你确认后写入。 Key 经系统密钥环加密存本机，界面拿不到明文；请求直连 api.deepseek.com。 ", -1)),
                createBaseVNode("div", _hoisted_99, [
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => aiKeyInput.value = $event),
                    type: "password",
                    placeholder: "sk-…",
                    autocomplete: "off",
                    class: "h-8 min-w-0 flex-1 rounded-md border border-line-default bg-surface-0 px-2 text-xs text-fg-primary focus:border-brand-500 focus:outline-none"
                  }, null, 512), [
                    [vModelText, aiKeyInput.value]
                  ]),
                  createVNode(_sfc_main$3, {
                    size: "sm",
                    loading: aiBusy.value,
                    disabled: !aiKeyInput.value.trim(),
                    onClick: onSaveAiKey
                  }, {
                    default: withCtx(() => [..._cache[81] || (_cache[81] = [
                      createTextVNode("保存", -1)
                    ])]),
                    _: 1
                  }, 8, ["loading", "disabled"]),
                  aiCfg.value?.configured ? (openBlock(), createBlock(_sfc_main$3, {
                    key: 0,
                    size: "sm",
                    variant: "ghost",
                    onClick: onClearAiKey
                  }, {
                    default: withCtx(() => [..._cache[82] || (_cache[82] = [
                      createTextVNode("清除", -1)
                    ])]),
                    _: 1
                  })) : createCommentVNode("", true)
                ]),
                createBaseVNode("div", _hoisted_100, [
                  createVNode(_sfc_main$3, {
                    size: "sm",
                    variant: "secondary",
                    loading: aiBusy.value,
                    disabled: !aiCfg.value?.configured,
                    onClick: onTestAi
                  }, {
                    default: withCtx(() => [..._cache[83] || (_cache[83] = [
                      createTextVNode("测试连接", -1)
                    ])]),
                    _: 1
                  }, 8, ["loading", "disabled"]),
                  aiTest.value ? (openBlock(), createElementBlock("span", _hoisted_101, toDisplayString(aiTest.value), 1)) : createCommentVNode("", true)
                ])
              ])) : activeTab.value === "plugins" ? (openBlock(), createElementBlock("section", _hoisted_102, [
                createBaseVNode("div", _hoisted_103, [
                  _cache[85] || (_cache[85] = createBaseVNode("h3", { class: "text-xs font-medium text-fg-primary" }, "已安装插件", -1)),
                  createVNode(_sfc_main$5, { variant: "brand" }, {
                    default: withCtx(() => [
                      createTextVNode(toDisplayString(plugins.value.length), 1)
                    ]),
                    _: 1
                  })
                ]),
                _cache[87] || (_cache[87] = createBaseVNode("p", { class: "mt-2 text-[11px] leading-5 text-fg-tertiary" }, " 插件在隔离沙箱中运行；管理面板见工具栏 ⚡ 入口（可添加自定义插件目录）。 ", -1)),
                plugins.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_104, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(plugins.value, (p) => {
                    return openBlock(), createElementBlock("div", {
                      key: p.id,
                      class: "flex items-center gap-2 rounded-md bg-surface-0 px-3 py-1.5 text-xs"
                    }, [
                      createBaseVNode("span", {
                        class: "min-w-0 flex-1 truncate text-fg-primary",
                        title: p.id
                      }, toDisplayString(p.name), 9, _hoisted_105),
                      createBaseVNode("span", _hoisted_106, "v" + toDisplayString(p.version), 1),
                      createBaseVNode("span", _hoisted_107, toDisplayString(unref(PLUGIN_CATEGORY_LABELS)[p.category] ?? p.category), 1)
                    ]);
                  }), 128))
                ])) : (openBlock(), createElementBlock("p", _hoisted_108, [..._cache[86] || (_cache[86] = [
                  createTextVNode(" 暂无插件。将插件目录放入 ", -1),
                  createBaseVNode("code", null, "userData/plugins/", -1),
                  createTextVNode(" 后刷新。 ", -1)
                ])]))
              ])) : activeTab.value === "clip" ? (openBlock(), createElementBlock("section", _hoisted_109, [
                createBaseVNode("div", _hoisted_110, [
                  _cache[90] || (_cache[90] = createBaseVNode("h3", { class: "text-xs font-medium text-fg-primary" }, "剪藏服务", -1)),
                  clipRunning.value ? (openBlock(), createBlock(_sfc_main$5, {
                    key: 0,
                    variant: "success"
                  }, {
                    default: withCtx(() => [..._cache[88] || (_cache[88] = [
                      createTextVNode("运行中", -1)
                    ])]),
                    _: 1
                  })) : (openBlock(), createBlock(_sfc_main$5, {
                    key: 1,
                    variant: "neutral"
                  }, {
                    default: withCtx(() => [..._cache[89] || (_cache[89] = [
                      createTextVNode("未运行", -1)
                    ])]),
                    _: 1
                  }))
                ]),
                _cache[92] || (_cache[92] = createBaseVNode("p", { class: "mt-2 text-[11px] leading-5 text-fg-tertiary" }, " 在 Chrome 扩展（开发者模式加载 extension/ 目录）中填入以下信息，即可右键存图入素材库。 ", -1)),
                createBaseVNode("div", _hoisted_111, [
                  createBaseVNode("div", _hoisted_112, [
                    createBaseVNode("code", _hoisted_113, toDisplayString(clipTokenMasked.value), 1)
                  ]),
                  createBaseVNode("button", {
                    type: "button",
                    class: "flex size-8 shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg-primary",
                    title: clipShowToken.value ? "隐藏 Token" : "显示 Token",
                    "aria-label": "显示或隐藏 Token",
                    onClick: _cache[16] || (_cache[16] = ($event) => clipShowToken.value = !clipShowToken.value)
                  }, [
                    createVNode(_sfc_main$2, {
                      icon: clipShowToken.value ? "ic_eye" : "preferences/ic-copy",
                      size: 14
                    }, null, 8, ["icon"])
                  ], 8, _hoisted_114),
                  createBaseVNode("button", {
                    type: "button",
                    class: "flex size-8 shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg-primary",
                    title: "复制 Token",
                    "aria-label": "复制 Token",
                    onClick: _cache[17] || (_cache[17] = ($event) => copyClipField(clipToken.value ?? "", "Token"))
                  }, [
                    createVNode(_sfc_main$2, {
                      icon: "preferences/ic-copy",
                      size: 14
                    })
                  ]),
                  createVNode(_sfc_main$3, {
                    size: "sm",
                    variant: "secondary",
                    loading: clipRegenerating.value,
                    onClick: onRegenerateClipToken
                  }, {
                    default: withCtx(() => [..._cache[91] || (_cache[91] = [
                      createTextVNode(" 重新生成 ", -1)
                    ])]),
                    _: 1
                  }, 8, ["loading"])
                ]),
                createBaseVNode("div", _hoisted_115, [
                  createBaseVNode("div", _hoisted_116, [
                    createVNode(_sfc_main$2, {
                      icon: "preferences/ic-link",
                      size: 13,
                      class: "shrink-0 text-fg-muted"
                    }),
                    createBaseVNode("span", _hoisted_117, toDisplayString(clipServiceUrl.value || "http://localhost:" + (clipPort.value ?? "—") + "/"), 1)
                  ]),
                  createBaseVNode("button", {
                    type: "button",
                    class: "flex size-8 shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
                    disabled: !clipServiceUrl.value,
                    title: clipServiceUrl.value ? "复制服务地址" : "剪藏服务未运行",
                    "aria-label": "复制服务地址",
                    onClick: _cache[18] || (_cache[18] = ($event) => copyClipField(clipServiceUrl.value, "服务地址"))
                  }, [
                    createVNode(_sfc_main$2, {
                      icon: "preferences/ic-copy",
                      size: 14
                    })
                  ], 8, _hoisted_118)
                ]),
                createBaseVNode("p", _hoisted_119, " 服务端口：" + toDisplayString(clipPort.value ?? "—") + " · Token 是访问凭据，重新生成后需在扩展中同步更新 ", 1)
              ])) : activeTab.value === "developer" ? (openBlock(), createElementBlock(Fragment, { key: 12 }, [
                createBaseVNode("section", _hoisted_120, [
                  _cache[96] || (_cache[96] = createBaseVNode("h3", { class: "mb-3 text-xs font-medium text-fg-primary" }, "日志", -1)),
                  createBaseVNode("div", _hoisted_121, [
                    _cache[93] || (_cache[93] = createBaseVNode("span", { class: "text-xs text-fg-secondary" }, "日志模式", -1)),
                    createBaseVNode("div", _hoisted_122, [
                      (openBlock(), createElementBlock(Fragment, null, renderList(telemetryOptions, (t) => {
                        return createBaseVNode("button", {
                          key: t.id,
                          type: "button",
                          role: "radio",
                          "aria-checked": telemetryMode.value === t.id,
                          class: "flex items-center gap-1.5 text-xs text-fg-primary",
                          title: t.description,
                          onClick: ($event) => onSelectTelemetry(t.id)
                        }, [
                          createBaseVNode("span", {
                            class: normalizeClass(["flex size-3.5 items-center justify-center rounded-full border", telemetryMode.value === t.id ? "border-brand-500" : "border-line-strong"])
                          }, [
                            createBaseVNode("span", {
                              class: normalizeClass(["size-1.5 rounded-full", telemetryMode.value === t.id ? "bg-brand-500" : ""])
                            }, null, 2)
                          ], 2),
                          createTextVNode(" " + toDisplayString(t.label), 1)
                        ], 8, _hoisted_123);
                      }), 64))
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_124, [
                    _cache[95] || (_cache[95] = createBaseVNode("span", { class: "text-xs text-fg-secondary" }, "导出日志", -1)),
                    createVNode(_sfc_main$3, {
                      size: "sm",
                      variant: "secondary",
                      onClick: onExportLogs
                    }, {
                      default: withCtx(() => [..._cache[94] || (_cache[94] = [
                        createTextVNode("导出", -1)
                      ])]),
                      _: 1
                    })
                  ])
                ]),
                createBaseVNode("section", _hoisted_125, [
                  _cache[99] || (_cache[99] = createBaseVNode("h3", { class: "mb-3 text-xs font-medium text-fg-primary" }, "数据目录", -1)),
                  createBaseVNode("div", _hoisted_126, [
                    createBaseVNode("div", _hoisted_127, [
                      _cache[97] || (_cache[97] = createBaseVNode("p", { class: "text-xs text-fg-primary" }, "库文件", -1)),
                      createBaseVNode("p", {
                        class: "mt-0.5 truncate text-[11px] text-fg-tertiary",
                        title: systemInfo.value?.dbPath
                      }, toDisplayString(systemInfo.value?.dbPath || "…"), 9, _hoisted_128)
                    ]),
                    createVNode(_sfc_main$3, {
                      size: "sm",
                      variant: "secondary",
                      onClick: onOpenDataDir
                    }, {
                      default: withCtx(() => [..._cache[98] || (_cache[98] = [
                        createTextVNode("打开目录", -1)
                      ])]),
                      _: 1
                    })
                  ])
                ]),
                createBaseVNode("p", _hoisted_129, " Leaf · v" + toDisplayString(appVersion.value) + " · 本地优先 / 开源 ", 1)
              ], 64)) : createCommentVNode("", true)
            ]),
            createBaseVNode("footer", _hoisted_130, [
              createVNode(_sfc_main$3, {
                size: "sm",
                variant: "primary",
                onClick: onSaveSettings
              }, {
                default: withCtx(() => [..._cache[100] || (_cache[100] = [
                  createTextVNode("保存设置", -1)
                ])]),
                _: 1
              }),
              createVNode(_sfc_main$3, {
                size: "sm",
                variant: "secondary",
                onClick: goBack
              }, {
                default: withCtx(() => [..._cache[101] || (_cache[101] = [
                  createTextVNode("应用", -1)
                ])]),
                _: 1
              })
            ])
          ])
        ])
      ]);
    };
  }
}
