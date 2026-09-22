/* 2026-09-22 由 dev-server 缓存的编译产物机械还原：非原始源码，类型标注已被 esbuild 剥除，
   import 说明符已尽量改回裸包名。过了 node --check 语法校验，未做运行验证。 */
import { ref } from "vue";
import { useToast } from "/src/composables/useToast.ts";
import { useLibraryTabs } from "/src/stores/libraryTabs.ts";
import { useDialogs } from "/src/views/photos/composables/useDialogs.ts";
import { usePhotoData } from "/src/views/photos/composables/usePhotoData.ts";
import { usePhotoFilters } from "/src/views/photos/composables/usePhotoFilters.ts?t=1789949142955";
import { usePhotoSelection } from "/src/views/photos/composables/usePhotoSelection.ts";
import { installSearchPools } from "/src/views/photos/composables/usePhotoFilters.ts?t=1789949142955";
const SIMILARITY_THRESHOLD = 10;
const toast = useToast();
const duplicateGroups = ref([]);
const duplicateLoading = ref(false);
const similarSourceName = ref("");
const similarMatches = ref([]);
const similarVectorCount = ref(0);
const scanModalOpen = ref(false);
const lastScan = ref({ mode: "phash", scope: "all" });
const scanLabel = ref("");
function build() {
  const tabs = useLibraryTabs();
  const data = usePhotoData();
  const filters = usePhotoFilters();
  const { requestConfirm } = useDialogs();
  const { selectedIds } = usePhotoSelection();
  let similarSeq = 0;
  function openDuplicateScan() {
    scanModalOpen.value = true;
  }
  function snapshotScope(scope) {
    if (scope === "view") return filters.flatDisplayPhotos.value.map((p) => p.id);
    if (scope === "selection") return [...selectedIds.value];
    return void 0;
  }
  async function runDuplicateScan(mode, scope, photoIds) {
    if (duplicateLoading.value) return;
    const ids = scope === "all" ? void 0 : photoIds ?? snapshotScope(scope);
    if (scope !== "all" && (!ids || ids.length === 0)) {
      toast.info(scope === "selection" ? "当前没有选中素材" : "当前视图没有素材");
      scanModalOpen.value = false;
      return;
    }
    lastScan.value = { mode, scope, photoIds: ids };
    scanLabel.value = `${mode === "hash" ? "相同文件" : "相似图片"} · ` + (scope === "all" ? "全部素材" : scope === "view" ? "当前视图" : "已选");
    scanModalOpen.value = false;
    tabs.setView("duplicates", "相似查重");
    duplicateLoading.value = true;
    try {
      const groups = await window.api.photos.getDuplicateGroups(SIMILARITY_THRESHOLD, {
        mode,
        photoIds: ids
      });
      duplicateGroups.value = groups.map((photos) => {
        const keep = [...photos].sort(
          (a, b) => (b.width ?? 0) * (b.height ?? 0) * (b.fileSize || 1) - (a.width ?? 0) * (a.height ?? 0) * (a.fileSize || 1)
        )[0];
        return { photos, keepId: keep?.id ?? photos[0].id };
      });
      if (groups.length === 0) toast.info("没有发现相似/重复图片");
    } catch (error) {
      toast.error("查重失败", { description: error.message });
    } finally {
      duplicateLoading.value = false;
    }
  }
  function rescanLast() {
    const { mode, scope, photoIds } = lastScan.value;
    return runDuplicateScan(mode, scope, photoIds);
  }
  const handleFindSimilar = async (photoId) => {
    const seq = ++similarSeq;
    let matches = [];
    try {
      const phashMatches = await window.api.photos.findSimilar(photoId, SIMILARITY_THRESHOLD);
      if (seq !== similarSeq) return;
      matches = phashMatches.map((m) => m.photo);
    } catch (error) {
      if (seq === similarSeq) toast.error("找相似失败", { description: error.message });
      return;
    }
    let vectorCount = 0;
    try {
      const hits = await window.api.vectors.similar(photoId, 24);
      if (seq !== similarSeq) return;
      const seen = new Set(matches.map((p) => p.id));
      for (const hit of hits) {
        if (!hit?.photo || seen.has(hit.photo.id)) continue;
        seen.add(hit.photo.id);
        matches.push(hit.photo);
        vectorCount++;
      }
    } catch {
    }
    similarVectorCount.value = vectorCount;
    if (seq !== similarSeq) return;
    similarSourceName.value = data.allPhotos.value.find((p) => p.id === photoId)?.fileName ?? "所选图片";
    similarMatches.value = matches;
    tabs.setView(`similar:${photoId}`, `与「${similarSourceName.value}」相似`);
    if (matches.length === 0) {
      toast.info("没有找到相似图片", {
        description: `相似度阈值：汉明距离 ≤ ${SIMILARITY_THRESHOLD}`
      });
    } else if (vectorCount > 0 && matches.length > vectorCount) {
      toast.info(`另有 ${vectorCount} 张由向量档补入`, {
        description: "pHash 认近乎同一张的图；向量档认改过一版、构图相似的那类"
      });
    }
  };
  const handleRemoveOthers = (group) => {
    const others = group.photos.filter((p) => p.id !== group.keepId).map((p) => p.id);
    if (others.length === 0) return;
    requestConfirm(
      "移除相似图片",
      `保留「${group.photos.find((p) => p.id === group.keepId)?.fileName ?? "推荐图片"}」，
移除其余 ${others.length} 张相似图片吗？

记录会移入回收站，本地文件不受影响。`,
      "移除",
      async () => {
        try {
          await window.api.photos.deleteMultiple(others);
          toast.success(`已移除 ${others.length} 张相似图片`, {
            description: "已移入回收站",
            duration: 1e4,
            action: {
              label: "撤销",
              onClick: () => {
                void window.api.photos.restoreMultiple(others).then(async () => {
                  await data.loadPhotos();
                  await rescanLast();
                });
              }
            }
          });
          await data.loadPhotos();
          await rescanLast();
        } catch (error) {
          toast.error("移除失败", { description: error.message });
        }
      }
    );
  };
  return {
    SIMILARITY_THRESHOLD,
    duplicateGroups,
    duplicateLoading,
    similarSourceName,
    similarMatches,
    similarVectorCount,
    scanModalOpen,
    scanLabel,
    lastScan,
    openDuplicateScan,
    runDuplicateScan,
    rescanLast,
    handleFindSimilar,
    handleRemoveOthers
  };
}
let singleton = null;
export function useDuplicateScan() {
  if (!singleton) {
    singleton = build();
    const pools = installSearchPools();
    pools.similarMatches = similarMatches;
    pools.similarSourceName = similarSourceName;
  }
  return singleton;
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInVzZUR1cGxpY2F0ZVNjYW4udHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBMZWFmIOe0oOadkOW6kyDCtyDmn6Xph43kuI7nm7jkvLzvvIhELTAwOCDph43mnoTvvIlcbiAqXG4gKiDljp8gaW5kZXgudnVlIOeahCBkdXBsaWNhdGUvc2ltaWxhciDpgLvovpHov4HlhaXvvJvnu5PmnpzmsaDms6jlhaUgdXNlUGhvdG9GaWx0ZXJz77yMXG4gKiDjgIzmn6Xph43jgI3jgIzkuI4geHgg55u45Ly844CN5L2c5Li6IHRhYiDop4bop5LmiZPlvIDjgIJcbiAqL1xuaW1wb3J0IHsgcmVmIH0gZnJvbSAndnVlJ1xuaW1wb3J0IHsgdXNlVG9hc3QgfSBmcm9tICdAY29tcG9zYWJsZXMvdXNlVG9hc3QnXG5pbXBvcnQgeyB1c2VMaWJyYXJ5VGFicyB9IGZyb20gJ0ByZW5kZXJlci9zdG9yZXMvbGlicmFyeVRhYnMnXG5pbXBvcnQgdHlwZSB7IER1cGxpY2F0ZUdyb3VwIH0gZnJvbSAnQHZpZXdzL3Bob3Rvcy9jb21wb25lbnRzL0R1cGxpY2F0ZUdyb3Vwc1ZpZXcudnVlJ1xuaW1wb3J0IHR5cGUgeyBQaG90byB9IGZyb20gJ0ByZW5kZXJlci90eXBlcy9waG90bydcbmltcG9ydCB7IHVzZURpYWxvZ3MgfSBmcm9tICcuL3VzZURpYWxvZ3MnXG5pbXBvcnQgeyB1c2VQaG90b0RhdGEgfSBmcm9tICcuL3VzZVBob3RvRGF0YSdcbmltcG9ydCB7IHVzZVBob3RvRmlsdGVycyB9IGZyb20gJy4vdXNlUGhvdG9GaWx0ZXJzJ1xuaW1wb3J0IHsgdXNlUGhvdG9TZWxlY3Rpb24gfSBmcm9tICcuL3VzZVBob3RvU2VsZWN0aW9uJ1xuaW1wb3J0IHsgaW5zdGFsbFNlYXJjaFBvb2xzIH0gZnJvbSAnLi91c2VQaG90b0ZpbHRlcnMnXG5cbmNvbnN0IFNJTUlMQVJJVFlfVEhSRVNIT0xEID0gMTBcblxuY29uc3QgdG9hc3QgPSB1c2VUb2FzdCgpXG5cbmNvbnN0IGR1cGxpY2F0ZUdyb3VwcyA9IHJlZjxEdXBsaWNhdGVHcm91cFtdPihbXSlcbmNvbnN0IGR1cGxpY2F0ZUxvYWRpbmcgPSByZWYoZmFsc2UpXG5jb25zdCBzaW1pbGFyU291cmNlTmFtZSA9IHJlZignJylcbmNvbnN0IHNpbWlsYXJNYXRjaGVzID0gcmVmPFBob3RvW10+KFtdKVxuLyoqIEcx77ya5pys5qyhXCLmib7nm7jkvLxcIumHjOeUseWQkemHj+aho+ihpei/m+adpeeahOadoeaVsO+8iHBIYXNoIOS5i+WklueahOmCo+S4gOaho++8iSAqL1xuY29uc3Qgc2ltaWxhclZlY3RvckNvdW50ID0gcmVmKDApXG4vKiogRjXvvJrmiavmj4/orr7nva7lvLnnqpfvvIhFYWdsZSA044CM5omr5o+P55u45ZCM5paH5Lu2L+ebuOS8vOWbvueJh+OAjcOXIOiMg+WbtO+8iSAqL1xuY29uc3Qgc2Nhbk1vZGFsT3BlbiA9IHJlZihmYWxzZSlcbi8qKiDmnIDov5HkuIDmrKHmiavmj4/lj4LmlbDvvIjnu5PmnpzpobXlvr3moIcgKyDnp7vpmaTlkI7mjInljp/lj4LmlbDph43miavvvIkgKi9cbmNvbnN0IGxhc3RTY2FuID0gcmVmPHtcbiAgbW9kZTogJ3BoYXNoJyB8ICdoYXNoJ1xuICBzY29wZTogJ2FsbCcgfCAndmlldycgfCAnc2VsZWN0aW9uJ1xuICBwaG90b0lkcz86IHN0cmluZ1tdXG59Pih7IG1vZGU6ICdwaGFzaCcsIHNjb3BlOiAnYWxsJyB9KVxuLyoqIOaJq+aPj+WPguaVsOeahOS6uuexu+WPr+ivu+W+veagh++8iER1cGxpY2F0ZUdyb3Vwc1ZpZXcg6aG26YOo5bGV56S677yJICovXG5jb25zdCBzY2FuTGFiZWwgPSByZWYoJycpXG5cbmV4cG9ydCB0eXBlIER1cGxpY2F0ZU1vZGUgPSAncGhhc2gnIHwgJ2hhc2gnXG5leHBvcnQgdHlwZSBEdXBsaWNhdGVTY29wZSA9ICdhbGwnIHwgJ3ZpZXcnIHwgJ3NlbGVjdGlvbidcblxuZnVuY3Rpb24gYnVpbGQoKSB7XG4gIGNvbnN0IHRhYnMgPSB1c2VMaWJyYXJ5VGFicygpXG4gIGNvbnN0IGRhdGEgPSB1c2VQaG90b0RhdGEoKVxuICBjb25zdCBmaWx0ZXJzID0gdXNlUGhvdG9GaWx0ZXJzKClcbiAgY29uc3QgeyByZXF1ZXN0Q29uZmlybSB9ID0gdXNlRGlhbG9ncygpXG4gIGNvbnN0IHsgc2VsZWN0ZWRJZHMgfSA9IHVzZVBob3RvU2VsZWN0aW9uKClcbiAgLyoqIOaJvuebuOS8vOivt+axguW6j+WPt++8iOWuoeafpSBQMy0zNO+8iSAqL1xuICBsZXQgc2ltaWxhclNlcSA9IDBcblxuICAvKiog5omT5byA5omr5o+P6K6+572u5by556qX77yI55yf5q2j5omr5o+P5Zyo5by556qX44CM5byA5aeL5omr5o+P44CN6Kem5Y+R77yJICovXG4gIGZ1bmN0aW9uIG9wZW5EdXBsaWNhdGVTY2FuKCk6IHZvaWQge1xuICAgIHNjYW5Nb2RhbE9wZW4udmFsdWUgPSB0cnVlXG4gIH1cblxuICAvKiog5Zyo6Kem5Y+R6KeG5Zu+5LiL5b+r54Wn6IyD5Zu0IGlk77yI5YiH6LWw6KeG5Zu+5YmN6LCD55So77yJICovXG4gIGZ1bmN0aW9uIHNuYXBzaG90U2NvcGUoc2NvcGU6IER1cGxpY2F0ZVNjb3BlKTogc3RyaW5nW10gfCB1bmRlZmluZWQge1xuICAgIGlmIChzY29wZSA9PT0gJ3ZpZXcnKSByZXR1cm4gZmlsdGVycy5mbGF0RGlzcGxheVBob3Rvcy52YWx1ZS5tYXAoKHApID0+IHAuaWQpXG4gICAgaWYgKHNjb3BlID09PSAnc2VsZWN0aW9uJykgcmV0dXJuIFsuLi5zZWxlY3RlZElkcy52YWx1ZV1cbiAgICByZXR1cm4gdW5kZWZpbmVkXG4gIH1cblxuICAvKiog5oyJ5qih5byPw5fojIPlm7TmiafooYzmiavmj4/vvJtwaG90b0lkcyDnvLrnnIHml7bmjInlvZPliY3op4blm77lv6vnhacgKi9cbiAgYXN5bmMgZnVuY3Rpb24gcnVuRHVwbGljYXRlU2NhbihcbiAgICBtb2RlOiBEdXBsaWNhdGVNb2RlLFxuICAgIHNjb3BlOiBEdXBsaWNhdGVTY29wZSxcbiAgICBwaG90b0lkcz86IHN0cmluZ1tdXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIC8vIOWcqOmjnuWuiOWNq++8iOWuoeafpSBQMy0zNO+8ie+8muWPjOWHu+OAjOW8gOWni+aJq+aPj+OAjeS8muW5tuWPkeS4pOasoeWFqOW6kyBwaGFzaCDmiavmj49cbiAgICBpZiAoZHVwbGljYXRlTG9hZGluZy52YWx1ZSkgcmV0dXJuXG4gICAgY29uc3QgaWRzID0gc2NvcGUgPT09ICdhbGwnID8gdW5kZWZpbmVkIDogKHBob3RvSWRzID8/IHNuYXBzaG90U2NvcGUoc2NvcGUpKVxuICAgIGlmIChzY29wZSAhPT0gJ2FsbCcgJiYgKCFpZHMgfHwgaWRzLmxlbmd0aCA9PT0gMCkpIHtcbiAgICAgIHRvYXN0LmluZm8oc2NvcGUgPT09ICdzZWxlY3Rpb24nID8gJ+W9k+WJjeayoeaciemAieS4ree0oOadkCcgOiAn5b2T5YmN6KeG5Zu+5rKh5pyJ57Sg5p2QJylcbiAgICAgIHNjYW5Nb2RhbE9wZW4udmFsdWUgPSBmYWxzZVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGxhc3RTY2FuLnZhbHVlID0geyBtb2RlLCBzY29wZSwgcGhvdG9JZHM6IGlkcyB9XG4gICAgc2NhbkxhYmVsLnZhbHVlID1cbiAgICAgIGAke21vZGUgPT09ICdoYXNoJyA/ICfnm7jlkIzmlofku7YnIDogJ+ebuOS8vOWbvueJhyd9IMK3IGAgK1xuICAgICAgKHNjb3BlID09PSAnYWxsJyA/ICflhajpg6jntKDmnZAnIDogc2NvcGUgPT09ICd2aWV3JyA/ICflvZPliY3op4blm74nIDogJ+W3sumAiScpXG4gICAgc2Nhbk1vZGFsT3Blbi52YWx1ZSA9IGZhbHNlXG4gICAgdGFicy5zZXRWaWV3KCdkdXBsaWNhdGVzJywgJ+ebuOS8vOafpemHjScpXG4gICAgZHVwbGljYXRlTG9hZGluZy52YWx1ZSA9IHRydWVcbiAgICB0cnkge1xuICAgICAgY29uc3QgZ3JvdXBzID0gYXdhaXQgd2luZG93LmFwaS5waG90b3MuZ2V0RHVwbGljYXRlR3JvdXBzKFNJTUlMQVJJVFlfVEhSRVNIT0xELCB7XG4gICAgICAgIG1vZGUsXG4gICAgICAgIHBob3RvSWRzOiBpZHNcbiAgICAgIH0pXG4gICAgICBkdXBsaWNhdGVHcm91cHMudmFsdWUgPSBncm91cHMubWFwKChwaG90b3MpID0+IHtcbiAgICAgICAgLy8g5o6o6I2Q5L+d55WZ77ya5YiG6L6o546HIMOXIOaWh+S7tuWkp+Wwj+acgOS8mOeahOS4gOW8oFxuICAgICAgICBjb25zdCBrZWVwID0gWy4uLnBob3Rvc10uc29ydChcbiAgICAgICAgICAoYSwgYikgPT5cbiAgICAgICAgICAgIChiLndpZHRoID8/IDApICogKGIuaGVpZ2h0ID8/IDApICogKGIuZmlsZVNpemUgfHwgMSkgLVxuICAgICAgICAgICAgKGEud2lkdGggPz8gMCkgKiAoYS5oZWlnaHQgPz8gMCkgKiAoYS5maWxlU2l6ZSB8fCAxKVxuICAgICAgICApWzBdXG4gICAgICAgIHJldHVybiB7IHBob3Rvcywga2VlcElkOiBrZWVwPy5pZCA/PyBwaG90b3NbMF0uaWQgfVxuICAgICAgfSlcbiAgICAgIGlmIChncm91cHMubGVuZ3RoID09PSAwKSB0b2FzdC5pbmZvKCfmsqHmnInlj5HnjrDnm7jkvLwv6YeN5aSN5Zu+54mHJylcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdG9hc3QuZXJyb3IoJ+afpemHjeWksei0pScsIHsgZGVzY3JpcHRpb246IChlcnJvciBhcyBFcnJvcikubWVzc2FnZSB9KVxuICAgIH0gZmluYWxseSB7XG4gICAgICBkdXBsaWNhdGVMb2FkaW5nLnZhbHVlID0gZmFsc2VcbiAgICB9XG4gIH1cblxuICAvKiog56e76ZmkL+aSpOmUgOWQjuaMieWOn+WPguaVsOmHjeaJq++8iOS4jemHjeaWsOW8ueiuvue9ru+8iSAqL1xuICBmdW5jdGlvbiByZXNjYW5MYXN0KCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHsgbW9kZSwgc2NvcGUsIHBob3RvSWRzIH0gPSBsYXN0U2Nhbi52YWx1ZVxuICAgIHJldHVybiBydW5EdXBsaWNhdGVTY2FuKG1vZGUsIHNjb3BlLCBwaG90b0lkcylcbiAgfVxuXG4gIC8qKlxuICAgKiDmib7nm7jkvLzvvJrkuKTmoaPlkIjlubbjgILikaAgcEhhc2gg5oSf55+l5ZOI5biM77yI6L+R5LmO5ZCM5LiA5byg5Zu+77yJ77yb4pGhIEcxIOeahOWbvuWDj+WQkemHj+aho1xuICAgKiDvvIjmlLnov4fkuIDniYjjgIHmjaLov4flsIHpnaLkvYbop4bop4nlkIznsbvnmoTpgqPkuIDmibnvvInjgILnu5PmnpzmsaDms6jlhaUgdXNlUGhvdG9GaWx0ZXJzIOWxleekuuOAglxuICAgKiBELTAxNyDmi4bmjokgQ0xJUCDlkI7ov5nph4zlj6rliakgcEhhc2gg5LiA5qGj77yM5ZCR6YeP5qGj6ZqP5LqM5Y2B5Lmd6L2u6YeN5paw5o6l5Zue77yI5a6e546w5o2i5oiQ5LqGXG4gICAqIOS4u+i/m+eoi+ebtOi3kSBvbm54cnVudGltZS1ub2Rl77yM5LiN5YaN5pivIHRyYW5zZm9ybWVycy5qcyDpgqPmnaHlrr/kuLvot6/vvInjgIJcbiAgICovXG4gIGNvbnN0IGhhbmRsZUZpbmRTaW1pbGFyID0gYXN5bmMgKHBob3RvSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICAgIC8vIOW6j+WPt+WuiOWNq++8iOWuoeafpSBQMy0zNO+8ie+8mui/nue7reWvueS4pOW8oOWbvuaJvuebuOS8vOaXtu+8jOWFiOWPkeeahOaFouivt+axguS4jeW+l+imhuebluaWsOinhuWbvlxuICAgIGNvbnN0IHNlcSA9ICsrc2ltaWxhclNlcVxuICAgIGxldCBtYXRjaGVzOiBQaG90b1tdID0gW11cbiAgICB0cnkge1xuICAgICAgY29uc3QgcGhhc2hNYXRjaGVzID0gYXdhaXQgd2luZG93LmFwaS5waG90b3MuZmluZFNpbWlsYXIocGhvdG9JZCwgU0lNSUxBUklUWV9USFJFU0hPTEQpXG4gICAgICBpZiAoc2VxICE9PSBzaW1pbGFyU2VxKSByZXR1cm5cbiAgICAgIG1hdGNoZXMgPSBwaGFzaE1hdGNoZXMubWFwKChtKSA9PiBtLnBob3RvKVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBpZiAoc2VxID09PSBzaW1pbGFyU2VxKSB0b2FzdC5lcnJvcign5om+55u45Ly85aSx6LSlJywgeyBkZXNjcmlwdGlvbjogKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlIH0pXG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgLy8gRzEg56ys5LqM5qGj77yacEhhc2gg5Y+q6K6kXCLov5HkuY7lkIzkuIDlvKDlm75cIu+8iOWQjOWwuuWvuOWQjOaehOWbvu+8ie+8jOaNouWwgemdoi/mlLnov4fkuIDniYjnmoRcbiAgICAvLyDop4bop4nlkIznsbvlroPnnIvkuI3op4HvvJvlkJHph4/moaPooaXov5nkuIDmrrXjgILmqKHlnovmsqHkuIvovb3ml7YgdmVjdG9ycy5zaW1pbGFyIOebtOaOpei/lOWbnuepuu+8jFxuICAgIC8vIOaJgOS7pei/memHjOS4jeaKpemUmeS5n+S4jeaPkOekuuKAlOKAlOmCo+S4gOaho+WwseaYr+S4jeWtmOWcqOOAglxuICAgIGxldCB2ZWN0b3JDb3VudCA9IDBcbiAgICB0cnkge1xuICAgICAgY29uc3QgaGl0cyA9IGF3YWl0IHdpbmRvdy5hcGkudmVjdG9ycy5zaW1pbGFyKHBob3RvSWQsIDI0KVxuICAgICAgaWYgKHNlcSAhPT0gc2ltaWxhclNlcSkgcmV0dXJuXG4gICAgICBjb25zdCBzZWVuID0gbmV3IFNldChtYXRjaGVzLm1hcCgocCkgPT4gcC5pZCkpXG4gICAgICBmb3IgKGNvbnN0IGhpdCBvZiBoaXRzKSB7XG4gICAgICAgIGlmICghaGl0Py5waG90byB8fCBzZWVuLmhhcyhoaXQucGhvdG8uaWQpKSBjb250aW51ZVxuICAgICAgICBzZWVuLmFkZChoaXQucGhvdG8uaWQpXG4gICAgICAgIG1hdGNoZXMucHVzaChoaXQucGhvdG8pXG4gICAgICAgIHZlY3RvckNvdW50KytcbiAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgIC8qIOWQkemHj+aho+S4jeWPr+eUqO+8mnBIYXNoIOmCo+S4gOaho+eahOe7k+aenOeFp+W4uOWxleekuiAqL1xuICAgIH1cbiAgICBzaW1pbGFyVmVjdG9yQ291bnQudmFsdWUgPSB2ZWN0b3JDb3VudFxuICAgIGlmIChzZXEgIT09IHNpbWlsYXJTZXEpIHJldHVyblxuICAgIHNpbWlsYXJTb3VyY2VOYW1lLnZhbHVlID1cbiAgICAgIGRhdGEuYWxsUGhvdG9zLnZhbHVlLmZpbmQoKHApID0+IHAuaWQgPT09IHBob3RvSWQpPy5maWxlTmFtZSA/PyAn5omA6YCJ5Zu+54mHJ1xuICAgIHNpbWlsYXJNYXRjaGVzLnZhbHVlID0gbWF0Y2hlc1xuICAgIHRhYnMuc2V0Vmlldyhgc2ltaWxhcjoke3Bob3RvSWR9YCwgYOS4juOAjCR7c2ltaWxhclNvdXJjZU5hbWUudmFsdWV944CN55u45Ly8YClcbiAgICBpZiAobWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHRvYXN0LmluZm8oJ+ayoeacieaJvuWIsOebuOS8vOWbvueJhycsIHtcbiAgICAgICAgZGVzY3JpcHRpb246IGDnm7jkvLzluqbpmIjlgLzvvJrmsYnmmI7ot53nprsg4omkICR7U0lNSUxBUklUWV9USFJFU0hPTER9YFxuICAgICAgfSlcbiAgICB9IGVsc2UgaWYgKHZlY3RvckNvdW50ID4gMCAmJiBtYXRjaGVzLmxlbmd0aCA+IHZlY3RvckNvdW50KSB7XG4gICAgICB0b2FzdC5pbmZvKGDlj6bmnIkgJHt2ZWN0b3JDb3VudH0g5byg55Sx5ZCR6YeP5qGj6KGl5YWlYCwge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ3BIYXNoIOiupOi/keS5juWQjOS4gOW8oOeahOWbvu+8m+WQkemHj+aho+iupOaUuei/h+S4gOeJiOOAgeaehOWbvuebuOS8vOeahOmCo+exuydcbiAgICAgIH0pXG4gICAgfVxuICB9XG5cbiAgY29uc3QgaGFuZGxlUmVtb3ZlT3RoZXJzID0gKGdyb3VwOiBEdXBsaWNhdGVHcm91cCk6IHZvaWQgPT4ge1xuICAgIGNvbnN0IG90aGVycyA9IGdyb3VwLnBob3Rvcy5maWx0ZXIoKHApID0+IHAuaWQgIT09IGdyb3VwLmtlZXBJZCkubWFwKChwKSA9PiBwLmlkKVxuICAgIGlmIChvdGhlcnMubGVuZ3RoID09PSAwKSByZXR1cm5cbiAgICByZXF1ZXN0Q29uZmlybShcbiAgICAgICfnp7vpmaTnm7jkvLzlm77niYcnLFxuICAgICAgYOS/neeVmeOAjCR7Z3JvdXAucGhvdG9zLmZpbmQoKHApID0+IHAuaWQgPT09IGdyb3VwLmtlZXBJZCk/LmZpbGVOYW1lID8/ICfmjqjojZDlm77niYcnfeOAje+8jFxcbuenu+mZpOWFtuS9mSAke290aGVycy5sZW5ndGh9IOW8oOebuOS8vOWbvueJh+WQl++8n1xcblxcbuiusOW9leS8muenu+WFpeWbnuaUtuerme+8jOacrOWcsOaWh+S7tuS4jeWPl+W9seWTjeOAgmAsXG4gICAgICAn56e76ZmkJyxcbiAgICAgIGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5kZWxldGVNdWx0aXBsZShvdGhlcnMpXG4gICAgICAgICAgdG9hc3Quc3VjY2Vzcyhg5bey56e76ZmkICR7b3RoZXJzLmxlbmd0aH0g5byg55u45Ly85Zu+54mHYCwge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246ICflt7Lnp7vlhaXlm57mlLbnq5knLFxuICAgICAgICAgICAgZHVyYXRpb246IDEwMDAwLFxuICAgICAgICAgICAgYWN0aW9uOiB7XG4gICAgICAgICAgICAgIGxhYmVsOiAn5pKk6ZSAJyxcbiAgICAgICAgICAgICAgb25DbGljazogKCkgPT4ge1xuICAgICAgICAgICAgICAgIHZvaWQgd2luZG93LmFwaS5waG90b3MucmVzdG9yZU11bHRpcGxlKG90aGVycykudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICBhd2FpdCBkYXRhLmxvYWRQaG90b3MoKVxuICAgICAgICAgICAgICAgICAgYXdhaXQgcmVzY2FuTGFzdCgpXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pXG4gICAgICAgICAgYXdhaXQgZGF0YS5sb2FkUGhvdG9zKClcbiAgICAgICAgICBhd2FpdCByZXNjYW5MYXN0KClcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICB0b2FzdC5lcnJvcign56e76Zmk5aSx6LSlJywgeyBkZXNjcmlwdGlvbjogKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlIH0pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICApXG4gIH1cblxuICByZXR1cm4ge1xuICAgIFNJTUlMQVJJVFlfVEhSRVNIT0xELFxuICAgIGR1cGxpY2F0ZUdyb3VwcyxcbiAgICBkdXBsaWNhdGVMb2FkaW5nLFxuICAgIHNpbWlsYXJTb3VyY2VOYW1lLFxuICAgIHNpbWlsYXJNYXRjaGVzLFxuICAgIHNpbWlsYXJWZWN0b3JDb3VudCxcbiAgICBzY2FuTW9kYWxPcGVuLFxuICAgIHNjYW5MYWJlbCxcbiAgICBsYXN0U2NhbixcbiAgICBvcGVuRHVwbGljYXRlU2NhbixcbiAgICBydW5EdXBsaWNhdGVTY2FuLFxuICAgIHJlc2Nhbkxhc3QsXG4gICAgaGFuZGxlRmluZFNpbWlsYXIsXG4gICAgaGFuZGxlUmVtb3ZlT3RoZXJzXG4gIH1cbn1cblxudHlwZSBEdXBsaWNhdGVTY2FuID0gUmV0dXJuVHlwZTx0eXBlb2YgYnVpbGQ+XG5cbmxldCBzaW5nbGV0b246IER1cGxpY2F0ZVNjYW4gfCBudWxsID0gbnVsbFxuXG4vKiog5qih5Z2X5Y2V5L6L77yb5ZCM5pe25oqKIHNpbWlsYXIg57uT5p6c5rGg5rOo5YWlIHVzZVBob3RvRmlsdGVycyAqL1xuZXhwb3J0IGZ1bmN0aW9uIHVzZUR1cGxpY2F0ZVNjYW4oKTogRHVwbGljYXRlU2NhbiB7XG4gIGlmICghc2luZ2xldG9uKSB7XG4gICAgc2luZ2xldG9uID0gYnVpbGQoKVxuICAgIC8vIOebuOS8vOinhuWbvueahOe7k+aenOaxoO+8iGZpbHRlcnMg5bGV56S655So77yJXG4gICAgY29uc3QgcG9vbHMgPSBpbnN0YWxsU2VhcmNoUG9vbHMoKVxuICAgIHBvb2xzLnNpbWlsYXJNYXRjaGVzID0gc2ltaWxhck1hdGNoZXNcbiAgICBwb29scy5zaW1pbGFyU291cmNlTmFtZSA9IHNpbWlsYXJTb3VyY2VOYW1lXG4gIH1cbiAgcmV0dXJuIHNpbmdsZXRvblxufVxuIl0sIm1hcHBpbmdzIjoiQUFNQSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0I7QUFHL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywwQkFBMEI7QUFFbkMsTUFBTSx1QkFBdUI7QUFFN0IsTUFBTSxRQUFRLFNBQVM7QUFFdkIsTUFBTSxrQkFBa0IsSUFBc0IsQ0FBQyxDQUFDO0FBQ2hELE1BQU0sbUJBQW1CLElBQUksS0FBSztBQUNsQyxNQUFNLG9CQUFvQixJQUFJLEVBQUU7QUFDaEMsTUFBTSxpQkFBaUIsSUFBYSxDQUFDLENBQUM7QUFFdEMsTUFBTSxxQkFBcUIsSUFBSSxDQUFDO0FBRWhDLE1BQU0sZ0JBQWdCLElBQUksS0FBSztBQUUvQixNQUFNLFdBQVcsSUFJZCxFQUFFLE1BQU0sU0FBUyxPQUFPLE1BQU0sQ0FBQztBQUVsQyxNQUFNLFlBQVksSUFBSSxFQUFFO0FBS3hCLFNBQVMsUUFBUTtBQUNmLFFBQU0sT0FBTyxlQUFlO0FBQzVCLFFBQU0sT0FBTyxhQUFhO0FBQzFCLFFBQU0sVUFBVSxnQkFBZ0I7QUFDaEMsUUFBTSxFQUFFLGVBQWUsSUFBSSxXQUFXO0FBQ3RDLFFBQU0sRUFBRSxZQUFZLElBQUksa0JBQWtCO0FBRTFDLE1BQUksYUFBYTtBQUdqQixXQUFTLG9CQUEwQjtBQUNqQyxrQkFBYyxRQUFRO0FBQUEsRUFDeEI7QUFHQSxXQUFTLGNBQWMsT0FBNkM7QUFDbEUsUUFBSSxVQUFVLE9BQVEsUUFBTyxRQUFRLGtCQUFrQixNQUFNLElBQUksQ0FBQyxNQUFNLEVB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