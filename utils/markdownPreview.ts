/* 2026-09-22 由 dev-server 缓存的编译产物机械还原：非原始源码，类型标注已被 esbuild 剥除，
   import 说明符已尽量改回裸包名。过了 node --check 语法校验，未做运行验证。 */
import MarkdownIt from "markdown-it";
import __vite__cjsImport1_markdownItTaskLists from "markdown-it-task-lists"; const taskLists = __vite__cjsImport1_markdownItTaskLists.__esModule ? __vite__cjsImport1_markdownItTaskLists.default : __vite__cjsImport1_markdownItTaskLists;
import hljs from "highlight__js_lib_common";
import __vite__cjsImport3_sanitizeHtml from "sanitize-html"; const sanitizeHtml = __vite__cjsImport3_sanitizeHtml.__esModule ? __vite__cjsImport3_sanitizeHtml.default : __vite__cjsImport3_sanitizeHtml;
const SAFE_CLASS = /^(?:hljs-[a-z0-9_-]+|language-[a-z0-9+#._-]+)$/;
function pickSafeClass(attribs) {
  const next = { ...attribs };
  const kept = (attribs.class ?? "").split(/\s+/).filter((c) => SAFE_CLASS.test(c));
  if (kept.length) next.class = kept.join(" ");
  else delete next.class;
  return next;
}
const md = new MarkdownIt({
  // 允许内联 HTML：技术笔记里 <br>/<details> 常见，能不能留由下面的白名单裁决
  html: true,
  linkify: true,
  // 关掉 typographer：它把 -- 变成 –、把直引号变弯引号，代码语境里那是字面量
  typographer: false,
  breaks: false,
  highlight(code, lang) {
    if (!lang) return "";
    const target = hljs.getLanguage(lang) ? lang : void 0;
    if (!target) return "";
    try {
      return hljs.highlight(code, { language: target, ignoreIllegals: true }).value;
    } catch {
      return "";
    }
  }
});
md.use(taskLists);
const SANITIZE_OPTIONS = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    "img",
    "del",
    "ins",
    "input"
    // GFM 任务列表 checkbox
  ],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ["href", "name", "target", "title", "rel"],
    img: ["src", "srcset", "alt", "title", "width", "height", "loading"],
    code: ["class"],
    pre: ["class"],
    span: ["class"],
    input: ["type", "checked", "disabled"]
  },
  // img 允许 data:（内嵌 base64 图片在 md 中常见）；链接协议收紧
  allowedSchemesByTag: {
    img: ["http", "https", "data"],
    a: ["http", "https", "mailto"]
  },
  allowProtocolRelative: false,
  // 链接一律 _blank：https 走 setWindowOpenHandler → 系统浏览器；
  // 相对链接等会被 window-open handler 拒绝，不会把主窗口 SPA 导航走
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    span: (tag, attribs) => ({ tagName: tag, attribs: pickSafeClass(attribs) }),
    code: (tag, attribs) => ({ tagName: tag, attribs: pickSafeClass(attribs) }),
    pre: (tag, attribs) => ({ tagName: tag, attribs: pickSafeClass(attribs) })
  }
};
export function renderMarkdown(source) {
  return sanitizeHtml(md.render(source), SANITIZE_OPTIONS);
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1hcmtkb3duUHJldmlldy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIE1hcmtkb3duIOmihOiniOa4suafk++8iEY077yJ77yabWFya2Rvd24taXQg6Kej5p6QIOKGkiBoaWdobGlnaHQuanMg5LiK6ImyIOKGkiBzYW5pdGl6ZS1odG1sIOeZveWQjeWNlea4hea0l+OAglxuICpcbiAqIOS4ieWxguWQhOeuoeS4gOS7tuS6i++8jOmhuuW6j+S4jeiDveaNou+8muWJquiXjy/kuIvovb3mnaXnmoQgLm1kIOWxnuS4jeWPr+S/oei+k+WFpe+8jOa4hea0l+W/hemhu+aYr+acgOWQjuS4gOmBk+mXuFxuICog77yI5pen5a6e546w5Y+q5YmlIHNjcmlwdCDmoIfnrb7kuI4gb24qIOWxnuaAp++8jGlmcmFtZeOAgWphdmFzY3JpcHQ6IOmTvuaOpeetieWQkemHj+WFqOmDqOaUvui/h++8ieOAglxuICovXG5pbXBvcnQgTWFya2Rvd25JdCBmcm9tICdtYXJrZG93bi1pdCdcbmltcG9ydCB0YXNrTGlzdHMgZnJvbSAnbWFya2Rvd24taXQtdGFzay1saXN0cydcbmltcG9ydCBobGpzIGZyb20gJ2hpZ2hsaWdodC5qcy9saWIvY29tbW9uJ1xuaW1wb3J0IHNhbml0aXplSHRtbCBmcm9tICdzYW5pdGl6ZS1odG1sJ1xuXG4vKiog5Y+q5pS+6KGM6auY5Lqu5Zmo5LiO6K+t6KiA5qCH6K6w5Lya5Lqn55Sf55qEIGNsYXNz77yM5Yir5oqK44CM5pS75Ye76ICF5Y+v5o6n55qEIGNsYXNzIOWQjeOAjeW9k+WFjei0ueWxnuaAp+aUvui/m+adpSAqL1xuY29uc3QgU0FGRV9DTEFTUyA9IC9eKD86aGxqcy1bYS16MC05Xy1dK3xsYW5ndWFnZS1bYS16MC05KyMuXy1dKykkL1xuXG5mdW5jdGlvbiBwaWNrU2FmZUNsYXNzKGF0dHJpYnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHtcbiAgY29uc3QgbmV4dCA9IHsgLi4uYXR0cmlicyB9XG4gIGNvbnN0IGtlcHQgPSAoYXR0cmlicy5jbGFzcyA/PyAnJylcbiAgICAuc3BsaXQoL1xccysvKVxuICAgIC5maWx0ZXIoKGMpID0+IFNBRkVfQ0xBU1MudGVzdChjKSlcbiAgaWYgKGtlcHQubGVuZ3RoKSBuZXh0LmNsYXNzID0ga2VwdC5qb2luKCcgJylcbiAgZWxzZSBkZWxldGUgbmV4dC5jbGFzc1xuICByZXR1cm4gbmV4dFxufVxuXG5jb25zdCBtZCA9IG5ldyBNYXJrZG93bkl0KHtcbiAgLy8g5YWB6K645YaF6IGUIEhUTUzvvJrmioDmnK/nrJTorrDph4wgPGJyPi88ZGV0YWlscz4g5bi46KeB77yM6IO95LiN6IO955WZ55Sx5LiL6Z2i55qE55m95ZCN5Y2V6KOB5YazXG4gIGh0bWw6IHRydWUsXG4gIGxpbmtpZnk6IHRydWUsXG4gIC8vIOWFs+aOiSB0eXBvZ3JhcGhlcu+8muWug+aKiiAtLSDlj5jmiJAg4oCT44CB5oqK55u05byV5Y+35Y+Y5byv5byV5Y+377yM5Luj56CB6K+t5aKD6YeM6YKj5piv5a2X6Z2i6YePXG4gIHR5cG9ncmFwaGVyOiBmYWxzZSxcbiAgYnJlYWtzOiBmYWxzZSxcbiAgaGlnaGxpZ2h0KGNvZGUsIGxhbmcpIHtcbiAgICAvLyDov5Tlm57nqbrkuLIgPSDorqkgbWFya2Rvd24taXQg6Ieq5bex6L2s5LmJ6L6T5Ye6IDxwcmU+PGNvZGU+77yM5LiN5Zyo5q2k5aSE5o+S5omLXG4gICAgaWYgKCFsYW5nKSByZXR1cm4gJydcbiAgICBjb25zdCB0YXJnZXQgPSBobGpzLmdldExhbmd1YWdlKGxhbmcpID8gbGFuZyA6IHVuZGVmaW5lZFxuICAgIGlmICghdGFyZ2V0KSByZXR1cm4gJydcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGhsanMuaGlnaGxpZ2h0KGNvZGUsIHsgbGFuZ3VhZ2U6IHRhcmdldCwgaWdub3JlSWxsZWdhbHM6IHRydWUgfSkudmFsdWVcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiAnJ1xuICAgIH1cbiAgfVxufSlcblxuLy8gR0ZNIOS7u+WKoeWIl+ihqO+8mm1hcmtkb3duLWl0IOaguOW/g+S4jeW4pui/meadoe+8jOS4jeihpeS4iiBgLSBbeF1gIOS8mumAgOWbnue6r+aWh+acrFxuLy8g77yI5aSN6YCJ5qGG5L+d5oyBIGRpc2FibGVk4oCU4oCU6aKE6KeI5LiN5piv57yW6L6R5Zmo77yJXG5tZC51c2UodGFza0xpc3RzKVxuXG5jb25zdCBTQU5JVElaRV9PUFRJT05TOiBzYW5pdGl6ZUh0bWwuSU9wdGlvbnMgPSB7XG4gIGFsbG93ZWRUYWdzOiBbXG4gICAgLi4uc2FuaXRpemVIdG1sLmRlZmF1bHRzLmFsbG93ZWRUYWdzLFxuICAgICdpbWcnLFxuICAgICdkZWwnLFxuICAgICdpbnMnLFxuICAgICdpbnB1dCcgLy8gR0ZNIOS7u+WKoeWIl+ihqCBjaGVja2JveFxuICBdLFxuICBhbGxvd2VkQXR0cmlidXRlczoge1xuICAgIC4uLnNhbml0aXplSHRtbC5kZWZhdWx0cy5hbGxvd2VkQXR0cmlidXRlcyxcbiAgICBhOiBbJ2hyZWYnLCAnbmFtZScsICd0YXJnZXQnLCAndGl0bGUnLCAncmVsJ10sXG4gICAgaW1nOiBbJ3NyYycsICdzcmNzZXQnLCAnYWx0JywgJ3RpdGxlJywgJ3dpZHRoJywgJ2hlaWdodCcsICdsb2FkaW5nJ10sXG4gICAgY29kZTogWydjbGFzcyddLFxuICAgIHByZTogWydjbGFzcyddLFxuICAgIHNwYW46IFsnY2xhc3MnXSxcbiAgICBpbnB1dDogWyd0eXBlJywgJ2NoZWNrZWQnLCAnZGlzYWJsZWQnXVxuICB9LFxuICAvLyBpbWcg5YWB6K64IGRhdGE677yI5YaF5bWMIGJhc2U2NCDlm77niYflnKggbWQg5Lit5bi46KeB77yJ77yb6ZO+5o6l5Y2P6K6u5pS257SnXG4gIGFsbG93ZWRTY2hlbWVzQnlUYWc6IHtcbiAgICBpbWc6IFsnaHR0cCcsICdodHRwcycsICdkYXRhJ10sXG4gICAgYTogWydodHRwJywgJ2h0dHBzJywgJ21haWx0byddXG4gIH0sXG4gIGFsbG93UHJvdG9jb2xSZWxhdGl2ZTogZmFsc2UsXG4gIC8vIOmTvuaOpeS4gOW+iyBfYmxhbmvvvJpodHRwcyDotbAgc2V0V2luZG93T3BlbkhhbmRsZXIg4oaSIOezu+e7n+a1j+iniOWZqO+8m1xuICAvLyDnm7jlr7npk77mjqXnrYnkvJrooqsgd2luZG93LW9wZW4gaGFuZGxlciDmi5Lnu53vvIzkuI3kvJrmiorkuLvnqpflj6MgU1BBIOWvvOiIqui1sFxuICB0cmFuc2Zvcm1UYWdzOiB7XG4gICAgYTogc2FuaXRpemVIdG1sLnNpbXBsZVRyYW5zZm9ybSgnYScsIHsgdGFyZ2V0OiAnX2JsYW5rJywgcmVsOiAnbm9vcGVuZXIgbm9yZWZlcnJlcicgfSksXG4gICAgc3BhbjogKHRhZywgYXR0cmlicykgPT4gKHsgdGFnTmFtZTogdGFnLCBhdHRyaWJzOiBwaWNrU2FmZUNsYXNzKGF0dHJpYnMpIH0pLFxuICAgIGNvZGU6ICh0YWcsIGF0dHJpYnMpID0+ICh7IHRhZ05hbWU6IHRhZywgYXR0cmliczogcGlja1NhZmVDbGFzcyhhdHRyaWJzKSB9KSxcbiAgICBwcmU6ICh0YWcsIGF0dHJpYnMpID0+ICh7IHRhZ05hbWU6IHRhZywgYXR0cmliczogcGlja1NhZmVDbGFzcyhhdHRyaWJzKSB9KVxuICB9XG59XG5cbi8qKiDmuLLmn5MgTWFya2Rvd24g5Li65Y+v5a6J5YWoIHYtaHRtbCDnmoQgSFRNTCDniYfmrrUgKi9cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJNYXJrZG93bihzb3VyY2U6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBzYW5pdGl6ZUh0bWwobWQucmVuZGVyKHNvdXJjZSksIFNBTklUSVpFX09QVElPTlMpXG59XG4iXSwibWFwcGluZ3MiOiJBQU1BLE9BQU8sZ0JBQWdCO0FBQ3ZCLE9BQU8sZUFBZTtBQUN0QixPQUFPLFVBQVU7QUFDakIsT0FBTyxrQkFBa0I7QUFHekIsTUFBTSxhQUFhO0FBRW5CLFNBQVMsY0FBYyxTQUF5RDtBQUM5RSxRQUFNLE9BQU8sRUFBRSxHQUFHLFFBQVE7QUFDMUIsUUFBTSxRQUFRLFFBQVEsU0FBUyxJQUM1QixNQUFNLEtBQUssRUFDWCxPQUFPLENBQUMsTUFBTSxXQUFXLEtBQUssQ0FBQyxDQUFDO0FBQ25DLE1BQUksS0FBSyxPQUFRLE1BQUssUUFBUSxLQUFLLEtBQUssR0FBRztBQUFBLE1BQ3RDLFFBQU8sS0FBSztBQUNqQixTQUFPO0FBQ1Q7QUFFQSxNQUFNLEtBQUssSUFBSSxXQUFXO0FBQUE7QUFBQSxFQUV4QixNQUFNO0FBQUEsRUFDTixTQUFTO0FBQUE7QUFBQSxFQUVULGFBQWE7QUFBQSxFQUNiLFFBQVE7QUFBQSxFQUNSLFVBQVUsTUFBTSxNQUFNO0FBRXBCLFFBQUksQ0FBQyxLQUFNLFFBQU87QUFDbEIsVUFBTSxTQUFTLEtBQUssWUFBWSxJQUFJLElBQUksT0FBTztBQUMvQyxRQUFJLENBQUMsT0FBUSxRQUFPO0FBQ3BCLFFBQUk7QUFDRixhQUFPLEtBQUssVUFBVSxNQUFNLEVBQUUsVUFBVSxRQUFRLGdCQUFnQixLQUFLLENBQUMsRUFBRTtBQUFBLElBQzFFLFFBQVE7QUFDTixhQUFPO0FBQUEsSUFDVDtBQUFBLEVBQ0Y7QUFDRixDQUFDO0FBSUQsR0FBRyxJQUFJLFNBQVM7QUFFaEIsTUFBTSxtQkFBMEM7QUFBQSxFQUM5QyxhQUFhO0FBQUEsSUFDWCxHQUFHLGFBQWEsU0FBUztBQUFBLElBQ3pCO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUE7QUFBQSxFQUNGO0FBQUEsRUFDQSxtQkFBbUI7QUFBQSxJQUNqQixHQUFHLGFBQWEsU0FBUztBQUFBLElBQ3pCLEdBQUcsQ0FBQyxRQUFRLFFBQVEsVUFBVSxTQUFTLEtBQUs7QUFBQSxJQUM1QyxLQUFLLENBQUMsT0FBTyxVQUFVLE9BQU8sU0FBUyxTQUFTLFVBQVUsU0FBUztBQUFBLElBQ25FLE1BQU0sQ0FBQyxPQUFPO0FBQUEsSUFDZCxLQUFLLENBQUMsT0FBTztBQUFBLElBQ2IsTUFBTSxDQUFDLE9BQU87QUFBQSxJQUNkLE9BQU8sQ0FBQyxRQUFRLFdBQVcsVUFBVTtBQUFBLEVBQ3ZDO0FBQUE7QUFBQSxFQUVBLHFCQUFxQjtBQUFBLElBQ25CLEtBQUssQ0FBQyxRQUFRLFNBQVMsTUFBTTtBQUFBLElBQzdCLEdBQUcsQ0FBQyxRQUFRLFNBQVMsUUFBUTtBQUFBLEVBQy9CO0FBQUEsRUFDQSx1QkFBdUI7QUFBQTtBQUFBO0FBQUEsRUFHdkIsZUFBZTtBQUFBLElBQ2IsR0FBRyxhQUFhLGdCQUFnQixLQUFLLEVBQUUsUUFBUSxVQUFVLEtBQUssc0JBQXNCLENBQUM7QUFBQSxJQUNyRixNQUFNLENBQUMsS0FBSyxhQUFhLEVBQUUsU0FBUyxLQUFLLFNBQVMsY0FBYyxPQUFPLEVBQUU7QUFBQSxJQUN6RSxNQUFNLENBQUMsS0FBSyxhQUFhLEVBQUUsU0FBUyxLQUFLLFNBQVMsY0FBYyxPQUFPLEVBQUU7QUFBQSxJQUN6RSxLQUFLLENBQUMsS0FBSyxhQUFhLEVBQUUsU0FBUyxLQUFLLFNBQVMsY0FBYyxPQUFPLEVBQUU7QUFBQSxFQUMxRTtBQUNGO0FBR08sZ0JBQVMsZUFBZSxRQUF3QjtBQUNyRCxTQUFPLGFBQWEsR0FBRyxPQUFPLE1BQU0sR0FBRyxnQkFBZ0I7QUFDekQ7IiwibmFtZXMiOltdfQ==