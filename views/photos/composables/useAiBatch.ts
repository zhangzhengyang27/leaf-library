/* 2026-09-22 由 dev-server 缓存的编译产物机械还原：非原始源码，类型标注已被 esbuild 剥除，
   import 说明符已尽量改回裸包名。过了 node --check 语法校验，未做运行验证。 */
import { ref } from "vue";
import { useToast } from "/src/composables/useToast.ts";
import { useDialogs } from "/src/views/photos/composables/useDialogs.ts?t=1789890917068";
import { usePhotoData } from "/src/views/photos/composables/usePhotoData.ts?t=1789887624211";
const progress = ref(null);
let running = false;
function build() {
  const toast = useToast();
  const { requestConfirm } = useDialogs();
  const data = usePhotoData();
  function bind() {
    return window.api.ai.onBatch((p) => {
      progress.value = p.phase === "running" ? { done: p.done, total: p.total } : null;
    });
  }
  function run(ids) {
    if (running || ids.length === 0) return;
    requestConfirm(
      "AI 批量摘要与标签",
      `将对 ${ids.length} 个素材逐个调用 DeepSeek（每条一次请求，最多 200 条）。

只有带正文或 OCR 文字的素材会被处理；描述为空时才写入摘要，已有备注不覆盖；标签按同名复用、重复跑不会长重复行。`,
      "开始",
      async () => {
        running = true;
        progress.value = { done: 0, total: Math.min(ids.length, 200) };
        try {
          const r = await window.api.ai.batchMeta(ids);
          await data.loadPhotos();
          const parts = [`已生成 ${r.done} 条`];
          if (r.skipped) parts.push(`无文字跳过 ${r.skipped}`);
          if (r.failed) parts.push(`失败 ${r.failed}`);
          if (r.requested < ids.length)
            parts.push(`超上限，本次只处理 ${r.requested}/${ids.length}`);
          const used = r.tokens.prompt + r.tokens.completion;
          toast.success(parts.join(" · "), {
            description: used > 0 ? `消耗 ${used.toLocaleString()} tokens（输入 ${r.tokens.prompt.toLocaleString()} / 输出 ${r.tokens.completion.toLocaleString()}）` : void 0
          });
        } catch (error) {
          toast.error("批量摘要失败", { description: error.message });
        } finally {
          running = false;
          progress.value = null;
        }
      }
    );
  }
  return { progress, run, bind };
}
let singleton = null;
export function useAiBatch() {
  if (!singleton) singleton = build();
  return singleton;
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInVzZUFpQmF0Y2gudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBMZWFmIOe0oOadkOW6kyDCtyBBSSDmibnph4/mkZjopoHkuI7miZPmoIfvvIhEZWVwU2Vla++8jEQtMDE3IOS5i+WQjueahOiDveWKm+mdou+8iVxuICpcbiAqIOS4u+i/m+eoi+S4suihjOi3ke+8iOWNleW5tuWPkSArIDIwMCDmnaHkuIrpmZDvvInvvIzov5nph4zlj6rnrqHkuInku7bkuovvvJpcbiAqIOinpuWPkeWJjeeahOaIkOacrOehruiupOOAgei/m+W6pua1geOAgei3keWujOWIt+aWsOe0oOadkOOAglxuICovXG5pbXBvcnQgeyByZWYgfSBmcm9tICd2dWUnXG5pbXBvcnQgeyB1c2VUb2FzdCB9IGZyb20gJ0Bjb21wb3NhYmxlcy91c2VUb2FzdCdcbmltcG9ydCB7IHVzZURpYWxvZ3MgfSBmcm9tICcuL3VzZURpYWxvZ3MnXG5pbXBvcnQgeyB1c2VQaG90b0RhdGEgfSBmcm9tICcuL3VzZVBob3RvRGF0YSdcblxuY29uc3QgcHJvZ3Jlc3MgPSByZWY8eyBkb25lOiBudW1iZXI7IHRvdGFsOiBudW1iZXIgfSB8IG51bGw+KG51bGwpXG5sZXQgcnVubmluZyA9IGZhbHNlXG5cbmZ1bmN0aW9uIGJ1aWxkKCkge1xuICBjb25zdCB0b2FzdCA9IHVzZVRvYXN0KClcbiAgY29uc3QgeyByZXF1ZXN0Q29uZmlybSB9ID0gdXNlRGlhbG9ncygpXG4gIGNvbnN0IGRhdGEgPSB1c2VQaG90b0RhdGEoKVxuXG4gIC8qKiDorqLpmIXkuLvov5vnqIvov5vluqbvvIhpbmRleC52dWUg5oyC6L295pe257uR5a6a5LiA5qyh77yJICovXG4gIGZ1bmN0aW9uIGJpbmQoKTogKCkgPT4gdm9pZCB7XG4gICAgcmV0dXJuIHdpbmRvdy5hcGkuYWkub25CYXRjaCgocCkgPT4ge1xuICAgICAgcHJvZ3Jlc3MudmFsdWUgPSBwLnBoYXNlID09PSAncnVubmluZycgPyB7IGRvbmU6IHAuZG9uZSwgdG90YWw6IHAudG90YWwgfSA6IG51bGxcbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gcnVuKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICBpZiAocnVubmluZyB8fCBpZHMubGVuZ3RoID09PSAwKSByZXR1cm5cbiAgICByZXF1ZXN0Q29uZmlybShcbiAgICAgICdBSSDmibnph4/mkZjopoHkuI7moIfnrb4nLFxuICAgICAgYOWwhuWvuSAke2lkcy5sZW5ndGh9IOS4que0oOadkOmAkOS4quiwg+eUqCBEZWVwU2Vla++8iOavj+adoeS4gOasoeivt+axgu+8jOacgOWkmiAyMDAg5p2h77yJ44CCYCArXG4gICAgICAgICdcXG5cXG7lj6rmnInluKbmraPmlofmiJYgT0NSIOaWh+Wtl+eahOe0oOadkOS8muiiq+WkhOeQhu+8m+aPj+i/sOS4uuepuuaXtuaJjeWGmeWFpeaRmOimge+8jOW3suacieWkh+azqOS4jeimhueblu+8mycgK1xuICAgICAgICAn5qCH562+5oyJ5ZCM5ZCN5aSN55So44CB6YeN5aSN6LeR5LiN5Lya6ZW/6YeN5aSN6KGM44CCJyxcbiAgICAgICflvIDlp4snLFxuICAgICAgYXN5bmMgKCkgPT4ge1xuICAgICAgICBydW5uaW5nID0gdHJ1ZVxuICAgICAgICBwcm9ncmVzcy52YWx1ZSA9IHsgZG9uZTogMCwgdG90YWw6IE1hdGgubWluKGlkcy5sZW5ndGgsIDIwMCkgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHIgPSBhd2FpdCB3aW5kb3cuYXBpLmFpLmJhdGNoTWV0YShpZHMpXG4gICAgICAgICAgYXdhaXQgZGF0YS5sb2FkUGhvdG9zKClcbiAgICAgICAgICBjb25zdCBwYXJ0cyA9IFtg5bey55Sf5oiQICR7ci5kb25lfSDmnaFgXVxuICAgICAgICAgIGlmIChyLnNraXBwZWQpIHBhcnRzLnB1c2goYOaXoOaWh+Wtl+i3s+i/hyAke3Iuc2tpcHBlZH1gKVxuICAgICAgICAgIGlmIChyLmZhaWxlZCkgcGFydHMucHVzaChg5aSx6LSlICR7ci5mYWlsZWR9YClcbiAgICAgICAgICBpZiAoci5yZXF1ZXN0ZWQgPCBpZHMubGVuZ3RoKVxuICAgICAgICAgICAgcGFydHMucHVzaChg6LaF5LiK6ZmQ77yM5pys5qyh5Y+q5aSE55CGICR7ci5yZXF1ZXN0ZWR9LyR7aWRzLmxlbmd0aH1gKVxuICAgICAgICAgIC8vIHRva2VuIOaVsOaMiSBBUEkg5Zue55qEIHVzYWdlIOe0r+WKoO+8mui/meaYr+WUr+S4gOiDveWwseWcsOeci+ingeaIkOacrOeahOWcsOaWuVxuICAgICAgICAgIGNvbnN0IHVzZWQgPSByLnRva2Vucy5wcm9tcHQgKyByLnRva2Vucy5jb21wbGV0aW9uXG4gICAgICAgICAgdG9hc3Quc3VjY2VzcyhwYXJ0cy5qb2luKCcgwrcgJyksIHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICAgICB1c2VkID4gMFxuICAgICAgICAgICAgICAgID8gYOa2iOiAlyAke3VzZWQudG9Mb2NhbGVTdHJpbmcoKX0gdG9rZW5z77yI6L6T5YWlICR7ci50b2tlbnMucHJvbXB0LnRvTG9jYWxlU3RyaW5nKCl9IC8g6L6T5Ye6ICR7ci50b2tlbnMuY29tcGxldGlvbi50b0xvY2FsZVN0cmluZygpfe+8iWBcbiAgICAgICAgICAgICAgICA6IHVuZGVmaW5lZFxuICAgICAgICAgIH0pXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgdG9hc3QuZXJyb3IoJ+aJuemHj+aRmOimgeWksei0pScsIHsgZGVzY3JpcHRpb246IChlcnJvciBhcyBFcnJvcikubWVzc2FnZSB9KVxuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgIHJ1bm5pbmcgPSBmYWxzZVxuICAgICAgICAgIHByb2dyZXNzLnZhbHVlID0gbnVsbFxuICAgICAgICB9XG4gICAgICB9XG4gICAgKVxuICB9XG5cbiAgcmV0dXJuIHsgcHJvZ3Jlc3MsIHJ1biwgYmluZCB9XG59XG5cbnR5cGUgQWlCYXRjaCA9IFJldHVyblR5cGU8dHlwZW9mIGJ1aWxkPlxuXG5sZXQgc2luZ2xldG9uOiBBaUJhdGNoIHwgbnVsbCA9IG51bGxcblxuZXhwb3J0IGZ1bmN0aW9uIHVzZUFpQmF0Y2goKTogQWlCYXRjaCB7XG4gIGlmICghc2luZ2xldG9uKSBzaW5nbGV0b24gPSBidWlsZCgpXG4gIHJldHVybiBzaW5nbGV0b25cbn1cbiJdLCJtYXBwaW5ncyI6IkFBTUEsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsb0JBQW9CO0FBRTdCLE1BQU0sV0FBVyxJQUE0QyxJQUFJO0FBQ2pFLElBQUksVUFBVTtBQUVkLFNBQVMsUUFBUTtBQUNmLFFBQU0sUUFBUSxTQUFTO0FBQ3ZCLFFBQU0sRUFBRSxlQUFlLElBQUksV0FBVztBQUN0QyxRQUFNLE9BQU8sYUFBYTtBQUcxQixXQUFTLE9BQW1CO0FBQzFCLFdBQU8sT0FBTyxJQUFJLEdBQUcsUUFBUSxDQUFDLE1BQU07QUFDbEMsZUFBUyxRQUFRLEVBQUUsVUFBVSxZQUFZLEVBQUUsTUFBTSxFQUFFLE1BQU0sT0FBTyxFQUFFLE1BQU0sSUFBSTtBQUFBLElBQzlFLENBQUM7QUFBQSxFQUNIO0FBRUEsV0FBUyxJQUFJLEtBQXFCO0FBQ2hDLFFBQUksV0FBVyxJQUFJLFdBQVcsRUFBRztBQUNqQztBQUFBLE1BQ0U7QUFBQSxNQUNBLE1BQU0sSUFBSSxNQUFNO0FBQUE7QUFBQTtBQUFBLE1BR2hCO0FBQUEsTUFDQSxZQUFZO0FBQ1Ysa0JBQVU7QUFDVixpQkFBUyxRQUFRLEVBQUUsTUFBTSxHQUFHLE9BQU8sS0FBSyxJQUFJLElBQUksUUFBUSxHQUFHLEVBQUU7QUFDN0QsWUFBSTtBQUNGLGdCQUFNLElBQUksTUFBTSxPQUFPLElBQUksR0FBRyxVQUFVLEdBQUc7QUFDM0MsZ0JBQU0sS0FBSyxXQUFXO0FBQ3RCLGdCQUFNLFFBQVEsQ0FBQyxPQUFPLEVBQUUsSUFBSSxJQUFJO0FBQ2hDLGNBQUksRUFBRSxRQUFTLE9BQU0sS0FBSyxTQUFTLEVBQUUsT0FBTyxFQUFFO0FBQzlDLGNBQUksRUFBRSxPQUFRLE9BQU0sS0FBSyxNQUFNLEVBQUUsTUFBTSxFQUFFO0FBQ3pDLGNBQUksRUFBRSxZQUFZLElBQUk7QUFDcEIsa0JBQU0sS0FBSyxhQUFhLEVBQUUsU0FBUyxJQUFJLElBQUksTUFBTSxFQUFFO0FBRXJELGdCQUFNLE9BQU8sRUFBRSxPQUFPLFNBQVMsRUFBRSxPQUFPO0FBQ3hDLGdCQUFNLFFBQVEsTUFBTSxLQUFLLEtBQUssR0FBRztBQUFBLFlBQy9CLGFBQ0UsT0FBTyxJQUNILE1BQU0sS0FBSyxlQUFlLENBQUMsY0FBYyxFQUFFLE9BQU8sT0FBTyxlQUFlLENBQUMsU0FBUyxFQUFFLE9BQU8sV0FBVyxlQUFlLENBQUMsTUFDdEg7QUFBQSxVQUNSLENBQUM7QUFBQSxRQUNILFNBQVMsT0FBTztBQUNkLGdCQUFNLE1BQU0sVUFBVSxFQUFFLGFBQWMsTUFBZ0IsUUFBUSxDQUFDO0FBQUEsUUFDakUsVUFBRTtBQUNBLG9CQUFVO0FBQ1YsbUJBQVMsUUFBUTtBQUFBLFFBQ25CO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBRUEsU0FBTyxFQUFFLFVBQVUsS0FBSyxLQUFLO0FBQy9CO0FBSUEsSUFBSSxZQUE0QjtBQUV6QixnQkFBUyxhQUFzQjtBQUNwQyxNQUFJLENBQUMsVUFBVyxhQUFZLE1BQU07QUFDbEMsU0FBTztBQUNUOyIsIm5hbWVzIjpbXX0=