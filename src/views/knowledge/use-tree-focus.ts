/* 2026-09-22 由 dev 缓存编译产物机械还原：类型标注已被 esbuild 剥除，import 说明符已尽量还原。过 node --check，未做运行验证。 */
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { findTreeNode, normalizeNodeIds } from "/src/components/knowledge/tree-utils.ts";
export const useTreeFocus = (options) => {
  const { treeNodes, expandedFolderIds } = options;
  const focusedNodeId = ref(null);
  const treeTypeaheadQuery = ref("");
  const treeTypeaheadTimer = ref(null);
  const getTreeNodeRowElement = (nodeId) => {
    if (typeof document === "undefined") {
      return null;
    }
    return document.querySelector(`[data-knowledge-node-id="${nodeId}"]`);
  };
  const clearTreeTypeahead = () => {
    if (treeTypeaheadTimer.value !== null) {
      window.clearTimeout(treeTypeaheadTimer.value);
      treeTypeaheadTimer.value = null;
    }
    treeTypeaheadQuery.value = "";
  };
  const focusTreeNode = (node) => {
    focusedNodeId.value = node.id;
  };
  const getFocusedTreeNode = () => {
    if (!focusedNodeId.value) {
      return null;
    }
    return findTreeNode(treeNodes.value, focusedNodeId.value);
  };
  const getVisibleTreeNodes = () => {
    const result = [];
    const walk = (nodes, depth) => {
      nodes.forEach((node) => {
        result.push({
          node,
          depth
        });
        if (node.children.length > 0 && expandedFolderIds.value.includes(node.id)) {
          walk(node.children, depth + 1);
        }
      });
    };
    walk(treeNodes.value, 0);
    return result;
  };
  const ensureNodeAncestorsExpanded = (nodeId) => {
    const targetNode = findTreeNode(treeNodes.value, nodeId);
    if (!targetNode) {
      return;
    }
    const ancestorContainerIds = [];
    let currentParentId = targetNode.parentId;
    while (currentParentId) {
      const parentNode = findTreeNode(treeNodes.value, currentParentId);
      if (!parentNode || parentNode.type !== "folder" && parentNode.type !== "doc") {
        break;
      }
      ancestorContainerIds.push(parentNode.id);
      currentParentId = parentNode.parentId;
    }
    if (ancestorContainerIds.length === 0) {
      return;
    }
    expandedFolderIds.value = normalizeNodeIds([...expandedFolderIds.value, ...ancestorContainerIds]);
  };
  const ensureFocusedNode = () => {
    const visibleNodes = getVisibleTreeNodes();
    if (visibleNodes.length === 0) {
      focusedNodeId.value = null;
      return;
    }
    if (!focusedNodeId.value) {
      const firstNode = visibleNodes[0];
      focusedNodeId.value = firstNode ? firstNode.node.id : null;
      return;
    }
    const hasFocusedNode = visibleNodes.some((item) => item.node.id === focusedNodeId.value);
    if (!hasFocusedNode) {
      const firstNode = visibleNodes[0];
      focusedNodeId.value = firstNode ? firstNode.node.id : null;
    }
  };
  const focusVisibleSibling = (currentNodeId, offset) => {
    const visibleNodes = getVisibleTreeNodes();
    if (visibleNodes.length === 0) {
      return;
    }
    const currentIndex = visibleNodes.findIndex((item) => item.node.id === currentNodeId);
    if (currentIndex < 0) {
      const firstNode = visibleNodes[0];
      focusedNodeId.value = firstNode ? firstNode.node.id : null;
      return;
    }
    const nextIndex = Math.max(0, Math.min(currentIndex + offset, visibleNodes.length - 1));
    const nextNode = visibleNodes[nextIndex];
    focusedNodeId.value = nextNode ? nextNode.node.id : null;
  };
  const focusTreeBoundary = (position) => {
    const visibleNodes = getVisibleTreeNodes();
    if (visibleNodes.length === 0) {
      return;
    }
    const targetNode = position === "start" ? visibleNodes[0] : visibleNodes[visibleNodes.length - 1];
    focusedNodeId.value = targetNode?.node.id ?? null;
  };
  const focusTreeNodeByTypeahead = (query) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return false;
    }
    const visibleNodes = getVisibleTreeNodes();
    if (visibleNodes.length === 0) {
      return false;
    }
    const currentIndex = focusedNodeId.value ? visibleNodes.findIndex((item) => item.node.id === focusedNodeId.value) : -1;
    const candidates = currentIndex >= 0 ? [...visibleNodes.slice(currentIndex + 1), ...visibleNodes.slice(0, currentIndex + 1)] : visibleNodes;
    const matchedNode = candidates.find((item) => item.node.title.trim().toLowerCase().startsWith(normalizedQuery)) || candidates.find((item) => item.node.title.trim().toLowerCase().includes(normalizedQuery));
    if (!matchedNode) {
      return false;
    }
    focusTreeNode(matchedNode.node);
    return true;
  };
  const isTreeTypeaheadActive = () => treeTypeaheadQuery.value.length > 0;
  const handleTreeTypeahead = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return false;
    }
    if (event.key.length !== 1 || !event.key.trim()) {
      return false;
    }
    const nextQuery = `${treeTypeaheadQuery.value}${event.key.toLowerCase()}`;
    const matched = focusTreeNodeByTypeahead(nextQuery) || focusTreeNodeByTypeahead(event.key.toLowerCase());
    clearTreeTypeahead();
    treeTypeaheadQuery.value = matched ? nextQuery : event.key.toLowerCase();
    treeTypeaheadTimer.value = window.setTimeout(() => {
      treeTypeaheadTimer.value = null;
      treeTypeaheadQuery.value = "";
    }, 720);
    if (matched) {
      event.preventDefault();
    }
    return matched;
  };
  const activateFocusedNode = (targetNode) => {
    if (targetNode.type === "doc") {
      options.openDoc(targetNode.id, targetNode.editorType);
      return;
    }
    if (targetNode.type === "link") {
      if (targetNode.url) {
        window.open(targetNode.url, "_blank", "noopener");
      }
      return;
    }
    options.toggleFolder(targetNode.id);
  };
  const handleTreeNavigationShortcut = (event, targetNode) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return false;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusVisibleSibling(targetNode.id, -1);
      return true;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusVisibleSibling(targetNode.id, 1);
      return true;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusTreeBoundary("start");
      return true;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusTreeBoundary("end");
      return true;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if ((targetNode.type === "folder" || targetNode.children.length > 0) && expandedFolderIds.value.includes(targetNode.id)) {
        options.toggleFolder(targetNode.id);
        return true;
      }
      if (targetNode.parentId) {
        const parentNode = findTreeNode(treeNodes.value, targetNode.parentId);
        if (parentNode) {
          focusTreeNode(parentNode);
        }
      }
      return true;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (targetNode.type !== "folder" && targetNode.children.length === 0) {
        return true;
      }
      if (!expandedFolderIds.value.includes(targetNode.id)) {
        options.toggleFolder(targetNode.id);
        return true;
      }
      if (targetNode.children.length > 0) {
        const firstChild = targetNode.children[0];
        if (firstChild) {
          focusTreeNode(firstChild);
        }
      }
      return true;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      activateFocusedNode(targetNode);
      return true;
    }
    if (event.key === " ") {
      event.preventDefault();
      activateFocusedNode(targetNode);
      return true;
    }
    return false;
  };
  watch(
    () => focusedNodeId.value,
    async (nodeId) => {
      if (!nodeId) {
        return;
      }
      await nextTick();
      const rowElement = getTreeNodeRowElement(nodeId);
      if (rowElement && !options.isMenuOpen()) {
        rowElement.focus({
          preventScroll: true,
          focusVisible: false
        });
        rowElement.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "smooth"
        });
      }
    }
  );
  onBeforeUnmount(() => {
    clearTreeTypeahead();
  });
  return {
    focusedNodeId,
    clearTreeTypeahead,
    isTreeTypeaheadActive,
    focusTreeNode,
    getFocusedTreeNode,
    ensureNodeAncestorsExpanded,
    ensureFocusedNode,
    focusVisibleSibling,
    focusTreeBoundary,
    getTreeNodeRowElement,
    handleTreeTypeahead,
    handleTreeNavigationShortcut
  };
};

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInVzZS10cmVlLWZvY3VzLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICog55+l6K+G5bqT5paH5qGj5qCR54Sm54K55LiO6L6T5YWl6YCf5p+lIGNvbXBvc2FibGXjgIJcbiAqXG4gKiDku44gS25vd2xlZGdlV29ya3NwYWNlTGF5b3V0IOaKveWHuu+8muiBmueEpuiKgueCueeKtuaAgeOAgeWPr+ingeiKgueCuemBjeWOhuOAgVxuICog56WW5YWI5bGV5byA5L+d6Zqc44CB5YWE5byfL+i+ueeVjOiBmueEpuOAgXR5cGVhaGVhZCDpgJ/mn6XjgIHogZrnhKblj5jljJblkI7nmoRcbiAqIOihjOeEpueCueS4jua7muWKqOihjOS4uu+8jOS7peWPiuaWueWQkemUri9FbnRlciDnrYnmoJHlr7zoiKrlv6vmjbfplK7jgIJcbiAqIOiPnOWNleaJk+W8gOaXtuS4jeaKouihjOeEpueCueeUsSBpc01lbnVPcGVuIOazqOWFpeWIpOaWreOAglxuICovXG5pbXBvcnQgeyBuZXh0VGljaywgb25CZWZvcmVVbm1vdW50LCByZWYsIHdhdGNoLCB0eXBlIFJlZiB9IGZyb20gXCJ2dWVcIlxuaW1wb3J0IHR5cGUgeyBLbm93bGVkZ2VEb2N1bWVudFRyZWVOb2RlIH0gZnJvbSBcIkAvc2VydmljZXMva25vd2xlZGdlLWRvY3VtZW50c1wiXG5pbXBvcnQgeyBmaW5kVHJlZU5vZGUsIG5vcm1hbGl6ZU5vZGVJZHMgfSBmcm9tIFwiQC9jb21wb25lbnRzL2tub3dsZWRnZS90cmVlLXV0aWxzXCJcblxuZXhwb3J0IHR5cGUgVmlzaWJsZVRyZWVOb2RlID0ge1xuICBub2RlOiBLbm93bGVkZ2VEb2N1bWVudFRyZWVOb2RlXG4gIGRlcHRoOiBudW1iZXJcbn1cblxuZXhwb3J0IGNvbnN0IHVzZVRyZWVGb2N1cyA9IChvcHRpb25zOiB7XG4gIHRyZWVOb2RlczogUmVmPEtub3dsZWRnZURvY3VtZW50VHJlZU5vZGVbXT5cbiAgZXhwYW5kZWRGb2xkZXJJZHM6IFJlZjxzdHJpbmdbXT5cbiAgLyoqIOWPs+mUruiPnOWNleaJk+W8gOaXtuS4jeaKouihjOi1sOeEpueCuSAqL1xuICBpc01lbnVPcGVuOiAoKSA9PiBib29sZWFuXG4gIC8qKiDlr7zoiKrlv6vmjbfplK7kvb/nlKjnmoTkuJrliqHliqjkvZzvvIjmipjlj6Av5bGV5byA5LiO5omT5byA5paH5qGj77yJICovXG4gIHRvZ2dsZUZvbGRlcjogKGlkOiBzdHJpbmcpID0+IHZvaWRcbiAgb3BlbkRvYzogKGRvY0lkOiBzdHJpbmcsIGVkaXRvclR5cGU/OiBzdHJpbmcgfCBudWxsKSA9PiB2b2lkXG59KSA9PiB7XG4gIGNvbnN0IHsgdHJlZU5vZGVzLCBleHBhbmRlZEZvbGRlcklkcyB9ID0gb3B0aW9uc1xuXG4gIGNvbnN0IGZvY3VzZWROb2RlSWQgPSByZWY8c3RyaW5nIHwgbnVsbD4obnVsbClcbiAgY29uc3QgdHJlZVR5cGVhaGVhZFF1ZXJ5ID0gcmVmKFwiXCIpXG4gIGNvbnN0IHRyZWVUeXBlYWhlYWRUaW1lciA9IHJlZjxudW1iZXIgfCBudWxsPihudWxsKVxuXG4gIGNvbnN0IGdldFRyZWVOb2RlUm93RWxlbWVudCA9IChub2RlSWQ6IHN0cmluZykgPT4ge1xuICAgIGlmICh0eXBlb2YgZG9jdW1lbnQgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgcmV0dXJuIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KGBbZGF0YS1rbm93bGVkZ2Utbm9kZS1pZD1cIiR7bm9kZUlkfVwiXWApXG4gIH1cblxuICBjb25zdCBjbGVhclRyZWVUeXBlYWhlYWQgPSAoKSA9PiB7XG4gICAgaWYgKHRyZWVUeXBlYWhlYWRUaW1lci52YWx1ZSAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0cmVlVHlwZWFoZWFkVGltZXIudmFsdWUpXG4gICAgICB0cmVlVHlwZWFoZWFkVGltZXIudmFsdWUgPSBudWxsXG4gICAgfVxuXG4gICAgdHJlZVR5cGVhaGVhZFF1ZXJ5LnZhbHVlID0gXCJcIlxuICB9XG5cbiAgY29uc3QgZm9jdXNUcmVlTm9kZSA9IChub2RlOiBLbm93bGVkZ2VEb2N1bWVudFRyZWVOb2RlKSA9PiB7XG4gICAgZm9jdXNlZE5vZGVJZC52YWx1ZSA9IG5vZGUuaWRcbiAgfVxuXG4gIGNvbnN0IGdldEZvY3VzZWRUcmVlTm9kZSA9ICgpID0+IHtcbiAgICBpZiAoIWZvY3VzZWROb2RlSWQudmFsdWUpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgcmV0dXJuIGZpbmRUcmVlTm9kZSh0cmVlTm9kZXMudmFsdWUsIGZvY3VzZWROb2RlSWQudmFsdWUpXG4gIH1cblxuICBjb25zdCBnZXRWaXNpYmxlVHJlZU5vZGVzID0gKCk6IFZpc2libGVUcmVlTm9kZVtdID0+IHtcbiAgICBjb25zdCByZXN1bHQ6IFZpc2libGVUcmVlTm9kZVtdID0gW11cblxuICAgIGNvbnN0IHdhbGsgPSAobm9kZXM6IEtub3dsZWRnZURvY3VtZW50VHJlZU5vZGVbXSwgZGVwdGg6IG51bWJlcikgPT4ge1xuICAgICAgbm9kZXMuZm9yRWFjaChub2RlID0+IHtcbiAgICAgICAgcmVzdWx0LnB1c2goe1xuICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgZGVwdGgsXG4gICAgICAgIH0pXG5cbiAgICAgICAgLy8g5bGV5byA55qE5a655Zmo77yI5YiG57uE5LiO5oyC5a2Q57qn55qE5paH5qGj77yM5om55qyhIELvvInmiY3kuIvpkrtcbiAgICAgICAgaWYgKG5vZGUuY2hpbGRyZW4ubGVuZ3RoID4gMCAmJiBleHBhbmRlZEZvbGRlcklkcy52YWx1ZS5pbmNsdWRlcyhub2RlLmlkKSkge1xuICAgICAgICAgIHdhbGsobm9kZS5jaGlsZHJlbiwgZGVwdGggKyAxKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH1cblxuICAgIHdhbGsodHJlZU5vZGVzLnZhbHVlLCAwKVxuXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgY29uc3QgZW5zdXJlTm9kZUFuY2VzdG9yc0V4cGFuZGVkID0gKG5vZGVJZDogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgdGFyZ2V0Tm9kZSA9IGZpbmRUcmVlTm9kZSh0cmVlTm9kZXMudmFsdWUsIG5vZGVJZClcblxuICAgIGlmICghdGFyZ2V0Tm9kZSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3QgYW5jZXN0b3JDb250YWluZXJJZHM6IHN0cmluZ1tdID0gW11cbiAgICBsZXQgY3VycmVudFBhcmVudElkID0gdGFyZ2V0Tm9kZS5wYXJlbnRJZFxuXG4gICAgd2hpbGUgKGN1cnJlbnRQYXJlbnRJZCkge1xuICAgICAgY29uc3QgcGFyZW50Tm9kZSA9IGZpbmRUcmVlTm9kZSh0cmVlTm9kZXMudmFsdWUsIGN1cnJlbnRQYXJlbnRJZClcblxuICAgICAgLy8g5YiG57uE5LiO5paH5qGj77yI5oyC5a2Q57qn77yM5om55qyhIELvvInpg73mmK/lrrnlmajvvJvniLbnuqfmmK/lpJbpk77nrYnlj7blrZDnsbvlnovml7bliLDpobZcbiAgICAgIGlmICghcGFyZW50Tm9kZSB8fCAocGFyZW50Tm9kZS50eXBlICE9PSBcImZvbGRlclwiICYmIHBhcmVudE5vZGUudHlwZSAhPT0gXCJkb2NcIikpIHtcbiAgICAgICAgYnJlYWtcbiAgICAgIH1cblxuICAgICAgYW5jZXN0b3JDb250YWluZXJJZHMucHVzaChwYXJlbnROb2RlLmlkKVxuICAgICAgY3VycmVudFBhcmVudElkID0gcGFyZW50Tm9kZS5wYXJlbnRJZFxuICAgIH1cblxuICAgIGlmIChhbmNlc3RvckNvbnRhaW5lcklkcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGV4cGFuZGVkRm9sZGVySWRzLnZhbHVlID0gbm9ybWFsaXplTm9kZUlkcyhbLi4uZXhwYW5kZWRGb2xkZXJJZHMudmFsdWUsIC4uLmFuY2VzdG9yQ29udGFpbmVySWRzXSlcbiAgfVxuXG4gIGNvbnN0IGVuc3VyZUZvY3VzZWROb2RlID0gKCkgPT4ge1xuICAgIGNvbnN0IHZpc2libGVOb2RlcyA9IGdldFZpc2libGVUcmVlTm9kZXMoKVxuXG4gICAgaWYgKHZpc2libGVOb2Rlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGZvY3VzZWROb2RlSWQudmFsdWUgPSBudWxsXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBpZiAoIWZvY3VzZWROb2RlSWQudmFsdWUpIHtcbiAgICAgIGNvbnN0IGZpcnN0Tm9kZSA9IHZpc2libGVOb2Rlc1swXVxuICAgICAgZm9jdXNlZE5vZGVJZC52YWx1ZSA9IGZpcnN0Tm9kZSA/IGZpcnN0Tm9kZS5ub2RlLmlkIDogbnVsbFxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3QgaGFzRm9jdXNlZE5vZGUgPSB2aXNpYmxlTm9kZXMuc29tZShpdGVtID0+IGl0ZW0ubm9kZS5pZCA9PT0gZm9jdXNlZE5vZGVJZC52YWx1ZSlcblxuICAgIGlmICghaGFzRm9jdXNlZE5vZGUpIHtcbiAgICAgIGNvbnN0IGZpcnN0Tm9kZSA9IHZpc2libGVOb2Rlc1swXVxuICAgICAgZm9jdXNlZE5vZGVJZC52YWx1ZSA9IGZpcnN0Tm9kZSA/IGZpcnN0Tm9kZS5ub2RlLmlkIDogbnVsbFxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGZvY3VzVmlzaWJsZVNpYmxpbmcgPSAoY3VycmVudE5vZGVJZDogc3RyaW5nLCBvZmZzZXQ6IC0xIHwgMSkgPT4ge1xuICAgIGNvbnN0IHZpc2libGVOb2RlcyA9IGdldFZpc2libGVUcmVlTm9kZXMoKVxuXG4gICAgaWYgKHZpc2libGVOb2Rlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNvbnN0IGN1cnJlbnRJbmRleCA9IHZpc2libGVOb2Rlcy5maW5kSW5kZXgoaXRlbSA9PiBpdGVtLm5vZGUuaWQgPT09IGN1cnJlbnROb2RlSWQpXG5cbiAgICBpZiAoY3VycmVudEluZGV4IDwgMCkge1xuICAgICAgY29uc3QgZmlyc3ROb2RlID0gdmlzaWJsZU5vZGVzWzBdXG4gICAgICBmb2N1c2VkTm9kZUlkLnZhbHVlID0gZmlyc3ROb2RlID8gZmlyc3ROb2RlLm5vZGUuaWQgOiBudWxsXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCBuZXh0SW5kZXggPSBNYXRoLm1heCgwLCBNYXRoLm1pbihjdXJyZW50SW5kZXggKyBvZmZzZXQsIHZpc2libGVOb2Rlcy5sZW5ndGggLSAxKSlcbiAgICBjb25zdCBuZXh0Tm9kZSA9IHZpc2libGVOb2Rlc1tuZXh0SW5kZXhdXG4gICAgZm9jdXNlZE5vZGVJZC52YWx1ZSA9IG5leHROb2RlID8gbmV4dE5vZGUubm9kZS5pZCA6IG51bGxcbiAgfVxuXG4gIGNvbnN0IGZvY3VzVHJlZUJvdW5kYXJ5ID0gKHBvc2l0aW9uOiBcInN0YXJ0XCIgfCBcImVuZFwiKSA9PiB7XG4gICAgY29uc3QgdmlzaWJsZU5vZGVzID0gZ2V0VmlzaWJsZVRyZWVOb2RlcygpXG5cbiAgICBpZiAodmlzaWJsZU5vZGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3QgdGFyZ2V0Tm9kZSA9IHBvc2l0aW9uID09PSBcInN0YXJ0XCIgPyB2aXNpYmxlTm9kZXNbMF0gOiB2aXNpYmxlTm9kZXNbdmlzaWJsZU5vZGVzLmxlbmd0aCAtIDFdXG4gICAgZm9jdXNlZE5vZGVJZC52YWx1ZSA9IHRhcmdldE5vZGU/Lm5vZGUuaWQgPz8gbnVsbFxuICB9XG5cbiAgY29uc3QgZm9jdXNUcmVlTm9kZUJ5VHlwZWFoZWFkID0gKHF1ZXJ5OiBzdHJpbmcpID0+IHtcbiAgICBjb25zdCBub3JtYWxpemVkUXVlcnkgPSBxdWVyeS50cmltKCkudG9Mb3dlckNhc2UoKVxuXG4gICAgaWYgKCFub3JtYWxpemVkUXVlcnkpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cblxuICAgIGNvbnN0IHZpc2libGVOb2RlcyA9IGdldFZpc2libGVUcmVlTm9kZXMoKVxuXG4gICAgaWYgKHZpc2libGVOb2Rlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cblxuICAgIGNvbnN0IGN1cnJlbnRJbmRleCA9IGZvY3VzZWROb2RlSWQudmFsdWUgPyB2aXNpYmxlTm9kZXMuZmluZEluZGV4KGl0ZW0gPT4gaXRlbS5ub2RlLmlkID09PSBmb2N1c2VkTm9kZUlkLnZhbHVlKSA6IC0xXG4gICAgY29uc3QgY2FuZGlkYXRlcyA9XG4gICAgICBjdXJyZW50SW5kZXggPj0gMFxuICAgICAgICA/IFsuLi52aXNpYmxlTm9kZXMuc2xpY2UoY3VycmVudEluZGV4ICsgMSksIC4uLnZpc2libGVOb2Rlcy5zbGljZSgwLCBjdXJyZW50SW5kZXggKyAxKV1cbiAgICAgICAgOiB2aXNpYmxlTm9kZXNcblxuICAgIGNvbnN0IG1hdGNoZWROb2RlID1cbiAgICAgIGNhbmRpZGF0ZXMuZmluZChpdGVtID0+IGl0ZW0ubm9kZS50aXRsZS50cmltKCkudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKG5vcm1hbGl6ZWRRdWVyeSkpIHx8XG4gICAgICBjYW5kaWRhdGVzLmZpbmQoaXRlbSA9PiBpdGVtLm5vZGUudGl0bGUudHJpbSgpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMobm9ybWFsaXplZFF1ZXJ5KSlcblxuICAgIGlmICghbWF0Y2hlZE5vZGUpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cblxuICAgIGZvY3VzVHJlZU5vZGUobWF0Y2hlZE5vZGUubm9kZSlcbiAgICByZXR1cm4gdHJ1ZVxuICB9XG5cbiAgLyoqIHR5cGVhaGVhZCDpgJ/mn6XmmK/lkKblpITkuo7mv4DmtLvmgIHvvIjmnInmnKrlrozmiJDnmoTmn6Xor6LkuLLvvIkgKi9cbiAgY29uc3QgaXNUcmVlVHlwZWFoZWFkQWN0aXZlID0gKCkgPT4gdHJlZVR5cGVhaGVhZFF1ZXJ5LnZhbHVlLmxlbmd0aCA+IDBcblxuICBjb25zdCBoYW5kbGVUcmVlVHlwZWFoZWFkID0gKGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB7XG4gICAgaWYgKGV2ZW50Lm1ldGFLZXkgfHwgZXZlbnQuY3RybEtleSB8fCBldmVudC5hbHRLZXkpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cblxuICAgIGlmIChldmVudC5rZXkubGVuZ3RoICE9PSAxIHx8ICFldmVudC5rZXkudHJpbSgpKSB7XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG5cbiAgICBjb25zdCBuZXh0UXVlcnkgPSBgJHt0cmVlVHlwZWFoZWFkUXVlcnkudmFsdWV9JHtldmVudC5rZXkudG9Mb3dlckNhc2UoKX1gXG4gICAgY29uc3QgbWF0Y2hlZCA9IGZvY3VzVHJlZU5vZGVCeVR5cGVhaGVhZChuZXh0UXVlcnkpIHx8IGZvY3VzVHJlZU5vZGVCeVR5cGVhaGVhZChldmVudC5rZXkudG9Mb3dlckNhc2UoKSlcblxuICAgIGNsZWFyVHJlZVR5cGVhaGVhZCgpXG4gICAgdHJlZVR5cGVhaGVhZFF1ZXJ5LnZhbHVlID0gbWF0Y2hlZCA/IG5leHRRdWVyeSA6IGV2ZW50LmtleS50b0xvd2VyQ2FzZSgpXG4gICAgdHJlZVR5cGVhaGVhZFRpbWVyLnZhbHVlID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgdHJlZVR5cGVhaGVhZFRpbWVyLnZhbHVlID0gbnVsbFxuICAgICAgdHJlZVR5cGVhaGVhZFF1ZXJ5LnZhbHVlID0gXCJcIlxuICAgIH0sIDcyMClcblxuICAgIGlmIChtYXRjaGVkKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXG4gICAgfVxuXG4gICAgcmV0dXJuIG1hdGNoZWRcbiAgfVxuXG4gIC8qKiBFbnRlci9TcGFjZSDmv4DmtLvoioLngrnvvJrkuI7pvKDmoIfngrnlh7vlkI3np7DmjInpkq7lkIzmupDkuInliIbmtYHvvIjnm67lvZXmipjlj6DjgIHpk77mjqXmlrDnqpflj6PjgIHmlofmoaPov5vnvJbovpHlmajvvIkgKi9cbiAgY29uc3QgYWN0aXZhdGVGb2N1c2VkTm9kZSA9ICh0YXJnZXROb2RlOiBLbm93bGVkZ2VEb2N1bWVudFRyZWVOb2RlKSA9PiB7XG4gICAgaWYgKHRhcmdldE5vZGUudHlwZSA9PT0gXCJkb2NcIikge1xuICAgICAgb3B0aW9ucy5vcGVuRG9jKHRhcmdldE5vZGUuaWQsIHRhcmdldE5vZGUuZWRpdG9yVHlwZSlcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGlmICh0YXJnZXROb2RlLnR5cGUgPT09IFwibGlua1wiKSB7XG4gICAgICAvLyDpk77mjqXoioLngrnkuI3mmK/nm67lvZXvvJrkuI3og73otbAgdG9nZ2xlRm9sZGVy77yM5ZCm5YiZ5Lya5oqK6ZO+5o6lIGlkIOWGmei/m+WxleW8gOaAgVxuICAgICAgaWYgKHRhcmdldE5vZGUudXJsKSB7XG4gICAgICAgIHdpbmRvdy5vcGVuKHRhcmdldE5vZGUudXJsLCBcIl9ibGFua1wiLCBcIm5vb3BlbmVyXCIpXG4gICAgICB9XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBvcHRpb25zLnRvZ2dsZUZvbGRlcih0YXJnZXROb2RlLmlkKVxuICB9XG5cbiAgY29uc3QgaGFuZGxlVHJlZU5hdmlnYXRpb25TaG9ydGN1dCA9IChldmVudDogS2V5Ym9hcmRFdmVudCwgdGFyZ2V0Tm9kZTogS25vd2xlZGdlRG9jdW1lbnRUcmVlTm9kZSkgPT4ge1xuICAgIGlmIChldmVudC5tZXRhS2V5IHx8IGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQuYWx0S2V5KSB7XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIkFycm93VXBcIikge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgICAgZm9jdXNWaXNpYmxlU2libGluZyh0YXJnZXROb2RlLmlkLCAtMSlcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCJBcnJvd0Rvd25cIikge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgICAgZm9jdXNWaXNpYmxlU2libGluZyh0YXJnZXROb2RlLmlkLCAxKVxuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIkhvbWVcIikge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgICAgZm9jdXNUcmVlQm91bmRhcnkoXCJzdGFydFwiKVxuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIkVuZFwiKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXG4gICAgICBmb2N1c1RyZWVCb3VuZGFyeShcImVuZFwiKVxuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIkFycm93TGVmdFwiKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXG5cbiAgICAgIGlmIChcbiAgICAgICAgKHRhcmdldE5vZGUudHlwZSA9PT0gXCJmb2xkZXJcIiB8fCB0YXJnZXROb2RlLmNoaWxkcmVuLmxlbmd0aCA+IDApICYmXG4gICAgICAgIGV4cGFuZGVkRm9sZGVySWRzLnZhbHVlLmluY2x1ZGVzKHRhcmdldE5vZGUuaWQpXG4gICAgICApIHtcbiAgICAgICAgb3B0aW9ucy50b2dnbGVGb2xkZXIodGFyZ2V0Tm9kZS5pZClcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cblxuICAgICAgaWYgKHRhcmdldE5vZGUucGFyZW50SWQpIHtcbiAgICAgICAgY29uc3QgcGFyZW50Tm9kZSA9IGZpbmRUcmVlTm9kZSh0cmVlTm9kZXMudmFsdWUsIHRhcmdldE5vZGUucGFyZW50SWQpXG5cbiAgICAgICAgaWYgKHBhcmVudE5vZGUpIHtcbiAgICAgICAgICBmb2N1c1RyZWVOb2RlKHBhcmVudE5vZGUpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIkFycm93UmlnaHRcIikge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuXG4gICAgICAvLyDlj7blrZDooYzvvIjml6DlrZDnuqfnmoTmlofmoaMv5aSW6ZO+562J77yJ5LiN5ZON5bqU5Y+z6ZSu5bGV5byAXG4gICAgICBpZiAodGFyZ2V0Tm9kZS50eXBlICE9PSBcImZvbGRlclwiICYmIHRhcmdldE5vZGUuY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICB9XG5cbiAgICAgIGlmICghZXhwYW5kZWRGb2xkZXJJZHMudmFsdWUuaW5jbHVkZXModGFyZ2V0Tm9kZS5pZCkpIHtcbiAgICAgICAgb3B0aW9ucy50b2dnbGVGb2xkZXIodGFyZ2V0Tm9kZS5pZClcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cblxuICAgICAgaWYgKHRhcmdldE5vZGUuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBmaXJzdENoaWxkID0gdGFyZ2V0Tm9kZS5jaGlsZHJlblswXVxuXG4gICAgICAgIGlmIChmaXJzdENoaWxkKSB7XG4gICAgICAgICAgZm9jdXNUcmVlTm9kZShmaXJzdENoaWxkKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCJFbnRlclwiKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXG5cbiAgICAgIGFjdGl2YXRlRm9jdXNlZE5vZGUodGFyZ2V0Tm9kZSlcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCIgXCIpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcblxuICAgICAgYWN0aXZhdGVGb2N1c2VkTm9kZSh0YXJnZXROb2RlKVxuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIHdhdGNoKFxuICAgICgpID0+IGZvY3VzZWROb2RlSWQudmFsdWUsXG4gICAgYXN5bmMgbm9kZUlkID0+IHtcbiAgICAgIGlmICghbm9kZUlkKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICBhd2FpdCBuZXh0VGljaygpXG4gICAgICBjb25zdCByb3dFbGVtZW50ID0gZ2V0VHJlZU5vZGVSb3dFbGVtZW50KG5vZGVJZClcblxuICAgICAgaWYgKHJvd0VsZW1lbnQgJiYgIW9wdGlvbnMuaXNNZW51T3BlbigpKSB7XG4gICAgICAgIC8vIGZvY3VzVmlzaWJsZTpmYWxzZe+8mueoi+W6j+WMluaBouWkjeeEpueCue+8iOaMgeS5heWMlueahOmAieS4reiKgueCue+8ieS4jeS7pemUruebmOeEpueCueeOr+WRiOeOsO+8jFxuICAgICAgICAvLyDpgb/lhY3ov5vlhaXlt6XkvZzljLrml7bpppboioLngrnluKYgZm9jdXMgcmluZ++8m+mUruebmOaWueWQkemUruWvvOiIquS7jeS8muato+W4uOaYvuekuiByaW5n44CCXG4gICAgICAgIC8vIGZvY3VzVmlzaWJsZSDmmK8gQ2hyb21pdW0g5omp5bGV5bGe5oCn77yM5qCH5YeGIEZvY3VzT3B0aW9ucyDnsbvlnovmmoLmnKrmlLblvZVcbiAgICAgICAgcm93RWxlbWVudC5mb2N1cyh7XG4gICAgICAgICAgcHJldmVudFNjcm9sbDogdHJ1ZSxcbiAgICAgICAgICBmb2N1c1Zpc2libGU6IGZhbHNlLFxuICAgICAgICB9IGFzIEZvY3VzT3B0aW9ucyAmIHsgZm9jdXNWaXNpYmxlOiBmYWxzZSB9KVxuXG4gICAgICAgIC8vIOiBmueEpui3n+maj+a7muWKqO+8iOatpOWJjeS4pOS4qiB3YXRjaCDliIbliKvlubPmu5Ev556s5pe25rua5Yqo5ZCM5LiA55uu5qCH77yM5LqS55u45omT5pat77yJXG4gICAgICAgIHJvd0VsZW1lbnQuc2Nyb2xsSW50b1ZpZXcoe1xuICAgICAgICAgIGJsb2NrOiBcIm5lYXJlc3RcIixcbiAgICAgICAgICBpbmxpbmU6IFwibmVhcmVzdFwiLFxuICAgICAgICAgIGJlaGF2aW9yOiBcInNtb290aFwiLFxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH1cbiAgKVxuXG4gIG9uQmVmb3JlVW5tb3VudCgoKSA9PiB7XG4gICAgY2xlYXJUcmVlVHlwZWFoZWFkKClcbiAgfSlcblxuICByZXR1cm4ge1xuICAgIGZvY3VzZWROb2RlSWQsXG4gICAgY2xlYXJUcmVlVHlwZWFoZWFkLFxuICAgIGlzVHJlZVR5cGVhaGVhZEFjdGl2ZSxcbiAgICBmb2N1c1RyZWVOb2RlLFxuICAgIGdldEZvY3VzZWRUcmVlTm9kZSxcbiAgICBlbnN1cmVOb2RlQW5jZXN0b3JzRXhwYW5kZWQsXG4gICAgZW5zdXJlRm9jdXNlZE5vZGUsXG4gICAgZm9jdXNWaXNpYmxlU2libGluZyxcbiAgICBmb2N1c1RyZWVCb3VuZGFyeSxcbiAgICBnZXRUcmVlTm9kZVJvd0VsZW1lbnQsXG4gICAgaGFuZGxlVHJlZVR5cGVhaGVhZCxcbiAgICBoYW5kbGVUcmVlTmF2aWdhdGlvblNob3J0Y3V0LFxuICB9XG59XG4iXSwibWFwcGluZ3MiOiJBQVFBLFNBQVMsVUFBVSxpQkFBaUIsS0FBSyxhQUF1QjtBQUVoRSxTQUFTLGNBQWMsd0JBQXdCO0FBT3hDLGFBQU0sZUFBZSxDQUFDLFlBUXZCO0FBQ0osUUFBTSxFQUFFLFdBQVcsa0JBQWtCLElBQUk7QUFFekMsUUFBTSxnQkFBZ0IsSUFBbUIsSUFBSTtBQUM3QyxRQUFNLHFCQUFxQixJQUFJLEVBQUU7QUFDakMsUUFBTSxxQkFBcUIsSUFBbUIsSUFBSTtBQUVsRCxRQUFNLHdCQUF3QixDQUFDLFdBQW1CO0FBQ2hELFFBQUksT0FBTyxhQUFhLGFBQWE7QUFDbkMsYUFBTztBQUFBLElBQ1Q7QUFFQSxXQUFPLFNBQVMsY0FBMkIsNEJBQTRCLE1BQU0sSUFBSTtBQUFBLEVBQ25GO0FBRUEsUUFBTSxxQkFBcUIsTUFBTTtBQUMvQixRQUFJLG1CQUFtQixVQUFVLE1BQU07QUFDckMsYUFBTyxhQUFhLG1CQUFtQixLQUFLO0FBQzVDLHlCQUFtQixRQUFRO0FBQUEsSUFDN0I7QUFFQSx1QkFBbUIsUUFBUTtBQUFBLEVBQzdCO0FBRUEsUUFBTSxnQkFBZ0IsQ0FBQyxTQUFvQztBQUN6RCxrQkFBYyxRQUFRLEtBQUs7QUFBQSxFQUM3QjtBQUVBLFFBQU0scUJBQXFCLE1BQU07QUFDL0IsUUFBSSxDQUFDLGNBQWMsT0FBTztBQUN4QixhQUFPO0FBQUEsSUFDVDtBQUVBLFdBQU8sYUFBYSxVQUFVLE9BQU8sY0FBYyxLQUFLO0FBQUEsRUFDMUQ7QUFFQSxRQUFNLHNCQUFzQixNQUF5QjtBQUNuRCxVQUFNLFNBQTRCLENBQUM7QUFFbkMsVUFBTSxPQUFPLENBQUMsT0FBb0MsVUFBa0I7QUFDbEUsWUFBTSxRQUFRLFVBQVE7QUFDcEIsZUFBTyxLQUFLO0FBQUEsVUFDVjtBQUFBLFVBQ0E7QUFBQSxRQUNGLENBQUM7QUFHRCxZQUFJLEtBQUssU0FBUyxTQUFTLEtBQUssa0JBQWtCLE1BQU0sU0FBUyxLQUFLLEVBQUUsR0FBRztBQUN6RSxlQUFLLEtBQUssVUFBVSxRQUFRLENBQUM7QUFBQSxRQUMvQjtBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0g7QUFFQSxTQUFLLFVBQVUsT0FBTyxDQUFDO0FBRXZCLFdBQU87QUFBQSxFQUNUO0FBRUEsUUFBTSw4QkFBOEIsQ0FBQyxXQUFtQjtBQUN0RCxVQUFNLGFBQWEsYUFBYSxVQUFVLE9BQU8sTUFBTTtBQUV2RCxRQUFJLENBQUMsWUFBWTtBQUNmO0FBQUEsSUFDRjtBQUVBLFVBQU0sdUJBQWlDLENBQUM7QUFDeEMsUUFBSSxrQkFBa0IsV0FBVztBQUVqQyxXQUFPLGlCQUFpQjtBQUN0QixZQUFNLGFBQWEsYUFBYSxVQUFVLE9BQU8sZUFBZTtBQUdoRSxVQUFJLENBQUMsY0FBZSxXQUFXLFNBQVMsWUFBWSxXQUFXLFNBQVMsT0FBUTtBQUM5RTtBQUFBLE1BQ0Y7QUFFQSwyQkFBcUIsS0FBSyxXQUFXLEVBQUU7QUFDdkMsd0JBQWtCLFdBQVc7QUFBQSxJQUMvQjtBQUVBLFFBQUkscUJBQXFCLFdBQVcsR0FBRztBQUNyQztBQUFBLElBQ0Y7QUFFQSxzQkFBa0IsUUFBUSxpQkFBaUIsQ0FBQyxHQUFHLGtCQUFrQixPQUFPLEdBQUcsb0JBQW9CLENBQUM7QUFBQSxFQUNsRztBQUVBLFFBQU0sb0JBQW9CLE1BQU07QUFDOUIsVUFBTSxlQUFlLG9CQUFvQjtBQUV6QyxRQUFJLGFBQWEsV0FBVyxHQUFHO0FBQzdCLG9CQUFjLFFBQVE7QUFDdEI7QUFBQSxJQUNGO0FBRUEsUUFBSSxDQUFDLGNBQWMsT0FBTztBQUN4QixZQUFNLFlBQVksYUFBYSxDQUFDO0FBQ2hDLG9CQUFjLFFBQVEsWUFBWSxVQUFVLEtBQUssS0FBSztBQUN0RDtBQUFBLElBQ0Y7QUFFQSxVQUFNLGlCQUFpQixhQUFhLEtBQUssVUFBUSxLQUFLLEtBQUssT0FBTyxjQUFjLEtBQUs7QUFFckYsUUFBSSxDQUFDLGdCQUFnQjtBQUNuQixZQUFNLFlBQVksYUFBYSxDQUFDO0FBQ2hDLG9CQUFjLFFBQVEsWUFBWSxVQUFVLEtBQUssS0FBSztBQUFBLElBQ3hEO0FBQUEsRUFDRjtBQUVBLFFBQU0sc0JBQXNCLENBQUMsZUFBdUIsV0FBbUI7QUFDckUsVUFBTSxlQUFlLG9CQUFvQjtBQUV6QyxRQUFJLGFBQWEsV0FBVyxHQUFHO0FBQzdCO0FBQUEsSUFDRjtBQUVBLFVBQU0sZUFBZSxhQUFhLFVBQVUsVUFBUSxLQUFLLEtBQUssT0FBTyxhQUFhO0FBRWxGLFFBQUksZUFBZSxHQUFHO0FBQ3BCLFlBQU0sWUFBWSxhQUFhLENBQUM7QUFDaEMsb0JBQWMsUUFBUSxZQUFZLFVBQVUsS0FBSyxLQUFLO0FBQ3REO0FBQUEsSUFDRjtBQUVBLFVBQU0sWUFBWSxLQUFLLElBQUksR0FBRyxLQUFLLElBQUksZUFBZSxRQUFRLGFBQWEsU0FBUyxDQUFDLENBQUM7QUFDdEYsVUFBTSxXQUFXLGFBQWEsU0FBUztBQUN2QyxrQkFBYyxRQUFRLFdBQVcsU0FBUyxLQUFLLEtBQUs7QUFBQSxFQUN0RDtBQUVBLFFBQU0sb0JBQW9CLENBQUMsYUFBOEI7QUFDdkQsVUFBTSxlQUFlLG9CQUFvQjtBQUV6QyxRQUFJLGFBQWEsV0FBVyxHQUFHO0FBQzdCO0FBQUEsSUFDRjtBQUVBLFVBQU0sYUFBYSxhQUFhLFVBQVUsYUFBYSxDQUFDLElBQUksYUFBYSxhQUFhLFNBQVMsQ0FBQztBQUNoRyxrQkFBYyxRQUFRLFlBQVksS0FBSyxNQUFNO0FBQUEsRUFDL0M7QUFFQSxRQUFNLDJCQUEyQixDQUFDLFVBQWtCO0FBQ2xELFVBQU0sa0JBQWtCLE1BQU0sS0FBSyxFQUFFLFlBQVk7QUFFakQsUUFBSSxDQUFDLGlCQUFpQjtBQUNwQixhQUFPO0FBQUEsSUFDVDtBQUVBLFVBQU0sZUFBZSxvQkFBb0I7QUFFekMsUUFBSSxhQUFhLFdBQVcsR0FBRztBQUM3QixhQUFPO0FBQUEsSUFDVDtBQUVBLFVBQU0sZUFBZSxjQUFjLFFBQVEsYUFBYSxVQUFVLFVBQVEsS0FBSyxLQUFLLE9BQU8sY0FBYyxLQUFLLElBQUk7QUFDbEgsVUFBTSxhQUNKLGdCQUFnQixJQUNaLENBQUMsR0FBRyxhQUFhLE1BQU0sZUFBZSxDQUFDLEdBQUcsR0FBRyxhQUFhLE1BQU0sR0FBRyxlQUFlLENBQUMsQ0FBQyxJQUNwRjtBQUVOLFVBQU0sY0FDSixXQUFXLEtBQUssVUFBUSxLQUFLLEtBQUssTUFBTSxLQUFLLEVBQUUsWUFBWSxFQUFFLFdBQVcsZUFBZSxDQUFDLEtBQ3hGLFdBQVcsS0FBSyxVQUFRLEtBQUssS0FBSyxNQUFNLEtBQUssRUFBRSxZQUFZLEVBQUUsU0FBUyxlQUFlLENBQUM7QUFFeEYsUUFBSSxDQUFDLGFBQWE7QUFDaEIsYUFBTztBQUFBLElBQ1Q7QUFFQSxrQkFBYyxZQUFZLElBQUk7QUFDOUIsV0FBTztBQUFBLEVBQ1Q7QUFHQSxRQUFNLHdCQUF3QixNQUFNLG1CQUFtQixNQUFNLFNBQVM7QUFFdEUsUUFBTSxzQkFBc0IsQ0FBQyxVQUF5QjtBQUNwRCxRQUFJLE1BQU0sV0FBVyxNQUFNLFdBQVcsTUFBTSxRQUFRO0FBQ2xELGFBQU87QUFBQSxJQUNUO0FBRUEsUUFBSSxNQUFNLElBQUksV0FBVyxLQUFLLENBQUMsTUFBTSxJQUFJLEtBQUssR0FBRztBQUMvQyxhQUFPO0FBQUEsSUFDVDtBQUVBLFVBQU0sWUFBWSxHQUFHLG1CQUFtQixLQUFLLEdBQUcsTUFBTSxJQUFJLFlBQVksQ0FBQztBQUN2RSxVQUFNLFVBQVUseUJBQXlCLFNBQVMsS0FBSyx5QkFBeUIsTUFBTSxJQUFJLFlBQVksQ0FBQztBQUV2Ryx1QkFBbUI7QUFDbkIsdUJBQW1CLFFBQVEsVUFBVSxZQUFZLE1BQU0sSUFBSSxZQUFZO0FBQ3ZFLHVCQUFtQixRQUFRLE9BQU8sV0FBVyxNQUFNO0FBQ2pELHlCQUFtQixRQUFRO0FBQzNCLHlCQUFtQixRQUFRO0FBQUEsSUFDN0IsR0FBRyxHQUFHO0FBRU4sUUFBSSxTQUFTO0FBQ1gsWUFBTSxlQUFlO0FBQUEsSUFDdkI7QUFFQSxXQUFPO0FBQUEsRUFDVDtBQUdBLFFBQU0sc0JBQXNCLENBQUMsZUFBMEM7QUFDckUsUUFBSSxXQUFXLFNBQVMsT0FBTztBQUM3QixjQUFRLFFBQVEsV0FBVyxJQUFJLFdBQVcsVUFBVTtBQUNwRDtBQUFBLElBQ0Y7QUFFQSxRQUFJLFdBQVcsU0FBUyxRQUFRO0FBRTlCLFVBQUksV0FBVyxLQUFLO0FBQ2xCLGVBQU8sS0FBSyxXQUFXLEtBQUssVUFBVSxVQUFVO0FBQUEsTUFDbEQ7QUFDQTtBQUFBLElBQ0Y7QUFFQSxZQUFRLGFBQWEsV0FBVyxFQUFFO0FBQUEsRUFDcEM7QUFFQSxRQUFNLCtCQUErQixDQUFDLE9BQXNCLGVBQTBDO0FBQ3BHLFFBQUksTUFBTSxXQUFXLE1BQU0sV0FBVyxNQUFNLFFBQVE7QUFDbEQsYUFBTztBQUFBLElBQ1Q7QUFFQSxRQUFJLE1BQU0sUUFBUSxXQUFXO0FBQzNCLFlBQU0sZUFBZTtBQUNyQiwwQkFBb0IsV0FBVyxJQUFJLEVBQUU7QUFDckMsYUFBTztBQUFBLElBQ1Q7QUFFQSxRQUFJLE1BQU0sUUFBUSxhQUFhO0FBQzdCLFlBQU0sZUFBZTtBQUNyQiwwQkFBb0IsV0FBVyxJQUFJLENBQUM7QUFDcEMsYUFBTztBQUFBLElBQ1Q7QUFFQSxRQUFJLE1BQU0sUUFBUSxRQUFRO0FBQ3hCLFlBQU0sZUFBZTtBQUNyQix3QkFBa0IsT0FBTztBQUN6QixhQUFPO0FBQUEsSUFDVDtBQUVBLFFBQUksTUFBTSxRQUFRLE9BQU87QUFDdkIsWUFBTSxlQUFlO0FBQ3JCLHdCQUFrQixLQUFLO0FBQ3ZCLGFBQU87QUFBQSxJQUNUO0FBRUEsUUFBSSxNQUFNLFFBQVEsYUFBYTtBQUM3QixZQUFNLGVBQWU7QUFFckIsV0FDRyxXQUFXLFNBQVMsWUFBWSxXQUFXLFNBQVMsU0FBUyxNQUM5RCxrQkFBa0IsTUFBTSxTQUFTLFdBQVcsRUFBRSxHQUM5QztBQUNBLGdCQUFRLGFBQWEsV0FBVyxFQUFFO0FBQ2xDLGVBQU87QUFBQSxNQUNUO0FBRUEsVUFBSSxXQUFXLFVBQVU7QUFDdkIsY0FBTSxhQUFhLGFBQWEsVUFBVSxPQUFPLFdBQVcsUUFBUTtBQUVwRSxZQUFJLFlBQVk7QUFDZCx3QkFBYyxVQUFVO0FBQUEsUUFDMUI7QUFBQSxNQUNGO0FBRUEsYUFBTztBQUFBLElBQ1Q7QUFFQSxRQUFJLE1BQU0sUUFBUSxjQUFjO0FBQzlCLFlBQU0sZUFBZTtBQUdyQixVQUFJLFdBQVcsU0FBUyxZQUFZLFdBQVcsU0FBUyxXQUFXLEdBQUc7QUFDcEUsZUFBTztBQUFBLE1BQ1Q7QUFFQSxVQUFJLENBQUMsa0JBQWtCLE1BQU0sU0FBUyxXQUFXLEVBQUUsR0FBRztBQUNwRCxnQkFBUSxhQUFhLFdBQVcsRUFBRTtBQUNsQyxlQUFPO0FBQUEsTUFDVDtBQUVBLFVBQUksV0FBVyxTQUFTLFNBQVMsR0FBRztBQUNsQyxjQUFNLGFBQWEsV0FBVyxTQUFTLENBQUM7QUFFeEMsWUFBSSxZQUFZO0FBQ2Qsd0JBQWMsVUFBVTtBQUFBLFFBQzFCO0FBQUEsTUFDRjtBQUVBLGFBQU87QUFBQSxJQUNUO0FBRUEsUUFBSSxNQUFNLFFBQVEsU0FBUztBQUN6QixZQUFNLGVBQWU7QUFFckIsMEJBQW9CLFVBQVU7QUFDOUIsYUFBTztBQUFBLElBQ1Q7QUFFQSxRQUFJLE1BQU0sUUFBUSxLQUFLO0FBQ3JCLFlBQU0sZUFBZTtBQUVyQiwwQkFBb0IsVUFBVTtBQUM5QixhQUFPO0FBQUEsSUFDVDtBQUVBLFdBQU87QUFBQSxFQUNUO0FBRUE7QUFBQSxJQUNFLE1BQU0sY0FBYztBQUFBLElBQ3BCLE9BQU0sV0FBVTtBQUNkLFVBQUksQ0FBQyxRQUFRO0FBQ1g7QUFBQSxNQUNGO0FBRUEsWUFBTSxTQUFTO0FBQ2YsWUFBTSxhQUFhLHNCQUFzQixNQUFNO0FBRS9DLFVBQUksY0FBYyxDQUFDLFFBQVEsV0FBVyxHQUFHO0FBSXZDLG1CQUFXLE1BQU07QUFBQSxVQUNmLGVBQWU7QUFBQSxVQUNmLGNBQWM7QUFBQSxRQUNoQixDQUEyQztBQUczQyxtQkFBVyxlQUFlO0FBQUEsVUFDeEIsT0FBTztBQUFBLFVBQ1AsUUFBUTtBQUFBLFVBQ1IsVUFBVTtBQUFBLFFBQ1osQ0FBQztBQUFBLE1BQ0g7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUVBLGtCQUFnQixNQUFNO0FBQ3BCLHVCQUFtQjtBQUFBLEVBQ3JCLENBQUM7QUFFRCxTQUFPO0FBQUEsSUFDTDtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRjtBQUNGOyIsIm5hbWVzIjpbXX0=