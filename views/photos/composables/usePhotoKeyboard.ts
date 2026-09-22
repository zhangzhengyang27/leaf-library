/* 2026-09-22 由 dev-server 缓存的编译产物机械还原：非原始源码，类型标注已被 esbuild 剥除，
   import 说明符已尽量改回裸包名。过了 node --check 语法校验，未做运行验证。 */
import { ref } from "vue";
import { isPlayableVideoFile } from "/src/shared/assetTypes.ts?t=1789898198904";
import { useDialogs } from "/src/views/photos/composables/useDialogs.ts";
import { usePhotoClipboard } from "/src/views/photos/composables/usePhotoClipboard.ts";
import { usePhotoFilters } from "/src/views/photos/composables/usePhotoFilters.ts?t=1789949142955";
import { usePhotoActions } from "/src/views/photos/composables/usePhotoActions.ts";
import { usePreview } from "/src/views/photos/composables/usePreview.ts?t=1789949142955";
const navActiveId = ref(null);
let anchorIndex = -1;
function isFormTarget(target) {
  const el = target;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.tagName === "BUTTON" || // 保留按钮的空格键盘激活（审查 B4）
  el.isContentEditable;
}
function build() {
  const filters = usePhotoFilters();
  const preview = usePreview();
  const actions = usePhotoActions();
  const clipboard = usePhotoClipboard();
  const { pendingConfirm } = useDialogs();
  let ctx = null;
  function bind(context) {
    ctx = context;
  }
  const flat = () => filters.flatDisplayPhotos.value;
  function setSelection(ids) {
    if (!ctx) return;
    ctx.selectedIds.value = ids;
    if (ids.length > 0) ctx.isSelectionMode.value = true;
  }
  function moveNav(delta, extend) {
    const pool = flat();
    if (pool.length === 0) return;
    const currentId = navActiveId.value;
    const currentIdx = currentId ? pool.findIndex((p) => p.id === currentId) : -1;
    const nextIdx = Math.max(0, Math.min(pool.length - 1, currentIdx + delta));
    const target = pool[nextIdx];
    if (!target) return;
    navActiveId.value = target.id;
    ctx?.scrollToPhoto(target.id);
    if (extend && anchorIndex >= 0) {
      const [from, to] = [Math.min(anchorIndex, nextIdx), Math.max(anchorIndex, nextIdx)];
      setSelection(pool.slice(from, to + 1).map((p) => p.id));
    }
  }
  function handleClickSelect(photoId, e) {
    const pool = flat();
    const idx = pool.findIndex((p) => p.id === photoId);
    if (e.shiftKey && anchorIndex >= 0 && idx >= 0) {
      const [from, to] = [Math.min(anchorIndex, idx), Math.max(anchorIndex, idx)];
      setSelection(pool.slice(from, to + 1).map((p) => p.id));
      return;
    }
    if (idx >= 0) anchorIndex = idx;
    if ((e.metaKey || e.ctrlKey) && ctx) {
      if (!ctx.isSelectionMode.value) ctx.isSelectionMode.value = true;
      const has = ctx.selectedIds.value.includes(photoId);
      setSelection(
        has ? ctx.selectedIds.value.filter((x) => x !== photoId) : [...ctx.selectedIds.value, photoId]
      );
      navActiveId.value = photoId;
      return;
    }
    navActiveId.value = photoId;
  }
  function handleGlobalKeydown(e) {
    if (actions.locked.value) return;
    if (e.repeat && !e.key.startsWith("Arrow")) return;
    if (preview.previewPhoto.value) {
      const inTextField = !!e.target?.closest?.("input, textarea, select");
      if (e.key === "F5") {
        e.preventDefault();
        ctx?.toggleBriefMode?.();
      } else if ((e.metaKey || e.ctrlKey) && e.code === "KeyG") {
        e.preventDefault();
        ctx?.toggleGrayscale?.();
      } else if (e.key === "Escape") {
        if (!inTextField) {
          e.preventDefault();
          preview.close();
        }
      } else if (!inTextField && !ctx?.isBriefMode?.()) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          preview.previous();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          preview.next();
        } else if (e.code === "Space" && !isFormTarget(e.target)) {
          const cur = preview.previewPhoto.value;
          if (cur?.kind === "video" && isPlayableVideoFile(cur.fileName)) return;
          e.preventDefault();
          preview.close();
        }
      }
      return;
    }
    if (isFormTarget(e.target)) return;
    if (ctx?.anyModalOpen() || pendingConfirm.value) return;
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.code === "KeyA") {
      e.preventDefault();
      if (filters.isTrashView.value || filters.isMapView.value) return;
      ctx?.selectMaybeAll();
      return;
    }
    if (meta && e.code === "KeyF") {
      e.preventDefault();
      ctx?.focusSearch();
      return;
    }
    if (meta && !e.shiftKey && !e.altKey && e.code === "KeyX") {
      if (ctx && ctx.selectedIds.value.length > 0 && !filters.isTrashView.value) {
        e.preventDefault();
        clipboard.cutSelection();
      }
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace" && (e.metaKey || e.ctrlKey)) {
      if (ctx && ctx.selectedIds.value.length > 0 && !filters.isTrashView.value) {
        e.preventDefault();
        actions.handleDeleteIds([...ctx.selectedIds.value]);
      }
      return;
    }
    if (e.key === "F5") {
      e.preventDefault();
      ctx?.toggleBriefMode?.();
      return;
    }
    if (e.key === "F8") {
      e.preventDefault();
      ctx?.toggleAdvancedMode?.();
      return;
    }
    if (meta && e.code === "KeyD" && !e.altKey) {
      if (ctx?.duplicateSelected && ctx.selectedIds.value.length === 1 && !filters.isTrashView.value) {
        e.preventDefault();
        ctx.duplicateSelected();
      }
      return;
    }
    if (meta && e.shiftKey && !e.altKey) {
      if (e.code === "KeyN") {
        e.preventDefault();
        ctx?.createFolder?.();
        return;
      }
      if (e.code === "KeyT") {
        e.preventDefault();
        ctx?.openTagFilter?.();
        return;
      }
    }
    if (meta && !e.shiftKey && !e.altKey && e.code === "KeyJ") {
      e.preventDefault();
      ctx?.focusSearch();
      return;
    }
    if (meta && e.altKey && e.code === "KeyC") {
      if (ctx?.copyPath && ctx.selectedIds.value.length > 0) {
        e.preventDefault();
        ctx.copyPath();
      }
      return;
    }
    if (meta && !e.altKey && !e.shiftKey && e.code === "KeyC") {
      if (ctx?.copyFiles && ctx.selectedIds.value.length > 0) {
        e.preventDefault();
        ctx.copyFiles();
      }
      return;
    }
    if (meta && !e.altKey && !e.shiftKey && e.code === "KeyR") {
      if (ctx?.beginRename && ctx.selectedIds.value.length === 1 && !filters.isTrashView.value) {
        e.preventDefault();
        ctx.beginRename();
      }
      return;
    }
    if (e.key === "F2") {
      if (ctx?.beginRename && ctx.selectedIds.value.length === 1 && !filters.isTrashView.value) {
        e.preventDefault();
        ctx.beginRename();
      }
      return;
    }
    if (e.key === "Escape") {
      if (ctx && ctx.selectedIds.value.length > 0) {
        ctx.selectedIds.value = [];
        ctx.isSelectionMode.value = false;
        navActiveId.value = null;
      }
      clipboard.clearCut();
      return;
    }
    if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      const delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" ? -6 : 6;
      moveNav(delta, e.shiftKey);
      return;
    }
    if (e.key === "Enter" && navActiveId.value) {
      e.preventDefault();
      const photo = flat().find((p) => p.id === navActiveId.value);
      if (photo) preview.openPhoto(photo);
      return;
    }
    if (e.code === "Space") {
      if (filters.isMapView.value) return;
      e.preventDefault();
      if (preview.previewPhoto.value) {
        preview.close();
        return;
      }
      const pool = flat();
      if (pool.length === 0) return;
      const onlySelected = ctx && ctx.selectedIds.value.length === 1 ? ctx.selectedIds.value[0] : null;
      const anchorId = onlySelected ?? navActiveId.value ?? preview.lastViewedId.value;
      const anchor = anchorId ? pool.find((p) => p.id === anchorId) : void 0;
      preview.openPhoto(anchor ?? pool[0]);
    }
  }
  function bindWindow() {
    window.addEventListener("keydown", handleGlobalKeydown);
    return () => window.removeEventListener("keydown", handleGlobalKeydown);
  }
  return {
    navActiveId,
    bind,
    bindWindow,
    handleClickSelect,
    clearNav: () => {
      navActiveId.value = null;
    }
  };
}
let singleton = null;
export function usePhotoKeyboard() {
  if (!singleton) singleton = build();
  return singleton;
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInVzZVBob3RvS2V5Ym9hcmQudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBMZWFmIOe0oOadkOW6kyDCtyDplK7nm5jlr7zoiKrkuI7lpJrpgInvvIhELTAwOCDmlrDlop7vvIlcbiAqXG4gKiDnu5/kuIDmjqXnrqHnqpflj6PnuqfplK7nm5jvvJpcbiAqIC0g4oaR4oaT4oaQ4oaSIOenu+WKqOmrmOS6ru+8iOaJgeW5s+WxleekuumhuuW6j++8jOi3qCBzZWN0aW9uIOi/nue7re+8iVxuICogLSBFbnRlciDpooTop4jpq5jkuq7pobkgLyBFc2Mg5YWz6aKE6KeIwrfpgIDpgInmi6lcbiAqIC0gU3BhY2UgUXVpY2tMb29r77yI5L+d55WZ5Y6f6K6p6Lev6KeE5YiZ77ya6KGo5Y2V54Sm54K5L+W8ueeql+aJk+W8gC/plIHlsY8v5Zyw5Zu+6KeG5Zu+77yJXG4gKiAtIOKMmEEg5YWo6YCJ44CBRGVsZXRlIOenu+mZpOmAieS4reOAgeKMmEYg6IGa54Sm5pCc57SiXG4gKiDlpJrpgInvvIjijJhjbGljayAvIFNoaWZ0LWNsaWNr77yJ55qE54K55Ye75YWl5Y+j5ZyoIFBob3RvR3JpZC9QaG90b0xpc3RWaWV377yMXG4gKiDojIPlm7TpgInlj5blhbHnlKjmnKzmqKHlnZfnmoQgZmxhdCDpobrluo/kuI4gYW5jaG9y44CCXG4gKi9cbmltcG9ydCB7IHJlZiwgdHlwZSBSZWYgfSBmcm9tICd2dWUnXG5pbXBvcnQgeyBpc1BsYXlhYmxlVmlkZW9GaWxlIH0gZnJvbSAnQHNoYXJlZC9hc3NldFR5cGVzJ1xuaW1wb3J0IHR5cGUgeyBQaG90byB9IGZyb20gJ0ByZW5kZXJlci90eXBlcy9waG90bydcbmltcG9ydCB7IHVzZURpYWxvZ3MgfSBmcm9tICcuL3VzZURpYWxvZ3MnXG5pbXBvcnQgeyB1c2VQaG90b0NsaXBib2FyZCB9IGZyb20gJy4vdXNlUGhvdG9DbGlwYm9hcmQnXG5pbXBvcnQgeyB1c2VQaG90b0ZpbHRlcnMgfSBmcm9tICcuL3VzZVBob3RvRmlsdGVycydcbmltcG9ydCB7IHVzZVBob3RvQWN0aW9ucyB9IGZyb20gJy4vdXNlUGhvdG9BY3Rpb25zJ1xuaW1wb3J0IHsgdXNlUHJldmlldyB9IGZyb20gJy4vdXNlUHJldmlldydcblxuLyoqIOmUruebmOmrmOS6rumhue+8iOe9keagvC/liJfooajmuLLmn5MgZm9jdXMgcmluZyDnlKjvvIkgKi9cbmNvbnN0IG5hdkFjdGl2ZUlkID0gcmVmPHN0cmluZyB8IG51bGw+KG51bGwpXG5cbi8qKiBTaGlmdCDov57pgInplJrngrnvvIjmiYHlubPntKLlvJXvvIkgKi9cbmxldCBhbmNob3JJbmRleCA9IC0xXG5cbmludGVyZmFjZSBLZXlib2FyZEN0eCB7XG4gIHNlbGVjdGVkSWRzOiBSZWY8c3RyaW5nW10+XG4gIGlzU2VsZWN0aW9uTW9kZTogUmVmPGJvb2xlYW4+XG4gIGFueU1vZGFsT3BlbjogKCkgPT4gYm9vbGVhblxuICBmb2N1c1NlYXJjaDogKCkgPT4gdm9pZFxuICBzY3JvbGxUb1Bob3RvOiAoaWQ6IHN0cmluZykgPT4gdm9pZFxuICBzZWxlY3RNYXliZUFsbDogKCkgPT4gdm9pZFxuICAvKiogRC0wMTIgRjIg5bCx5Zyw6YeN5ZG95ZCN77yI5LuF5Zyo5Y2V6YCJ5pe26Kem5Y+R77yJICovXG4gIGJlZ2luUmVuYW1lPzogKCkgPT4gdm9pZFxuICAvKiogUjUgRjgg6L+b5YWl6auY57qn5qih5byP77yI5qOA5p+l5Zmo5L+h5oGv5YWo5bGV5byA77yJICovXG4gIHRvZ2dsZUFkdmFuY2VkTW9kZT86ICgpID0+IHZvaWRcbiAgLyoqIOWNgeWFq+i9riBQMyBGNSDov5vlhaXnroDmiqXmqKHlvI/vvIjlhajlsY/lubvnga/niYfvvIkgKi9cbiAgdG9nZ2xlQnJpZWZNb2RlPzogKCkgPT4gdm9pZFxuICAvKiogUjUg4oyYRyDpu5Hnmb3pooTop4jvvIjpooTop4jlhoXliIfmjaLvvIzkuI3nlKjpgIDlm57nvZHmoLzlj7PplK7vvIkgKi9cbiAgdG9nZ2xlR3JheXNjYWxlPzogKCkgPT4gdm9pZFxuICAvKiog5b2T5YmN5piv5ZCm5aSE5LqO566A5oql5qih5byP77yI6aKE6KeI5omT5byA5pe26ZSu55uY5bGC6K6p6LevIFBob3RvUHJldmlldyDnmoQg4oaQ4oaSL+epuuagvO+8iSAqL1xuICBpc0JyaWVmTW9kZT86ICgpID0+IGJvb2xlYW5cbiAgLyoqIFIyIOKMmEQg5Yib5bu65Ymv5pys77yI5Y2V6YCJ77yJICovXG4gIGR1cGxpY2F0ZVNlbGVjdGVkPzogKCkgPT4gdm9pZFxuICAvKiogUjIg4oyl4oyYQyDlpI3liLbmlofku7bot6/lvoQgKi9cbiAgY29weVBhdGg/OiAoKSA9PiB2b2lkXG4gIC8qKiDlr7npvZDoj5zljZXjgIzlpI3liLbmlofku7Yg4oyYQ+OAje+8muWOn+aWh+S7tuWkjeWItuWIsOezu+e7n+WJqui0tOadvyAqL1xuICBjb3B5RmlsZXM/OiAoKSA9PiB2b2lkXG4gIC8qKiDlhavova7vvJrijJjih6dOIOaWsOWinuaWh+S7tuWkue+8iEVhZ2xlIGNyZWF0ZS5mb2xkZXLvvIkgKi9cbiAgY3JlYXRlRm9sZGVyPzogKCkgPT4gdm9pZFxuICAvKiog5YWr6L2u77ya4oyY4oenVCDmiZPlvIDmoIfnrb7nrZvpgInlvLnlsYLvvIhFYWdsZSBvcGVuLnRhZ2ZpbHRlcu+8iSAqL1xuICBvcGVuVGFnRmlsdGVyPzogKCkgPT4gdm9pZFxufVxuXG5mdW5jdGlvbiBpc0Zvcm1UYXJnZXQodGFyZ2V0OiBFdmVudFRhcmdldCB8IG51bGwpOiBib29sZWFuIHtcbiAgY29uc3QgZWwgPSB0YXJnZXQgYXMgSFRNTEVsZW1lbnQgfCBudWxsXG4gIGlmICghZWwpIHJldHVybiBmYWxzZVxuICByZXR1cm4gKFxuICAgIGVsLnRhZ05hbWUgPT09ICdJTlBVVCcgfHxcbiAgICBlbC50YWdOYW1lID09PSAnVEVYVEFSRUEnIHx8XG4gICAgZWwudGFnTmFtZSA9PT0gJ1NFTEVDVCcgfHxcbiAgICBlbC50YWdOYW1lID09PSAnQlVUVE9OJyB8fCAvLyDkv53nlZnmjInpkq7nmoTnqbrmoLzplK7nm5jmv4DmtLvvvIjlrqHmn6UgQjTvvIlcbiAgICBlbC5pc0NvbnRlbnRFZGl0YWJsZVxuICApXG59XG5cbmZ1bmN0aW9uIGJ1aWxkKCkge1xuICBjb25zdCBmaWx0ZXJzID0gdXNlUGhvdG9GaWx0ZXJzKClcbiAgY29uc3QgcHJldmlldyA9IHVzZVByZXZpZXcoKVxuICBjb25zdCBhY3Rpb25zID0gdXNlUGhvdG9BY3Rpb25zKClcbiAgY29uc3QgY2xpcGJvYXJkID0gdXNlUGhvdG9DbGlwYm9hcmQoKVxuICBjb25zdCB7IHBlbmRpbmdDb25maXJtIH0gPSB1c2VEaWFsb2dzKClcblxuICAvKiog55SxIGluZGV4LnZ1ZSDms6jlhaXnmoTkuIrkuIvmlofvvIjlvLnnqpflvIDlhbPogZrlkIggKyDpgInkuK3mgIHvvIkgKi9cbiAgbGV0IGN0eDogS2V5Ym9hcmRDdHggfCBudWxsID0gbnVsbFxuXG4gIGZ1bmN0aW9uIGJpbmQoY29udGV4dDogS2V5Ym9hcmRDdHgpOiB2b2lkIHtcbiAgICBjdHggPSBjb250ZXh0XG4gIH1cblxuICBjb25zdCBmbGF0ID0gKCk6IFBob3RvW10gPT4gZmlsdGVycy5mbGF0RGlzcGxheVBob3Rvcy52YWx1ZVxuXG4gIGZ1bmN0aW9uIHNldFNlbGVjdGlvbihpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgaWYgKCFjdHgpIHJldHVyblxuICAgIGN0eC5zZWxlY3RlZElkcy52YWx1ZSA9IGlkc1xuICAgIGlmIChpZHMubGVuZ3RoID4gMCkgY3R4LmlzU2VsZWN0aW9uTW9kZS52YWx1ZSA9IHRydWVcbiAgfVxuXG4gIGZ1bmN0aW9uIG1vdmVOYXYoZGVsdGE6IG51bWJlciwgZXh0ZW5kOiBib29sZWFuKTogdm9pZCB7XG4gICAgY29uc3QgcG9vbCA9IGZsYXQoKVxuICAgIGlmIChwb29sLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG4gICAgY29uc3QgY3VycmVudElkID0gbmF2QWN0aXZlSWQudmFsdWVcbiAgICBjb25zdCBjdXJyZW50SWR4ID0gY3VycmVudElkID8gcG9vbC5maW5kSW5kZXgoKHApID0+IHAuaWQgPT09IGN1cnJlbnRJZCkgOiAtMVxuICAgIGNvbnN0IG5leHRJZHggPSBNYXRoLm1heCgwLCBNYXRoLm1pbihwb29sLmxlbmd0aCAtIDEsIGN1cnJlbnRJZHggKyBkZWx0YSkpXG4gICAgY29uc3QgdGFyZ2V0ID0gcG9vbFtuZXh0SWR4XVxuICAgIGlmICghdGFyZ2V0KSByZXR1cm5cbiAgICBuYXZBY3RpdmVJZC52YWx1ZSA9IHRhcmdldC5pZFxuICAgIGN0eD8uc2Nyb2xsVG9QaG90byh0YXJnZXQuaWQpXG4gICAgaWYgKGV4dGVuZCAmJiBhbmNob3JJbmRleCA+PSAwKSB7XG4gICAgICBjb25zdCBbZnJvbSwgdG9dID0gW01hdGgubWluKGFuY2hvckluZGV4LCBuZXh0SWR4KSwgTWF0aC5tYXgoYW5jaG9ySW5kZXgsIG5leHRJZHgpXVxuICAgICAgc2V0U2VsZWN0aW9uKHBvb2wuc2xpY2UoZnJvbSwgdG8gKyAxKS5tYXAoKHApID0+IHAuaWQpKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUNsaWNrU2VsZWN0KFxuICAgIHBob3RvSWQ6IHN0cmluZyxcbiAgICBlOiB7IG1ldGFLZXk/OiBib29sZWFuOyBjdHJsS2V5PzogYm9vbGVhbjsgc2hpZnRLZXk/OiBib29sZWFuIH1cbiAgKTogdm9pZCB7XG4gICAgY29uc3QgcG9vbCA9IGZsYXQoKVxuICAgIGNvbnN0IGlkeCA9IHBvb2wuZmluZEluZGV4KChwKSA9PiBwLmlkID09PSBwaG90b0lkKVxuICAgIGlmIChlLnNoaWZ0S2V5ICYmIGFuY2hvckluZGV4ID49IDAgJiYgaWR4ID49IDApIHtcbiAgICAgIGNvbnN0IFtmcm9tLCB0b10gPSBbTWF0aC5taW4oYW5jaG9ySW5kZXgsIGlkeCksIE1hdGgubWF4KGFuY2hvckluZGV4LCBpZHgpXVxuICAgICAgc2V0U2VsZWN0aW9uKHBvb2wuc2xpY2UoZnJvbSwgdG8gKyAxKS5tYXAoKHApID0+IHAuaWQpKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGlmIChpZHggPj0gMCkgYW5jaG9ySW5kZXggPSBpZHhcbiAgICBpZiAoKGUubWV0YUtleSB8fCBlLmN0cmxLZXkpICYmIGN0eCkge1xuICAgICAgaWYgKCFjdHguaXNTZWxlY3Rpb25Nb2RlLnZhbHVlKSBjdHguaXNTZWxlY3Rpb25Nb2RlLnZhbHVlID0gdHJ1ZVxuICAgICAgY29uc3QgaGFzID0gY3R4LnNlbGVjdGVkSWRzLnZhbHVlLmluY2x1ZGVzKHBob3RvSWQpXG4gICAgICBzZXRTZWxlY3Rpb24oXG4gICAgICAgIGhhc1xuICAgICAgICAgID8gY3R4LnNlbGVjdGVkSWRzLnZhbHVlLmZpbHRlcigoeCkgPT4geCAhPT0gcGhvdG9JZClcbiAgICAgICAgICA6IFsuLi5jdHguc2VsZWN0ZWRJZHMudmFsdWUsIHBob3RvSWRdXG4gICAgICApXG4gICAgICBuYXZBY3RpdmVJZC52YWx1ZSA9IHBob3RvSWRcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBuYXZBY3RpdmVJZC52YWx1ZSA9IHBob3RvSWRcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUdsb2JhbEtleWRvd24oZTogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuICAgIGlmIChhY3Rpb25zLmxvY2tlZC52YWx1ZSkgcmV0dXJuIC8vIOmUgeWxj+eKtuaAgeS4i+S4jeWTjeW6lO+8iOWuoeafpSBCM++8iVxuICAgIGlmIChlLnJlcGVhdCAmJiAhZS5rZXkuc3RhcnRzV2l0aCgnQXJyb3cnKSkgcmV0dXJuXG5cbiAgICAvLyDpooTop4jmiZPlvIDml7bvvJrihpDihpIg57+76aG144CBRXNjL+epuuagvCDlhbPpl63vvIhRdWlja0xvb2sg6K+t5LmJ77yJXG4gICAgLy8g566A5oql5qih5byP5LiLIOKGkOKGki/nqbrmoLznlLEgUGhvdG9QcmV2aWV3IOiHquihjOWkhOeQhu+8iOWQpuWImeWPjOa2iOi0ueS4gOasoeaMiei3s+S4pOW8oO+8ie+8m1xuICAgIC8vIEY1IOWcqOeugOaKpeWGhSA9IOmAgOWHuu+8iFBob3RvUHJldmlldyDms6jph4rmib/or7rov4fvvIzov5nph4zooaXkuIrlrp7njrDvvIlcbiAgICBpZiAocHJldmlldy5wcmV2aWV3UGhvdG8udmFsdWUpIHtcbiAgICAgIC8vIOmihOiniOWGheacieihqOWNle+8iOaPj+i/sCB0ZXh0YXJlYSAvIOa3u+WKoOagh+etviBpbnB1dO+8ie+8mkVTQyDkuI4g4oaQ4oaSIOWxnuS6jui+k+WFpeS4juWFieagh+enu+WKqO+8jFxuICAgICAgLy8g5LiN6IO96KKr5YWz5o6J6aKE6KeIL+e/u+mhteWQg+aOieKAlOKAlOepuuagvOS8muaJk+aWrei+k+WFpeW5tuS4ouW8g+acquaPkOS6pOeahOaPj+i/sO+8jFxuICAgICAgLy8g4oaQ4oaSIOS8mue/u+mhteW5tuWboCBwaG90by5pZCDlj5jmm7Tph43nva7ojYnnqL/jgIJGNSDkuI3mmK/ovpPlhaXplK7vvIzkv53nlZnjgIJcbiAgICAgIC8vIEVTQyDlj6rlr7nmlofmnKzmjqfku7borqnot6/vvIjkuI3lkKvmjInpkq7vvInvvJrngrnov4flt6XlhbfmoI/lkI7nhKbngrnlgZzlnKjmjInpkq7kuIrvvIxcbiAgICAgIC8vIOatpOaXtiBFU0Mg5LuN6aG76IO95YWz6aKE6KeI44CCXG4gICAgICBjb25zdCBpblRleHRGaWVsZCA9ICEhKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50IHwgbnVsbCk/LmNsb3Nlc3Q/LignaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QnKVxuICAgICAgaWYgKGUua2V5ID09PSAnRjUnKSB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgICAgICBjdHg/LnRvZ2dsZUJyaWVmTW9kZT8uKClcbiAgICAgIH0gZWxzZSBpZiAoKGUubWV0YUtleSB8fCBlLmN0cmxLZXkpICYmIGUuY29kZSA9PT0gJ0tleUcnKSB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgICAgICBjdHg/LnRvZ2dsZUdyYXlzY2FsZT8uKClcbiAgICAgIH0gZWxzZSBpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSB7XG4gICAgICAgIGlmICghaW5UZXh0RmllbGQpIHtcbiAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KClcbiAgICAgICAgICBwcmV2aWV3LmNsb3NlKClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICghaW5UZXh0RmllbGQgJiYgIWN0eD8uaXNCcmllZk1vZGU/LigpKSB7XG4gICAgICAgIGlmIChlLmtleSA9PT0gJ0Fycm93TGVmdCcpIHtcbiAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KClcbiAgICAgICAgICBwcmV2aWV3LnByZXZpb3VzKClcbiAgICAgICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ0Fycm93UmlnaHQnKSB7XG4gICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpXG4gICAgICAgICAgcHJldmlldy5uZXh0KClcbiAgICAgICAgfSBlbHNlIGlmIChlLmNvZGUgPT09ICdTcGFjZScgJiYgIWlzRm9ybVRhcmdldChlLnRhcmdldCkpIHtcbiAgICAgICAgICAvLyBRdWlja0xvb2sg5Lmg5oOv77ya6aKE6KeI5Lit5YaN5oyJ56m65qC8ID0g5YWz6Zet77yI54Sm54K55Zyo6L6T5YWl5o6n5Lu2L+aMiemSruS4iuaXtuiuqei3r++8ieOAglxuICAgICAgICAgIC8vIOWPr+WGheiBlOaSreaUvueahOinhumikeS+i+WkluKAlOKAlOepuuagvOW9kuaSreaUvi/mmoLlgZzvvIznlLEgUGhvdG9QcmV2aWV3IOWkhOeQhuOAglxuICAgICAgICAgIGNvbnN0IGN1ciA9IHByZXZpZXcucHJldmlld1Bob3RvLnZhbHVlXG4gICAgICAgICAgaWYgKGN1cj8ua2luZCA9PT0gJ3ZpZGVvJyAmJiBpc1BsYXlhYmxlVmlkZW9GaWxlKGN1ci5maWxlTmFtZSkpIHJldHVyblxuICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgICAgICAgIHByZXZpZXcuY2xvc2UoKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBpZiAoaXNGb3JtVGFyZ2V0KGUudGFyZ2V0KSkgcmV0dXJuXG4gICAgaWYgKGN0eD8uYW55TW9kYWxPcGVuKCkgfHwgcGVuZGluZ0NvbmZpcm0udmFsdWUpIHJldHVyblxuXG4gICAgLy8g5by556qXL+ihqOWNleS5i+WklueahOeql+WPo+e6p+W/q+aNt+mUruOAglxuICAgIC8vIOWtl+avjemUruS4gOW+i+eUqCBlLmNvZGUg5Yik5a6a77yabWFjT1Mg5LiKIOKMpe+8iEFsdO+8ieS8muaUueWGmSBlLmtlee+8iOKMpeKMmEMg5pivICfDpyfvvInvvIxcbiAgICAvLyDmjIkga2V5IOWMuemFjeS8muiuqSDijKXijJhDIOi/meexu+e7hOWQiOawuOi/nOWMuemFjeS4jeS4ilxuICAgIGNvbnN0IG1ldGEgPSBlLm1ldGFLZXkgfHwgZS5jdHJsS2V5XG4gICAgaWYgKG1ldGEgJiYgZS5jb2RlID09PSAnS2V5QScpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgICAgaWYgKGZpbHRlcnMuaXNUcmFzaFZpZXcudmFsdWUgfHwgZmlsdGVycy5pc01hcFZpZXcudmFsdWUpIHJldHVyblxuICAgICAgY3R4Py5zZWxlY3RNYXliZUFsbCgpXG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgaWYgKG1ldGEgJiYgZS5jb2RlID09PSAnS2V5RicpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgICAgY3R4Py5mb2N1c1NlYXJjaCgpXG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgLy8gRjEg4oyYWCDliarliIfpgInkuK3vvIjlhoXpg6jliarotLTmnb/vvJvijJhWIOeymOi0tOWNs+enu+WKqO+8jOS8mOWFiOS6juaWh+S7tuWvvOWFpe+8iVxuICAgIGlmIChtZXRhICYmICFlLnNoaWZ0S2V5ICYmICFlLmFsdEtleSAmJiBlLmNvZGUgPT09ICdLZXlYJykge1xuICAgICAgaWYgKGN0eCAmJiBjdHguc2VsZWN0ZWRJZHMudmFsdWUubGVuZ3RoID4gMCAmJiAhZmlsdGVycy5pc1RyYXNoVmlldy52YWx1ZSkge1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KClcbiAgICAgICAgY2xpcGJvYXJkLmN1dFNlbGVjdGlvbigpXG4gICAgICB9XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgaWYgKGUua2V5ID09PSAnRGVsZXRlJyB8fCAoZS5rZXkgPT09ICdCYWNrc3BhY2UnICYmIChlLm1ldGFLZXkgfHwgZS5jdHJsS2V5KSkpIHtcbiAgICAgIC8vIOWvuem9kOiPnOWNleagh+azqOOAjOS4ouWIsOWbnuaUtuermSDijJjijKvjgI3vvJroo7ggQmFja3NwYWNlIOS4jeWGjeebtOaOpeWIoOmZpO+8iOaYk+ivr+WIoO+8ie+8jFxuICAgICAgLy8g6ZSu55uY5LiK55qEIERlbGV0ZSDplK7vvIhmbivijKvvvInkv53mjIHlj6/nlKhcbiAgICAgIGlmIChjdHggJiYgY3R4LnNlbGVjdGVkSWRzLnZhbHVlLmxlbmd0aCA+IDAgJiYgIWZpbHRlcnMuaXNUcmFzaFZpZXcudmFsdWUpIHtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpXG4gICAgICAgIGFjdGlvbnMuaGFuZGxlRGVsZXRlSWRzKFsuLi5jdHguc2VsZWN0ZWRJZHMudmFsdWVdKVxuICAgICAgfVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIC8vIOWNgeWFq+i9riBQMyBGNSDnroDmiqXmqKHlvI/vvIjlhajlsY/lubvnga/niYfvvIlcbiAgICBpZiAoZS5rZXkgPT09ICdGNScpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgICAgY3R4Py50b2dnbGVCcmllZk1vZGU/LigpXG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgLy8gUjUgRjgg6auY57qn5qih5byP77yI5qOA5p+l5Zmo5L+h5oGv5YWo5bGV5byA77yJXG4gICAgaWYgKGUua2V5ID09PSAnRjgnKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KClcbiAgICAgIGN0eD8udG9nZ2xlQWR2YW5jZWRNb2RlPy4oKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIC8vIFIyIOKMmEQg5Yib5bu65Ymv5pys77yI5Y2V6YCJ77yJXG4gICAgaWYgKG1ldGEgJiYgZS5jb2RlID09PSAnS2V5RCcgJiYgIWUuYWx0S2V5KSB7XG4gICAgICBpZiAoXG4gICAgICAgIGN0eD8uZHVwbGljYXRlU2VsZWN0ZWQgJiZcbiAgICAgICAgY3R4LnNlbGVjdGVkSWRzLnZhbHVlLmxlbmd0aCA9PT0gMSAmJlxuICAgICAgICAhZmlsdGVycy5pc1RyYXNoVmlldy52YWx1ZVxuICAgICAgKSB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgICAgICBjdHguZHVwbGljYXRlU2VsZWN0ZWQoKVxuICAgICAgfVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIC8vIOWFq+i9riDijJjih6dOIOaWsOWinuaWh+S7tuWkuSAvIOKMmOKHp1Qg5qCH562+562b6YCJ77yIRWFnbGUga2V5YmluZHM6IGNyZWF0ZS5mb2xkZXIgLyBvcGVuLnRhZ2ZpbHRlcu+8iVxuICAgIGlmIChtZXRhICYmIGUuc2hpZnRLZXkgJiYgIWUuYWx0S2V5KSB7XG4gICAgICBpZiAoZS5jb2RlID09PSAnS2V5TicpIHtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpXG4gICAgICAgIGN0eD8uY3JlYXRlRm9sZGVyPy4oKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIGlmIChlLmNvZGUgPT09ICdLZXlUJykge1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KClcbiAgICAgICAgY3R4Py5vcGVuVGFnRmlsdGVyPy4oKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICB9XG4gICAgLy8g5YWr6L2uIOKMmEog5b+r6YCf5pCc57Si77yIRWFnbGUgcXVpY2tzZWFyY2jvvIzkuI4g4oyYRiDlkIzkuLrogZrnhKbmkJzntKLvvIlcbiAgICBpZiAobWV0YSAmJiAhZS5zaGlmdEtleSAmJiAhZS5hbHRLZXkgJiYgZS5jb2RlID09PSAnS2V5SicpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgICAgY3R4Py5mb2N1c1NlYXJjaCgpXG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgLy8gUjIg4oyl4oyYQyDlpI3liLbmlofku7bot6/lvoRcbiAgICBpZiAobWV0YSAmJiBlLmFsdEtleSAmJiBlLmNvZGUgPT09ICdLZXlDJykge1xuICAgICAgaWYgKGN0eD8uY29weVBhdGggJiYgY3R4LnNlbGVjdGVkSWRzLnZhbHVlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpXG4gICAgICAgIGN0eC5jb3B5UGF0aCgpXG4gICAgICB9XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgLy8g5a+56b2Q6I+c5Y2V44CM5aSN5Yi25paH5Lu2IOKMmEPjgI3vvJrlpI3liLbljp/mlofku7bliLDns7vnu5/liarotLTmnb/vvIhGaW5kZXIg5Y+v57KY6LS077yJ44CCXG4gICAgLy8gbWFjT1Mg5LiK6K+l57uE5ZCI6ZSu57uP57yW6L6R6I+c5Y2V6aG5IOKGkiDlkIjmiJAga2V5ZG93biDliLDovr7vvIjljp/nlJ/oj5zljZXkvJrlkJ7plK7vvIlcbiAgICBpZiAobWV0YSAmJiAhZS5hbHRLZXkgJiYgIWUuc2hpZnRLZXkgJiYgZS5jb2RlID09PSAnS2V5QycpIHtcbiAgICAgIGlmIChjdHg/LmNvcHlGaWxlcyAmJiBjdHguc2VsZWN0ZWRJZHMudmFsdWUubGVuZ3RoID4gMCkge1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KClcbiAgICAgICAgY3R4LmNvcHlGaWxlcygpXG4gICAgICB9XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgLy8g5a+56b2Q6I+c5Y2V44CM6YeN5ZG95ZCNIOKMmFLjgI3vvIjkuI4gRjIg562J5pWI77yM5Y2V6YCJ77yJXG4gICAgaWYgKG1ldGEgJiYgIWUuYWx0S2V5ICYmICFlLnNoaWZ0S2V5ICYmIGUuY29kZSA9PT0gJ0tleVInKSB7XG4gICAgICBpZiAoY3R4Py5iZWdpblJlbmFtZSAmJiBjdHguc2VsZWN0ZWRJZHMudmFsdWUubGVuZ3RoID09PSAxICYmICFmaWx0ZXJzLmlzVHJhc2hWaWV3LnZhbHVlKSB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgICAgICBjdHguYmVnaW5SZW5hbWUoKVxuICAgICAgfVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIC8vIEQtMDEyIEYyIOWwseWcsOmHjeWRveWQje+8iOWNlemAie+8iVxuICAgIGlmIChlLmtleSA9PT0gJ0YyJykge1xuICAgICAgaWYgKGN0eD8uYmVnaW5SZW5hbWUgJiYgY3R4LnNlbGVjdGVkSWRzLnZhbHVlLmxlbmd0aCA9PT0gMSAmJiAhZmlsdGVycy5pc1RyYXNoVmlldy52YWx1ZSkge1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KClcbiAgICAgICAgY3R4LmJlZ2luUmVuYW1lKClcbiAgICAgIH1cbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSB7XG4gICAgICBpZiAoY3R4ICYmIGN0eC5zZWxlY3RlZElkcy52YWx1ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgIGN0eC5zZWxlY3RlZElkcy52YWx1ZSA9IFtdXG4gICAgICAgIGN0eC5pc1NlbGVjdGlvbk1vZGUudmFsdWUgPSBmYWxzZVxuICAgICAgICBuYXZBY3RpdmVJZC52YWx1ZSA9IG51bGxcbiAgICAgIH1cbiAgICAgIGNsaXBib2FyZC5jbGVhckN1dCgpXG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgaWYgKGUua2V5LnN0YXJ0c1dpdGgoJ0Fycm93JykpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgICAgY29uc3QgZGVsdGEgPVxuICAgICAgICBlLmtleSA9PT0gJ0Fycm93TGVmdCcgPyAtMSA6IGUua2V5ID09PSAnQXJyb3dSaWdodCcgPyAxIDogZS5rZXkgPT09ICdBcnJvd1VwJyA/IC02IDogNlxuICAgICAgbW92ZU5hdihkZWx0YSwgZS5zaGlmdEtleSlcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBpZiAoZS5rZXkgPT09ICdFbnRlcicgJiYgbmF2QWN0aXZlSWQudmFsdWUpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgICAgY29uc3QgcGhvdG8gPSBmbGF0KCkuZmluZCgocCkgPT4gcC5pZCA9PT0gbmF2QWN0aXZlSWQudmFsdWUpXG4gICAgICBpZiAocGhvdG8pIHByZXZpZXcub3BlblBob3RvKHBob3RvKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIC8vIOepuuagvCBRdWlja0xvb2vvvIjljp/lha3mnJ/pgLvovpHvvJrplJrngrnkuLrmnIDov5Hmn6XnnIvpobnvvInjgIJcbiAgICAvLyDlm57mlLbnq5kv5p+l6YeNL+ebuOS8vOinhuWbvuWQjOagt+WPr+mihOiniO+8iOaXp+WunueOsOiiqyBzaG93RmlsdGVycyDmnaHku7bor6/kvKTvvInvvIxcbiAgICAvLyDku4XlnLDlm77op4blm77orqnot69cbiAgICBpZiAoZS5jb2RlID09PSAnU3BhY2UnKSB7XG4gICAgICBpZiAoZmlsdGVycy5pc01hcFZpZXcudmFsdWUpIHJldHVyblxuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpXG4gICAgICBpZiAocHJldmlldy5wcmV2aWV3UGhvdG8udmFsdWUpIHtcbiAgICAgICAgcHJldmlldy5jbG9zZSgpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgY29uc3QgcG9vbCA9IGZsYXQoKVxuICAgICAgaWYgKHBvb2wubGVuZ3RoID09PSAwKSByZXR1cm5cbiAgICAgIC8vIOmUmueCueS8mOWFiOe6p++8muWUr+S4gOmAieS4remhuSDihpIg6ZSu55uY6auY5Lqu6aG5IOKGkiDmnIDov5Hmn6XnnIvpobkg4oaSIOaxoOmmluOAglxuICAgICAgLy8g5Y+q6K6k44CM5pyA6L+R5p+l55yL44CN5Lya5peg6KeG55So5oi35Yia54K555qE6YKj5LiA6KGM77ya5YiX6KGo6aG154K556ysIDcg6KGM5YaN5oyJ56m65qC877yMXG4gICAgICAvLyDlvLnlh7rmnaXnmoTmmK/msaDpppbnrKwgMSDkuKrntKDmnZBcbiAgICAgIGNvbnN0IG9ubHlTZWxlY3RlZCA9XG4gICAgICAgIGN0eCAmJiBjdHguc2VsZWN0ZWRJZHMudmFsdWUubGVuZ3RoID09PSAxID8gY3R4LnNlbGVjdGVkSWRzLnZhbHVlWzBdIDogbnVsbFxuICAgICAgY29uc3QgYW5jaG9ySWQgPSBvbmx5U2VsZWN0ZWQgPz8gbmF2QWN0aXZlSWQudmFsdWUgPz8gcHJldmlldy5sYXN0Vmlld2VkSWQudmFsdWVcbiAgICAgIGNvbnN0IGFuY2hvciA9IGFuY2hvcklkID8gcG9vbC5maW5kKChwKSA9PiBwLmlkID09PSBhbmNob3JJZCkgOiB1bmRlZmluZWRcbiAgICAgIHByZXZpZXcub3BlblBob3RvKGFuY2hvciA/PyBwb29sWzBdKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGJpbmRXaW5kb3coKTogKCkgPT4gdm9pZCB7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBoYW5kbGVHbG9iYWxLZXlkb3duKVxuICAgIHJldHVybiAoKSA9PiB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGhhbmRsZUdsb2JhbEtleWRvd24pXG4gIH1cblxuICByZXR1cm4ge1xuICAgIG5hdkFjdGl2ZUlkLFxuICAgIGJpbmQsXG4gICAgYmluZFdpbmRvdyxcbiAgICBoYW5kbGVDbGlja1NlbGVjdCxcbiAgICBjbGVhck5hdjogKCkgPT4ge1xuICAgICAgbmF2QWN0aXZlSWQudmFsdWUgPSBudWxsXG4gICAgfVxuICB9XG59XG5cbnR5cGUgS2V5Ym9hcmQgPSBSZXR1cm5UeXBlPHR5cGVvZiBidWlsZD5cblxubGV0IHNpbmdsZXRvbjogS2V5Ym9hcmQgfCBudWxsID0gbnVsbFxuXG5leHBvcnQgZnVuY3Rpb24gdXNlUGhvdG9LZXlib2FyZCgpOiBLZXlib2FyZCB7XG4gIGlmICghc2luZ2xldG9uKSBzaW5nbGV0b24gPSBidWlsZCgpXG4gIHJldHVybiBzaW5nbGV0b25cbn1cbiJdLCJtYXBwaW5ncyI6IkFBV0EsU0FBUyxXQUFxQjtBQUM5QixTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFT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