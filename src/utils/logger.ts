/* 2026-09-22 由 dev 缓存编译产物机械还原：类型标注已被 esbuild 剥除，import 说明符已尽量还原。过 node --check，未做运行验证。 */
import.meta.env = {"BASE_URL": "/", "DEV": true, "MODE": "development", "PROD": false, "SSR": false, "VITE_DEV_PROXY_TARGET": "http://localhost:3200", "VITE_ELEMENTS_API_BASE_URL": "/api"};const LOG_LEVEL_PRIORITY = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
const isDev = import.meta.env.MODE === "development";
const resolveInitialLogLevel = () => {
  const rawLevel = import.meta.env.VITE_LOG_LEVEL?.trim();
  if (!rawLevel) {
    return isDev ? "debug" : "error";
  }
  if (Object.keys(LOG_LEVEL_PRIORITY).includes(rawLevel)) {
    return rawLevel;
  }
  console.warn(`[logger] 未知的 VITE_LOG_LEVEL「${rawLevel}」，已回落到默认档位`);
  return isDev ? "debug" : "error";
};
let currentMinLevel = resolveInitialLogLevel();
const shouldLog = (level) => LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentMinLevel];
const formatMessage = (prefix, ...args) => {
  const timestamp = (/* @__PURE__ */ new Date()).toLocaleTimeString("zh-CN", { hour12: false });
  return [`[${timestamp}] [${prefix}]`, ...args];
};
export const logger = {
  setLevel(level) {
    currentMinLevel = level;
  },
  debug(prefix, ...args) {
    if (!shouldLog("debug")) return;
    console.debug(...formatMessage(prefix, ...args));
  },
  info(prefix, ...args) {
    if (!shouldLog("info")) return;
    console.info(...formatMessage(prefix, ...args));
  },
  warn(prefix, ...args) {
    if (!shouldLog("warn")) return;
    console.warn(...formatMessage(prefix, ...args));
  },
  error(prefix, ...args) {
    if (!shouldLog("error")) return;
    console.error(...formatMessage(prefix, ...args));
  }
};

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxvZ2dlci50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJ0eXBlIExvZ0xldmVsID0gXCJkZWJ1Z1wiIHwgXCJpbmZvXCIgfCBcIndhcm5cIiB8IFwiZXJyb3JcIlxuXG5jb25zdCBMT0dfTEVWRUxfUFJJT1JJVFk6IFJlY29yZDxMb2dMZXZlbCwgbnVtYmVyPiA9IHtcbiAgZGVidWc6IDAsXG4gIGluZm86IDEsXG4gIHdhcm46IDIsXG4gIGVycm9yOiAzLFxufVxuXG5jb25zdCBpc0RldiA9IGltcG9ydC5tZXRhLmVudi5NT0RFID09PSBcImRldmVsb3BtZW50XCJcblxuLyoqIOino+aekOWIneWni+aXpeW/l+aho+S9je+8mueOr+Wig+WPmOmHj+aLvOmUmeaXtuWbnuiQvem7mOiupOaho+W5tuaPkOekuu+8jOmBv+WFjemdmem7mOWQnuaOieWFqOmDqOaXpeW/l+OAgiAqL1xuY29uc3QgcmVzb2x2ZUluaXRpYWxMb2dMZXZlbCA9ICgpOiBMb2dMZXZlbCA9PiB7XG4gIGNvbnN0IHJhd0xldmVsID0gKGltcG9ydC5tZXRhLmVudi5WSVRFX0xPR19MRVZFTCBhcyBzdHJpbmcgfCB1bmRlZmluZWQpPy50cmltKClcblxuICBpZiAoIXJhd0xldmVsKSB7XG4gICAgcmV0dXJuIGlzRGV2ID8gXCJkZWJ1Z1wiIDogXCJlcnJvclwiXG4gIH1cblxuICBpZiAoKE9iamVjdC5rZXlzKExPR19MRVZFTF9QUklPUklUWSkgYXMgTG9nTGV2ZWxbXSkuaW5jbHVkZXMocmF3TGV2ZWwgYXMgTG9nTGV2ZWwpKSB7XG4gICAgcmV0dXJuIHJhd0xldmVsIGFzIExvZ0xldmVsXG4gIH1cblxuICBjb25zb2xlLndhcm4oYFtsb2dnZXJdIOacquefpeeahCBWSVRFX0xPR19MRVZFTOOAjCR7cmF3TGV2ZWx944CN77yM5bey5Zue6JC95Yiw6buY6K6k5qGj5L2NYClcbiAgcmV0dXJuIGlzRGV2ID8gXCJkZWJ1Z1wiIDogXCJlcnJvclwiXG59XG5cbmxldCBjdXJyZW50TWluTGV2ZWw6IExvZ0xldmVsID0gcmVzb2x2ZUluaXRpYWxMb2dMZXZlbCgpXG5cbmNvbnN0IHNob3VsZExvZyA9IChsZXZlbDogTG9nTGV2ZWwpOiBib29sZWFuID0+IExPR19MRVZFTF9QUklPUklUWVtsZXZlbF0gPj0gTE9HX0xFVkVMX1BSSU9SSVRZW2N1cnJlbnRNaW5MZXZlbF1cblxuY29uc3QgZm9ybWF0TWVzc2FnZSA9IChwcmVmaXg6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdW5rbm93bltdID0+IHtcbiAgY29uc3QgdGltZXN0YW1wID0gbmV3IERhdGUoKS50b0xvY2FsZVRpbWVTdHJpbmcoXCJ6aC1DTlwiLCB7IGhvdXIxMjogZmFsc2UgfSlcbiAgcmV0dXJuIFtgWyR7dGltZXN0YW1wfV0gWyR7cHJlZml4fV1gLCAuLi5hcmdzXVxufVxuXG5leHBvcnQgY29uc3QgbG9nZ2VyID0ge1xuICBzZXRMZXZlbChsZXZlbDogTG9nTGV2ZWwpIHtcbiAgICBjdXJyZW50TWluTGV2ZWwgPSBsZXZlbFxuICB9LFxuXG4gIGRlYnVnKHByZWZpeDogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pIHtcbiAgICBpZiAoIXNob3VsZExvZyhcImRlYnVnXCIpKSByZXR1cm5cbiAgICBjb25zb2xlLmRlYnVnKC4uLmZvcm1hdE1lc3NhZ2UocHJlZml4LCAuLi5hcmdzKSlcbiAgfSxcblxuICBpbmZvKHByZWZpeDogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pIHtcbiAgICBpZiAoIXNob3VsZExvZyhcImluZm9cIikpIHJldHVyblxuICAgIGNvbnNvbGUuaW5mbyguLi5mb3JtYXRNZXNzYWdlKHByZWZpeCwgLi4uYXJncykpXG4gIH0sXG5cbiAgd2FybihwcmVmaXg6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKSB7XG4gICAgaWYgKCFzaG91bGRMb2coXCJ3YXJuXCIpKSByZXR1cm5cbiAgICBjb25zb2xlLndhcm4oLi4uZm9ybWF0TWVzc2FnZShwcmVmaXgsIC4uLmFyZ3MpKVxuICB9LFxuXG4gIGVycm9yKHByZWZpeDogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pIHtcbiAgICBpZiAoIXNob3VsZExvZyhcImVycm9yXCIpKSByZXR1cm5cbiAgICBjb25zb2xlLmVycm9yKC4uLmZvcm1hdE1lc3NhZ2UocHJlZml4LCAuLi5hcmdzKSlcbiAgfSxcbn1cbiJdLCJtYXBwaW5ncyI6IkFBRUEsTUFBTSxxQkFBK0M7QUFBQSxFQUNuRCxPQUFPO0FBQUEsRUFDUCxNQUFNO0FBQUEsRUFDTixNQUFNO0FBQUEsRUFDTixPQUFPO0FBQ1Q7QUFFQSxNQUFNLFFBQVEsWUFBWSxJQUFJLFNBQVM7QUFHdkMsTUFBTSx5QkFBeUIsTUFBZ0I7QUFDN0MsUUFBTSxXQUFZLFlBQVksSUFBSSxnQkFBdUMsS0FBSztBQUU5RSxNQUFJLENBQUMsVUFBVTtBQUNiLFdBQU8sUUFBUSxVQUFVO0FBQUEsRUFDM0I7QUFFQSxNQUFLLE9BQU8sS0FBSyxrQkFBa0IsRUFBaUIsU0FBUyxRQUFvQixHQUFHO0FBQ2xGLFdBQU87QUFBQSxFQUNUO0FBRUEsVUFBUSxLQUFLLCtCQUErQixRQUFRLFlBQVk7QUFDaEUsU0FBTyxRQUFRLFVBQVU7QUFDM0I7QUFFQSxJQUFJLGtCQUE0Qix1QkFBdUI7QUFFdkQsTUFBTSxZQUFZLENBQUMsVUFBNkIsbUJBQW1CLEtBQUssS0FBSyxtQkFBbUIsZUFBZTtBQUUvRyxNQUFNLGdCQUFnQixDQUFDLFdBQW1CLFNBQStCO0FBQ3ZFLFFBQU0sYUFBWSxvQkFBSSxLQUFLLEdBQUUsbUJBQW1CLFNBQVMsRUFBRSxRQUFRLE1BQU0sQ0FBQztBQUMxRSxTQUFPLENBQUMsSUFBSSxTQUFTLE1BQU0sTUFBTSxLQUFLLEdBQUcsSUFBSTtBQUMvQztBQUVPLGFBQU0sU0FBUztBQUFBLEVBQ3BCLFNBQVMsT0FBaUI7QUFDeEIsc0JBQWtCO0FBQUEsRUFDcEI7QUFBQSxFQUVBLE1BQU0sV0FBbUIsTUFBaUI7QUFDeEMsUUFBSSxDQUFDLFVBQVUsT0FBTyxFQUFHO0FBQ3pCLFlBQVEsTUFBTSxHQUFHLGNBQWMsUUFBUSxHQUFHLElBQUksQ0FBQztBQUFBLEVBQ2pEO0FBQUEsRUFFQSxLQUFLLFdBQW1CLE1BQWlCO0FBQ3ZDLFFBQUksQ0FBQyxVQUFVLE1BQU0sRUFBRztBQUN4QixZQUFRLEtBQUssR0FBRyxjQUFjLFFBQVEsR0FBRyxJQUFJLENBQUM7QUFBQSxFQUNoRDtBQUFBLEVBRUEsS0FBSyxXQUFtQixNQUFpQjtBQUN2QyxRQUFJLENBQUMsVUFBVSxNQUFNLEVBQUc7QUFDeEIsWUFBUSxLQUFLLEdBQUcsY0FBYyxRQUFRLEdBQUcsSUFBSSxDQUFDO0FBQUEsRUFDaEQ7QUFBQSxFQUVBLE1BQU0sV0FBbUIsTUFBaUI7QUFDeEMsUUFBSSxDQUFDLFVBQVUsT0FBTyxFQUFHO0FBQ3pCLFlBQVEsTUFBTSxHQUFHLGNBQWMsUUFBUSxHQUFHLElBQUksQ0FBQztBQUFBLEVBQ2pEO0FBQ0Y7IiwibmFtZXMiOltdfQ==