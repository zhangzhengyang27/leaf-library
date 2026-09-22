/* 2026-09-22 由 dev 缓存编译产物机械还原：类型标注已被 esbuild 剥除，import 说明符已尽量还原。过 node --check，未做运行验证。 */
const parseHtmlDocument = (source) => {
  if (typeof DOMParser === "undefined") {
    return null;
  }
  return new DOMParser().parseFromString(source, "text/html");
};
export const extractDocumentOutline = (content, scheme, prefix = "outline") => {
  const source = content.trim();
  if (!source) {
    return [];
  }
  if (scheme === "text/html") {
    const documentNode = parseHtmlDocument(source);
    const headings = Array.from(documentNode?.querySelectorAll("h1, h2, h3, h4") ?? []);
    return headings.map((node, index) => ({
      id: `${prefix}-${index + 1}`,
      text: node.textContent?.trim() || "",
      depth: Math.max(0, Number(node.tagName.slice(1)) - 1)
    })).filter((item) => Boolean(item.text));
  }
  const lines = source.split(/\r?\n/);
  const items = [];
  let inCodeBlock = false;
  lines.forEach((line) => {
    if (/^```/.test(line.trim())) {
      inCodeBlock = !inCodeBlock;
      return;
    }
    if (inCodeBlock) {
      return;
    }
    const matched = line.match(/^(#{1,4})\s+(.+)$/);
    if (!matched) {
      return;
    }
    const [, headingMarks, headingText] = matched;
    if (!headingMarks || !headingText) {
      return;
    }
    items.push({
      id: `${prefix}-${items.length + 1}`,
      text: headingText.trim(),
      depth: headingMarks.length - 1
    });
  });
  return items;
};
export const extractDocumentPlainText = (content, scheme) => {
  const source = content.trim();
  if (!source) {
    return "";
  }
  if (scheme === "text/html") {
    const documentNode = parseHtmlDocument(source);
    return documentNode?.body.textContent?.replace(/\s+/g, " ").trim() || "";
  }
  return source.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ").replace(/!\[[^\]]*]\([^)]*\)/g, " ").replace(/\[([^\]]*)]\([^)]*\)/g, "$1").replace(/[#>*_\-~]/g, " ").replace(/\s+/g, " ").trim();
};

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImRvY3VtZW50LWNvbnRlbnQtbWV0YWRhdGEudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqIOaPkOS+m+aWh+aho+WGheWuueWFg+aVsOaNruebuOWFs+W3peWFt+WHveaVsOS4jui+heWKqemFjee9ruOAgiAqL1xuZXhwb3J0IHR5cGUgRG9jdW1lbnRDb250ZW50U2NoZW1lID0gXCJ0ZXh0L21hcmtkb3duXCIgfCBcInRleHQvaHRtbFwiXG5cbi8qKiDmj4/ov7DmlofmoaPlpKfnurLkuK3nmoTljZXkuKrmoIfpopjmnaHnm67jgIIgKi9cbmV4cG9ydCB0eXBlIERvY3VtZW50T3V0bGluZUl0ZW0gPSB7XG4gIGlkOiBzdHJpbmdcbiAgdGV4dDogc3RyaW5nXG4gIGRlcHRoOiBudW1iZXJcbn1cblxuY29uc3QgcGFyc2VIdG1sRG9jdW1lbnQgPSAoc291cmNlOiBzdHJpbmcpID0+IHtcbiAgaWYgKHR5cGVvZiBET01QYXJzZXIgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgcmV0dXJuIG5ldyBET01QYXJzZXIoKS5wYXJzZUZyb21TdHJpbmcoc291cmNlLCBcInRleHQvaHRtbFwiKVxufVxuXG4vKiog5o+Q5Y+W5paH5qGj5aSn57qy44CCICovXG5leHBvcnQgY29uc3QgZXh0cmFjdERvY3VtZW50T3V0bGluZSA9IChcbiAgY29udGVudDogc3RyaW5nLFxuICBzY2hlbWU6IERvY3VtZW50Q29udGVudFNjaGVtZSxcbiAgcHJlZml4ID0gXCJvdXRsaW5lXCJcbik6IERvY3VtZW50T3V0bGluZUl0ZW1bXSA9PiB7XG4gIGNvbnN0IHNvdXJjZSA9IGNvbnRlbnQudHJpbSgpXG5cbiAgaWYgKCFzb3VyY2UpIHtcbiAgICByZXR1cm4gW11cbiAgfVxuXG4gIGlmIChzY2hlbWUgPT09IFwidGV4dC9odG1sXCIpIHtcbiAgICBjb25zdCBkb2N1bWVudE5vZGUgPSBwYXJzZUh0bWxEb2N1bWVudChzb3VyY2UpXG4gICAgY29uc3QgaGVhZGluZ3MgPSBBcnJheS5mcm9tKGRvY3VtZW50Tm9kZT8ucXVlcnlTZWxlY3RvckFsbChcImgxLCBoMiwgaDMsIGg0XCIpID8/IFtdKVxuXG4gICAgcmV0dXJuIGhlYWRpbmdzXG4gICAgICAubWFwKChub2RlLCBpbmRleCkgPT4gKHtcbiAgICAgICAgaWQ6IGAke3ByZWZpeH0tJHtpbmRleCArIDF9YCxcbiAgICAgICAgdGV4dDogbm9kZS50ZXh0Q29udGVudD8udHJpbSgpIHx8IFwiXCIsXG4gICAgICAgIGRlcHRoOiBNYXRoLm1heCgwLCBOdW1iZXIobm9kZS50YWdOYW1lLnNsaWNlKDEpKSAtIDEpLFxuICAgICAgfSkpXG4gICAgICAuZmlsdGVyKGl0ZW0gPT4gQm9vbGVhbihpdGVtLnRleHQpKVxuICB9XG5cbiAgY29uc3QgbGluZXMgPSBzb3VyY2Uuc3BsaXQoL1xccj9cXG4vKVxuICBjb25zdCBpdGVtczogRG9jdW1lbnRPdXRsaW5lSXRlbVtdID0gW11cbiAgbGV0IGluQ29kZUJsb2NrID0gZmFsc2VcblxuICBsaW5lcy5mb3JFYWNoKGxpbmUgPT4ge1xuICAgIGlmICgvXmBgYC8udGVzdChsaW5lLnRyaW0oKSkpIHtcbiAgICAgIGluQ29kZUJsb2NrID0gIWluQ29kZUJsb2NrXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBpZiAoaW5Db2RlQmxvY2spIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNvbnN0IG1hdGNoZWQgPSBsaW5lLm1hdGNoKC9eKCN7MSw0fSlcXHMrKC4rKSQvKVxuXG4gICAgaWYgKCFtYXRjaGVkKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCBbLCBoZWFkaW5nTWFya3MsIGhlYWRpbmdUZXh0XSA9IG1hdGNoZWRcblxuICAgIGlmICghaGVhZGluZ01hcmtzIHx8ICFoZWFkaW5nVGV4dCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgaXRlbXMucHVzaCh7XG4gICAgICBpZDogYCR7cHJlZml4fS0ke2l0ZW1zLmxlbmd0aCArIDF9YCxcbiAgICAgIHRleHQ6IGhlYWRpbmdUZXh0LnRyaW0oKSxcbiAgICAgIGRlcHRoOiBoZWFkaW5nTWFya3MubGVuZ3RoIC0gMSxcbiAgICB9KVxuICB9KVxuXG4gIHJldHVybiBpdGVtc1xufVxuXG4vKiog5o+Q5Y+W5paH5qGj5YaF5a655a+55bqU55qE57qv5paH5pys54mI5pys44CCICovXG5leHBvcnQgY29uc3QgZXh0cmFjdERvY3VtZW50UGxhaW5UZXh0ID0gKGNvbnRlbnQ6IHN0cmluZywgc2NoZW1lOiBEb2N1bWVudENvbnRlbnRTY2hlbWUpID0+IHtcbiAgY29uc3Qgc291cmNlID0gY29udGVudC50cmltKClcblxuICBpZiAoIXNvdXJjZSkge1xuICAgIHJldHVybiBcIlwiXG4gIH1cblxuICBpZiAoc2NoZW1lID09PSBcInRleHQvaHRtbFwiKSB7XG4gICAgY29uc3QgZG9jdW1lbnROb2RlID0gcGFyc2VIdG1sRG9jdW1lbnQoc291cmNlKVxuICAgIHJldHVybiBkb2N1bWVudE5vZGU/LmJvZHkudGV4dENvbnRlbnQ/LnJlcGxhY2UoL1xccysvZywgXCIgXCIpLnRyaW0oKSB8fCBcIlwiXG4gIH1cblxuICByZXR1cm4gc291cmNlXG4gICAgLnJlcGxhY2UoL2BgYFtcXHNcXFNdKj9gYGAvZywgXCIgXCIpXG4gICAgLnJlcGxhY2UoL2BbXmBdKmAvZywgXCIgXCIpXG4gICAgLnJlcGxhY2UoLyFcXFtbXlxcXV0qXVxcKFteKV0qXFwpL2csIFwiIFwiKVxuICAgIC5yZXBsYWNlKC9cXFsoW15cXF1dKildXFwoW14pXSpcXCkvZywgXCIkMVwiKVxuICAgIC5yZXBsYWNlKC9bIz4qX1xcLX5dL2csIFwiIFwiKVxuICAgIC5yZXBsYWNlKC9cXHMrL2csIFwiIFwiKVxuICAgIC50cmltKClcbn1cbiJdLCJtYXBwaW5ncyI6IkFBVUEsTUFBTSxvQkFBb0IsQ0FBQyxXQUFtQjtBQUM1QyxNQUFJLE9BQU8sY0FBYyxhQUFhO0FBQ3BDLFdBQU87QUFBQSxFQUNUO0FBRUEsU0FBTyxJQUFJLFVBQVUsRUFBRSxnQkFBZ0IsUUFBUSxXQUFXO0FBQzVEO0FBR08sYUFBTSx5QkFBeUIsQ0FDcEMsU0FDQSxRQUNBLFNBQVMsY0FDaUI7QUFDMUIsUUFBTSxTQUFTLFFBQVEsS0FBSztBQUU1QixNQUFJLENBQUMsUUFBUTtBQUNYLFdBQU8sQ0FBQztBQUFBLEVBQ1Y7QUFFQSxNQUFJLFdBQVcsYUFBYTtBQUMxQixVQUFNLGVBQWUsa0JBQWtCLE1BQU07QUFDN0MsVUFBTSxXQUFXLE1BQU0sS0FBSyxjQUFjLGlCQUFpQixnQkFBZ0IsS0FBSyxDQUFDLENBQUM7QUFFbEYsV0FBTyxTQUNKLElBQUksQ0FBQyxNQUFNLFdBQVc7QUFBQSxNQUNyQixJQUFJLEdBQUcsTUFBTSxJQUFJLFFBQVEsQ0FBQztBQUFBLE1BQzFCLE1BQU0sS0FBSyxhQUFhLEtBQUssS0FBSztBQUFBLE1BQ2xDLE9BQU8sS0FBSyxJQUFJLEdBQUcsT0FBTyxLQUFLLFFBQVEsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDO0FBQUEsSUFDdEQsRUFBRSxFQUNELE9BQU8sVUFBUSxRQUFRLEtBQUssSUFBSSxDQUFDO0FBQUEsRUFDdEM7QUFFQSxRQUFNLFFBQVEsT0FBTyxNQUFNLE9BQU87QUFDbEMsUUFBTSxRQUErQixDQUFDO0FBQ3RDLE1BQUksY0FBYztBQUVsQixRQUFNLFFBQVEsVUFBUTtBQUNwQixRQUFJLE9BQU8sS0FBSyxLQUFLLEtBQUssQ0FBQyxHQUFHO0FBQzVCLG9CQUFjLENBQUM7QUFDZjtBQUFBLElBQ0Y7QUFFQSxRQUFJLGFBQWE7QUFDZjtBQUFBLElBQ0Y7QUFFQSxVQUFNLFVBQVUsS0FBSyxNQUFNLG1CQUFtQjtBQUU5QyxRQUFJLENBQUMsU0FBUztBQUNaO0FBQUEsSUFDRjtBQUVBLFVBQU0sQ0FBQyxFQUFFLGNBQWMsV0FBVyxJQUFJO0FBRXRDLFFBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhO0FBQ2pDO0FBQUEsSUFDRjtBQUVBLFVBQU0sS0FBSztBQUFBLE1BQ1QsSUFBSSxHQUFHLE1BQU0sSUFBSSxNQUFNLFNBQVMsQ0FBQztBQUFBLE1BQ2pDLE1BQU0sWUFBWSxLQUFLO0FBQUEsTUFDdkIsT0FBTyxhQUFhLFNBQVM7QUFBQSxJQUMvQixDQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsU0FBTztBQUNUO0FBR08sYUFBTSwyQkFBMkIsQ0FBQyxTQUFpQixXQUFrQztBQUMxRixRQUFNLFNBQVMsUUFBUSxLQUFLO0FBRTVCLE1BQUksQ0FBQyxRQUFRO0FBQ1gsV0FBTztBQUFBLEVBQ1Q7QUFFQSxNQUFJLFdBQVcsYUFBYTtBQUMxQixVQUFNLGVBQWUsa0JBQWtCLE1BQU07QUFDN0MsV0FBTyxjQUFjLEtBQUssYUFBYSxRQUFRLFFBQVEsR0FBRyxFQUFFLEtBQUssS0FBSztBQUFBLEVBQ3hFO0FBRUEsU0FBTyxPQUNKLFFBQVEsbUJBQW1CLEdBQUcsRUFDOUIsUUFBUSxZQUFZLEdBQUcsRUFDdkIsUUFBUSx3QkFBd0IsR0FBRyxFQUNuQyxRQUFRLHlCQUF5QixJQUFJLEVBQ3JDLFFBQVEsY0FBYyxHQUFHLEVBQ3pCLFFBQVEsUUFBUSxHQUFHLEVBQ25CLEtBQUs7QUFDVjsiLCJuYW1lcyI6W119