/* 2026-09-22 由 dev-server 缓存的编译产物机械还原：非原始源码，类型标注已被 esbuild 剥除，
   import 说明符已尽量改回裸包名。过了 node --check 语法校验，未做运行验证。 */
import { ref } from "vue";
import { useToast } from "/src/composables/useToast.ts";
import { useLibraryTabs } from "/src/stores/libraryTabs.ts";
import { useDialogs } from "/src/views/photos/composables/useDialogs.ts";
import { usePhotoData } from "/src/views/photos/composables/usePhotoData.ts";
const SIMILARITY_THRESHOLD = 10;
const toast = useToast();
const tagManagerOpen = ref(false);
const smartAlbumModalOpen = ref(false);
const albumModalOpen = ref(false);
const folderModalOpen = ref(false);
const batchRenameOpen = ref(false);
const bookmarkModalOpen = ref(false);
const lockModalOpen = ref(false);
const editingSmartAlbum = ref(null);
const renamingFolderId = ref(null);
function build() {
  const tabs = useLibraryTabs();
  const data = usePhotoData();
  const { requestConfirm, requestPrompt } = useDialogs();
  const handleImportFolder = async () => {
    try {
      const folderPaths = await window.api.photos.selectFolder();
      const folderPath = folderPaths[0];
      if (!folderPath) return;
      data.loading.value = true;
      const activeView = tabs.activeView;
      const parentId = activeView.startsWith("folder:") ? activeView.slice(7) : null;
      const {
        photos: newPhotos,
        folders,
        truncated,
        fileCount
      } = await window.api.photos.importFolderTree(folderPath, parentId);
      if (fileCount === 0) {
        toast.warning("该文件夹里没有可导入的文件", {
          description: `${folderPath}（空目录、仅隐藏或系统文件、或系统未授权读取）`
        });
        return;
      }
      if (newPhotos.length === 0) {
        toast.info(`目录里的 ${fileCount} 个文件都已在库中`);
        return;
      }
      if (truncated) {
        toast.warning(`文件夹过大，仅导入前 ${newPhotos.length} 个文件`, {
          description: "建议分批导入或改用「自动导入」监控文件夹"
        });
      }
      await data.loadFolders();
      toast.success(
        `成功导入 ${newPhotos.length} 个素材`,
        folders.length > 0 ? { description: `按目录结构新建了 ${folders.length} 个文件夹` } : void 0
      );
      await data.loadPhotos();
    } catch (error) {
      console.error("导入文件夹失败:", error);
      toast.error("导入失败", { description: error.message });
    } finally {
      data.loading.value = false;
    }
  };
  const handleImportFiles = async () => {
    try {
      const filePaths = await window.api.photos.selectFiles();
      if (filePaths.length === 0) return;
      data.loading.value = true;
      const newPhotos = await window.api.photos.addMultiple(filePaths);
      toast.success(`成功导入 ${newPhotos.length} 个素材`);
      await data.loadPhotos();
    } catch (error) {
      console.error("导入文件失败:", error);
      toast.error("导入失败", { description: error.message });
    } finally {
      data.loading.value = false;
    }
  };
  async function handleToggleFavorite(photoId) {
    try {
      const updated = await window.api.photos.toggleFavorite(photoId);
      if (updated) data.replacePhotoLocal(updated);
    } catch (error) {
      console.error("切换收藏状态失败:", error);
      toast.error("操作失败", { description: error.message });
    }
  }
  async function handleSetRating(photoId, rating) {
    try {
      const updated = await window.api.photos.setRating(photoId, rating);
      if (updated) data.replacePhotoLocal(updated);
    } catch (error) {
      console.error("评分失败:", error);
      toast.error("评分失败", { description: error.message });
    }
  }
  async function handleSetDescription(photoId, description) {
    try {
      const updated = await window.api.photos.setDescription(photoId, description);
      if (updated) data.replacePhotoLocal(updated);
    } catch (error) {
      console.error("保存描述失败:", error);
      toast.error("保存失败", { description: error.message });
    }
  }
  async function handleBatchUpdate(ids, updates) {
    if (ids.length === 0) return;
    try {
      const updated = await window.api.photos.updatePhotos(ids, updates);
      for (const p of updated) data.replacePhotoLocal(p);
    } catch (error) {
      console.error("批量更新失败:", error);
      toast.error("批量更新失败", { description: error.message });
    }
  }
  async function handleAddTag(photoId, tag) {
    try {
      const updated = await window.api.photos.addTag(photoId, tag);
      if (updated) data.replacePhotoLocal(updated);
    } catch (error) {
      console.error("添加标签失败:", error);
      toast.error("添加标签失败", { description: error.message });
    }
  }
  async function handleRemoveTag(photoId, tag) {
    try {
      const updated = await window.api.photos.removeTag(photoId, tag);
      if (updated) data.replacePhotoLocal(updated);
    } catch (error) {
      console.error("移除标签失败:", error);
      toast.error("移除标签失败", { description: error.message });
    }
  }
  async function addTagToMany(ids, tag) {
    if (ids.length === 0 || !tag.trim()) return;
    try {
      await window.api.photos.addTagToMultiple(ids, tag.trim());
      await data.loadPhotos();
      void data.loadDictionaryTags();
      toast.success(`已为 ${ids.length} 项添加标签「${tag.trim()}」`);
    } catch (error) {
      toast.error("添加标签失败", { description: error.message });
    }
  }
  async function deleteWithUndo(ids, undoRefresh) {
    try {
      await window.api.photos.deleteMultiple(ids);
    } catch (error) {
      console.error("删除图片失败:", error);
      toast.error("删除失败", { description: error.message });
      return;
    }
    toast.success(`已移除 ${ids.length} 张图片`, {
      description: "已移入回收站",
      duration: 1e4,
      action: {
        label: "撤销",
        onClick: () => {
          void window.api.photos.restoreMultiple(ids).then(async () => {
            await data.loadPhotos();
            await data.loadRecycleBin();
            await undoRefresh?.();
          }).catch((error) => {
            console.error("撤销删除失败:", error);
            toast.error("撤销失败", { description: error.message });
          });
        }
      }
    });
    await data.loadPhotos();
    await undoRefresh?.();
  }
  function handleDeleteIds(ids, undoRefresh) {
    if (ids.length === 0) return;
    requestConfirm(
      "移除选中图片",
      `确定要从图片库中移除选中的 ${ids.length} 张图片吗？

注意：这只会从应用中移除图片记录（可在回收站恢复），不会删除您的本地文件。`,
      "移除",
      async () => {
        deleteWithUndo(ids, undoRefresh);
      }
    );
  }
  function deleteIdsConfirmed(ids, undoRefresh) {
    if (ids.length === 0) return;
    void deleteWithUndo(ids, undoRefresh);
  }
  function handleRestoreIds(ids) {
    if (ids.length === 0) return;
    void window.api.photos.restoreMultiple(ids).then(async () => {
      await data.loadRecycleBin();
      await data.loadPhotos();
      toast.success(`已恢复 ${ids.length} 项`);
    }).catch((error) => {
      toast.error("恢复失败", { description: error.message });
    });
  }
  function handleClearRecycleBin() {
    requestConfirm(
      "清空回收站",
      "将彻底删除回收站中的所有图片记录（缩略图一并清理）。\n\n注意：本地文件不会被删除，但此操作不可撤销！",
      "彻底清空",
      async () => {
        try {
          const purged = await window.api.photos.clearRecycleBin();
          await data.loadRecycleBin();
          toast.success(`已彻底清理 ${purged.length} 条记录`);
        } catch (error) {
          toast.error("清空失败", { description: error.message });
        }
      }
    );
  }
  async function handleRemoveAll() {
    let total = 0;
    try {
      const stats = await window.api.photos.getStats();
      total = stats?.total ?? data.allPhotos.value.length;
    } catch {
      total = data.allPhotos.value.length;
    }
    if (total === 0) {
      toast.info("图片库中已经没有图片了");
      return;
    }
    requestConfirm(
      "移除所有图片",
      `确定要从图片库中移除所有 ${total} 张图片吗？

注意：这只会从应用中移除图片记录（可在回收站恢复），不会删除您的本地文件。`,
      "全部移除",
      async () => {
        try {
          data.loading.value = true;
          await window.api.photos.clearAll(total);
          await data.loadPhotos();
          toast.success("所有图片已从库中移除", {
            description: "本地文件未受影响，可在回收站恢复"
          });
        } catch (error) {
          console.error("移除所有图片失败:", error);
          toast.error("移除失败", { description: error.message });
        } finally {
          data.loading.value = false;
        }
      }
    );
  }
  function openAlbumModal() {
    albumModalOpen.value = true;
  }
  function addToAlbum(albumId, photoIds) {
    if (photoIds.length === 0) return;
    void window.api.photos.addPhotosToAlbum(albumId, photoIds).then(() => {
      data.loadAlbums();
      data.loadUnsorted();
      void data.refreshAlbumPhotos(albumId);
    }).catch((error) => {
      toast.error("加入相册失败", { description: error.message });
    });
  }
  function renameAlbumById(albumId, currentName) {
    requestPrompt({
      title: "重命名相册",
      label: "新的相册名称",
      initialValue: currentName,
      onSubmit: async (name) => {
        const trimmed = name.trim();
        if (!trimmed || trimmed === currentName) return;
        await window.api.photos.renameAlbum(albumId, trimmed);
        await data.loadAlbums();
        tabs.retitleByViewPrefix("album:", albumId, trimmed);
        toast.success("相册已重命名");
      }
    });
  }
  function deleteAlbumById(albumId, name) {
    requestConfirm(
      "删除相册",
      `确定删除「${name}」吗？

只删除相册本身，不会删除其中的图片。`,
      "删除",
      async () => {
        await window.api.photos.deleteAlbum(albumId);
        tabs.invalidateViews((v) => v === `album:${albumId}`);
        await data.loadAlbums();
        toast.success("相册已删除");
      }
    );
  }
  function removeSelectedFromAlbum(albumId, ids) {
    if (ids.length === 0) return;
    const album = data.albums.value.find((a) => a.id === albumId);
    requestConfirm(
      "移出相册",
      `把 ${ids.length} 张图片从「${album?.name ?? "相册"}」移出吗？

图片保留在图库中，仅移出本相册。`,
      "移出",
      async () => {
        await window.api.photos.removePhotosFromAlbum(albumId, ids);
        await data.loadAlbums();
        await data.loadUnsorted();
        await data.refreshAlbumPhotos(albumId);
        toast.success("已移出相册");
      }
    );
  }
  const folderModalParentId = ref(null);
  function openFolderModal(parentId) {
    folderModalParentId.value = parentId ?? null;
    folderSettingsId.value = null;
    folderModalOpen.value = true;
  }
  const folderSettingsId = ref(null);
  function openFolderSettings(folderId) {
    if (!folderId) return;
    folderSettingsId.value = folderId;
    folderModalOpen.value = true;
  }
  async function createFolderInline(parentId) {
    const target = parentId ?? null;
    try {
      const folder = await window.api.photos.createPhotoFolder("未命名文件夹", target);
      await data.loadFolders();
      renamingFolderId.value = folder.id;
    } catch (error) {
      toast.error("创建文件夹失败", { description: error.message });
    }
  }
  function startFolderInlineRename(fid) {
    renamingFolderId.value = fid;
  }
  async function commitFolderInlineRename(fid, rawName) {
    const folder = data.folders.value.find((f) => f.id === fid);
    renamingFolderId.value = null;
    if (!folder) return;
    const trimmed = rawName.trim();
    if (!trimmed || trimmed === folder.name) return;
    try {
      await window.api.photos.renamePhotoFolder(fid, trimmed);
      await data.loadFolders();
      tabs.retitleByViewPrefix("folder:", fid, trimmed);
      toast.success(`「${folder.name}」已重命名为「${trimmed}」`, {
        action: { label: "撤销", onClick: () => void revertFolderRename(fid, folder.name) }
      });
    } catch (error) {
      toast.error("重命名失败", { description: error.message });
    }
  }
  async function revertFolderRename(fid, originalName) {
    try {
      await window.api.photos.renamePhotoFolder(fid, originalName);
      await data.loadFolders();
      tabs.retitleByViewPrefix("folder:", fid, originalName);
    } catch (error) {
      toast.error("撤销失败", { description: error.message });
    }
  }
  function cancelFolderInlineRename() {
    renamingFolderId.value = null;
  }
  function addToFolder(folderId, photoIds) {
    if (photoIds.length === 0) return;
    void window.api.photos.assignPhotosToFolder(folderId, photoIds).then(() => {
      data.loadFolders();
      data.loadUnsorted();
      void data.refreshFolderPhotos(folderId);
    }).catch((error) => {
      toast.error("加入文件夹失败", { description: error.message });
    });
  }
  function deleteFolderById(folderId, name) {
    const doomed = folderSubtreeIds(folderId);
    const folder = data.folders.value.find((f) => f.id === folderId);
    const hasContent = doomed.length > 1 || (folder?.photoCount ?? 0) > 0;
    if (!hasContent) {
      void runFolderDelete(folderId, name, false, doomed);
      return;
    }
    requestConfirm(
      "删除文件夹",
      `这个操作无法进行复原，确认要删除“${name}”文件夹吗？`,
      "确认删除",
      async (toTrash) => {
        await runFolderDelete(folderId, name, toTrash, doomed);
      },
      { label: "把文件夹内项目丢到回收站", checked: true }
    );
  }
  function folderSubtreeIds(rootId) {
    const out = /* @__PURE__ */ new Set([rootId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of data.folders.value) {
        if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
          out.add(f.id);
          grew = true;
        }
      }
    }
    return [...out];
  }
  async function runFolderDelete(folderId, name, toTrash, doomed) {
    const folder = data.folders.value.find((f) => f.id === folderId);
    const siblings = data.folders.value.filter(
      (f) => (f.parentId ?? null) === (folder?.parentId ?? null)
    );
    const idx = siblings.findIndex((f) => f.id === folderId);
    const prevSibling = idx > 0 ? siblings[idx - 1] : null;
    try {
      const wasActive = tabs.activeView === `folder:${folderId}`;
      await window.api.photos.deletePhotoFolder(folderId, toTrash);
      tabs.invalidateViews((v) => v.startsWith("folder:") && doomed.includes(v.slice(7)));
      if (wasActive && prevSibling) {
        tabs.setView(`folder:${prevSibling.id}`, prevSibling.name);
      }
      await data.loadFolders();
      if (toTrash) {
        await data.loadRecycleBin();
        await data.loadPhotos();
        toast.success(`「${name}」已删除`, { description: "文件夹内的素材已移入回收站" });
      } else {
        await data.loadUnsorted();
        toast.success(`「${name}」已删除`, { description: "文件夹内的素材已归入未分类" });
      }
    } catch (error) {
      toast.error("删除失败", { description: error.message });
    }
  }
  function removeSelectedFromFolder(folderId, ids) {
    if (ids.length === 0) return;
    const folder = data.folders.value.find((f) => f.id === folderId);
    requestConfirm(
      "移出文件夹",
      `把 ${ids.length} 项移出「${folder?.name ?? "文件夹"}」吗？

素材保留在图库中，仅变为未分组。`,
      "移出",
      async () => {
        await window.api.photos.assignPhotosToFolder(null, ids);
        await data.loadFolders();
        await data.loadUnsorted();
        await data.refreshFolderPhotos(folderId);
        toast.success("已移出文件夹");
      }
    );
  }
  function renameTagById(tagId, currentName) {
    requestPrompt({
      title: "重命名标签",
      label: "新的标签名称",
      initialValue: currentName,
      onSubmit: async (name) => {
        const trimmed = name.trim();
        if (!trimmed || trimmed === currentName) return;
        await window.api.tag.updateTag(tagId, { name: trimmed });
        await data.loadDictionaryTags();
        await data.loadPhotos();
        toast.success("标签已重命名");
      }
    });
  }
  function deleteTagById(tagId, name) {
    requestConfirm(
      "删除标签",
      `确定删除标签「${name}」吗？

会从所有素材上移除该标签，素材本身不受影响。`,
      "删除",
      async () => {
        await window.api.tag.deleteTag(tagId);
        tabs.invalidateViews((v) => v === `tag:${tagId}`);
        await data.loadDictionaryTags();
        await data.loadPhotos();
        toast.success("标签已删除");
      }
    );
  }
  const smartPresetRules = ref(null);
  function openSmartAlbumModal(album, presetRules) {
    editingSmartAlbum.value = album;
    smartPresetRules.value = album ? null : presetRules ?? null;
    smartAlbumModalOpen.value = true;
  }
  async function reverseImageSearch() {
    try {
      const files = await window.api.photos.selectFiles();
      if (!files || files.length === 0) return;
      const img = files[0];
      await window.api.system.openExternal("https://graph.baidu.com/");
      try {
        await navigator.clipboard.writeText(img);
      } catch {
      }
      toast.info("已打开百度以图搜图，图片路径已复制，请拖入或选择图片");
    } catch (error) {
      console.error("以图搜图失败:", error);
      toast.error("以图搜图启动失败");
    }
  }
  function deleteSmartAlbumById(album) {
    requestConfirm(
      "删除智能文件夹",
      `确定删除「${album.name}」吗？

只删除收藏夹本身，不会删除其中的图片。`,
      "删除",
      async () => {
        await window.api.photos.deleteSmartAlbum(album.id);
        tabs.invalidateViews((v) => v === `smart:${album.id}`);
        await data.loadSmartAlbums();
        toast.success("智能文件夹已删除");
      }
    );
  }
  function handleConvertToWebP(ids) {
    const imageIds = data.byIds(ids).filter((p) => p.kind === "image" && !p.fileName.toLowerCase().endsWith(".webp")).map((p) => p.id);
    if (imageIds.length === 0) {
      toast.info("选中项中没有可转换的图片（已跳过视频/音频/已是 WebP）");
      return;
    }
    requestConfirm(
      "转换为 WebP",
      `将选中的 ${imageIds.length} 张图片转换为 WebP 并作为新素材入库（质量 82）。

原文件保持不动。`,
      "转换",
      async () => {
        data.loading.value = true;
        try {
          const { count } = await window.api.photos.convertPhotosToWebP(imageIds);
          toast.success(`已转换 ${count} 张并入库`);
          await data.loadPhotos();
        } catch (error) {
          toast.error("转换失败", { description: error.message });
        } finally {
          data.loading.value = false;
        }
      }
    );
  }
  async function convertTo(ids, format, opts) {
    const ext = `.${format}`;
    const imageIds = data.byIds(ids).filter((p) => p.kind === "image" && !p.fileName.toLowerCase().endsWith(ext)).map((p) => p.id);
    if (imageIds.length === 0) {
      toast.info("选中项中没有可转换的图片（已跳过非图片与同格式）");
      return;
    }
    data.loading.value = true;
    try {
      const { count } = await window.api.photos.convertPhotos(imageIds, { format, ...opts });
      if (count > 0) {
        toast.success(`已转换 ${count} 张（${ext.toUpperCase()}）并入库`);
        await data.loadPhotos();
      } else {
        toast.info("没有可转换的图片");
      }
    } catch (error) {
      toast.error("转换失败", { description: error.message });
    } finally {
      data.loading.value = false;
    }
  }
  async function exportSelected(ids) {
    if (ids.length === 0) {
      toast.info("没有选中可导出的素材");
      return;
    }
    try {
      const count = await window.api.photos.exportSelected(ids);
      if (count > 0) toast.success(`已导出 ${count} 个素材`);
      else toast.info("已取消导出或文件不可读");
    } catch (error) {
      toast.error("导出失败", { description: error.message });
    }
  }
  async function exportCsv(ids) {
    if (ids.length === 0) {
      toast.info("没有选中可导出的素材");
      return;
    }
    try {
      const result = await window.api.photos.exportCsv(ids);
      if (result.ok && result.count) {
        toast.success(`已导出 ${result.count} 条元数据为 CSV`);
      } else if (result.error !== "已取消") {
        toast.error("CSV 导出失败", { description: result.error });
      }
    } catch (error) {
      toast.error("CSV 导出失败", { description: error.message });
    }
  }
  const lockEnabled = ref(false);
  const locked = ref(false);
  const unlockPassword = ref("");
  async function refreshLockState() {
    try {
      lockEnabled.value = await window.api.photos.lockIsEnabled();
      if (lockEnabled.value) locked.value = true;
    } catch {
    }
  }
  function handleLockAction() {
    lockModalOpen.value = true;
  }
  function handleQuickLock() {
    lockModalOpen.value = false;
    locked.value = true;
    unlockPassword.value = "";
  }
  async function handleUnlock() {
    if (!unlockPassword.value) return;
    try {
      const ok = await window.api.photos.lockVerify(unlockPassword.value);
      if (ok) {
        locked.value = false;
        unlockPassword.value = "";
      } else {
        toast.error("密码不正确");
      }
    } catch (error) {
      toast.error("解锁失败", { description: error.message });
    }
  }
  function revealInFolder(photos) {
    const last = photos[photos.length - 1];
    if (last) void window.api.photos.showInFolder(last.filePath);
  }
  return {
    // 弹窗开关
    tagManagerOpen,
    smartAlbumModalOpen,
    albumModalOpen,
    folderModalOpen,
    folderModalParentId,
    folderSettingsId,
    openFolderSettings,
    batchRenameOpen,
    bookmarkModalOpen,
    lockModalOpen,
    editingSmartAlbum,
    smartPresetRules,
    // 导入
    handleImportFolder,
    handleImportFiles,
    // 单图
    handleToggleFavorite,
    handleSetRating,
    handleSetDescription,
    handleBatchUpdate,
    handleAddTag,
    handleRemoveTag,
    addTagToMany,
    revealInFolder,
    // 删除/回收站
    handleDeleteIds,
    deleteIdsConfirmed,
    handleRestoreIds,
    handleClearRecycleBin,
    handleRemoveAll,
    SIMILARITY_THRESHOLD,
    // 相册
    openAlbumModal,
    addToAlbum,
    renameAlbumById,
    deleteAlbumById,
    removeSelectedFromAlbum,
    // 文件夹
    openFolderModal,
    renamingFolderId,
    createFolderInline,
    startFolderInlineRename,
    commitFolderInlineRename,
    cancelFolderInlineRename,
    addToFolder,
    deleteFolderById,
    removeSelectedFromFolder,
    // 标签
    renameTagById,
    deleteTagById,
    // 智能夹
    openSmartAlbumModal,
    deleteSmartAlbumById,
    reverseImageSearch,
    // 批量
    handleConvertToWebP,
    convertTo,
    exportSelected,
    exportCsv,
    // 锁
    lockEnabled,
    locked,
    unlockPassword,
    refreshLockState,
    handleLockAction,
    handleQuickLock,
    handleUnlock
  };
}
let singleton = null;
export function usePhotoActions() {
  if (!singleton) singleton = build();
  return singleton;
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInVzZVBob3RvQWN0aW9ucy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIExlYWYg57Sg5p2Q5bqTIMK3IOaTjeS9nOWxgu+8iEQtMDA4IOmHjeaehO+8iVxuICpcbiAqIOWOn2luZGV4LnZ1ZSDnmoTlhajpg6jlj5jmm7TnsbsgaGFuZGxlciDov4HlhaXvvJrlr7zlhaXjgIHliKDpmaQv5oGi5aSN44CB5pS26JePL+ivhOWIhi9cbiAqIOaPj+i/sC/moIfnrb7jgIHnm7jlhowv5paH5Lu25aS5L+aZuuiDveWkuSBDUlVE44CB5om56YeP6YeN5ZG95ZCN44CB6L2sIFdlYlDjgIHkuabnrb7jgIHlr4bnoIHplIHjgIJcbiAqIOS+nei1luazqOWFpe+8muaVsOaNruWxgiArIHRhYnMgKyDnoa7orqQv6L6T5YWl5by556qXICsgdG9hc3TjgIJcbiAqL1xuaW1wb3J0IHsgcmVmIH0gZnJvbSAndnVlJ1xuaW1wb3J0IHsgdXNlVG9hc3QgfSBmcm9tICdAY29tcG9zYWJsZXMvdXNlVG9hc3QnXG5pbXBvcnQgeyB1c2VMaWJyYXJ5VGFicyB9IGZyb20gJ0ByZW5kZXJlci9zdG9yZXMvbGlicmFyeVRhYnMnXG5pbXBvcnQgdHlwZSB7IFBob3RvLCBTbWFydEFsYnVtLCBTbWFydEFsYnVtUnVsZXMgfSBmcm9tICdAcmVuZGVyZXIvdHlwZXMvcGhvdG8nXG5pbXBvcnQgeyB1c2VEaWFsb2dzIH0gZnJvbSAnLi91c2VEaWFsb2dzJ1xuaW1wb3J0IHsgdXNlUGhvdG9EYXRhIH0gZnJvbSAnLi91c2VQaG90b0RhdGEnXG5cbmNvbnN0IFNJTUlMQVJJVFlfVEhSRVNIT0xEID0gMTBcblxuY29uc3QgdG9hc3QgPSB1c2VUb2FzdCgpXG5cbi8vIOKUgOKUgCDlvLnnqpflvIDlhbPvvIjmqKHmnb/muLLmn5PnlKjvvInilIDilIBcbmNvbnN0IHRhZ01hbmFnZXJPcGVuID0gcmVmKGZhbHNlKVxuY29uc3Qgc21hcnRBbGJ1bU1vZGFsT3BlbiA9IHJlZihmYWxzZSlcbmNvbnN0IGFsYnVtTW9kYWxPcGVuID0gcmVmKGZhbHNlKVxuY29uc3QgZm9sZGVyTW9kYWxPcGVuID0gcmVmKGZhbHNlKVxuY29uc3QgYmF0Y2hSZW5hbWVPcGVuID0gcmVmKGZhbHNlKVxuY29uc3QgYm9va21hcmtNb2RhbE9wZW4gPSByZWYoZmFsc2UpXG5jb25zdCBsb2NrTW9kYWxPcGVuID0gcmVmKGZhbHNlKVxuY29uc3QgZWRpdGluZ1NtYXJ0QWxidW0gPSByZWY8U21hcnRBbGJ1bSB8IG51bGw+KG51bGwpXG4vKiog5LqM5Y2B5Zub6L2u77yaRWFnbGUg5byP5L6n5qCP6KGM5YaF6YeN5ZG95ZCN5Lit55qE5paH5Lu25aS5IGlk77yI5paw5bu65ZCO56uL5Y2z6L+b5YWl77yb5Y+z6ZSu6YeN5ZG95ZCN5aSN55So77yJICovXG5jb25zdCByZW5hbWluZ0ZvbGRlcklkID0gcmVmPHN0cmluZyB8IG51bGw+KG51bGwpXG5cbmZ1bmN0aW9uIGJ1aWxkKCkge1xuICBjb25zdCB0YWJzID0gdXNlTGlicmFyeVRhYnMoKVxuICBjb25zdCBkYXRhID0gdXNlUGhvdG9EYXRhKClcbiAgY29uc3QgeyByZXF1ZXN0Q29uZmlybSwgcmVxdWVzdFByb21wdCB9ID0gdXNlRGlhbG9ncygpXG5cbiAgLy8g4pSA4pSAIOWvvOWFpSDilIDilIBcblxuICBjb25zdCBoYW5kbGVJbXBvcnRGb2xkZXIgPSBhc3luYyAoKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGZvbGRlclBhdGhzID0gYXdhaXQgd2luZG93LmFwaS5waG90b3Muc2VsZWN0Rm9sZGVyKClcbiAgICAgIGNvbnN0IGZvbGRlclBhdGggPSBmb2xkZXJQYXRoc1swXVxuICAgICAgaWYgKCFmb2xkZXJQYXRoKSByZXR1cm5cblxuICAgICAgZGF0YS5sb2FkaW5nLnZhbHVlID0gdHJ1ZVxuICAgICAgLy8gRWFnbGUg5Y+j5b6E77ya6ZWc5YOP56OB55uY5bGC57qn5bu65aS577yM5b2T5YmN5Zyo5paH5Lu25aS56KeG5Zu+5YaF5YiZ5pW05qO15qCR5oyC5Zyo5a6D5LiL6Z2iXG4gICAgICBjb25zdCBhY3RpdmVWaWV3ID0gdGFicy5hY3RpdmVWaWV3XG4gICAgICBjb25zdCBwYXJlbnRJZCA9IGFjdGl2ZVZpZXcuc3RhcnRzV2l0aCgnZm9sZGVyOicpID8gYWN0aXZlVmlldy5zbGljZSg3KSA6IG51bGxcbiAgICAgIGNvbnN0IHtcbiAgICAgICAgcGhvdG9zOiBuZXdQaG90b3MsXG4gICAgICAgIGZvbGRlcnMsXG4gICAgICAgIHRydW5jYXRlZCxcbiAgICAgICAgZmlsZUNvdW50XG4gICAgICB9ID0gYXdhaXQgd2luZG93LmFwaS5waG90b3MuaW1wb3J0Rm9sZGVyVHJlZShmb2xkZXJQYXRoLCBwYXJlbnRJZClcblxuICAgICAgaWYgKGZpbGVDb3VudCA9PT0gMCkge1xuICAgICAgICAvLyDkuozljYHlm5vova7vvIjlr7npvZAgRWFnbGXvvInvvJrku7vmhI/nsbvlnovlnYflhaXlupPvvJvmiavmj4/kuLrnqbrpgJrluLjmmK/nqbrnm67lvZUv5LuF6ZqQ6JeP57O757uf5paH5Lu2L+acquaOiOadg1xuICAgICAgICB0b2FzdC53YXJuaW5nKCfor6Xmlofku7blpLnph4zmsqHmnInlj6/lr7zlhaXnmoTmlofku7YnLCB7XG4gICAgICAgICAgZGVzY3JpcHRpb246IGAke2ZvbGRlclBhdGh977yI56m655uu5b2V44CB5LuF6ZqQ6JeP5oiW57O757uf5paH5Lu244CB5oiW57O757uf5pyq5o6I5p2D6K+75Y+W77yJYFxuICAgICAgICB9KVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIGlmIChuZXdQaG90b3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHRvYXN0LmluZm8oYOebruW9lemHjOeahCAke2ZpbGVDb3VudH0g5Liq5paH5Lu26YO95bey5Zyo5bqT5LitYClcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBpZiAodHJ1bmNhdGVkKSB7XG4gICAgICAgIHRvYXN0Lndhcm5pbmcoYOaWh+S7tuWkuei/h+Wkp++8jOS7heWvvOWFpeWJjSAke25ld1Bob3Rvcy5sZW5ndGh9IOS4quaWh+S7tmAsIHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ+W7uuiuruWIhuaJueWvvOWFpeaIluaUueeUqOOAjOiHquWKqOWvvOWFpeOAjeebkeaOp+aWh+S7tuWkuSdcbiAgICAgICAgfSlcbiAgICAgIH1cblxuICAgICAgYXdhaXQgZGF0YS5sb2FkRm9sZGVycygpXG4gICAgICB0b2FzdC5zdWNjZXNzKFxuICAgICAgICBg5oiQ5Yqf5a+85YWlICR7bmV3UGhvdG9zLmxlbmd0aH0g5Liq57Sg5p2QYCxcbiAgICAgICAgZm9sZGVycy5sZW5ndGggPiAwXG4gICAgICAgICAgPyB7IGRlc2NyaXB0aW9uOiBg5oyJ55uu5b2V57uT5p6E5paw5bu65LqGICR7Zm9sZGVycy5sZW5ndGh9IOS4quaWh+S7tuWkuWAgfVxuICAgICAgICAgIDogdW5kZWZpbmVkXG4gICAgICApXG4gICAgICBhd2FpdCBkYXRhLmxvYWRQaG90b3MoKVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCflr7zlhaXmlofku7blpLnlpLHotKU6JywgZXJyb3IpXG4gICAgICB0b2FzdC5lcnJvcign5a+85YWl5aSx6LSlJywgeyBkZXNjcmlwdGlvbjogKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlIH0pXG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGRhdGEubG9hZGluZy52YWx1ZSA9IGZhbHNlXG4gICAgfVxuICB9XG5cbiAgY29uc3QgaGFuZGxlSW1wb3J0RmlsZXMgPSBhc3luYyAoKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGZpbGVQYXRocyA9IGF3YWl0IHdpbmRvdy5hcGkucGhvdG9zLnNlbGVjdEZpbGVzKClcbiAgICAgIGlmIChmaWxlUGF0aHMubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICAgICAgZGF0YS5sb2FkaW5nLnZhbHVlID0gdHJ1ZVxuICAgICAgY29uc3QgbmV3UGhvdG9zID0gYXdhaXQgd2luZG93LmFwaS5waG90b3MuYWRkTXVsdGlwbGUoZmlsZVBhdGhzKVxuICAgICAgdG9hc3Quc3VjY2Vzcyhg5oiQ5Yqf5a+85YWlICR7bmV3UGhvdG9zLmxlbmd0aH0g5Liq57Sg5p2QYClcbiAgICAgIGF3YWl0IGRhdGEubG9hZFBob3RvcygpXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+WvvOWFpeaWh+S7tuWksei0pTonLCBlcnJvcilcbiAgICAgIHRvYXN0LmVycm9yKCflr7zlhaXlpLHotKUnLCB7IGRlc2NyaXB0aW9uOiAoZXJyb3IgYXMgRXJyb3IpLm1lc3NhZ2UgfSlcbiAgICB9IGZpbmFsbHkge1xuICAgICAgZGF0YS5sb2FkaW5nLnZhbHVlID0gZmFsc2VcbiAgICB9XG4gIH1cblxuICAvLyDilIDilIAg5Y2V5Zu+5aKe6YeP5pON5L2cIOKUgOKUgFxuXG4gIGFzeW5jIGZ1bmN0aW9uIGhhbmRsZVRvZ2dsZUZhdm9yaXRlKHBob3RvSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB1cGRhdGVkID0gYXdhaXQgd2luZG93LmFwaS5waG90b3MudG9nZ2xlRmF2b3JpdGUocGhvdG9JZClcbiAgICAgIGlmICh1cGRhdGVkKSBkYXRhLnJlcGxhY2VQaG90b0xvY2FsKHVwZGF0ZWQpXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIC8vIOS7o+eggeWuoeafpSBQMe+8muWksei0pemcgOeUqOaIt+WPr+inge+8iOaXp+WunueOsOWPqiBjb25zb2xlLmVycm9yIOmdmem7mO+8iVxuICAgICAgY29uc29sZS5lcnJvcign5YiH5o2i5pS26JeP54q25oCB5aSx6LSlOicsIGVycm9yKVxuICAgICAgdG9hc3QuZXJyb3IoJ+aTjeS9nOWksei0pScsIHsgZGVzY3JpcHRpb246IChlcnJvciBhcyBFcnJvcikubWVzc2FnZSB9KVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGhhbmRsZVNldFJhdGluZyhwaG90b0lkOiBzdHJpbmcsIHJhdGluZzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVwZGF0ZWQgPSBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5zZXRSYXRpbmcocGhvdG9JZCwgcmF0aW5nKVxuICAgICAgaWYgKHVwZGF0ZWQpIGRhdGEucmVwbGFjZVBob3RvTG9jYWwodXBkYXRlZClcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign6K+E5YiG5aSx6LSlOicsIGVycm9yKVxuICAgICAgdG9hc3QuZXJyb3IoJ+ivhOWIhuWksei0pScsIHsgZGVzY3JpcHRpb246IChlcnJvciBhcyBFcnJvcikubWVzc2FnZSB9KVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGhhbmRsZVNldERlc2NyaXB0aW9uKHBob3RvSWQ6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB1cGRhdGVkID0gYXdhaXQgd2luZG93LmFwaS5waG90b3Muc2V0RGVzY3JpcHRpb24ocGhvdG9JZCwgZGVzY3JpcHRpb24pXG4gICAgICBpZiAodXBkYXRlZCkgZGF0YS5yZXBsYWNlUGhvdG9Mb2NhbCh1cGRhdGVkKVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCfkv53lrZjmj4/ov7DlpLHotKU6JywgZXJyb3IpXG4gICAgICB0b2FzdC5lcnJvcign5L+d5a2Y5aSx6LSlJywgeyBkZXNjcmlwdGlvbjogKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlIH0pXG4gICAgfVxuICB9XG5cbiAgLyoqIOaJuemHj+abtOaWsO+8iOivhOWIhi/mj4/ov7Av5pS26JeP77yJ77ya5LiA5qyhIElQQyDlrozmiJDvvIzmm7/ku6PpgJDlvKDor7fmsYIgKi9cbiAgYXN5bmMgZnVuY3Rpb24gaGFuZGxlQmF0Y2hVcGRhdGUoaWRzOiBzdHJpbmdbXSwgdXBkYXRlczogUGFydGlhbDxQaG90bz4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoaWRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVwZGF0ZWQgPSBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy51cGRhdGVQaG90b3MoaWRzLCB1cGRhdGVzKVxuICAgICAgZm9yIChjb25zdCBwIG9mIHVwZGF0ZWQpIGRhdGEucmVwbGFjZVBob3RvTG9jYWwocClcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign5om56YeP5pu05paw5aSx6LSlOicsIGVycm9yKVxuICAgICAgdG9hc3QuZXJyb3IoJ+aJuemHj+abtOaWsOWksei0pScsIHsgZGVzY3JpcHRpb246IChlcnJvciBhcyBFcnJvcikubWVzc2FnZSB9KVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGhhbmRsZUFkZFRhZyhwaG90b0lkOiBzdHJpbmcsIHRhZzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVwZGF0ZWQgPSBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5hZGRUYWcocGhvdG9JZCwgdGFnKVxuICAgICAgaWYgKHVwZGF0ZWQpIGRhdGEucmVwbGFjZVBob3RvTG9jYWwodXBkYXRlZClcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign5re75Yqg5qCH562+5aSx6LSlOicsIGVycm9yKVxuICAgICAgdG9hc3QuZXJyb3IoJ+a3u+WKoOagh+etvuWksei0pScsIHsgZGVzY3JpcHRpb246IChlcnJvciBhcyBFcnJvcikubWVzc2FnZSB9KVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGhhbmRsZVJlbW92ZVRhZyhwaG90b0lkOiBzdHJpbmcsIHRhZzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVwZGF0ZWQgPSBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5yZW1vdmVUYWcocGhvdG9JZCwgdGFnKVxuICAgICAgaWYgKHVwZGF0ZWQpIGRhdGEucmVwbGFjZVBob3RvTG9jYWwodXBkYXRlZClcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign56e76Zmk5qCH562+5aSx6LSlOicsIGVycm9yKVxuICAgICAgdG9hc3QuZXJyb3IoJ+enu+mZpOagh+etvuWksei0pScsIHsgZGVzY3JpcHRpb246IChlcnJvciBhcyBFcnJvcikubWVzc2FnZSB9KVxuICAgIH1cbiAgfVxuXG4gIC8qKiDnu5nkuIDnu4TntKDmnZDliqDmoIfnrb7vvIjlj7PplK7oj5zljZUv5ouW5ou96JC954K55YWx55So77yJICovXG4gIGFzeW5jIGZ1bmN0aW9uIGFkZFRhZ1RvTWFueShpZHM6IHN0cmluZ1tdLCB0YWc6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmIChpZHMubGVuZ3RoID09PSAwIHx8ICF0YWcudHJpbSgpKSByZXR1cm5cbiAgICB0cnkge1xuICAgICAgYXdhaXQgd2luZG93LmFwaS5waG90b3MuYWRkVGFnVG9NdWx0aXBsZShpZHMsIHRhZy50cmltKCkpXG4gICAgICBhd2FpdCBkYXRhLmxvYWRQaG90b3MoKVxuICAgICAgLy8g5Li76L+b56iLIGxpbmtUYWcg5Lya5Li65YWo5paw5ZCN56ew5bu65qCH562+77yM5a2X5YW45LiN5Yi35paw5YiZ562b6YCJ6Z2i5p2/55yL5LiN5Yiw5a6D77yI5a6h5p+lIFAzLTM377yJXG4gICAgICB2b2lkIGRhdGEubG9hZERpY3Rpb25hcnlUYWdzKClcbiAgICAgIHRvYXN0LnN1Y2Nlc3MoYOW3suS4uiAke2lkcy5sZW5ndGh9IOmhuea3u+WKoOagh+etvuOAjCR7dGFnLnRyaW0oKX3jgI1gKVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICB0b2FzdC5lcnJvcign5re75Yqg5qCH562+5aSx6LSlJywgeyBkZXNjcmlwdGlvbjogKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlIH0pXG4gICAgfVxuICB9XG5cbiAgLy8g4pSA4pSAIOWIoOmZpCAvIOWbnuaUtuermSDilIDilIBcblxuICAvKiog6L2v5Yig6ZmkICsgMTBzIOaSpOmUgO+8iGlkcyDmjZXojrfvvIzmkqTplIDlvILmraXlm57osIPlronlhajvvIkgKi9cbiAgYXN5bmMgZnVuY3Rpb24gZGVsZXRlV2l0aFVuZG8oaWRzOiBzdHJpbmdbXSwgdW5kb1JlZnJlc2g/OiAoKSA9PiBQcm9taXNlPHZvaWQ+KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLy8g5b+F6aG7IGF3YWl0IOaNleiOt+W8guatpeaLkue7ne+8iOWuoeafpSBQMS0477yJ77ya5pen5a6e546wIHZvaWQgcHJvbWlzZSArIOWQjOatpSB0cnkvY2F0Y2jvvIxcbiAgICAvLyBJUEMg5aSx6LSl5pe25pei5pegIHRvYXN0IOS5n+aXoOmAieS4rembhua4heeQhlxuICAgIHRyeSB7XG4gICAgICBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5kZWxldGVNdWx0aXBsZShpZHMpXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+WIoOmZpOWbvueJh+Wksei0pTonLCBlcnJvcilcbiAgICAgIHRvYXN0LmVycm9yKCfliKDpmaTlpLHotKUnLCB7IGRlc2NyaXB0aW9uOiAoZXJyb3IgYXMgRXJyb3IpLm1lc3NhZ2UgfSlcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICB0b2FzdC5zdWNjZXNzKGDlt7Lnp7vpmaQgJHtpZHMubGVuZ3RofSDlvKDlm77niYdgLCB7XG4gICAgICBkZXNjcmlwdGlvbjogJ+W3suenu+WFpeWbnuaUtuermScsXG4gICAgICBkdXJhdGlvbjogMTAwMDAsXG4gICAgICBhY3Rpb246IHtcbiAgICAgICAgbGFiZWw6ICfmkqTplIAnLFxuICAgICAgICBvbkNsaWNrOiAoKSA9PiB7XG4gICAgICAgICAgdm9pZCB3aW5kb3cuYXBpLnBob3Rvc1xuICAgICAgICAgICAgLnJlc3RvcmVNdWx0aXBsZShpZHMpXG4gICAgICAgICAgICAudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgIGF3YWl0IGRhdGEubG9hZFBob3RvcygpXG4gICAgICAgICAgICAgIGF3YWl0IGRhdGEubG9hZFJlY3ljbGVCaW4oKVxuICAgICAgICAgICAgICBhd2FpdCB1bmRvUmVmcmVzaD8uKClcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuY2F0Y2goKGVycm9yOiB1bmtub3duKSA9PiB7XG4gICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+aSpOmUgOWIoOmZpOWksei0pTonLCBlcnJvcilcbiAgICAgICAgICAgICAgdG9hc3QuZXJyb3IoJ+aSpOmUgOWksei0pScsIHsgZGVzY3JpcHRpb246IChlcnJvciBhcyBFcnJvcikubWVzc2FnZSB9KVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pXG4gICAgYXdhaXQgZGF0YS5sb2FkUGhvdG9zKClcbiAgICBhd2FpdCB1bmRvUmVmcmVzaD8uKClcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZURlbGV0ZUlkcyhpZHM6IHN0cmluZ1tdLCB1bmRvUmVmcmVzaD86ICgpID0+IFByb21pc2U8dm9pZD4pOiB2b2lkIHtcbiAgICBpZiAoaWRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG4gICAgcmVxdWVzdENvbmZpcm0oXG4gICAgICAn56e76Zmk6YCJ5Lit5Zu+54mHJyxcbiAgICAgIGDnoa7lrpropoHku47lm77niYflupPkuK3np7vpmaTpgInkuK3nmoQgJHtpZHMubGVuZ3RofSDlvKDlm77niYflkJfvvJ9cXG5cXG7ms6jmhI/vvJrov5nlj6rkvJrku47lupTnlKjkuK3np7vpmaTlm77niYforrDlvZXvvIjlj6/lnKjlm57mlLbnq5nmgaLlpI3vvInvvIzkuI3kvJrliKDpmaTmgqjnmoTmnKzlnLDmlofku7bjgIJgLFxuICAgICAgJ+enu+mZpCcsXG4gICAgICBhc3luYyAoKSA9PiB7XG4gICAgICAgIGRlbGV0ZVdpdGhVbmRvKGlkcywgdW5kb1JlZnJlc2gpXG4gICAgICB9XG4gICAgKVxuICB9XG5cbiAgLyoqIOiwg+eUqOaWueW3suiHquW4puehruiupO+8iOmihOiniOW8ueeql+eahOehruiupOaWh+ahiOWQq+aWh+S7tuWQje+8ieaXtuebtOaOpeaJp+ihjO+8jOmBv+WFjeS6jOasoeehruiupOahhiAqL1xuICBmdW5jdGlvbiBkZWxldGVJZHNDb25maXJtZWQoaWRzOiBzdHJpbmdbXSwgdW5kb1JlZnJlc2g/OiAoKSA9PiBQcm9taXNlPHZvaWQ+KTogdm9pZCB7XG4gICAgaWYgKGlkcy5sZW5ndGggPT09IDApIHJldHVyblxuICAgIHZvaWQgZGVsZXRlV2l0aFVuZG8oaWRzLCB1bmRvUmVmcmVzaClcbiAgfVxuXG4gIC8qKiDlvbvlupXliKDpmaTvvJrlm57mlLbnq5nlnLrmma/ku4Xmj5DkvpvmlbTkvZPjgIzmuIXnqbrlm57mlLbnq5njgI3vvIzljZXmnaHlj6rlgZrmgaLlpI0gKi9cbiAgZnVuY3Rpb24gaGFuZGxlUmVzdG9yZUlkcyhpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgaWYgKGlkcy5sZW5ndGggPT09IDApIHJldHVyblxuICAgIHZvaWQgd2luZG93LmFwaS5waG90b3NcbiAgICAgIC5yZXN0b3JlTXVsdGlwbGUoaWRzKVxuICAgICAgLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgICBhd2FpdCBkYXRhLmxvYWRSZWN5Y2xlQmluKClcbiAgICAgICAgYXdhaXQgZGF0YS5sb2FkUGhvdG9zKClcbiAgICAgICAgdG9hc3Quc3VjY2Vzcyhg5bey5oGi5aSNICR7aWRzLmxlbmd0aH0g6aG5YClcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goKGVycm9yOiBFcnJvcikgPT4ge1xuICAgICAgICB0b2FzdC5lcnJvcign5oGi5aSN5aSx6LSlJywgeyBkZXNjcmlwdGlvbjogZXJyb3IubWVzc2FnZSB9KVxuICAgICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUNsZWFyUmVjeWNsZUJpbigpOiB2b2lkIHtcbiAgICByZXF1ZXN0Q29uZmlybShcbiAgICAgICfmuIXnqbrlm57mlLbnq5knLFxuICAgICAgJ+WwhuW9u+W6leWIoOmZpOWbnuaUtuermeS4reeahOaJgOacieWbvueJh+iusOW9le+8iOe8qeeVpeWbvuS4gOW5tua4heeQhu+8ieOAglxcblxcbuazqOaEj++8muacrOWcsOaWh+S7tuS4jeS8muiiq+WIoOmZpO+8jOS9huatpOaTjeS9nOS4jeWPr+aSpOmUgO+8gScsXG4gICAgICAn5b275bqV5riF56m6JyxcbiAgICAgIGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBwdXJnZWQgPSBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5jbGVhclJlY3ljbGVCaW4oKVxuICAgICAgICAgIGF3YWl0IGRhdGEubG9hZFJlY3ljbGVCaW4oKVxuICAgICAgICAgIHRvYXN0LnN1Y2Nlc3MoYOW3suW9u+W6lea4heeQhiAke3B1cmdlZC5sZW5ndGh9IOadoeiusOW9lWApXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgdG9hc3QuZXJyb3IoJ+a4heepuuWksei0pScsIHsgZGVzY3JpcHRpb246IChlcnJvciBhcyBFcnJvcikubWVzc2FnZSB9KVxuICAgICAgICB9XG4gICAgICB9XG4gICAgKVxuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gaGFuZGxlUmVtb3ZlQWxsKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIC8vIOehruiupOW8ueeql+W/hemhu+Wxleekuuecn+WunuaAu+aVsO+8iOWuoeafpSBQMi0yMO+8ie+8muWIhumhteeql+WPo+S4iyBhbGxQaG90b3Mg5Y+q5pivIOKJpDUwMCDnmoTnqpflj6PvvIxcbiAgICAvLyDml6fmlofmoYjjgIznp7vpmaTmiYDmnIkgNTAwIOW8oOOAjeiAjCBjbGVhckFsbCDlrp7pmYXmuIXnqbrlhajlupPvvIzlsZ7ljbHpmanmk43kvZznmoTor6/lr7zmgKfnoa7orqRcbiAgICBsZXQgdG90YWwgPSAwXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHN0YXRzID0gYXdhaXQgd2luZG93LmFwaS5waG90b3MuZ2V0U3RhdHMoKVxuICAgICAgdG90YWwgPSBzdGF0cz8udG90YWwgPz8gZGF0YS5hbGxQaG90b3MudmFsdWUubGVuZ3RoXG4gICAgfSBjYXRjaCB7XG4gICAgICB0b3RhbCA9IGRhdGEuYWxsUGhvdG9zLnZhbHVlLmxlbmd0aFxuICAgIH1cbiAgICBpZiAodG90YWwgPT09IDApIHtcbiAgICAgIHRvYXN0LmluZm8oJ+WbvueJh+W6k+S4reW3sue7j+ayoeacieWbvueJh+S6hicpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICByZXF1ZXN0Q29uZmlybShcbiAgICAgICfnp7vpmaTmiYDmnInlm77niYcnLFxuICAgICAgYOehruWumuimgeS7juWbvueJh+W6k+S4reenu+mZpOaJgOaciSAke3RvdGFsfSDlvKDlm77niYflkJfvvJ9cXG5cXG7ms6jmhI/vvJrov5nlj6rkvJrku47lupTnlKjkuK3np7vpmaTlm77niYforrDlvZXvvIjlj6/lnKjlm57mlLbnq5nmgaLlpI3vvInvvIzkuI3kvJrliKDpmaTmgqjnmoTmnKzlnLDmlofku7bjgIJgLFxuICAgICAgJ+WFqOmDqOenu+mZpCcsXG4gICAgICBhc3luYyAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgZGF0YS5sb2FkaW5nLnZhbHVlID0gdHJ1ZVxuICAgICAgICAgIC8vIOW4puehruiupOiuoeaVsO+8iOWuoeafpSBQMy0yMu+8ie+8muS4u+i/m+eoi+avlOWvueW6k+WGheWunumZheaAu+aVsO+8jOmYsua4suafk+WxgiBidWcg6K+v6Kem5Y+R5YWo5bqT5riF6ZmkXG4gICAgICAgICAgYXdhaXQgd2luZG93LmFwaS5waG90b3MuY2xlYXJBbGwodG90YWwpXG4gICAgICAgICAgYXdhaXQgZGF0YS5sb2FkUGhvdG9zKClcbiAgICAgICAgICB0b2FzdC5zdWNjZXNzKCfmiYDmnInlm77niYflt7Lku47lupPkuK3np7vpmaQnLCB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogJ+acrOWcsOaWh+S7tuacquWPl+W9seWTje+8jOWPr+WcqOWbnuaUtuermeaBouWkjSdcbiAgICAgICAgICB9KVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+enu+mZpOaJgOacieWbvueJh+Wksei0pTonLCBlcnJvcilcbiAgICAgICAgICB0b2FzdC5lcnJvcign56e76Zmk5aSx6LSlJywgeyBkZXNjcmlwdGlvbjogKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlIH0pXG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgZGF0YS5sb2FkaW5nLnZhbHVlID0gZmFsc2VcbiAgICAgICAgfVxuICAgICAgfVxuICAgIClcbiAgfVxuXG4gIC8vIOKUgOKUgCDnm7jlhowg4pSA4pSAXG5cbiAgZnVuY3Rpb24gb3BlbkFsYnVtTW9kYWwoKTogdm9pZCB7XG4gICAgYWxidW1Nb2RhbE9wZW4udmFsdWUgPSB0cnVlXG4gIH1cblxuICAvKiog5oqK57Sg5p2Q5Yqg5YWl5pei5pyJ55u45YaM77yI5Y+z6ZSuL+aLluaLveiQveeCue+8m+ebuOWGjOWcqCBBbGJ1bU1vZGFsIOS4reaWsOW7uu+8iSAqL1xuICBmdW5jdGlvbiBhZGRUb0FsYnVtKGFsYnVtSWQ6IHN0cmluZywgcGhvdG9JZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgaWYgKHBob3RvSWRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG4gICAgdm9pZCB3aW5kb3cuYXBpLnBob3Rvc1xuICAgICAgLmFkZFBob3Rvc1RvQWxidW0oYWxidW1JZCwgcGhvdG9JZHMpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGRhdGEubG9hZEFsYnVtcygpXG4gICAgICAgIC8vIOWKoOWFpeebuOWGjC/mlofku7blpLnlkI7lj5jkuLrjgIzlt7LliIbnsbvjgI3vvIzliLfmlrDlm7rlrprlhaXlj6PnmoTmnKrliIbnsbvmsaBcbiAgICAgICAgZGF0YS5sb2FkVW5zb3J0ZWQoKVxuICAgICAgICAvLyDmraPlnKjnnIvov5nkuKrnm7jlhozml7blkIzmraXlhoXlrrnmsaDvvIzlkKbliJnmlrDliqDlhaXnmoTntKDmnZDkuI3lh7rnjrBcbiAgICAgICAgdm9pZCBkYXRhLnJlZnJlc2hBbGJ1bVBob3RvcyhhbGJ1bUlkKVxuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoZXJyb3I6IEVycm9yKSA9PiB7XG4gICAgICAgIHRvYXN0LmVycm9yKCfliqDlhaXnm7jlhozlpLHotKUnLCB7IGRlc2NyaXB0aW9uOiBlcnJvci5tZXNzYWdlIH0pXG4gICAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gcmVuYW1lQWxidW1CeUlkKGFsYnVtSWQ6IHN0cmluZywgY3VycmVudE5hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgIHJlcXVlc3RQcm9tcHQoe1xuICAgICAgdGl0bGU6ICfph43lkb3lkI3nm7jlhownLFxuICAgICAgbGFiZWw6ICfmlrDnmoTnm7jlhozlkI3np7AnLFxuICAgICAgaW5pdGlhbFZhbHVlOiBjdXJyZW50TmFtZSxcbiAgICAgIG9uU3VibWl0OiBhc3luYyAobmFtZSkgPT4ge1xuICAgICAgICBjb25zdCB0cmltbWVkID0gbmFtZS50cmltKClcbiAgICAgICAgaWYgKCF0cmltbWVkIHx8IHRyaW1tZWQgPT09IGN1cnJlbnROYW1lKSByZXR1cm5cbiAgICAgICAgYXdhaXQgd2luZG93LmFwaS5waG90b3MucmVuYW1lQWxidW0oYWxidW1JZCwgdHJpbW1lZClcbiAgICAgICAgYXdhaXQgZGF0YS5sb2FkQWxidW1zKClcbiAgICAgICAgdGFicy5yZXRpdGxlQnlWaWV3UHJlZml4KCdhbGJ1bTonLCBhbGJ1bUlkLCB0cmltbWVkKVxuICAgICAgICB0b2FzdC5zdWNjZXNzKCfnm7jlhozlt7Lph43lkb3lkI0nKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBkZWxldGVBbGJ1bUJ5SWQoYWxidW1JZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICByZXF1ZXN0Q29uZmlybShcbiAgICAgICfliKDpmaTnm7jlhownLFxuICAgICAgYOehruWumuWIoOmZpOOAjCR7bmFtZX3jgI3lkJfvvJ9cXG5cXG7lj6rliKDpmaTnm7jlhozmnKzouqvvvIzkuI3kvJrliKDpmaTlhbbkuK3nmoTlm77niYfjgIJgLFxuICAgICAgJ+WIoOmZpCcsXG4gICAgICBhc3luYyAoKSA9PiB7XG4gICAgICAgIGF3YWl0IHdpbmRvdy5hcGkucGhvdG9zLmRlbGV0ZUFsYnVtKGFsYnVtSWQpXG4gICAgICAgIHRhYnMuaW52YWxpZGF0ZVZpZXdzKCh2KSA9PiB2ID09PSBgYWxidW06JHthbGJ1bUlkfWApXG4gICAgICAgIGF3YWl0IGRhdGEubG9hZEFsYnVtcygpXG4gICAgICAgIHRvYXN0LnN1Y2Nlc3MoJ+ebuOWGjOW3suWIoOmZpCcpXG4gICAgICB9XG4gICAgKVxuICB9XG5cbiAgZnVuY3Rpb24gcmVtb3ZlU2VsZWN0ZWRGcm9tQWxidW0oYWxidW1JZDogc3RyaW5nLCBpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgaWYgKGlkcy5sZW5ndGggPT09IDApIHJldHVyblxuICAgIGNvbnN0IGFsYnVtID0gZGF0YS5hbGJ1bXMudmFsdWUuZmluZCgoYSkgPT4gYS5pZCA9PT0gYWxidW1JZClcbiAgICByZXF1ZXN0Q29uZmlybShcbiAgICAgICfnp7vlh7rnm7jlhownLFxuICAgICAgYOaKiiAke2lkcy5sZW5ndGh9IOW8oOWbvueJh+S7juOAjCR7YWxidW0/Lm5hbWUgPz8gJ+ebuOWGjCd944CN56e75Ye65ZCX77yfXFxuXFxu5Zu+54mH5L+d55WZ5Zyo5Zu+5bqT5Lit77yM5LuF56e75Ye65pys55u45YaM44CCYCxcbiAgICAgICfnp7vlh7onLFxuICAgICAgYXN5bmMgKCkgPT4ge1xuICAgICAgICBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5yZW1vdmVQaG90b3NGcm9tQWxidW0oYWxidW1JZCwgaWRzKVxuICAgICAgICBhd2FpdCBkYXRhLmxvYWRBbGJ1bXMoKVxuICAgICAgICAvLyDnp7vlh7rnm7jlhozlkI7lj5jlm57jgIzmnKrliIbnsbvjgI3vvIzliLfmlrDlm7rlrprlhaXlj6PnmoTmnKrliIbnsbvmsaBcbiAgICAgICAgYXdhaXQgZGF0YS5sb2FkVW5zb3J0ZWQoKVxuICAgICAgICAvLyDlkKbliJnjgIzlt7Lnp7vlh7rnm7jlhozjgI3mj5DnpLrlh7rmnaXkuobjgIHljaHniYfljbTov5jnlZnlnKjnvZHmoLzph4xcbiAgICAgICAgYXdhaXQgZGF0YS5yZWZyZXNoQWxidW1QaG90b3MoYWxidW1JZClcbiAgICAgICAgdG9hc3Quc3VjY2Vzcygn5bey56e75Ye655u45YaMJylcbiAgICAgIH1cbiAgICApXG4gIH1cblxuICAvLyDilIDilIAg5paH5Lu25aS55YiG57uEIOKUgOKUgFxuXG4gIC8qKiDkuInova4gRzEw77ya5paw5bu65a2Q5paH5Lu25aS55pe26aKE6YCJ55qE54i257qn77yIRm9sZGVyTW9kYWwgaW5pdGlhbFBhcmVudO+8iSAqL1xuICBjb25zdCBmb2xkZXJNb2RhbFBhcmVudElkID0gcmVmPHN0cmluZyB8IG51bGw+KG51bGwpXG5cbiAgZnVuY3Rpb24gb3BlbkZvbGRlck1vZGFsKHBhcmVudElkPzogc3RyaW5nKTogdm9pZCB7XG4gICAgZm9sZGVyTW9kYWxQYXJlbnRJZC52YWx1ZSA9IHBhcmVudElkID8/IG51bGxcbiAgICBmb2xkZXJTZXR0aW5nc0lkLnZhbHVlID0gbnVsbFxuICAgIGZvbGRlck1vZGFsT3Blbi52YWx1ZSA9IHRydWVcbiAgfVxuXG4gIC8qKiDljYHkuozova7vvJrmiZPlvIDmlofku7blpLnorr7nva7vvIhFYWdsZSDnqbrnmb3ljLrlj7PplK7jgIzmiZPlvIDmlofku7blpLnorr7nva7igKbjgI3vvIkgKi9cbiAgY29uc3QgZm9sZGVyU2V0dGluZ3NJZCA9IHJlZjxzdHJpbmcgfCBudWxsPihudWxsKVxuICBmdW5jdGlvbiBvcGVuRm9sZGVyU2V0dGluZ3MoZm9sZGVySWQ6IHN0cmluZyB8IG51bGwpOiB2b2lkIHtcbiAgICBpZiAoIWZvbGRlcklkKSByZXR1cm5cbiAgICBmb2xkZXJTZXR0aW5nc0lkLnZhbHVlID0gZm9sZGVySWRcbiAgICBmb2xkZXJNb2RhbE9wZW4udmFsdWUgPSB0cnVlXG4gIH1cblxuICAvKiog5LqM5Y2B5Zub6L2u77yIRWFnbGUg5a6e5rWL77yJ77ya44CMK+OAjS8g5Y+z6ZSu5paw5bu6IC8g4oyY4oenTiDlnYfml6DlvLnnqpfigJTigJTnq4vljbPliJvlu7pcbiAgICogIOOAjOacquWRveWQjeaWh+S7tuWkueOAje+8jOS+p+agj+ivpeihjOi/m+WFpeihjOWGhemHjeWRveWQje+8jOinhuWbvuiHquWKqOi3s+WFpeaWsOaWh+S7tuWkueOAglxuICAgKiAgcGFyZW50SWQg57y655yBID0g5qC557qn77yIRWFnbGXvvJrjgIwr44CN5aeL57uI5Zyo5qC555uu5b2V5Yib5bu677yM5bWM5aWX6LWw5Y+z6ZSu44CM5paw5aKe5a2Q5paH5Lu25aS544CN77yJICovXG4gIGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUZvbGRlcklubGluZShwYXJlbnRJZD86IHN0cmluZyB8IG51bGwpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCB0YXJnZXQgPSBwYXJlbnRJZCA/PyBudWxsXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGZvbGRlciA9IGF3YWl0IHdpbmRvdy5hcGkucGhvdG9zLmNyZWF0ZVBob3RvRm9sZGVyKCfmnKrlkb3lkI3mlofku7blpLknLCB0YXJnZXQpXG4gICAgICBhd2FpdCBkYXRhLmxvYWRGb2xkZXJzKClcbiAgICAgIHJlbmFtaW5nRm9sZGVySWQudmFsdWUgPSBmb2xkZXIuaWRcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdG9hc3QuZXJyb3IoJ+WIm+W7uuaWh+S7tuWkueWksei0pScsIHsgZGVzY3JpcHRpb246IChlcnJvciBhcyBFcnJvcikubWVzc2FnZSB9KVxuICAgIH1cbiAgfVxuXG4gIC8qKiDlj7PplK7jgIzph43lkb3lkI3jgI3ihpIg5L6n5qCP6KGM5YaF57yW6L6R77yIRWFnbGUg4oyYUiDooYzkuLrvvIkgKi9cbiAgZnVuY3Rpb24gc3RhcnRGb2xkZXJJbmxpbmVSZW5hbWUoZmlkOiBzdHJpbmcpOiB2b2lkIHtcbiAgICByZW5hbWluZ0ZvbGRlcklkLnZhbHVlID0gZmlkXG4gIH1cblxuICAvKiog6KGM5YaF6YeN5ZG95ZCN5o+Q5Lqk77yIRWFnbGXvvJpFbnRlci/lpLHnhKbmj5DkuqTvvJvnqbrlgLzmiJbmnKrlj5jop4bkuLrmlL7lvIPvvIkgKi9cbiAgYXN5bmMgZnVuY3Rpb24gY29tbWl0Rm9sZGVySW5saW5lUmVuYW1lKGZpZDogc3RyaW5nLCByYXdOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBmb2xkZXIgPSBkYXRhLmZvbGRlcnMudmFsdWUuZmluZCgoZikgPT4gZi5pZCA9PT0gZmlkKVxuICAgIHJlbmFtaW5nRm9sZGVySWQudmFsdWUgPSBudWxsXG4gICAgaWYgKCFmb2xkZXIpIHJldHVyblxuICAgIGNvbnN0IHRyaW1tZWQgPSByYXdOYW1lLnRyaW0oKVxuICAgIGlmICghdHJpbW1lZCB8fCB0cmltbWVkID09PSBmb2xkZXIubmFtZSkgcmV0dXJuXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHdpbmRvdy5hcGkucGhvdG9zLnJlbmFtZVBob3RvRm9sZGVyKGZpZCwgdHJpbW1lZClcbiAgICAgIGF3YWl0IGRhdGEubG9hZEZvbGRlcnMoKVxuICAgICAgdGFicy5yZXRpdGxlQnlWaWV3UHJlZml4KCdmb2xkZXI6JywgZmlkLCB0cmltbWVkKVxuICAgICAgdG9hc3Quc3VjY2Vzcyhg44CMJHtmb2xkZXIubmFtZX3jgI3lt7Lph43lkb3lkI3kuLrjgIwke3RyaW1tZWR944CNYCwge1xuICAgICAgICBhY3Rpb246IHsgbGFiZWw6ICfmkqTplIAnLCBvbkNsaWNrOiAoKSA9PiB2b2lkIHJldmVydEZvbGRlclJlbmFtZShmaWQsIGZvbGRlci5uYW1lKSB9XG4gICAgICB9KVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICB0b2FzdC5lcnJvcign6YeN5ZG95ZCN5aSx6LSlJywgeyBkZXNjcmlwdGlvbjogKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlIH0pXG4gICAgfVxuICB9XG5cbiAgLyoqIOmHjeWRveWQjSB0b2FzdCDnmoTjgIzmkqTplIDjgI3vvJrmlLnlm57ljp/lkI0gKi9cbiAgYXN5bmMgZnVuY3Rpb24gcmV2ZXJ0Rm9sZGVyUmVuYW1lKGZpZDogc3RyaW5nLCBvcmlnaW5hbE5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5yZW5hbWVQaG90b0ZvbGRlcihmaWQsIG9yaWdpbmFsTmFtZSlcbiAgICAgIGF3YWl0IGRhdGEubG9hZEZvbGRlcnMoKVxuICAgICAgdGFicy5yZXRpdGxlQnlWaWV3UHJlZml4KCdmb2xkZXI6JywgZmlkLCBvcmlnaW5hbE5hbWUpXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHRvYXN0LmVycm9yKCfmkqTplIDlpLHotKUnLCB7IGRlc2NyaXB0aW9uOiAoZXJyb3IgYXMgRXJyb3IpLm1lc3NhZ2UgfSlcbiAgICB9XG4gIH1cblxuICAvKiog6KGM5YaF6YeN5ZG95ZCN5Y+W5raI77yIRWFnbGXvvJpFU0Mg6YCA5Ye657yW6L6R77yM5L+d55WZ5b2T5YmN5ZCN56ew77yJICovXG4gIGZ1bmN0aW9uIGNhbmNlbEZvbGRlcklubGluZVJlbmFtZSgpOiB2b2lkIHtcbiAgICByZW5hbWluZ0ZvbGRlcklkLnZhbHVlID0gbnVsbFxuICB9XG5cbiAgZnVuY3Rpb24gYWRkVG9Gb2xkZXIoZm9sZGVySWQ6IHN0cmluZywgcGhvdG9JZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgaWYgKHBob3RvSWRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG4gICAgdm9pZCB3aW5kb3cuYXBpLnBob3Rvc1xuICAgICAgLmFzc2lnblBob3Rvc1RvRm9sZGVyKGZvbGRlcklkLCBwaG90b0lkcylcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgZGF0YS5sb2FkRm9sZGVycygpXG4gICAgICAgIC8vIOWKoOWFpeaWh+S7tuWkueWQjuWPmOS4uuOAjOW3suWIhuexu+OAje+8jOWIt+aWsOWbuuWumuWFpeWPo+eahOacquWIhuexu+axoFxuICAgICAgICBkYXRhLmxvYWRVbnNvcnRlZCgpXG4gICAgICAgIHZvaWQgZGF0YS5yZWZyZXNoRm9sZGVyUGhvdG9zKGZvbGRlcklkKVxuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoZXJyb3I6IEVycm9yKSA9PiB7XG4gICAgICAgIHRvYXN0LmVycm9yKCfliqDlhaXmlofku7blpLnlpLHotKUnLCB7IGRlc2NyaXB0aW9uOiBlcnJvci5tZXNzYWdlIH0pXG4gICAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqIEVhZ2xlIGBkaWFsb2cucmVtb3ZlRm9sZGVyYCDlj6PlvoTvvIjmnKzmnLogNC4wLjAgYnVuZGxlIOWPluivge+8jOaXp+azqOmHiuOAjEVhZ2xlIOaXoOehruiupOW8ueeql+OAjeWPlumUmeS6hu+8ie+8mlxuICAgKiDmlofku7blpLnmnInntKDmnZDmiJbmnInlrZDmlofku7blpLnmiY3lvLnnoa7orqTvvIzli77pgInmoYbjgIzmiormlofku7blpLnlhoXpobnnm67kuKLliLDlm57mlLbnq5njgI3pu5jorqTli77pgInvvJtcbiAgICog56Gu6K6k5ZCO5pW05qO15a2Q5qCR6L+e5bim5Yig6Zmk77yM57Sg5p2Q6LWw6L2v5Yig6Zmk6L+b5Zue5pS256uZ77yI56OB55uY5Y6f5paH5Lu25LiN5Yqo77yJ44CCXG4gICAqL1xuICBmdW5jdGlvbiBkZWxldGVGb2xkZXJCeUlkKGZvbGRlcklkOiBzdHJpbmcsIG5hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IGRvb21lZCA9IGZvbGRlclN1YnRyZWVJZHMoZm9sZGVySWQpXG4gICAgY29uc3QgZm9sZGVyID0gZGF0YS5mb2xkZXJzLnZhbHVlLmZpbmQoKGYpID0+IGYuaWQgPT09IGZvbGRlcklkKVxuICAgIGNvbnN0IGhhc0NvbnRlbnQgPSBkb29tZWQubGVuZ3RoID4gMSB8fCAoZm9sZGVyPy5waG90b0NvdW50ID8/IDApID4gMFxuICAgIGlmICghaGFzQ29udGVudCkge1xuICAgICAgLy8gRWFnbGXvvJrnqbrmlofku7blpLnkuI3lvLnnoa7orqTvvIznm7TmjqXliKBcbiAgICAgIHZvaWQgcnVuRm9sZGVyRGVsZXRlKGZvbGRlcklkLCBuYW1lLCBmYWxzZSwgZG9vbWVkKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHJlcXVlc3RDb25maXJtKFxuICAgICAgJ+WIoOmZpOaWh+S7tuWkuScsXG4gICAgICBg6L+Z5Liq5pON5L2c5peg5rOV6L+b6KGM5aSN5Y6f77yM56Gu6K6k6KaB5Yig6Zmk4oCcJHtuYW1lfeKAneaWh+S7tuWkueWQl++8n2AsXG4gICAgICAn56Gu6K6k5Yig6ZmkJyxcbiAgICAgIGFzeW5jICh0b1RyYXNoKSA9PiB7XG4gICAgICAgIGF3YWl0IHJ1bkZvbGRlckRlbGV0ZShmb2xkZXJJZCwgbmFtZSwgdG9UcmFzaCwgZG9vbWVkKVxuICAgICAgfSxcbiAgICAgIHsgbGFiZWw6ICfmiormlofku7blpLnlhoXpobnnm67kuKLliLDlm57mlLbnq5knLCBjaGVja2VkOiB0cnVlIH1cbiAgICApXG4gIH1cblxuICAvKiog6Ieq6LqrICsg5YWo6YOo5ZCO5Luj77yI5a2Q5paH5Lu25aS56ZqP54i257qn5LiA6LW35Yig77yM5LiN5YaN5LiK5o+Q77yJICovXG4gIGZ1bmN0aW9uIGZvbGRlclN1YnRyZWVJZHMocm9vdElkOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG4gICAgY29uc3Qgb3V0ID0gbmV3IFNldDxzdHJpbmc+KFtyb290SWRdKVxuICAgIGxldCBncmV3ID0gdHJ1ZVxuICAgIHdoaWxlIChncmV3KSB7XG4gICAgICBncmV3ID0gZmFsc2VcbiAgICAgIGZvciAoY29uc3QgZiBvZiBkYXRhLmZvbGRlcnMudmFsdWUpIHtcbiAgICAgICAgaWYgKGYucGFyZW50SWQgJiYgb3V0LmhhcyhmLnBhcmVudElkKSAmJiAhb3V0LmhhcyhmLmlkKSkge1xuICAgICAgICAgIG91dC5hZGQoZi5pZClcbiAgICAgICAgICBncmV3ID0gdHJ1ZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBbLi4ub3V0XVxuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gcnVuRm9sZGVyRGVsZXRlKFxuICAgIGZvbGRlcklkOiBzdHJpbmcsXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIHRvVHJhc2g6IGJvb2xlYW4sXG4gICAgZG9vbWVkOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBmb2xkZXIgPSBkYXRhLmZvbGRlcnMudmFsdWUuZmluZCgoZikgPT4gZi5pZCA9PT0gZm9sZGVySWQpXG4gICAgLy8g5YmN5LiA5Liq5ZCM57qn77yI5Yig6Zmk5ZCO6YCJ5Lit6aG555qE6JC954K577yM5a+56b2QIEVhZ2xl77yJXG4gICAgY29uc3Qgc2libGluZ3MgPSBkYXRhLmZvbGRlcnMudmFsdWUuZmlsdGVyKFxuICAgICAgKGYpID0+IChmLnBhcmVudElkID8/IG51bGwpID09PSAoZm9sZGVyPy5wYXJlbnRJZCA/PyBudWxsKVxuICAgIClcbiAgICBjb25zdCBpZHggPSBzaWJsaW5ncy5maW5kSW5kZXgoKGYpID0+IGYuaWQgPT09IGZvbGRlcklkKVxuICAgIGNvbnN0IHByZXZTaWJsaW5nID0gaWR4ID4gMCA/IHNpYmxpbmdzW2lkeCAtIDFdIDogbnVsbFxuICAgIHRyeSB7XG4gICAgICBjb25zdCB3YXNBY3RpdmUgPSB0YWJzLmFjdGl2ZVZpZXcgPT09IGBmb2xkZXI6JHtmb2xkZXJJZH1gXG4gICAgICBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5kZWxldGVQaG90b0ZvbGRlcihmb2xkZXJJZCwgdG9UcmFzaClcbiAgICAgIC8vIOaVtOajteWtkOagkeeahOinhuWbvumDveimgeWkseaViO+8iOWQq+WBnOWcqOWtkOaWh+S7tuWkuemHjOeahOagh+etvumhte+8iVxuICAgICAgdGFicy5pbnZhbGlkYXRlVmlld3MoKHYpID0+IHYuc3RhcnRzV2l0aCgnZm9sZGVyOicpICYmIGRvb21lZC5pbmNsdWRlcyh2LnNsaWNlKDcpKSlcbiAgICAgIGlmICh3YXNBY3RpdmUgJiYgcHJldlNpYmxpbmcpIHtcbiAgICAgICAgLy8gRWFnbGXvvJrliKDpmaTlkI7pgInkuK3pobnokL3liLDliY3kuIDkuKrlkIznuqfmlofku7blpLlcbiAgICAgICAgdGFicy5zZXRWaWV3KGBmb2xkZXI6JHtwcmV2U2libGluZy5pZH1gLCBwcmV2U2libGluZy5uYW1lKVxuICAgICAgfVxuICAgICAgYXdhaXQgZGF0YS5sb2FkRm9sZGVycygpXG4gICAgICBpZiAodG9UcmFzaCkge1xuICAgICAgICBhd2FpdCBkYXRhLmxvYWRSZWN5Y2xlQmluKClcbiAgICAgICAgYXdhaXQgZGF0YS5sb2FkUGhvdG9zKClcbiAgICAgICAgdG9hc3Quc3VjY2Vzcyhg44CMJHtuYW1lfeOAjeW3suWIoOmZpGAsIHsgZGVzY3JpcHRpb246ICfmlofku7blpLnlhoXnmoTntKDmnZDlt7Lnp7vlhaXlm57mlLbnq5knIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCBkYXRhLmxvYWRVbnNvcnRlZCgpXG4gICAgICAgIHRvYXN0LnN1Y2Nlc3MoYOOAjCR7bmFtZX3jgI3lt7LliKDpmaRgLCB7IGRlc2NyaXB0aW9uOiAn5paH5Lu25aS55YaF55qE57Sg5p2Q5bey5b2S5YWl5pyq5YiG57G7JyB9KVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICB0b2FzdC5lcnJvcign5Yig6Zmk5aSx6LSlJywgeyBkZXNjcmlwdGlvbjogKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlIH0pXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVtb3ZlU2VsZWN0ZWRGcm9tRm9sZGVyKGZvbGRlcklkOiBzdHJpbmcsIGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICBpZiAoaWRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG4gICAgY29uc3QgZm9sZGVyID0gZGF0YS5mb2xkZXJzLnZhbHVlLmZpbmQoKGYpID0+IGYuaWQgPT09IGZvbGRlcklkKVxuICAgIHJlcXVlc3RDb25maXJtKFxuICAgICAgJ+enu+WHuuaWh+S7tuWkuScsXG4gICAgICBg5oqKICR7aWRzLmxlbmd0aH0g6aG556e75Ye644CMJHtmb2xkZXI/Lm5hbWUgPz8gJ+aWh+S7tuWkuSd944CN5ZCX77yfXFxuXFxu57Sg5p2Q5L+d55WZ5Zyo5Zu+5bqT5Lit77yM5LuF5Y+Y5Li65pyq5YiG57uE44CCYCxcbiAgICAgICfnp7vlh7onLFxuICAgICAgYXN5bmMgKCkgPT4ge1xuICAgICAgICBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5hc3NpZ25QaG90b3NUb0ZvbGRlcihudWxsLCBpZHMpXG4gICAgICAgIGF3YWl0IGRhdGEubG9hZEZvbGRlcnMoKVxuICAgICAgICAvLyDnp7vlh7rmlofku7blpLnlkI7lj5jlm57jgIzmnKrliIbnsbvjgI3vvIzliLfmlrDlm7rlrprlhaXlj6PnmoTmnKrliIbnsbvmsaBcbiAgICAgICAgYXdhaXQgZGF0YS5sb2FkVW5zb3J0ZWQoKVxuICAgICAgICBhd2FpdCBkYXRhLnJlZnJlc2hGb2xkZXJQaG90b3MoZm9sZGVySWQpXG4gICAgICAgIHRvYXN0LnN1Y2Nlc3MoJ+W3suenu+WHuuaWh+S7tuWkuScpXG4gICAgICB9XG4gICAgKVxuICB9XG5cbiAgLy8g4pSA4pSAIOagh+etviDilIDilIBcblxuICBmdW5jdGlvbiByZW5hbWVUYWdCeUlkKHRhZ0lkOiBzdHJpbmcsIGN1cnJlbnROYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICByZXF1ZXN0UHJvbXB0KHtcbiAgICAgIHRpdGxlOiAn6YeN5ZG95ZCN5qCH562+JyxcbiAgICAgIGxhYmVsOiAn5paw55qE5qCH562+5ZCN56ewJyxcbiAgICAgIGluaXRpYWxWYWx1ZTogY3VycmVudE5hbWUsXG4gICAgICBvblN1Ym1pdDogYXN5bmMgKG5hbWUpID0+IHtcbiAgICAgICAgY29uc3QgdHJpbW1lZCA9IG5hbWUudHJpbSgpXG4gICAgICAgIGlmICghdHJpbW1lZCB8fCB0cmltbWVkID09PSBjdXJyZW50TmFtZSkgcmV0dXJuXG4gICAgICAgIGF3YWl0IHdpbmRvdy5hcGkudGFnLnVwZGF0ZVRhZyh0YWdJZCwgeyBuYW1lOiB0cmltbWVkIH0pXG4gICAgICAgIGF3YWl0IGRhdGEubG9hZERpY3Rpb25hcnlUYWdzKClcbiAgICAgICAgYXdhaXQgZGF0YS5sb2FkUGhvdG9zKClcbiAgICAgICAgdG9hc3Quc3VjY2Vzcygn5qCH562+5bey6YeN5ZG95ZCNJylcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gZGVsZXRlVGFnQnlJZCh0YWdJZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICByZXF1ZXN0Q29uZmlybShcbiAgICAgICfliKDpmaTmoIfnrb4nLFxuICAgICAgYOehruWumuWIoOmZpOagh+etvuOAjCR7bmFtZX3jgI3lkJfvvJ9cXG5cXG7kvJrku47miYDmnInntKDmnZDkuIrnp7vpmaTor6XmoIfnrb7vvIzntKDmnZDmnKzouqvkuI3lj5flvbHlk43jgIJgLFxuICAgICAgJ+WIoOmZpCcsXG4gICAgICBhc3luYyAoKSA9PiB7XG4gICAgICAgIGF3YWl0IHdpbmRvdy5hcGkudGFnLmRlbGV0ZVRhZyh0YWdJZClcbiAgICAgICAgdGFicy5pbnZhbGlkYXRlVmlld3MoKHYpID0+IHYgPT09IGB0YWc6JHt0YWdJZH1gKVxuICAgICAgICBhd2FpdCBkYXRhLmxvYWREaWN0aW9uYXJ5VGFncygpXG4gICAgICAgIGF3YWl0IGRhdGEubG9hZFBob3RvcygpXG4gICAgICAgIHRvYXN0LnN1Y2Nlc3MoJ+agh+etvuW3suWIoOmZpCcpXG4gICAgICB9XG4gICAgKVxuICB9XG5cbiAgLy8g4pSA4pSAIOaZuuiDveaWh+S7tuWkuSDilIDilIBcblxuICAvKiog5LqM5Y2B5YWt6L2u77ya44CM5L+d5a2Y562b6YCJ44CN6aKE572u6KeE5YiZ77yIRWFnbGUgaWMtZmlsdGVyLXNhdmVkIOKGkiDmmbrog73mlofku7blpLnvvIkgKi9cbiAgY29uc3Qgc21hcnRQcmVzZXRSdWxlcyA9IHJlZjxTbWFydEFsYnVtUnVsZXMgfCBudWxsPihudWxsKVxuXG4gIGZ1bmN0aW9uIG9wZW5TbWFydEFsYnVtTW9kYWwoYWxidW06IFNtYXJ0QWxidW0gfCBudWxsLCBwcmVzZXRSdWxlcz86IFNtYXJ0QWxidW1SdWxlcyk6IHZvaWQge1xuICAgIGVkaXRpbmdTbWFydEFsYnVtLnZhbHVlID0gYWxidW1cbiAgICBzbWFydFByZXNldFJ1bGVzLnZhbHVlID0gYWxidW0gPyBudWxsIDogKHByZXNldFJ1bGVzID8/IG51bGwpXG4gICAgc21hcnRBbGJ1bU1vZGFsT3Blbi52YWx1ZSA9IHRydWVcbiAgfVxuXG4gIC8qKiDkuozljYHlha3ova7vvJrku6Xlm77mib7lm77vvIhFYWdsZSBBSSDnu7TluqbvvJvpgInlpJbpg6jlm77niYcg4oaSIOeZvuW6puS7peWbvuaQnOWbvu+8jOi3r+W+hOi/m+WJqui0tOadv++8iSAqL1xuICBhc3luYyBmdW5jdGlvbiByZXZlcnNlSW1hZ2VTZWFyY2goKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGZpbGVzID0gYXdhaXQgd2luZG93LmFwaS5waG90b3Muc2VsZWN0RmlsZXMoKVxuICAgICAgaWYgKCFmaWxlcyB8fCBmaWxlcy5sZW5ndGggPT09IDApIHJldHVyblxuICAgICAgY29uc3QgaW1nID0gZmlsZXNbMF1cbiAgICAgIGF3YWl0IHdpbmRvdy5hcGkuc3lzdGVtLm9wZW5FeHRlcm5hbCgnaHR0cHM6Ly9ncmFwaC5iYWlkdS5jb20vJylcbiAgICAgIC8vIOWkjeWItuWbvueJh+i3r+W+hOWIsOWJqui0tOadv++8jOaWueS+v+eUqOaIt+WcqOaQnOWbvumhtemdoueymOi0tC/mi5blhaVcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KGltZylcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvKiDliarotLTmnb/kuI3lj6/nlKjml7bpnZnpu5ggKi9cbiAgICAgIH1cbiAgICAgIHRvYXN0LmluZm8oJ+W3suaJk+W8gOeZvuW6puS7peWbvuaQnOWbvu+8jOWbvueJh+i3r+W+hOW3suWkjeWItu+8jOivt+aLluWFpeaIlumAieaLqeWbvueJhycpXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+S7peWbvuaQnOWbvuWksei0pTonLCBlcnJvcilcbiAgICAgIHRvYXN0LmVycm9yKCfku6Xlm77mkJzlm77lkK/liqjlpLHotKUnKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRlbGV0ZVNtYXJ0QWxidW1CeUlkKGFsYnVtOiBTbWFydEFsYnVtKTogdm9pZCB7XG4gICAgcmVxdWVzdENvbmZpcm0oXG4gICAgICAn5Yig6Zmk5pm66IO95paH5Lu25aS5JyxcbiAgICAgIGDnoa7lrprliKDpmaTjgIwke2FsYnVtLm5hbWV944CN5ZCX77yfXFxuXFxu5Y+q5Yig6Zmk5pS26JeP5aS55pys6Lqr77yM5LiN5Lya5Yig6Zmk5YW25Lit55qE5Zu+54mH44CCYCxcbiAgICAgICfliKDpmaQnLFxuICAgICAgYXN5bmMgKCkgPT4ge1xuICAgICAgICBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5kZWxldGVTbWFydEFsYnVtKGFsYnVtLmlkKVxuICAgICAgICB0YWJzLmludmFsaWRhdGVWaWV3cygodikgPT4gdiA9PT0gYHNtYXJ0OiR7YWxidW0uaWR9YClcbiAgICAgICAgYXdhaXQgZGF0YS5sb2FkU21hcnRBbGJ1bXMoKVxuICAgICAgICB0b2FzdC5zdWNjZXNzKCfmmbrog73mlofku7blpLnlt7LliKDpmaQnKVxuICAgICAgfVxuICAgIClcbiAgfVxuXG4gIC8vIOKUgOKUgCDmibnph4/mk43kvZwg4pSA4pSAXG5cbiAgZnVuY3Rpb24gaGFuZGxlQ29udmVydFRvV2ViUChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgY29uc3QgaW1hZ2VJZHMgPSBkYXRhXG4gICAgICAuYnlJZHMoaWRzKVxuICAgICAgLmZpbHRlcigocCkgPT4gcC5raW5kID09PSAnaW1hZ2UnICYmICFwLmZpbGVOYW1lLnRvTG93ZXJDYXNlKCkuZW5kc1dpdGgoJy53ZWJwJykpXG4gICAgICAubWFwKChwKSA9PiBwLmlkKVxuICAgIGlmIChpbWFnZUlkcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHRvYXN0LmluZm8oJ+mAieS4remhueS4reayoeacieWPr+i9rOaNoueahOWbvueJh++8iOW3sui3s+i/h+inhumikS/pn7PpopEv5bey5pivIFdlYlDvvIknKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHJlcXVlc3RDb25maXJtKFxuICAgICAgJ+i9rOaNouS4uiBXZWJQJyxcbiAgICAgIGDlsIbpgInkuK3nmoQgJHtpbWFnZUlkcy5sZW5ndGh9IOW8oOWbvueJh+i9rOaNouS4uiBXZWJQIOW5tuS9nOS4uuaWsOe0oOadkOWFpeW6k++8iOi0qOmHjyA4Mu+8ieOAglxcblxcbuWOn+aWh+S7tuS/neaMgeS4jeWKqOOAgmAsXG4gICAgICAn6L2s5o2iJyxcbiAgICAgIGFzeW5jICgpID0+IHtcbiAgICAgICAgZGF0YS5sb2FkaW5nLnZhbHVlID0gdHJ1ZVxuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHsgY291bnQgfSA9IGF3YWl0IHdpbmRvdy5hcGkucGhvdG9zLmNvbnZlcnRQaG90b3NUb1dlYlAoaW1hZ2VJZHMpXG4gICAgICAgICAgdG9hc3Quc3VjY2Vzcyhg5bey6L2s5o2iICR7Y291bnR9IOW8oOW5tuWFpeW6k2ApXG4gICAgICAgICAgYXdhaXQgZGF0YS5sb2FkUGhvdG9zKClcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICB0b2FzdC5lcnJvcign6L2s5o2i5aSx6LSlJywgeyBkZXNjcmlwdGlvbjogKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlIH0pXG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgZGF0YS5sb2FkaW5nLnZhbHVlID0gZmFsc2VcbiAgICAgICAgfVxuICAgICAgfVxuICAgIClcbiAgfVxuXG4gIC8qKiBGM++8muaMieaMh+WumuagvOW8jy/lj4LmlbDnm7TmjqXovazmjaLvvIjlj7PplK7jgIzovazmjaLkuLrjgI3lrZDoj5zljZXvvJvoh6rlrprlj4LmlbDnu48gQ29udmVydE1vZGFs77yJICovXG4gIGFzeW5jIGZ1bmN0aW9uIGNvbnZlcnRUbyhcbiAgICBpZHM6IHN0cmluZ1tdLFxuICAgIGZvcm1hdDogJ3dlYnAnIHwgJ3BuZycgfCAnanBnJyB8ICdhdmlmJyxcbiAgICBvcHRzPzogeyBxdWFsaXR5PzogbnVtYmVyOyBtYXhXaWR0aD86IG51bWJlciB9XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGV4dCA9IGAuJHtmb3JtYXR9YFxuICAgIGNvbnN0IGltYWdlSWRzID0gZGF0YVxuICAgICAgLmJ5SWRzKGlkcylcbiAgICAgIC5maWx0ZXIoKHApID0+IHAua2luZCA9PT0gJ2ltYWdlJyAmJiAhcC5maWxlTmFtZS50b0xvd2VyQ2FzZSgpLmVuZHNXaXRoKGV4dCkpXG4gICAgICAubWFwKChwKSA9PiBwLmlkKVxuICAgIGlmIChpbWFnZUlkcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHRvYXN0LmluZm8oJ+mAieS4remhueS4reayoeacieWPr+i9rOaNoueahOWbvueJh++8iOW3sui3s+i/h+mdnuWbvueJh+S4juWQjOagvOW8j++8iScpXG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgZGF0YS5sb2FkaW5nLnZhbHVlID0gdHJ1ZVxuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IGNvdW50IH0gPSBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5jb252ZXJ0UGhvdG9zKGltYWdlSWRzLCB7IGZvcm1hdCwgLi4ub3B0cyB9KVxuICAgICAgaWYgKGNvdW50ID4gMCkge1xuICAgICAgICB0b2FzdC5zdWNjZXNzKGDlt7LovazmjaIgJHtjb3VudH0g5byg77yIJHtleHQudG9VcHBlckNhc2UoKX3vvInlubblhaXlupNgKVxuICAgICAgICBhd2FpdCBkYXRhLmxvYWRQaG90b3MoKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdG9hc3QuaW5mbygn5rKh5pyJ5Y+v6L2s5o2i55qE5Zu+54mHJylcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdG9hc3QuZXJyb3IoJ+i9rOaNouWksei0pScsIHsgZGVzY3JpcHRpb246IChlcnJvciBhcyBFcnJvcikubWVzc2FnZSB9KVxuICAgIH0gZmluYWxseSB7XG4gICAgICBkYXRhLmxvYWRpbmcudmFsdWUgPSBmYWxzZVxuICAgIH1cbiAgfVxuXG4gIC8qKiDCpzIuRCDlr7zlh7ov5omT5YyF77ya6YCJ55uu5b2V5ZCO5ou36LSd6YCJ5Lit57Sg5p2Q5Yiw5aSW6YOoICovXG4gIGFzeW5jIGZ1bmN0aW9uIGV4cG9ydFNlbGVjdGVkKGlkczogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoaWRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdG9hc3QuaW5mbygn5rKh5pyJ6YCJ5Lit5Y+v5a+85Ye655qE57Sg5p2QJylcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICB0cnkge1xuICAgICAgY29uc3QgY291bnQgPSBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5leHBvcnRTZWxlY3RlZChpZHMpXG4gICAgICBpZiAoY291bnQgPiAwKSB0b2FzdC5zdWNjZXNzKGDlt7Llr7zlh7ogJHtjb3VudH0g5Liq57Sg5p2QYClcbiAgICAgIGVsc2UgdG9hc3QuaW5mbygn5bey5Y+W5raI5a+85Ye65oiW5paH5Lu25LiN5Y+v6K+7JylcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdG9hc3QuZXJyb3IoJ+WvvOWHuuWksei0pScsIHsgZGVzY3JpcHRpb246IChlcnJvciBhcyBFcnJvcikubWVzc2FnZSB9KVxuICAgIH1cbiAgfVxuXG4gIC8qKiByb3VuZDIw77ya5a+85Ye66YCJ5Lit57Sg5p2Q5YWD5pWw5o2u5Li6IENTViAqL1xuICBhc3luYyBmdW5jdGlvbiBleHBvcnRDc3YoaWRzOiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmIChpZHMubGVuZ3RoID09PSAwKSB7XG4gICAgICB0b2FzdC5pbmZvKCfmsqHmnInpgInkuK3lj6/lr7zlh7rnmoTntKDmnZAnKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5leHBvcnRDc3YoaWRzKVxuICAgICAgaWYgKHJlc3VsdC5vayAmJiByZXN1bHQuY291bnQpIHtcbiAgICAgICAgdG9hc3Quc3VjY2Vzcyhg5bey5a+85Ye6ICR7cmVzdWx0LmNvdW50fSDmnaHlhYPmlbDmja7kuLogQ1NWYClcbiAgICAgIH0gZWxzZSBpZiAocmVzdWx0LmVycm9yICE9PSAn5bey5Y+W5raIJykge1xuICAgICAgICB0b2FzdC5lcnJvcignQ1NWIOWvvOWHuuWksei0pScsIHsgZGVzY3JpcHRpb246IHJlc3VsdC5lcnJvciB9KVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICB0b2FzdC5lcnJvcignQ1NWIOWvvOWHuuWksei0pScsIHsgZGVzY3JpcHRpb246IChlcnJvciBhcyBFcnJvcikubWVzc2FnZSB9KVxuICAgIH1cbiAgfVxuXG4gIC8vIOKUgOKUgCDlr4bnoIHplIEg4pSA4pSAXG5cbiAgY29uc3QgbG9ja0VuYWJsZWQgPSByZWYoZmFsc2UpXG4gIGNvbnN0IGxvY2tlZCA9IHJlZihmYWxzZSlcbiAgY29uc3QgdW5sb2NrUGFzc3dvcmQgPSByZWYoJycpXG5cbiAgYXN5bmMgZnVuY3Rpb24gcmVmcmVzaExvY2tTdGF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgbG9ja0VuYWJsZWQudmFsdWUgPSBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5sb2NrSXNFbmFibGVkKClcbiAgICAgIGlmIChsb2NrRW5hYmxlZC52YWx1ZSkgbG9ja2VkLnZhbHVlID0gdHJ1ZVxuICAgIH0gY2F0Y2gge1xuICAgICAgLy8g5Li76L+b56iL5pyq5bCx57uq562J5Zy65pmv6Z2Z6buYXG4gICAgfVxuICB9XG5cbiAgLyoqIPCflJIg57uf5LiA5omT5byA566h55CG5by556qX77yI6K6+572uL+enu+mZpC/nq4vljbPplIHlrprpg73lnKjlvLnnqpflhoXvvIkgKi9cbiAgZnVuY3Rpb24gaGFuZGxlTG9ja0FjdGlvbigpOiB2b2lkIHtcbiAgICBsb2NrTW9kYWxPcGVuLnZhbHVlID0gdHJ1ZVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlUXVpY2tMb2NrKCk6IHZvaWQge1xuICAgIGxvY2tNb2RhbE9wZW4udmFsdWUgPSBmYWxzZVxuICAgIGxvY2tlZC52YWx1ZSA9IHRydWVcbiAgICB1bmxvY2tQYXNzd29yZC52YWx1ZSA9ICcnXG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBoYW5kbGVVbmxvY2soKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCF1bmxvY2tQYXNzd29yZC52YWx1ZSkgcmV0dXJuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IG9rID0gYXdhaXQgd2luZG93LmFwaS5waG90b3MubG9ja1ZlcmlmeSh1bmxvY2tQYXNzd29yZC52YWx1ZSlcbiAgICAgIGlmIChvaykge1xuICAgICAgICBsb2NrZWQudmFsdWUgPSBmYWxzZVxuICAgICAgICB1bmxvY2tQYXNzd29yZC52YWx1ZSA9ICcnXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0b2FzdC5lcnJvcign5a+G56CB5LiN5q2j56GuJylcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdG9hc3QuZXJyb3IoJ+ino+mUgeWksei0pScsIHsgZGVzY3JpcHRpb246IChlcnJvciBhcyBFcnJvcikubWVzc2FnZSB9KVxuICAgIH1cbiAgfVxuXG4gIC8vIOKUgOKUgCDlnKjns7vnu5/mlofku7bnrqHnkIblmajkuK3mmL7npLog4pSA4pSAXG5cbiAgZnVuY3Rpb24gcmV2ZWFsSW5Gb2xkZXIocGhvdG9zOiBQaG90b1tdKTogdm9pZCB7XG4gICAgY29uc3QgbGFzdCA9IHBob3Rvc1twaG90b3MubGVuZ3RoIC0gMV1cbiAgICBpZiAobGFzdCkgdm9pZCB3aW5kb3cuYXBpLnBob3Rvcy5zaG93SW5Gb2xkZXIobGFzdC5maWxlUGF0aClcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgLy8g5by556qX5byA5YWzXG4gICAgdGFnTWFuYWdlck9wZW4sXG4gICAgc21hcnRBbGJ1bU1vZGFsT3BlbixcbiAgICBhbGJ1bU1vZGFsT3BlbixcbiAgICBmb2xkZXJNb2RhbE9wZW4sXG4gICAgZm9sZGVyTW9kYWxQYXJlbnRJZCxcbiAgICBmb2xkZXJTZXR0aW5nc0lkLFxuICAgIG9wZW5Gb2xkZXJTZXR0aW5ncyxcbiAgICBiYXRjaFJlbmFtZU9wZW4sXG4gICAgYm9va21hcmtNb2RhbE9wZW4sXG4gICAgbG9ja01vZGFsT3BlbixcbiAgICBlZGl0aW5nU21hcnRBbGJ1bSxcbiAgICBzbWFydFByZXNldFJ1bGVzLFxuICAgIC8vIOWvvOWFpVxuICAgIGhhbmRsZUltcG9ydEZvbGRlcixcbiAgICBoYW5kbGVJbXBvcnRGaWxlcyxcbiAgICAvLyDljZXlm75cbiAgICBoYW5kbGVUb2dnbGVGYXZvcml0ZSxcbiAgICBoYW5kbGVTZXRSYXRpbmcsXG4gICAgaGFuZGxlU2V0RGVzY3JpcHRpb24sXG4gICAgaGFuZGxlQmF0Y2hVcGRhdGUsXG4gICAgaGFuZGxlQWRkVGFnLFxuICAgIGhhbmRsZVJlbW92ZVRhZyxcbiAgICBhZGRUYWdUb01hbnksXG4gICAgcmV2ZWFsSW5Gb2xkZXIsXG4gICAgLy8g5Yig6ZmkL+WbnuaUtuermVxuICAgIGhhbmRsZURlbGV0ZUlkcyxcbiAgICBkZWxldGVJZHNDb25maXJtZWQsXG4gICAgaGFuZGxlUmVzdG9yZUlkcyxcbiAgICBoYW5kbGVDbGVhclJlY3ljbGVCaW4sXG4gICAgaGFuZGxlUmVtb3ZlQWxsLFxuICAgIFNJTUlMQVJJVFlfVEhSRVNIT0xELFxuICAgIC8vIOebuOWGjFxuICAgIG9wZW5BbGJ1bU1vZGFsLFxuICAgIGFkZFRvQWxidW0sXG4gICAgcmVuYW1lQWxidW1CeUlkLFxuICAgIGRlbGV0ZUFsYnVtQnlJZCxcbiAgICByZW1vdmVTZWxlY3RlZEZyb21BbGJ1bSxcbiAgICAvLyDmlofku7blpLlcbiAgICBvcGVuRm9sZGVyTW9kYWwsXG4gICAgcmVuYW1pbmdGb2xkZXJJZCxcbiAgICBjcmVhdGVGb2xkZXJJbmxpbmUsXG4gICAgc3RhcnRGb2xkZXJJbmxpbmVSZW5hbWUsXG4gICAgY29tbWl0Rm9sZGVySW5saW5lUmVuYW1lLFxuICAgIGNhbmNlbEZvbGRlcklubGluZVJlbmFtZSxcbiAgICBhZGRUb0ZvbGRlcixcbiAgICBkZWxldGVGb2xkZXJCeUlkLFxuICAgIHJlbW92ZVNlbGVjdGVkRnJvbUZvbGRlcixcbiAgICAvLyDmoIfnrb5cbiAgICByZW5hbWVUYWdCeUlkLFxuICAgIGRlbGV0ZVRhZ0J5SWQsXG4gICAgLy8g5pm66IO95aS5XG4gICAgb3BlblNtYXJ0QWxidW1Nb2RhbCxcbiAgICBkZWxldGVTbWFydEFsYnVtQnlJZCxcbiAgICByZXZlcnNlSW1hZ2VTZWFyY2gsXG4gICAgLy8g5om56YePXG4gICAgaGFuZGxlQ29udmVydFRvV2ViUCxcbiAgICBjb252ZXJ0VG8sXG4gICAgZXhwb3J0U2VsZWN0ZWQsXG4gICAgZXhwb3J0Q3N2LFxuICAgIC8vIOmUgVxuICAgIGxvY2tFbmFibGVkLFxuICAgIGxvY2tlZCxcbiAgICB1bmxvY2tQYXNzd29yZCxcbiAgICByZWZyZXNoTG9ja1N0YXRlLFxuICAgIGhhbmRsZUxvY2tBY3Rpb24sXG4gICAgaGFuZGxlUXVpY2tMb2NrLFxuICAgIGhhbmRsZVVubG9ja1xuICB9XG59XG5cbnR5cGUgQWN0aW9ucyA9IFJldHVyblR5cGU8dHlwZW9mIGJ1aWxkPlxuXG5sZXQgc2luZ2xldG9uOiBBY3Rpb25zIHwgbnVsbCA9IG51bGxcblxuZXhwb3J0IGZ1bmN0aW9uIHVzZVBob3RvQWN0aW9ucygpOiBBY3Rpb25zIHtcbiAgaWYgKCFzaW5nbGV0b24p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