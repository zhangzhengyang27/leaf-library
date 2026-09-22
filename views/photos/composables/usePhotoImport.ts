/* 2026-09-22 由 dev-server 缓存的编译产物机械还原：非原始源码，类型标注已被 esbuild 剥除，
   import 说明符已尽量改回裸包名。过了 node --check 语法校验，未做运行验证。 */
import { ref } from "vue";
import { useToast } from "/src/composables/useToast.ts";
import { useLibraryTabs } from "/src/stores/libraryTabs.ts";
import { usePhotoClipboard } from "/src/views/photos/composables/usePhotoClipboard.ts";
import { usePhotoData } from "/src/views/photos/composables/usePhotoData.ts";
const toast = useToast();
const importing = ref(false);
const dragActive = ref(false);
let dragDepth = 0;
function fileToBase64(f) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? "");
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    reader.onerror = () => reject(reader.error ?? new Error("读取失败"));
    reader.readAsDataURL(f);
  });
}
function build() {
  const data = usePhotoData();
  const tabs = useLibraryTabs();
  const clipboard = usePhotoClipboard();
  const currentFolderId = () => {
    const v = tabs.activeView;
    return v.startsWith("folder:") ? v.slice(7) : null;
  };
  const importPaths = async (filePaths, folderId) => {
    if (filePaths.length === 0) return;
    importing.value = true;
    try {
      const newPhotos = await window.api.photos.importPaths(filePaths, folderId ?? null);
      await data.loadFolders();
      toast.success(`成功导入 ${newPhotos.length} 个素材`);
      await data.refreshAllPools();
    } catch (error) {
      console.error("导入失败:", error);
      toast.error("导入失败", { description: error.message });
    } finally {
      importing.value = false;
    }
  };
  const pasteFromClipboard = async () => {
    try {
      const paths = await window.api.photos.getClipboardFiles();
      if (paths.length === 0) {
        toast.info("剪贴板里没有可识别的素材文件");
        return;
      }
      await importPaths(paths, currentFolderId());
    } catch (error) {
      console.error("粘贴导入失败:", error);
      toast.error("粘贴导入失败", { description: error.message });
    }
  };
  const importBlobs = async (blobs, folderId) => {
    if (blobs.length === 0) return;
    importing.value = true;
    try {
      let n = 0;
      for (const b of blobs) {
        const base64 = await fileToBase64(b);
        const res = await window.api.photos.importBlob({ mime: b.type, base64 });
        if (res.ok && res.photo) {
          n += 1;
          if (folderId) {
            await window.api.photos.assignPhotosToFolder(folderId, [res.photo.id]);
          }
        } else {
          toast.error("粘贴的图片导入失败", { description: res.error });
        }
      }
      if (n > 0) {
        if (folderId) await data.loadFolders();
        toast.success(`成功导入 ${n} 个素材`);
        await data.refreshAllPools();
      }
    } catch (error) {
      console.error("粘贴图片导入失败:", error);
      toast.error("粘贴图片导入失败", { description: error.message });
    } finally {
      importing.value = false;
    }
  };
  const onDragEnter = (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    dragDepth += 1;
    dragActive.value = true;
  };
  const onDragOver = (e) => {
    if (!e.dataTransfer) return;
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      e.dataTransfer.dropEffect = "copy";
    }
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes("Files")) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dragActive.value = false;
  };
  const extractDropEntries = (dt) => {
    const paths = [];
    const blobs = [];
    let failed = 0;
    for (const f of Array.from(dt.files)) {
      let p = "";
      try {
        const viaWebUtils = window.api?.getPathForFile?.(f);
        if (typeof viaWebUtils === "string" && viaWebUtils.length > 0) p = viaWebUtils;
      } catch (err) {
        failed++;
        console.warn("[import] getPathForFile 失败:", err.message);
      }
      if (!p) {
        const legacy = f.path;
        if (typeof legacy === "string" && legacy.length > 0) p = legacy;
      }
      if (p) paths.push(p);
      else if (f.type.startsWith("image/")) blobs.push(f);
      else failed++;
    }
    return { paths, blobs, failed };
  };
  const dropFilesTo = async (e, folderId) => {
    e.preventDefault();
    dragDepth = 0;
    dragActive.value = false;
    const dt = e.dataTransfer;
    if (!dt) return;
    const { paths, failed } = extractDropEntries(dt);
    if (paths.length === 0) {
      if (dt.files.length === 0) toast.info("没有检测到可导入的文件");
      else
        toast.error(`无法读取所拖文件的路径（${failed}/${dt.files.length} 项解析失败）`, {
          description: "可尝试改用「导入」按钮选择文件，并把此提示截图反馈"
        });
      return;
    }
    await importPaths(paths, folderId);
  };
  const onDrop = (e) => {
    void dropFilesTo(e, currentFolderId());
  };
  const bindWindowDrag = () => {
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  };
  const onPaste = async (e) => {
    const target = e.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
      return;
    }
    if (clipboard.cutPhotoIds.value.length > 0) {
      e.preventDefault();
      void clipboard.pasteMove();
      return;
    }
    const dt = e.clipboardData;
    if (dt && dt.files && dt.files.length > 0) {
      e.preventDefault();
      const { paths, blobs, failed } = extractDropEntries(dt);
      if (paths.length === 0 && blobs.length === 0) {
        toast.error(`无法读取所粘贴文件的路径（${failed}/${dt.files.length} 项解析失败）`);
        return;
      }
      const fid = currentFolderId();
      if (paths.length > 0) await importPaths(paths, fid);
      await importBlobs(blobs, fid);
    } else {
      void pasteFromClipboard();
    }
  };
  const bindWindowPaste = () => {
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  };
  return {
    importing,
    dragActive,
    importPaths,
    dropFilesTo,
    pasteFromClipboard,
    bindWindowDrag,
    bindWindowPaste
  };
}
let singleton = null;
export function usePhotoImport() {
  if (!singleton) singleton = build();
  return singleton;
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInVzZVBob3RvSW1wb3J0LnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTGVhZiDntKDmnZDlupMgwrcg5pS26ZuG5YWl5Y+j77yIwqcyLkHvvIlcbiAqXG4gKiDnu5/kuIDlsIHoo4XkuKTnsbvlhaXlupPvvJpcbiAqIC0g5pys5Zyw5paH5Lu25ouW5ou95Yiw56qX5Y+j77yIRGF0YVRyYW5zZmVyLmZpbGVzW10ucGF0aO+8ieKGkiBwaG90b3M6aW1wb3J0UGF0aHNcbiAqIC0g4oyYViDnspjotLTvvIjns7vnu5/liarotLTmnb/ph4znmoTmlofku7bot6/lvoTvvInihpIgcGhvdG9zOmdldENsaXBib2FyZEZpbGVzIOKGkiBpbXBvcnRQYXRoc1xuICog5Z2H5aSN55So5pei5pyJ5a+85YWl566h57q/77yI5ZCO5Y+w6Ieq5Yqo57yp55Wl5Zu+L0VYSUbvvInvvIzlr7zlhaXlkI7liLfmlrDlhajlupPjgIJcbiAqXG4gKiDmqKHlnZfnuqfljZXkvovvvJrmi5bmi70v57KY6LS05ZyoIGluZGV4LnZ1ZSDosIPlkIzkuIDku73pgLvovpHjgIJcbiAqL1xuaW1wb3J0IHsgcmVmIH0gZnJvbSAndnVlJ1xuaW1wb3J0IHsgdXNlVG9hc3QgfSBmcm9tICdAY29tcG9zYWJsZXMvdXNlVG9hc3QnXG5pbXBvcnQgdHlwZSB7IFBob3RvIH0gZnJvbSAnQHJlbmRlcmVyL3R5cGVzL3Bob3RvJ1xuaW1wb3J0IHsgdXNlTGlicmFyeVRhYnMgfSBmcm9tICdAcmVuZGVyZXIvc3RvcmVzL2xpYnJhcnlUYWJzJ1xuaW1wb3J0IHsgdXNlUGhvdG9DbGlwYm9hcmQgfSBmcm9tICcuL3VzZVBob3RvQ2xpcGJvYXJkJ1xuaW1wb3J0IHsgdXNlUGhvdG9EYXRhIH0gZnJvbSAnLi91c2VQaG90b0RhdGEnXG5cbmNvbnN0IHRvYXN0ID0gdXNlVG9hc3QoKVxuXG5jb25zdCBpbXBvcnRpbmcgPSByZWYoZmFsc2UpXG5jb25zdCBkcmFnQWN0aXZlID0gcmVmKGZhbHNlKVxubGV0IGRyYWdEZXB0aCA9IDBcblxuLyoqIEZpbGUvYmxvYiDihpIg6KO4IGJhc2U2NO+8iERhdGEgVVJMIOWOu+WktO+8ie+8jOS+myBpbXBvcnRCbG9iIOi1sCBJUEMg5YWl5bqTICovXG5mdW5jdGlvbiBmaWxlVG9CYXNlNjQoZjogRmlsZSk6IFByb21pc2U8c3RyaW5nPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKVxuICAgIHJlYWRlci5vbmxvYWQgPSAoKSA9PiB7XG4gICAgICBjb25zdCBzID0gU3RyaW5nKHJlYWRlci5yZXN1bHQgPz8gJycpXG4gICAgICBjb25zdCBjb21tYSA9IHMuaW5kZXhPZignLCcpXG4gICAgICByZXNvbHZlKGNvbW1hID49IDAgPyBzLnNsaWNlKGNvbW1hICsgMSkgOiBzKVxuICAgIH1cbiAgICByZWFkZXIub25lcnJvciA9ICgpID0+IHJlamVjdChyZWFkZXIuZXJyb3IgPz8gbmV3IEVycm9yKCfor7vlj5blpLHotKUnKSlcbiAgICByZWFkZXIucmVhZEFzRGF0YVVSTChmKVxuICB9KVxufVxuXG5mdW5jdGlvbiBidWlsZCgpIHtcbiAgY29uc3QgZGF0YSA9IHVzZVBob3RvRGF0YSgpXG4gIGNvbnN0IHRhYnMgPSB1c2VMaWJyYXJ5VGFicygpXG4gIGNvbnN0IGNsaXBib2FyZCA9IHVzZVBob3RvQ2xpcGJvYXJkKClcblxuICAvKiog5b2T5YmN6KeG5Zu+5a+55bqU55qE5paH5Lu25aS5IGlk77yI5ouW5ou9L+eymOi0tC/lr7zlhaXokL3ngrnvvInvvIzpnZ7mlofku7blpLnop4blm77kuLogbnVsbCAqL1xuICBjb25zdCBjdXJyZW50Rm9sZGVySWQgPSAoKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gICAgY29uc3QgdiA9IHRhYnMuYWN0aXZlVmlld1xuICAgIHJldHVybiB2LnN0YXJ0c1dpdGgoJ2ZvbGRlcjonKSA/IHYuc2xpY2UoNykgOiBudWxsXG4gIH1cblxuICAvKiog5oqK57O757uf5paH5Lu26Lev5b6E5Lqk57uZ5ZCO5Y+w566h57q/5YWl5bqT77yI5ouW5ou9L+eymOi0tOWFseeUqO+8ie+8m1xuICAgKiAg55uu5b2V5Zyo5Li76L+b56iL5oyJ56OB55uY5bGC57qn6ZWc5YOP5bu65aS577yIRWFnbGUg5Y+j5b6E77yJ77yMZm9sZGVySWQg5piv5oyC6L2954K577yaXG4gICAqICDmlaPoo4Xmlofku7bkuI7plZzlg4/moJHnmoTmoLnpg73lvZLov5vlroPvvIjlubbop6blj5Hlhbboh6rliqjmoIfnrb7op4TliJnvvInvvIxudWxsID0g5L6n5qCP5qC557qnICovXG4gIGNvbnN0IGltcG9ydFBhdGhzID0gYXN5bmMgKGZpbGVQYXRoczogc3RyaW5nW10sIGZvbGRlcklkPzogc3RyaW5nIHwgbnVsbCk6IFByb21pc2U8dm9pZD4gPT4ge1xuICAgIGlmIChmaWxlUGF0aHMubGVuZ3RoID09PSAwKSByZXR1cm5cbiAgICBpbXBvcnRpbmcudmFsdWUgPSB0cnVlXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IG5ld1Bob3RvczogUGhvdG9bXSA9IGF3YWl0IHdpbmRvdy5hcGkucGhvdG9zLmltcG9ydFBhdGhzKGZpbGVQYXRocywgZm9sZGVySWQgPz8gbnVsbClcbiAgICAgIC8vIOW7uuWkuS/lvZLnu4Tpg73lt7LlnKjkuLvov5vnqIvlrozmiJDvvIzkvqfmoI/orqHmlbDkuI7mlofku7blpLnmoJHopoHot5/nnYDliLfmlrBcbiAgICAgIGF3YWl0IGRhdGEubG9hZEZvbGRlcnMoKVxuICAgICAgdG9hc3Quc3VjY2Vzcyhg5oiQ5Yqf5a+85YWlICR7bmV3UGhvdG9zLmxlbmd0aH0g5Liq57Sg5p2QYClcbiAgICAgIC8vIOW5tuWPkeWIt+aWsOWFqOW6k+ebuOWFs+axoO+8iOmBv+WFjeWkmuasoeS4suihjOaVtOW6k+aLieWPlu+8iVxuICAgICAgYXdhaXQgZGF0YS5yZWZyZXNoQWxsUG9vbHMoKVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCflr7zlhaXlpLHotKU6JywgZXJyb3IpXG4gICAgICB0b2FzdC5lcnJvcign5a+85YWl5aSx6LSlJywgeyBkZXNjcmlwdGlvbjogKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlIH0pXG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGltcG9ydGluZy52YWx1ZSA9IGZhbHNlXG4gICAgfVxuICB9XG5cbiAgLyoqIOKMmFYg57KY6LS077ya5LuO5Ymq6LS05p2/6K+75Y+W5paH5Lu26Lev5b6E5bm25YWl5bqTICovXG4gIGNvbnN0IHBhc3RlRnJvbUNsaXBib2FyZCA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcGF0aHMgPSBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5nZXRDbGlwYm9hcmRGaWxlcygpXG4gICAgICBpZiAocGF0aHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHRvYXN0LmluZm8oJ+WJqui0tOadv+mHjOayoeacieWPr+ivhuWIq+eahOe0oOadkOaWh+S7ticpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgYXdhaXQgaW1wb3J0UGF0aHMocGF0aHMsIGN1cnJlbnRGb2xkZXJJZCgpKVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCfnspjotLTlr7zlhaXlpLHotKU6JywgZXJyb3IpXG4gICAgICB0b2FzdC5lcnJvcign57KY6LS05a+85YWl5aSx6LSlJywgeyBkZXNjcmlwdGlvbjogKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlIH0pXG4gICAgfVxuICB9XG5cbiAgLyoqIOeymOi0tOWGheWtmOS9jeWbvu+8iOaIquWbvi/nvZHpobXlpI3liLbnmoTlm77vvIzml6Dno4Hnm5jot6/lvoTvvInnm7TmjqXlhaXlupMgKi9cbiAgY29uc3QgaW1wb3J0QmxvYnMgPSBhc3luYyAoYmxvYnM6IEZpbGVbXSwgZm9sZGVySWQ/OiBzdHJpbmcgfCBudWxsKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gICAgaWYgKGJsb2JzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG4gICAgaW1wb3J0aW5nLnZhbHVlID0gdHJ1ZVxuICAgIHRyeSB7XG4gICAgICBsZXQgbiA9IDBcbiAgICAgIGZvciAoY29uc3QgYiBvZiBibG9icykge1xuICAgICAgICBjb25zdCBiYXNlNjQgPSBhd2FpdCBmaWxlVG9CYXNlNjQoYilcbiAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgd2luZG93LmFwaS5waG90b3MuaW1wb3J0QmxvYih7IG1pbWU6IGIudHlwZSwgYmFzZTY0IH0pXG4gICAgICAgIGlmIChyZXMub2sgJiYgcmVzLnBob3RvKSB7XG4gICAgICAgICAgbiArPSAxXG4gICAgICAgICAgaWYgKGZvbGRlcklkKSB7XG4gICAgICAgICAgICBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5hc3NpZ25QaG90b3NUb0ZvbGRlcihmb2xkZXJJZCwgW3Jlcy5waG90by5pZF0pXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRvYXN0LmVycm9yKCfnspjotLTnmoTlm77niYflr7zlhaXlpLHotKUnLCB7IGRlc2NyaXB0aW9uOiByZXMuZXJyb3IgfSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKG4gPiAwKSB7XG4gICAgICAgIGlmIChmb2xkZXJJZCkgYXdhaXQgZGF0YS5sb2FkRm9sZGVycygpXG4gICAgICAgIHRvYXN0LnN1Y2Nlc3MoYOaIkOWKn+WvvOWFpSAke259IOS4que0oOadkGApXG4gICAgICAgIGF3YWl0IGRhdGEucmVmcmVzaEFsbFBvb2xzKClcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign57KY6LS05Zu+54mH5a+85YWl5aSx6LSlOicsIGVycm9yKVxuICAgICAgdG9hc3QuZXJyb3IoJ+eymOi0tOWbvueJh+WvvOWFpeWksei0pScsIHsgZGVzY3JpcHRpb246IChlcnJvciBhcyBFcnJvcikubWVzc2FnZSB9KVxuICAgIH0gZmluYWxseSB7XG4gICAgICBpbXBvcnRpbmcudmFsdWUgPSBmYWxzZVxuICAgIH1cbiAgfVxuXG4gIC8vIOKUgOKUgCDmi5bmi73okL3ngrnvvJp3aW5kb3cg57qnIGRyYWdlbnRlci9vdmVyL2xlYXZlL2Ryb3Ag4pSA4pSAXG5cbiAgY29uc3Qgb25EcmFnRW50ZXIgPSAoZTogRHJhZ0V2ZW50KTogdm9pZCA9PiB7XG4gICAgaWYgKCFlLmRhdGFUcmFuc2ZlciB8fCAhQXJyYXkuZnJvbShlLmRhdGFUcmFuc2Zlci50eXBlcykuaW5jbHVkZXMoJ0ZpbGVzJykpIHJldHVyblxuICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgIGRyYWdEZXB0aCArPSAxXG4gICAgZHJhZ0FjdGl2ZS52YWx1ZSA9IHRydWVcbiAgfVxuXG4gIGNvbnN0IG9uRHJhZ092ZXIgPSAoZTogRHJhZ0V2ZW50KTogdm9pZCA9PiB7XG4gICAgaWYgKCFlLmRhdGFUcmFuc2ZlcikgcmV0dXJuXG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpXG4gICAgaWYgKGUuZGF0YVRyYW5zZmVyLnR5cGVzLmluY2x1ZGVzKCdGaWxlcycpKSB7XG4gICAgICBlLmRhdGFUcmFuc2Zlci5kcm9wRWZmZWN0ID0gJ2NvcHknXG4gICAgfVxuICB9XG5cbiAgY29uc3Qgb25EcmFnTGVhdmUgPSAoZTogRHJhZ0V2ZW50KTogdm9pZCA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpXG4gICAgLy8g5LiOIG9uRHJhZ0VudGVyIOWQjOWuiOWNq++8mumdnuaWh+S7tuaLluaLve+8iOe6r+aWh+acrC/pk77mjqXvvInkuI3lj4LkuI7orqHmlbDvvIxcbiAgICAvLyDlkKbliJkgZHJhZ0RlcHRoIOiiq+axoeafk+OAgemBrue9qeWPr+iDveawuOS5hea7nueVmeaIluaPkOWJjea2iOWksVxuICAgIGlmICghZS5kYXRhVHJhbnNmZXIgfHwgIUFycmF5LmZyb20oZS5kYXRhVHJhbnNmZXIudHlwZXMpLmluY2x1ZGVzKCdGaWxlcycpKSByZXR1cm5cbiAgICBkcmFnRGVwdGggPSBNYXRoLm1heCgwLCBkcmFnRGVwdGggLSAxKVxuICAgIGlmIChkcmFnRGVwdGggPT09IDApIGRyYWdBY3RpdmUudmFsdWUgPSBmYWxzZVxuICB9XG5cbiAgLyoqIOS7jiBEYXRhVHJhbnNmZXIg6Kej5p6Q57ud5a+56Lev5b6E77yaRWxlY3Ryb24gMzIrIOenu+mZpOS6hiBGaWxlLnBhdGjvvIzmlLnnlKggcHJlbG9hZCDmmrTpnLLnmoRcbiAgICogIHdlYlV0aWxzLmdldFBhdGhGb3JGaWxl77yb5peg56OB55uY6Lev5b6E55qE5YaF5a2Y5L2N5Zu+77yI5oiq5Zu+L+e9kemhteWkjeWItueahOWbvu+8ieWNleeLrOaUtumbhuOAglxuICAgKiAg5Y2V5Liq5paH5Lu26aG56Kej5p6Q5aSx6LSl5Y+q6K6h5pWw5LiN5Lit5pat5pW05om544CCICovXG4gIGNvbnN0IGV4dHJhY3REcm9wRW50cmllcyA9IChcbiAgICBkdDogRGF0YVRyYW5zZmVyXG4gICk6IHsgcGF0aHM6IHN0cmluZ1tdOyBibG9iczogRmlsZVtdOyBmYWlsZWQ6IG51bWJlciB9ID0+IHtcbiAgICBjb25zdCBwYXRoczogc3RyaW5nW10gPSBbXVxuICAgIGNvbnN0IGJsb2JzOiBGaWxlW10gPSBbXVxuICAgIGxldCBmYWlsZWQgPSAwXG4gICAgZm9yIChjb25zdCBmIG9mIEFycmF5LmZyb20oZHQuZmlsZXMpKSB7XG4gICAgICBsZXQgcCA9ICcnXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB2aWFXZWJVdGlscyA9IHdpbmRvdy5hcGk/LmdldFBhdGhGb3JGaWxlPy4oZilcbiAgICAgICAgaWYgKHR5cGVvZiB2aWFXZWJVdGlscyA9PT0gJ3N0cmluZycgJiYgdmlhV2ViVXRpbHMubGVuZ3RoID4gMCkgcCA9IHZpYVdlYlV0aWxzXG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgLy8gd2ViVXRpbHMg5a+56Z2e5paH5Lu26aG55Lya5oqb6ZSZ77yb6K6h5pWw5L6/5LqO6K+K5pat44CM5ouW5pS+5peg5Y+N5bqU44CN57G75Y+N6aaIXG4gICAgICAgIGZhaWxlZCsrXG4gICAgICAgIGNvbnNvbGUud2FybignW2ltcG9ydF0gZ2V0UGF0aEZvckZpbGUg5aSx6LSlOicsIChlcnIgYXMgRXJyb3IpLm1lc3NhZ2UpXG4gICAgICB9XG4gICAgICBpZiAoIXApIHtcbiAgICAgICAgY29uc3QgbGVnYWN5ID0gKGYgYXMgdW5rbm93biBhcyB7IHBhdGg/OiBzdHJpbmcgfSkucGF0aFxuICAgICAgICBpZiAodHlwZW9mIGxlZ2FjeSA9PT0gJ3N0cmluZycgJiYgbGVnYWN5Lmxlbmd0aCA+IDApIHAgPSBsZWdhY3lcbiAgICAgIH1cbiAgICAgIGlmIChwKSBwYXRocy5wdXNoKHApXG4gICAgICAvLyDlhoXlrZjkvY3lm77msqHmnInno4Hnm5jot6/lvoTvvJrovawgYmFzZTY0IOWFpeW6k+iAjOmdnuaKpemUmVxuICAgICAgZWxzZSBpZiAoZi50eXBlLnN0YXJ0c1dpdGgoJ2ltYWdlLycpKSBibG9icy5wdXNoKGYpXG4gICAgICBlbHNlIGZhaWxlZCsrXG4gICAgfVxuICAgIHJldHVybiB7IHBhdGhzLCBibG9icywgZmFpbGVkIH1cbiAgfVxuXG4gIC8qKiDkuIDmrKHokL3ngrnlr7zlhaXvvJpmb2xkZXJJZCA9IOebruagh+aWh+S7tuWkue+8iG51bGwgPSDkvqfmoI/moLnnuqfvvInjgIJcbiAgICogIOaLluWIsOS+p+agj+afkOS4quaWh+S7tuWkueihjOS4iuaXtueUseivpeihjOiwg+eUqO+8jOiQveWIsOWIq+WkhOaXtueUsSB3aW5kb3cg57qnIG9uRHJvcCDosIPnlKjjgIJcbiAgICogIOaXoOiuuuiwgeiwg++8jOmDveimgeaUtuaOieWFqOWxj+aLluaLvemBrue9qeKAlOKAlOS+p+agj+mCo+adoei3r+W+hOS4jeS8muWGkuazoeWIsCB3aW5kb3cg55qEIGRyb3DjgIIgKi9cbiAgY29uc3QgZHJvcEZpbGVzVG8gPSBhc3luYyAoZTogRHJhZ0V2ZW50LCBmb2xkZXJJZDogc3RyaW5nIHwgbnVsbCk6IFByb21pc2U8dm9pZD4gPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgIGRyYWdEZXB0aCA9IDBcbiAgICBkcmFnQWN0aXZlLnZhbHVlID0gZmFsc2VcbiAgICBjb25zdCBkdCA9IGUuZGF0YVRyYW5zZmVyXG4gICAgaWYgKCFkdCkgcmV0dXJuXG4gICAgY29uc3QgeyBwYXRocywgZmFpbGVkIH0gPSBleHRyYWN0RHJvcEVudHJpZXMoZHQpXG4gICAgaWYgKHBhdGhzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgLy8g5q2k5YmN5Li66Z2Z6buYIHJldHVybuKAlOKAlOeUqOaIt+S+p+ihqOeOsOS4uuOAjOaLluaUvuayoeWPjeW6lOOAje+8jOaXoOS7u+S9lee6v+e0ou+8m1xuICAgICAgLy8g5pi+5byP5o+Q56S65Lul5Yy65YiG44CM5LqL5Lu25pyq5Yiw6L6+44CN44CM5paH5Lu26aG55Li656m644CN44CM6Lev5b6E6Kej5p6Q5aSx6LSl44CN5LiJ56eN5oOF5b2iXG4gICAgICBpZiAoZHQuZmlsZXMubGVuZ3RoID09PSAwKSB0b2FzdC5pbmZvKCfmsqHmnInmo4DmtYvliLDlj6/lr7zlhaXnmoTmlofku7YnKVxuICAgICAgZWxzZVxuICAgICAgICB0b2FzdC5lcnJvcihg5peg5rOV6K+75Y+W5omA5ouW5paH5Lu255qE6Lev5b6E77yIJHtmYWlsZWR9LyR7ZHQuZmlsZXMubGVuZ3RofSDpobnop6PmnpDlpLHotKXvvIlgLCB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICflj6/lsJ3or5XmlLnnlKjjgIzlr7zlhaXjgI3mjInpkq7pgInmi6nmlofku7bvvIzlubbmiormraTmj5DnpLrmiKrlm77lj43ppognXG4gICAgICAgIH0pXG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgYXdhaXQgaW1wb3J0UGF0aHMocGF0aHMsIGZvbGRlcklkKVxuICB9XG5cbiAgY29uc3Qgb25Ecm9wID0gKGU6IERyYWdFdmVudCk6IHZvaWQgPT4ge1xuICAgIHZvaWQgZHJvcEZpbGVzVG8oZSwgY3VycmVudEZvbGRlcklkKCkpXG4gIH1cblxuICBjb25zdCBiaW5kV2luZG93RHJhZyA9ICgpOiAoKCkgPT4gdm9pZCkgPT4ge1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdkcmFnZW50ZXInLCBvbkRyYWdFbnRlcilcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ292ZXInLCBvbkRyYWdPdmVyKVxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdkcmFnbGVhdmUnLCBvbkRyYWdMZWF2ZSlcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJvcCcsIG9uRHJvcClcbiAgICByZXR1cm4gKCkgPT4ge1xuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2RyYWdlbnRlcicsIG9uRHJhZ0VudGVyKVxuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2RyYWdvdmVyJywgb25EcmFnT3ZlcilcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdkcmFnbGVhdmUnLCBvbkRyYWdMZWF2ZSlcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdkcm9wJywgb25Ecm9wKVxuICAgIH1cbiAgfVxuXG4gIC8qKiDnspjotLTnm5HlkKzvvIjijJhWIC8gQ3RybCtWIOS7heWcqOmdnui+k+WFpeeEpueCueaXtuaLpuaIqu+8iSAqL1xuICBjb25zdCBvblBhc3RlID0gYXN5bmMgKGU6IENsaXBib2FyZEV2ZW50KTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQgfCBudWxsXG4gICAgaWYgKFxuICAgICAgdGFyZ2V0ICYmXG4gICAgICAodGFyZ2V0LnRhZ05hbWUgPT09ICdJTlBVVCcgfHwgdGFyZ2V0LnRhZ05hbWUgPT09ICdURVhUQVJFQScgfHwgdGFyZ2V0LmlzQ29udGVudEVkaXRhYmxlKVxuICAgICkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIC8vIEYx77ya5YaF6YOo5Ymq5YiH5oCB5LyY5YWI4oCU4oCU4oyYViDor63kuYnkuLrjgIznspjotLTnp7vliqjjgI3ogIzpnZ7mlofku7blr7zlhaXvvIhFYWdsZSDooYzkuLrvvIlcbiAgICBpZiAoY2xpcGJvYXJkLmN1dFBob3RvSWRzLnZhbHVlLmxlbmd0aCA+IDApIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgICAgdm9pZCBjbGlwYm9hcmQucGFzdGVNb3ZlKClcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBjb25zdCBkdCA9IGUuY2xpcGJvYXJkRGF0YVxuICAgIGlmIChkdCAmJiBkdC5maWxlcyAmJiBkdC5maWxlcy5sZW5ndGggPiAwKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KClcbiAgICAgIGNvbnN0IHsgcGF0aHMsIGJsb2JzLCBmYWlsZWQgfSA9IGV4dHJhY3REcm9wRW50cmllcyhkdClcbiAgICAgIGlmIChwYXRocy5sZW5ndGggPT09IDAgJiYgYmxvYnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHRvYXN0LmVycm9yKGDml6Dms5Xor7vlj5bmiYDnspjotLTmlofku7bnmoTot6/lvoTvvIgke2ZhaWxlZH0vJHtkdC5maWxlcy5sZW5ndGh9IOmhueino+aekOWksei0pe+8iWApXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgY29uc3QgZmlkID0gY3VycmVudEZvbGRlcklkKClcbiAgICAgIGlmIChwYXRocy5sZW5ndGggPiAwKSBhd2FpdCBpbXBvcnRQYXRocyhwYXRocywgZmlkKVxuICAgICAgYXdhaXQgaW1wb3J0QmxvYnMoYmxvYnMsIGZpZClcbiAgICB9IGVsc2Uge1xuICAgICAgdm9pZCBwYXN0ZUZyb21DbGlwYm9hcmQoKVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGJpbmRXaW5kb3dQYXN0ZSA9ICgpOiAoKCkgPT4gdm9pZCkgPT4ge1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdwYXN0ZScsIG9uUGFzdGUpXG4gICAgcmV0dXJuICgpID0+IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdwYXN0ZScsIG9uUGFzdGUpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGltcG9ydGluZyxcbiAgICBkcmFnQWN0aXZlLFxuICAgIGltcG9ydFBhdGhzLFxuICAgIGRyb3BGaWxlc1RvLFxuICAgIHBhc3RlRnJvbUNsaXBib2FyZCxcbiAgICBiaW5kV2luZG93RHJhZyxcbiAgICBiaW5kV2luZG93UGFzdGVcbiAgfVxufVxuXG50eXBlIEltcG9ydEFwaSA9IFJldHVyblR5cGU8dHlwZW9mIGJ1aWxkPlxuXG5sZXQgc2luZ2xldG9uOiBJbXBvcnRBcGkgfCBudWxsID0gbnVsbFxuXG5leHBvcnQgZnVuY3Rpb24gdXNlUGhvdG9JbXBvcnQoKTogSW1wb3J0QXBpIHtcbiAgaWYgKCFzaW5nbGV0b24pIHNpbmdsZXRvbiA9IGJ1aWxkKClcbiAgcmV0dXJuIHNpbmdsZXRvblxufVxuIl0sIm1hcHBpbmdzIjoiQUFVQSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQkFBb0I7QUFFN0IsTUFBTSxRQUFRLFNBQVM7QUFFdkIsTUFBTSxZQUFZLElBQUksS0FBSztBQUMzQixNQUFNLGFBQWEsSUFBSSxLQUFLO0FBQzVCLElBQUksWUFBWTtBQUdoQixTQUFTLGFBQWEsR0FBMEI7QUFDOUMsU0FBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFDdEMsVUFBTSxTQUFTLElBQUksV0FBVztBQUM5QixXQUFPLFNBQVMsTUFBTTtBQUNwQixZQUFNLElBQUksT0FBTyxPQUFPLFVBQVUsRUFBRTtBQUNwQyxZQUFNLFFBQVEsRUFBRSxRQUFRLEdBQUc7QUFDM0IsY0FBUSxTQUFTLElBQUksRUFBRSxNQUFNLFFBQVEsQ0FBQyxJQUFJLENBQUM7QUFBQSxJQUM3QztBQUNBLFdBQU8sVUFBVSxNQUFNLE9BQU8sT0FBTyxTQUFTLElBQUksTUFBTSxNQUFNLENBQUM7QUFDL0QsV0FBTyxjQUFjLENBQUM7QUFBQSxFQUN4QixD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