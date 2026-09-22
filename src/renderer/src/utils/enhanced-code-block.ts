/* 2026-09-22 由 dev-server 缓存的编译产物机械还原：非原始源码，类型标注已被 esbuild 剥除，
   import 说明符已尽量改回裸包名。过了 node --check 语法校验，未做运行验证。 */
import hljs from "highlight__js_lib_core";
import { logger } from "/src/utils/logger.ts";
import bash from "highlight__js_lib_languages_bash";
import css from "highlight__js_lib_languages_css";
import go from "highlight__js_lib_languages_go";
import java from "highlight__js_lib_languages_java";
import javascript from "highlight__js_lib_languages_javascript";
import json from "highlight__js_lib_languages_json";
import markdown from "highlight__js_lib_languages_markdown";
import plaintext from "highlight__js_lib_languages_plaintext";
import python from "highlight__js_lib_languages_python";
import sql from "highlight__js_lib_languages_sql";
import typescript from "highlight__js_lib_languages_typescript";
import xml from "highlight__js_lib_languages_xml";
import yaml from "highlight__js_lib_languages_yaml";
import { createLowlight } from "lowlight";
export const codeBlockLanguages = [
  { value: "text", label: "Plain Text", aliases: ["plain", "plaintext"] },
  { value: "bash", label: "Bash", aliases: ["shell", "sh", "zsh"] },
  { value: "javascript", label: "JavaScript", aliases: ["js", "jsx"] },
  { value: "typescript", label: "TypeScript", aliases: ["ts", "tsx"] },
  { value: "python", label: "Python", aliases: ["py"] },
  { value: "java", label: "Java" },
  { value: "go", label: "Go", aliases: ["golang"] },
  { value: "css", label: "CSS" },
  { value: "html", label: "HTML", aliases: ["xml"] },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML", aliases: ["yml"] },
  { value: "sql", label: "SQL" },
  { value: "markdown", label: "Markdown", aliases: ["md"] },
  { value: "mermaid", label: "Mermaid", aliases: ["mmd"] },
  { value: "vue", label: "Vue" }
];
const codeBlockLanguageSet = new Set(codeBlockLanguages.map((language) => language.value));
export const codeBlockThemes = [
  { value: "one-dark-pro", label: "One Dark Pro" },
  { value: "github-light", label: "GitHub Light" },
  { value: "slate", label: "Slate" }
];
export const codeBlockDefaults = {
  language: "text",
  title: null,
  theme: "one-dark-pro",
  lineNumbers: true,
  wrap: false,
  collapsed: false
};
const BOOLEAN_ATTR_NAMES = /* @__PURE__ */ new Set(["lineNumbers", "wrap", "collapsed"]);
const STRING_ATTR_NAMES = /* @__PURE__ */ new Set(["title"]);
const THEME_SET = new Set(codeBlockThemes.map((theme) => theme.value));
const registerLanguages = () => {
  if (hljs.getLanguage("bash")) {
    return;
  }
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("css", css);
  hljs.registerLanguage("go", go);
  hljs.registerLanguage("html", xml);
  hljs.registerLanguage("java", java);
  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("markdown", markdown);
  hljs.registerLanguage("plaintext", plaintext);
  hljs.registerLanguage("python", python);
  hljs.registerLanguage("sql", sql);
  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("xml", xml);
  hljs.registerLanguage("yaml", yaml);
  hljs.registerAliases(["text", "plain"], { languageName: "plaintext" });
  hljs.registerAliases(["html", "vue"], { languageName: "xml" });
  hljs.registerAliases(["js", "jsx"], { languageName: "javascript" });
  hljs.registerAliases(["ts", "tsx"], { languageName: "typescript" });
  hljs.registerAliases(["shell", "sh", "zsh"], { languageName: "bash" });
};
registerLanguages();
export const createCodeBlockLowlight = () => {
  const lowlight = createLowlight();
  lowlight.register({
    bash,
    css,
    go,
    html: xml,
    java,
    javascript,
    json,
    markdown,
    plaintext,
    python,
    sql,
    typescript,
    xml,
    yaml
  });
  lowlight.registerAlias({
    plaintext: ["text", "plain"],
    xml: ["html", "vue"],
    javascript: ["js", "jsx"],
    typescript: ["ts", "tsx"],
    bash: ["shell", "sh", "zsh"]
  });
  return lowlight;
};
export const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const normalizeBoolean = (value, fallback) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
};
const normalizeLanguage = (value) => {
  if (typeof value !== "string") {
    return codeBlockDefaults.language;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return codeBlockDefaults.language;
  }
  return normalized;
};
const normalizeTitle = (value) => {
  if (typeof value !== "string") {
    return codeBlockDefaults.title;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
};
export const normalizeCodeBlockAttrs = (input) => {
  const theme = input?.theme && THEME_SET.has(input.theme) ? input.theme : codeBlockDefaults.theme;
  return {
    language: normalizeLanguage(input?.language),
    title: normalizeTitle(input?.title),
    theme,
    lineNumbers: normalizeBoolean(input?.lineNumbers, codeBlockDefaults.lineNumbers),
    wrap: normalizeBoolean(input?.wrap, codeBlockDefaults.wrap),
    collapsed: normalizeBoolean(input?.collapsed, codeBlockDefaults.collapsed)
  };
};
const unescapeMetadataValue = (value) => value.replace(/\\(["\\])/g, "$1");
export const escapeCodeFenceMetadataValue = (value) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const parseMetadataPairs = (raw) => {
  const attrs = {};
  const pairPattern = /([A-Za-z][A-Za-z0-9]*)="((?:\\.|[^"])*)"/g;
  for (const match of raw.matchAll(pairPattern)) {
    const key = match[1];
    const value = unescapeMetadataValue(match[2] || "");
    if (BOOLEAN_ATTR_NAMES.has(key)) {
      attrs[key] = value === "true";
      continue;
    }
    if (STRING_ATTR_NAMES.has(key)) {
      attrs[key] = value;
      continue;
    }
    if (key === "theme" && THEME_SET.has(value)) {
      attrs.theme = value;
    }
  }
  return attrs;
};
export const parseCodeFenceInfo = (info) => {
  const trimmed = info.trim();
  if (!trimmed) {
    return {
      language: codeBlockDefaults.language,
      attrs: {}
    };
  }
  const languageMatch = trimmed.match(/^(\S+)/);
  const language = normalizeLanguage(languageMatch?.[1] ?? codeBlockDefaults.language);
  const metadataRaw = languageMatch ? trimmed.slice(languageMatch[0].length).trim() : trimmed;
  return {
    language,
    attrs: parseMetadataPairs(metadataRaw)
  };
};
export const stringifyCodeFenceInfo = (input) => {
  const attrs = normalizeCodeBlockAttrs(input);
  const parts = [attrs.language];
  if (attrs.title) {
    parts.push(`title="${escapeCodeFenceMetadataValue(attrs.title)}"`);
  }
  if (attrs.theme !== codeBlockDefaults.theme) {
    parts.push(`theme="${attrs.theme}"`);
  }
  if (attrs.lineNumbers !== codeBlockDefaults.lineNumbers) {
    parts.push(`lineNumbers="${String(attrs.lineNumbers)}"`);
  }
  if (attrs.wrap !== codeBlockDefaults.wrap) {
    parts.push(`wrap="${String(attrs.wrap)}"`);
  }
  if (attrs.collapsed !== codeBlockDefaults.collapsed) {
    parts.push(`collapsed="${String(attrs.collapsed)}"`);
  }
  return parts.join(" ");
};
export const getCodeLanguageLabel = (language) => {
  const normalized = normalizeLanguage(language);
  const matched = codeBlockLanguages.find((item) => {
    return item.value === normalized || item.aliases?.includes(normalized);
  });
  return matched?.label || normalized;
};
export const isKnownCodeLanguage = (language) => {
  const normalized = normalizeLanguage(language);
  return codeBlockLanguageSet.has(normalized) || Boolean(hljs.getLanguage(normalized));
};
export const getCodeBlockAttrsFromDataset = (dataset) => {
  return {
    language: dataset.language,
    title: dataset.title,
    theme: dataset.theme,
    lineNumbers: dataset.lineNumbers,
    wrap: dataset.wrap,
    collapsed: dataset.collapsed
  };
};
export const highlightCodeHtml = (code, language) => {
  const normalized = normalizeLanguage(language);
  if (normalized && normalized !== "text" && normalized !== "plaintext" && hljs.getLanguage(normalized)) {
    try {
      return hljs.highlight(code, { language: normalized, ignoreIllegals: true }).value;
    } catch (error) {
      logger.warn("enhanced-code-block", "代码高亮失败，回退为纯文本渲染。", error);
    }
  }
  return escapeHtml(code);
};
const buildLineNumbersHtml = (code) => {
  const lineCount = Math.max(1, code.split("\n").length);
  return Array.from({ length: lineCount }, (_, index) => `<span>${index + 1}</span>`).join("");
};
export const renderEnhancedCodeBlockHtml = (code, input) => {
  const attrs = normalizeCodeBlockAttrs(input);
  const languageLabel = escapeHtml(getCodeLanguageLabel(attrs.language));
  const titleLabel = escapeHtml(attrs.title || "请输入代码块名称");
  const themeLabel = escapeHtml(codeBlockThemes.find((theme) => theme.value === attrs.theme)?.label || attrs.theme);
  const highlightedHtml = highlightCodeHtml(code, attrs.language);
  const lineNumbersHtml = attrs.lineNumbers ? `<div class="kb-code-block__line-numbers">${buildLineNumbersHtml(code)}</div>` : "";
  return `<div data-type="enhanced-code-block" class="kb-code-block kb-code-block--${attrs.theme}" data-theme="${attrs.theme}" data-language="${escapeHtml(
    attrs.language
  )}" data-title="${escapeHtml(attrs.title || "")}" data-line-numbers="${String(
    attrs.lineNumbers
  )}" data-wrap="${String(attrs.wrap)}" data-collapsed="${String(
    attrs.collapsed
  )}"><div class="kb-code-block__toolbar"><div class="kb-code-block__toolbar-left"><span class="kb-code-block__caret">${attrs.collapsed ? "▶" : "▼"}</span><span class="kb-code-block__title ${attrs.title ? "" : "is-placeholder"}">${titleLabel}</span></div><div class="kb-code-block__toolbar-right"><span class="kb-code-block__badge">${languageLabel}</span><span class="kb-code-block__divider"></span><span class="kb-code-block__badge">${themeLabel}</span></div></div><div class="kb-code-block__body${attrs.collapsed ? " is-collapsed" : ""}">${lineNumbersHtml}<pre class="kb-code-block__pre"><code class="hljs language-${escapeHtml(
    attrs.language
  )}">${highlightedHtml}</code></pre></div></div>`;
};
export const enhancedCodeBlockStyles = `
.kb-code-block {
  margin: 1.25rem 0;
  overflow: hidden;
  border: 1px solid #d9d9d9;
  border-radius: 14px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
}
.kb-code-block__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px;
  font-size: 12px;
  line-height: 1;
}
.kb-code-block__toolbar-left,
.kb-code-block__toolbar-right {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}
.kb-code-block__caret {
  font-size: 11px;
  opacity: 0.8;
}
.kb-code-block__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.kb-code-block__title.is-placeholder {
  opacity: 0.62;
}
.kb-code-block__badge {
  white-space: nowrap;
}
.kb-code-block__divider {
  display: inline-block;
  width: 1px;
  height: 12px;
  opacity: 0.28;
}
.kb-code-block__body {
  display: flex;
  align-items: stretch;
}
.kb-code-block__body.is-collapsed {
  display: none;
}
.kb-code-block__line-numbers {
  display: flex;
  min-width: 48px;
  flex-direction: column;
  align-items: flex-end;
  gap: 0;
  padding: 14px 10px 14px 0;
  font: 13px/1.7 "SFMono-Regular", "JetBrains Mono", Consolas, monospace;
  user-select: none;
}
.kb-code-block__line-numbers span {
  height: 1.7em;
}
.kb-code-block__pre {
  margin: 0;
  flex: 1;
  overflow: auto;
  padding: 14px 16px 14px 0;
  background: transparent;
}
.kb-code-block__pre code {
  display: block;
  min-width: 100%;
  font: 13px/1.7 "SFMono-Regular", "JetBrains Mono", Consolas, monospace;
}
.kb-code-block__mermaid-static {
  margin: 0;
  padding: 16px;
}
.kb-code-block__mermaid-static svg {
  display: block;
  width: 100%;
  height: auto;
}
.kb-code-block__mermaid-static-error {
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 12px;
  line-height: 1.6;
}
.kb-code-block[data-language="mermaid"][data-mermaid-rendered="true"] .kb-code-block__body {
  display: none;
}
.kb-code-block[data-wrap="true"] .kb-code-block__pre code {
  white-space: pre-wrap;
  word-break: break-word;
}
.kb-code-block[data-wrap="false"] .kb-code-block__pre code {
  white-space: pre;
}
.kb-code-block--one-dark-pro {
  background: #282c34;
}
.kb-code-block--one-dark-pro .kb-code-block__toolbar {
  color: rgba(255, 255, 255, 0.88);
  background: #1f2329;
}
.kb-code-block--one-dark-pro .kb-code-block__line-numbers {
  color: rgba(171, 178, 191, 0.72);
  background: #282c34;
}
.kb-code-block--one-dark-pro .kb-code-block__pre code {
  color: #abb2bf;
}
.kb-code-block--one-dark-pro .kb-code-block__mermaid-static {
  background: linear-gradient(180deg, #f8fafc, #eef2f7);
}
.kb-code-block--one-dark-pro .kb-code-block__mermaid-static-error {
  background: rgba(245, 34, 45, 0.12);
  color: #ffccc7;
}
.kb-code-block--slate {
  background: #1f2937;
}
.kb-code-block--slate .kb-code-block__toolbar {
  color: rgba(255, 255, 255, 0.9);
  background: #0f172a;
}
.kb-code-block--slate .kb-code-block__line-numbers {
  color: rgba(148, 163, 184, 0.76);
  background: #1f2937;
}
.kb-code-block--slate .kb-code-block__pre code {
  color: #dbe4f0;
}
.kb-code-block--slate .kb-code-block__mermaid-static {
  background: linear-gradient(180deg, #f8fafc, #eef2f7);
}
.kb-code-block--slate .kb-code-block__mermaid-static-error {
  background: rgba(245, 34, 45, 0.12);
  color: #ffccc7;
}
.kb-code-block--github-light {
  background: #f8fafc;
}
.kb-code-block--github-light .kb-code-block__toolbar {
  color: rgba(0, 0, 0, 0.72);
  background: #f3f4f6;
}
.kb-code-block--github-light .kb-code-block__line-numbers {
  color: rgba(0, 0, 0, 0.38);
  background: #f8fafc;
}
.kb-code-block--github-light .kb-code-block__pre code {
  color: #1f2328;
}
.kb-code-block--github-light .kb-code-block__mermaid-static {
  background: linear-gradient(180deg, #ffffff, #f8fafc);
}
.kb-code-block--github-light .kb-code-block__mermaid-static-error {
  background: #fff1f0;
  color: #cf1322;
}
.kb-code-block .hljs-comment,
.kb-code-block .hljs-quote {
  color: #7f848e;
}
.kb-code-block .hljs-keyword,
.kb-code-block .hljs-selector-tag,
.kb-code-block .hljs-literal,
.kb-code-block .hljs-section,
.kb-code-block .hljs-link {
  color: #c678dd;
}
.kb-code-block .hljs-string,
.kb-code-block .hljs-title,
.kb-code-block .hljs-name,
.kb-code-block .hljs-attribute {
  color: #98c379;
}
.kb-code-block .hljs-number,
.kb-code-block .hljs-symbol,
.kb-code-block .hljs-bullet,
.kb-code-block .hljs-variable,
.kb-code-block .hljs-template-variable {
  color: #d19a66;
}
.kb-code-block .hljs-type,
.kb-code-block .hljs-built_in,
.kb-code-block .hljs-builtin-name {
  color: #56b6c2;
}
.kb-code-block .hljs-function,
.kb-code-block .hljs-title.function_ {
  color: #61afef;
}
.kb-code-block .hljs-emphasis {
  font-style: italic;
}
.kb-code-block .hljs-strong {
  font-weight: 700;
}
.kb-code-block--github-light .hljs-comment,
.kb-code-block--github-light .hljs-quote {
  color: #6a737d;
}
.kb-code-block--github-light .hljs-keyword,
.kb-code-block--github-light .hljs-selector-tag,
.kb-code-block--github-light .hljs-literal,
.kb-code-block--github-light .hljs-section,
.kb-code-block--github-light .hljs-link {
  color: #cf222e;
}
.kb-code-block--github-light .hljs-string,
.kb-code-block--github-light .hljs-title,
.kb-code-block--github-light .hljs-name,
.kb-code-block--github-light .hljs-attribute {
  color: #116329;
}
.kb-code-block--github-light .hljs-number,
.kb-code-block--github-light .hljs-symbol,
.kb-code-block--github-light .hljs-bullet,
.kb-code-block--github-light .hljs-variable,
.kb-code-block--github-light .hljs-template-variable {
  color: #953800;
}
.kb-code-block--github-light .hljs-type,
.kb-code-block--github-light .hljs-built_in,
.kb-code-block--github-light .hljs-builtin-name {
  color: #0550ae;
}
.kb-code-block--github-light .hljs-function,
.kb-code-block--github-light .hljs-title.function_ {
  color: #8250df;
}
`;

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImVuaGFuY2VkLWNvZGUtYmxvY2sudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqIOaPkOS+m+WinuW8uuS7o+eggeWdl+eahOWxnuaAp+e6puadn+OAgeW6j+WIl+WMluS4jumdmeaAgea4suafk+i+heWKqeiDveWKm+OAgiAqL1xuXG5pbXBvcnQgaGxqcyBmcm9tIFwiaGlnaGxpZ2h0LmpzL2xpYi9jb3JlXCJcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gXCJAL3V0aWxzL2xvZ2dlclwiXG5pbXBvcnQgYmFzaCBmcm9tIFwiaGlnaGxpZ2h0LmpzL2xpYi9sYW5ndWFnZXMvYmFzaFwiXG5pbXBvcnQgY3NzIGZyb20gXCJoaWdobGlnaHQuanMvbGliL2xhbmd1YWdlcy9jc3NcIlxuaW1wb3J0IGdvIGZyb20gXCJoaWdobGlnaHQuanMvbGliL2xhbmd1YWdlcy9nb1wiXG5pbXBvcnQgamF2YSBmcm9tIFwiaGlnaGxpZ2h0LmpzL2xpYi9sYW5ndWFnZXMvamF2YVwiXG5pbXBvcnQgamF2YXNjcmlwdCBmcm9tIFwiaGlnaGxpZ2h0LmpzL2xpYi9sYW5ndWFnZXMvamF2YXNjcmlwdFwiXG5pbXBvcnQganNvbiBmcm9tIFwiaGlnaGxpZ2h0LmpzL2xpYi9sYW5ndWFnZXMvanNvblwiXG5pbXBvcnQgbWFya2Rvd24gZnJvbSBcImhpZ2hsaWdodC5qcy9saWIvbGFuZ3VhZ2VzL21hcmtkb3duXCJcbmltcG9ydCBwbGFpbnRleHQgZnJvbSBcImhpZ2hsaWdodC5qcy9saWIvbGFuZ3VhZ2VzL3BsYWludGV4dFwiXG5pbXBvcnQgcHl0aG9uIGZyb20gXCJoaWdobGlnaHQuanMvbGliL2xhbmd1YWdlcy9weXRob25cIlxuaW1wb3J0IHNxbCBmcm9tIFwiaGlnaGxpZ2h0LmpzL2xpYi9sYW5ndWFnZXMvc3FsXCJcbmltcG9ydCB0eXBlc2NyaXB0IGZyb20gXCJoaWdobGlnaHQuanMvbGliL2xhbmd1YWdlcy90eXBlc2NyaXB0XCJcbmltcG9ydCB4bWwgZnJvbSBcImhpZ2hsaWdodC5qcy9saWIvbGFuZ3VhZ2VzL3htbFwiXG5pbXBvcnQgeWFtbCBmcm9tIFwiaGlnaGxpZ2h0LmpzL2xpYi9sYW5ndWFnZXMveWFtbFwiXG5pbXBvcnQgeyBjcmVhdGVMb3dsaWdodCB9IGZyb20gXCJsb3dsaWdodFwiXG5cbi8qKiDnuqbmnZ/ku6PnoIHlnZfmlK/mjIHnmoTkuLvpopjnmq7ogqTjgIIgKi9cbmV4cG9ydCB0eXBlIENvZGVCbG9ja1RoZW1lID0gXCJvbmUtZGFyay1wcm9cIiB8IFwiZ2l0aHViLWxpZ2h0XCIgfCBcInNsYXRlXCJcblxuLyoqIOaPj+i/sOWinuW8uuS7o+eggeWdl+WcqOaWh+aho+S4reS/neWtmOeahOWxleekuuWxnuaAp+OAgiAqL1xuZXhwb3J0IGludGVyZmFjZSBFbmhhbmNlZENvZGVCbG9ja0F0dHJzIHtcbiAgbGFuZ3VhZ2U6IHN0cmluZ1xuICB0aXRsZTogc3RyaW5nIHwgbnVsbFxuICB0aGVtZTogQ29kZUJsb2NrVGhlbWVcbiAgbGluZU51bWJlcnM6IGJvb2xlYW5cbiAgd3JhcDogYm9vbGVhblxuICBjb2xsYXBzZWQ6IGJvb2xlYW5cbn1cblxuLyoqIOaPj+i/sOS7jiBNYXJrZG93biDku6PnoIHlm7TmoI/kv6Hmga/kuLLkuK3op6PmnpDlh7rnmoTor63oqIDkuI7pmYTliqDlsZ7mgKfjgIIgKi9cbmV4cG9ydCBpbnRlcmZhY2UgUGFyc2VkQ29kZUZlbmNlSW5mbyB7XG4gIGxhbmd1YWdlOiBzdHJpbmdcbiAgYXR0cnM6IFBhcnRpYWw8RW5oYW5jZWRDb2RlQmxvY2tBdHRycz5cbn1cblxudHlwZSBDb2RlTGFuZ3VhZ2VEZWZpbml0aW9uID0ge1xuICB2YWx1ZTogc3RyaW5nXG4gIGxhYmVsOiBzdHJpbmdcbiAgYWxpYXNlcz86IHN0cmluZ1tdXG59XG5cbi8qKiDliJflh7rnvJbovpHlmajlhoXnva7mlK/mjIHnmoTku6PnoIHor63oqIDlgJnpgInpobnjgIIgKi9cbmV4cG9ydCBjb25zdCBjb2RlQmxvY2tMYW5ndWFnZXM6IENvZGVMYW5ndWFnZURlZmluaXRpb25bXSA9IFtcbiAgeyB2YWx1ZTogXCJ0ZXh0XCIsIGxhYmVsOiBcIlBsYWluIFRleHRcIiwgYWxpYXNlczogW1wicGxhaW5cIiwgXCJwbGFpbnRleHRcIl0gfSxcbiAgeyB2YWx1ZTogXCJiYXNoXCIsIGxhYmVsOiBcIkJhc2hcIiwgYWxpYXNlczogW1wic2hlbGxcIiwgXCJzaFwiLCBcInpzaFwiXSB9LFxuICB7IHZhbHVlOiBcImphdmFzY3JpcHRcIiwgbGFiZWw6IFwiSmF2YVNjcmlwdFwiLCBhbGlhc2VzOiBbXCJqc1wiLCBcImpzeFwiXSB9LFxuICB7IHZhbHVlOiBcInR5cGVzY3JpcHRcIiwgbGFiZWw6IFwiVHlwZVNjcmlwdFwiLCBhbGlhc2VzOiBbXCJ0c1wiLCBcInRzeFwiXSB9LFxuICB7IHZhbHVlOiBcInB5dGhvblwiLCBsYWJlbDogXCJQeXRob25cIiwgYWxpYXNlczogW1wicHlcIl0gfSxcbiAgeyB2YWx1ZTogXCJqYXZhXCIsIGxhYmVsOiBcIkphdmFcIiB9LFxuICB7IHZhbHVlOiBcImdvXCIsIGxhYmVsOiBcIkdvXCIsIGFsaWFzZXM6IFtcImdvbGFuZ1wiXSB9LFxuICB7IHZhbHVlOiBcImNzc1wiLCBsYWJlbDogXCJDU1NcIiB9LFxuICB7IHZhbHVlOiBcImh0bWxcIiwgbGFiZWw6IFwiSFRNTFwiLCBhbGlhc2VzOiBbXCJ4bWxcIl0gfSxcbiAgeyB2YWx1ZTogXCJqc29uXCIsIGxhYmVsOiBcIkpTT05cIiB9LFxuICB7IHZhbHVlOiBcInlhbWxcIiwgbGFiZWw6IFwiWUFNTFwiLCBhbGlhc2VzOiBbXCJ5bWxcIl0gfSxcbiAgeyB2YWx1ZTogXCJzcWxcIiwgbGFiZWw6IFwiU1FMXCIgfSxcbiAgeyB2YWx1ZTogXCJtYXJrZG93blwiLCBsYWJlbDogXCJNYXJrZG93blwiLCBhbGlhc2VzOiBbXCJtZFwiXSB9LFxuICB7IHZhbHVlOiBcIm1lcm1haWRcIiwgbGFiZWw6IFwiTWVybWFpZFwiLCBhbGlhc2VzOiBbXCJtbWRcIl0gfSxcbiAgeyB2YWx1ZTogXCJ2dWVcIiwgbGFiZWw6IFwiVnVlXCIgfSxcbl1cblxuY29uc3QgY29kZUJsb2NrTGFuZ3VhZ2VTZXQgPSBuZXcgU2V0KGNvZGVCbG9ja0xhbmd1YWdlcy5tYXAobGFuZ3VhZ2UgPT4gbGFuZ3VhZ2UudmFsdWUpKVxuXG4vKiog5YiX5Ye65aKe5by65Luj56CB5Z2X5pSv5oyB55qE5Li76aKY55qu6IKk44CCICovXG5leHBvcnQgY29uc3QgY29kZUJsb2NrVGhlbWVzOiBBcnJheTx7IHZhbHVlOiBDb2RlQmxvY2tUaGVtZTsgbGFiZWw6IHN0cmluZyB9PiA9IFtcbiAgeyB2YWx1ZTogXCJvbmUtZGFyay1wcm9cIiwgbGFiZWw6IFwiT25lIERhcmsgUHJvXCIgfSxcbiAgeyB2YWx1ZTogXCJnaXRodWItbGlnaHRcIiwgbGFiZWw6IFwiR2l0SHViIExpZ2h0XCIgfSxcbiAgeyB2YWx1ZTogXCJzbGF0ZVwiLCBsYWJlbDogXCJTbGF0ZVwiIH0sXG5dXG5cbi8qKiDmj5Dkvpvlop7lvLrku6PnoIHlnZfnmoTpu5jorqTlsZXnpLrlsZ7mgKfjgIIgKi9cbmV4cG9ydCBjb25zdCBjb2RlQmxvY2tEZWZhdWx0czogRW5oYW5jZWRDb2RlQmxvY2tBdHRycyA9IHtcbiAgbGFuZ3VhZ2U6IFwidGV4dFwiLFxuICB0aXRsZTogbnVsbCxcbiAgdGhlbWU6IFwib25lLWRhcmstcHJvXCIsXG4gIGxpbmVOdW1iZXJzOiB0cnVlLFxuICB3cmFwOiBmYWxzZSxcbiAgY29sbGFwc2VkOiBmYWxzZSxcbn1cblxuLyoqIOmcgOimgeaMieW4g+WwlOWAvOino+aekOeahOWbtOagj+WFg+aVsOaNruWtl+auteOAgiAqL1xuY29uc3QgQk9PTEVBTl9BVFRSX05BTUVTID0gbmV3IFNldDxrZXlvZiBFbmhhbmNlZENvZGVCbG9ja0F0dHJzPihbXCJsaW5lTnVtYmVyc1wiLCBcIndyYXBcIiwgXCJjb2xsYXBzZWRcIl0pXG4vKiog6ZyA6KaB5oyJ5a2X56ym5Liy6Kej5p6Q55qE5Zu05qCP5YWD5pWw5o2u5a2X5q6144CCICovXG5jb25zdCBTVFJJTkdfQVRUUl9OQU1FUyA9IG5ldyBTZXQ8a2V5b2YgRW5oYW5jZWRDb2RlQmxvY2tBdHRycz4oW1widGl0bGVcIl0pXG4vKiog55So5LqO5qCh6aqM5Li76aKY5YC85piv5ZCm5ZCI5rOV55qE6ZuG5ZCI44CCICovXG5jb25zdCBUSEVNRV9TRVQgPSBuZXcgU2V0PENvZGVCbG9ja1RoZW1lPihjb2RlQmxvY2tUaGVtZXMubWFwKHRoZW1lID0+IHRoZW1lLnZhbHVlKSlcblxuY29uc3QgcmVnaXN0ZXJMYW5ndWFnZXMgPSAoKSA9PiB7XG4gIGlmIChobGpzLmdldExhbmd1YWdlKFwiYmFzaFwiKSkge1xuICAgIHJldHVyblxuICB9XG5cbiAgaGxqcy5yZWdpc3Rlckxhbmd1YWdlKFwiYmFzaFwiLCBiYXNoKVxuICBobGpzLnJlZ2lzdGVyTGFuZ3VhZ2UoXCJjc3NcIiwgY3NzKVxuICBobGpzLnJlZ2lzdGVyTGFuZ3VhZ2UoXCJnb1wiLCBnbylcbiAgaGxqcy5yZWdpc3Rlckxhbmd1YWdlKFwiaHRtbFwiLCB4bWwpXG4gIGhsanMucmVnaXN0ZXJMYW5ndWFnZShcImphdmFcIiwgamF2YSlcbiAgaGxqcy5yZWdpc3Rlckxhbmd1YWdlKFwiamF2YXNjcmlwdFwiLCBqYXZhc2NyaXB0KVxuICBobGpzLnJlZ2lzdGVyTGFuZ3VhZ2UoXCJqc29uXCIsIGpzb24pXG4gIGhsanMucmVnaXN0ZXJMYW5ndWFnZShcIm1hcmtkb3duXCIsIG1hcmtkb3duKVxuICBobGpzLnJlZ2lzdGVyTGFuZ3VhZ2UoXCJwbGFpbnRleHRcIiwgcGxhaW50ZXh0KVxuICBobGpzLnJlZ2lzdGVyTGFuZ3VhZ2UoXCJweXRob25cIiwgcHl0aG9uKVxuICBobGpzLnJlZ2lzdGVyTGFuZ3VhZ2UoXCJzcWxcIiwgc3FsKVxuICBobGpzLnJlZ2lzdGVyTGFuZ3VhZ2UoXCJ0eXBlc2NyaXB0XCIsIHR5cGVzY3JpcHQpXG4gIGhsanMucmVnaXN0ZXJMYW5ndWFnZShcInhtbFwiLCB4bWwpXG4gIGhsanMucmVnaXN0ZXJMYW5ndWFnZShcInlhbWxcIiwgeWFtbClcblxuICBobGpzLnJlZ2lzdGVyQWxpYXNlcyhbXCJ0ZXh0XCIsIFwicGxhaW5cIl0sIHsgbGFuZ3VhZ2VOYW1lOiBcInBsYWludGV4dFwiIH0pXG4gIGhsanMucmVnaXN0ZXJBbGlhc2VzKFtcImh0bWxcIiwgXCJ2dWVcIl0sIHsgbGFuZ3VhZ2VOYW1lOiBcInhtbFwiIH0pXG4gIGhsanMucmVnaXN0ZXJBbGlhc2VzKFtcImpzXCIsIFwianN4XCJdLCB7IGxhbmd1YWdlTmFtZTogXCJqYXZhc2NyaXB0XCIgfSlcbiAgaGxqcy5yZWdpc3RlckFsaWFzZXMoW1widHNcIiwgXCJ0c3hcIl0sIHsgbGFuZ3VhZ2VOYW1lOiBcInR5cGVzY3JpcHRcIiB9KVxuICBobGpzLnJlZ2lzdGVyQWxpYXNlcyhbXCJzaGVsbFwiLCBcInNoXCIsIFwienNoXCJdLCB7IGxhbmd1YWdlTmFtZTogXCJiYXNoXCIgfSlcbn1cblxucmVnaXN0ZXJMYW5ndWFnZXMoKVxuXG4vKiog5Yib5bu65L6b57yW6L6R5Zmo6IqC54K55aSN55So55qEIGxvd2xpZ2h0IOWunuS+i+OAgiAqL1xuZXhwb3J0IGNvbnN0IGNyZWF0ZUNvZGVCbG9ja0xvd2xpZ2h0ID0gKCkgPT4ge1xuICBjb25zdCBsb3dsaWdodCA9IGNyZWF0ZUxvd2xpZ2h0KClcblxuICBsb3dsaWdodC5yZWdpc3Rlcih7XG4gICAgYmFzaCxcbiAgICBjc3MsXG4gICAgZ28sXG4gICAgaHRtbDogeG1sLFxuICAgIGphdmEsXG4gICAgamF2YXNjcmlwdCxcbiAgICBqc29uLFxuICAgIG1hcmtkb3duLFxuICAgIHBsYWludGV4dCxcbiAgICBweXRob24sXG4gICAgc3FsLFxuICAgIHR5cGVzY3JpcHQsXG4gICAgeG1sLFxuICAgIHlhbWwsXG4gIH0pXG5cbiAgbG93bGlnaHQucmVnaXN0ZXJBbGlhcyh7XG4gICAgcGxhaW50ZXh0OiBbXCJ0ZXh0XCIsIFwicGxhaW5cIl0sXG4gICAgeG1sOiBbXCJodG1sXCIsIFwidnVlXCJdLFxuICAgIGphdmFzY3JpcHQ6IFtcImpzXCIsIFwianN4XCJdLFxuICAgIHR5cGVzY3JpcHQ6IFtcInRzXCIsIFwidHN4XCJdLFxuICAgIGJhc2g6IFtcInNoZWxsXCIsIFwic2hcIiwgXCJ6c2hcIl0sXG4gIH0pXG5cbiAgcmV0dXJuIGxvd2xpZ2h0XG59XG5cbi8qKiDovazkuYkgSFRNTCDmlofmnKzkuK3nmoTkv53nlZnlrZfnrKbvvIjlhajku5PllK/kuIDlrp7njrDvvIzpnZnmgIHmuLLmn5Mv5raI5q+S5YWc5bqV5YWx55So77yJ44CCICovXG5leHBvcnQgY29uc3QgZXNjYXBlSHRtbCA9ICh2YWx1ZTogc3RyaW5nKSA9PlxuICB2YWx1ZVxuICAgIC5yZXBsYWNlKC8mL2csIFwiJmFtcDtcIilcbiAgICAucmVwbGFjZSgvPC9nLCBcIiZsdDtcIilcbiAgICAucmVwbGFjZSgvPi9nLCBcIiZndDtcIilcbiAgICAucmVwbGFjZSgvXCIvZywgXCImcXVvdDtcIilcbiAgICAucmVwbGFjZSgvJy9nLCBcIiYjMzk7XCIpXG5cbmNvbnN0IG5vcm1hbGl6ZUJvb2xlYW4gPSAodmFsdWU6IHVua25vd24sIGZhbGxiYWNrOiBib29sZWFuKSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09IFwiYm9vbGVhblwiKSB7XG4gICAgcmV0dXJuIHZhbHVlXG4gIH1cblxuICBpZiAodHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiKSB7XG4gICAgaWYgKHZhbHVlID09PSBcInRydWVcIikgcmV0dXJuIHRydWVcbiAgICBpZiAodmFsdWUgPT09IFwiZmFsc2VcIikgcmV0dXJuIGZhbHNlXG4gIH1cblxuICByZXR1cm4gZmFsbGJhY2tcbn1cblxuY29uc3Qgbm9ybWFsaXplTGFuZ3VhZ2UgPSAodmFsdWU6IHVua25vd24pID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJzdHJpbmdcIikge1xuICAgIHJldHVybiBjb2RlQmxvY2tEZWZhdWx0cy5sYW5ndWFnZVxuICB9XG5cbiAgY29uc3Qgbm9ybWFsaXplZCA9IHZhbHVlLnRyaW0oKS50b0xvd2VyQ2FzZSgpXG4gIGlmICghbm9ybWFsaXplZCkge1xuICAgIHJldHVybiBjb2RlQmxvY2tEZWZhdWx0cy5sYW5ndWFnZVxuICB9XG5cbiAgcmV0dXJuIG5vcm1hbGl6ZWRcbn1cblxuY29uc3Qgbm9ybWFsaXplVGl0bGUgPSAodmFsdWU6IHVua25vd24pID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJzdHJpbmdcIikge1xuICAgIHJldHVybiBjb2RlQmxvY2tEZWZhdWx0cy50aXRsZVxuICB9XG5cbiAgY29uc3Qgbm9ybWFsaXplZCA9IHZhbHVlLnRyaW0oKVxuICByZXR1cm4gbm9ybWFsaXplZCA/IG5vcm1hbGl6ZWQgOiBudWxsXG59XG5cbi8qKiDop4TojIPljJbku6PnoIHlnZflsZ7mgKfjgIIgKi9cbmV4cG9ydCBjb25zdCBub3JtYWxpemVDb2RlQmxvY2tBdHRycyA9IChpbnB1dD86IFBhcnRpYWw8RW5oYW5jZWRDb2RlQmxvY2tBdHRycz4gfCBudWxsKTogRW5oYW5jZWRDb2RlQmxvY2tBdHRycyA9PiB7XG4gIGNvbnN0IHRoZW1lID0gaW5wdXQ/LnRoZW1lICYmIFRIRU1FX1NFVC5oYXMoaW5wdXQudGhlbWUpID8gaW5wdXQudGhlbWUgOiBjb2RlQmxvY2tEZWZhdWx0cy50aGVtZVxuXG4gIHJldHVybiB7XG4gICAgbGFuZ3VhZ2U6IG5vcm1hbGl6ZUxhbmd1YWdlKGlucHV0Py5sYW5ndWFnZSksXG4gICAgdGl0bGU6IG5vcm1hbGl6ZVRpdGxlKGlucHV0Py50aXRsZSksXG4gICAgdGhlbWUsXG4gICAgbGluZU51bWJlcnM6IG5vcm1hbGl6ZUJvb2xlYW4oaW5wdXQ/LmxpbmVOdW1iZXJzLCBjb2RlQmxvY2tEZWZhdWx0cy5saW5lTnVtYmVycyksXG4gICAgd3JhcDogbm9ybWFsaXplQm9vbGVhbihpbnB1dD8ud3JhcCwgY29kZUJsb2NrRGVmYXVsdHMud3JhcCksXG4gICAgY29sbGFwc2VkOiBub3JtYWxpemVCb29sZWFuKGlucHV0Py5jb2xsYXBzZWQsIGNvZGVCbG9ja0RlZmF1bHRzLmNvbGxhcHNlZCksXG4gIH1cbn1cblxuY29uc3QgdW5lc2NhcGVNZXRhZGF0YVZhbHVlID0gKHZhbHVlOiBzdHJpbmcpID0+IHZhbHVlLnJlcGxhY2UoL1xcXFwoW1wiXFxcXF0pL2csIFwiJDFcIilcblxuLyoqIOi9rOS5iSBNYXJrZG93biDlm7TmoI/lhYPmlbDmja7kuK3nmoTlvJXlj7fkuI7lj43mlpzmnaDjgIIgKi9cbmV4cG9ydCBjb25zdCBlc2NhcGVDb2RlRmVuY2VNZXRhZGF0YVZhbHVlID0gKHZhbHVlOiBzdHJpbmcpID0+IHZhbHVlLnJlcGxhY2UoL1xcXFwvZywgXCJcXFxcXFxcXFwiKS5yZXBsYWNlKC9cIi9nLCAnXFxcXFwiJylcblxuY29uc3QgcGFyc2VNZXRhZGF0YVBhaXJzID0gKHJhdzogc3RyaW5nKSA9PiB7XG4gIGNvbnN0IGF0dHJzOiBQYXJ0aWFsPEVuaGFuY2VkQ29kZUJsb2NrQXR0cnM+ID0ge31cbiAgY29uc3QgcGFpclBhdHRlcm4gPSAvKFtBLVphLXpdW0EtWmEtejAtOV0qKT1cIigoPzpcXFxcLnxbXlwiXSkqKVwiL2dcblxuICBmb3IgKGNvbnN0IG1hdGNoIG9mIHJhdy5tYXRjaEFsbChwYWlyUGF0dGVybikpIHtcbiAgICBjb25zdCBrZXkgPSBtYXRjaFsxXSBhcyBrZXlvZiBFbmhhbmNlZENvZGVCbG9ja0F0dHJzXG4gICAgY29uc3QgdmFsdWUgPSB1bmVzY2FwZU1ldGFkYXRhVmFsdWUobWF0Y2hbMl0gfHwgXCJcIilcblxuICAgIGlmIChCT09MRUFOX0FUVFJfTkFNRVMuaGFzKGtleSkpIHtcbiAgICAgIGF0dHJzW2tleV0gPSAodmFsdWUgPT09IFwidHJ1ZVwiKSBhcyBuZXZlclxuICAgICAgY29udGludWVcbiAgICB9XG5cbiAgICBpZiAoU1RSSU5HX0FUVFJfTkFNRVMuaGFzKGtleSkpIHtcbiAgICAgIGF0dHJzW2tleV0gPSB2YWx1ZSBhcyBuZXZlclxuICAgICAgY29udGludWVcbiAgICB9XG5cbiAgICBpZiAoa2V5ID09PSBcInRoZW1lXCIgJiYgVEhFTUVfU0VULmhhcyh2YWx1ZSBhcyBDb2RlQmxvY2tUaGVtZSkpIHtcbiAgICAgIGF0dHJzLnRoZW1lID0gdmFsdWUgYXMgQ29kZUJsb2NrVGhlbWVcbiAgICB9XG4gIH1cblxuICByZXR1cm4gYXR0cnNcbn1cblxuLyoqIOino+aekCBNYXJrZG93biDku6PnoIHlm7TmoI/nmoTor63oqIDkuI7pmYTliqDlsZ7mgKfjgIIgKi9cbmV4cG9ydCBjb25zdCBwYXJzZUNvZGVGZW5jZUluZm8gPSAoaW5mbzogc3RyaW5nKTogUGFyc2VkQ29kZUZlbmNlSW5mbyA9PiB7XG4gIGNvbnN0IHRyaW1tZWQgPSBpbmZvLnRyaW0oKVxuICBpZiAoIXRyaW1tZWQpIHtcbiAgICByZXR1cm4ge1xuICAgICAgbGFuZ3VhZ2U6IGNvZGVCbG9ja0RlZmF1bHRzLmxhbmd1YWdlLFxuICAgICAgYXR0cnM6IHt9LFxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGxhbmd1YWdlTWF0Y2ggPSB0cmltbWVkLm1hdGNoKC9eKFxcUyspLylcbiAgY29uc3QgbGFuZ3VhZ2UgPSBub3JtYWxpemVMYW5ndWFnZShsYW5ndWFnZU1hdGNoPy5bMV0gPz8gY29kZUJsb2NrRGVmYXVsdHMubGFuZ3VhZ2UpXG4gIGNvbnN0IG1ldGFkYXRhUmF3ID0gbGFuZ3VhZ2VNYXRjaCA/IHRyaW1tZWQuc2xpY2UobGFuZ3VhZ2VNYXRjaFswXS5sZW5ndGgpLnRyaW0oKSA6IHRyaW1tZWRcblxuICByZXR1cm4ge1xuICAgIGxhbmd1YWdlLFxuICAgIGF0dHJzOiBwYXJzZU1ldGFkYXRhUGFpcnMobWV0YWRhdGFSYXcpLFxuICB9XG59XG5cbi8qKiDlsIbku6PnoIHlnZflsZ7mgKfluo/liJfljJbkuLogTWFya2Rvd24g5Zu05qCP5L+h5oGv5a2X56ym5Liy44CCICovXG5leHBvcnQgY29uc3Qgc3RyaW5naWZ5Q29kZUZlbmNlSW5mbyA9IChpbnB1dD86IFBhcnRpYWw8RW5oYW5jZWRDb2RlQmxvY2tBdHRycz4gfCBudWxsKSA9PiB7XG4gIGNvbnN0IGF0dHJzID0gbm9ybWFsaXplQ29kZUJsb2NrQXR0cnMoaW5wdXQpXG4gIGNvbnN0IHBhcnRzID0gW2F0dHJzLmxhbmd1YWdlXVxuXG4gIGlmIChhdHRycy50aXRsZSkge1xuICAgIHBhcnRzLnB1c2goYHRpdGxlPVwiJHtlc2NhcGVDb2RlRmVuY2VNZXRhZGF0YVZhbHVlKGF0dHJzLnRpdGxlKX1cImApXG4gIH1cblxuICBpZiAoYXR0cnMudGhlbWUgIT09IGNvZGVCbG9ja0RlZmF1bHRzLnRoZW1lKSB7XG4gICAgcGFydHMucHVzaChgdGhlbWU9XCIke2F0dHJzLnRoZW1lfVwiYClcbiAgfVxuXG4gIGlmIChhdHRycy5saW5lTnVtYmVycyAhPT0gY29kZUJsb2NrRGVmYXVsdHMubGluZU51bWJlcnMpIHtcbiAgICBwYXJ0cy5wdXNoKGBsaW5lTnVtYmVycz1cIiR7U3RyaW5nKGF0dHJzLmxpbmVOdW1iZXJzKX1cImApXG4gIH1cblxuICBpZiAoYXR0cnMud3JhcCAhPT0gY29kZUJsb2NrRGVmYXVsdHMud3JhcCkge1xuICAgIHBhcnRzLnB1c2goYHdyYXA9XCIke1N0cmluZyhhdHRycy53cmFwKX1cImApXG4gIH1cblxuICBpZiAoYXR0cnMuY29sbGFwc2VkICE9PSBjb2RlQmxvY2tEZWZhdWx0cy5jb2xsYXBzZWQpIHtcbiAgICBwYXJ0cy5wdXNoKGBjb2xsYXBzZWQ9XCIke1N0cmluZyhhdHRycy5jb2xsYXBzZWQpfVwiYClcbiAgfVxuXG4gIHJldHVybiBwYXJ0cy5qb2luKFwiIFwiKVxufVxuXG4vKiog6I635Y+W5Luj56CB6K+t6KiA5qCH562+44CCICovXG5leHBvcnQgY29uc3QgZ2V0Q29kZUxhbmd1YWdlTGFiZWwgPSAobGFuZ3VhZ2U6IHN0cmluZykgPT4ge1xuICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplTGFuZ3VhZ2UobGFuZ3VhZ2UpXG4gIGNvbnN0IG1hdGNoZWQgPSBjb2RlQmxvY2tMYW5ndWFnZXMuZmluZChpdGVtID0+IHtcbiAgICByZXR1cm4gaXRlbS52YWx1ZSA9PT0gbm9ybWFsaXplZCB8fCBpdGVtLmFsaWFzZXM/LmluY2x1ZGVzKG5vcm1hbGl6ZWQpXG4gIH0pXG5cbiAgcmV0dXJuIG1hdGNoZWQ/LmxhYmVsIHx8IG5vcm1hbGl6ZWRcbn1cblxuLyoqIOWIpOaWreivreiogOagh+ivhuaYr+WQpuWcqOWGhee9ruaIliBoaWdobGlnaHQuanMg6IO96K+G5Yir55qE6IyD5Zu05YaF44CCICovXG5leHBvcnQgY29uc3QgaXNLbm93bkNvZGVMYW5ndWFnZSA9IChsYW5ndWFnZTogc3RyaW5nKSA9PiB7XG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVMYW5ndWFnZShsYW5ndWFnZSlcbiAgcmV0dXJuIGNvZGVCbG9ja0xhbmd1YWdlU2V0Lmhhcyhub3JtYWxpemVkKSB8fCBCb29sZWFuKGhsanMuZ2V0TGFuZ3VhZ2Uobm9ybWFsaXplZCkpXG59XG5cbi8qKiDku44gRE9NIGRhdGFzZXQg5Lit6K+75Y+W5aKe5by65Luj56CB5Z2X5bGe5oCn44CCICovXG5leHBvcnQgY29uc3QgZ2V0Q29kZUJsb2NrQXR0cnNGcm9tRGF0YXNldCA9IChcbiAgZGF0YXNldDogRE9NU3RyaW5nTWFwIHwgUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPlxuKTogUGFydGlhbDxFbmhhbmNlZENvZGVCbG9ja0F0dHJzPiA9PiB7XG4gIHJldHVybiB7XG4gICAgbGFuZ3VhZ2U6IGRhdGFzZXQubGFuZ3VhZ2UsXG4gICAgdGl0bGU6IGRhdGFzZXQudGl0bGUsXG4gICAgdGhlbWU6IGRhdGFzZXQudGhlbWUgYXMgQ29kZUJsb2NrVGhlbWUgfCB1bmRlZmluZWQsXG4gICAgbGluZU51bWJlcnM6IGRhdGFzZXQubGluZU51bWJlcnMsXG4gICAgd3JhcDogZGF0YXNldC53cmFwLFxuICAgIGNvbGxhcHNlZDogZGF0YXNldC5jb2xsYXBzZWQsXG4gIH0gYXMgUGFydGlhbDxFbmhhbmNlZENvZGVCbG9ja0F0dHJzPlxufVxuXG4vKiog5qC55o2u6K+t6KiA6auY5Lqu5Luj56CB77yM5aSx6LSl5pe25Zue6YCA5Li657qv5paH5pysIEhUTUzjgIIgKi9cbmV4cG9ydCBjb25zdCBoaWdobGlnaHRDb2RlSHRtbCA9IChjb2RlOiBzdHJpbmcsIGxhbmd1YWdlPzogc3RyaW5nKSA9PiB7XG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVMYW5ndWFnZShsYW5ndWFnZSlcblxuICBpZiAobm9ybWFsaXplZCAmJiBub3JtYWxpemVkICE9PSBcInRleHRcIiAmJiBub3JtYWxpemVkICE9PSBcInBsYWludGV4dFwiICYmIGhsanMuZ2V0TGFuZ3VhZ2Uobm9ybWFsaXplZCkpIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGhsanMuaGlnaGxpZ2h0KGNvZGUsIHsgbGFuZ3VhZ2U6IG5vcm1hbGl6ZWQsIGlnbm9yZUlsbGVnYWxzOiB0cnVlIH0pLnZhbHVlXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci53YXJuKFwiZW5oYW5jZWQtY29kZS1ibG9ja1wiLCBcIuS7o+eggemrmOS6ruWksei0pe+8jOWbnumAgOS4uue6r+aWh+acrOa4suafk+OAglwiLCBlcnJvcilcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZXNjYXBlSHRtbChjb2RlKVxufVxuXG5jb25zdCBidWlsZExpbmVOdW1iZXJzSHRtbCA9IChjb2RlOiBzdHJpbmcpID0+IHtcbiAgY29uc3QgbGluZUNvdW50ID0gTWF0aC5tYXgoMSwgY29kZS5zcGxpdChcIlxcblwiKS5sZW5ndGgpXG4gIHJldHVybiBBcnJheS5mcm9tKHsgbGVuZ3RoOiBsaW5lQ291bnQgfSwgKF8sIGluZGV4KSA9PiBgPHNwYW4+JHtpbmRleCArIDF9PC9zcGFuPmApLmpvaW4oXCJcIilcbn1cblxuLyoqIOa4suafk+WinuW8uuS7o+eggeWdl+eahOmdmeaAgSBIVE1M44CCICovXG5leHBvcnQgY29uc3QgcmVuZGVyRW5oYW5jZWRDb2RlQmxvY2tIdG1sID0gKGNvZGU6IHN0cmluZywgaW5wdXQ/OiBQYXJ0aWFsPEVuaGFuY2VkQ29kZUJsb2NrQXR0cnM+IHwgbnVsbCkgPT4ge1xuICBjb25zdCBhdHRycyA9IG5vcm1hbGl6ZUNvZGVCbG9ja0F0dHJzKGlucHV0KVxuICBjb25zdCBsYW5ndWFnZUxhYmVsID0gZXNjYXBlSHRtbChnZXRDb2RlTGFuZ3VhZ2VMYWJlbChhdHRycy5sYW5ndWFnZSkpXG4gIGNvbnN0IHRpdGxlTGFiZWwgPSBlc2NhcGVIdG1sKGF0dHJzLnRpdGxlIHx8IFwi6K+36L6T5YWl5Luj56CB5Z2X5ZCN56ewXCIpXG4gIGNvbnN0IHRoZW1lTGFiZWwgPSBlc2NhcGVIdG1sKGNvZGVCbG9ja1RoZW1lcy5maW5kKHRoZW1lID0+IHRoZW1lLnZhbHVlID09PSBhdHRycy50aGVtZSk/LmxhYmVsIHx8IGF0dHJzLnRoZW1lKVxuICBjb25zdCBoaWdobGlnaHRlZEh0bWwgPSBoaWdobGlnaHRDb2RlSHRtbChjb2RlLCBhdHRycy5sYW5ndWFnZSlcbiAgY29uc3QgbGluZU51bWJlcnNIdG1sID0gYXR0cnMubGluZU51bWJlcnNcbiAgICA/IGA8ZGl2IGNsYXNzPVwia2ItY29kZS1ibG9ja19fbGluZS1udW1iZXJzXCI+JHtidWlsZExpbmVOdW1iZXJzSHRtbChjb2RlKX08L2Rpdj5gXG4gICAgOiBcIlwiXG5cbiAgcmV0dXJuIGA8ZGl2IGRhdGEtdHlwZT1cImVuaGFuY2VkLWNvZGUtYmxvY2tcIiBjbGFzcz1cImtiLWNvZGUtYmxvY2sga2ItY29kZS1ibG9jay0tJHthdHRycy50aGVtZX1cIiBkYXRhLXRoZW1lPVwiJHtcbiAgICBhdHRycy50aGVtZVxuICB9XCIgZGF0YS1sYW5ndWFnZT1cIiR7ZXNjYXBlSHRtbChcbiAgICBhdHRycy5sYW5ndWFnZVxuICApfVwiIGRhdGEtdGl0bGU9XCIke2VzY2FwZUh0bWwoYXR0cnMudGl0bGUgfHwgXCJcIil9XCIgZGF0YS1saW5lLW51bWJlcnM9XCIke1N0cmluZyhcbiAgICBhdHRycy5saW5lTnVtYmVyc1xuICApfVwiIGRhdGEtd3JhcD1cIiR7U3RyaW5nKGF0dHJzLndyYXApfVwiIGRhdGEtY29sbGFwc2VkPVwiJHtTdHJpbmcoXG4gICAgYXR0cnMuY29sbGFwc2VkXG4gICl9XCI+PGRpdiBjbGFzcz1cImtiLWNvZGUtYmxvY2tfX3Rvb2xiYXJcIj48ZGl2IGNsYXNzPVwia2ItY29kZS1ibG9ja19fdG9vbGJhci1sZWZ0XCI+PHNwYW4gY2xhc3M9XCJrYi1jb2RlLWJsb2NrX19jYXJldFwiPiR7XG4gICAgYXR0cnMuY29sbGFwc2VkID8gXCLilrZcIiA6IFwi4pa8XCJcbiAgfTwvc3Bhbj48c3BhbiBjbGFzcz1cImtiLWNvZGUtYmxvY2tfX3RpdGxlICR7YXR0cnMudGl0bGUgPyBcIlwiIDogXCJpcy1wbGFjZWhvbGRlclwifVwiPiR7dGl0bGVMYWJlbH08L3NwYW4+PC9kaXY+PGRpdiBjbGFzcz1cImtiLWNvZGUtYmxvY2tfX3Rvb2xiYXItcmlnaHRcIj48c3BhbiBjbGFzcz1cImtiLWNvZGUtYmxvY2tfX2JhZGdlXCI+JHtsYW5ndWFnZUxhYmVsfTwvc3Bhbj48c3BhbiBjbGFzcz1cImtiLWNvZGUtYmxvY2tfX2RpdmlkZXJcIj48L3NwYW4+PHNwYW4gY2xhc3M9XCJrYi1jb2RlLWJsb2NrX19iYWRnZVwiPiR7dGhlbWVMYWJlbH08L3NwYW4+PC9kaXY+PC9kaXY+PGRpdiBjbGFzcz1cImtiLWNvZGUtYmxvY2tfX2JvZHkke1xuICAgIGF0dHJzLmNvbGxhcHNlZCA/IFwiIGlzLWNvbGxhcHNlZFwiIDogXCJcIlxuICB9XCI+JHtsaW5lTnVtYmVyc0h0bWx9PHByZSBjbGFzcz1cImtiLWNvZGUtYmxvY2tfX3ByZVwiPjxjb2RlIGNsYXNzPVwiaGxqcyBsYW5ndWFnZS0ke2VzY2FwZUh0bWwoXG4gICAgYXR0cnMubGFuZ3VhZ2VcbiAgKX1cIj4ke2hpZ2hsaWdodGVkSHRtbH08L2NvZGU+PC9wcmU+PC9kaXY+PC9kaXY+YFxufVxuXG4vKiog5o+Q5L6b5aKe5by65Luj56CB5Z2X5a+85Ye65oiW6aKE6KeI5pe25aSN55So55qE6Z2Z5oCB5qC35byP44CCICovXG5leHBvcnQgY29uc3QgZW5oYW5jZWRDb2RlQmxvY2tTdHlsZXMgPSBgXG4ua2ItY29kZS1ibG9jayB7XG4gIG1hcmdpbjogMS4yNXJlbSAwO1xuICBvdmVyZmxvdzogaGlkZGVuO1xuICBib3JkZXI6IDFweCBzb2xpZCAjZDlkOWQ5O1xuICBib3JkZXItcmFkaXVzOiAxNHB4O1xuICBib3gtc2hhZG93OiAwIDEycHggMjhweCByZ2JhKDE1LCAyMywgNDIsIDAuMDgpO1xufVxuLmtiLWNvZGUtYmxvY2tfX3Rvb2xiYXIge1xuICBkaXNwbGF5OiBmbGV4O1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47XG4gIGdhcDogMTZweDtcbiAgcGFkZGluZzogMTBweCAxNHB4O1xuICBmb250LXNpemU6IDEycHg7XG4gIGxpbmUtaGVpZ2h0OiAxO1xufVxuLmtiLWNvZGUtYmxvY2tfX3Rvb2xiYXItbGVmdCxcbi5rYi1jb2RlLWJsb2NrX190b29sYmFyLXJpZ2h0IHtcbiAgZGlzcGxheTogZmxleDtcbiAgbWluLXdpZHRoOiAwO1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBnYXA6IDEwcHg7XG59XG4ua2ItY29kZS1ibG9ja19fY2FyZXQge1xuICBmb250LXNpemU6IDExcHg7XG4gIG9wYWNpdHk6IDAuODtcbn1cbi5rYi1jb2RlLWJsb2NrX190aXRsZSB7XG4gIG1pbi13aWR0aDogMDtcbiAgb3ZlcmZsb3c6IGhpZGRlbjtcbiAgdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7XG4gIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gIGZvbnQtd2VpZ2h0OiA1MDA7XG59XG4ua2ItY29kZS1ibG9ja19fdGl0bGUuaXMtcGxhY2Vob2xkZXIge1xuICBvcGFjaXR5OiAwLjYyO1xufVxuLmtiLWNvZGUtYmxvY2tfX2JhZGdlIHtcbiAgd2hpdGUtc3BhY2U6IG5vd3JhcDtcbn1cbi5rYi1jb2RlLWJsb2NrX19kaXZpZGVyIHtcbiAgZGlzcGxheTogaW5saW5lLWJsb2NrO1xuICB3aWR0aDogMXB4O1xuICBoZWlnaHQ6IDEycHg7XG4gIG9wYWNpdHk6IDAuMjg7XG59XG4ua2ItY29kZS1ibG9ja19fYm9keSB7XG4gIGRpc3BsYXk6IGZsZXg7XG4gIGFsaWduLWl0ZW1zOiBzdHJldGNoO1xufVxuLmtiLWNvZGUtYmxvY2tfX2JvZHkuaXMtY29sbGFwc2VkIHtcbiAgZGlzcGxheTogbm9uZTtcbn1cbi5rYi1jb2RlLWJsb2NrX19saW5lLW51bWJlcnMge1xuICBkaXNwbGF5OiBmbGV4O1xuICBtaW4td2lkdGg6IDQ4cHg7XG4gIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gIGFsaWduLWl0ZW1zOiBmbGV4LWVuZDtcbiAgZ2FwOiAwO1xuICBwYWRkaW5nOiAxNHB4IDEwcHggMTRweCAwO1xuICBmb250OiAxM3B4LzEuNyBcIlNGTW9uby1SZWd1bGFyXCIsIFwiSmV0QnJhaW5zIE1vbm9cIiwgQ29uc29sYXMsIG1vbm9zcGFjZTtcbiAgdXNlci1zZWxlY3Q6IG5vbmU7XG59XG4ua2ItY29kZS1ibG9ja19fbGluZS1udW1iZXJzIHNwYW4ge1xuICBoZWlnaHQ6IDEuN2VtO1xufVxuLmtiLWNvZGUtYmxvY2tfX3ByZSB7XG4gIG1hcmdpbjogMDtcbiAgZmxleDogMTtcbiAgb3ZlcmZsb3c6IGF1dG87XG4gIHBhZGRpbmc6IDE0cHggMTZweCAxNHB4IDA7XG4gIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xufVxuLmtiLWNvZGUtYmxvY2tfX3ByZSBjb2RlIHtcbiAgZGlzcGxheTogYmxvY2s7XG4gIG1pbi13aWR0aDogMTAwJTtcbiAgZm9udDogMTNweC8xLjcgXCJTRk1vbm8tUmVndWxhclwiLCBcIkpldEJyYWlucyBNb25vXCIsIENvbnNvbGFzLCBtb25vc3BhY2U7XG59XG4ua2ItY29kZS1ibG9ja19fbWVybWFpZC1zdGF0aWMge1xuICBtYXJnaW46IDA7XG4gIHBhZGRpbmc6IDE2cHg7XG59XG4ua2ItY29kZS1ibG9ja19fbWVybWFpZC1zdGF0aWMgc3ZnIHtcbiAgZGlzcGxheTogYmxvY2s7XG4gIHdpZHRoOiAxMDAlO1xuICBoZWlnaHQ6IGF1dG87XG59XG4ua2ItY29kZS1ibG9ja19fbWVybWFpZC1zdGF0aWMtZXJyb3Ige1xuICBib3JkZXItcmFkaXVzOiAxMnB4O1xuICBwYWRkaW5nOiAxMnB4IDE0cHg7XG4gIGZvbnQtc2l6ZTogMTJweDtcbiAgbGluZS1oZWlnaHQ6IDEuNjtcbn1cbi5rYi1jb2RlLWJsb2NrW2RhdGEtbGFuZ3VhZ2U9XCJtZXJtYWlkXCJdW2RhdGEtbWVybWFpZC1yZW5kZXJlZD1cInRydWVcIl0gLmtiLWNvZGUtYmxvY2tfX2JvZHkge1xuICBkaXNwbGF5OiBub25lO1xufVxuLmtiLWNvZGUtYmxvY2tbZGF0YS13cmFwPVwidHJ1ZVwiXSAua2ItY29kZS1ibG9ja19fcHJlIGNvZGUge1xuICB3aGl0ZS1zcGFjZTogcHJlLXdyYXA7XG4gIHdvcmQtYnJlYWs6IGJyZWFrLXdvcmQ7XG59XG4ua2ItY29kZS1ibG9ja1tkYXRhLXdyYXA9XCJmYWxzZVwiXSAua2ItY29kZS1ibG9ja19fcHJlIGNvZGUge1xuICB3aGl0ZS1zcGFjZTogcHJlO1xufVxuLmtiLWNvZGUtYmxvY2stLW9uZS1kYXJrLXBybyB7XG4gIGJhY2tncm91bmQ6ICMyODJjMzQ7XG59XG4ua2ItY29kZS1ibG9jay0tb25lLWRhcmstcHJvIC5rYi1jb2RlLWJsb2NrX190b29sYmFyIHtcbiAgY29sb3I6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC44OCk7XG4gIGJhY2tncm91bmQ6ICMxZjIzMjk7XG59XG4ua2ItY29kZS1ibG9jay0tb25lLWRhcmstcHJvIC5rYi1jb2RlLWJsb2NrX19saW5lLW51bWJlcnMge1xuICBjb2xvcjogcmdiYSgxNzEsIDE3OCwgMTkxLCAwLjcyKTtcbiAgYmFja2dyb3VuZDogIzI4MmMzNDtcbn1cbi5rYi1jb2RlLWJsb2NrLS1vbmUtZGFyay1wcm8gLmtiLWNvZGUtYmxvY2tfX3ByZSBjb2RlIHtcbiAgY29sb3I6ICNhYmIyYmY7XG59XG4ua2ItY29kZS1ibG9jay0tb25lLWRhcmstcHJvIC5rYi1jb2RlLWJsb2NrX19tZXJtYWlkLXN0YXRpYyB7XG4gIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxODBkZWcsICNmOGZhZmMsICNlZWYyZjcpO1xufVxuLmtiLWNvZGUtYmxvY2stLW9uZS1kYXJrLXBybyAua2ItY29kZS1ibG9ja19fbWVybWFpZC1zdGF0aWMtZXJyb3Ige1xuICBiYWNrZ3JvdW5kOiByZ2JhKDI0NSwgMzQsIDQ1LCAwLjEyKTtcbiAgY29sb3I6ICNmZmNjYzc7XG59XG4ua2ItY29kZS1ibG9jay0tc2xhdGUge1xuICBiYWNrZ3JvdW5kOiAjMWYyOTM3O1xufVxuLmtiLWNvZGUtYmxvY2stLXNsYXRlIC5rYi1jb2RlLWJsb2NrX190b29sYmFyIHtcbiAgY29sb3I6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC45KTtcbiAgYmFja2dyb3VuZDogIzBmMTcyYTtcbn1cbi5rYi1jb2RlLWJsb2NrLS1zbGF0ZSAua2ItY29kZS1ibG9ja19fbGluZS1udW1iZXJzIHtcbiAgY29sb3I6IHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC43Nik7XG4gIGJhY2tncm91bmQ6ICMxZjI5Mzc7XG59XG4ua2ItY29kZS1ibG9jay0tc2xhdGUgLmtiLWNvZGUtYmxvY2tfX3ByZSBjb2RlIHtcbiAgY29sb3I6ICNkYmU0ZjA7XG59XG4ua2ItY29kZS1ibG9jay0tc2xhdGUgLmtiLWNvZGUtYmxvY2tfX21lcm1haWQtc3RhdGljIHtcbiAgYmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KDE4MGRlZywgI2Y4ZmFmYywgI2VlZjJmNyk7XG59XG4ua2ItY29kZS1ibG9jay0tc2xhdGUgLmtiLWNvZGUtYmxvY2tfX21lcm1haWQtc3RhdGljLWVycm9yIHtcbiAgYmFja2dyb3VuZDogcmdiYSgyNDUsIDM0LCA0NSwgMC4xMik7XG4gIGNvbG9yOiAjZmZjY2M3O1xufVxuLmtiLWNvZGUtYmxvY2stLWdpdGh1Yi1saWdodCB7XG4gIGJhY2tncm91bmQ6ICNmOGZhZmM7XG59XG4ua2ItY29kZS1ibG9jay0tZ2l0aHViLWxpZ2h0IC5rYi1jb2RlLWJsb2NrX190b29sYmFyIHtcbiAgY29sb3I6IHJnYmEoMCwgMCwgMCwgMC43Mik7XG4gIGJhY2tncm91bmQ6ICNmM2Y0ZjY7XG59XG4ua2ItY29kZS1ibG9jay0tZ2l0aHViLWxpZ2h0IC5rYi1jb2RlLWJsb2NrX19saW5lLW51bWJlcnMge1xuICBjb2xvcjogcmdiYSgwLCAwLCAwLCAwLjM4KTtcbiAgYmFja2dyb3VuZDogI2Y4ZmFmYztcbn1cbi5rYi1jb2RlLWJsb2NrLS1naXRodWItbGlnaHQgLmtiLWNvZGUtYmxvY2tfX3ByZSBjb2RlIHtcbiAgY29sb3I6ICMxZjIzMjg7XG59XG4ua2ItY29kZS1ibG9jay0tZ2l0aHViLWxpZ2h0IC5rYi1jb2RlLWJsb2NrX19tZXJtYWlkLXN0YXRpYyB7XG4gIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxODBkZWcsICNmZmZmZmYsICNmOGZhZmMpO1xufVxuLmtiLWNvZGUtYmxvY2stLWdpdGh1Yi1saWdodCAua2ItY29kZS1ibG9ja19fbWVybWFpZC1zdGF0aWMtZXJyb3Ige1xuICBiYWNrZ3JvdW5kOiAjZmZmMWYwO1xuICBjb2xvcjogI2NmMTMyMjtcbn1cbi5rYi1jb2RlLWJsb2NrIC5obGpzLWNvbW1lbnQsXG4ua2ItY29kZS1ibG9jayAuaGxqcy1xdW90ZSB7XG4gIGNvbG9yOiAjN2Y4NDhlO1xufVxuLmtiLWNvZGUtYmxvY2sgLmhsanMta2V5d29yZCxcbi5rYi1jb2RlLWJsb2NrIC5obGpzLXNlbGVjdG9yLXRhZyxcbi5rYi1jb2RlLWJsb2NrIC5obGpzLWxpdGVyYWwsXG4ua2ItY29kZS1ibG9jayAuaGxqcy1zZWN0aW9uLFxuLmtiLWNvZGUtYmxvY2sgLmhsanMtbGluayB7XG4gIGNvbG9yOiAjYzY3OGRkO1xufVxuLmtiLWNvZGUtYmxvY2sgLmhsanMtc3RyaW5nLFxuLmtiLWNvZGUtYmxvY2sgLmhsanMtdGl0bGUsXG4ua2ItY29kZS1ibG9jayAuaGxqcy1uYW1lLFxuLmtiLWNvZGUtYmxvY2sgLmhsanMtYXR0cmlidXRlIHtcbiAgY29sb3I6ICM5OGMzNzk7XG59XG4ua2ItY29kZS1ibG9jayAuaGxqcy1udW1iZXIsXG4ua2ItY29kZS1ibG9jayAuaGxqcy1zeW1ib2wsXG4ua2ItY29kZS1ibG9jayAuaGxqcy1idWxsZXQsXG4ua2ItY29kZS1ibG9jayAuaGxqcy12YXJpYWJsZSxcbi5rYi1jb2RlLWJsb2NrIC5obGpzLXRlbXBsYXRlLXZhcmlhYmxlIHtcbiAgY29sb3I6ICNkMTlhNjY7XG59XG4ua2ItY29kZS1ibG9jayAuaGxqcy10eXBlLFxuLmtiLWNvZGUtYmxvY2sgLmhsanMtYnVpbHRfaW4sXG4ua2ItY29kZS1ibG9jayAuaGxqcy1idWlsdGluLW5hbWUge1xuICBjb2xvcjogIzU2YjZjMjtcbn1cbi5rYi1jb2RlLWJsb2NrIC5obGpzLWZ1bmN0aW9uLFxuLmtiLWNvZGUtYmxvY2sgLmhsanMtdGl0bGUuZnVuY3Rpb25fIHtcbiAgY29sb3I6ICM2MWFmZWY7XG59XG4ua2ItY29kZS1ibG9jayAuaGxqcy1lbXBoYXNpcyB7XG4gIGZvbnQtc3R5bGU6IGl0YWxpYztcbn1cbi5rYi1jb2RlLWJsb2NrIC5obGpzLXN0cm9uZyB7XG4gIGZvbnQtd2VpZ2h0OiA3MDA7XG59XG4ua2ItY29kZS1ibG9jay0tZ2l0aHViLWxpZ2h0IC5obGpzLWNvbW1lbnQsXG4ua2ItY29kZS1ibG9jay0tZ2l0aHViLWxpZ2h0IC5obGpzLXF1b3RlIHtcbiAgY29sb3I6ICM2YTczN2Q7XG59XG4ua2ItY29kZS1ibG9jay0tZ2l0aHViLWxpZ2h0IC5obGpzLWtleXdvcmQsXG4ua2ItY29kZS1ibG9jay0tZ2l0aHViLWxpZ2h0IC5obGpzLXNlbGVjdG9yLXRhZyxcbi5rYi1jb2RlLWJsb2NrLS1naXRodWItbGlnaHQgLmhsanMtbGl0ZXJhbCxcbi5rYi1jb2RlLWJsb2NrLS1naXRodWItbGlnaHQgLmhsanMtc2VjdGlvbixcbi5rYi1jb2RlLWJsb2NrLS1naXRodWItbGlnaHQgLmhsanMtbGluayB7XG4gIGNvbG9yOiAjY2YyMjJlO1xufVxuLmtiLWNvZGUtYmxvY2stLWdpdGh1Yi1saWdodCAuaGxqcy1zdHJpbmcsXG4ua2ItY29kZS1ibG9jay0tZ2l0aHViLWxpZ2h0IC5obGpzLXRpdGxlLFxuLmtiLWNvZGUtYmxvY2stLWdpdGh1Yi1saWdodCAuaGxqcy1uYW1lLFxuLmtiLWNvZGUtYmxvY2stLWdpdGh1Yi1saWdodCAuaGxqcy1hdHRyaWJ1dGUge1xuICBjb2xvcjogIzExNjMyOTtcbn1cbi5rYi1jb2RlLWJsb2NrLS1naXRodWItbGlnaHQgLmhsanMtbnVtYmVyLFxuLmtiLWNvZGUtYmxvY2stLWdpdGh1Yi1saWdodCAuaGxqcy1zeW1ib2wsXG4ua2ItY29kZS1ibG9jay0tZ2l0aHViLWxpZ2h0IC5obGpzLWJ1bGxldCxcbi5rYi1jb2RlLWJsb2NrLS1naXRodWItbGlnaHQgLmhsanMtdmFyaWFibGUsXG4ua2ItY29kZS1ibG9jay0tZ2l0aHViLWxpZ2h0IC5obGpzLXRlbXBsYXRlLXZhcmlhYmxlIHtcbiAgY29sb3I6ICM5NTM4MDA7XG59XG4ua2ItY29kZS1ibG9jay0tZ2l0aHViLWxpZ2h0IC5obGpzLXR5cGUsXG4ua2ItY29kZS1ibG9jay0tZ2l0aHViLWxpZ2h0IC5obGpzLWJ1aWx0X2luLFxuLmtiLWNvZGUtYmxvY2stLWdpdGh1Yi1saWdodCAuaGxqcy1idWlsdGluLW5hbWUge1xuICBjb2xvcjogIzA1NTBhZTtcbn1cbi5rYi1jb2RlLWJsb2NrLS1naXRodWItbGlnaHQgLmhsanMtZnVuY3Rpb24sXG4ua2ItY29kZS1ibG9jay0tZ2l0aHViLWxpZ2h0IC5obGpzLXRpdGxlLmZ1bmN0aW9uXyB7XG4gIGNvbG9yOiAjODI1MGRmO1xufVxuYFxuIl0sIm1hcHBpbmdzIjoiQUFFQSxPQUFPLFVBQVU7QUFDakIsU0FBUyxjQUFjO0FBQ3ZCLE9BQU8sVUFBVTtBQUNqQixPQUFPLFNBQVM7QUFDaEIsT0FBTyxRQUFRO0FBQ2YsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sZ0JBQWdCO0FB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O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7IiwibmFtZXMiOltdfQ==