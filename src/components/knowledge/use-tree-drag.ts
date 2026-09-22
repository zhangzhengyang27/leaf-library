/* 2026-09-22 由 dev 缓存编译产物机械还原：类型标注已被 esbuild 剥除，import 说明符已尽量还原。过 node --check，未做运行验证。 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { reorderKnowledgeDocuments } from "/src/services/knowledge-documents.ts";
import { getApiErrorMessage } from "/src/services/http-client.ts";
import { useTransientToast } from "/src/composables/use-transient-toast.ts";
import {
  getAutoScrollVelocity,
  resolveDropPositionByRect
} from "/src/components/knowledge/tree-dnd.ts";
import {
  canDropTreeNode as canDropTreeNodePure,
  cloneTreeNodes,
  findTreeNode,
  normalizeNodeIds,
  removeTreeNode
} from "/src/components/knowledge/tree-utils.ts";
export const useTreeDrag = (options) => {
  const { treeNodes, expandedFolderIds, scrollRef } = options;
  const { showToastMessage } = useTransientToast();
  const treeDragSession = ref(null);
  const treeDropTarget = ref(null);
  const treeDragBlockedReason = ref(null);
  const draggingNodeId = computed(() => treeDragSession.value?.active ? treeDragSession.value.sourceNodeId : null);
  const treeRowRegistry = ref(/* @__PURE__ */ new Map());
  const treeDragHoverExpandTimer = ref(null);
  const treeDragHoverExpandNodeId = ref(null);
  const treeAutoScrollRaf = ref(null);
  const treeAutoScrollVelocity = ref(0);
  const registerTreeRow = (payload) => {
    const nextItem = {
      ...payload.item,
      parentId: payload.parentId,
      depth: payload.depth,
      index: payload.index
    };
    treeRowRegistry.value.set(nextItem.nodeId, nextItem);
    invalidateTreeRowLayout();
  };
  const unregisterTreeRow = (payload) => {
    treeRowRegistry.value.delete(payload.nodeId);
    invalidateTreeRowLayout();
  };
  const treeRowLayoutCache = ref(null);
  const invalidateTreeRowLayout = () => {
    treeRowLayoutCache.value = null;
  };
  const buildTreeRowLayout = () => {
    const container = scrollRef.value;
    const containerRect = container?.getBoundingClientRect();
    const contentOrigin = container && containerRect ? containerRect.top + container.scrollTop : 0;
    return [...treeRowRegistry.value.values()].map((row) => {
      const rect = row.element.getBoundingClientRect();
      return {
        row,
        contentTop: rect.top - contentOrigin,
        height: rect.height
      };
    }).sort((left, right) => {
      const topDiff = left.contentTop - right.contentTop;
      if (Math.abs(topDiff) > 0.5) {
        return topDiff;
      }
      return left.row.depth - right.row.depth;
    });
  };
  const getTreeRowLayout = () => {
    if (!treeRowLayoutCache.value) {
      treeRowLayoutCache.value = buildTreeRowLayout();
    }
    return treeRowLayoutCache.value;
  };
  watch(expandedFolderIds, () => {
    invalidateTreeRowLayout();
  });
  const TREE_DRAG_ACTIVATION_DISTANCE_PX = 6;
  const resolveTreeDragInputMode = (event) => {
    return event.pointerType === "touch" ? "touch" : "mouse";
  };
  const resolveTreeDropTargetFromPointer = (clientY, inputMode) => {
    const rows = getTreeRowLayout();
    const container = scrollRef.value;
    const containerRect = container?.getBoundingClientRect();
    const viewportOrigin = container && containerRect ? containerRect.top - container.scrollTop : 0;
    for (const item of rows) {
      const top = item.contentTop + viewportOrigin;
      const bottom = top + item.height;
      if (clientY < top || clientY > bottom) {
        continue;
      }
      const position = resolveDropPositionByRect(
        clientY,
        { top, height: item.height },
        item.row.type === "folder" || item.row.type === "doc"
      );
      if (position === "inside") {
        return {
          nodeId: item.row.nodeId,
          parentId: item.row.nodeId,
          index: item.row.node.children.length,
          position,
          inputMode
        };
      }
      return {
        nodeId: item.row.nodeId,
        parentId: item.row.parentId,
        index: item.row.index + (position === "after" ? 1 : 0),
        position,
        inputMode
      };
    }
    const rootRows = rows.filter((item) => item.row.parentId === null);
    if (rootRows.length === 0) {
      return {
        nodeId: null,
        parentId: null,
        index: 0,
        position: "append",
        inputMode
      };
    }
    if (!containerRect || clientY < containerRect.top || clientY > containerRect.bottom) {
      return null;
    }
    return {
      nodeId: null,
      parentId: null,
      index: rootRows.length,
      position: "append",
      inputMode
    };
  };
  const isDescendantNode = (ancestorId, nodeId) => {
    const ancestorNode = findTreeNode(treeNodes.value, ancestorId);
    if (!ancestorNode || ancestorNode.children.length === 0) {
      return false;
    }
    const stack = [...ancestorNode.children];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        break;
      }
      if (current.id === nodeId) {
        return true;
      }
      if (current.children.length > 0) {
        stack.push(...current.children);
      }
    }
    return false;
  };
  const getTreeDropTargetNode = (target) => {
    if (!target.nodeId) {
      return null;
    }
    return findTreeNode(treeNodes.value, target.nodeId);
  };
  const getTreeDropTargetParentNode = (target) => {
    if (!target.parentId) {
      return null;
    }
    return findTreeNode(treeNodes.value, target.parentId);
  };
  const resolveEffectiveParentType = (target, targetNode) => {
    if (target.position === "inside") {
      return targetNode?.type ?? null;
    }
    return target.parentId ? findTreeNode(treeNodes.value, target.parentId)?.type ?? null : null;
  };
  const canDropTreeNode = (sourceNode, target) => {
    const targetNode = getTreeDropTargetNode(target);
    return canDropTreeNodePure(
      {
        id: sourceNode.id,
        type: sourceNode.type,
        // 「带 doc 子级的文档」挂到文档下会拼出三级文档链（评审 C1）
        hasDocChildren: sourceNode.children.some((child) => child.type === "doc")
      },
      target,
      targetNode ? { id: targetNode.id, type: targetNode.type } : null,
      resolveEffectiveParentType(target, targetNode),
      isDescendantNode
    );
  };
  const resolveTreeDropBlockedReason = (sourceNode, target) => {
    const targetNode = getTreeDropTargetNode(target);
    const targetParentNode = getTreeDropTargetParentNode(target);
    const targetLabel = targetNode?.title.trim() || targetParentNode?.title.trim() || "当前位置";
    const sourceLabel = sourceNode.type === "folder" ? "分组" : "文档";
    const hasDocChildren = sourceNode.children.some((child) => child.type === "doc");
    const effectiveParentType = resolveEffectiveParentType(target, targetNode);
    if (targetNode && sourceNode.id === targetNode.id) {
      return "不能把当前节点拖到自己本身，请换到其他节点附近。";
    }
    if (target.position === "inside" && !targetNode) {
      return "当前位置不可放置，请拖到节点上下边缘，或拖到分组中部。";
    }
    if (effectiveParentType && effectiveParentType !== "folder" && effectiveParentType !== "doc") {
      return `「${targetLabel}」不能挂子级，请拖到它的上下边缘，或拖到分组中部。`;
    }
    if (effectiveParentType === "doc" && sourceNode.type === "folder") {
      return "分组不能挂到文档下，请拖到分组或根级附近。";
    }
    if (effectiveParentType === "doc" && hasDocChildren) {
      return "文档嵌套最多两级（分组 > 文档 > 文档），请先移走它的子文档。";
    }
    if (target.parentId === sourceNode.id || target.parentId && isDescendantNode(sourceNode.id, target.parentId)) {
      return `${sourceLabel}不能拖入自己或自己的子级，请改放到同级或父级附近。`;
    }
    return "当前位置不可放置，请拖到节点上下边缘，或拖到分组中部。";
  };
  const clearTreeDragHoverExpand = () => {
    if (treeDragHoverExpandTimer.value !== null) {
      window.clearTimeout(treeDragHoverExpandTimer.value);
      treeDragHoverExpandTimer.value = null;
    }
    treeDragHoverExpandNodeId.value = null;
  };
  const stopTreeAutoScroll = () => {
    if (treeAutoScrollRaf.value !== null) {
      window.cancelAnimationFrame(treeAutoScrollRaf.value);
      treeAutoScrollRaf.value = null;
    }
    treeAutoScrollVelocity.value = 0;
  };
  const runTreeAutoScroll = () => {
    const container = scrollRef.value;
    if (!container || treeAutoScrollVelocity.value === 0) {
      stopTreeAutoScroll();
      return;
    }
    container.scrollTop += treeAutoScrollVelocity.value;
    treeAutoScrollRaf.value = window.requestAnimationFrame(runTreeAutoScroll);
  };
  const syncTreeAutoScroll = (clientY) => {
    const container = scrollRef.value;
    if (!container) {
      stopTreeAutoScroll();
      return;
    }
    treeAutoScrollVelocity.value = getAutoScrollVelocity(clientY, container.getBoundingClientRect());
    if (treeAutoScrollVelocity.value === 0) {
      stopTreeAutoScroll();
      return;
    }
    if (treeAutoScrollRaf.value === null) {
      treeAutoScrollRaf.value = window.requestAnimationFrame(runTreeAutoScroll);
    }
  };
  const scheduleTreeDragHoverExpand = (node, position, inputMode) => {
    if (inputMode === "touch" || position !== "inside" || node.type !== "folder" && node.type !== "doc" || // 无子级的文档没有可展开内容，不写展开集合（评审 M4）
    node.type === "doc" && node.children.length === 0 || expandedFolderIds.value.includes(node.id)) {
      clearTreeDragHoverExpand();
      return;
    }
    if (treeDragHoverExpandNodeId.value === node.id && treeDragHoverExpandTimer.value !== null) {
      return;
    }
    clearTreeDragHoverExpand();
    treeDragHoverExpandNodeId.value = node.id;
    treeDragHoverExpandTimer.value = window.setTimeout(() => {
      expandedFolderIds.value = normalizeNodeIds([...expandedFolderIds.value, node.id]);
      treeDragHoverExpandTimer.value = null;
      treeDragHoverExpandNodeId.value = null;
    }, 560);
  };
  let touchDragGuardAttached = false;
  const handleTouchDragScrollGuard = (event) => {
    if (treeDragSession.value?.inputMode === "touch") {
      event.preventDefault();
    }
  };
  const handleTouchDragContextmenuGuard = (event) => {
    const session = treeDragSession.value;
    if (session?.active && session.inputMode === "touch") {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const attachTouchDragGuard = () => {
    if (touchDragGuardAttached) {
      return;
    }
    window.addEventListener("touchmove", handleTouchDragScrollGuard, { passive: false });
    window.addEventListener("contextmenu", handleTouchDragContextmenuGuard, true);
    touchDragGuardAttached = true;
  };
  const detachTouchDragGuard = () => {
    if (!touchDragGuardAttached) {
      return;
    }
    window.removeEventListener("touchmove", handleTouchDragScrollGuard);
    window.removeEventListener("contextmenu", handleTouchDragContextmenuGuard, true);
    touchDragGuardAttached = false;
  };
  let touchDragHandleElement = null;
  let touchDragHandlePrevTouchAction = null;
  const applyHandleTouchActionNone = (nodeId) => {
    const row = treeRowRegistry.value.get(nodeId);
    const handle = row?.element.querySelector("[data-knowledge-tree-drag-handle]") ?? null;
    if (!handle) {
      return;
    }
    touchDragHandleElement = handle;
    touchDragHandlePrevTouchAction = handle.style.touchAction || null;
    handle.style.touchAction = "none";
  };
  const restoreHandleTouchAction = () => {
    const handle = touchDragHandleElement;
    if (!handle) {
      return;
    }
    if (touchDragHandlePrevTouchAction === null) {
      handle.style.removeProperty("touch-action");
    } else {
      handle.style.touchAction = touchDragHandlePrevTouchAction;
    }
    touchDragHandleElement = null;
    touchDragHandlePrevTouchAction = null;
  };
  const releaseTouchDragGuard = () => {
    detachTouchDragGuard();
    restoreHandleTouchAction();
  };
  const resetTreeDragState = () => {
    treeDragSession.value = null;
    treeDropTarget.value = null;
    treeDragBlockedReason.value = null;
    releaseTouchDragGuard();
    invalidateTreeRowLayout();
    clearTreeDragHoverExpand();
    stopTreeAutoScroll();
  };
  const handleGlobalTreeDragMove = (event) => {
    const session = treeDragSession.value;
    if (!session || options.disabled()) {
      return;
    }
    if (event.pointerId !== session.pointerId) {
      return;
    }
    if (!session.active) {
      const dx = event.clientX - session.startX;
      const dy = event.clientY - session.startY;
      if (Math.hypot(dx, dy) < TREE_DRAG_ACTIVATION_DISTANCE_PX) {
        return;
      }
      session.active = true;
    }
    syncTreeAutoScroll(event.clientY);
    const sourceNode = findTreeNode(treeNodes.value, session.sourceNodeId);
    if (!sourceNode) {
      resetTreeDragState();
      return;
    }
    const nextDropTarget = resolveTreeDropTargetFromPointer(event.clientY, session.inputMode);
    if (!nextDropTarget) {
      treeDropTarget.value = null;
      treeDragBlockedReason.value = null;
      clearTreeDragHoverExpand();
      return;
    }
    if (!canDropTreeNode(sourceNode, nextDropTarget)) {
      treeDropTarget.value = null;
      const reason = resolveTreeDropBlockedReason(sourceNode, nextDropTarget);
      if (reason !== treeDragBlockedReason.value) {
        treeDragBlockedReason.value = reason;
        options.onBlocked?.(reason);
      }
      clearTreeDragHoverExpand();
      return;
    }
    treeDragBlockedReason.value = null;
    const targetNode = getTreeDropTargetNode(nextDropTarget);
    if (targetNode) {
      scheduleTreeDragHoverExpand(targetNode, nextDropTarget.position, nextDropTarget.inputMode);
    } else {
      clearTreeDragHoverExpand();
    }
    treeDropTarget.value = nextDropTarget;
  };
  const cancelTreeDrag = () => {
    if (!treeDragSession.value || options.reordering.value) {
      return;
    }
    resetTreeDragState();
  };
  const handleGlobalTreeDragEnd = async (event) => {
    const session = treeDragSession.value;
    if (!session || options.reordering.value) {
      return;
    }
    if (event.pointerId !== session.pointerId) {
      return;
    }
    if (!session.active) {
      resetTreeDragState();
      return;
    }
    if (!treeDropTarget.value || treeDragBlockedReason.value) {
      resetTreeDragState();
      return;
    }
    await commitTreeDrop(treeDropTarget.value);
  };
  const getChildrenRefByParentId = (parentId) => {
    if (!parentId) {
      return treeNodes.value;
    }
    const parentNode = findTreeNode(treeNodes.value, parentId);
    if (!parentNode || parentNode.type !== "folder" && parentNode.type !== "doc") {
      return null;
    }
    return parentNode.children;
  };
  const getIndexInParent = (parentId, nodeId) => {
    const siblings = getChildrenRefByParentId(parentId);
    if (!siblings) {
      return -1;
    }
    return siblings.findIndex((item) => item.id === nodeId);
  };
  const buildReorderItems = (parentIds) => {
    const visited = /* @__PURE__ */ new Set();
    return parentIds.flatMap((parentId) => {
      const key = parentId ?? "__root__";
      if (visited.has(key)) {
        return [];
      }
      visited.add(key);
      const siblings = getChildrenRefByParentId(parentId);
      if (!siblings) {
        return [];
      }
      return siblings.map((item, order) => ({
        id: item.id,
        parentId,
        order
      }));
    });
  };
  const commitTreeDrop = async (target) => {
    if (options.disabled() || !draggingNodeId.value) {
      resetTreeDragState();
      return;
    }
    const sourceNode = findTreeNode(treeNodes.value, draggingNodeId.value);
    if (!sourceNode) {
      resetTreeDragState();
      return;
    }
    if (!canDropTreeNode(sourceNode, target)) {
      resetTreeDragState();
      return;
    }
    const sourceParentId = sourceNode.parentId ?? null;
    const sourceIndex = getIndexInParent(sourceParentId, sourceNode.id);
    const targetParentId = target.parentId;
    let insertIndex = target.index;
    if (sourceParentId === targetParentId && sourceIndex >= 0 && sourceIndex < insertIndex) {
      insertIndex -= 1;
    }
    if (sourceParentId === targetParentId && sourceIndex === insertIndex) {
      resetTreeDragState();
      return;
    }
    const previousTreeSnapshot = cloneTreeNodes(treeNodes.value);
    const removed = removeTreeNode(treeNodes.value, sourceNode.id);
    if (!removed) {
      resetTreeDragState();
      return;
    }
    const targetList = getChildrenRefByParentId(targetParentId);
    if (!targetList) {
      await options.refreshTree();
      resetTreeDragState();
      return;
    }
    const clampedIndex = Math.max(0, Math.min(insertIndex, targetList.length));
    removed.node.parentId = targetParentId;
    targetList.splice(clampedIndex, 0, removed.node);
    const reorderItems = buildReorderItems([sourceParentId, targetParentId]);
    if (reorderItems.length === 0) {
      resetTreeDragState();
      return;
    }
    options.reordering.value = true;
    try {
      const reorderResult = await reorderKnowledgeDocuments({
        kbId: options.kbId.value,
        items: reorderItems
      });
      if (!reorderResult.ok) {
        throw new Error("排序请求未成功提交。");
      }
      if (targetParentId && !expandedFolderIds.value.includes(targetParentId)) {
        expandedFolderIds.value = [...expandedFolderIds.value, targetParentId];
      }
      await options.refreshTree();
    } catch (error) {
      treeNodes.value = previousTreeSnapshot;
      options.ensureFocusedNode();
      await options.refreshTree();
      showToastMessage(getApiErrorMessage(error, "排序提交失败，已恢复原状。"), "error");
    } finally {
      options.reordering.value = false;
      resetTreeDragState();
    }
  };
  const handleGlobalTreeKeydown = (event) => {
    if (event.key !== "Escape") {
      return;
    }
    cancelTreeDrag();
  };
  const attach = () => {
    window.addEventListener("pointermove", handleGlobalTreeDragMove);
    window.addEventListener("pointerup", handleGlobalTreeDragEnd);
    window.addEventListener("pointercancel", cancelTreeDrag);
    window.addEventListener("blur", cancelTreeDrag);
    window.addEventListener("keydown", handleGlobalTreeKeydown);
  };
  const detach = () => {
    window.removeEventListener("pointermove", handleGlobalTreeDragMove);
    window.removeEventListener("pointerup", handleGlobalTreeDragEnd);
    window.removeEventListener("pointercancel", cancelTreeDrag);
    window.removeEventListener("blur", cancelTreeDrag);
    window.removeEventListener("keydown", handleGlobalTreeKeydown);
  };
  const beginDrag = (payload) => {
    releaseTouchDragGuard();
    clearTreeDragHoverExpand();
    stopTreeAutoScroll();
    invalidateTreeRowLayout();
    treeDragSession.value = {
      pointerId: payload.event.pointerId,
      sourceNodeId: payload.node.id,
      inputMode: resolveTreeDragInputMode(payload.event),
      startedAt: Date.now(),
      startX: payload.event.clientX,
      startY: payload.event.clientY,
      // 位移超过阈值（见 handleGlobalTreeDragMove）才置为 true
      active: false
    };
    treeDropTarget.value = null;
    treeDragBlockedReason.value = null;
    if (treeDragSession.value.inputMode === "touch") {
      attachTouchDragGuard();
      applyHandleTouchActionNone(payload.node.id);
    }
  };
  onMounted(() => {
    attach();
  });
  onBeforeUnmount(() => {
    detach();
    releaseTouchDragGuard();
    clearTreeDragHoverExpand();
    stopTreeAutoScroll();
  });
  return {
    treeDragSession,
    treeDropTarget,
    treeDragBlockedReason,
    draggingNodeId,
    registerTreeRow,
    unregisterTreeRow,
    beginDrag,
    resetTreeDragState,
    isDescendantNode,
    clearTreeDragHoverExpand,
    stopTreeAutoScroll
  };
};

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInVzZS10cmVlLWRyYWcudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiDnn6Xor4blupPmlofmoaPmoJHmi5bmi70gY29tcG9zYWJsZeOAglxuICpcbiAqIOS7jiBLbm93bGVkZ2VXb3Jrc3BhY2VMYXlvdXQg5oq95Ye677ya5ouW5ou95Lya6K+d44CB6KGM5rOo5YaM6KGo44CB5oyH6ZKI5ZG95Lit6Kej5p6Q44CBXG4gKiDmlL7nva7moKHpqozjgIHmgqzlgZzoh6rliqjlsZXlvIDjgIHlrrnlmajoh6rliqjmu5rliqjvvIzku6Xlj4rmlL7nva7mj5DkuqTvvIjkuZDop4Lmm7TmlrAgK1xuICogcmVvcmRlciBBUEkgKyDlpLHotKXlm57mu5rvvInjgILmi5bmi73lvIDlp4vnmoTkuJrliqHlia/kvZznlKjvvIjlhbPoj5zljZXjgIHogZrnhKboioLngrnvvIlcbiAqIOeUseiwg+eUqOaWueWcqOiHquW3seeahCBzdGFydCDljIXoo4Xph4zlpITnkIbjgIJcbiAqXG4gKiDop6blsY/liIblt6XvvIhHNe+8ie+8mumVv+aMiSAyNTBtcyDnmoTmiYvlir/orqHml7blnKggS25vd2xlZGdlVHJlZU5vZGXvvIhwb2ludGVyZG93biDlhaXlj6NcbiAqIOWcqOWug+aJi+S4iu+8ie+8m+S8muivneS4gOaXpuW7uueri++8jOacrOaWh+S7tui0n+i0o+S8muivnee6p+mYsuaKpOKAlOKAlOmdniBwYXNzaXZlIHRvdWNobW92ZVxuICogcHJldmVudERlZmF1bHQg6Zi75pat5Y6f55Sf5rua5Yqo44CB5oqK5omLIHRvdWNoLWFjdGlvbjpub25l44CBYWN0aXZlIOS8muivneWOi+mVv+aMieiPnOWNleOAglxuICovXG5pbXBvcnQgeyBjb21wdXRlZCwgb25CZWZvcmVVbm1vdW50LCBvbk1vdW50ZWQsIHJlZiwgd2F0Y2gsIHR5cGUgUmVmIH0gZnJvbSBcInZ1ZVwiXG5pbXBvcnQgdHlwZSB7IEtub3dsZWRnZURvY3VtZW50VHJlZU5vZGUgfSBmcm9tIFwiQC9zZXJ2aWNlcy9rbm93bGVkZ2UtZG9jdW1lbnRzXCJcbmltcG9ydCB7IHJlb3JkZXJLbm93bGVkZ2VEb2N1bWVudHMgfSBmcm9tIFwiQC9zZXJ2aWNlcy9rbm93bGVkZ2UtZG9jdW1lbnRzXCJcbmltcG9ydCB7IGdldEFwaUVycm9yTWVzc2FnZSB9IGZyb20gXCJAL3NlcnZpY2VzL2h0dHAtY2xpZW50XCJcbmltcG9ydCB7IHVzZVRyYW5zaWVudFRvYXN0IH0gZnJvbSBcIkAvY29tcG9zYWJsZXMvdXNlLXRyYW5zaWVudC10b2FzdFwiXG5pbXBvcnQge1xuICBnZXRBdXRvU2Nyb2xsVmVsb2NpdHksXG4gIHJlc29sdmVEcm9wUG9zaXRpb25CeVJlY3QsXG4gIHR5cGUgVHJlZURyYWdTZXNzaW9uLFxuICB0eXBlIFRyZWVEcm9wUG9zaXRpb24sXG4gIHR5cGUgVHJlZURyb3BUYXJnZXQsXG4gIHR5cGUgVHJlZVJvd1JlZ2lzdHJ5SXRlbSxcbn0gZnJvbSBcIkAvY29tcG9uZW50cy9rbm93bGVkZ2UvdHJlZS1kbmRcIlxuaW1wb3J0IHtcbiAgY2FuRHJvcFRyZWVOb2RlIGFzIGNhbkRyb3BUcmVlTm9kZVB1cmUsXG4gIGNsb25lVHJlZU5vZGVzLFxuICBmaW5kVHJlZU5vZGUsXG4gIG5vcm1hbGl6ZU5vZGVJZHMsXG4gIHJlbW92ZVRyZWVOb2RlLFxufSBmcm9tIFwiQC9jb21wb25lbnRzL2tub3dsZWRnZS90cmVlLXV0aWxzXCJcblxuZXhwb3J0IGNvbnN0IHVzZVRyZWVEcmFnID0gKG9wdGlvbnM6IHtcbiAgLyoqIOW9k+WJjeefpeivhuW6kyBpZO+8iOaOkuW6j+aPkOS6pOaXtuS9v+eUqO+8iSAqL1xuICBrYklkOiBSZWY8c3RyaW5nPlxuICAvKiog5b2T5YmN55+l6K+G5bqT5paH5qGj5qCR77yI5ZON5bqU5byP77yM5ouW5ou95ZG95Lit5qCh6aqM5LiO5bGV5byA5Z+65LqO5a6D77yJICovXG4gIHRyZWVOb2RlczogUmVmPEtub3dsZWRnZURvY3VtZW50VHJlZU5vZGVbXT5cbiAgLyoqIOWxleW8gOeahOWuueWZqCBpZCDpm4blkIjvvIjliIbnu4TkuI7mjILlrZDnuqfnmoTmlofmoaPvvJvmgqzlgZzlsZXlvIDkuI7mj5DkuqTlkI7lsZXlvIDnm67moIflrrnlmajkvJrlhpnlhaXvvIkgKi9cbiAgZXhwYW5kZWRGb2xkZXJJZHM6IFJlZjxzdHJpbmdbXT5cbiAgLyoqIOagkemdouadv+a7muWKqOWuueWZqO+8iOeUqOS6juWRveS4reWFnOW6leS4juiHquWKqOa7muWKqO+8iSAqL1xuICBzY3JvbGxSZWY6IFJlZjxIVE1MRWxlbWVudCB8IG51bGw+XG4gIC8qKiDmi5bmi73mmK/lkKbooqvnpoHnlKjvvIjml6DnvJbovpHmnYPpmZAgLyDliqDovb3kuK0gLyDmj5DkuqTkuK3vvIkgKi9cbiAgZGlzYWJsZWQ6ICgpID0+IGJvb2xlYW5cbiAgLyoqIOmHjeaOkuW6j+aPkOS6pOS4reagh+iusO+8iGNvbXBvc2FibGUg5Lya5YaZ5YWlIHRydWUvZmFsc2XvvIzpmLvmraLlj5bmtojkuI7lho3mrKHmj5DkuqTvvIkgKi9cbiAgcmVvcmRlcmluZzogUmVmPGJvb2xlYW4+XG4gIC8qKiDmi5blhaXmlrDnm67lvZXlsZXlvIDlkI7liLfmlrDmlofmoaPmoJEgKi9cbiAgcmVmcmVzaFRyZWU6ICgpID0+IFByb21pc2U8dm9pZD5cbiAgLyoqIOWbnua7muW/q+eFp+WQjuS/ruWkjeiBmueEpuiKgueCuSAqL1xuICBlbnN1cmVGb2N1c2VkTm9kZTogKCkgPT4gdm9pZFxuICAvKiog6Z2e5rOV6JC954K55o+Q56S65Zue6LCD77yaYmxvY2tlZCByZWFzb24g5Y+Y5YyW5pe26YCP5Ye677yI6LCD55So5pa55o6lIHRvYXN0IOetieaPkOekuuWxgu+8iSAqL1xuICBvbkJsb2NrZWQ/OiAocmVhc29uOiBzdHJpbmcpID0+IHZvaWRcbn0pID0+IHtcbiAgY29uc3QgeyB0cmVlTm9kZXMsIGV4cGFuZGVkRm9sZGVySWRzLCBzY3JvbGxSZWYgfSA9IG9wdGlvbnNcbiAgY29uc3QgeyBzaG93VG9hc3RNZXNzYWdlIH0gPSB1c2VUcmFuc2llbnRUb2FzdCgpXG5cbiAgY29uc3QgdHJlZURyYWdTZXNzaW9uID0gcmVmPFRyZWVEcmFnU2Vzc2lvbiB8IG51bGw+KG51bGwpXG4gIGNvbnN0IHRyZWVEcm9wVGFyZ2V0ID0gcmVmPFRyZWVEcm9wVGFyZ2V0IHwgbnVsbD4obnVsbClcbiAgY29uc3QgdHJlZURyYWdCbG9ja2VkUmVhc29uID0gcmVmPHN0cmluZyB8IG51bGw+KG51bGwpXG4gIC8vIOacqui/h+S9jeenu+mYiOWAvOeahOaJi+WKv+S4jeaatOmcsuS4uuOAjOaLluaLveS4reOAje+8jOmBv+WFjeihjOmrmOS6ri/miormiYvmoLflvI/or6/kuq5cbiAgY29uc3QgZHJhZ2dpbmdOb2RlSWQgPSBjb21wdXRlZCgoKSA9PiAodHJlZURyYWdTZXNzaW9uLnZhbHVlPy5hY3RpdmUgPyB0cmVlRHJhZ1Nlc3Npb24udmFsdWUuc291cmNlTm9kZUlkIDogbnVsbCkpXG4gIC8vIE1hcCDmjIkgbm9kZUlkIOWtmOWPlu+8jOazqOWGjC/ms6jplIAgTygxKe+8jOmBv+WFjeaVtOe7hCBmaWx0ZXIrcmVwbGFjZSDnmoQgTyhOwrIpXG4gIGNvbnN0IHRyZWVSb3dSZWdpc3RyeSA9IHJlZihuZXcgTWFwPHN0cmluZywgVHJlZVJvd1JlZ2lzdHJ5SXRlbT4oKSlcbiAgY29uc3QgdHJlZURyYWdIb3ZlckV4cGFuZFRpbWVyID0gcmVmPG51bWJlciB8IG51bGw+KG51bGwpXG4gIGNvbnN0IHRyZWVEcmFnSG92ZXJFeHBhbmROb2RlSWQgPSByZWY8c3RyaW5nIHwgbnVsbD4obnVsbClcbiAgY29uc3QgdHJlZUF1dG9TY3JvbGxSYWYgPSByZWY8bnVtYmVyIHwgbnVsbD4obnVsbClcbiAgY29uc3QgdHJlZUF1dG9TY3JvbGxWZWxvY2l0eSA9IHJlZigwKVxuXG4gIGNvbnN0IHJlZ2lzdGVyVHJlZVJvdyA9IChwYXlsb2FkOiB7XG4gICAgaXRlbTogVHJlZVJvd1JlZ2lzdHJ5SXRlbVxuICAgIHBhcmVudElkOiBzdHJpbmcgfCBudWxsXG4gICAgZGVwdGg6IG51bWJlclxuICAgIGluZGV4OiBudW1iZXJcbiAgfSkgPT4ge1xuICAgIGNvbnN0IG5leHRJdGVtOiBUcmVlUm93UmVnaXN0cnlJdGVtID0ge1xuICAgICAgLi4ucGF5bG9hZC5pdGVtLFxuICAgICAgcGFyZW50SWQ6IHBheWxvYWQucGFyZW50SWQsXG4gICAgICBkZXB0aDogcGF5bG9hZC5kZXB0aCxcbiAgICAgIGluZGV4OiBwYXlsb2FkLmluZGV4LFxuICAgIH1cbiAgICB0cmVlUm93UmVnaXN0cnkudmFsdWUuc2V0KG5leHRJdGVtLm5vZGVJZCwgbmV4dEl0ZW0pXG4gICAgaW52YWxpZGF0ZVRyZWVSb3dMYXlvdXQoKVxuICB9XG5cbiAgY29uc3QgdW5yZWdpc3RlclRyZWVSb3cgPSAocGF5bG9hZDogeyBub2RlSWQ6IHN0cmluZyB9KSA9PiB7XG4gICAgdHJlZVJvd1JlZ2lzdHJ5LnZhbHVlLmRlbGV0ZShwYXlsb2FkLm5vZGVJZClcbiAgICBpbnZhbGlkYXRlVHJlZVJvd0xheW91dCgpXG4gIH1cblxuICAvKipcbiAgICog6KGM5biD5bGA57yT5a2Y77yII+aAp+iDve+8ie+8muWRveS4reWIpOWumuiLpemAkOW4p+WFqOmHj+aOkuW6jyArIOmAkOihjCBnZXRCb3VuZGluZ0NsaWVudFJlY3TvvIxcbiAgICog5aSn5qCR5LiK5q+P5bin6YO95pivIE8oTiBsb2cgTikg5qyh5by65Yi25biD5bGA6K+75Y+W44CC5pS55Li65Lya6K+d5YaF57yT5a2Y44CM6KGM6aG26L6555u45a+55rua5YqoXG4gICAqIOWGheWuuemhtumDqOeahOWBj+enu+OAjeKAlOKAlOivpeWdkOagh+S4jemaj+WuueWZqOa7muWKqC/nqpflj6Pnp7vliqjlj5jljJbvvJvooYzmjILovb0v5Y246L2944CB5bGV5byA5oCBXG4gICAqIOWPmOWMluaXtuaVtOS9k+WkseaViOmHjeW7uuOAglxuICAgKi9cbiAgdHlwZSBUcmVlUm93TGF5b3V0SXRlbSA9IHtcbiAgICByb3c6IFRyZWVSb3dSZWdpc3RyeUl0ZW1cbiAgICBjb250ZW50VG9wOiBudW1iZXJcbiAgICBoZWlnaHQ6IG51bWJlclxuICB9XG5cbiAgY29uc3QgdHJlZVJvd0xheW91dENhY2hlID0gcmVmPFRyZWVSb3dMYXlvdXRJdGVtW10gfCBudWxsPihudWxsKVxuXG4gIGNvbnN0IGludmFsaWRhdGVUcmVlUm93TGF5b3V0ID0gKCkgPT4ge1xuICAgIHRyZWVSb3dMYXlvdXRDYWNoZS52YWx1ZSA9IG51bGxcbiAgfVxuXG4gIGNvbnN0IGJ1aWxkVHJlZVJvd0xheW91dCA9ICgpID0+IHtcbiAgICBjb25zdCBjb250YWluZXIgPSBzY3JvbGxSZWYudmFsdWVcbiAgICBjb25zdCBjb250YWluZXJSZWN0ID0gY29udGFpbmVyPy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuICAgIC8vIOihjOinhuWPo+WdkOagh+aNoueul+WbnuWGheWuueWdkOagh+eahOWfuuWHhu+8muWuueWZqOinhuWPo+mhtiArIOa7muWKqOWBj+enuyA9IOWGheWuuemhtlxuICAgIGNvbnN0IGNvbnRlbnRPcmlnaW4gPSBjb250YWluZXIgJiYgY29udGFpbmVyUmVjdCA/IGNvbnRhaW5lclJlY3QudG9wICsgY29udGFpbmVyLnNjcm9sbFRvcCA6IDBcblxuICAgIHJldHVybiBbLi4udHJlZVJvd1JlZ2lzdHJ5LnZhbHVlLnZhbHVlcygpXVxuICAgICAgLm1hcChyb3cgPT4ge1xuICAgICAgICBjb25zdCByZWN0ID0gcm93LmVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICByb3csXG4gICAgICAgICAgY29udGVudFRvcDogcmVjdC50b3AgLSBjb250ZW50T3JpZ2luLFxuICAgICAgICAgIGhlaWdodDogcmVjdC5oZWlnaHQsXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuc29ydCgobGVmdCwgcmlnaHQpID0+IHtcbiAgICAgICAgY29uc3QgdG9wRGlmZiA9IGxlZnQuY29udGVudFRvcCAtIHJpZ2h0LmNvbnRlbnRUb3BcblxuICAgICAgICBpZiAoTWF0aC5hYnModG9wRGlmZikgPiAwLjUpIHtcbiAgICAgICAgICByZXR1cm4gdG9wRGlmZlxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGxlZnQucm93LmRlcHRoIC0gcmlnaHQucm93LmRlcHRoXG4gICAgICB9KVxuICB9XG5cbiAgLyoqIOWPlue8k+WtmOW4g+WxgO+8m+WkseaViOWQjummluasoeiuv+mXruaXtumHjeW7uuW5tuWbnuWhqyAqL1xuICBjb25zdCBnZXRUcmVlUm93TGF5b3V0ID0gKCkgPT4ge1xuICAgIGlmICghdHJlZVJvd0xheW91dENhY2hlLnZhbHVlKSB7XG4gICAgICB0cmVlUm93TGF5b3V0Q2FjaGUudmFsdWUgPSBidWlsZFRyZWVSb3dMYXlvdXQoKVxuICAgIH1cblxuICAgIHJldHVybiB0cmVlUm93TGF5b3V0Q2FjaGUudmFsdWVcbiAgfVxuXG4gIC8qKiDmgqzlgZzlsZXlvIAv5pS26LW35Lya5aKe5Yig6KGM5bm25o6o56e75ZCO57ut6KGM5L2N572u77yM5bGV5byA5oCB5Y+Y5YyW5Y2z5aSx5pWI57yT5a2YICovXG4gIHdhdGNoKGV4cGFuZGVkRm9sZGVySWRzLCAoKSA9PiB7XG4gICAgaW52YWxpZGF0ZVRyZWVSb3dMYXlvdXQoKVxuICB9KVxuXG4gIC8qKiDmi5bmi73mv4DmtLvnmoTkvY3np7vpmIjlgLzvvJrotoXov4for6Xot53nprvmiY3orqTlrprkuLrmi5bmi73miYvlir8gKi9cbiAgY29uc3QgVFJFRV9EUkFHX0FDVElWQVRJT05fRElTVEFOQ0VfUFggPSA2XG5cbiAgY29uc3QgcmVzb2x2ZVRyZWVEcmFnSW5wdXRNb2RlID0gKGV2ZW50OiBQb2ludGVyRXZlbnQpOiBUcmVlRHJhZ1Nlc3Npb25bXCJpbnB1dE1vZGVcIl0gPT4ge1xuICAgIHJldHVybiBldmVudC5wb2ludGVyVHlwZSA9PT0gXCJ0b3VjaFwiID8gXCJ0b3VjaFwiIDogXCJtb3VzZVwiXG4gIH1cblxuICBjb25zdCByZXNvbHZlVHJlZURyb3BUYXJnZXRGcm9tUG9pbnRlciA9IChcbiAgICBjbGllbnRZOiBudW1iZXIsXG4gICAgaW5wdXRNb2RlOiBUcmVlRHJhZ1Nlc3Npb25bXCJpbnB1dE1vZGVcIl1cbiAgKTogVHJlZURyb3BUYXJnZXQgfCBudWxsID0+IHtcbiAgICBjb25zdCByb3dzID0gZ2V0VHJlZVJvd0xheW91dCgpXG4gICAgY29uc3QgY29udGFpbmVyID0gc2Nyb2xsUmVmLnZhbHVlXG4gICAgY29uc3QgY29udGFpbmVyUmVjdCA9IGNvbnRhaW5lcj8uZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcbiAgICAvLyDlhoXlrrnlnZDmoIfmjaLnrpflm57op4blj6PlnZDmoIfvvJrnvJPlrZggY29udGVudFRvcCArIOWuueWZqOinhuWPo+mhtiAtIOW9k+WJjea7muWKqOWBj+enu1xuICAgIGNvbnN0IHZpZXdwb3J0T3JpZ2luID0gY29udGFpbmVyICYmIGNvbnRhaW5lclJlY3QgPyBjb250YWluZXJSZWN0LnRvcCAtIGNvbnRhaW5lci5zY3JvbGxUb3AgOiAwXG5cbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2Ygcm93cykge1xuICAgICAgY29uc3QgdG9wID0gaXRlbS5jb250ZW50VG9wICsgdmlld3BvcnRPcmlnaW5cbiAgICAgIGNvbnN0IGJvdHRvbSA9IHRvcCArIGl0ZW0uaGVpZ2h0XG5cbiAgICAgIGlmIChjbGllbnRZIDwgdG9wIHx8IGNsaWVudFkgPiBib3R0b20pIHtcbiAgICAgICAgY29udGludWVcbiAgICAgIH1cblxuICAgICAgY29uc3QgcG9zaXRpb24gPSByZXNvbHZlRHJvcFBvc2l0aW9uQnlSZWN0KFxuICAgICAgICBjbGllbnRZLFxuICAgICAgICB7IHRvcCwgaGVpZ2h0OiBpdGVtLmhlaWdodCB9LFxuICAgICAgICBpdGVtLnJvdy50eXBlID09PSBcImZvbGRlclwiIHx8IGl0ZW0ucm93LnR5cGUgPT09IFwiZG9jXCJcbiAgICAgIClcblxuICAgICAgaWYgKHBvc2l0aW9uID09PSBcImluc2lkZVwiKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgbm9kZUlkOiBpdGVtLnJvdy5ub2RlSWQsXG4gICAgICAgICAgcGFyZW50SWQ6IGl0ZW0ucm93Lm5vZGVJZCxcbiAgICAgICAgICBpbmRleDogaXRlbS5yb3cubm9kZS5jaGlsZHJlbi5sZW5ndGgsXG4gICAgICAgICAgcG9zaXRpb24sXG4gICAgICAgICAgaW5wdXRNb2RlLFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIG5vZGVJZDogaXRlbS5yb3cubm9kZUlkLFxuICAgICAgICBwYXJlbnRJZDogaXRlbS5yb3cucGFyZW50SWQsXG4gICAgICAgIGluZGV4OiBpdGVtLnJvdy5pbmRleCArIChwb3NpdGlvbiA9PT0gXCJhZnRlclwiID8gMSA6IDApLFxuICAgICAgICBwb3NpdGlvbixcbiAgICAgICAgaW5wdXRNb2RlLFxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHJvb3RSb3dzID0gcm93cy5maWx0ZXIoaXRlbSA9PiBpdGVtLnJvdy5wYXJlbnRJZCA9PT0gbnVsbClcblxuICAgIGlmIChyb290Um93cy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG5vZGVJZDogbnVsbCxcbiAgICAgICAgcGFyZW50SWQ6IG51bGwsXG4gICAgICAgIGluZGV4OiAwLFxuICAgICAgICBwb3NpdGlvbjogXCJhcHBlbmRcIixcbiAgICAgICAgaW5wdXRNb2RlLFxuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghY29udGFpbmVyUmVjdCB8fCBjbGllbnRZIDwgY29udGFpbmVyUmVjdC50b3AgfHwgY2xpZW50WSA+IGNvbnRhaW5lclJlY3QuYm90dG9tKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBub2RlSWQ6IG51bGwsXG4gICAgICBwYXJlbnRJZDogbnVsbCxcbiAgICAgIGluZGV4OiByb290Um93cy5sZW5ndGgsXG4gICAgICBwb3NpdGlvbjogXCJhcHBlbmRcIixcbiAgICAgIGlucHV0TW9kZSxcbiAgICB9XG4gIH1cblxuICBjb25zdCBpc0Rlc2NlbmRhbnROb2RlID0gKGFuY2VzdG9ySWQ6IHN0cmluZywgbm9kZUlkOiBzdHJpbmcpID0+IHtcbiAgICBjb25zdCBhbmNlc3Rvck5vZGUgPSBmaW5kVHJlZU5vZGUodHJlZU5vZGVzLnZhbHVlLCBhbmNlc3RvcklkKVxuXG4gICAgaWYgKCFhbmNlc3Rvck5vZGUgfHwgYW5jZXN0b3JOb2RlLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuXG4gICAgY29uc3Qgc3RhY2sgPSBbLi4uYW5jZXN0b3JOb2RlLmNoaWxkcmVuXVxuXG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IGN1cnJlbnQgPSBzdGFjay5wb3AoKVxuXG4gICAgICBpZiAoIWN1cnJlbnQpIHtcbiAgICAgICAgYnJlYWtcbiAgICAgIH1cblxuICAgICAgaWYgKGN1cnJlbnQuaWQgPT09IG5vZGVJZCkge1xuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgfVxuXG4gICAgICBpZiAoY3VycmVudC5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgIHN0YWNrLnB1c2goLi4uY3VycmVudC5jaGlsZHJlbilcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIGNvbnN0IGdldFRyZWVEcm9wVGFyZ2V0Tm9kZSA9ICh0YXJnZXQ6IFRyZWVEcm9wVGFyZ2V0KSA9PiB7XG4gICAgaWYgKCF0YXJnZXQubm9kZUlkKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHJldHVybiBmaW5kVHJlZU5vZGUodHJlZU5vZGVzLnZhbHVlLCB0YXJnZXQubm9kZUlkKVxuICB9XG5cbiAgY29uc3QgZ2V0VHJlZURyb3BUYXJnZXRQYXJlbnROb2RlID0gKHRhcmdldDogVHJlZURyb3BUYXJnZXQpID0+IHtcbiAgICBpZiAoIXRhcmdldC5wYXJlbnRJZCkge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICByZXR1cm4gZmluZFRyZWVOb2RlKHRyZWVOb2Rlcy52YWx1ZSwgdGFyZ2V0LnBhcmVudElkKVxuICB9XG5cbiAgLyoqIOiuoeeul+OAjOacieaViOeItue6p+OAjeexu+Wei++8mmluc2lkZSA9IOebruagh+ihjOiHqui6q++8m2JlZm9yZS9hZnRlciA9IOebruagh+ihjOeItue6p++8m+aguee6pyA9IG51bGzjgIJcbiAgICogIOS4juWQjuerryBwYXJlbnRSdWxlVmlvbGF0aW9uIOWQjOa6kOeahOa3seW6pi/niLbnuqfnsbvlnovop4TliJnpg73ku6XmraTkuLrlh4bvvIjor4TlrqEgQzEvSTHvvInjgIIgKi9cbiAgY29uc3QgcmVzb2x2ZUVmZmVjdGl2ZVBhcmVudFR5cGUgPSAodGFyZ2V0OiBUcmVlRHJvcFRhcmdldCwgdGFyZ2V0Tm9kZTogS25vd2xlZGdlRG9jdW1lbnRUcmVlTm9kZSB8IG51bGwpID0+IHtcbiAgICBpZiAodGFyZ2V0LnBvc2l0aW9uID09PSBcImluc2lkZVwiKSB7XG4gICAgICByZXR1cm4gdGFyZ2V0Tm9kZT8udHlwZSA/PyBudWxsXG4gICAgfVxuXG4gICAgcmV0dXJuIHRhcmdldC5wYXJlbnRJZCA/IChmaW5kVHJlZU5vZGUodHJlZU5vZGVzLnZhbHVlLCB0YXJnZXQucGFyZW50SWQpPy50eXBlID8/IG51bGwpIDogbnVsbFxuICB9XG5cbiAgY29uc3QgY2FuRHJvcFRyZWVOb2RlID0gKHNvdXJjZU5vZGU6IEtub3dsZWRnZURvY3VtZW50VHJlZU5vZGUsIHRhcmdldDogVHJlZURyb3BUYXJnZXQpID0+IHtcbiAgICBjb25zdCB0YXJnZXROb2RlID0gZ2V0VHJlZURyb3BUYXJnZXROb2RlKHRhcmdldClcblxuICAgIHJldHVybiBjYW5Ecm9wVHJlZU5vZGVQdXJlKFxuICAgICAge1xuICAgICAgICBpZDogc291cmNlTm9kZS5pZCxcbiAgICAgICAgdHlwZTogc291cmNlTm9kZS50eXBlLFxuICAgICAgICAvLyDjgIzluKYgZG9jIOWtkOe6p+eahOaWh+aho+OAjeaMguWIsOaWh+aho+S4i+S8muaLvOWHuuS4iee6p+aWh+aho+mTvu+8iOivhOWuoSBDMe+8iVxuICAgICAgICBoYXNEb2NDaGlsZHJlbjogc291cmNlTm9kZS5jaGlsZHJlbi5zb21lKGNoaWxkID0+IGNoaWxkLnR5cGUgPT09IFwiZG9jXCIpLFxuICAgICAgfSxcbiAgICAgIHRhcmdldCxcbiAgICAgIHRhcmdldE5vZGUgPyB7IGlkOiB0YXJnZXROb2RlLmlkLCB0eXBlOiB0YXJnZXROb2RlLnR5cGUgfSA6IG51bGwsXG4gICAgICByZXNvbHZlRWZmZWN0aXZlUGFyZW50VHlwZSh0YXJnZXQsIHRhcmdldE5vZGUpLFxuICAgICAgaXNEZXNjZW5kYW50Tm9kZVxuICAgIClcbiAgfVxuXG4gIGNvbnN0IHJlc29sdmVUcmVlRHJvcEJsb2NrZWRSZWFzb24gPSAoc291cmNlTm9kZTogS25vd2xlZGdlRG9jdW1lbnRUcmVlTm9kZSwgdGFyZ2V0OiBUcmVlRHJvcFRhcmdldCkgPT4ge1xuICAgIGNvbnN0IHRhcmdldE5vZGUgPSBnZXRUcmVlRHJvcFRhcmdldE5vZGUodGFyZ2V0KVxuICAgIGNvbnN0IHRhcmdldFBhcmVudE5vZGUgPSBnZXRUcmVlRHJvcFRhcmdldFBhcmVudE5vZGUodGFyZ2V0KVxuICAgIGNvbnN0IHRhcmdldExhYmVsID0gdGFyZ2V0Tm9kZT8udGl0bGUudHJpbSgpIHx8IHRhcmdldFBhcmVudE5vZGU/LnRpdGxlLnRyaW0oKSB8fCBcIuW9k+WJjeS9jee9rlwiXG4gICAgY29uc3Qgc291cmNlTGFiZWwgPSBzb3VyY2VOb2RlLnR5cGUgPT09IFwiZm9sZGVyXCIgPyBcIuWIhue7hFwiIDogXCLmlofmoaNcIlxuICAgIGNvbnN0IGhhc0RvY0NoaWxkcmVuID0gc291cmNlTm9kZS5jaGlsZHJlbi5zb21lKGNoaWxkID0+IGNoaWxkLnR5cGUgPT09IFwiZG9jXCIpXG4gICAgY29uc3QgZWZmZWN0aXZlUGFyZW50VHlwZSA9IHJlc29sdmVFZmZlY3RpdmVQYXJlbnRUeXBlKHRhcmdldCwgdGFyZ2V0Tm9kZSlcblxuICAgIGlmICh0YXJnZXROb2RlICYmIHNvdXJjZU5vZGUuaWQgPT09IHRhcmdldE5vZGUuaWQpIHtcbiAgICAgIHJldHVybiBcIuS4jeiDveaKiuW9k+WJjeiKgueCueaLluWIsOiHquW3seacrOi6q++8jOivt+aNouWIsOWFtuS7luiKgueCuemZhOi/keOAglwiXG4gICAgfVxuXG4gICAgaWYgKHRhcmdldC5wb3NpdGlvbiA9PT0gXCJpbnNpZGVcIiAmJiAhdGFyZ2V0Tm9kZSkge1xuICAgICAgcmV0dXJuIFwi5b2T5YmN5L2N572u5LiN5Y+v5pS+572u77yM6K+35ouW5Yiw6IqC54K55LiK5LiL6L6557yY77yM5oiW5ouW5Yiw5YiG57uE5Lit6YOo44CCXCJcbiAgICB9XG5cbiAgICBpZiAoZWZmZWN0aXZlUGFyZW50VHlwZSAmJiBlZmZlY3RpdmVQYXJlbnRUeXBlICE9PSBcImZvbGRlclwiICYmIGVmZmVjdGl2ZVBhcmVudFR5cGUgIT09IFwiZG9jXCIpIHtcbiAgICAgIHJldHVybiBg44CMJHt0YXJnZXRMYWJlbH3jgI3kuI3og73mjILlrZDnuqfvvIzor7fmi5bliLDlroPnmoTkuIrkuIvovrnnvJjvvIzmiJbmi5bliLDliIbnu4TkuK3pg6jjgIJgXG4gICAgfVxuXG4gICAgaWYgKGVmZmVjdGl2ZVBhcmVudFR5cGUgPT09IFwiZG9jXCIgJiYgc291cmNlTm9kZS50eXBlID09PSBcImZvbGRlclwiKSB7XG4gICAgICByZXR1cm4gXCLliIbnu4TkuI3og73mjILliLDmlofmoaPkuIvvvIzor7fmi5bliLDliIbnu4TmiJbmoLnnuqfpmYTov5HjgIJcIlxuICAgIH1cblxuICAgIGlmIChlZmZlY3RpdmVQYXJlbnRUeXBlID09PSBcImRvY1wiICYmIGhhc0RvY0NoaWxkcmVuKSB7XG4gICAgICByZXR1cm4gXCLmlofmoaPltYzlpZfmnIDlpJrkuKTnuqfvvIjliIbnu4QgPiDmlofmoaMgPiDmlofmoaPvvInvvIzor7flhYjnp7votbDlroPnmoTlrZDmlofmoaPjgIJcIlxuICAgIH1cblxuICAgIGlmICh0YXJnZXQucGFyZW50SWQgPT09IHNvdXJjZU5vZGUuaWQgfHwgKHRhcmdldC5wYXJlbnRJZCAmJiBpc0Rlc2NlbmRhbnROb2RlKHNvdXJjZU5vZGUuaWQsIHRhcmdldC5wYXJlbnRJZCkpKSB7XG4gICAgICByZXR1cm4gYCR7c291cmNlTGFiZWx95LiN6IO95ouW5YWl6Ieq5bex5oiW6Ieq5bex55qE5a2Q57qn77yM6K+35pS55pS+5Yiw5ZCM57qn5oiW54i257qn6ZmE6L+R44CCYFxuICAgIH1cblxuICAgIHJldHVybiBcIuW9k+WJjeS9jee9ruS4jeWPr+aUvue9ru+8jOivt+aLluWIsOiKgueCueS4iuS4i+i+uee8mO+8jOaIluaLluWIsOWIhue7hOS4remDqOOAglwiXG4gIH1cblxuICBjb25zdCBjbGVhclRyZWVEcmFnSG92ZXJFeHBhbmQgPSAoKSA9PiB7XG4gICAgaWYgKHRyZWVEcmFnSG92ZXJFeHBhbmRUaW1lci52YWx1ZSAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0cmVlRHJhZ0hvdmVyRXhwYW5kVGltZXIudmFsdWUpXG4gICAgICB0cmVlRHJhZ0hvdmVyRXhwYW5kVGltZXIudmFsdWUgPSBudWxsXG4gICAgfVxuXG4gICAgdHJlZURyYWdIb3ZlckV4cGFuZE5vZGVJZC52YWx1ZSA9IG51bGxcbiAgfVxuXG4gIGNvbnN0IHN0b3BUcmVlQXV0b1Njcm9sbCA9ICgpID0+IHtcbiAgICBpZiAodHJlZUF1dG9TY3JvbGxSYWYudmFsdWUgIT09IG51bGwpIHtcbiAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSh0cmVlQXV0b1Njcm9sbFJhZi52YWx1ZSlcbiAgICAgIHRyZWVBdXRvU2Nyb2xsUmFmLnZhbHVlID0gbnVsbFxuICAgIH1cblxuICAgIHRyZWVBdXRvU2Nyb2xsVmVsb2NpdHkudmFsdWUgPSAwXG4gIH1cblxuICBjb25zdCBydW5UcmVlQXV0b1Njcm9sbCA9ICgpID0+IHtcbiAgICBjb25zdCBjb250YWluZXIgPSBzY3JvbGxSZWYudmFsdWVcblxuICAgIGlmICghY29udGFpbmVyIHx8IHRyZWVBdXRvU2Nyb2xsVmVsb2NpdHkudmFsdWUgPT09IDApIHtcbiAgICAgIHN0b3BUcmVlQXV0b1Njcm9sbCgpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb250YWluZXIuc2Nyb2xsVG9wICs9IHRyZWVBdXRvU2Nyb2xsVmVsb2NpdHkudmFsdWVcbiAgICB0cmVlQXV0b1Njcm9sbFJhZi52YWx1ZSA9IHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUocnVuVHJlZUF1dG9TY3JvbGwpXG4gIH1cblxuICBjb25zdCBzeW5jVHJlZUF1dG9TY3JvbGwgPSAoY2xpZW50WTogbnVtYmVyKSA9PiB7XG4gICAgY29uc3QgY29udGFpbmVyID0gc2Nyb2xsUmVmLnZhbHVlXG5cbiAgICBpZiAoIWNvbnRhaW5lcikge1xuICAgICAgc3RvcFRyZWVBdXRvU2Nyb2xsKClcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHRyZWVBdXRvU2Nyb2xsVmVsb2NpdHkudmFsdWUgPSBnZXRBdXRvU2Nyb2xsVmVsb2NpdHkoY2xpZW50WSwgY29udGFpbmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpKVxuXG4gICAgaWYgKHRyZWVBdXRvU2Nyb2xsVmVsb2NpdHkudmFsdWUgPT09IDApIHtcbiAgICAgIHN0b3BUcmVlQXV0b1Njcm9sbCgpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBpZiAodHJlZUF1dG9TY3JvbGxSYWYudmFsdWUgPT09IG51bGwpIHtcbiAgICAgIHRyZWVBdXRvU2Nyb2xsUmFmLnZhbHVlID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShydW5UcmVlQXV0b1Njcm9sbClcbiAgICB9XG4gIH1cblxuICBjb25zdCBzY2hlZHVsZVRyZWVEcmFnSG92ZXJFeHBhbmQgPSAoXG4gICAgbm9kZTogS25vd2xlZGdlRG9jdW1lbnRUcmVlTm9kZSxcbiAgICBwb3NpdGlvbjogVHJlZURyb3BQb3NpdGlvbixcbiAgICBpbnB1dE1vZGU6IFRyZWVEcmFnU2Vzc2lvbltcImlucHV0TW9kZVwiXVxuICApID0+IHtcbiAgICBpZiAoXG4gICAgICBpbnB1dE1vZGUgPT09IFwidG91Y2hcIiB8fFxuICAgICAgcG9zaXRpb24gIT09IFwiaW5zaWRlXCIgfHxcbiAgICAgIChub2RlLnR5cGUgIT09IFwiZm9sZGVyXCIgJiYgbm9kZS50eXBlICE9PSBcImRvY1wiKSB8fFxuICAgICAgLy8g5peg5a2Q57qn55qE5paH5qGj5rKh5pyJ5Y+v5bGV5byA5YaF5a6577yM5LiN5YaZ5bGV5byA6ZuG5ZCI77yI6K+E5a6hIE0077yJXG4gICAgICAobm9kZS50eXBlID09PSBcImRvY1wiICYmIG5vZGUuY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB8fFxuICAgICAgZXhwYW5kZWRGb2xkZXJJZHMudmFsdWUuaW5jbHVkZXMobm9kZS5pZClcbiAgICApIHtcbiAgICAgIGNsZWFyVHJlZURyYWdIb3ZlckV4cGFuZCgpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBpZiAodHJlZURyYWdIb3ZlckV4cGFuZE5vZGVJZC52YWx1ZSA9PT0gbm9kZS5pZCAmJiB0cmVlRHJhZ0hvdmVyRXhwYW5kVGltZXIudmFsdWUgIT09IG51bGwpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNsZWFyVHJlZURyYWdIb3ZlckV4cGFuZCgpXG4gICAgdHJlZURyYWdIb3ZlckV4cGFuZE5vZGVJZC52YWx1ZSA9IG5vZGUuaWRcbiAgICB0cmVlRHJhZ0hvdmVyRXhwYW5kVGltZXIudmFsdWUgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBleHBhbmRlZEZvbGRlcklkcy52YWx1ZSA9IG5vcm1hbGl6ZU5vZGVJZHMoWy4uLmV4cGFuZGVkRm9sZGVySWRzLnZhbHVlLCBub2RlLmlkXSlcbiAgICAgIHRyZWVEcmFnSG92ZXJFeHBhbmRUaW1lci52YWx1ZSA9IG51bGxcbiAgICAgIHRyZWVEcmFnSG92ZXJFeHBhbmROb2RlSWQudmFsdWUgPSBudWxsXG4gICAgfSwgNTYwKVxuICB9XG5cbiAgLy8g4pSA4pSAIOinpuWxj+aLluaLveS8muivnemYsuaKpO+8iEc177yJ4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gIC8vIOinpuaRuOaLluaLveWcqOS8muivneacn+WGhemaj+aXtuWPr+iDveiiq+WOn+eUn+a7muWKqOaOpeeuoeaJi+WKv++8iHBvaW50ZXJjYW5jZWwg5o6Q5pat5ouW5ou977yJ44CCXG4gIC8vIOmVv+aMiei/m+WFpeinpuWxj+S8muivneWQjuaMguS4pOmBk+mYsuaKpO+8muKRoCB3aW5kb3cg6Z2eIHBhc3NpdmUgdG91Y2htb3ZlXG4gIC8vIHByZXZlbnREZWZhdWx077yM6Zi75pat5Y6f55Sf5rua5YqoL+WbnuW8ue+8m+KRoSDmiormiYvlhYPntKDliqjmgIHlhoXogZQgdG91Y2gtYWN0aW9uOm5vbmVcbiAgLy8g77yI5Y+M5L+d6Zmp77yM5Lya6K+d57uT5p2f6L+Y5Y6f5Y6f5YC877yJ44CCbW91c2UvcGVuIOS8muivneS4jeaMguS7u+S9lemYsuaKpOOAglxuICBsZXQgdG91Y2hEcmFnR3VhcmRBdHRhY2hlZCA9IGZhbHNlXG5cbiAgY29uc3QgaGFuZGxlVG91Y2hEcmFnU2Nyb2xsR3VhcmQgPSAoZXZlbnQ6IFRvdWNoRXZlbnQpID0+IHtcbiAgICBpZiAodHJlZURyYWdTZXNzaW9uLnZhbHVlPy5pbnB1dE1vZGUgPT09IFwidG91Y2hcIikge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgIH1cbiAgfVxuXG4gIC8qKiBhY3RpdmUg6Kem5bGP5Lya6K+d5pyf6Ze05Y6L5o6J57O757uf57qn6ZW/5oyJ6I+c5Y2V77ya5ouW5ou95Lit6YCU5YGc6aG/5Y+v6IO96Kem5Y+R5Y6f55Sf6ZW/5oyJXG4gICAqIGNvbnRleHRtZW51IOWKq+aMgeaJi+WKv+OAguacqui/h+S9jeenu+mYiOWAvOeahOaMieS9j+S4jeWKqOS4jeaLpuKAlOKAlOinpuWxj+OAjOmVv+aMiSA9IOihjOiPnOWNleOAjVxuICAgKiDnmoTljp/nlJ/lhaXlj6Pkv53mjIHlj6/nlKjvvIjop4EgS25vd2xlZGdlVHJlZU5vZGUg55qEIGhvdmVyOm5vbmUg5rOo6YeK77yJ44CCICovXG4gIGNvbnN0IGhhbmRsZVRvdWNoRHJhZ0NvbnRleHRtZW51R3VhcmQgPSAoZXZlbnQ6IE1vdXNlRXZlbnQpID0+IHtcbiAgICBjb25zdCBzZXNzaW9uID0gdHJlZURyYWdTZXNzaW9uLnZhbHVlXG5cbiAgICBpZiAoc2Vzc2lvbj8uYWN0aXZlICYmIHNlc3Npb24uaW5wdXRNb2RlID09PSBcInRvdWNoXCIpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcbiAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpXG4gICAgfVxuICB9XG5cbiAgY29uc3QgYXR0YWNoVG91Y2hEcmFnR3VhcmQgPSAoKSA9PiB7XG4gICAgaWYgKHRvdWNoRHJhZ0d1YXJkQXR0YWNoZWQpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIC8vIOmdniBwYXNzaXZlIOaJjeWFgeiuuCBwcmV2ZW50RGVmYXVsdCDljovmu5rliqjvvJtjb250ZXh0bWVudSDnlKjmjZXojrflhYjkuo7ooYznm5HlkKzmiafooYxcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNobW92ZVwiLCBoYW5kbGVUb3VjaERyYWdTY3JvbGxHdWFyZCwgeyBwYXNzaXZlOiBmYWxzZSB9KVxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiY29udGV4dG1lbnVcIiwgaGFuZGxlVG91Y2hEcmFnQ29udGV4dG1lbnVHdWFyZCwgdHJ1ZSlcbiAgICB0b3VjaERyYWdHdWFyZEF0dGFjaGVkID0gdHJ1ZVxuICB9XG5cbiAgY29uc3QgZGV0YWNoVG91Y2hEcmFnR3VhcmQgPSAoKSA9PiB7XG4gICAgaWYgKCF0b3VjaERyYWdHdWFyZEF0dGFjaGVkKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRvdWNobW92ZVwiLCBoYW5kbGVUb3VjaERyYWdTY3JvbGxHdWFyZClcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNvbnRleHRtZW51XCIsIGhhbmRsZVRvdWNoRHJhZ0NvbnRleHRtZW51R3VhcmQsIHRydWUpXG4gICAgdG91Y2hEcmFnR3VhcmRBdHRhY2hlZCA9IGZhbHNlXG4gIH1cblxuICBsZXQgdG91Y2hEcmFnSGFuZGxlRWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbFxuICBsZXQgdG91Y2hEcmFnSGFuZGxlUHJldlRvdWNoQWN0aW9uOiBzdHJpbmcgfCBudWxsID0gbnVsbFxuXG4gIGNvbnN0IGFwcGx5SGFuZGxlVG91Y2hBY3Rpb25Ob25lID0gKG5vZGVJZDogc3RyaW5nKSA9PiB7XG4gICAgY29uc3Qgcm93ID0gdHJlZVJvd1JlZ2lzdHJ5LnZhbHVlLmdldChub2RlSWQpXG4gICAgY29uc3QgaGFuZGxlID0gcm93Py5lbGVtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFwiW2RhdGEta25vd2xlZGdlLXRyZWUtZHJhZy1oYW5kbGVdXCIpID8/IG51bGxcblxuICAgIGlmICghaGFuZGxlKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB0b3VjaERyYWdIYW5kbGVFbGVtZW50ID0gaGFuZGxlXG4gICAgdG91Y2hEcmFnSGFuZGxlUHJldlRvdWNoQWN0aW9uID0gaGFuZGxlLnN0eWxlLnRvdWNoQWN0aW9uIHx8IG51bGxcbiAgICBoYW5kbGUuc3R5bGUudG91Y2hBY3Rpb24gPSBcIm5vbmVcIlxuICB9XG5cbiAgY29uc3QgcmVzdG9yZUhhbmRsZVRvdWNoQWN0aW9uID0gKCkgPT4ge1xuICAgIGNvbnN0IGhhbmRsZSA9IHRvdWNoRHJhZ0hhbmRsZUVsZW1lbnRcblxuICAgIGlmICghaGFuZGxlKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBpZiAodG91Y2hEcmFnSGFuZGxlUHJldlRvdWNoQWN0aW9uID09PSBudWxsKSB7XG4gICAgICBoYW5kbGUuc3R5bGUucmVtb3ZlUHJvcGVydHkoXCJ0b3VjaC1hY3Rpb25cIilcbiAgICB9IGVsc2Uge1xuICAgICAgaGFuZGxlLnN0eWxlLnRvdWNoQWN0aW9uID0gdG91Y2hEcmFnSGFuZGxlUHJldlRvdWNoQWN0aW9uXG4gICAgfVxuXG4gICAgdG91Y2hEcmFnSGFuZGxlRWxlbWVudCA9IG51bGxcbiAgICB0b3VjaERyYWdIYW5kbGVQcmV2VG91Y2hBY3Rpb24gPSBudWxsXG4gIH1cblxuICAvKiog6YeK5pS+6Kem5bGP5Lya6K+d6Ziy5oqk77yI5rua5Yqo6Zi75pat55uR5ZCsICsg5oqK5omLIHRvdWNoLWFjdGlvbiDov5jljp/vvInvvIzlj6/lronlhajph43lpI3osIPnlKggKi9cbiAgY29uc3QgcmVsZWFzZVRvdWNoRHJhZ0d1YXJkID0gKCkgPT4ge1xuICAgIGRldGFjaFRvdWNoRHJhZ0d1YXJkKClcbiAgICByZXN0b3JlSGFuZGxlVG91Y2hBY3Rpb24oKVxuICB9XG5cbiAgY29uc3QgcmVzZXRUcmVlRHJhZ1N0YXRlID0gKCkgPT4ge1xuICAgIHRyZWVEcmFnU2Vzc2lvbi52YWx1ZSA9IG51bGxcbiAgICB0cmVlRHJvcFRhcmdldC52YWx1ZSA9IG51bGxcbiAgICB0cmVlRHJhZ0Jsb2NrZWRSZWFzb24udmFsdWUgPSBudWxsXG4gICAgcmVsZWFzZVRvdWNoRHJhZ0d1YXJkKClcbiAgICBpbnZhbGlkYXRlVHJlZVJvd0xheW91dCgpXG4gICAgY2xlYXJUcmVlRHJhZ0hvdmVyRXhwYW5kKClcbiAgICBzdG9wVHJlZUF1dG9TY3JvbGwoKVxuICB9XG5cbiAgY29uc3QgaGFuZGxlR2xvYmFsVHJlZURyYWdNb3ZlID0gKGV2ZW50OiBQb2ludGVyRXZlbnQpID0+IHtcbiAgICBjb25zdCBzZXNzaW9uID0gdHJlZURyYWdTZXNzaW9uLnZhbHVlXG5cbiAgICBpZiAoIXNlc3Npb24gfHwgb3B0aW9ucy5kaXNhYmxlZCgpKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICAvLyDlj6rot5/ouKrlj5Hotbfmi5bmi73nmoTpgqPmoLnmjIfpkojvvIjop6bmkbgv5aSa54K56Kem5o6n5pe25YW25L2Z5oyH6ZKI5LiN5Y+C5LiO77yJXG4gICAgaWYgKGV2ZW50LnBvaW50ZXJJZCAhPT0gc2Vzc2lvbi5wb2ludGVySWQpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIC8vIOS9jeenu+mYiOWAvO+8muWQjeensOaMiemSruWFvOWFt+aLluaLveaKiuaJi++8jOaMieS4i+WQjui9u+W+ruenu+WKqO+8iOWNiuihjOS7peWGhe+8ieS4jeeul+aLluaLve+8jFxuICAgIC8vIOmBv+WFjeaJi+aKluebtOaOpeinpuWPkei3qOihjOaOkuW6j+aPkOS6pFxuICAgIGlmICghc2Vzc2lvbi5hY3RpdmUpIHtcbiAgICAgIGNvbnN0IGR4ID0gZXZlbnQuY2xpZW50WCAtIHNlc3Npb24uc3RhcnRYXG4gICAgICBjb25zdCBkeSA9IGV2ZW50LmNsaWVudFkgLSBzZXNzaW9uLnN0YXJ0WVxuXG4gICAgICBpZiAoTWF0aC5oeXBvdChkeCwgZHkpIDwgVFJFRV9EUkFHX0FDVElWQVRJT05fRElTVEFOQ0VfUFgpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHNlc3Npb24uYWN0aXZlID0gdHJ1ZVxuICAgIH1cblxuICAgIHN5bmNUcmVlQXV0b1Njcm9sbChldmVudC5jbGllbnRZKVxuXG4gICAgY29uc3Qgc291cmNlTm9kZSA9IGZpbmRUcmVlTm9kZSh0cmVlTm9kZXMudmFsdWUsIHNlc3Npb24uc291cmNlTm9kZUlkKVxuXG4gICAgaWYgKCFzb3VyY2VOb2RlKSB7XG4gICAgICByZXNldFRyZWVEcmFnU3RhdGUoKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3QgbmV4dERyb3BUYXJnZXQgPSByZXNvbHZlVHJlZURyb3BUYXJnZXRGcm9tUG9pbnRlcihldmVudC5jbGllbnRZLCBzZXNzaW9uLmlucHV0TW9kZSlcblxuICAgIGlmICghbmV4dERyb3BUYXJnZXQpIHtcbiAgICAgIHRyZWVEcm9wVGFyZ2V0LnZhbHVlID0gbnVsbFxuICAgICAgdHJlZURyYWdCbG9ja2VkUmVhc29uLnZhbHVlID0gbnVsbFxuICAgICAgY2xlYXJUcmVlRHJhZ0hvdmVyRXhwYW5kKClcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGlmICghY2FuRHJvcFRyZWVOb2RlKHNvdXJjZU5vZGUsIG5leHREcm9wVGFyZ2V0KSkge1xuICAgICAgdHJlZURyb3BUYXJnZXQudmFsdWUgPSBudWxsXG4gICAgICBjb25zdCByZWFzb24gPSByZXNvbHZlVHJlZURyb3BCbG9ja2VkUmVhc29uKHNvdXJjZU5vZGUsIG5leHREcm9wVGFyZ2V0KVxuXG4gICAgICAvLyDmlofmoYjlj5jljJbmiY3pgI/lh7rvvIjmjIfpkojlnKjlkIzkuIDpnZ7ms5XljLrln5/lhoXnp7vliqjkuI3ph43lpI3mj5DnpLrvvIlcbiAgICAgIGlmIChyZWFzb24gIT09IHRyZWVEcmFnQmxvY2tlZFJlYXNvbi52YWx1ZSkge1xuICAgICAgICB0cmVlRHJhZ0Jsb2NrZWRSZWFzb24udmFsdWUgPSByZWFzb25cbiAgICAgICAgb3B0aW9ucy5vbkJsb2NrZWQ/LihyZWFzb24pXG4gICAgICB9XG5cbiAgICAgIGNsZWFyVHJlZURyYWdIb3ZlckV4cGFuZCgpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB0cmVlRHJhZ0Jsb2NrZWRSZWFzb24udmFsdWUgPSBudWxsXG4gICAgY29uc3QgdGFyZ2V0Tm9kZSA9IGdldFRyZWVEcm9wVGFyZ2V0Tm9kZShuZXh0RHJvcFRhcmdldClcblxuICAgIGlmICh0YXJnZXROb2RlKSB7XG4gICAgICBzY2hlZHVsZVRyZWVEcmFnSG92ZXJFeHBhbmQodGFyZ2V0Tm9kZSwgbmV4dERyb3BUYXJnZXQucG9zaXRpb24sIG5leHREcm9wVGFyZ2V0LmlucHV0TW9kZSlcbiAgICB9IGVsc2Uge1xuICAgICAgY2xlYXJUcmVlRHJhZ0hvdmVyRXhwYW5kKClcbiAgICB9XG5cbiAgICB0cmVlRHJvcFRhcmdldC52YWx1ZSA9IG5leHREcm9wVGFyZ2V0XG4gIH1cblxuICBjb25zdCBjYW5jZWxUcmVlRHJhZyA9ICgpID0+IHtcbiAgICBpZiAoIXRyZWVEcmFnU2Vzc2lvbi52YWx1ZSB8fCBvcHRpb25zLnJlb3JkZXJpbmcudmFsdWUpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHJlc2V0VHJlZURyYWdTdGF0ZSgpXG4gIH1cblxuICBjb25zdCBoYW5kbGVHbG9iYWxUcmVlRHJhZ0VuZCA9IGFzeW5jIChldmVudDogUG9pbnRlckV2ZW50KSA9PiB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRyZWVEcmFnU2Vzc2lvbi52YWx1ZVxuXG4gICAgaWYgKCFzZXNzaW9uIHx8IG9wdGlvbnMucmVvcmRlcmluZy52YWx1ZSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8g6Z2e5Y+R6LW35oyH6ZKI5oqs6LW377yI5aSa54K56Kem5o6n55qE56ys5LqM5qC55omL5oyH77yJ77ya5LiN5omT5pat5LuN5Zyo6L+b6KGM55qE5ouW5ou9XG4gICAgaWYgKGV2ZW50LnBvaW50ZXJJZCAhPT0gc2Vzc2lvbi5wb2ludGVySWQpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIC8vIOacqui/h+S9jeenu+mYiOWAvO+8iOWPquaYr+eCueWHuy/ovbvnp7vvvInvvJrkuI3nrpfmi5bmi73vvIznm7TmjqXnu5PmnZ9cbiAgICBpZiAoIXNlc3Npb24uYWN0aXZlKSB7XG4gICAgICByZXNldFRyZWVEcmFnU3RhdGUoKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgaWYgKCF0cmVlRHJvcFRhcmdldC52YWx1ZSB8fCB0cmVlRHJhZ0Jsb2NrZWRSZWFzb24udmFsdWUpIHtcbiAgICAgIHJlc2V0VHJlZURyYWdTdGF0ZSgpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBhd2FpdCBjb21taXRUcmVlRHJvcCh0cmVlRHJvcFRhcmdldC52YWx1ZSlcbiAgfVxuXG4gIGNvbnN0IGdldENoaWxkcmVuUmVmQnlQYXJlbnRJZCA9IChwYXJlbnRJZDogc3RyaW5nIHwgbnVsbCk6IEtub3dsZWRnZURvY3VtZW50VHJlZU5vZGVbXSB8IG51bGwgPT4ge1xuICAgIGlmICghcGFyZW50SWQpIHtcbiAgICAgIHJldHVybiB0cmVlTm9kZXMudmFsdWVcbiAgICB9XG5cbiAgICBjb25zdCBwYXJlbnROb2RlID0gZmluZFRyZWVOb2RlKHRyZWVOb2Rlcy52YWx1ZSwgcGFyZW50SWQpXG5cbiAgICAvLyDliIbnu4TkuI7mlofmoaPvvIjmjILlrZDnuqfvvIzmibnmrKEgQu+8iemDveiDveS9nOS4uuaLluaLveiQveeCueeahOeItue6p+WuueWZqFxuICAgIGlmICghcGFyZW50Tm9kZSB8fCAocGFyZW50Tm9kZS50eXBlICE9PSBcImZvbGRlclwiICYmIHBhcmVudE5vZGUudHlwZSAhPT0gXCJkb2NcIikpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgcmV0dXJuIHBhcmVudE5vZGUuY2hpbGRyZW5cbiAgfVxuXG4gIGNvbnN0IGdldEluZGV4SW5QYXJlbnQgPSAocGFyZW50SWQ6IHN0cmluZyB8IG51bGwsIG5vZGVJZDogc3RyaW5nKSA9PiB7XG4gICAgY29uc3Qgc2libGluZ3MgPSBnZXRDaGlsZHJlblJlZkJ5UGFyZW50SWQocGFyZW50SWQpXG5cbiAgICBpZiAoIXNpYmxpbmdzKSB7XG4gICAgICByZXR1cm4gLTFcbiAgICB9XG5cbiAgICByZXR1cm4gc2libGluZ3MuZmluZEluZGV4KGl0ZW0gPT4gaXRlbS5pZCA9PT0gbm9kZUlkKVxuICB9XG5cbiAgY29uc3QgYnVpbGRSZW9yZGVySXRlbXMgPSAocGFyZW50SWRzOiBBcnJheTxzdHJpbmcgfCBudWxsPikgPT4ge1xuICAgIGNvbnN0IHZpc2l0ZWQgPSBuZXcgU2V0PHN0cmluZz4oKVxuXG4gICAgcmV0dXJuIHBhcmVudElkcy5mbGF0TWFwKHBhcmVudElkID0+IHtcbiAgICAgIGNvbnN0IGtleSA9IHBhcmVudElkID8/IFwiX19yb290X19cIlxuXG4gICAgICBpZiAodmlzaXRlZC5oYXMoa2V5KSkge1xuICAgICAgICByZXR1cm4gW11cbiAgICAgIH1cblxuICAgICAgdmlzaXRlZC5hZGQoa2V5KVxuXG4gICAgICBjb25zdCBzaWJsaW5ncyA9IGdldENoaWxkcmVuUmVmQnlQYXJlbnRJZChwYXJlbnRJZClcblxuICAgICAgaWYgKCFzaWJsaW5ncykge1xuICAgICAgICByZXR1cm4gW11cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHNpYmxpbmdzLm1hcCgoaXRlbSwgb3JkZXIpID0+ICh7XG4gICAgICAgIGlkOiBpdGVtLmlkLFxuICAgICAgICBwYXJlbnRJZCxcbiAgICAgICAgb3JkZXIsXG4gICAgICB9KSlcbiAgICB9KVxuICB9XG5cbiAgY29uc3QgY29tbWl0VHJlZURyb3AgPSBhc3luYyAodGFyZ2V0OiBUcmVlRHJvcFRhcmdldCkgPT4ge1xuICAgIGlmIChvcHRpb25zLmRpc2FibGVkKCkgfHwgIWRyYWdnaW5nTm9kZUlkLnZhbHVlKSB7XG4gICAgICByZXNldFRyZWVEcmFnU3RhdGUoKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3Qgc291cmNlTm9kZSA9IGZpbmRUcmVlTm9kZSh0cmVlTm9kZXMudmFsdWUsIGRyYWdnaW5nTm9kZUlkLnZhbHVlKVxuXG4gICAgaWYgKCFzb3VyY2VOb2RlKSB7XG4gICAgICByZXNldFRyZWVEcmFnU3RhdGUoKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgaWYgKCFjYW5Ecm9wVHJlZU5vZGUoc291cmNlTm9kZSwgdGFyZ2V0KSkge1xuICAgICAgcmVzZXRUcmVlRHJhZ1N0YXRlKClcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNvbnN0IHNvdXJjZVBhcmVudElkID0gc291cmNlTm9kZS5wYXJlbnRJZCA/PyBudWxsXG4gICAgY29uc3Qgc291cmNlSW5kZXggPSBnZXRJbmRleEluUGFyZW50KHNvdXJjZVBhcmVudElkLCBzb3VyY2VOb2RlLmlkKVxuICAgIGNvbnN0IHRhcmdldFBhcmVudElkID0gdGFyZ2V0LnBhcmVudElkXG4gICAgbGV0IGluc2VydEluZGV4ID0gdGFyZ2V0LmluZGV4XG5cbiAgICBpZiAoc291cmNlUGFyZW50SWQgPT09IHRhcmdldFBhcmVudElkICYmIHNvdXJjZUluZGV4ID49IDAgJiYgc291cmNlSW5kZXggPCBpbnNlcnRJbmRleCkge1xuICAgICAgaW5zZXJ0SW5kZXggLT0gMVxuICAgIH1cblxuICAgIGlmIChzb3VyY2VQYXJlbnRJZCA9PT0gdGFyZ2V0UGFyZW50SWQgJiYgc291cmNlSW5kZXggPT09IGluc2VydEluZGV4KSB7XG4gICAgICByZXNldFRyZWVEcmFnU3RhdGUoKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3QgcHJldmlvdXNUcmVlU25hcHNob3QgPSBjbG9uZVRyZWVOb2Rlcyh0cmVlTm9kZXMudmFsdWUpXG5cbiAgICBjb25zdCByZW1vdmVkID0gcmVtb3ZlVHJlZU5vZGUodHJlZU5vZGVzLnZhbHVlLCBzb3VyY2VOb2RlLmlkKVxuXG4gICAgaWYgKCFyZW1vdmVkKSB7XG4gICAgICByZXNldFRyZWVEcmFnU3RhdGUoKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3QgdGFyZ2V0TGlzdCA9IGdldENoaWxkcmVuUmVmQnlQYXJlbnRJZCh0YXJnZXRQYXJlbnRJZClcblxuICAgIGlmICghdGFyZ2V0TGlzdCkge1xuICAgICAgYXdhaXQgb3B0aW9ucy5yZWZyZXNoVHJlZSgpXG4gICAgICByZXNldFRyZWVEcmFnU3RhdGUoKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3QgY2xhbXBlZEluZGV4ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oaW5zZXJ0SW5kZXgsIHRhcmdldExpc3QubGVuZ3RoKSlcbiAgICByZW1vdmVkLm5vZGUucGFyZW50SWQgPSB0YXJnZXRQYXJlbnRJZFxuICAgIHRhcmdldExpc3Quc3BsaWNlKGNsYW1wZWRJbmRleCwgMCwgcmVtb3ZlZC5ub2RlKVxuXG4gICAgY29uc3QgcmVvcmRlckl0ZW1zID0gYnVpbGRSZW9yZGVySXRlbXMoW3NvdXJjZVBhcmVudElkLCB0YXJnZXRQYXJlbnRJZF0pXG5cbiAgICBpZiAocmVvcmRlckl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmVzZXRUcmVlRHJhZ1N0YXRlKClcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIG9wdGlvbnMucmVvcmRlcmluZy52YWx1ZSA9IHRydWVcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZW9yZGVyUmVzdWx0ID0gYXdhaXQgcmVvcmRlcktub3dsZWRnZURvY3VtZW50cyh7XG4gICAgICAgIGtiSWQ6IG9wdGlvbnMua2JJZC52YWx1ZSxcbiAgICAgICAgaXRlbXM6IHJlb3JkZXJJdGVtcyxcbiAgICAgIH0pXG5cbiAgICAgIGlmICghcmVvcmRlclJlc3VsdC5vaykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCLmjpLluo/or7fmsYLmnKrmiJDlip/mj5DkuqTjgIJcIilcbiAgICAgIH1cblxuICAgICAgaWYgKHRhcmdldFBhcmVudElkICYmICFleHBhbmRlZEZvbGRlcklkcy52YWx1ZS5pbmNsdWRlcyh0YXJnZXRQYXJlbnRJZCkpIHtcbiAgICAgICAgZXhwYW5kZWRGb2xkZXJJZHMudmFsdWUgPSBbLi4uZXhwYW5kZWRGb2xkZXJJZHMudmFsdWUsIHRhcmdldFBhcmVudElkXVxuICAgICAgfVxuXG4gICAgICBhd2FpdCBvcHRpb25zLnJlZnJlc2hUcmVlKClcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdHJlZU5vZGVzLnZhbHVlID0gcHJldmlvdXNUcmVlU25hcHNob3RcbiAgICAgIG9wdGlvbnMuZW5zdXJlRm9jdXNlZE5vZGUoKVxuICAgICAgYXdhaXQgb3B0aW9ucy5yZWZyZXNoVHJlZSgpXG4gICAgICAvLyDpnZnpu5jlm57mu5rkvJrorqnjgIznu7/nga/okL3ngrnjgI3nnIvotbfmnaXmiJDlip/vvJrlkI7nq6/mi5Lnu53vvIg0MDMg562J77yJ5b+F6aG757uZ5Ye65Y6f5Zug77yI6K+E5a6hIEkx77yJXG4gICAgICBzaG93VG9hc3RNZXNzYWdlKGdldEFwaUVycm9yTWVzc2FnZShlcnJvciwgXCLmjpLluo/mj5DkuqTlpLHotKXvvIzlt7LmgaLlpI3ljp/nirbjgIJcIiksIFwiZXJyb3JcIilcbiAgICB9IGZpbmFsbHkge1xuICAgICAgb3B0aW9ucy5yZW9yZGVyaW5nLnZhbHVlID0gZmFsc2VcbiAgICAgIHJlc2V0VHJlZURyYWdTdGF0ZSgpXG4gICAgfVxuICB9XG5cbiAgY29uc3QgaGFuZGxlR2xvYmFsVHJlZUtleWRvd24gPSAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpID0+IHtcbiAgICBpZiAoZXZlbnQua2V5ICE9PSBcIkVzY2FwZVwiKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjYW5jZWxUcmVlRHJhZygpXG4gIH1cblxuICBjb25zdCBhdHRhY2ggPSAoKSA9PiB7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVybW92ZVwiLCBoYW5kbGVHbG9iYWxUcmVlRHJhZ01vdmUpXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVydXBcIiwgaGFuZGxlR2xvYmFsVHJlZURyYWdFbmQpXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVyY2FuY2VsXCIsIGNhbmNlbFRyZWVEcmFnKVxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiYmx1clwiLCBjYW5jZWxUcmVlRHJhZylcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgaGFuZGxlR2xvYmFsVHJlZUtleWRvd24pXG4gIH1cblxuICBjb25zdCBkZXRhY2ggPSAoKSA9PiB7XG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJwb2ludGVybW92ZVwiLCBoYW5kbGVHbG9iYWxUcmVlRHJhZ01vdmUpXG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJwb2ludGVydXBcIiwgaGFuZGxlR2xvYmFsVHJlZURyYWdFbmQpXG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJwb2ludGVyY2FuY2VsXCIsIGNhbmNlbFRyZWVEcmFnKVxuICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKFwiYmx1clwiLCBjYW5jZWxUcmVlRHJhZylcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgaGFuZGxlR2xvYmFsVHJlZUtleWRvd24pXG4gIH1cblxuICBjb25zdCBiZWdpbkRyYWcgPSAocGF5bG9hZDogeyBldmVudDogUG9pbnRlckV2ZW50OyBub2RlOiBLbm93bGVkZ2VEb2N1bWVudFRyZWVOb2RlIH0pID0+IHtcbiAgICAvLyDopobnm5bmrovnlZnkvJror53ml7blhYjph4rmlL7ml6fpmLLmiqTvvIjmraPluLjmtYHnqIvml6fkvJror53lt7IgcmVzZXTvvIzmraTlpITlhZzlupXvvIlcbiAgICByZWxlYXNlVG91Y2hEcmFnR3VhcmQoKVxuICAgIGNsZWFyVHJlZURyYWdIb3ZlckV4cGFuZCgpXG4gICAgc3RvcFRyZWVBdXRvU2Nyb2xsKClcbiAgICAvLyDmlrDkvJror53ph43lu7rluIPlsYDnvJPlrZjvvJrkuIrkuIDkvJror53lkI7moJHlj6/og73lt7LliLfmlrBcbiAgICBpbnZhbGlkYXRlVHJlZVJvd0xheW91dCgpXG4gICAgdHJlZURyYWdTZXNzaW9uLnZhbHVlID0ge1xuICAgICAgcG9pbnRlcklkOiBwYXlsb2FkLmV2ZW50LnBvaW50ZXJJZCxcbiAgICAgIHNvdXJjZU5vZGVJZDogcGF5bG9hZC5ub2RlLmlkLFxuICAgICAgaW5wdXRNb2RlOiByZXNvbHZlVHJlZURyYWdJbnB1dE1vZGUocGF5bG9hZC5ldmVudCksXG4gICAgICBzdGFydGVkQXQ6IERhdGUubm93KCksXG4gICAgICBzdGFydFg6IHBheWxvYWQuZXZlbnQuY2xpZW50WCxcbiAgICAgIHN0YXJ0WTogcGF5bG9hZC5ldmVudC5jbGllbnRZLFxuICAgICAgLy8g5L2N56e76LaF6L+H6ZiI5YC877yI6KeBIGhhbmRsZUdsb2JhbFRyZWVEcmFnTW92Ze+8ieaJjee9ruS4uiB0cnVlXG4gICAgICBhY3RpdmU6IGZhbHNlLFxuICAgIH1cbiAgICB0cmVlRHJvcFRhcmdldC52YWx1ZSA9IG51bGxcbiAgICB0cmVlRHJhZ0Jsb2NrZWRSZWFzb24udmFsdWUgPSBudWxsXG5cbiAgICAvLyDop6blsY/kvJror53vvJrplb/mjInlt7LorqnmiYvmjIfmjInlnKjlsY/kuIrvvIzlkI7nu63np7vliqjoi6XkuI3pmLvmlq3ljp/nlJ/mu5rliqjvvIxcbiAgICAvLyBwb2ludGVyY2FuY2VsIOS8muWcqOaLluaLveWImui1t+atpeaXtuaKiuWug+aOkOaWrVxuICAgIGlmICh0cmVlRHJhZ1Nlc3Npb24udmFsdWUuaW5wdXRNb2RlID09PSBcInRvdWNoXCIpIHtcbiAgICAgIGF0dGFjaFRvdWNoRHJhZ0d1YXJkKClcbiAgICAgIGFwcGx5SGFuZGxlVG91Y2hBY3Rpb25Ob25lKHBheWxvYWQubm9kZS5pZClcbiAgICB9XG4gIH1cblxuICBvbk1vdW50ZWQoKCkgPT4ge1xuICAgIGF0dGFjaCgpXG4gIH0pXG5cbiAgb25CZWZvcmVVbm1vdW50KCgpID0+IHtcbiAgICBkZXRhY2goKVxuICAgIHJlbGVhc2VUb3VjaERyYWdHdWFyZCgpXG4gICAgY2xlYXJUcmVlRHJhZ0hvdmVyRXhwYW5kKClcbiAgICBzdG9wVHJlZUF1dG9TY3JvbGwoKVxuICB9KVxuXG4gIHJldHVybiB7XG4gICAgdHJlZURyYWdTZXNzaW9uLFxuICAgIHRyZWVEcm9wVGFyZ2V0LFxuICAgIHRyZWVEcmFnQmxvY2tlZFJlYXNvbixcbiAgICBkcmFnZ2luZ05vZGVJZCxcbiAgICByZWdpc3RlclRyZWVSb3csXG4gICAgdW5yZWdpc3RlclRyZWVSb3csXG4gICAgYmVnaW5EcmFnLFxuICAgIHJlc2V0VHJlZURyYWdTdGF0ZSxcbiAgICBpc0Rlc2NlbmRhbnROb2RlLFxuICAgIGNsZWFyVHJlZURyYWdIb3ZlckV4cGFuZCxcbiAgICBzdG9wVHJlZUF1dG9TY3JvbGwsXG4gIH1cbn1cbiJdLCJtYXBwaW5ncyI6IkFBWUEsU0FBUyxVQUFVLGlCQUFpQixXQUFXLEtBQUssYUFBdUI7QUFFM0UsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5QkFBeUI7QUFDbEM7QUFBQSxFQUNFO0FBQUEsRUFDQTtBQUFBLE9BS0s7QUFDUDtBQUFBLEVBQ0UsbUJBQW1CO0FBQUEsRUFDbkI7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUNLO0FBRUEsYUFBTSxjQUFjLENBQUMsWUFtQnRCO0FBQ0osUUFBTSxFQUFFLFdBQVcsbUJBQW1CLFVBQVUsSUFBSTtBQUNwRCxRQUFNLEVBQUUsaUJBQWlCLElBQUksa0JBQWtCO0FBRS9DLFFBQU0sa0JBQWtCLElBQTRCLElBQUk7QUFDeEQsUUFBTSxpQkFBaUIsSUFBMkIsSUFBSTtBQUN0RCxRQUFNLHdCQUF3QixJQUFtQixJQUFJO0FBRXJELFFBQU0saUJBQWlCLFNBQVMsTUFBTyxnQkFBZ0IsT0FBTyxTQUFTLGdCQUFnQixNQUFNLGVBQWUsSUFBSztBQUVqSCxRQUFNLGtCQUFrQixJQUFJLG9CQUFJLElBQWlDLENBQUM7QUFDbEUsUUFBTSwyQkFBMkIsSUFBbUIsSUFBSTtBQUN4RCxRQUFNLDRCQUE0QixJQUFtQixJQUFJO0FBQ3pELFFBQU0sb0JBQW9CLElBQW1CLElBQUk7QUFDakQsUUFBTSx5QkFBeUIsSUFBSSxDQUFDO0FBRXBDLFFBQU0sa0JBQWtCLENBQUMsWUFLbkI7QUFDSixVQUFNLFdBQWdDO0FBQUEsTUFDcEMsR0FBRyxRQUFRO0FBQUEsTUFDWCxVQUFVLFFBQVE7QUFBQSxNQUNsQixPQUFPLFFBQVE7QUFBQSxNQUNmLE9BQU8sUUFBUTtBQUFBLElBQ2pC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