/* 2026-09-22 由 dev 缓存编译产物机械还原：类型标注已被 esbuild 剥除，import 说明符已尽量还原。过 node --check，未做运行验证。 */
import { computed, ref, watch } from "vue";
import { getApiErrorMessage } from "/src/services/http-client.ts";
import { resolveWebBaseUrl } from "/src/services/desktop-bridge.ts";
import { addKnowledgeFavorite, checkKnowledgeFavorite, removeKnowledgeFavorite } from "/src/services/knowledge-favorites.ts";
import {
  createKnowledgeDocument,
  getKnowledgeDocument,
  trashKnowledgeDocument,
  updateKnowledgeDocument
} from "/src/services/knowledge-documents.ts";
import {
  KNOWLEDGE_BOARD_CONTENT_SCHEME,
  KNOWLEDGE_DATATABLE_CONTENT_SCHEME,
  KNOWLEDGE_MINDMAP_CONTENT_SCHEME,
  KNOWLEDGE_DOCUMENT_EDITOR_TYPES
} from "/src/types/knowledge-document.ts";
import { createKnowledgeBoardDocument } from "/src/utils/knowledge-board.ts";
import { getKnowledgeDocumentRouteTarget } from "/src/utils/knowledge-document.ts";
import { findTreeNode } from "/src/components/knowledge/tree-utils.ts";
export const useTreeNodeActions = (options) => {
  const { kbId, router } = options;
  const showTemplateDialog = ref(false);
  const templateDialogParentId = ref(null);
  const inputDialog = ref({ open: false, title: "", defaultValue: "", onConfirm: () => {
  } });
  const confirmDialog = ref({
    open: false,
    message: "",
    onConfirm: () => {
    }
  });
  const renamingNodeId = ref(null);
  const ensureEditPermission = (message = "当前角色没有编辑权限。") => {
    if (options.canEdit()) {
      return true;
    }
    options.showToastMessage(message, "error");
    return false;
  };
  const copyText = async (textToCopy) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      return true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = textToCopy;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      try {
        textarea.select();
        document.execCommand("copy");
        return true;
      } catch {
        return false;
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };
  const buildDocLink = (docId, editorType) => {
    if (typeof window === "undefined") {
      return "";
    }
    const href = router.resolve(
      getKnowledgeDocumentRouteTarget({
        kbId: kbId.value,
        docId,
        editorType
      })
    ).href;
    return `${resolveWebBaseUrl()}${href}`;
  };
  const buildFolderLink = () => {
    if (typeof window === "undefined") {
      return "";
    }
    const href = router.resolve({
      name: "knowledge-workspace-home",
      params: { kbId: kbId.value }
    }).href;
    return `${resolveWebBaseUrl()}${href}`;
  };
  const buildNodeLink = (node) => {
    if (node.type === "doc") {
      return buildDocLink(node.id, node.editorType);
    }
    return buildFolderLink();
  };
  const escapeMarkdownText = (value) => {
    return value.replace(/([()[\]])/g, "\\$1");
  };
  const buildDocTitledLink = (node) => {
    const docLink = buildDocLink(node.id, node.editorType);
    if (!docLink) {
      return "";
    }
    const normalizedTitle = node.title.trim() || "未命名文档";
    return `[${escapeMarkdownText(normalizedTitle)}](${docLink})`;
  };
  const resolveActionNode = () => {
    if (options.menu.value) {
      return options.menu.value.node;
    }
    return options.getFocusedTreeNode();
  };
  const createNode = (type, parentId = null) => {
    if (!ensureEditPermission()) {
      return;
    }
    const isFolder = type === "folder";
    const isBoard = type === "board";
    const isDatatable = type === "datatable";
    const isSheet = type === "sheet";
    const isMindmap = type === "mindmap";
    const typeLabel = isFolder ? "分组" : isBoard ? "画板" : isDatatable ? "数据表" : isSheet ? "表格" : isMindmap ? "思维导图" : "文档";
    const defaultTitle = isFolder ? "新建分组" : isBoard ? "无标题画板" : isDatatable || isSheet || isMindmap ? `无标题${typeLabel}` : "新建文档";
    const isFolderCreate = type === "folder";
    const folders = [{ id: "", label: "根目录" }];
    const walkFolders = (nodes, prefix, parentType) => {
      nodes.forEach((item) => {
        if (item.type !== "folder" && item.type !== "doc") {
          return;
        }
        const path = prefix ? `${prefix} / ${item.title}` : item.title;
        if (isFolderCreate ? item.type === "folder" : item.type === "folder" || parentType !== "doc") {
          folders.push({ id: item.id, label: path });
        }
        walkFolders(item.children, path, item.type);
      });
    };
    walkFolders(options.treeNodes.value, "", null);
    inputDialog.value = {
      open: true,
      title: `新建${typeLabel}`,
      defaultValue: defaultTitle,
      folders,
      defaultFolderId: parentId ?? "",
      // 菜单直达：类型预选并展开高级选项（B7 入口补全）
      presetEditorType: isBoard ? "board" : isDatatable ? "datatable" : isSheet ? "sheet" : isMindmap ? "mindmap" : "richText",
      onConfirm: async (normalizedTitle, targetParentId, editorType) => {
        const useBoard = isBoard || editorType === "board";
        const useDatatable = !isFolder && !useBoard && editorType === "datatable";
        const useSheet = !isFolder && !useBoard && !useDatatable && editorType === "sheet";
        const useMindmap = !isFolder && !useBoard && !useDatatable && !useSheet && editorType === "mindmap";
        try {
          const created = await createKnowledgeDocument({
            kbId: kbId.value,
            title: normalizedTitle,
            type: useBoard || useDatatable || useSheet || useMindmap ? "doc" : type,
            editorType: useBoard ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.board : useDatatable ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.datatable : useSheet ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.sheet : useMindmap ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.mindmap : KNOWLEDGE_DOCUMENT_EDITOR_TYPES.richText,
            status: "draft",
            parentId: targetParentId || null,
            content: isFolder ? void 0 : useBoard ? {
              scheme: KNOWLEDGE_BOARD_CONTENT_SCHEME,
              value: createKnowledgeBoardDocument()
            } : useDatatable ? {
              scheme: KNOWLEDGE_DATATABLE_CONTENT_SCHEME,
              value: { fields: [], rows: [] }
            } : useSheet ? {
              scheme: KNOWLEDGE_DATATABLE_CONTENT_SCHEME,
              value: { fields: [], rows: [] }
            } : useMindmap ? {
              scheme: KNOWLEDGE_MINDMAP_CONTENT_SCHEME,
              value: {
                data: { text: normalizedTitle, uid: Math.random().toString(36).slice(2, 14) },
                children: []
              }
            } : { scheme: "text/markdown", value: "" }
          });
          options.showToastMessage(
            isFolder ? "分组已创建。" : useBoard ? "画板已创建。" : useDatatable ? "数据表已创建。" : useSheet ? "表格已创建。" : "文档已创建。",
            "success"
          );
          await options.refreshTree();
          if (!isFolder) {
            options.openDoc(created.id, created.editorType);
          }
        } catch (error) {
          options.showToastMessage(getApiErrorMessage(error, "创建失败，请稍后重试。"), "error");
        }
      }
    };
  };
  const openTemplateLibrary = (parentId = null) => {
    if (!ensureEditPermission()) {
      return;
    }
    templateDialogParentId.value = parentId;
    showTemplateDialog.value = true;
  };
  const hideTemplateDialog = () => {
    if (showTemplateDialog.value) {
      showTemplateDialog.value = false;
    }
  };
  watch(showTemplateDialog, (open) => {
    if (!open) {
      templateDialogParentId.value = null;
    }
  });
  const renameNode = (node) => {
    if (!ensureEditPermission()) {
      return;
    }
    renamingNodeId.value = node.id;
  };
  const finishRename = async (payload) => {
    const { node, committed } = payload;
    if (renamingNodeId.value === node.id) {
      renamingNodeId.value = null;
    }
    const normalizedTitle = payload.title.trim();
    if (!committed || !normalizedTitle || normalizedTitle === node.title) {
      options.refocusNodeRow(node.id);
      return;
    }
    try {
      await updateKnowledgeDocument(node.id, { title: normalizedTitle });
      options.showToastMessage("已更新名称。", "success");
      await options.refreshTree();
    } catch (error) {
      options.showToastMessage(getApiErrorMessage(error, "重命名失败。"), "error");
    } finally {
      options.refocusNodeRow(node.id);
    }
  };
  const collectSubtreeDocIds = (root) => {
    const ids = [];
    const walk = (node) => {
      if (node.type !== "folder") {
        ids.push(node.id);
      }
      node.children.forEach(walk);
    };
    walk(root);
    return ids;
  };
  const deleteNode = (node) => {
    if (!ensureEditPermission()) {
      return;
    }
    confirmDialog.value = {
      open: true,
      message: `确认将「${node.title}」移入回收站吗？`,
      onConfirm: async () => {
        try {
          const removedDocIds = collectSubtreeDocIds(node);
          await trashKnowledgeDocument(node.id);
          options.showToastMessage("已移入回收站。", "success");
          await options.refreshTree();
          const activeDocId = options.activeDocId.value;
          if (activeDocId && removedDocIds.includes(activeDocId)) {
            router.push({ name: "knowledge-workspace-home", params: { kbId: kbId.value } });
          }
        } catch (error) {
          options.showToastMessage(getApiErrorMessage(error, "删除失败。"), "error");
        }
      }
    };
  };
  const handleNodeMenuCreateChild = async (type, targetNode) => {
    if (!ensureEditPermission()) {
      options.closeNodeMenu();
      return;
    }
    const actionNode = targetNode ?? resolveActionNode();
    if (!actionNode || actionNode.type !== "folder" && actionNode.type !== "doc") {
      return;
    }
    if (actionNode.type === "doc") {
      const parentType = actionNode.parentId ? findTreeNode(options.treeNodes.value, actionNode.parentId)?.type ?? null : null;
      if (parentType === "doc") {
        return;
      }
    }
    options.closeNodeMenu();
    options.focusTreeNode(actionNode);
    await createNode(type, actionNode.id);
  };
  const handleNodeMenuRename = async (targetNode) => {
    if (!ensureEditPermission()) {
      options.closeNodeMenu();
      return;
    }
    const actionNode = targetNode ?? resolveActionNode();
    if (!actionNode) {
      return;
    }
    options.closeNodeMenu();
    options.focusTreeNode(actionNode);
    await renameNode(actionNode);
  };
  const handleNodeMenuMove = (targetNode) => {
    if (!ensureEditPermission()) {
      options.closeNodeMenu();
      return;
    }
    const actionNode = targetNode ?? resolveActionNode();
    if (!actionNode) {
      return;
    }
    options.closeNodeMenu();
    options.focusTreeNode(actionNode);
    options.openMoveDialog(actionNode);
  };
  const handleNodeMenuDelete = async (targetNode) => {
    if (!ensureEditPermission()) {
      options.closeNodeMenu();
      return;
    }
    const actionNode = targetNode ?? resolveActionNode();
    if (!actionNode) {
      return;
    }
    options.closeNodeMenu();
    options.focusTreeNode(actionNode);
    await deleteNode(actionNode);
  };
  const copyDocLinkByMode = async (mode, targetNode) => {
    const actionNode = targetNode ?? resolveActionNode();
    if (!actionNode || actionNode.type !== "doc") {
      return;
    }
    const textToCopy = mode === "titled" ? buildDocTitledLink(actionNode) : buildDocLink(actionNode.id, actionNode.editorType);
    if (!textToCopy) {
      options.closeNodeMenu();
      options.showToastMessage("复制链接失败，请稍后重试。", "error");
      return;
    }
    options.closeNodeMenu();
    options.focusTreeNode(actionNode);
    const copied = await copyText(textToCopy);
    if (!copied) {
      options.showToastMessage("复制链接失败，请手动复制地址栏。", "error");
      return;
    }
    options.showToastMessage(mode === "titled" ? "标题链接已复制（Markdown 格式）。" : "纯链接已复制。", "success");
  };
  const handleNodeMenuCopyLink = async (targetNode) => {
    await copyDocLinkByMode("titled", targetNode);
  };
  const handleNodeMenuCopyRawLink = async (targetNode) => {
    await copyDocLinkByMode("raw", targetNode);
  };
  const buildDuplicateTitle = (title) => {
    const normalizedTitle = title.trim() || "未命名文档";
    const numberedMatch = normalizedTitle.match(/^(.*?)\s*副本\s*(\d+)$/);
    const plainCopyMatch = normalizedTitle.match(/^(.*?)\s*副本$/);
    if (numberedMatch) {
      return `${numberedMatch[1]} 副本 ${Number(numberedMatch[2]) + 1}`;
    }
    if (plainCopyMatch) {
      return `${plainCopyMatch[1]} 副本 2`;
    }
    return `${normalizedTitle} 副本`;
  };
  const handleNodeMenuCopyNodeLink = async (targetNode) => {
    const actionNode = targetNode ?? resolveActionNode();
    if (!actionNode) {
      return;
    }
    const link = buildNodeLink(actionNode);
    if (!link) {
      options.closeNodeMenu();
      options.showToastMessage("复制链接失败，请稍后重试。", "error");
      return;
    }
    options.closeNodeMenu();
    options.focusTreeNode(actionNode);
    const copied = await copyText(link);
    if (!copied) {
      options.showToastMessage("复制链接失败，请手动复制地址栏。", "error");
      return;
    }
    options.showToastMessage("链接已复制。", "success");
  };
  const handleNodeMenuOpenInNewWindow = (targetNode) => {
    const actionNode = targetNode ?? resolveActionNode();
    if (!actionNode) {
      return;
    }
    options.closeNodeMenu();
    options.focusTreeNode(actionNode);
    const href = actionNode.type === "doc" ? router.resolve(
      getKnowledgeDocumentRouteTarget({
        kbId: kbId.value,
        docId: actionNode.id,
        editorType: actionNode.editorType
      })
    ).href : router.resolve({
      name: "knowledge-workspace-home",
      params: { kbId: kbId.value }
    }).href;
    if (window.xiaoyeDesktop) {
      void window.xiaoyeDesktop.openDocumentInNewWindow(href);
      return;
    }
    window.open(`${resolveWebBaseUrl()}${href}`, "_blank", "noopener,noreferrer");
  };
  const handleNodeMenuMoveOutOfDirectory = async (targetNode) => {
    if (!ensureEditPermission()) {
      options.closeNodeMenu();
      return;
    }
    const actionNode = targetNode ?? resolveActionNode();
    if (!actionNode || actionNode.parentId === null) {
      return;
    }
    options.closeNodeMenu();
    options.focusTreeNode(actionNode);
    try {
      await updateKnowledgeDocument(actionNode.id, { parentId: null });
      options.showToastMessage("已移出目录。", "success");
      await options.refreshTree();
    } catch (error) {
      options.showToastMessage(getApiErrorMessage(error, "移出目录失败。"), "error");
    }
  };
  const handleNodeMenuDuplicate = async (targetNode) => {
    if (!ensureEditPermission()) {
      options.closeNodeMenu();
      return;
    }
    const actionNode = targetNode ?? resolveActionNode();
    if (!actionNode) {
      return;
    }
    options.closeNodeMenu();
    options.focusTreeNode(actionNode);
    try {
      if (actionNode.type === "folder") {
        await createKnowledgeDocument({
          kbId: kbId.value,
          title: buildDuplicateTitle(actionNode.title),
          type: "folder",
          parentId: actionNode.parentId
        });
      } else {
        const sourceDocument = await getKnowledgeDocument(actionNode.id);
        await createKnowledgeDocument({
          kbId: kbId.value,
          title: buildDuplicateTitle(sourceDocument.title),
          type: sourceDocument.type,
          parentId: sourceDocument.parentId ?? null,
          status: sourceDocument.status,
          editorType: sourceDocument.editorType === KNOWLEDGE_DOCUMENT_EDITOR_TYPES.board ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.board : KNOWLEDGE_DOCUMENT_EDITOR_TYPES.richText,
          content: sourceDocument.content
        });
      }
      options.showToastMessage("已复制。", "success");
      await options.refreshTree();
    } catch (error) {
      options.showToastMessage(getApiErrorMessage(error, "复制失败。"), "error");
    }
  };
  const handleNodeMenuExport = async (format, targetNode) => {
    const actionNode = targetNode ?? resolveActionNode();
    if (!actionNode || actionNode.type !== "doc") {
      return;
    }
    options.closeNodeMenu();
    options.focusTreeNode(actionNode);
    try {
      const sourceDocument = await getKnowledgeDocument(actionNode.id);
      if (!sourceDocument.content || typeof sourceDocument.content.value !== "string") {
        options.showToastMessage("当前文档暂不支持导出。", "error");
        return;
      }
      const exportTitle = sourceDocument.title.trim() || "未命名文档";
      const exportValue = sourceDocument.content.value;
      const exportContentType = sourceDocument.content.scheme === "text/html" ? "html" : "markdown";
      const exportTools = await import("/src/utils/document-export.ts");
      if (format === "markdown") {
        await exportTools.exportAsMarkdown(exportTitle, exportValue, exportContentType);
        options.showToastMessage("Markdown 已导出。", "success");
        return;
      }
      if (format === "pdf") {
        await exportTools.exportAsPDF(exportTitle, exportValue, exportContentType);
        options.showToastMessage("PDF 已导出。", "success");
        return;
      }
      await exportTools.exportAsWord(exportTitle, exportValue, exportContentType);
      options.showToastMessage("Word 已导出。", "success");
    } catch (error) {
      options.showToastMessage(getApiErrorMessage(error, "导出失败。"), "error");
    }
  };
  const handleNodeMenuPinDocument = async (targetNode) => {
    const actionNode = targetNode ?? resolveActionNode();
    if (!actionNode || actionNode.type !== "doc") {
      return;
    }
    options.closeNodeMenu();
    options.focusTreeNode(actionNode);
    try {
      const favoriteState = await checkKnowledgeFavorite(actionNode.id);
      if (favoriteState.favorited) {
        await removeKnowledgeFavorite(actionNode.id);
        options.showToastMessage("已取消置顶。", "success");
      } else {
        await addKnowledgeFavorite(actionNode.id);
        options.showToastMessage("文档已置顶。", "success");
      }
    } catch (error) {
      options.showToastMessage(getApiErrorMessage(error, "置顶操作失败。"), "error");
    }
  };
  const createNodeInstantly = async (type) => {
    if (!ensureEditPermission()) {
      return;
    }
    const isFolder = type === "folder";
    const isBoard = type === "board";
    const isDatatable = type === "datatable";
    const isSheet = type === "sheet";
    const isMindmap = type === "mindmap";
    const typeLabel = isFolder ? "分组" : isBoard ? "画板" : isDatatable ? "数据表" : isSheet ? "表格" : isMindmap ? "思维导图" : "文档";
    const defaultTitle = isFolder ? "新建分组" : isBoard || isDatatable || isSheet || isMindmap ? `无标题${typeLabel}` : "新建文档";
    try {
      const created = await createKnowledgeDocument({
        kbId: kbId.value,
        title: defaultTitle,
        type: isFolder ? "folder" : "doc",
        editorType: isBoard ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.board : isDatatable ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.datatable : isSheet ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.sheet : isMindmap ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.mindmap : KNOWLEDGE_DOCUMENT_EDITOR_TYPES.richText,
        status: "draft",
        parentId: null,
        content: isBoard ? {
          scheme: KNOWLEDGE_BOARD_CONTENT_SCHEME,
          value: createKnowledgeBoardDocument()
        } : isDatatable ? {
          scheme: KNOWLEDGE_DATATABLE_CONTENT_SCHEME,
          value: { fields: [], rows: [] }
        } : isSheet ? {
          scheme: KNOWLEDGE_DATATABLE_CONTENT_SCHEME,
          value: { fields: [], rows: [] }
        } : isMindmap ? {
          scheme: KNOWLEDGE_MINDMAP_CONTENT_SCHEME,
          value: {
            data: { text: defaultTitle, uid: Math.random().toString(36).slice(2, 14) },
            children: []
          }
        } : void 0
      });
      options.showToastMessage(`${typeLabel}「${defaultTitle}」已创建，可直接开始编辑。`, "success");
      await options.refreshTree();
      if (!isFolder) {
        options.openDoc(created.id, created.editorType);
      }
    } catch (error) {
      options.showToastMessage(getApiErrorMessage(error, "创建失败，请稍后重试。"), "error");
    }
  };
  const handleRootCreateMenuAction = (action) => {
    if (action === "template") {
      openTemplateLibrary();
      return;
    }
    if (action === "folder") {
      void createNodeInstantly("folder");
      return;
    }
    void createNodeInstantly(action);
  };
  const treeNodeMenuGroups = computed(() => {
    const menu = options.menu.value;
    if (!menu) {
      return [];
    }
    const groups = [];
    const menuNodeParentType = menu.node.parentId ? findTreeNode(options.treeNodes.value, menu.node.parentId)?.type ?? null : null;
    const canTakeDocChildren = menu.node.type === "folder" || menu.node.type === "doc" && menuNodeParentType !== "doc";
    const createItems = [
      {
        id: "create-doc",
        label: "新建子文档",
        shortcut: "N",
        ariaKeyshortcuts: "N",
        icon: "ph:file-plus",
        disabled: !canTakeDocChildren || !options.canEdit(),
        onClick: () => void handleNodeMenuCreateChild("doc")
      },
      {
        id: "create-folder",
        label: "新建子分组",
        shortcut: "Shift+N",
        ariaKeyshortcuts: "Shift+N",
        icon: "ph:folder-simple-plus",
        disabled: menu.node.type !== "folder" || !options.canEdit(),
        onClick: () => void handleNodeMenuCreateChild("folder")
      },
      {
        id: "create-board",
        label: "新建子画板",
        shortcut: "B",
        ariaKeyshortcuts: "B",
        icon: "ph:clipboard-text",
        disabled: !canTakeDocChildren || !options.canEdit(),
        onClick: () => void handleNodeMenuCreateChild("board")
      }
    ];
    if (menu.mode === "create") {
      groups.push({
        id: "create",
        items: createItems
      });
      return groups;
    }
    groups.push({
      id: "basic",
      items: [
        {
          id: "rename",
          label: "重命名",
          shortcut: "F2",
          ariaKeyshortcuts: "F2",
          icon: "ph:note-pencil",
          disabled: !options.canEdit(),
          onClick: () => void handleNodeMenuRename()
        },
        {
          id: "copy-link",
          label: "复制链接",
          shortcut: menu.node.type === "doc" ? "Ctrl/Cmd+C" : void 0,
          ariaKeyshortcuts: menu.node.type === "doc" ? "Control+C Meta+C" : void 0,
          icon: "ph:link-simple",
          onClick: () => void handleNodeMenuCopyNodeLink()
        },
        {
          id: "open-new-window",
          label: "在新窗口打开",
          shortcut: menu.node.type === "doc" ? "Ctrl/Cmd+Enter" : void 0,
          ariaKeyshortcuts: menu.node.type === "doc" ? "Control+Enter Meta+Enter" : void 0,
          icon: "ph:arrow-square-out",
          onClick: () => handleNodeMenuOpenInNewWindow()
        }
      ]
    });
    groups.push({
      id: "detach",
      items: [
        {
          id: "move-out",
          label: "移出目录",
          icon: "ph:arrow-bend-up-left",
          disabled: !options.canEdit() || menu.node.parentId === null,
          onClick: () => void handleNodeMenuMoveOutOfDirectory()
        }
      ]
    });
    groups.push({
      id: "organize",
      items: [
        {
          id: "duplicate",
          label: "复制…",
          icon: "ph:copy",
          disabled: !options.canEdit(),
          onClick: () => void handleNodeMenuDuplicate()
        },
        {
          id: "move",
          label: "移动…",
          shortcut: "M",
          ariaKeyshortcuts: "M",
          icon: "ph:arrows-out-cardinal",
          disabled: !options.canEdit(),
          onClick: () => handleNodeMenuMove()
        },
        {
          id: "export",
          label: "导出…",
          icon: "ph:export",
          disabled: menu.node.type !== "doc",
          children: [
            {
              id: "export-markdown",
              label: "导出为 Markdown",
              icon: "ph:file-text",
              onClick: () => void handleNodeMenuExport("markdown")
            },
            {
              id: "export-pdf",
              label: "导出为 PDF",
              icon: "ph:file-text",
              onClick: () => void handleNodeMenuExport("pdf")
            },
            {
              id: "export-word",
              label: "导出为 Word",
              icon: "ph:file-text",
              onClick: () => void handleNodeMenuExport("word")
            }
          ],
          onClick: () => {
          }
        },
        {
          id: "pin",
          label: "置顶文档",
          icon: "ph:push-pin-simple",
          disabled: menu.node.type !== "doc",
          onClick: () => void handleNodeMenuPinDocument()
        }
      ]
    });
    groups.push({
      id: "danger",
      items: [
        {
          id: "delete",
          label: "删除",
          shortcut: "Delete",
          ariaKeyshortcuts: "Delete Backspace",
          icon: "ph:trash-simple",
          tone: "danger",
          disabled: !options.canEdit(),
          onClick: () => void handleNodeMenuDelete()
        }
      ]
    });
    return groups;
  });
  const handleMenuShortcut = (event, targetNode) => {
    const normalizedKey = event.key.toLowerCase();
    const withModifier = event.metaKey || event.ctrlKey;
    if (withModifier && normalizedKey === "c") {
      if (targetNode.type !== "doc") {
        return;
      }
      const hasTextSelection = typeof window !== "undefined" && Boolean(window.getSelection()?.toString());
      if (hasTextSelection) {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) {
        void handleNodeMenuCopyLink(targetNode);
        return;
      }
      void handleNodeMenuCopyRawLink(targetNode);
      return;
    }
    if (withModifier && event.key === "Enter") {
      if (targetNode.type !== "doc") {
        return;
      }
      event.preventDefault();
      handleNodeMenuOpenInNewWindow(targetNode);
      return;
    }
    if (event.key === "F2") {
      if (!options.canEdit()) {
        return;
      }
      event.preventDefault();
      void handleNodeMenuRename(targetNode);
      return;
    }
    if (!withModifier && !event.altKey && normalizedKey === "m") {
      if (!options.canEdit()) {
        return;
      }
      event.preventDefault();
      handleNodeMenuMove(targetNode);
      return;
    }
    const shortcutParentType = targetNode.parentId ? findTreeNode(options.treeNodes.value, targetNode.parentId)?.type ?? null : null;
    const shortcutCanTakeDocChildren = targetNode.type === "folder" || targetNode.type === "doc" && shortcutParentType !== "doc";
    if (!withModifier && !event.altKey && normalizedKey === "n" && shortcutCanTakeDocChildren) {
      if (!options.canEdit()) {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) {
        if (targetNode.type !== "folder") {
          return;
        }
        void handleNodeMenuCreateChild("folder", targetNode);
        return;
      }
      void handleNodeMenuCreateChild("doc", targetNode);
      return;
    }
    if (!withModifier && !event.altKey && normalizedKey === "b" && shortcutCanTakeDocChildren) {
      if (!options.canEdit()) {
        return;
      }
      event.preventDefault();
      void handleNodeMenuCreateChild("board", targetNode);
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && !withModifier && !event.altKey) {
      if (!options.canEdit()) {
        return;
      }
      event.preventDefault();
      void handleNodeMenuDelete(targetNode);
    }
  };
  return {
    inputDialog,
    confirmDialog,
    showTemplateDialog,
    templateDialogParentId,
    hideTemplateDialog,
    createNode,
    openTemplateLibrary,
    renamingNodeId,
    finishRename,
    deleteNode,
    resolveActionNode,
    handleRootCreateMenuAction,
    treeNodeMenuGroups,
    handleMenuShortcut
  };
};

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInVzZS10cmVlLW5vZGUtYWN0aW9ucy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIOefpeivhuW6k+aWh+aho+agkeiKgueCueaTjeS9nCBjb21wb3NhYmxl44CCXG4gKlxuICog5LuOIEtub3dsZWRnZVdvcmtzcGFjZUxheW91dCDmir3lh7rvvJrmlrDlu7ov5Yig6ZmkL+WkjeWIti/np7vliqgv5a+85Ye6L+e9rumhtuetieS4muWKoSBoYW5kbGVy44CBXG4gKiDpk77mjqXmnoTpgKDjgIHlr7nor53moYbvvIjmlrDlu7rovpPlhaUv56Gu6K6kL+aooeadv++8ieeKtuaAge+8jOS7peWPiuWPs+mUruiPnOWNleWIhue7hFxuICog77yIdHJlZU5vZGVNZW51R3JvdXBz77yJ5LiO6ZSu55uYIE0vRjIvTi9CL0RlbGV0ZSDnrYnoj5zljZXlv6vmjbfplK7nmoTliIblj5HjgIJcbiAqIOmHjeWRveWQjei1sOagkeihjOWGhee8lui+ke+8iOWvuem9kOivrembgO+8muS4jeW8gOW8ueeql++8ie+8jOacrOaooeWdl+WPquaMgeaciSByZW5hbWluZ05vZGVJZCDkuI7mlLblsL7mj5DkuqTjgIJcbiAqIOW4g+WxgOWPquS/neeVmeWFqOWxgCBrZXlkb3duIOWIhuWPkeOAgeagkeWvvOiIquW/q+aNt+mUruS4juaooeadv+e7keWumuOAglxuICovXG5pbXBvcnQgeyBjb21wdXRlZCwgcmVmLCB3YXRjaCwgdHlwZSBSZWYgfSBmcm9tIFwidnVlXCJcbmltcG9ydCB0eXBlIHsgUm91dGVyIH0gZnJvbSBcInZ1ZS1yb3V0ZXJcIlxuaW1wb3J0IHsgZ2V0QXBpRXJyb3JNZXNzYWdlIH0gZnJvbSBcIkAvc2VydmljZXMvaHR0cC1jbGllbnRcIlxuaW1wb3J0IHsgcmVzb2x2ZVdlYkJhc2VVcmwgfSBmcm9tIFwiQC9zZXJ2aWNlcy9kZXNrdG9wLWJyaWRnZVwiXG5pbXBvcnQgeyBhZGRLbm93bGVkZ2VGYXZvcml0ZSwgY2hlY2tLbm93bGVkZ2VGYXZvcml0ZSwgcmVtb3ZlS25vd2xlZGdlRmF2b3JpdGUgfSBmcm9tIFwiQC9zZXJ2aWNlcy9rbm93bGVkZ2UtZmF2b3JpdGVzXCJcbmltcG9ydCB7XG4gIGNyZWF0ZUtub3dsZWRnZURvY3VtZW50LFxuICBnZXRLbm93bGVkZ2VEb2N1bWVudCxcbiAgdHJhc2hLbm93bGVkZ2VEb2N1bWVudCxcbiAgdXBkYXRlS25vd2xlZGdlRG9jdW1lbnQsXG4gIHR5cGUgS25vd2xlZGdlRG9jdW1lbnRUcmVlTm9kZSxcbn0gZnJvbSBcIkAvc2VydmljZXMva25vd2xlZGdlLWRvY3VtZW50c1wiXG5pbXBvcnQge1xuICBLTk9XTEVER0VfQk9BUkRfQ09OVEVOVF9TQ0hFTUUsXG4gIEtOT1dMRURHRV9EQVRBVEFCTEVfQ09OVEVOVF9TQ0hFTUUsXG4gIEtOT1dMRURHRV9NSU5ETUFQX0NPTlRFTlRfU0NIRU1FLFxuICBLTk9XTEVER0VfRE9DVU1FTlRfRURJVE9SX1RZUEVTLFxufSBmcm9tIFwiQC90eXBlcy9rbm93bGVkZ2UtZG9jdW1lbnRcIlxuaW1wb3J0IHsgY3JlYXRlS25vd2xlZGdlQm9hcmREb2N1bWVudCB9IGZyb20gXCJAL3V0aWxzL2tub3dsZWRnZS1ib2FyZFwiXG5pbXBvcnQgeyBnZXRLbm93bGVkZ2VEb2N1bWVudFJvdXRlVGFyZ2V0IH0gZnJvbSBcIkAvdXRpbHMva25vd2xlZGdlLWRvY3VtZW50XCJcbmltcG9ydCB0eXBlIHsgVHJlZU5vZGVNZW51R3JvdXAsIFRyZWVOb2RlTWVudUl0ZW0sIFRyZWVOb2RlTWVudVN0YXRlIH0gZnJvbSBcIkAvY29tcG9uZW50cy9rbm93bGVkZ2UvdHJlZS1ub2RlLW1lbnVcIlxuaW1wb3J0IHsgZmluZFRyZWVOb2RlIH0gZnJvbSBcIkAvY29tcG9uZW50cy9rbm93bGVkZ2UvdHJlZS11dGlsc1wiXG5pbXBvcnQgdHlwZSB7IEtub3dsZWRnZVdvcmtzcGFjZUNyZWF0ZU5vZGVUeXBlIH0gZnJvbSBcIi4vd29ya3NwYWNlLWNvbnRleHRcIlxuXG5leHBvcnQgY29uc3QgdXNlVHJlZU5vZGVBY3Rpb25zID0gKG9wdGlvbnM6IHtcbiAga2JJZDogUmVmPHN0cmluZz5cbiAgLyoqIOW9k+WJjeaJk+W8gOeahOWPs+mUruiPnOWNleeKtuaAge+8iOWIhue7hOaehOmAoOS4juWKqOS9nOiKgueCueino+aekOmDveS+nei1luWug++8iSAqL1xuICBtZW51OiBSZWY8VHJlZU5vZGVNZW51U3RhdGUgfCBudWxsPlxuICBhY3RpdmVEb2NJZDogUmVmPHN0cmluZyB8IG51bGw+XG4gIHRyZWVOb2RlczogUmVmPEtub3dsZWRnZURvY3VtZW50VHJlZU5vZGVbXT5cbiAgcm91dGVyOiBSb3V0ZXJcbiAgY2FuRWRpdDogKCkgPT4gYm9vbGVhblxuICBnZXRGb2N1c2VkVHJlZU5vZGU6ICgpID0+IEtub3dsZWRnZURvY3VtZW50VHJlZU5vZGUgfCBudWxsXG4gIGZvY3VzVHJlZU5vZGU6IChub2RlOiBLbm93bGVkZ2VEb2N1bWVudFRyZWVOb2RlKSA9PiB2b2lkXG4gIGNsb3NlTm9kZU1lbnU6ICgpID0+IHZvaWRcbiAgcmVmcmVzaFRyZWU6ICgpID0+IFByb21pc2U8dm9pZD5cbiAgb3BlbkRvYzogKGRvY0lkOiBzdHJpbmcsIGVkaXRvclR5cGU/OiBzdHJpbmcgfCBudWxsKSA9PiB2b2lkXG4gIG9wZW5Nb3ZlRGlhbG9nOiAobm9kZTogS25vd2xlZGdlRG9jdW1lbnRUcmVlTm9kZSkgPT4gdm9pZFxuICAvKiog6KGM5YaF6YeN5ZG95ZCN57uT5p2f5ZCO5oqK6ZSu55uY54Sm54K55Lqk5Zue6K+l6KGM77yM5pa55ZCR6ZSu5a+86Iiq5omN6IO957un57utICovXG4gIHJlZm9jdXNOb2RlUm93OiAobm9kZUlkOiBzdHJpbmcpID0+IHZvaWRcbiAgc2hvd1RvYXN0TWVzc2FnZTogKG1lc3NhZ2U6IHN0cmluZywgdHlwZT86IFwic3VjY2Vzc1wiIHwgXCJlcnJvclwiIHwgXCJpbmZvXCIpID0+IHZvaWRcbn0pID0+IHtcbiAgY29uc3QgeyBrYklkLCByb3V0ZXIgfSA9IG9wdGlvbnNcblxuICBjb25zdCBzaG93VGVtcGxhdGVEaWFsb2cgPSByZWYoZmFsc2UpXG4gIGNvbnN0IHRlbXBsYXRlRGlhbG9nUGFyZW50SWQgPSByZWY8c3RyaW5nIHwgbnVsbD4obnVsbClcbiAgY29uc3QgaW5wdXREaWFsb2cgPSByZWY8e1xuICAgIG9wZW46IGJvb2xlYW5cbiAgICB0aXRsZTogc3RyaW5nXG4gICAgZGVmYXVsdFZhbHVlOiBzdHJpbmdcbiAgICBvbkNvbmZpcm06IChcbiAgICAgIHZhbHVlOiBzdHJpbmcsXG4gICAgICBwYXJlbnRJZDogc3RyaW5nLFxuICAgICAgZWRpdG9yVHlwZTogXCJyaWNoVGV4dFwiIHwgXCJib2FyZFwiIHwgXCJkYXRhdGFibGVcIiB8IFwic2hlZXRcIiB8IFwibWluZG1hcFwiXG4gICAgKSA9PiB2b2lkXG4gICAgZm9sZGVycz86IEFycmF5PHsgaWQ6IHN0cmluZzsgbGFiZWw6IHN0cmluZyB9PlxuICAgIGRlZmF1bHRGb2xkZXJJZD86IHN0cmluZ1xuICAgIC8qKiDoj5zljZXnm7Tovr7nsbvlnovml7bnmoTpooTpgInvvIhCNyDlhaXlj6PooaXlhajvvInvvJvnvLrnnIEgcmljaFRleHQgKi9cbiAgICBwcmVzZXRFZGl0b3JUeXBlPzogXCJyaWNoVGV4dFwiIHwgXCJib2FyZFwiIHwgXCJkYXRhdGFibGVcIiB8IFwic2hlZXRcIiB8IFwibWluZG1hcFwiXG4gIH0+KHsgb3BlbjogZmFsc2UsIHRpdGxlOiBcIlwiLCBkZWZhdWx0VmFsdWU6IFwiXCIsIG9uQ29uZmlybTogKCkgPT4ge30gfSlcbiAgY29uc3QgY29uZmlybURpYWxvZyA9IHJlZjx7IG9wZW46IGJvb2xlYW47IG1lc3NhZ2U6IHN0cmluZzsgb25Db25maXJtOiAoKSA9PiB2b2lkIH0+KHtcbiAgICBvcGVuOiBmYWxzZSxcbiAgICBtZXNzYWdlOiBcIlwiLFxuICAgIG9uQ29uZmlybTogKCkgPT4ge30sXG4gIH0pXG4gIC8qKiDmraPlnKjooYzlhoXmlLnlkI3nmoToioLngrkgaWTvvIjlr7npvZDor63pm4DvvJrph43lkb3lkI3kuI3lvIDlvLnnqpfvvIznm7TmjqXlnKjmoJHooYzph4zmlLnvvIkgKi9cbiAgY29uc3QgcmVuYW1pbmdOb2RlSWQgPSByZWY8c3RyaW5nIHwgbnVsbD4obnVsbClcblxuICBjb25zdCBlbnN1cmVFZGl0UGVybWlzc2lvbiA9IChtZXNzYWdlID0gXCLlvZPliY3op5LoibLmsqHmnInnvJbovpHmnYPpmZDjgIJcIikgPT4ge1xuICAgIGlmIChvcHRpb25zLmNhbkVkaXQoKSkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBvcHRpb25zLnNob3dUb2FzdE1lc3NhZ2UobWVzc2FnZSwgXCJlcnJvclwiKVxuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgY29uc3QgY29weVRleHQgPSBhc3luYyAodGV4dFRvQ29weTogc3RyaW5nKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KHRleHRUb0NvcHkpXG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH0gY2F0Y2gge1xuICAgICAgY29uc3QgdGV4dGFyZWEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidGV4dGFyZWFcIilcbiAgICAgIHRleHRhcmVhLnZhbHVlID0gdGV4dFRvQ29weVxuICAgICAgdGV4dGFyZWEuc3R5bGUucG9zaXRpb24gPSBcImZpeGVkXCJcbiAgICAgIHRleHRhcmVhLnN0eWxlLmxlZnQgPSBcIi05OTk5cHhcIlxuICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0ZXh0YXJlYSlcblxuICAgICAgdHJ5IHtcbiAgICAgICAgdGV4dGFyZWEuc2VsZWN0KClcbiAgICAgICAgZG9jdW1lbnQuZXhlY0NvbW1hbmQoXCJjb3B5XCIpXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICAvLyBzZWxlY3QvZXhlY0NvbW1hbmQg5oqb5byC5bi45pe25Lmf6KaB56e76Zmk77yM6YG/5YWNIHRleHRhcmVhIOaui+eVmeWcqCBib2R5XG4gICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQodGV4dGFyZWEpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY29uc3QgYnVpbGREb2NMaW5rID0gKGRvY0lkOiBzdHJpbmcsIGVkaXRvclR5cGU/OiBzdHJpbmcgfCBudWxsKSA9PiB7XG4gICAgaWYgKHR5cGVvZiB3aW5kb3cgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHJldHVybiBcIlwiXG4gICAgfVxuXG4gICAgY29uc3QgaHJlZiA9IHJvdXRlci5yZXNvbHZlKFxuICAgICAgZ2V0S25vd2xlZGdlRG9jdW1lbnRSb3V0ZVRhcmdldCh7XG4gICAgICAgIGtiSWQ6IGtiSWQudmFsdWUsXG4gICAgICAgIGRvY0lkLFxuICAgICAgICBlZGl0b3JUeXBlLFxuICAgICAgfSlcbiAgICApLmhyZWZcblxuICAgIHJldHVybiBgJHtyZXNvbHZlV2ViQmFzZVVybCgpfSR7aHJlZn1gXG4gIH1cblxuICBjb25zdCBidWlsZEZvbGRlckxpbmsgPSAoKSA9PiB7XG4gICAgaWYgKHR5cGVvZiB3aW5kb3cgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHJldHVybiBcIlwiXG4gICAgfVxuXG4gICAgY29uc3QgaHJlZiA9IHJvdXRlci5yZXNvbHZlKHtcbiAgICAgIG5hbWU6IFwia25vd2xlZGdlLXdvcmtzcGFjZS1ob21lXCIsXG4gICAgICBwYXJhbXM6IHsga2JJZDoga2JJZC52YWx1ZSB9LFxuICAgIH0pLmhyZWZcblxuICAgIHJldHVybiBgJHtyZXNvbHZlV2ViQmFzZVVybCgpfSR7aHJlZn1gXG4gIH1cblxuICBjb25zdCBidWlsZE5vZGVMaW5rID0gKG5vZGU6IEtub3dsZWRnZURvY3VtZW50VHJlZU5vZGUpID0+IHtcbiAgICBpZiAobm9kZS50eXBlID09PSBcImRvY1wiKSB7XG4gICAgICByZXR1cm4gYnVpbGREb2NMaW5rKG5vZGUuaWQsIG5vZGUuZWRpdG9yVHlwZSlcbiAgICB9XG5cbiAgICByZXR1cm4gYnVpbGRGb2xkZXJMaW5rKClcbiAgfVxuXG4gIGNvbnN0IGVzY2FwZU1hcmtkb3duVGV4dCA9ICh2YWx1ZTogc3RyaW5nKSA9PiB7XG4gICAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoLyhbKClbXFxdXSkvZywgXCJcXFxcJDFcIilcbiAgfVxuXG4gIGNvbnN0IGJ1aWxkRG9jVGl0bGVkTGluayA9IChub2RlOiBLbm93bGVkZ2VEb2N1bWVudFRyZWVOb2RlKSA9PiB7XG4gICAgY29uc3QgZG9jTGluayA9IGJ1aWxkRG9jTGluayhub2RlLmlkLCBub2RlLmVkaXRvclR5cGUpXG5cbiAgICBpZiAoIWRvY0xpbmspIHtcbiAgICAgIHJldHVybiBcIlwiXG4gICAgfVxuXG4gICAgY29uc3Qgbm9ybWFsaXplZFRpdGxlID0gbm9kZS50aXRsZS50cmltKCkgfHwgXCLmnKrlkb3lkI3mlofmoaNcIlxuICAgIHJldHVybiBgWyR7ZXNjYXBlTWFya2Rvd25UZXh0KG5vcm1hbGl6ZWRUaXRsZSl9XSgke2RvY0xpbmt9KWBcbiAgfVxuXG4gIGNvbnN0IHJlc29sdmVBY3Rpb25Ob2RlID0gKCkgPT4ge1xuICAgIGlmIChvcHRpb25zLm1lbnUudmFsdWUpIHtcbiAgICAgIHJldHVybiBvcHRpb25zLm1lbnUudmFsdWUubm9kZVxuICAgIH1cblxuICAgIHJldHVybiBvcHRpb25zLmdldEZvY3VzZWRUcmVlTm9kZSgpXG4gIH1cblxuICBjb25zdCBjcmVhdGVOb2RlID0gKHR5cGU6IEtub3dsZWRnZVdvcmtzcGFjZUNyZWF0ZU5vZGVUeXBlLCBwYXJlbnRJZDogc3RyaW5nIHwgbnVsbCA9IG51bGwpID0+IHtcbiAgICBpZiAoIWVuc3VyZUVkaXRQZXJtaXNzaW9uKCkpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNvbnN0IGlzRm9sZGVyID0gdHlwZSA9PT0gXCJmb2xkZXJcIlxuICAgIGNvbnN0IGlzQm9hcmQgPSB0eXBlID09PSBcImJvYXJkXCJcbiAgICBjb25zdCBpc0RhdGF0YWJsZSA9IHR5cGUgPT09IFwiZGF0YXRhYmxlXCJcbiAgICBjb25zdCBpc1NoZWV0ID0gdHlwZSA9PT0gXCJzaGVldFwiXG4gICAgY29uc3QgaXNNaW5kbWFwID0gdHlwZSA9PT0gXCJtaW5kbWFwXCJcbiAgICBjb25zdCB0eXBlTGFiZWwgPSBpc0ZvbGRlclxuICAgICAgPyBcIuWIhue7hFwiXG4gICAgICA6IGlzQm9hcmRcbiAgICAgICAgPyBcIueUu+adv1wiXG4gICAgICAgIDogaXNEYXRhdGFibGVcbiAgICAgICAgICA/IFwi5pWw5o2u6KGoXCJcbiAgICAgICAgICA6IGlzU2hlZXRcbiAgICAgICAgICAgID8gXCLooajmoLxcIlxuICAgICAgICAgICAgOiBpc01pbmRtYXBcbiAgICAgICAgICAgICAgPyBcIuaAnee7tOWvvOWbvlwiXG4gICAgICAgICAgICAgIDogXCLmlofmoaNcIlxuICAgIGNvbnN0IGRlZmF1bHRUaXRsZSA9IGlzRm9sZGVyXG4gICAgICA/IFwi5paw5bu65YiG57uEXCJcbiAgICAgIDogaXNCb2FyZFxuICAgICAgICA/IFwi5peg5qCH6aKY55S75p2/XCJcbiAgICAgICAgOiBpc0RhdGF0YWJsZSB8fCBpc1NoZWV0IHx8IGlzTWluZG1hcFxuICAgICAgICAgID8gYOaXoOagh+mimCR7dHlwZUxhYmVsfWBcbiAgICAgICAgICA6IFwi5paw5bu65paH5qGjXCJcblxuICAgIC8vIOWvuem9kOivrembgOaWsOW7uuW8ueeql++8muagueebruW9lSArIOWQhOe6p+WuueWZqO+8iOW4pui3r+W+hOe8qei/myBsYWJlbO+8ieOAglxuICAgIC8vIOmAiemhueaMieWtkOe6p+exu+Wei+i/h+a7pO+8iOivhOWuoSBJMu+8ie+8muaWsOW7uuWIhue7hOWPquiDvemAieWIhue7hOS9nOeItue6p++8m+aWsOW7uuaWh+aho+exu+S4jeiDvemAiVxuICAgIC8vIOOAjOW3suaMguWcqOaWh+aho+S4i+eahOaWh+aho+OAjeKAlOKAlOWQpuWImeWQjuerr+a3seW6puinhOWImeW/heaLku+8jOe7v+eBr+mAiemhueWPmOaIkCA0MDNcbiAgICBjb25zdCBpc0ZvbGRlckNyZWF0ZSA9IHR5cGUgPT09IFwiZm9sZGVyXCJcbiAgICBjb25zdCBmb2xkZXJzOiBBcnJheTx7IGlkOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmcgfT4gPSBbeyBpZDogXCJcIiwgbGFiZWw6IFwi5qC555uu5b2VXCIgfV1cblxuICAgIGNvbnN0IHdhbGtGb2xkZXJzID0gKG5vZGVzOiBLbm93bGVkZ2VEb2N1bWVudFRyZWVOb2RlW10sIHByZWZpeDogc3RyaW5nLCBwYXJlbnRUeXBlOiBzdHJpbmcgfCBudWxsKSA9PiB7XG4gICAgICBub2Rlcy5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgICAgICBpZiAoaXRlbS50eXBlICE9PSBcImZvbGRlclwiICYmIGl0ZW0udHlwZSAhPT0gXCJkb2NcIikge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcGF0aCA9IHByZWZpeCA/IGAke3ByZWZpeH0gLyAke2l0ZW0udGl0bGV9YCA6IGl0ZW0udGl0bGVcblxuICAgICAgICBpZiAoaXNGb2xkZXJDcmVhdGUgPyBpdGVtLnR5cGUgPT09IFwiZm9sZGVyXCIgOiBpdGVtLnR5cGUgPT09IFwiZm9sZGVyXCIgfHwgcGFyZW50VHlwZSAhPT0gXCJkb2NcIikge1xuICAgICAgICAgIGZvbGRlcnMucHVzaCh7IGlkOiBpdGVtLmlkLCBsYWJlbDogcGF0aCB9KVxuICAgICAgICB9XG5cbiAgICAgICAgd2Fsa0ZvbGRlcnMoaXRlbS5jaGlsZHJlbiwgcGF0aCwgaXRlbS50eXBlKVxuICAgICAgfSlcbiAgICB9XG5cbiAgICB3YWxrRm9sZGVycyhvcHRpb25zLnRyZWVOb2Rlcy52YWx1ZSwgXCJcIiwgbnVsbClcblxuICAgIGlucHV0RGlhbG9nLnZhbHVlID0ge1xuICAgICAgb3BlbjogdHJ1ZSxcbiAgICAgIHRpdGxlOiBg5paw5bu6JHt0eXBlTGFiZWx9YCxcbiAgICAgIGRlZmF1bHRWYWx1ZTogZGVmYXVsdFRpdGxlLFxuICAgICAgZm9sZGVycyxcbiAgICAgIGRlZmF1bHRGb2xkZXJJZDogcGFyZW50SWQgPz8gXCJcIixcbiAgICAgIC8vIOiPnOWNleebtOi+vu+8muexu+Wei+mihOmAieW5tuWxleW8gOmrmOe6p+mAiemhue+8iEI3IOWFpeWPo+ihpeWFqO+8iVxuICAgICAgcHJlc2V0RWRpdG9yVHlwZTogaXNCb2FyZFxuICAgICAgICA/IFwiYm9hcmRcIlxuICAgICAgICA6IGlzRGF0YXRhYmxlXG4gICAgICAgICAgPyBcImRhdGF0YWJsZVwiXG4gICAgICAgICAgOiBpc1NoZWV0XG4gICAgICAgICAgICA/IFwic2hlZXRcIlxuICAgICAgICAgICAgOiBpc01pbmRtYXBcbiAgICAgICAgICAgICAgPyBcIm1pbmRtYXBcIlxuICAgICAgICAgICAgICA6IFwicmljaFRleHRcIixcbiAgICAgIG9uQ29uZmlybTogYXN5bmMgKG5vcm1hbGl6ZWRUaXRsZSwgdGFyZ2V0UGFyZW50SWQsIGVkaXRvclR5cGUpID0+IHtcbiAgICAgICAgY29uc3QgdXNlQm9hcmQgPSBpc0JvYXJkIHx8IGVkaXRvclR5cGUgPT09IFwiYm9hcmRcIlxuICAgICAgICBjb25zdCB1c2VEYXRhdGFibGUgPSAhaXNGb2xkZXIgJiYgIXVzZUJvYXJkICYmIGVkaXRvclR5cGUgPT09IFwiZGF0YXRhYmxlXCJcbiAgICAgICAgY29uc3QgdXNlU2hlZXQgPSAhaXNGb2xkZXIgJiYgIXVzZUJvYXJkICYmICF1c2VEYXRhdGFibGUgJiYgZWRpdG9yVHlwZSA9PT0gXCJzaGVldFwiXG4gICAgICAgIGNvbnN0IHVzZU1pbmRtYXAgPSAhaXNGb2xkZXIgJiYgIXVzZUJvYXJkICYmICF1c2VEYXRhdGFibGUgJiYgIXVzZVNoZWV0ICYmIGVkaXRvclR5cGUgPT09IFwibWluZG1hcFwiXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgY3JlYXRlZCA9IGF3YWl0IGNyZWF0ZUtub3dsZWRnZURvY3VtZW50KHtcbiAgICAgICAgICAgIGtiSWQ6IGtiSWQudmFsdWUsXG4gICAgICAgICAgICB0aXRsZTogbm9ybWFsaXplZFRpdGxlLFxuICAgICAgICAgICAgdHlwZTpcbiAgICAgICAgICAgICAgdXNlQm9hcmQgfHwgdXNlRGF0YXRhYmxlIHx8IHVzZVNoZWV0IHx8IHVzZU1pbmRtYXBcbiAgICAgICAgICAgICAgICA/IFwiZG9jXCJcbiAgICAgICAgICAgICAgICA6ICh0eXBlIGFzIFwiZG9jXCIgfCBcImZvbGRlclwiIHwgXCJ0ZW1wbGF0ZVwiIHwgXCJsaW5rXCIpLFxuICAgICAgICAgICAgZWRpdG9yVHlwZTogdXNlQm9hcmRcbiAgICAgICAgICAgICAgPyBLTk9XTEVER0VfRE9DVU1FTlRfRURJVE9SX1RZUEVTLmJvYXJkXG4gICAgICAgICAgICAgIDogdXNlRGF0YXRhYmxlXG4gICAgICAgICAgICAgICAgPyBLTk9XTEVER0VfRE9DVU1FTlRfRURJVE9SX1RZUEVTLmRhdGF0YWJsZVxuICAgICAgICAgICAgICAgIDogdXNlU2hlZXRcbiAgICAgICAgICAgICAgICAgID8gS05PV0xFREdFX0RPQ1VNRU5UX0VESVRPUl9UWVBFUy5zaGVldFxuICAgICAgICAgICAgICAgICAgOiB1c2VNaW5kbWFwXG4gICAgICAgICAgICAgICAgICAgID8gS05PV0xFREdFX0RPQ1VNRU5UX0VESVRPUl9UWVBFUy5taW5kbWFwXG4gICAgICAgICAgICAgICAgICAgIDogS05PV0xFREdFX0RPQ1VNRU5UX0VESVRPUl9UWVBFUy5yaWNoVGV4dCxcbiAgICAgICAgICAgIHN0YXR1czogXCJkcmFmdFwiLFxuICAgICAgICAgICAgcGFyZW50SWQ6IHRhcmdldFBhcmVudElkIHx8IG51bGwsXG4gICAgICAgICAgICBjb250ZW50OiBpc0ZvbGRlclxuICAgICAgICAgICAgICA/IHVuZGVmaW5lZFxuICAgICAgICAgICAgICA6IHVzZUJvYXJkXG4gICAgICAgICAgICAgICAgPyB7XG4gICAgICAgICAgICAgICAgICAgIHNjaGVtZTogS05PV0xFREdFX0JPQVJEX0NPTlRFTlRfU0NIRU1FLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogY3JlYXRlS25vd2xlZGdlQm9hcmREb2N1bWVudCgpLFxuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIDogdXNlRGF0YXRhYmxlXG4gICAgICAgICAgICAgICAgICA/IHtcbiAgICAgICAgICAgICAgICAgICAgICBzY2hlbWU6IEtOT1dMRURHRV9EQVRBVEFCTEVfQ09OVEVOVF9TQ0hFTUUsXG4gICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHsgZmllbGRzOiBbXSwgcm93czogW10gfSxcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgOiB1c2VTaGVldFxuICAgICAgICAgICAgICAgICAgICA/IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjaGVtZTogS05PV0xFREdFX0RBVEFUQUJMRV9DT05URU5UX1NDSEVNRSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiB7IGZpZWxkczogW10sIHJvd3M6IFtdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICA6IHVzZU1pbmRtYXBcbiAgICAgICAgICAgICAgICAgICAgICA/IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgc2NoZW1lOiBLTk9XTEVER0VfTUlORE1BUF9DT05URU5UX1NDSEVNRSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IHRleHQ6IG5vcm1hbGl6ZWRUaXRsZSwgdWlkOiBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyLCAxNCkgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGlsZHJlbjogW10sXG4gICAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgOiB7IHNjaGVtZTogXCJ0ZXh0L21hcmtkb3duXCIsIHZhbHVlOiBcIlwiIH0sXG4gICAgICAgICAgfSlcbiAgICAgICAgICBvcHRpb25zLnNob3dUb2FzdE1lc3NhZ2UoXG4gICAgICAgICAgICBpc0ZvbGRlclxuICAgICAgICAgICAgICA/IFwi5YiG57uE5bey5Yib5bu644CCXCJcbiAgICAgICAgICAgICAgOiB1c2VCb2FyZFxuICAgICAgICAgICAgICAgID8gXCLnlLvmnb/lt7LliJvlu7rjgIJcIlxuICAgICAgICAgICAgICAgIDogdXNlRGF0YXRhYmxlXG4gICAgICAgICAgICAgICAgICA/IFwi5pWw5o2u6KGo5bey5Yib5bu644CCXCJcbiAgICAgICAgICAgICAgICAgIDogdXNlU2hlZXRcbiAgICAgICAgICAgICAgICAgICAgPyBcIuihqOagvOW3suWIm+W7uuOAglwiXG4gICAgICAgICAgICAgICAgICAgIDogXCLmlofmoaPlt7LliJvlu7rjgIJcIixcbiAgICAgICAgICAgIFwic3VjY2Vzc1wiXG4gICAgICAgICAgKVxuICAgICAgICAgIGF3YWl0IG9wdGlvbnMucmVmcmVzaFRyZWUoKVxuICAgICAgICAgIGlmICghaXNGb2xkZXIpIHtcbiAgICAgICAgICAgIG9wdGlvbnMub3BlbkRvYyhjcmVhdGVkLmlkLCBjcmVhdGVkLmVkaXRvclR5cGUpXG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIG9wdGlvbnMuc2hvd1RvYXN0TWVzc2FnZShnZXRBcGlFcnJvck1lc3NhZ2UoZXJyb3IsIFwi5Yib5bu65aSx6LSl77yM6K+356iN5ZCO6YeN6K+V44CCXCIpLCBcImVycm9yXCIpXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfVxuICB9XG5cbiAgY29uc3Qgb3BlblRlbXBsYXRlTGlicmFyeSA9IChwYXJlbnRJZDogc3RyaW5nIHwgbnVsbCA9IG51bGwpID0+IHtcbiAgICBpZiAoIWVuc3VyZUVkaXRQZXJtaXNzaW9uKCkpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHRlbXBsYXRlRGlhbG9nUGFyZW50SWQudmFsdWUgPSBwYXJlbnRJZFxuICAgIHNob3dUZW1wbGF0ZURpYWxvZy52YWx1ZSA9IHRydWVcbiAgfVxuXG4gIGNvbnN0IGhpZGVUZW1wbGF0ZURpYWxvZyA9ICgpID0+IHtcbiAgICBpZiAoc2hvd1RlbXBsYXRlRGlhbG9nLnZhbHVlKSB7XG4gICAgICBzaG93VGVtcGxhdGVEaWFsb2cudmFsdWUgPSBmYWxzZVxuICAgIH1cbiAgfVxuXG4gIHdhdGNoKHNob3dUZW1wbGF0ZURpYWxvZywgb3BlbiA9PiB7XG4gICAgaWYgKCFvcGVuKSB7XG4gICAgICB0ZW1wbGF0ZURpYWxvZ1BhcmVudElkLnZhbHVlID0gbnVsbFxuICAgIH1cbiAgfSlcblxuICBjb25zdCByZW5hbWVOb2RlID0gKG5vZGU6IEtub3dsZWRnZURvY3VtZW50VHJlZU5vZGUpID0+IHtcbiAgICBpZiAoIWVuc3VyZUVkaXRQZXJtaXNzaW9uKCkpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHJlbmFtaW5nTm9kZUlkLnZhbHVlID0gbm9kZS5pZFxuICB9XG5cbiAgLyoqIOihjOWGheaUueWQjeaUtuWwvu+8mmNvbW1pdHRlZD1mYWxzZe+8iEVzYyAvIOepuuagh+mimCAvIOacquaUueWKqO+8ieWPqumAgOWHuuS4jeWPkeivt+axgiAqL1xuICBjb25zdCBmaW5pc2hSZW5hbWUgPSBhc3luYyAocGF5bG9hZDogeyBub2RlOiBLbm93bGVkZ2VEb2N1bWVudFRyZWVOb2RlOyB0aXRsZTogc3RyaW5nOyBjb21taXR0ZWQ6IGJvb2xlYW4gfSkgPT4ge1xuICAgIGNvbnN0IHsgbm9kZSwgY29tbWl0dGVkIH0gPSBwYXlsb2FkXG5cbiAgICBpZiAocmVuYW1pbmdOb2RlSWQudmFsdWUgPT09IG5vZGUuaWQpIHtcbiAgICAgIHJlbmFtaW5nTm9kZUlkLnZhbHVlID0gbnVsbFxuICAgIH1cblxuICAgIGNvbnN0IG5vcm1hbGl6ZWRUaXRsZSA9IHBheWxvYWQudGl0bGUudHJpbSgpXG5cbiAgICBpZiAoIWNvbW1pdHRlZCB8fCAhbm9ybWFsaXplZFRpdGxlIHx8IG5vcm1hbGl6ZWRUaXRsZSA9PT0gbm9kZS50aXRsZSkge1xuICAgICAgb3B0aW9ucy5yZWZvY3VzTm9kZVJvdyhub2RlLmlkKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHVwZGF0ZUtub3dsZWRnZURvY3VtZW50KG5vZGUuaWQsIHsgdGl0bGU6IG5vcm1hbGl6ZWRUaXRsZSB9KVxuICAgICAgb3B0aW9ucy5zaG93VG9hc3RNZXNzYWdlKFwi5bey5pu05paw5ZCN56ew44CCXCIsIFwic3VjY2Vzc1wiKVxuICAgICAgYXdhaXQgb3B0aW9ucy5yZWZyZXNoVHJlZSgpXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIG9wdGlvbnMuc2hvd1RvYXN0TWVzc2FnZShnZXRBcGlFcnJvck1lc3NhZ2UoZXJyb3IsIFwi6YeN5ZG95ZCN5aSx6LSl44CCXCIpLCBcImVycm9yXCIpXG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIG9wdGlvbnMucmVmb2N1c05vZGVSb3cobm9kZS5pZClcbiAgICB9XG4gIH1cblxuICAvKiog5pS26ZuG6IqC54K56Ieq6Lqr77yI6Iul5Li65paH5qGj77yJ5Y+K5YW25a2Q5qCR5YaF5YWo6YOo5paH5qGjIGlk77yM55So5LqO5Yig6Zmk5YmN5Yik5a6a5r+A5rS75paH5qGj5piv5ZCm5Y+X5b2x5ZONICovXG4gIGNvbnN0IGNvbGxlY3RTdWJ0cmVlRG9jSWRzID0gKHJvb3Q6IEtub3dsZWRnZURvY3VtZW50VHJlZU5vZGUpID0+IHtcbiAgICBjb25zdCBpZHM6IHN0cmluZ1tdID0gW11cbiAgICBjb25zdCB3YWxrID0gKG5vZGU6IEtub3dsZWRnZURvY3VtZW50VHJlZU5vZGUpID0+IHtcbiAgICAgIGlmIChub2RlLnR5cGUgIT09IFwiZm9sZGVyXCIpIHtcbiAgICAgICAgaWRzLnB1c2gobm9kZS5pZClcbiAgICAgIH1cbiAgICAgIG5vZGUuY2hpbGRyZW4uZm9yRWFjaCh3YWxrKVxuICAgIH1cbiAgICB3YWxrKHJvb3QpXG4gICAgcmV0dXJuIGlkc1xuICB9XG5cbiAgY29uc3QgZGVsZXRlTm9kZSA9IChub2RlOiBLbm93bGVkZ2VEb2N1bWVudFRyZWVOb2RlKSA9PiB7XG4gICAgaWYgKCFlbnN1cmVFZGl0UGVybWlzc2lvbigpKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25maXJtRGlhbG9nLnZhbHVlID0ge1xuICAgICAgb3BlbjogdHJ1ZSxcbiAgICAgIG1lc3NhZ2U6IGDnoa7orqTlsIbjgIwke25vZGUudGl0bGV944CN56e75YWl5Zue5pS256uZ5ZCX77yfYCxcbiAgICAgIG9uQ29uZmlybTogYXN5bmMgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIC8vIOWIoOmZpOWJjeaUtumbhuWtkOagkeaWh+ahoyBpZO+8muWIt+aWsOWQjuaXp+WtkOagkeW3suS4jeWcqOagkeS4re+8jOWxiuaXtuaXoOS7juWIpOaWrVxuICAgICAgICAgIGNvbnN0IHJlbW92ZWREb2NJZHMgPSBjb2xsZWN0U3VidHJlZURvY0lkcyhub2RlKVxuICAgICAgICAgIGF3YWl0IHRyYXNoS25vd2xlZGdlRG9jdW1lbnQobm9kZS5pZClcbiAgICAgICAgICBvcHRpb25zLnNob3dUb2FzdE1lc3NhZ2UoXCLlt7Lnp7vlhaXlm57mlLbnq5njgIJcIiwgXCJzdWNjZXNzXCIpXG4gICAgICAgICAgYXdhaXQgb3B0aW9ucy5yZWZyZXNoVHJlZSgpXG4gICAgICAgICAgY29uc3QgYWN0aXZlRG9jSWQgPSBvcHRpb25zLmFjdGl2ZURvY0lkLnZhbHVlXG4gICAgICAgICAgaWYgKGFjdGl2ZURvY0lkICYmIHJlbW92ZWREb2NJZHMuaW5jbHVkZXMoYWN0aXZlRG9jSWQpKSB7XG4gICAgICAgICAgICByb3V0ZXIucHVzaCh7IG5hbWU6IFwia25vd2xlZGdlLXdvcmtzcGFjZS1ob21lXCIsIHBhcmFtczogeyBrYklkOiBrYklkLnZhbHVlIH0gfSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgb3B0aW9ucy5zaG93VG9hc3RNZXNzYWdlKGdldEFwaUVycm9yTWVzc2FnZShlcnJvciwgXCLliKDpmaTlpLHotKXjgIJcIiksIFwiZXJyb3JcIilcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9XG4gIH1cblxuICBjb25zdCBoYW5kbGVOb2RlTWVudUNyZWF0ZUNoaWxkID0gYXN5bmMgKFxuICAgIHR5cGU6IEtub3dsZWRnZVdvcmtzcGFjZUNyZWF0ZU5vZGVUeXBlLFxuICAgIHRhcmdldE5vZGU/OiBLbm93bGVkZ2VEb2N1bWVudFRyZWVOb2RlXG4gICkgPT4ge1xuICAgIGlmICghZW5zdXJlRWRpdFBlcm1pc3Npb24oKSkge1xuICAgICAgb3B0aW9ucy5jbG9zZU5vZGVNZW51KClcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNvbnN0IGFjdGlvbk5vZGUgPSB0YXJnZXROb2RlID8/IHJlc29sdmVBY3Rpb25Ob2RlKClcblxuICAgIC8vIOWIhue7hOS4juaWh+aho++8iOaJueasoSBC77yJ6YO95Y+v5L2c5paw5bu65a2Q57qn55qE54i257qn77yb5L2G5oyC5Zyo5paH5qGj5LiL55qE5paH5qGj5LiN6KGMXG4gICAgLy8g77yI5YiG57uEID4g5paH5qGjID4g5paH5qGjIOa3seW6puinhOWIme+8jOS4juiPnOWNlSBkaXNhYmxlZCDlkIzlj6PlvoTvvIzor4TlrqEgSTLvvIlcbiAgICBpZiAoIWFjdGlvbk5vZGUgfHwgKGFjdGlvbk5vZGUudHlwZSAhPT0gXCJmb2xkZXJcIiAmJiBhY3Rpb25Ob2RlLnR5cGUgIT09IFwiZG9jXCIpKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBpZiAoYWN0aW9uTm9kZS50eXBlID09PSBcImRvY1wiKSB7XG4gICAgICBjb25zdCBwYXJlbnRUeXBlID0gYWN0aW9uTm9kZS5wYXJlbnRJZFxuICAgICAgICA/IChmaW5kVHJlZU5vZGUob3B0aW9ucy50cmVlTm9kZXMudmFsdWUsIGFjdGlvbk5vZGUucGFyZW50SWQpPy50eXBlID8/IG51bGwpXG4gICAgICAgIDogbnVsbFxuXG4gICAgICBpZiAocGFyZW50VHlwZSA9PT0gXCJkb2NcIikge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICB9XG5cbiAgICBvcHRpb25zLmNsb3NlTm9kZU1lbnUoKVxuICAgIG9wdGlvbnMuZm9jdXNUcmVlTm9kZShhY3Rpb25Ob2RlKVxuICAgIGF3YWl0IGNyZWF0ZU5vZGUodHlwZSwgYWN0aW9uTm9kZS5pZClcbiAgfVxuXG4gIGNvbnN0IGhhbmRsZU5vZGVNZW51UmVuYW1lID0gYXN5bmMgKHRhcmdldE5vZGU/OiBLbm93bGVkZ2VEb2N1bWVudFRyZWVOb2RlKSA9PiB7XG4gICAgaWYgKCFlbnN1cmVFZGl0UGVybWlzc2lvbigpKSB7XG4gICAgICBvcHRpb25zLmNsb3NlTm9kZU1lbnUoKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3QgYWN0aW9uTm9kZSA9IHRhcmdldE5vZGUgPz8gcmVzb2x2ZUFjdGlvbk5vZGUoKVxuXG4gICAgaWYgKCFhY3Rpb25Ob2RlKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBvcHRpb25zLmNsb3NlTm9kZU1lbnUoKVxuICAgIG9wdGlvbnMuZm9jdXNUcmVlTm9kZShhY3Rpb25Ob2RlKVxuICAgIGF3YWl0IHJlbmFtZU5vZGUoYWN0aW9uTm9kZSlcbiAgfVxuXG4gIGNvbnN0IGhhbmRsZU5vZGVNZW51TW92ZSA9ICh0YXJnZXROb2RlPzogS25vd2xlZGdlRG9jdW1lbnRUcmVlTm9kZSkgPT4ge1xuICAgIGlmICghZW5zdXJlRWRpdFBlcm1pc3Npb24oKSkge1xuICAgICAgb3B0aW9ucy5jbG9zZU5vZGVNZW51KClcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNvbnN0IGFjdGlvbk5vZGUgPSB0YXJnZXROb2RlID8/IHJlc29sdmVBY3Rpb25Ob2RlKClcblxuICAgIGlmICghYWN0aW9uTm9kZSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgb3B0aW9ucy5jbG9zZU5vZGVNZW51KClcbiAgICBvcHRpb25zLmZvY3VzVHJlZU5vZGUoYWN0aW9uTm9kZSlcbiAgICBvcHRpb25zLm9wZW5Nb3ZlRGlhbG9nKGFjdGlvbk5vZGUpXG4gIH1cblxuICBjb25zdCBoYW5kbGVOb2RlTWVudURlbGV0ZSA9IGFzeW5jICh0YXJnZXROb2RlPzogS25vd2xlZGdlRG9jdW1lbnRUcmVlTm9kZSkgPT4ge1xuICAgIGlmICghZW5zdXJlRWRpdFBlcm1pc3Npb24oKSkge1xuICAgICAgb3B0aW9ucy5jbG9zZU5vZGVNZW51KClcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNvbnN0IGFjdGlvbk5vZGUgPSB0YXJnZXROb2RlID8/IHJlc29sdmVBY3Rpb25Ob2RlKClcblxuICAgIGlmICghYWN0aW9uTm9kZSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgb3B0aW9ucy5jbG9zZU5vZGVNZW51KClcbiAgICBvcHRpb25zLmZvY3VzVHJlZU5vZGUoYWN0aW9uTm9kZSlcbiAgICBhd2FpdCBkZWxldGVOb2RlKGFjdGlvbk5vZGUpXG4gIH1cblxuICBjb25zdCBjb3B5RG9jTGlua0J5TW9kZSA9IGFzeW5jIChtb2RlOiBcInRpdGxlZFwiIHwgXCJyYXdcIiwgdGFyZ2V0Tm9kZT86IEtub3dsZWRnZURvY3VtZW50VHJlZU5vZGUpID0+IHtcbiAgICBjb25zdCBhY3Rpb25Ob2RlID0gdGFyZ2V0Tm9kZSA/PyByZXNvbHZlQWN0aW9uTm9kZSgpXG5cbiAgICBpZiAoIWFjdGlvbk5vZGUgfHwgYWN0aW9uTm9kZS50eXBlICE9PSBcImRvY1wiKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCB0ZXh0VG9Db3B5ID1cbiAgICAgIG1vZGUgPT09IFwidGl0bGVkXCIgPyBidWlsZERvY1RpdGxlZExpbmsoYWN0aW9uTm9kZSkgOiBidWlsZERvY0xpbmsoYWN0aW9uTm9kZS5pZCwgYWN0aW9uTm9kZS5lZGl0b3JUeXBlKVxuXG4gICAgaWYgKCF0ZXh0VG9Db3B5KSB7XG4gICAgICBvcHRpb25zLmNsb3NlTm9kZU1lbnUoKVxuICAgICAgb3B0aW9ucy5zaG93VG9hc3RNZXNzYWdlKFwi5aSN5Yi26ZO+5o6l5aSx6LSl77yM6K+356iN5ZCO6YeN6K+V44CCXCIsIFwiZXJyb3JcIilcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIG9wdGlvbnMuY2xvc2VOb2RlTWVudSgpXG4gICAgb3B0aW9ucy5mb2N1c1RyZWVOb2RlKGFjdGlvbk5vZGUpXG5cbiAgICBjb25zdCBjb3BpZWQgPSBhd2FpdCBjb3B5VGV4dCh0ZXh0VG9Db3B5KVxuXG4gICAgaWYgKCFjb3BpZWQpIHtcbiAgICAgIG9wdGlvbnMuc2hvd1RvYXN0TWVzc2FnZShcIuWkjeWItumTvuaOpeWksei0pe+8jOivt+aJi+WKqOWkjeWItuWcsOWdgOagj+OAglwiLCBcImVycm9yXCIpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBvcHRpb25zLnNob3dUb2FzdE1lc3NhZ2UobW9kZSA9PT0gXCJ0aXRsZWRcIiA/IFwi5qCH6aKY6ZO+5o6l5bey5aSN5Yi277yITWFya2Rvd24g5qC85byP77yJ44CCXCIgOiBcIue6r+mTvuaOpeW3suWkjeWItuOAglwiLCBcInN1Y2Nlc3NcIilcbiAgfVxuXG4gIGNvbnN0IGhhbmRsZU5vZGVNZW51Q29weUxpbmsgPSBhc3luYyAodGFyZ2V0Tm9kZT86IEtub3dsZWRnZURvY3VtZW50VHJlZU5vZGUpID0+IHtcbiAgICBhd2FpdCBjb3B5RG9jTGlua0J5TW9kZShcInRpdGxlZFwiLCB0YXJnZXROb2RlKVxuICB9XG5cbiAgY29uc3QgaGFuZGxlTm9kZU1lbnVDb3B5UmF3TGluayA9IGFzeW5jICh0YXJnZXROb2RlPzogS25vd2xlZGdlRG9jdW1lbnRUcmVlTm9kZSkgPT4ge1xuICAgIGF3YWl0IGNvcHlEb2NMaW5rQnlNb2RlKFwicmF3XCIsIHRhcmdldE5vZGUpXG4gIH1cblxuICBjb25zdCBidWlsZER1cGxpY2F0ZVRpdGxlID0gKHRpdGxlOiBzdHJpbmcpID0+IHtcbiAgICBjb25zdCBub3JtYWxpemVkVGl0bGUgPSB0aXRsZS50cmltKCkgfHwgXCLmnKrlkb3lkI3mlofmoaNcIlxuICAgIC8vIOivhuWIq+OAjHh4IOWJr+acrOOAjeOAjHh4IOWJr+acrCAz44CN562J5pei5pyJ57yW5Y+377yM5aSN5Yi25pe26YCS5aKe6ICM5LiN5piv5Y+g5YqgXG4gICAgY29uc3QgbnVtYmVyZWRNYXRjaCA9IG5vcm1hbGl6ZWRUaXRsZS5tYXRjaCgvXiguKj8pXFxzKuWJr+acrFxccyooXFxkKykkLylcbiAgICBjb25zdCBwbGFpbkNvcHlNYXRjaCA9IG5vcm1hbGl6ZWRUaXRsZS5tYXRjaCgvXiguKj8pXFxzKuWJr+acrCQvKVxuICAgIGlmIChudW1iZXJlZE1hdGNoKSB7XG4gICAgICByZXR1cm4gYCR7bnVtYmVyZWRNYXRjaFsxXX0g5Ymv5pysICR7TnVtYmVyKG51bWJlcmVkTWF0Y2hbMl0pICsgMX1gXG4gICAgfVxuICAgIGlmIChwbGFpbkNvcHlNYXRjaCkge1xuICAgICAgcmV0dXJuIGAke3BsYWluQ29weU1hdGNoWzFdfSDlia/mnKwgMmBcbiAgICB9XG4gICAgcmV0dXJuIGAke25vcm1hbGl6ZWRUaXRsZX0g5Ymv5pysYFxuICB9XG5cbiAgY29uc3QgaGFuZGxlTm9kZU1lbnVDb3B5Tm9kZUxpbmsgPSBhc3luYyAodGFyZ2V0Tm9kZT86IEtub3dsZWRnZURvY3VtZW50VHJlZU5vZGUpID0+IHtcbiAgICBjb25zdCBhY3Rpb25Ob2RlID0gdGFyZ2V0Tm9kZSA/PyByZXNvbHZlQWN0aW9uTm9kZSgpXG5cbiAgICBpZiAoIWFjdGlvbk5vZGUpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNvbnN0IGxpbmsgPSBidWlsZE5vZGVMaW5rKGFjdGlvbk5vZGUpXG5cbiAgICBpZiAoIWxpbmspIHtcbiAgICAgIG9wdGlvbnMuY2xvc2VOb2RlTWVudSgpXG4gICAgICBvcHRpb25zLnNob3dUb2FzdE1lc3NhZ2UoXCLlpI3liLbpk77mjqXlpLHotKXvvIzor7fnqI3lkI7ph43or5XjgIJcIiwgXCJlcnJvclwiKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgb3B0aW9ucy5jbG9zZU5vZGVNZW51KClcbiAgICBvcHRpb25zLmZvY3VzVHJlZU5vZGUoYWN0aW9uTm9kZSlcblxuICAgIGNvbnN0IGNvcGllZCA9IGF3YWl0IGNvcHlUZXh0KGxpbmspXG5cbiAgICBpZiAoIWNvcGllZCkge1xuICAgICAgb3B0aW9ucy5zaG93VG9hc3RNZXNzYWdlKFwi5aSN5Yi26ZO+5o6l5aSx6LSl77yM6K+35omL5Yqo5aSN5Yi25Zyw5Z2A5qCP44CCXCIsIFwiZXJyb3JcIilcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIG9wdGlvbnMuc2hvd1RvYXN0TWVzc2FnZShcIumTvuaOpeW3suWkjeWItuOAglwiLCBcInN1Y2Nlc3NcIilcbiAgfVxuXG4gIGNvbnN0IGhhbmRsZU5vZGVNZW51T3BlbkluTmV3V2luZG93ID0gKHRhcmdldE5vZGU/OiBLbm93bGVkZ2VEb2N1bWVudFRyZWVOb2RlKSA9PiB7XG4gICAgY29uc3QgYWN0aW9uTm9kZSA9IHRhcmdldE5vZGUgPz8gcmVzb2x2ZUFjdGlvbk5vZGUoKVxuXG4gICAgaWYgKCFhY3Rpb25Ob2RlKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBvcHRpb25zLmNsb3NlTm9kZU1lbnUoKVxuICAgIG9wdGlvbnMuZm9jdXNUcmVlTm9kZShhY3Rpb25Ob2RlKVxuXG4gICAgY29uc3QgaHJlZiA9XG4gICAgICBhY3Rpb25Ob2RlLnR5cGUgPT09IFwiZG9jXCJcbiAgICAgICAgPyByb3V0ZXIucmVzb2x2ZShcbiAgICAgICAgICAgIGdldEtub3dsZWRnZURvY3VtZW50Um91dGVUYXJnZXQoe1xuICAgICAgICAgICAgICBrYklkOiBrYklkLnZhbHVlLFxuICAgICAgICAgICAgICBkb2NJZDogYWN0aW9uTm9kZS5pZCxcbiAgICAgICAgICAgICAgZWRpdG9yVHlwZTogYWN0aW9uTm9kZS5lZGl0b3JUeXBlLFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICApLmhyZWZcbiAgICAgICAgOiByb3V0ZXIucmVzb2x2ZSh7XG4gICAgICAgICAgICBuYW1lOiBcImtub3dsZWRnZS13b3Jrc3BhY2UtaG9tZVwiLFxuICAgICAgICAgICAgcGFyYW1zOiB7IGtiSWQ6IGtiSWQudmFsdWUgfSxcbiAgICAgICAgICB9KS5ocmVmXG5cbiAgICAvLyDmoYzpnaLnq6/vvJrlupTnlKjlhoXmlrDnqpflj6PliqDovb0gU1BBIOi3r+eUse+8iOWvuem9kOivrembgOOAjOWcqOaWsOeql+WPo+aJk+W8gOOAjeihjOS4uu+8iVxuICAgIGlmICh3aW5kb3cueGlhb3llRGVza3RvcCkge1xuICAgICAgdm9pZCB3aW5kb3cueGlhb3llRGVza3RvcC5vcGVuRG9jdW1lbnRJbk5ld1dpbmRvdyhocmVmKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gV2ViIOerr++8muS/neeVmeWOn+acieaWsOagh+etvumhteihjOS4ulxuICAgIHdpbmRvdy5vcGVuKGAke3Jlc29sdmVXZWJCYXNlVXJsKCl9JHtocmVmfWAsIFwiX2JsYW5rXCIsIFwibm9vcGVuZXIsbm9yZWZlcnJlclwiKVxuICB9XG5cbiAgY29uc3QgaGFuZGxlTm9kZU1lbnVNb3ZlT3V0T2ZEaXJlY3RvcnkgPSBhc3luYyAodGFyZ2V0Tm9kZT86IEtub3dsZWRnZURvY3VtZW50VHJlZU5vZGUpID0+IHtcbiAgICBpZiAoIWVuc3VyZUVkaXRQZXJtaXNzaW9uKCkpIHtcbiAgICAgIG9wdGlvbnMuY2xvc2VOb2RlTWVudSgpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCBhY3Rpb25Ob2RlID0gdGFyZ2V0Tm9kZSA/PyByZXNvbHZlQWN0aW9uTm9kZSgpXG5cbiAgICBpZiAoIWFjdGlvbk5vZGUgfHwgYWN0aW9uTm9kZS5wYXJlbnRJZCA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgb3B0aW9ucy5jbG9zZU5vZGVNZW51KClcbiAgICBvcHRpb25zLmZvY3VzVHJlZU5vZGUoYWN0aW9uTm9kZSlcblxuICAgIHRyeSB7XG4gICAgICBhd2FpdCB1cGRhdGVLbm93bGVkZ2VEb2N1bWVudChhY3Rpb25Ob2RlLmlkLCB7IHBhcmVudElkOiBudWxsIH0pXG4gICAgICBvcHRpb25zLnNob3dUb2FzdE1lc3NhZ2UoXCLlt7Lnp7vlh7rnm67lvZXjgIJcIiwgXCJzdWNjZXNzXCIpXG4gICAgICBhd2FpdCBvcHRpb25zLnJlZnJlc2hUcmVlKClcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgb3B0aW9ucy5zaG93VG9hc3RNZXNzYWdlKGdldEFwaUVycm9yTWVzc2FnZShlcnJvciwgXCLnp7vlh7rnm67lvZXlpLHotKXjgIJcIiksIFwiZXJyb3JcIilcbiAgICB9XG4gIH1cblxuICBjb25zdCBoYW5kbGVOb2RlTWVudUR1cGxpY2F0ZSA9IGFzeW5jICh0YXJnZXROb2RlPzogS25vd2xlZGdlRG9jdW1lbnRUcmVlTm9kZSkgPT4ge1xuICAgIGlmICghZW5zdXJlRWRpdFBlcm1pc3Npb24oKSkge1xuICAgICAgb3B0aW9ucy5jbG9zZU5vZGVNZW51KClcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNvbnN0IGFjdGlvbk5vZGUgPSB0YXJnZXROb2RlID8/IHJlc29sdmVBY3Rpb25Ob2RlKClcblxuICAgIGlmICghYWN0aW9uTm9kZSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgb3B0aW9ucy5jbG9zZU5vZGVNZW51KClcbiAgICBvcHRpb25zLmZvY3VzVHJlZU5vZGUoYWN0aW9uTm9kZSlcblxuICAgIHRyeSB7XG4gICAgICBpZiAoYWN0aW9uTm9kZS50eXBlID09PSBcImZvbGRlclwiKSB7XG4gICAgICAgIGF3YWl0IGNyZWF0ZUtub3dsZWRnZURvY3VtZW50KHtcbiAgICAgICAgICBrYklkOiBrYklkLnZhbHVlLFxuICAgICAgICAgIHRpdGxlOiBidWlsZER1cGxpY2F0ZVRpdGxlKGFjdGlvbk5vZGUudGl0bGUpLFxuICAgICAgICAgIHR5cGU6IFwiZm9sZGVyXCIsXG4gICAgICAgICAgcGFyZW50SWQ6IGFjdGlvbk5vZGUucGFyZW50SWQsXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBzb3VyY2VEb2N1bWVudCA9IGF3YWl0IGdldEtub3dsZWRnZURvY3VtZW50KGFjdGlvbk5vZGUuaWQpXG5cbiAgICAgICAgYXdhaXQgY3JlYXRlS25vd2xlZGdlRG9jdW1lbnQoe1xuICAgICAgICAgIGtiSWQ6IGtiSWQudmFsdWUsXG4gICAgICAgICAgdGl0bGU6IGJ1aWxkRHVwbGljYXRlVGl0bGUoc291cmNlRG9jdW1lbnQudGl0bGUpLFxuICAgICAgICAgIHR5cGU6IHNvdXJjZURvY3VtZW50LnR5cGUsXG4gICAgICAgICAgcGFyZW50SWQ6IHNvdXJjZURvY3VtZW50LnBhcmVudElkID8/IG51bGwsXG4gICAgICAgICAgc3RhdHVzOiBzb3VyY2VEb2N1bWVudC5zdGF0dXMsXG4gICAgICAgICAgZWRpdG9yVHlwZTpcbiAgICAgICAgICAgIHNvdXJjZURvY3VtZW50LmVkaXRvclR5cGUgPT09IEtOT1dMRURHRV9ET0NVTUVOVF9FRElUT1JfVFlQRVMuYm9hcmRcbiAgICAgICAgICAgICAgPyBLTk9XTEVER0VfRE9DVU1FTlRfRURJVE9SX1RZUEVTLmJvYXJkXG4gICAgICAgICAgICAgIDogS05PV0xFREdFX0RPQ1VNRU5UX0VESVRPUl9UWVBFUy5yaWNoVGV4dCxcbiAgICAgICAgICBjb250ZW50OiBzb3VyY2VEb2N1bWVudC5jb250ZW50LFxuICAgICAgICB9KVxuICAgICAgfVxuXG4gICAgICBvcHRpb25zLnNob3dUb2FzdE1lc3NhZ2UoXCLlt7LlpI3liLbjgIJcIiwgXCJzdWNjZXNzXCIpXG4gICAgICBhd2FpdCBvcHRpb25zLnJlZnJlc2hUcmVlKClcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgb3B0aW9ucy5zaG93VG9hc3RNZXNzYWdlKGdldEFwaUVycm9yTWVzc2FnZShlcnJvciwgXCLlpI3liLblpLHotKXjgIJcIiksIFwiZXJyb3JcIilcbiAgICB9XG4gIH1cblxuICBjb25zdCBoYW5kbGVOb2RlTWVudUV4cG9ydCA9IGFzeW5jIChmb3JtYXQ6IFwibWFya2Rvd25cIiB8IFwicGRmXCIgfCBcIndvcmRcIiwgdGFyZ2V0Tm9kZT86IEtub3dsZWRnZURvY3VtZW50VHJlZU5vZGUpID0+IHtcbiAgICBjb25zdCBhY3Rpb25Ob2RlID0gdGFyZ2V0Tm9kZSA/PyByZXNvbHZlQWN0aW9uTm9kZSgpXG5cbiAgICBpZiAoIWFjdGlvbk5vZGUgfHwgYWN0aW9uTm9kZS50eXBlICE9PSBcImRvY1wiKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBvcHRpb25zLmNsb3NlTm9kZU1lbnUoKVxuICAgIG9wdGlvbnMuZm9jdXNUcmVlTm9kZShhY3Rpb25Ob2RlKVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHNvdXJjZURvY3VtZW50ID0gYXdhaXQgZ2V0S25vd2xlZGdlRG9jdW1lbnQoYWN0aW9uTm9kZS5pZClcblxuICAgICAgaWYgKCFzb3VyY2VEb2N1bWVudC5jb250ZW50IHx8IHR5cGVvZiBzb3VyY2VEb2N1bWVudC5jb250ZW50LnZhbHVlICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIG9wdGlvbnMuc2hvd1RvYXN0TWVzc2FnZShcIuW9k+WJjeaWh+aho+aaguS4jeaUr+aMgeWvvOWHuuOAglwiLCBcImVycm9yXCIpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICBjb25zdCBleHBvcnRUaXRsZSA9IHNvdXJjZURvY3VtZW50LnRpdGxlLnRyaW0oKSB8fCBcIuacquWRveWQjeaWh+aho1wiXG4gICAgICBjb25zdCBleHBvcnRWYWx1ZSA9IHNvdXJjZURvY3VtZW50LmNvbnRlbnQudmFsdWVcbiAgICAgIGNvbnN0IGV4cG9ydENvbnRlbnRUeXBlID0gc291cmNlRG9jdW1lbnQuY29udGVudC5zY2hlbWUgPT09IFwidGV4dC9odG1sXCIgPyBcImh0bWxcIiA6IFwibWFya2Rvd25cIlxuICAgICAgY29uc3QgZXhwb3J0VG9vbHMgPSBhd2FpdCBpbXBvcnQoXCJAL3V0aWxzL2RvY3VtZW50LWV4cG9ydFwiKVxuXG4gICAgICBpZiAoZm9ybWF0ID09PSBcIm1hcmtkb3duXCIpIHtcbiAgICAgICAgLy8gSFRNTCBzY2hlbWUg5paH5qGj77yIVGlwVGFwIOWtmOmHj++8iemcgOi9rOaNouS4uiBNYXJrZG93bu+8jOmBv+WFjeaKiiBIVE1MIOa6kOeggeWvvOWHuuaIkCAubWRcbiAgICAgICAgYXdhaXQgZXhwb3J0VG9vbHMuZXhwb3J0QXNNYXJrZG93bihleHBvcnRUaXRsZSwgZXhwb3J0VmFsdWUsIGV4cG9ydENvbnRlbnRUeXBlKVxuICAgICAgICBvcHRpb25zLnNob3dUb2FzdE1lc3NhZ2UoXCJNYXJrZG93biDlt7Llr7zlh7rjgIJcIiwgXCJzdWNjZXNzXCIpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICBpZiAoZm9ybWF0ID09PSBcInBkZlwiKSB7XG4gICAgICAgIGF3YWl0IGV4cG9ydFRvb2xzLmV4cG9ydEFzUERGKGV4cG9ydFRpdGxlLCBleHBvcnRWYWx1ZSwgZXhwb3J0Q29udGVudFR5cGUpXG4gICAgICAgIG9wdGlvbnMuc2hvd1RvYXN0TWVzc2FnZShcIlBERiDlt7Llr7zlh7rjgIJcIiwgXCJzdWNjZXNzXCIpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICBhd2FpdCBleHBvcnRUb29scy5leHBvcnRBc1dvcmQoZXhwb3J0VGl0bGUsIGV4cG9ydFZhbHVlLCBleHBvcnRDb250ZW50VHlwZSlcbiAgICAgIG9wdGlvbnMuc2hvd1RvYXN0TWVzc2FnZShcIldvcmQg5bey5a+85Ye644CCXCIsIFwic3VjY2Vzc1wiKVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBvcHRpb25zLnNob3dUb2FzdE1lc3NhZ2UoZ2V0QXBpRXJyb3JNZXNzYWdlKGVycm9yLCBcIuWvvOWHuuWksei0peOAglwiKSwgXCJlcnJvclwiKVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGhhbmRsZU5vZGVNZW51UGluRG9jdW1lbnQgPSBhc3luYyAodGFyZ2V0Tm9kZT86IEtub3dsZWRnZURvY3VtZW50VHJlZU5vZGUpID0+IHtcbiAgICBjb25zdCBhY3Rpb25Ob2RlID0gdGFyZ2V0Tm9kZSA/PyByZXNvbHZlQWN0aW9uTm9kZSgpXG5cbiAgICBpZiAoIWFjdGlvbk5vZGUgfHwgYWN0aW9uTm9kZS50eXBlICE9PSBcImRvY1wiKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBvcHRpb25zLmNsb3NlTm9kZU1lbnUoKVxuICAgIG9wdGlvbnMuZm9jdXNUcmVlTm9kZShhY3Rpb25Ob2RlKVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGZhdm9yaXRlU3RhdGUgPSBhd2FpdCBjaGVja0tub3dsZWRnZUZhdm9yaXRlKGFjdGlvbk5vZGUuaWQpXG5cbiAgICAgIC8vIOW3suaUtuiXj+WGjeeCueaYr+WPlua2iOe9rumhtu+8jOacquaUtuiXj+aJjeaYr+e9rumhtu+8muS4pOenjeeCueWHu+mDveimgeacieecn+WunuWPjemmiFxuICAgICAgaWYgKGZhdm9yaXRlU3RhdGUuZmF2b3JpdGVkKSB7XG4gICAgICAgIGF3YWl0IHJlbW92ZUtub3dsZWRnZUZhdm9yaXRlKGFjdGlvbk5vZGUuaWQpXG4gICAgICAgIG9wdGlvbnMuc2hvd1RvYXN0TWVzc2FnZShcIuW3suWPlua2iOe9rumhtuOAglwiLCBcInN1Y2Nlc3NcIilcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IGFkZEtub3dsZWRnZUZhdm9yaXRlKGFjdGlvbk5vZGUuaWQpXG4gICAgICAgIG9wdGlvbnMuc2hvd1RvYXN0TWVzc2FnZShcIuaWh+aho+W3sue9rumhtuOAglwiLCBcInN1Y2Nlc3NcIilcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgb3B0aW9ucy5zaG93VG9hc3RNZXNzYWdlKGdldEFwaUVycm9yTWVzc2FnZShlcnJvciwgXCLnva7pobbmk43kvZzlpLHotKXjgIJcIiksIFwiZXJyb3JcIilcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICog5qC557qn5Y2z5pe25Yib5bu677yI5a+56b2Q6K+t6ZuA5paw5bu66YC76L6R77yJ77ya44CM5paw5bu644CN6I+c5Y2V54K557G75Z6L5Y2z5Yib5bu65bm26L+b5YWl57yW6L6R5Zmo77yMXG4gICAqIOS4jeW8ueWRveWQjeWvueivneahhuKAlOKAlOWRveWQjeWcqOe8lui+keWZqOmhtuagj+aIluagkeihjOWGheaUueWQjeWujOaIkOOAguWIhue7hC/mqKHmnb8v6ZO+5o6lL+S7jlxuICAgKiDoioLngrnoj5zljZXmlrDlu7rlrZDnuqfku43otbDml6LmnInlr7nor53moYbot6/lvoTvvIjmiYDlsZ7nm67lvZXpgInmi6kv5qih5p2/5Lit5b+DL+aWh+S7tumAieaLqeacieecn+WunuS6pOS6ku+8ieOAglxuICAgKi9cbiAgY29uc3QgY3JlYXRlTm9kZUluc3RhbnRseSA9IGFzeW5jICh0eXBlOiBLbm93bGVkZ2VXb3Jrc3BhY2VDcmVhdGVOb2RlVHlwZSkgPT4ge1xuICAgIGlmICghZW5zdXJlRWRpdFBlcm1pc3Npb24oKSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3QgaXNGb2xkZXIgPSB0eXBlID09PSBcImZvbGRlclwiXG4gICAgY29uc3QgaXNCb2FyZCA9IHR5cGUgPT09IFwiYm9hcmRcIlxuICAgIGNvbnN0IGlzRGF0YXRhYmxlID0gdHlwZSA9PT0gXCJkYXRhdGFibGVcIlxuICAgIGNvbnN0IGlzU2hlZXQgPSB0eXBlID09PSBcInNoZWV0XCJcbiAgICBjb25zdCBpc01pbmRtYXAgPSB0eXBlID09PSBcIm1pbmRtYXBcIlxuICAgIGNvbnN0IHR5cGVMYWJlbCA9IGlzRm9sZGVyXG4gICAgICA/IFwi5YiG57uEXCJcbiAgICAgIDogaXNCb2FyZFxuICAgICAgICA/IFwi55S75p2/XCJcbiAgICAgICAgOiBpc0RhdGF0YWJsZVxuICAgICAgICAgID8gXCLmlbDmja7ooahcIlxuICAgICAgICAgIDogaXNTaGVldFxuICAgICAgICAgICAgPyBcIuihqOagvFwiXG4gICAgICAgICAgICA6IGlzTWluZG1hcFxuICAgICAgICAgICAgICA/IFwi5oCd57u05a+85Zu+XCJcbiAgICAgICAgICAgICAgOiBcIuaWh+aho1wiXG4gICAgY29uc3QgZGVmYXVsdFRpdGxlID0gaXNGb2xkZXJcbiAgICAgID8gXCLmlrDlu7rliIbnu4RcIlxuICAgICAgOiBpc0JvYXJkIHx8IGlzRGF0YXRhYmxlIHx8IGlzU2hlZXQgfHwgaXNNaW5kbWFwXG4gICAgICAgID8gYOaXoOagh+mimCR7dHlwZUxhYmVsfWBcbiAgICAgICAgOiBcIuaWsOW7uuaWh+aho1wiXG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgY3JlYXRlZCA9IGF3YWl0IGNyZWF0ZUtub3dsZWRnZURvY3VtZW50KHtcbiAgICAgICAga2JJZDoga2JJZC52YWx1ZSxcbiAgICAgICAgdGl0bGU6IGRlZmF1bHRUaXRsZSxcbiAgICAgICAgdHlwZTogaXNGb2xkZXIgPyBcImZvbGRlclwiIDogXCJkb2NcIixcbiAgICAgICAgZWRpdG9yVHlwZTogaXNCb2FyZFxuICAgICAgICAgID8gS05PV0xFREdFX0RPQ1VNRU5UX0VESVRPUl9UWVBFUy5ib2FyZFxuICAgICAgICAgIDogaXNEYXRhdGFibGVcbiAgICAgICAgICAgID8gS05PV0xFREdFX0RPQ1VNRU5UX0VESVRPUl9UWVBFUy5kYXRhdGFibGVcbiAgICAgICAgICAgIDogaXNTaGVldFxuICAgICAgICAgICAgICA/IEtOT1dMRURHRV9ET0NVTUVOVF9FRElUT1JfVFlQRVMuc2hlZXRcbiAgICAgICAgICAgICAgOiBpc01pbmRtYXBcbiAgICAgICAgICAgICAgICA/IEtOT1dMRURHRV9ET0NVTUVOVF9FRElUT1JfVFlQRVMubWluZG1hcFxuICAgICAgICAgICAgICAgIDogS05PV0xFREdFX0RPQ1VNRU5UX0VESVRPUl9UWVBFUy5yaWNoVGV4dCxcbiAgICAgICAgc3RhdHVzOiBcImRyYWZ0XCIsXG4gICAgICAgIHBhcmVudElkOiBudWxsLFxuICAgICAgICBjb250ZW50OiBpc0JvYXJkXG4gICAgICAgICAgPyB7XG4gICAgICAgICAgICAgIHNjaGVtZTogS05PV0xFREdFX0JPQVJEX0NPTlRFTlRfU0NIRU1FLFxuICAgICAgICAgICAgICB2YWx1ZTogY3JlYXRlS25vd2xlZGdlQm9hcmREb2N1bWVudCgpLFxuICAgICAgICAgICAgfVxuICAgICAgICAgIDogaXNEYXRhdGFibGVcbiAgICAgICAgICAgID8ge1xuICAgICAgICAgICAgICAgIHNjaGVtZTogS05PV0xFREdFX0RBVEFUQUJMRV9DT05URU5UX1NDSEVNRSxcbiAgICAgICAgICAgICAgICB2YWx1ZTogeyBmaWVsZHM6IFtdLCByb3dzOiBbXSB9LFxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICA6IGlzU2hlZXRcbiAgICAgICAgICAgICAgPyB7XG4gICAgICAgICAgICAgICAgICBzY2hlbWU6IEtOT1dMRURHRV9EQVRBVEFCTEVfQ09OVEVOVF9TQ0hFTUUsXG4gICAgICAgICAgICAgICAgICB2YWx1ZTogeyBmaWVsZHM6IFtdLCByb3dzOiBbXSB9LFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgOiBpc01pbmRtYXBcbiAgICAgICAgICAgICAgICA/IHtcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1lOiBLTk9XTEVER0VfTUlORE1BUF9DT05URU5UX1NDSEVNRSxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHtcbiAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IHRleHQ6IGRlZmF1bHRUaXRsZSwgdWlkOiBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyLCAxNCkgfSxcbiAgICAgICAgICAgICAgICAgICAgICBjaGlsZHJlbjogW10sXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICB9KVxuICAgICAgb3B0aW9ucy5zaG93VG9hc3RNZXNzYWdlKGAke3R5cGVMYWJlbH3jgIwke2RlZmF1bHRUaXRsZX3jgI3lt7LliJvlu7rvvIzlj6/nm7TmjqXlvIDlp4vnvJbovpHjgIJgLCBcInN1Y2Nlc3NcIilcbiAgICAgIGF3YWl0IG9wdGlvbnMucmVmcmVzaFRyZWUoKVxuICAgICAgaWYgKCFpc0ZvbGRlcikge1xuICAgICAgICBvcHRpb25zLm9wZW5Eb2MoY3JlYXRlZC5pZCwgY3JlYXRlZC5lZGl0b3JUeXBlKVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBvcHRpb25zLnNob3dUb2FzdE1lc3NhZ2UoZ2V0QXBpRXJyb3JNZXNzYWdlKGVycm9yLCBcIuWIm+W7uuWksei0pe+8jOivt+eojeWQjumHjeivleOAglwiKSwgXCJlcnJvclwiKVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGhhbmRsZVJvb3RDcmVhdGVNZW51QWN0aW9uID0gKFxuICAgIGFjdGlvbjogXCJkb2NcIiB8IFwiZm9sZGVyXCIgfCBcInRlbXBsYXRlXCIgfCBcImJvYXJkXCIgfCBcImRhdGF0YWJsZVwiIHwgXCJzaGVldFwiIHwgXCJtaW5kbWFwXCJcbiAgKSA9PiB7XG4gICAgaWYgKGFjdGlvbiA9PT0gXCJ0ZW1wbGF0ZVwiKSB7XG4gICAgICBvcGVuVGVtcGxhdGVMaWJyYXJ5KClcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGlmIChhY3Rpb24gPT09IFwiZm9sZGVyXCIpIHtcbiAgICAgIC8vIOivrembgOeahOOAjOaWsOW7uuWIhue7hOOAjeWcqOaguee6p+S5n+aYr+WNs+aXtuWIm+W7uu+8m+ebruW9lemAieaLqeS7heS7juiKgueCueiPnOWNleaWsOW7uuWtkOe6p+aXtumcgOimgVxuICAgICAgdm9pZCBjcmVhdGVOb2RlSW5zdGFudGx5KFwiZm9sZGVyXCIpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICAvLyDmlofmoaMv55S75p2/L+aVsOaNruihqC/ooajmoLwv5oCd57u05a+85Zu+L+a1geeoi+Wbvu+8muWNs+aXtuWIm+W7uuW5tui/m+WFpee8lui+keWZqO+8iOWvuem9kOivrembgO+8iVxuICAgIHZvaWQgY3JlYXRlTm9kZUluc3RhbnRseShhY3Rpb24gYXMgS25vd2xlZGdlV29ya3NwYWNlQ3JlYXRlTm9kZVR5cGUpXG4gIH1cblxuICBjb25zdCB0cmVlTm9kZU1lbnVHcm91cHMgPSBjb21wdXRlZDxUcmVlTm9kZU1lbnVHcm91cFtdPigoKSA9PiB7XG4gICAgY29uc3QgbWVudSA9IG9wdGlvbnMubWVudS52YWx1ZVxuXG4gICAgaWYgKCFtZW51KSB7XG4gICAgICByZXR1cm4gW11cbiAgICB9XG5cbiAgICBjb25zdCBncm91cHM6IFRyZWVOb2RlTWVudUdyb3VwW10gPSBbXVxuICAgIGNvbnN0IG1lbnVOb2RlUGFyZW50VHlwZSA9IG1lbnUubm9kZS5wYXJlbnRJZFxuICAgICAgPyAoZmluZFRyZWVOb2RlKG9wdGlvbnMudHJlZU5vZGVzLnZhbHVlLCBtZW51Lm5vZGUucGFyZW50SWQpPy50eXBlID8/IG51bGwpXG4gICAgICA6IG51bGxcbiAgICAvLyDliIbnu4TmgZLlj6/mjILlrZDmlofmoaPvvJvmlofmoaPlj6rmnInkuI3mjILlnKjmlofmoaPkuIvml7bmiY3og73lho3mjILlrZDmlofmoaPvvIjliIbnu4QgPiDmlofmoaMgPiDmlofmoaPvvIzor4TlrqEgSTLvvIlcbiAgICBjb25zdCBjYW5UYWtlRG9jQ2hpbGRyZW4gPSBtZW51Lm5vZGUudHlwZSA9PT0gXCJmb2xkZXJcIiB8fCAobWVudS5ub2RlLnR5cGUgPT09IFwiZG9jXCIgJiYgbWVudU5vZGVQYXJlbnRUeXBlICE9PSBcImRvY1wiKVxuICAgIGNvbnN0IGNyZWF0ZUl0ZW1zOiBUcmVlTm9kZU1lbnVJdGVtW10gPSBbXG4gICAgICB7XG4gICAgICAgIGlkOiBcImNyZWF0ZS1kb2NcIixcbiAgICAgICAgbGFiZWw6IFwi5paw5bu65a2Q5paH5qGjXCIsXG4gICAgICAgIHNob3J0Y3V0OiBcIk5cIixcbiAgICAgICAgYXJpYUtleXNob3J0Y3V0czogXCJOXCIsXG4gICAgICAgIGljb246IFwicGg6ZmlsZS1wbHVzXCIsXG4gICAgICAgIGRpc2FibGVkOiAhY2FuVGFrZURvY0NoaWxkcmVuIHx8ICFvcHRpb25zLmNhbkVkaXQoKSxcbiAgICAgICAgb25DbGljazogKCkgPT4gdm9pZCBoYW5kbGVOb2RlTWVudUNyZWF0ZUNoaWxkKFwiZG9jXCIpLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgaWQ6IFwiY3JlYXRlLWZvbGRlclwiLFxuICAgICAgICBsYWJlbDogXCLmlrDlu7rlrZDliIbnu4RcIixcbiAgICAgICAgc2hvcnRjdXQ6IFwiU2hpZnQrTlwiLFxuICAgICAgICBhcmlhS2V5c2hvcnRjdXRzOiBcIlNoaWZ0K05cIixcbiAgICAgICAgaWNvbjogXCJwaDpmb2xkZXItc2ltcGxlLXBsdXNcIixcbiAgICAgICAgZGlzYWJsZWQ6IG1lbnUubm9kZS50eXBlICE9PSBcImZvbGRlclwiIHx8ICFvcHRpb25zLmNhbkVkaXQoKSxcbiAgICAgICAgb25DbGljazogKCkgPT4gdm9pZCBoYW5kbGVOb2RlTWVudUNyZWF0ZUNoaWxkKFwiZm9sZGVyXCIpLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgaWQ6IFwiY3JlYXRlLWJvYXJkXCIsXG4gICAgICAgIGxhYmVsOiBcIuaWsOW7uuWtkOeUu+adv1wiLFxuICAgICAgICBzaG9ydGN1dDogXCJCXCIsXG4gICAgICAgIGFyaWFLZXlzaG9ydGN1dHM6IFwiQlwiLFxuICAgICAgICBpY29uOiBcInBoOmNsaXBib2FyZC10ZXh0XCIsXG4gICAgICAgIGRpc2FibGVkOiAhY2FuVGFrZURvY0NoaWxkcmVuIHx8ICFvcHRpb25zLmNhbkVkaXQoKSxcbiAgICAgICAgb25DbGljazogKCkgPT4gdm9pZCBoYW5kbGVOb2RlTWVudUNyZWF0ZUNoaWxkKFwiYm9hcmRcIiksXG4gICAgICB9LFxuICAgIF1cblxuICAgIGlmIChtZW51Lm1vZGUgPT09IFwiY3JlYXRlXCIpIHtcbiAgICAgIGdyb3Vwcy5wdXNoKHtcbiAgICAgICAgaWQ6IFwiY3JlYXRlXCIsXG4gICAgICAgIGl0ZW1zOiBjcmVhdGVJdGVtcyxcbiAgICAgIH0pXG4gICAgICByZXR1cm4gZ3JvdXBzXG4gICAgfVxuXG4gICAgZ3JvdXBzLnB1c2goe1xuICAgICAgaWQ6IFwiYmFzaWNcIixcbiAgICAgIGl0ZW1zOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJyZW5hbWVcIixcbiAgICAgICAgICBsYWJlbDogXCLph43lkb3lkI1cIixcbiAgICAgICAgICBzaG9ydGN1dDogXCJGMlwiLFxuICAgICAgICAgIGFyaWFLZXlzaG9ydGN1dHM6IFwiRjJcIixcbiAgICAgICAgICBpY29uOiBcInBoOm5vdGUtcGVuY2lsXCIsXG4gICAgICAgICAgZGlzYWJsZWQ6ICFvcHRpb25zLmNhbkVkaXQoKSxcbiAgICAgICAgICBvbkNsaWNrOiAoKSA9PiB2b2lkIGhhbmRsZU5vZGVNZW51UmVuYW1lKCksXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJjb3B5LWxpbmtcIixcbiAgICAgICAgICBsYWJlbDogXCLlpI3liLbpk77mjqVcIixcbiAgICAgICAgICBzaG9ydGN1dDogbWVudS5ub2RlLnR5cGUgPT09IFwiZG9jXCIgPyBcIkN0cmwvQ21kK0NcIiA6IHVuZGVmaW5lZCxcbiAgICAgICAgICBhcmlhS2V5c2hvcnRjdXRzOiBtZW51Lm5vZGUudHlwZSA9PT0gXCJkb2NcIiA/IFwiQ29udHJvbCtDIE1ldGErQ1wiIDogdW5kZWZpbmVkLFxuICAgICAgICAgIGljb246IFwicGg6bGluay1zaW1wbGVcIixcbiAgICAgICAgICBvbkNsaWNrOiAoKSA9PiB2b2lkIGhhbmRsZU5vZGVNZW51Q29weU5vZGVMaW5rKCksXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJvcGVuLW5ldy13aW5kb3dcIixcbiAgICAgICAgICBsYWJlbDogXCLlnKjmlrDnqpflj6PmiZPlvIBcIixcbiAgICAgICAgICBzaG9ydGN1dDogbWVudS5ub2RlLnR5cGUgPT09IFwiZG9jXCIgPyBcIkN0cmwvQ21kK0VudGVyXCIgOiB1bmRlZmluZWQsXG4gICAgICAgICAgYXJpYUtleXNob3J0Y3V0czogbWVudS5ub2RlLnR5cGUgPT09IFwiZG9jXCIgPyBcIkNvbnRyb2wrRW50ZXIgTWV0YStFbnRlclwiIDogdW5kZWZpbmVkLFxuICAgICAgICAgIGljb246IFwicGg6YXJyb3ctc3F1YXJlLW91dFwiLFxuICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IGhhbmRsZU5vZGVNZW51T3BlbkluTmV3V2luZG93KCksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pXG5cbiAgICBncm91cHMucHVzaCh7XG4gICAgICBpZDogXCJkZXRhY2hcIixcbiAgICAgIGl0ZW1zOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJtb3ZlLW91dFwiLFxuICAgICAgICAgIGxhYmVsOiBcIuenu+WHuuebruW9lVwiLFxuICAgICAgICAgIGljb246IFwicGg6YXJyb3ctYmVuZC11cC1sZWZ0XCIsXG4gICAgICAgICAgZGlzYWJsZWQ6ICFvcHRpb25zLmNhbkVkaXQoKSB8fCBtZW51Lm5vZGUucGFyZW50SWQgPT09IG51bGwsXG4gICAgICAgICAgb25DbGljazogKCkgPT4gdm9pZCBoYW5kbGVOb2RlTWVudU1vdmVPdXRPZkRpcmVjdG9yeSgpLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KVxuXG4gICAgZ3JvdXBzLnB1c2goe1xuICAgICAgaWQ6IFwib3JnYW5pemVcIixcbiAgICAgIGl0ZW1zOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJkdXBsaWNhdGVcIixcbiAgICAgICAgICBsYWJlbDogXCLlpI3liLbigKZcIixcbiAgICAgICAgICBpY29uOiBcInBoOmNvcHlcIixcbiAgICAgICAgICBkaXNhYmxlZDogIW9wdGlvbnMuY2FuRWRpdCgpLFxuICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IHZvaWQgaGFuZGxlTm9kZU1lbnVEdXBsaWNhdGUoKSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcIm1vdmVcIixcbiAgICAgICAgICBsYWJlbDogXCLnp7vliqjigKZcIixcbiAgICAgICAgICBzaG9ydGN1dDogXCJNXCIsXG4gICAgICAgICAgYXJpYUtleXNob3J0Y3V0czogXCJNXCIsXG4gICAgICAgICAgaWNvbjogXCJwaDphcnJvd3Mtb3V0LWNhcmRpbmFsXCIsXG4gICAgICAgICAgZGlzYWJsZWQ6ICFvcHRpb25zLmNhbkVkaXQoKSxcbiAgICAgICAgICBvbkNsaWNrOiAoKSA9PiBoYW5kbGVOb2RlTWVudU1vdmUoKSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcImV4cG9ydFwiLFxuICAgICAgICAgIGxhYmVsOiBcIuWvvOWHuuKAplwiLFxuICAgICAgICAgIGljb246IFwicGg6ZXhwb3J0XCIsXG4gICAgICAgICAgZGlzYWJsZWQ6IG1lbnUubm9kZS50eXBlICE9PSBcImRvY1wiLFxuICAgICAgICAgIGNoaWxkcmVuOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGlkOiBcImV4cG9ydC1tYXJrZG93blwiLFxuICAgICAgICAgICAgICBsYWJlbDogXCLlr7zlh7rkuLogTWFya2Rvd25cIixcbiAgICAgICAgICAgICAgaWNvbjogXCJwaDpmaWxlLXRleHRcIixcbiAgICAgICAgICAgICAgb25DbGljazogKCkgPT4gdm9pZCBoYW5kbGVOb2RlTWVudUV4cG9ydChcIm1hcmtkb3duXCIpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgaWQ6IFwiZXhwb3J0LXBkZlwiLFxuICAgICAgICAgICAgICBsYWJlbDogXCLlr7zlh7rkuLogUERGXCIsXG4gICAgICAgICAgICAgIGljb246IFwicGg6ZmlsZS10ZXh0XCIsXG4gICAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IHZvaWQgaGFuZGxlTm9kZU1lbnVFeHBvcnQoXCJwZGZcIiksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBpZDogXCJleHBvcnQtd29yZFwiLFxuICAgICAgICAgICAgICBsYWJlbDogXCLlr7zlh7rkuLogV29yZFwiLFxuICAgICAgICAgICAgICBpY29uOiBcInBoOmZpbGUtdGV4dFwiLFxuICAgICAgICAgICAgICBvbkNsaWNrOiAoKSA9PiB2b2lkIGhhbmRsZU5vZGVNZW51RXhwb3J0KFwid29yZFwiKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgICBvbkNsaWNrOiAoKSA9PiB7fSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcInBpblwiLFxuICAgICAgICAgIGxhYmVsOiBcIue9rumhtuaWh+aho1wiLFxuICAgICAgICAgIGljb246IFwicGg6cHVzaC1waW4tc2ltcGxlXCIsXG4gICAgICAgICAgZGlzYWJsZWQ6IG1lbnUubm9kZS50eXBlICE9PSBcImRvY1wiLFxuICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IHZvaWQgaGFuZGxlTm9kZU1lbnVQaW5Eb2N1bWVudCgpLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KVxuXG4gICAgZ3JvdXBzLnB1c2goe1xuICAgICAgaWQ6IFwiZGFuZ2VyXCIsXG4gICAgICBpdGVtczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6IFwiZGVsZXRlXCIsXG4gICAgICAgICAgbGFiZWw6IFwi5Yig6ZmkXCIsXG4gICAgICAgICAgc2hvcnRjdXQ6IFwiRGVsZXRlXCIsXG4gICAgICAgICAgYXJpYUtleXNob3J0Y3V0czogXCJEZWxldGUgQmFja3NwYWNlXCIsXG4gICAgICAgICAgaWNvbjogXCJwaDp0cmFzaC1zaW1wbGVcIixcbiAgICAgICAgICB0b25lOiBcImRhbmdlclwiLFxuICAgICAgICAgIGRpc2FibGVkOiAhb3B0aW9ucy5jYW5FZGl0KCksXG4gICAgICAgICAgb25DbGljazogKCkgPT4gdm9pZCBoYW5kbGVOb2RlTWVudURlbGV0ZSgpLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KVxuXG4gICAgcmV0dXJuIGdyb3Vwc1xuICB9KVxuXG4gIGNvbnN0IGhhbmRsZU1lbnVTaG9ydGN1dCA9IChldmVudDogS2V5Ym9hcmRFdmVudCwgdGFyZ2V0Tm9kZTogS25vd2xlZGdlRG9jdW1lbnRUcmVlTm9kZSkgPT4ge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRLZXkgPSBldmVudC5rZXkudG9Mb3dlckNhc2UoKVxuICAgIGNvbnN0IHdpdGhNb2RpZmllciA9IGV2ZW50Lm1ldGFLZXkgfHwgZXZlbnQuY3RybEtleVxuXG4gICAgaWYgKHdpdGhNb2RpZmllciAmJiBub3JtYWxpemVkS2V5ID09PSBcImNcIikge1xuICAgICAgaWYgKHRhcmdldE5vZGUudHlwZSAhPT0gXCJkb2NcIikge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgY29uc3QgaGFzVGV4dFNlbGVjdGlvbiA9IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgJiYgQm9vbGVhbih3aW5kb3cuZ2V0U2VsZWN0aW9uKCk/LnRvU3RyaW5nKCkpXG5cbiAgICAgIGlmIChoYXNUZXh0U2VsZWN0aW9uKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXG5cbiAgICAgIGlmIChldmVudC5zaGlmdEtleSkge1xuICAgICAgICB2b2lkIGhhbmRsZU5vZGVNZW51Q29weUxpbmsodGFyZ2V0Tm9kZSlcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHZvaWQgaGFuZGxlTm9kZU1lbnVDb3B5UmF3TGluayh0YXJnZXROb2RlKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgaWYgKHdpdGhNb2RpZmllciAmJiBldmVudC5rZXkgPT09IFwiRW50ZXJcIikge1xuICAgICAgaWYgKHRhcmdldE5vZGUudHlwZSAhPT0gXCJkb2NcIikge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgICAgaGFuZGxlTm9kZU1lbnVPcGVuSW5OZXdXaW5kb3codGFyZ2V0Tm9kZSlcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGlmIChldmVudC5rZXkgPT09IFwiRjJcIikge1xuICAgICAgaWYgKCFvcHRpb25zLmNhbkVkaXQoKSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgICAgdm9pZCBoYW5kbGVOb2RlTWVudVJlbmFtZSh0YXJnZXROb2RlKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgaWYgKCF3aXRoTW9kaWZpZXIgJiYgIWV2ZW50LmFsdEtleSAmJiBub3JtYWxpemVkS2V5ID09PSBcIm1cIikge1xuICAgICAgaWYgKCFvcHRpb25zLmNhbkVkaXQoKSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgICAgaGFuZGxlTm9kZU1lbnVNb3ZlKHRhcmdldE5vZGUpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCBzaG9ydGN1dFBhcmVudFR5cGUgPSB0YXJnZXROb2RlLnBhcmVudElkXG4gICAgICA/IChmaW5kVHJlZU5vZGUob3B0aW9ucy50cmVlTm9kZXMudmFsdWUsIHRhcmdldE5vZGUucGFyZW50SWQpPy50eXBlID8/IG51bGwpXG4gICAgICA6IG51bGxcbiAgICAvLyDkuI7oj5zljZUgZGlzYWJsZWQg5ZCM5Y+j5b6E77ya5oyC5Zyo5paH5qGj5LiL55qE5paH5qGj5LiN6IO95YaN5oyC5a2Q5paH5qGj77yI6K+E5a6hIEky77yJXG4gICAgY29uc3Qgc2hvcnRjdXRDYW5UYWtlRG9jQ2hpbGRyZW4gPVxuICAgICAgdGFyZ2V0Tm9kZS50eXBlID09PSBcImZvbGRlclwiIHx8ICh0YXJnZXROb2RlLnR5cGUgPT09IFwiZG9jXCIgJiYgc2hvcnRjdXRQYXJlbnRUeXBlICE9PSBcImRvY1wiKVxuXG4gICAgaWYgKCF3aXRoTW9kaWZpZXIgJiYgIWV2ZW50LmFsdEtleSAmJiBub3JtYWxpemVkS2V5ID09PSBcIm5cIiAmJiBzaG9ydGN1dENhblRha2VEb2NDaGlsZHJlbikge1xuICAgICAgaWYgKCFvcHRpb25zLmNhbkVkaXQoKSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuXG4gICAgICAvLyBTaGlmdCtOIOaWsOW7uuWtkOWIhue7hOS7jeS7hemZkOWIhue7hOiKgueCue+8m04g5Zyo5YiG57uE5LiO5paH5qGj5LiK6YO95piv5paw5bu65a2Q5paH5qGjXG4gICAgICBpZiAoZXZlbnQuc2hpZnRLZXkpIHtcbiAgICAgICAgaWYgKHRhcmdldE5vZGUudHlwZSAhPT0gXCJmb2xkZXJcIikge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgdm9pZCBoYW5kbGVOb2RlTWVudUNyZWF0ZUNoaWxkKFwiZm9sZGVyXCIsIHRhcmdldE5vZGUpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICB2b2lkIGhhbmRsZU5vZGVNZW51Q3JlYXRlQ2hpbGQoXCJkb2NcIiwgdGFyZ2V0Tm9kZSlcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGlmICghd2l0aE1vZGlmaWVyICYmICFldmVudC5hbHRLZXkgJiYgbm9ybWFsaXplZEtleSA9PT0gXCJiXCIgJiYgc2hvcnRjdXRDYW5UYWtlRG9jQ2hpbGRyZW4pIHtcbiAgICAgIGlmICghb3B0aW9ucy5jYW5FZGl0KCkpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcbiAgICAgIHZvaWQgaGFuZGxlTm9kZU1lbnVDcmVhdGVDaGlsZChcImJvYXJkXCIsIHRhcmdldE5vZGUpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBpZiAoKGV2ZW50LmtleSA9PT0gXCJEZWxldGVcIiB8fCBldmVudC5rZXkgPT09IFwiQmFja3NwYWNlXCIpICYmICF3aXRoTW9kaWZpZXIgJiYgIWV2ZW50LmFsdEtleSkge1xuICAgICAgaWYgKCFvcHRpb25zLmNhbkVkaXQoKSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgICAgdm9pZCBoYW5kbGVOb2RlTWVudURlbGV0ZSh0YXJnZXROb2RlKVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgaW5wdXREaWFsb2csXG4gICAgY29uZmlybURpYWxvZyxcbiAgICBzaG93VGVtcGxhdGVEaWFsb2csXG4gICAgdGVtcGxhdGVEaWFsb2dQYXJlbnRJZCxcbiAgICBoaWRlVGVtcGxhdGVEaWFsb2csXG4gICAgY3JlYXRlTm9kZSxcbiAgICBvcGVuVGVtcGxhdGVMaWJyYXJ5LFxuICAgIHJlbmFtaW5nTm9kZUlkLFxuICAgIGZpbmlzaFJlbmFtZSxcbiAgICBkZWxldGVOb2RlLFxuICAgIHJlc29sdmVBY3Rpb25Ob2RlLFxuICAgIGhhbmRsZVJvb3RDcmVhdGVNZW51QWN0aW9uLFxuICAgIHRyZWVOb2RlTWVudUdyb3VwcyxcbiAgICBoYW5kbGVNZW51U2hvcnRjdXQsXG4gIH1cbn1cbiJdLCJtYXBwaW5ncyI6IkFBU0EsU0FBUyxVQUFVLEtBQUssYUFBdUI7QUFFL0MsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0Isd0JBQXdCLCtCQUErQjtBQUN0RjtBQUFBLEVBQ0U7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUVLO0FBQ1A7QUFBQSxFQUNFO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FDSztBQUNQLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsdUNBQXVDO0FBRWhELFNBQVMsb0JBQW9CO0FBR3RCLGFBQU0scUJBQXFCLENBQUMsWUFpQjdC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