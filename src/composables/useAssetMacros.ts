/* 2026-09-22 由 dev 缓存编译产物机械还原：类型标注已被 esbuild 剥除，import 说明符已尽量还原。过 node --check，未做运行验证。 */
import { ref } from "vue";
import { useToast } from "/src/composables/useToast.ts";
const STORAGE_KEY = "leaf.macros.v1";
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m) => !!m && typeof m.id === "string" && typeof m.name === "string" && Array.isArray(m.steps)
    );
  } catch {
    return [];
  }
}
const macros = ref(load());
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(macros.value));
  } catch {
  }
}
export function useAssetMacros() {
  const toast = useToast();
  function save(macro) {
    const i = macros.value.findIndex((m) => m.id === macro.id);
    if (i >= 0) macros.value.splice(i, 1, macro);
    else macros.value.push(macro);
    persist();
  }
  function remove(id) {
    macros.value = macros.value.filter((m) => m.id !== id);
    persist();
  }
  async function runMacro(macro, ids) {
    if (ids.length === 0) {
      toast.warning("请先选中素材再运行动作");
      return false;
    }
    const { usePhotoActions } = await import("/src/views/photos/composables/usePhotoActions.ts?t=1789896433323");
    const actions = usePhotoActions();
    for (const [i, step] of macro.steps.entries()) {
      try {
        switch (step.type) {
          case "rename":
            await window.api.photos.renamePhotos(
              ids.map((id, idx) => ({ id, pattern: step.pattern, start: idx + 1 }))
            );
            break;
          case "addTags": {
            const tags = step.tags.split(/[\s,，、]+/).map((t) => t.trim()).filter(Boolean);
            for (const tag of tags) await actions.addTagToMany(ids, tag);
            break;
          }
          case "rating":
            await actions.handleBatchUpdate(ids, { rating: step.value });
            break;
          case "description":
            await actions.handleBatchUpdate(ids, { description: step.text });
            break;
          case "webp":
            await actions.handleConvertToWebP(ids);
            break;
          case "moveToFolder":
            await window.api.photos.assignPhotosToFolder(step.folderId, ids);
            break;
        }
      } catch (error) {
        toast.error(`动作「${macro.name}」第 ${i + 1} 步失败`, {
          description: error.message
        });
        return false;
      }
    }
    toast.success(`动作「${macro.name}」已应用于 ${ids.length} 项`);
    return true;
  }
  return { macros, save, remove, runMacro };
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInVzZUFzc2V0TWFjcm9zLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICog5Y2B5LqU6L2u5om5Ne+8mue0oOadkOWKqOS9nOWuj++8iEVhZ2xlIOKcpiDliqjkvZzns7vnu5/nmoQgTGVhZiDoh6rnoJQgTVZQ77yJXG4gKlxuICogLSDliqjkvZwgPSDmnInluo/mraXpqqTpm4bvvIzlr7njgIzlvZPliY3pgInkuK3jgI3mjInluo/mibnph4/miafooYzvvJvlrprkuYnlrZggbG9jYWxTdG9yYWdl77yIbGVhZi5tYWNyb3MudjHvvIlcbiAqIC0g5q2l6aqk57G75Z6L77ya6YeN5ZG95ZCNIC8g5re75Yqg5qCH562+IC8g6K+E5YiGIC8g5aSH5rOoIC8g6L2sIFdlYlAgLyDnp7vlhaXmlofku7blpLlcbiAqIC0g5omn6KGM5aSx6LSl5Y2z5Lit5pat5bm25o+Q56S65bey5a6M5oiQ6L+b5bqm77yb5LiOIEVhZ2xlIOeahOW3ruW8gu+8muaXoOWuj+W9leWItuWZqO+8iOaJi+W3pee8luaOku+8ieOAgeaXoOWFqOWxgOW/q+aNt+mUrue7keWumlxuICovXG5pbXBvcnQgeyByZWYgfSBmcm9tICd2dWUnXG5pbXBvcnQgeyB1c2VUb2FzdCB9IGZyb20gJy4vdXNlVG9hc3QnXG5cbmV4cG9ydCB0eXBlIE1hY3JvU3RlcCA9XG4gIHwgeyB0eXBlOiAncmVuYW1lJzsgcGF0dGVybjogc3RyaW5nIH1cbiAgfCB7IHR5cGU6ICdhZGRUYWdzJzsgdGFnczogc3RyaW5nIH1cbiAgfCB7IHR5cGU6ICdyYXRpbmcnOyB2YWx1ZTogbnVtYmVyIH1cbiAgfCB7IHR5cGU6ICdkZXNjcmlwdGlvbic7IHRleHQ6IHN0cmluZyB9XG4gIHwgeyB0eXBlOiAnd2VicCcgfVxuICB8IHsgdHlwZTogJ21vdmVUb0ZvbGRlcic7IGZvbGRlcklkOiBzdHJpbmcgfVxuXG5leHBvcnQgaW50ZXJmYWNlIEFzc2V0TWFjcm8ge1xuICBpZDogc3RyaW5nXG4gIG5hbWU6IHN0cmluZ1xuICBzdGVwczogTWFjcm9TdGVwW11cbn1cblxuY29uc3QgU1RPUkFHRV9LRVkgPSAnbGVhZi5tYWNyb3MudjEnXG5cbmZ1bmN0aW9uIGxvYWQoKTogQXNzZXRNYWNyb1tdIHtcbiAgdHJ5IHtcbiAgICBjb25zdCByYXcgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShTVE9SQUdFX0tFWSlcbiAgICBjb25zdCBwYXJzZWQ6IHVua25vd24gPSByYXcgPyBKU09OLnBhcnNlKHJhdykgOiBbXVxuICAgIGlmICghQXJyYXkuaXNBcnJheShwYXJzZWQpKSByZXR1cm4gW11cbiAgICByZXR1cm4gcGFyc2VkLmZpbHRlcihcbiAgICAgIChtKTogbSBpcyBBc3NldE1hY3JvID0+XG4gICAgICAgICEhbSAmJlxuICAgICAgICB0eXBlb2YgKG0gYXMgQXNzZXRNYWNybykuaWQgPT09ICdzdHJpbmcnICYmXG4gICAgICAgIHR5cGVvZiAobSBhcyBBc3NldE1hY3JvKS5uYW1lID09PSAnc3RyaW5nJyAmJlxuICAgICAgICBBcnJheS5pc0FycmF5KChtIGFzIEFzc2V0TWFjcm8pLnN0ZXBzKVxuICAgIClcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIFtdXG4gIH1cbn1cblxuY29uc3QgbWFjcm9zID0gcmVmPEFzc2V0TWFjcm9bXT4obG9hZCgpKVxuXG5mdW5jdGlvbiBwZXJzaXN0KCk6IHZvaWQge1xuICB0cnkge1xuICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFNUT1JBR0VfS0VZLCBKU09OLnN0cmluZ2lmeShtYWNyb3MudmFsdWUpKVxuICB9IGNhdGNoIHtcbiAgICAvKiDlv73nlaUgKi9cbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdXNlQXNzZXRNYWNyb3MoKToge1xuICBtYWNyb3M6IHR5cGVvZiBtYWNyb3NcbiAgc2F2ZTogKG1hY3JvOiBBc3NldE1hY3JvKSA9PiB2b2lkXG4gIHJlbW92ZTogKGlkOiBzdHJpbmcpID0+IHZvaWRcbiAgcnVuTWFjcm86IChtYWNybzogQXNzZXRNYWNybywgaWRzOiBzdHJpbmdbXSkgPT4gUHJvbWlzZTxib29sZWFuPlxufSB7XG4gIGNvbnN0IHRvYXN0ID0gdXNlVG9hc3QoKVxuXG4gIGZ1bmN0aW9uIHNhdmUobWFjcm86IEFzc2V0TWFjcm8pOiB2b2lkIHtcbiAgICBjb25zdCBpID0gbWFjcm9zLnZhbHVlLmZpbmRJbmRleCgobSkgPT4gbS5pZCA9PT0gbWFjcm8uaWQpXG4gICAgaWYgKGkgPj0gMCkgbWFjcm9zLnZhbHVlLnNwbGljZShpLCAxLCBtYWNybylcbiAgICBlbHNlIG1hY3Jvcy52YWx1ZS5wdXNoKG1hY3JvKVxuICAgIHBlcnNpc3QoKVxuICB9XG5cbiAgZnVuY3Rpb24gcmVtb3ZlKGlkOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBtYWNyb3MudmFsdWUgPSBtYWNyb3MudmFsdWUuZmlsdGVyKChtKSA9PiBtLmlkICE9PSBpZClcbiAgICBwZXJzaXN0KClcbiAgfVxuXG4gIC8qKiDlr7npgInkuK3ntKDmnZDmjInluo/miafooYzvvJvlpLHotKXkuK3mlq3vvIzov5Tlm57mmK/lkKblhajpg6jmiJDlip8gKi9cbiAgYXN5bmMgZnVuY3Rpb24gcnVuTWFjcm8obWFjcm86IEFzc2V0TWFjcm8sIGlkczogc3RyaW5nW10pOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBpZiAoaWRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdG9hc3Qud2FybmluZygn6K+35YWI6YCJ5Lit57Sg5p2Q5YaN6L+Q6KGM5Yqo5L2cJylcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cbiAgICBjb25zdCB7IHVzZVBob3RvQWN0aW9ucyB9ID0gYXdhaXQgaW1wb3J0KCdAdmlld3MvcGhvdG9zL2NvbXBvc2FibGVzL3VzZVBob3RvQWN0aW9ucycpXG4gICAgY29uc3QgYWN0aW9ucyA9IHVzZVBob3RvQWN0aW9ucygpXG4gICAgZm9yIChjb25zdCBbaSwgc3RlcF0gb2YgbWFjcm8uc3RlcHMuZW50cmllcygpKSB7XG4gICAgICB0cnkge1xuICAgICAgICBzd2l0Y2ggKHN0ZXAudHlwZSkge1xuICAgICAgICAgIGNhc2UgJ3JlbmFtZSc6XG4gICAgICAgICAgICBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5yZW5hbWVQaG90b3MoXG4gICAgICAgICAgICAgIGlkcy5tYXAoKGlkLCBpZHgpID0+ICh7IGlkLCBwYXR0ZXJuOiBzdGVwLnBhdHRlcm4sIHN0YXJ0OiBpZHggKyAxIH0pKVxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlICdhZGRUYWdzJzoge1xuICAgICAgICAgICAgY29uc3QgdGFncyA9IHN0ZXAudGFnc1xuICAgICAgICAgICAgICAuc3BsaXQoL1tcXHMs77yM44CBXSsvKVxuICAgICAgICAgICAgICAubWFwKCh0KSA9PiB0LnRyaW0oKSlcbiAgICAgICAgICAgICAgLmZpbHRlcihCb29sZWFuKVxuICAgICAgICAgICAgZm9yIChjb25zdCB0YWcgb2YgdGFncykgYXdhaXQgYWN0aW9ucy5hZGRUYWdUb01hbnkoaWRzLCB0YWcpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIH1cbiAgICAgICAgICBjYXNlICdyYXRpbmcnOlxuICAgICAgICAgICAgYXdhaXQgYWN0aW9ucy5oYW5kbGVCYXRjaFVwZGF0ZShpZHMsIHsgcmF0aW5nOiBzdGVwLnZhbHVlIH0pXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgJ2Rlc2NyaXB0aW9uJzpcbiAgICAgICAgICAgIGF3YWl0IGFjdGlvbnMuaGFuZGxlQmF0Y2hVcGRhdGUoaWRzLCB7IGRlc2NyaXB0aW9uOiBzdGVwLnRleHQgfSlcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSAnd2VicCc6XG4gICAgICAgICAgICBhd2FpdCBhY3Rpb25zLmhhbmRsZUNvbnZlcnRUb1dlYlAoaWRzKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlICdtb3ZlVG9Gb2xkZXInOlxuICAgICAgICAgICAgYXdhaXQgd2luZG93LmFwaS5waG90b3MuYXNzaWduUGhvdG9zVG9Gb2xkZXIoc3RlcC5mb2xkZXJJZCwgaWRzKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgdG9hc3QuZXJyb3IoYOWKqOS9nOOAjCR7bWFjcm8ubmFtZX3jgI3nrKwgJHtpICsgMX0g5q2l5aSx6LSlYCwge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAoZXJyb3IgYXMgRXJyb3IpLm1lc3NhZ2VcbiAgICAgICAgfSlcbiAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICB9XG4gICAgfVxuICAgIHRvYXN0LnN1Y2Nlc3MoYOWKqOS9nOOAjCR7bWFjcm8ubmFtZX3jgI3lt7LlupTnlKjkuo4gJHtpZHMubGVuZ3RofSDpoblgKVxuICAgIHJldHVybiB0cnVlXG4gIH1cblxuICByZXR1cm4geyBtYWNyb3MsIHNhdmUsIHJlbW92ZSwgcnVuTWFjcm8gfVxufVxuIl0sIm1hcHBpbmdzIjoiQUFPQSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFnQnpCLE1BQU0sY0FBYztBQUVwQixTQUFTLE9BQXFCO0FBQzVCLE1BQUk7QUFDRixVQUFNLE1BQU0sYUFBYSxRQUFRLFdBQVc7QUFDNUMsVUFBTSxTQUFrQixNQUFNLEtBQUssTUFBTSxHQUFHLElBQUksQ0FBQztBQUNqRCxRQUFJLENBQUMsTUFBTSxRQUFRLE1BQU0sRUFBRyxRQUFPLENBQUM7QUFDcEMsV0FBTyxPQUFPO0FBQUEsTUFDWixDQUFDLE1BQ0MsQ0FBQyxDQUFDLEtBQ0YsT0FBUSxFQUFpQixPQUFPLFlBQ2hDLE9BQVEsRUFBaUIsU0FBUyxZQUNsQyxNQUFNLFFBQVMsRUFBaUIsS0FBSztBQUFBLElBQ3pDO0FBQUEsRUFDRixRQUFRO0FBQ04sV0FBTyxDQUFDO0FBQUEsRUFDVjtBQUNGO0FBRUEsTUFBTSxTQUFTLElBQWtCLEtBQUssQ0FBQztBQUV2QyxTQUFTLFVBQWdCO0FBQ3ZCLE1BQUk7QUFDRixpQkFBYSxRQUFRLGFBQWEsS0FBSyxVQUFVLE9BQU8sS0FBSyxDQUFDO0FBQUEsRUFDaEUsUUFBUTtBQUFBLEVBRVI7QUFDRjtBQUVPLGdCQUFTLGlCQUtkO0FBQ0EsUUFBTSxRQUFRLFNBQVM7QUFFdkIsV0FBUyxLQUFLLE9BQXlCO0FBQ3JDLFVBQU0sSUFBSSxPQUFPLE1BQU0sVUFBVSxDQUFDLE1BQU0sRUFBRSxPQUFPLE1BQU0sRUFBRTtBQUN6RCxRQUFJLEtBQUssRUFBRyxRQUFPLE1BQU0sT0FBTyxHQUFHLEdBQUcsS0FBSztBQUFBLFFBQ3RDLFFBQU8sTUFBTSxLQUFLLEtBQUs7QUFDNUIsWUFBUTtBQUFBLEVBQ1Y7QUFFQSxXQUFTLE9BQU8sSUFBa0I7QUFDaEMsV0FBTyxRQUFRLE9BQU8sTUFBTSxPQUFPLENBQUMsTUFBTSxFQUFFLE9BQU8sRUFBRTtBQUNyRCxZQUFRO0FBQUEsRUFDVjtBQUdBLGlCQUFlLFNBQVMsT0FBbUIsS0FBaUM7QUFDMUUsUUFBSSxJQUFJLFdBQVcsR0FBRztBQUNwQixZQUFNLFFBQVEsYUFBYTtBQUMzQixhQUFPO0FBQUEsSUFDVDtBQUNBLFVBQU0sRUFBRSxnQkFBZ0IsSUFBSSxNQUFNLE9BQU8sMkNBQTJDO0FBQ3BGLFVBQU0sVUFBVSxnQkFBZ0I7QUFDaEMsZUFBVyxDQUFDLEdBQUcsSUFBSSxLQUFLLE1BQU0sTUFBTSxRQUFRLEdBQUc7QUFDN0MsVUFBSTtBQUNGLGdCQUFRLEtBQUssTUFBTTtBQUFBLFVBQ2pCLEtBQUs7QUFDSCxrQkFBTSxPQUFPLElBQUksT0FBTztBQUFBLGNBQ3RCLElBQUksSUFBSSxDQUFDLElBQUksU0FBUyxFQUFFLElBQUksU0FBUyxLQUFLLFNBQVMsT0FBTyxNQUFNLEVBQUUsRUFBRTtBQUFBLFlBQ3RFO0FBQ0E7QUFBQSxVQUNGLEtBQUssV0FBVztBQUNkLGtCQUFNLE9BQU8sS0FBSyxLQUNmLE1BQU0sVUFBVSxFQUNoQixJQUFJLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxFQUNuQixPQUFPLE9BQU87QUFDakIsdUJBQVcsT0FBTyxLQUFNLE9BQU0sUUFBUSxhQUFhLEtBQUssR0FBRztBQUMzRDtBQUFBLFVBQ0Y7QUFBQSxVQUNBLEtBQUs7QUFDSCxrQkFBTSxRQUFRLGtCQUFrQixLQUFLLEVBQUUsUUFBUSxLQUFLLE1BQU0sQ0FBQztBQUMzRDtBQUFBLFVBQ0YsS0FBSztBQUNILGtCQUFNLFFBQVEsa0JBQWtCLEtBQUssRUFBRSxhQUFhLEtBQUssS0FBSyxDQUFDO0FBQy9EO0FBQUEsVUFDRixLQUFLO0FBQ0gsa0JBQU0sUUFBUSxvQkFBb0IsR0FBRztBQUNyQztBQUFBLFVBQ0YsS0FBSztBQUNILGtCQUFNLE9BQU8sSUFBSSxPQUFPLHFCQUFxQixLQUFLLFVBQVUsR0FBRztBQUMvRDtBQUFBLFFBQ0o7QUFBQSxNQUNGLFNBQVMsT0FBTztBQUNkLGNBQU0sTUFBTSxNQUFNLE1BQU0sSUFBSSxNQUFNLElBQUksQ0FBQyxRQUFRO0FBQUEsVUFDN0MsYUFBYyxNQUFnQjtBQUFBLFFBQ2hDLENBQUM7QUFDRCxlQUFPO0FBQUEsTUFDVDtBQUFBLElBQ0Y7QUFDQSxVQUFNLFFBQVEsTUFBTSxNQUFNLElBQUksU0FBUyxJQUFJLE1BQU0sSUFBSTtBQUNyRCxXQUFPO0FBQUEsRUFDVDtBQUVBLFNBQU8sRUFBRSxRQUFRLE1BQU0sUUFBUSxTQUFTO0FBQzFDOyIsIm5hbWVzIjpbXX0=