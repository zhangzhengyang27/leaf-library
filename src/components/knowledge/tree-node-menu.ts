/* 2026-09-22 由 dev 缓存编译产物机械还原：类型标注已被 esbuild 剥除，import 说明符已尽量还原。过 node --check，未做运行验证。 */
import { computed, nextTick, onScopeDispose, ref } from "vue";
export const getTreeNodeMenuItemKey = (groupId, itemId) => `${groupId}:${itemId}`;
export const getTreeNodeMenuEstimatedSize = (mode) => {
  if (mode === "create") {
    return {
      width: 176,
      height: 152
    };
  }
  return {
    width: 184,
    height: 360
  };
};
export const clampTreeNodeMenuPosition = (x, y, mode) => {
  if (typeof window === "undefined") {
    return { x, y };
  }
  const margin = 12;
  const { width: menuWidth, height: menuHeight } = getTreeNodeMenuEstimatedSize(mode);
  const maxLeft = Math.max(margin, window.innerWidth - menuWidth - margin);
  const maxTop = Math.max(margin, window.innerHeight - menuHeight - margin);
  return {
    x: Math.min(Math.max(x, margin), maxLeft),
    y: Math.min(Math.max(y, margin), maxTop)
  };
};
export const useTreeNodeMenuController = (options) => {
  const { menu, menuRef } = options;
  const treeNodeMenuFocusedIndex = ref(-1);
  const treeNodeMenuSubmenuParentKey = ref(null);
  const treeNodeMenuSubmenuFocusedIndex = ref(-1);
  const treeNodeMenuSubmenuOpenTimer = ref(null);
  const treeNodeMenuSubmenuCloseTimer = ref(null);
  const findMenuItemByKey = (itemKey) => {
    for (const group of options.groups()) {
      for (const item of group.items) {
        const currentKey = getTreeNodeMenuItemKey(group.id, item.id);
        if (currentKey === itemKey) {
          return {
            group,
            item,
            key: currentKey
          };
        }
      }
    }
    return null;
  };
  const submenuSide = computed(() => {
    if (!menu.value || typeof window === "undefined") {
      return "right";
    }
    const menuWidth = menu.value.mode === "create" ? 176 : 184;
    const submenuWidth = 180;
    const availableRightSpace = window.innerWidth - (menu.value.x + menuWidth + submenuWidth + 20);
    return availableRightSpace >= 0 ? "right" : "left";
  });
  const menuStyle = computed(() => {
    if (!menu.value) {
      return {
        left: "0px",
        top: "0px"
      };
    }
    return {
      left: `${menu.value.x}px`,
      top: `${menu.value.y}px`
    };
  });
  const menuWidthClass = computed(() => menu.value?.mode === "create" ? "w-[176px]" : "w-[184px]");
  const adjustPosition = () => {
    if (!menu.value || !menuRef.value || typeof window === "undefined") {
      return;
    }
    const margin = 12;
    const rect = menuRef.value.getBoundingClientRect();
    let nextX = menu.value.x;
    let nextY = menu.value.y;
    if (rect.right > window.innerWidth - margin) {
      nextX = Math.max(margin, window.innerWidth - rect.width - margin);
    }
    if (rect.bottom > window.innerHeight - margin) {
      nextY = Math.max(margin, window.innerHeight - rect.height - margin);
    }
    if (rect.left < margin) {
      nextX = margin;
    }
    if (rect.top < margin) {
      nextY = margin;
    }
    if (nextX === menu.value.x && nextY === menu.value.y) {
      return;
    }
    menu.value = {
      ...menu.value,
      x: nextX,
      y: nextY
    };
  };
  const getMenuItems = () => {
    if (!menuRef.value) {
      return [];
    }
    return Array.from(menuRef.value.querySelectorAll("[data-tree-node-menu-item]:not(:disabled)"));
  };
  const getMenuSubmenuItems = (parentKey) => {
    if (!menuRef.value || !parentKey) {
      return [];
    }
    return Array.from(
      menuRef.value.querySelectorAll(
        `[data-tree-node-menu-child-item][data-tree-node-menu-parent-key="${parentKey}"]:not(:disabled)`
      )
    );
  };
  const focusMenuItemByIndex = (index) => {
    const menuItems = getMenuItems();
    if (menuItems.length === 0) {
      treeNodeMenuFocusedIndex.value = -1;
      return;
    }
    const normalizedIndex = (index % menuItems.length + menuItems.length) % menuItems.length;
    treeNodeMenuFocusedIndex.value = normalizedIndex;
    menuItems[normalizedIndex]?.focus();
  };
  const focusMenuItemByKey = (itemKey) => {
    const menuItems = getMenuItems();
    const targetIndex = menuItems.findIndex((item) => item.getAttribute("data-tree-node-menu-key") === itemKey);
    if (targetIndex >= 0) {
      focusMenuItemByIndex(targetIndex);
    }
  };
  const focusMenuSubmenuItemByIndex = (parentKey, index) => {
    const menuItems = getMenuSubmenuItems(parentKey);
    if (menuItems.length === 0) {
      treeNodeMenuSubmenuFocusedIndex.value = -1;
      return;
    }
    const normalizedIndex = (index % menuItems.length + menuItems.length) % menuItems.length;
    treeNodeMenuSubmenuFocusedIndex.value = normalizedIndex;
    menuItems[normalizedIndex]?.focus();
  };
  const closeSubmenu = (options2) => {
    const currentParentKey = treeNodeMenuSubmenuParentKey.value;
    treeNodeMenuSubmenuParentKey.value = null;
    treeNodeMenuSubmenuFocusedIndex.value = -1;
    if (options2?.focusParent && currentParentKey) {
      void nextTick(() => {
        focusMenuItemByKey(currentParentKey);
      });
    }
  };
  const activateSubmenu = (itemKey, openOptions) => {
    if (!itemKey) {
      closeSubmenu();
      return;
    }
    const resolved = findMenuItemByKey(itemKey);
    if (!resolved?.item.children?.length) {
      closeSubmenu();
      return;
    }
    treeNodeMenuSubmenuParentKey.value = itemKey;
    treeNodeMenuSubmenuFocusedIndex.value = -1;
    if (openOptions?.focusFirstChild) {
      void nextTick(() => {
        focusMenuSubmenuItemByIndex(itemKey, 0);
      });
    }
  };
  const clearSubmenuTimers = () => {
    if (treeNodeMenuSubmenuOpenTimer.value !== null) {
      window.clearTimeout(treeNodeMenuSubmenuOpenTimer.value);
      treeNodeMenuSubmenuOpenTimer.value = null;
    }
    if (treeNodeMenuSubmenuCloseTimer.value !== null) {
      window.clearTimeout(treeNodeMenuSubmenuCloseTimer.value);
      treeNodeMenuSubmenuCloseTimer.value = null;
    }
  };
  const scheduleSubmenuOpen = (itemKey) => {
    if (treeNodeMenuSubmenuParentKey.value === itemKey) {
      if (treeNodeMenuSubmenuCloseTimer.value !== null) {
        window.clearTimeout(treeNodeMenuSubmenuCloseTimer.value);
        treeNodeMenuSubmenuCloseTimer.value = null;
      }
      return;
    }
    if (treeNodeMenuSubmenuCloseTimer.value !== null) {
      window.clearTimeout(treeNodeMenuSubmenuCloseTimer.value);
      treeNodeMenuSubmenuCloseTimer.value = null;
    }
    if (treeNodeMenuSubmenuOpenTimer.value !== null) {
      window.clearTimeout(treeNodeMenuSubmenuOpenTimer.value);
    }
    treeNodeMenuSubmenuOpenTimer.value = window.setTimeout(() => {
      treeNodeMenuSubmenuOpenTimer.value = null;
      activateSubmenu(itemKey);
    }, 90);
  };
  const scheduleSubmenuClose = (itemKey) => {
    if (treeNodeMenuSubmenuOpenTimer.value !== null) {
      window.clearTimeout(treeNodeMenuSubmenuOpenTimer.value);
      treeNodeMenuSubmenuOpenTimer.value = null;
    }
    if (treeNodeMenuSubmenuCloseTimer.value !== null) {
      window.clearTimeout(treeNodeMenuSubmenuCloseTimer.value);
    }
    treeNodeMenuSubmenuCloseTimer.value = window.setTimeout(() => {
      treeNodeMenuSubmenuCloseTimer.value = null;
      if (itemKey && treeNodeMenuSubmenuParentKey.value !== itemKey) {
        return;
      }
      closeSubmenu();
    }, 120);
  };
  const handleItemMouseEnter = (groupId, item) => {
    const itemKey = getTreeNodeMenuItemKey(groupId, item.id);
    if (!item.children?.length) {
      scheduleSubmenuClose();
      return;
    }
    scheduleSubmenuOpen(itemKey);
  };
  const handleSubmenuMouseEnter = (itemKey) => {
    if (treeNodeMenuSubmenuCloseTimer.value !== null) {
      window.clearTimeout(treeNodeMenuSubmenuCloseTimer.value);
      treeNodeMenuSubmenuCloseTimer.value = null;
    }
    activateSubmenu(itemKey);
  };
  const close = () => {
    menu.value = null;
    treeNodeMenuFocusedIndex.value = -1;
    clearSubmenuTimers();
    closeSubmenu();
  };
  const handleFocusIn = (event) => {
    const target = event.target instanceof HTMLButtonElement ? event.target : null;
    if (!target) {
      return;
    }
    if (target.hasAttribute("data-tree-node-menu-child-item")) {
      const parentKey = target.getAttribute("data-tree-node-menu-parent-key");
      const menuItems2 = getMenuSubmenuItems(parentKey);
      const nextIndex2 = menuItems2.findIndex((item) => item === target);
      treeNodeMenuSubmenuParentKey.value = parentKey;
      if (nextIndex2 >= 0) {
        treeNodeMenuSubmenuFocusedIndex.value = nextIndex2;
      }
      return;
    }
    if (!target.hasAttribute("data-tree-node-menu-item")) {
      return;
    }
    const menuItems = getMenuItems();
    const nextIndex = menuItems.findIndex((item) => item === target);
    const itemKey = target.getAttribute("data-tree-node-menu-key");
    if (nextIndex >= 0) {
      treeNodeMenuFocusedIndex.value = nextIndex;
    }
    activateSubmenu(itemKey);
  };
  const open = (payload) => {
    const position = clampTreeNodeMenuPosition(payload.x, payload.y, payload.mode);
    clearSubmenuTimers();
    closeSubmenu();
    menu.value = {
      node: payload.node,
      x: position.x,
      y: position.y,
      mode: payload.mode
    };
    void nextTick(() => {
      adjustPosition();
      focusMenuItemByIndex(0);
    });
  };
  const handleItemClick = (groupId, item) => {
    const itemKey = getTreeNodeMenuItemKey(groupId, item.id);
    if (item.children?.length) {
      activateSubmenu(itemKey, { focusFirstChild: true });
      return;
    }
    void item.onClick();
  };
  const handleSubmenuItemClick = (parentKey, item) => {
    treeNodeMenuSubmenuParentKey.value = parentKey;
    void item.onClick();
  };
  const resolveActiveIndex = (menuItems) => {
    if (menuItems.length === 0) {
      return -1;
    }
    if (treeNodeMenuFocusedIndex.value >= 0 && treeNodeMenuFocusedIndex.value < menuItems.length) {
      return treeNodeMenuFocusedIndex.value;
    }
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLButtonElement) {
      const activeIndex = menuItems.findIndex((item) => item === activeElement);
      if (activeIndex >= 0) {
        return activeIndex;
      }
    }
    return -1;
  };
  const resolveSubmenuActiveIndex = (parentKey, menuItems) => {
    if (menuItems.length === 0) {
      return -1;
    }
    if (treeNodeMenuSubmenuFocusedIndex.value >= 0 && treeNodeMenuSubmenuFocusedIndex.value < menuItems.length) {
      return treeNodeMenuSubmenuFocusedIndex.value;
    }
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLButtonElement) {
      const activeIndex = menuItems.findIndex((item) => item === activeElement);
      if (activeIndex >= 0) {
        treeNodeMenuSubmenuParentKey.value = parentKey;
        return activeIndex;
      }
    }
    return -1;
  };
  const handleNavigation = (event) => {
    if (!menu.value) {
      return false;
    }
    const activeElement = document.activeElement;
    const activeSubmenuParentKey = activeElement instanceof HTMLButtonElement && activeElement.hasAttribute("data-tree-node-menu-child-item") ? activeElement.getAttribute("data-tree-node-menu-parent-key") : null;
    if (activeSubmenuParentKey) {
      const submenuItems = getMenuSubmenuItems(activeSubmenuParentKey);
      if (submenuItems.length === 0) {
        return false;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusMenuSubmenuItemByIndex(
          activeSubmenuParentKey,
          resolveSubmenuActiveIndex(activeSubmenuParentKey, submenuItems) + 1
        );
        return true;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        focusMenuSubmenuItemByIndex(
          activeSubmenuParentKey,
          resolveSubmenuActiveIndex(activeSubmenuParentKey, submenuItems) - 1
        );
        return true;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        const activeIndex = resolveSubmenuActiveIndex(activeSubmenuParentKey, submenuItems);
        if (activeIndex < 0) {
          focusMenuSubmenuItemByIndex(activeSubmenuParentKey, event.shiftKey ? submenuItems.length - 1 : 0);
          return true;
        }
        focusMenuSubmenuItemByIndex(activeSubmenuParentKey, activeIndex + (event.shiftKey ? -1 : 1));
        return true;
      }
      if (event.key === "Home") {
        event.preventDefault();
        focusMenuSubmenuItemByIndex(activeSubmenuParentKey, 0);
        return true;
      }
      if (event.key === "End") {
        event.preventDefault();
        focusMenuSubmenuItemByIndex(activeSubmenuParentKey, submenuItems.length - 1);
        return true;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        closeSubmenu({ focusParent: true });
        return true;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const activeIndex = resolveSubmenuActiveIndex(activeSubmenuParentKey, submenuItems);
        const activeMenuItem = activeIndex >= 0 ? submenuItems[activeIndex] : submenuItems[0];
        activeMenuItem?.click();
        return true;
      }
      return false;
    }
    const menuItems = getMenuItems();
    if (menuItems.length === 0) {
      return false;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusMenuItemByIndex(resolveActiveIndex(menuItems) + 1);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusMenuItemByIndex(resolveActiveIndex(menuItems) - 1);
      return true;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const activeIndex = resolveActiveIndex(menuItems);
      if (activeIndex < 0) {
        focusMenuItemByIndex(event.shiftKey ? menuItems.length - 1 : 0);
        return true;
      }
      focusMenuItemByIndex(activeIndex + (event.shiftKey ? -1 : 1));
      return true;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusMenuItemByIndex(0);
      return true;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusMenuItemByIndex(menuItems.length - 1);
      return true;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const activeIndex = resolveActiveIndex(menuItems);
      const activeMenuItem = activeIndex >= 0 ? menuItems[activeIndex] : menuItems[0];
      const activeItemKey = activeMenuItem?.getAttribute("data-tree-node-menu-key");
      if (activeItemKey) {
        activateSubmenu(activeItemKey, { focusFirstChild: true });
      }
      return true;
    }
    if (event.key === "ArrowLeft" && treeNodeMenuSubmenuParentKey.value) {
      event.preventDefault();
      closeSubmenu();
      return true;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const activeIndex = resolveActiveIndex(menuItems);
      const activeMenuItem = activeIndex >= 0 ? menuItems[activeIndex] : menuItems[0];
      activeMenuItem?.click();
      return true;
    }
    return false;
  };
  onScopeDispose(() => {
    clearSubmenuTimers();
  });
  return {
    submenuSide,
    menuStyle,
    menuWidthClass,
    submenuParentKey: treeNodeMenuSubmenuParentKey,
    open,
    close,
    handleItemClick,
    handleSubmenuItemClick,
    handleItemMouseEnter,
    handleSubmenuMouseEnter,
    scheduleSubmenuClose,
    handleFocusIn,
    handleNavigation
  };
};

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInRyZWUtbm9kZS1tZW51LnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICog55+l6K+G5bqT5paH5qGj5qCR6IqC54K55Y+z6ZSu6I+c5Y2V77ya57G75Z6L44CB5a6a5L2N5bel5YW35LiO54q25oCB5py644CCXG4gKlxuICog5LuOIEtub3dsZWRnZVdvcmtzcGFjZUxheW91dCDmir3lh7rjgILluIPlsYDotJ/otKPmnoTpgKDoj5zljZXliIbnu4TvvIjkvp3otZblkITkuJrliqEgaGFuZGxlcu+8ie+8jFxuICog5riy5p+T5LiO6ZSu55uYL+aCrOWBnC/lrZDoj5zljZXnirbmgIHmnLrnlLEgS25vd2xlZGdlVHJlZU5vZGVNZW51IOe7hOS7tumFjeWQiOacrCBjb250cm9sbGVyIOaJv+aLheOAglxuICovXG5pbXBvcnQgeyBjb21wdXRlZCwgbmV4dFRpY2ssIG9uU2NvcGVEaXNwb3NlLCByZWYsIHR5cGUgUmVmIH0gZnJvbSBcInZ1ZVwiXG5pbXBvcnQgdHlwZSB7IEtub3dsZWRnZURvY3VtZW50VHJlZU5vZGUgfSBmcm9tIFwiQC9zZXJ2aWNlcy9rbm93bGVkZ2UtZG9jdW1lbnRzXCJcblxuZXhwb3J0IHR5cGUgVHJlZU5vZGVNZW51TW9kZSA9IFwiYWN0aW9uc1wiIHwgXCJjcmVhdGVcIlxuXG5leHBvcnQgdHlwZSBUcmVlTm9kZU1lbnVJdGVtID0ge1xuICBpZDogc3RyaW5nXG4gIGxhYmVsOiBzdHJpbmdcbiAgZGVzY3JpcHRpb24/OiBzdHJpbmdcbiAgc2hvcnRjdXQ/OiBzdHJpbmdcbiAgYXJpYUtleXNob3J0Y3V0cz86IHN0cmluZ1xuICBpY29uOiBzdHJpbmdcbiAgY2hpbGRyZW4/OiBUcmVlTm9kZU1lbnVJdGVtW11cbiAgdG9uZT86IFwiZGVmYXVsdFwiIHwgXCJkYW5nZXJcIlxuICBkaXNhYmxlZD86IGJvb2xlYW5cbiAgdGl0bGU/OiBzdHJpbmdcbiAgb25DbGljazogKCkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD5cbn1cblxuZXhwb3J0IHR5cGUgVHJlZU5vZGVNZW51R3JvdXAgPSB7XG4gIGlkOiBzdHJpbmdcbiAgbGFiZWw/OiBzdHJpbmdcbiAgaXRlbXM6IFRyZWVOb2RlTWVudUl0ZW1bXVxufVxuXG5leHBvcnQgdHlwZSBUcmVlTm9kZU1lbnVQYXlsb2FkID0ge1xuICBub2RlOiBLbm93bGVkZ2VEb2N1bWVudFRyZWVOb2RlXG4gIHg6IG51bWJlclxuICB5OiBudW1iZXJcbiAgbW9kZTogVHJlZU5vZGVNZW51TW9kZVxufVxuXG5leHBvcnQgdHlwZSBUcmVlTm9kZU1lbnVTdGF0ZSA9IFRyZWVOb2RlTWVudVBheWxvYWRcblxuZXhwb3J0IGNvbnN0IGdldFRyZWVOb2RlTWVudUl0ZW1LZXkgPSAoZ3JvdXBJZDogc3RyaW5nLCBpdGVtSWQ6IHN0cmluZykgPT4gYCR7Z3JvdXBJZH06JHtpdGVtSWR9YFxuXG5leHBvcnQgY29uc3QgZ2V0VHJlZU5vZGVNZW51RXN0aW1hdGVkU2l6ZSA9IChtb2RlOiBUcmVlTm9kZU1lbnVNb2RlKSA9PiB7XG4gIGlmIChtb2RlID09PSBcImNyZWF0ZVwiKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHdpZHRoOiAxNzYsXG4gICAgICBoZWlnaHQ6IDE1MixcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHdpZHRoOiAxODQsXG4gICAgaGVpZ2h0OiAzNjAsXG4gIH1cbn1cblxuZXhwb3J0IGNvbnN0IGNsYW1wVHJlZU5vZGVNZW51UG9zaXRpb24gPSAoeDogbnVtYmVyLCB5OiBudW1iZXIsIG1vZGU6IFRyZWVOb2RlTWVudU1vZGUpID0+IHtcbiAgaWYgKHR5cGVvZiB3aW5kb3cgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICByZXR1cm4geyB4LCB5IH1cbiAgfVxuXG4gIGNvbnN0IG1hcmdpbiA9IDEyXG4gIGNvbnN0IHsgd2lkdGg6IG1lbnVXaWR0aCwgaGVpZ2h0OiBtZW51SGVpZ2h0IH0gPSBnZXRUcmVlTm9kZU1lbnVFc3RpbWF0ZWRTaXplKG1vZGUpXG4gIGNvbnN0IG1heExlZnQgPSBNYXRoLm1heChtYXJnaW4sIHdpbmRvdy5pbm5lcldpZHRoIC0gbWVudVdpZHRoIC0gbWFyZ2luKVxuICBjb25zdCBtYXhUb3AgPSBNYXRoLm1heChtYXJnaW4sIHdpbmRvdy5pbm5lckhlaWdodCAtIG1lbnVIZWlnaHQgLSBtYXJnaW4pXG5cbiAgcmV0dXJuIHtcbiAgICB4OiBNYXRoLm1pbihNYXRoLm1heCh4LCBtYXJnaW4pLCBtYXhMZWZ0KSxcbiAgICB5OiBNYXRoLm1pbihNYXRoLm1heCh5LCBtYXJnaW4pLCBtYXhUb3ApLFxuICB9XG59XG5cbmV4cG9ydCBjb25zdCB1c2VUcmVlTm9kZU1lbnVDb250cm9sbGVyID0gKG9wdGlvbnM6IHtcbiAgbWVudTogUmVmPFRyZWVOb2RlTWVudVN0YXRlIHwgbnVsbD5cbiAgbWVudVJlZjogUmVmPEhUTUxFbGVtZW50IHwgbnVsbD5cbiAgZ3JvdXBzOiAoKSA9PiBUcmVlTm9kZU1lbnVHcm91cFtdXG59KSA9PiB7XG4gIGNvbnN0IHsgbWVudSwgbWVudVJlZiB9ID0gb3B0aW9uc1xuXG4gIGNvbnN0IHRyZWVOb2RlTWVudUZvY3VzZWRJbmRleCA9IHJlZigtMSlcbiAgY29uc3QgdHJlZU5vZGVNZW51U3VibWVudVBhcmVudEtleSA9IHJlZjxzdHJpbmcgfCBudWxsPihudWxsKVxuICBjb25zdCB0cmVlTm9kZU1lbnVTdWJtZW51Rm9jdXNlZEluZGV4ID0gcmVmKC0xKVxuICBjb25zdCB0cmVlTm9kZU1lbnVTdWJtZW51T3BlblRpbWVyID0gcmVmPG51bWJlciB8IG51bGw+KG51bGwpXG4gIGNvbnN0IHRyZWVOb2RlTWVudVN1Ym1lbnVDbG9zZVRpbWVyID0gcmVmPG51bWJlciB8IG51bGw+KG51bGwpXG5cbiAgY29uc3QgZmluZE1lbnVJdGVtQnlLZXkgPSAoaXRlbUtleTogc3RyaW5nKSA9PiB7XG4gICAgZm9yIChjb25zdCBncm91cCBvZiBvcHRpb25zLmdyb3VwcygpKSB7XG4gICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZ3JvdXAuaXRlbXMpIHtcbiAgICAgICAgY29uc3QgY3VycmVudEtleSA9IGdldFRyZWVOb2RlTWVudUl0ZW1LZXkoZ3JvdXAuaWQsIGl0ZW0uaWQpXG5cbiAgICAgICAgaWYgKGN1cnJlbnRLZXkgPT09IGl0ZW1LZXkpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgZ3JvdXAsXG4gICAgICAgICAgICBpdGVtLFxuICAgICAgICAgICAga2V5OiBjdXJyZW50S2V5LFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBudWxsXG4gIH1cblxuICBjb25zdCBzdWJtZW51U2lkZSA9IGNvbXB1dGVkKCgpID0+IHtcbiAgICBpZiAoIW1lbnUudmFsdWUgfHwgdHlwZW9mIHdpbmRvdyA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgcmV0dXJuIFwicmlnaHRcIiBhcyBjb25zdFxuICAgIH1cblxuICAgIGNvbnN0IG1lbnVXaWR0aCA9IG1lbnUudmFsdWUubW9kZSA9PT0gXCJjcmVhdGVcIiA/IDE3NiA6IDE4NFxuICAgIGNvbnN0IHN1Ym1lbnVXaWR0aCA9IDE4MFxuICAgIGNvbnN0IGF2YWlsYWJsZVJpZ2h0U3BhY2UgPSB3aW5kb3cuaW5uZXJXaWR0aCAtIChtZW51LnZhbHVlLnggKyBtZW51V2lkdGggKyBzdWJtZW51V2lkdGggKyAyMClcblxuICAgIHJldHVybiBhdmFpbGFibGVSaWdodFNwYWNlID49IDAgPyAoXCJyaWdodFwiIGFzIGNvbnN0KSA6IChcImxlZnRcIiBhcyBjb25zdClcbiAgfSlcblxuICBjb25zdCBtZW51U3R5bGUgPSBjb21wdXRlZCgoKSA9PiB7XG4gICAgaWYgKCFtZW51LnZhbHVlKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBsZWZ0OiBcIjBweFwiLFxuICAgICAgICB0b3A6IFwiMHB4XCIsXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGxlZnQ6IGAke21lbnUudmFsdWUueH1weGAsXG4gICAgICB0b3A6IGAke21lbnUudmFsdWUueX1weGAsXG4gICAgfVxuICB9KVxuXG4gIGNvbnN0IG1lbnVXaWR0aENsYXNzID0gY29tcHV0ZWQoKCkgPT4gKG1lbnUudmFsdWU/Lm1vZGUgPT09IFwiY3JlYXRlXCIgPyBcInctWzE3NnB4XVwiIDogXCJ3LVsxODRweF1cIikpXG5cbiAgY29uc3QgYWRqdXN0UG9zaXRpb24gPSAoKSA9PiB7XG4gICAgaWYgKCFtZW51LnZhbHVlIHx8ICFtZW51UmVmLnZhbHVlIHx8IHR5cGVvZiB3aW5kb3cgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNvbnN0IG1hcmdpbiA9IDEyXG4gICAgY29uc3QgcmVjdCA9IG1lbnVSZWYudmFsdWUuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcbiAgICBsZXQgbmV4dFggPSBtZW51LnZhbHVlLnhcbiAgICBsZXQgbmV4dFkgPSBtZW51LnZhbHVlLnlcblxuICAgIGlmIChyZWN0LnJpZ2h0ID4gd2luZG93LmlubmVyV2lkdGggLSBtYXJnaW4pIHtcbiAgICAgIG5leHRYID0gTWF0aC5tYXgobWFyZ2luLCB3aW5kb3cuaW5uZXJXaWR0aCAtIHJlY3Qud2lkdGggLSBtYXJnaW4pXG4gICAgfVxuXG4gICAgaWYgKHJlY3QuYm90dG9tID4gd2luZG93LmlubmVySGVpZ2h0IC0gbWFyZ2luKSB7XG4gICAgICBuZXh0WSA9IE1hdGgubWF4KG1hcmdpbiwgd2luZG93LmlubmVySGVpZ2h0IC0gcmVjdC5oZWlnaHQgLSBtYXJnaW4pXG4gICAgfVxuXG4gICAgaWYgKHJlY3QubGVmdCA8IG1hcmdpbikge1xuICAgICAgbmV4dFggPSBtYXJnaW5cbiAgICB9XG5cbiAgICBpZiAocmVjdC50b3AgPCBtYXJnaW4pIHtcbiAgICAgIG5leHRZID0gbWFyZ2luXG4gICAgfVxuXG4gICAgaWYgKG5leHRYID09PSBtZW51LnZhbHVlLnggJiYgbmV4dFkgPT09IG1lbnUudmFsdWUueSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgbWVudS52YWx1ZSA9IHtcbiAgICAgIC4uLm1lbnUudmFsdWUsXG4gICAgICB4OiBuZXh0WCxcbiAgICAgIHk6IG5leHRZLFxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGdldE1lbnVJdGVtcyA9ICgpID0+IHtcbiAgICBpZiAoIW1lbnVSZWYudmFsdWUpIHtcbiAgICAgIHJldHVybiBbXSBhcyBIVE1MQnV0dG9uRWxlbWVudFtdXG4gICAgfVxuXG4gICAgcmV0dXJuIEFycmF5LmZyb20obWVudVJlZi52YWx1ZS5xdWVyeVNlbGVjdG9yQWxsPEhUTUxCdXR0b25FbGVtZW50PihcIltkYXRhLXRyZWUtbm9kZS1tZW51LWl0ZW1dOm5vdCg6ZGlzYWJsZWQpXCIpKVxuICB9XG5cbiAgY29uc3QgZ2V0TWVudVN1Ym1lbnVJdGVtcyA9IChwYXJlbnRLZXk6IHN0cmluZyB8IG51bGwpID0+IHtcbiAgICBpZiAoIW1lbnVSZWYudmFsdWUgfHwgIXBhcmVudEtleSkge1xuICAgICAgcmV0dXJuIFtdIGFzIEhUTUxCdXR0b25FbGVtZW50W11cbiAgICB9XG5cbiAgICByZXR1cm4gQXJyYXkuZnJvbShcbiAgICAgIG1lbnVSZWYudmFsdWUucXVlcnlTZWxlY3RvckFsbDxIVE1MQnV0dG9uRWxlbWVudD4oXG4gICAgICAgIGBbZGF0YS10cmVlLW5vZGUtbWVudS1jaGlsZC1pdGVtXVtkYXRhLXRyZWUtbm9kZS1tZW51LXBhcmVudC1rZXk9XCIke3BhcmVudEtleX1cIl06bm90KDpkaXNhYmxlZClgXG4gICAgICApXG4gICAgKVxuICB9XG5cbiAgY29uc3QgZm9jdXNNZW51SXRlbUJ5SW5kZXggPSAoaW5kZXg6IG51bWJlcikgPT4ge1xuICAgIGNvbnN0IG1lbnVJdGVtcyA9IGdldE1lbnVJdGVtcygpXG5cbiAgICBpZiAobWVudUl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdHJlZU5vZGVNZW51Rm9jdXNlZEluZGV4LnZhbHVlID0gLTFcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNvbnN0IG5vcm1hbGl6ZWRJbmRleCA9ICgoaW5kZXggJSBtZW51SXRlbXMubGVuZ3RoKSArIG1lbnVJdGVtcy5sZW5ndGgpICUgbWVudUl0ZW1zLmxlbmd0aFxuICAgIHRyZWVOb2RlTWVudUZvY3VzZWRJbmRleC52YWx1ZSA9IG5vcm1hbGl6ZWRJbmRleFxuICAgIG1lbnVJdGVtc1tub3JtYWxpemVkSW5kZXhdPy5mb2N1cygpXG4gIH1cblxuICBjb25zdCBmb2N1c01lbnVJdGVtQnlLZXkgPSAoaXRlbUtleTogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgbWVudUl0ZW1zID0gZ2V0TWVudUl0ZW1zKClcbiAgICBjb25zdCB0YXJnZXRJbmRleCA9IG1lbnVJdGVtcy5maW5kSW5kZXgoaXRlbSA9PiBpdGVtLmdldEF0dHJpYnV0ZShcImRhdGEtdHJlZS1ub2RlLW1lbnUta2V5XCIpID09PSBpdGVtS2V5KVxuXG4gICAgaWYgKHRhcmdldEluZGV4ID49IDApIHtcbiAgICAgIGZvY3VzTWVudUl0ZW1CeUluZGV4KHRhcmdldEluZGV4KVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGZvY3VzTWVudVN1Ym1lbnVJdGVtQnlJbmRleCA9IChwYXJlbnRLZXk6IHN0cmluZywgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgIGNvbnN0IG1lbnVJdGVtcyA9IGdldE1lbnVTdWJtZW51SXRlbXMocGFyZW50S2V5KVxuXG4gICAgaWYgKG1lbnVJdGVtcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHRyZWVOb2RlTWVudVN1Ym1lbnVGb2N1c2VkSW5kZXgudmFsdWUgPSAtMVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3Qgbm9ybWFsaXplZEluZGV4ID0gKChpbmRleCAlIG1lbnVJdGVtcy5sZW5ndGgpICsgbWVudUl0ZW1zLmxlbmd0aCkgJSBtZW51SXRlbXMubGVuZ3RoXG4gICAgdHJlZU5vZGVNZW51U3VibWVudUZvY3VzZWRJbmRleC52YWx1ZSA9IG5vcm1hbGl6ZWRJbmRleFxuICAgIG1lbnVJdGVtc1tub3JtYWxpemVkSW5kZXhdPy5mb2N1cygpXG4gIH1cblxuICBjb25zdCBjbG9zZVN1Ym1lbnUgPSAob3B0aW9ucz86IHsgZm9jdXNQYXJlbnQ/OiBib29sZWFuIH0pID0+IHtcbiAgICBjb25zdCBjdXJyZW50UGFyZW50S2V5ID0gdHJlZU5vZGVNZW51U3VibWVudVBhcmVudEtleS52YWx1ZVxuXG4gICAgdHJlZU5vZGVNZW51U3VibWVudVBhcmVudEtleS52YWx1ZSA9IG51bGxcbiAgICB0cmVlTm9kZU1lbnVTdWJtZW51Rm9jdXNlZEluZGV4LnZhbHVlID0gLTFcblxuICAgIGlmIChvcHRpb25zPy5mb2N1c1BhcmVudCAmJiBjdXJyZW50UGFyZW50S2V5KSB7XG4gICAgICB2b2lkIG5leHRUaWNrKCgpID0+IHtcbiAgICAgICAgZm9jdXNNZW51SXRlbUJ5S2V5KGN1cnJlbnRQYXJlbnRLZXkpXG4gICAgICB9KVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGFjdGl2YXRlU3VibWVudSA9IChpdGVtS2V5OiBzdHJpbmcgfCBudWxsLCBvcGVuT3B0aW9ucz86IHsgZm9jdXNGaXJzdENoaWxkPzogYm9vbGVhbiB9KSA9PiB7XG4gICAgaWYgKCFpdGVtS2V5KSB7XG4gICAgICBjbG9zZVN1Ym1lbnUoKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3QgcmVzb2x2ZWQgPSBmaW5kTWVudUl0ZW1CeUtleShpdGVtS2V5KVxuXG4gICAgaWYgKCFyZXNvbHZlZD8uaXRlbS5jaGlsZHJlbj8ubGVuZ3RoKSB7XG4gICAgICBjbG9zZVN1Ym1lbnUoKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgdHJlZU5vZGVNZW51U3VibWVudVBhcmVudEtleS52YWx1ZSA9IGl0ZW1LZXlcbiAgICB0cmVlTm9kZU1lbnVTdWJtZW51Rm9jdXNlZEluZGV4LnZhbHVlID0gLTFcblxuICAgIGlmIChvcGVuT3B0aW9ucz8uZm9jdXNGaXJzdENoaWxkKSB7XG4gICAgICB2b2lkIG5leHRUaWNrKCgpID0+IHtcbiAgICAgICAgZm9jdXNNZW51U3VibWVudUl0ZW1CeUluZGV4KGl0ZW1LZXksIDApXG4gICAgICB9KVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGNsZWFyU3VibWVudVRpbWVycyA9ICgpID0+IHtcbiAgICBpZiAodHJlZU5vZGVNZW51U3VibWVudU9wZW5UaW1lci52YWx1ZSAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0cmVlTm9kZU1lbnVTdWJtZW51T3BlblRpbWVyLnZhbHVlKVxuICAgICAgdHJlZU5vZGVNZW51U3VibWVudU9wZW5UaW1lci52YWx1ZSA9IG51bGxcbiAgICB9XG5cbiAgICBpZiAodHJlZU5vZGVNZW51U3VibWVudUNsb3NlVGltZXIudmFsdWUgIT09IG51bGwpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodHJlZU5vZGVNZW51U3VibWVudUNsb3NlVGltZXIudmFsdWUpXG4gICAgICB0cmVlTm9kZU1lbnVTdWJtZW51Q2xvc2VUaW1lci52YWx1ZSA9IG51bGxcbiAgICB9XG4gIH1cblxuICBjb25zdCBzY2hlZHVsZVN1Ym1lbnVPcGVuID0gKGl0ZW1LZXk6IHN0cmluZykgPT4ge1xuICAgIGlmICh0cmVlTm9kZU1lbnVTdWJtZW51UGFyZW50S2V5LnZhbHVlID09PSBpdGVtS2V5KSB7XG4gICAgICBpZiAodHJlZU5vZGVNZW51U3VibWVudUNsb3NlVGltZXIudmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0cmVlTm9kZU1lbnVTdWJtZW51Q2xvc2VUaW1lci52YWx1ZSlcbiAgICAgICAgdHJlZU5vZGVNZW51U3VibWVudUNsb3NlVGltZXIudmFsdWUgPSBudWxsXG4gICAgICB9XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBpZiAodHJlZU5vZGVNZW51U3VibWVudUNsb3NlVGltZXIudmFsdWUgIT09IG51bGwpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodHJlZU5vZGVNZW51U3VibWVudUNsb3NlVGltZXIudmFsdWUpXG4gICAgICB0cmVlTm9kZU1lbnVTdWJtZW51Q2xvc2VUaW1lci52YWx1ZSA9IG51bGxcbiAgICB9XG5cbiAgICBpZiAodHJlZU5vZGVNZW51U3VibWVudU9wZW5UaW1lci52YWx1ZSAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0cmVlTm9kZU1lbnVTdWJtZW51T3BlblRpbWVyLnZhbHVlKVxuICAgIH1cblxuICAgIHRyZWVOb2RlTWVudVN1Ym1lbnVPcGVuVGltZXIudmFsdWUgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0cmVlTm9kZU1lbnVTdWJtZW51T3BlblRpbWVyLnZhbHVlID0gbnVsbFxuICAgICAgYWN0aXZhdGVTdWJtZW51KGl0ZW1LZXkpXG4gICAgfSwgOTApXG4gIH1cblxuICBjb25zdCBzY2hlZHVsZVN1Ym1lbnVDbG9zZSA9IChpdGVtS2V5Pzogc3RyaW5nIHwgbnVsbCkgPT4ge1xuICAgIGlmICh0cmVlTm9kZU1lbnVTdWJtZW51T3BlblRpbWVyLnZhbHVlICE9PSBudWxsKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRyZWVOb2RlTWVudVN1Ym1lbnVPcGVuVGltZXIudmFsdWUpXG4gICAgICB0cmVlTm9kZU1lbnVTdWJtZW51T3BlblRpbWVyLnZhbHVlID0gbnVsbFxuICAgIH1cblxuICAgIGlmICh0cmVlTm9kZU1lbnVTdWJtZW51Q2xvc2VUaW1lci52YWx1ZSAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0cmVlTm9kZU1lbnVTdWJtZW51Q2xvc2VUaW1lci52YWx1ZSlcbiAgICB9XG5cbiAgICB0cmVlTm9kZU1lbnVTdWJtZW51Q2xvc2VUaW1lci52YWx1ZSA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRyZWVOb2RlTWVudVN1Ym1lbnVDbG9zZVRpbWVyLnZhbHVlID0gbnVsbFxuXG4gICAgICBpZiAoaXRlbUtleSAmJiB0cmVlTm9kZU1lbnVTdWJtZW51UGFyZW50S2V5LnZhbHVlICE9PSBpdGVtS2V5KSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICBjbG9zZVN1Ym1lbnUoKVxuICAgIH0sIDEyMClcbiAgfVxuXG4gIGNvbnN0IGhhbmRsZUl0ZW1Nb3VzZUVudGVyID0gKGdyb3VwSWQ6IHN0cmluZywgaXRlbTogVHJlZU5vZGVNZW51SXRlbSkgPT4ge1xuICAgIGNvbnN0IGl0ZW1LZXkgPSBnZXRUcmVlTm9kZU1lbnVJdGVtS2V5KGdyb3VwSWQsIGl0ZW0uaWQpXG5cbiAgICBpZiAoIWl0ZW0uY2hpbGRyZW4/Lmxlbmd0aCkge1xuICAgICAgc2NoZWR1bGVTdWJtZW51Q2xvc2UoKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgc2NoZWR1bGVTdWJtZW51T3BlbihpdGVtS2V5KVxuICB9XG5cbiAgY29uc3QgaGFuZGxlU3VibWVudU1vdXNlRW50ZXIgPSAoaXRlbUtleTogc3RyaW5nKSA9PiB7XG4gICAgaWYgKHRyZWVOb2RlTWVudVN1Ym1lbnVDbG9zZVRpbWVyLnZhbHVlICE9PSBudWxsKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRyZWVOb2RlTWVudVN1Ym1lbnVDbG9zZVRpbWVyLnZhbHVlKVxuICAgICAgdHJlZU5vZGVNZW51U3VibWVudUNsb3NlVGltZXIudmFsdWUgPSBudWxsXG4gICAgfVxuXG4gICAgYWN0aXZhdGVTdWJtZW51KGl0ZW1LZXkpXG4gIH1cblxuICBjb25zdCBjbG9zZSA9ICgpID0+IHtcbiAgICBtZW51LnZhbHVlID0gbnVsbFxuICAgIHRyZWVOb2RlTWVudUZvY3VzZWRJbmRleC52YWx1ZSA9IC0xXG4gICAgY2xlYXJTdWJtZW51VGltZXJzKClcbiAgICBjbG9zZVN1Ym1lbnUoKVxuICB9XG5cbiAgY29uc3QgaGFuZGxlRm9jdXNJbiA9IChldmVudDogRm9jdXNFdmVudCkgPT4ge1xuICAgIGNvbnN0IHRhcmdldCA9IGV2ZW50LnRhcmdldCBpbnN0YW5jZW9mIEhUTUxCdXR0b25FbGVtZW50ID8gZXZlbnQudGFyZ2V0IDogbnVsbFxuXG4gICAgaWYgKCF0YXJnZXQpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGlmICh0YXJnZXQuaGFzQXR0cmlidXRlKFwiZGF0YS10cmVlLW5vZGUtbWVudS1jaGlsZC1pdGVtXCIpKSB7XG4gICAgICBjb25zdCBwYXJlbnRLZXkgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKFwiZGF0YS10cmVlLW5vZGUtbWVudS1wYXJlbnQta2V5XCIpXG4gICAgICBjb25zdCBtZW51SXRlbXMgPSBnZXRNZW51U3VibWVudUl0ZW1zKHBhcmVudEtleSlcbiAgICAgIGNvbnN0IG5leHRJbmRleCA9IG1lbnVJdGVtcy5maW5kSW5kZXgoaXRlbSA9PiBpdGVtID09PSB0YXJnZXQpXG5cbiAgICAgIHRyZWVOb2RlTWVudVN1Ym1lbnVQYXJlbnRLZXkudmFsdWUgPSBwYXJlbnRLZXlcblxuICAgICAgaWYgKG5leHRJbmRleCA+PSAwKSB7XG4gICAgICAgIHRyZWVOb2RlTWVudVN1Ym1lbnVGb2N1c2VkSW5kZXgudmFsdWUgPSBuZXh0SW5kZXhcbiAgICAgIH1cblxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgaWYgKCF0YXJnZXQuaGFzQXR0cmlidXRlKFwiZGF0YS10cmVlLW5vZGUtbWVudS1pdGVtXCIpKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCBtZW51SXRlbXMgPSBnZXRNZW51SXRlbXMoKVxuICAgIGNvbnN0IG5leHRJbmRleCA9IG1lbnVJdGVtcy5maW5kSW5kZXgoaXRlbSA9PiBpdGVtID09PSB0YXJnZXQpXG4gICAgY29uc3QgaXRlbUtleSA9IHRhcmdldC5nZXRBdHRyaWJ1dGUoXCJkYXRhLXRyZWUtbm9kZS1tZW51LWtleVwiKVxuXG4gICAgaWYgKG5leHRJbmRleCA+PSAwKSB7XG4gICAgICB0cmVlTm9kZU1lbnVGb2N1c2VkSW5kZXgudmFsdWUgPSBuZXh0SW5kZXhcbiAgICB9XG5cbiAgICBhY3RpdmF0ZVN1Ym1lbnUoaXRlbUtleSlcbiAgfVxuXG4gIGNvbnN0IG9wZW4gPSAocGF5bG9hZDogVHJlZU5vZGVNZW51UGF5bG9hZCkgPT4ge1xuICAgIGNvbnN0IHBvc2l0aW9uID0gY2xhbXBUcmVlTm9kZU1lbnVQb3NpdGlvbihwYXlsb2FkLngsIHBheWxvYWQueSwgcGF5bG9hZC5tb2RlKVxuXG4gICAgY2xlYXJTdWJtZW51VGltZXJzKClcbiAgICBjbG9zZVN1Ym1lbnUoKVxuXG4gICAgbWVudS52YWx1ZSA9IHtcbiAgICAgIG5vZGU6IHBheWxvYWQubm9kZSxcbiAgICAgIHg6IHBvc2l0aW9uLngsXG4gICAgICB5OiBwb3NpdGlvbi55LFxuICAgICAgbW9kZTogcGF5bG9hZC5tb2RlLFxuICAgIH1cblxuICAgIHZvaWQgbmV4dFRpY2soKCkgPT4ge1xuICAgICAgYWRqdXN0UG9zaXRpb24oKVxuICAgICAgZm9jdXNNZW51SXRlbUJ5SW5kZXgoMClcbiAgICB9KVxuICB9XG5cbiAgY29uc3QgaGFuZGxlSXRlbUNsaWNrID0gKGdyb3VwSWQ6IHN0cmluZywgaXRlbTogVHJlZU5vZGVNZW51SXRlbSkgPT4ge1xuICAgIGNvbnN0IGl0ZW1LZXkgPSBnZXRUcmVlTm9kZU1lbnVJdGVtS2V5KGdyb3VwSWQsIGl0ZW0uaWQpXG5cbiAgICBpZiAoaXRlbS5jaGlsZHJlbj8ubGVuZ3RoKSB7XG4gICAgICBhY3RpdmF0ZVN1Ym1lbnUoaXRlbUtleSwgeyBmb2N1c0ZpcnN0Q2hpbGQ6IHRydWUgfSlcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHZvaWQgaXRlbS5vbkNsaWNrKClcbiAgfVxuXG4gIGNvbnN0IGhhbmRsZVN1Ym1lbnVJdGVtQ2xpY2sgPSAocGFyZW50S2V5OiBzdHJpbmcsIGl0ZW06IFRyZWVOb2RlTWVudUl0ZW0pID0+IHtcbiAgICB0cmVlTm9kZU1lbnVTdWJtZW51UGFyZW50S2V5LnZhbHVlID0gcGFyZW50S2V5XG4gICAgdm9pZCBpdGVtLm9uQ2xpY2soKVxuICB9XG5cbiAgY29uc3QgcmVzb2x2ZUFjdGl2ZUluZGV4ID0gKG1lbnVJdGVtczogSFRNTEJ1dHRvbkVsZW1lbnRbXSkgPT4ge1xuICAgIGlmIChtZW51SXRlbXMubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gLTFcbiAgICB9XG5cbiAgICBpZiAodHJlZU5vZGVNZW51Rm9jdXNlZEluZGV4LnZhbHVlID49IDAgJiYgdHJlZU5vZGVNZW51Rm9jdXNlZEluZGV4LnZhbHVlIDwgbWVudUl0ZW1zLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIHRyZWVOb2RlTWVudUZvY3VzZWRJbmRleC52YWx1ZVxuICAgIH1cblxuICAgIGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50XG5cbiAgICBpZiAoYWN0aXZlRWxlbWVudCBpbnN0YW5jZW9mIEhUTUxCdXR0b25FbGVtZW50KSB7XG4gICAgICBjb25zdCBhY3RpdmVJbmRleCA9IG1lbnVJdGVtcy5maW5kSW5kZXgoaXRlbSA9PiBpdGVtID09PSBhY3RpdmVFbGVtZW50KVxuXG4gICAgICBpZiAoYWN0aXZlSW5kZXggPj0gMCkge1xuICAgICAgICByZXR1cm4gYWN0aXZlSW5kZXhcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gLTFcbiAgfVxuXG4gIGNvbnN0IHJlc29sdmVTdWJtZW51QWN0aXZlSW5kZXggPSAocGFyZW50S2V5OiBzdHJpbmcsIG1lbnVJdGVtczogSFRNTEJ1dHRvbkVsZW1lbnRbXSkgPT4ge1xuICAgIGlmIChtZW51SXRlbXMubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gLTFcbiAgICB9XG5cbiAgICBpZiAodHJlZU5vZGVNZW51U3VibWVudUZvY3VzZWRJbmRleC52YWx1ZSA+PSAwICYmIHRyZWVOb2RlTWVudVN1Ym1lbnVGb2N1c2VkSW5kZXgudmFsdWUgPCBtZW51SXRlbXMubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gdHJlZU5vZGVNZW51U3VibWVudUZvY3VzZWRJbmRleC52YWx1ZVxuICAgIH1cblxuICAgIGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50XG5cbiAgICBpZiAoYWN0aXZlRWxlbWVudCBpbnN0YW5jZW9mIEhUTUxCdXR0b25FbGVtZW50KSB7XG4gICAgICBjb25zdCBhY3RpdmVJbmRleCA9IG1lbnVJdGVtcy5maW5kSW5kZXgoaXRlbSA9PiBpdGVtID09PSBhY3RpdmVFbGVtZW50KVxuXG4gICAgICBpZiAoYWN0aXZlSW5kZXggPj0gMCkge1xuICAgICAgICB0cmVlTm9kZU1lbnVTdWJtZW51UGFyZW50S2V5LnZhbHVlID0gcGFyZW50S2V5XG4gICAgICAgIHJldHVybiBhY3RpdmVJbmRleFxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiAtMVxuICB9XG5cbiAgY29uc3QgaGFuZGxlTmF2aWdhdGlvbiA9IChldmVudDogS2V5Ym9hcmRFdmVudCkgPT4ge1xuICAgIGlmICghbWVudS52YWx1ZSkge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuXG4gICAgY29uc3QgYWN0aXZlRWxlbWVudCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnRcbiAgICBjb25zdCBhY3RpdmVTdWJtZW51UGFyZW50S2V5ID1cbiAgICAgIGFjdGl2ZUVsZW1lbnQgaW5zdGFuY2VvZiBIVE1MQnV0dG9uRWxlbWVudCAmJiBhY3RpdmVFbGVtZW50Lmhhc0F0dHJpYnV0ZShcImRhdGEtdHJlZS1ub2RlLW1lbnUtY2hpbGQtaXRlbVwiKVxuICAgICAgICA/IGFjdGl2ZUVsZW1lbnQuZ2V0QXR0cmlidXRlKFwiZGF0YS10cmVlLW5vZGUtbWVudS1wYXJlbnQta2V5XCIpXG4gICAgICAgIDogbnVsbFxuXG4gICAgaWYgKGFjdGl2ZVN1Ym1lbnVQYXJlbnRLZXkpIHtcbiAgICAgIGNvbnN0IHN1Ym1lbnVJdGVtcyA9IGdldE1lbnVTdWJtZW51SXRlbXMoYWN0aXZlU3VibWVudVBhcmVudEtleSlcblxuICAgICAgaWYgKHN1Ym1lbnVJdGVtcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICB9XG5cbiAgICAgIGlmIChldmVudC5rZXkgPT09IFwiQXJyb3dEb3duXCIpIHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgICAgICBmb2N1c01lbnVTdWJtZW51SXRlbUJ5SW5kZXgoXG4gICAgICAgICAgYWN0aXZlU3VibWVudVBhcmVudEtleSxcbiAgICAgICAgICByZXNvbHZlU3VibWVudUFjdGl2ZUluZGV4KGFjdGl2ZVN1Ym1lbnVQYXJlbnRLZXksIHN1Ym1lbnVJdGVtcykgKyAxXG4gICAgICAgIClcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cblxuICAgICAgaWYgKGV2ZW50LmtleSA9PT0gXCJBcnJvd1VwXCIpIHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgICAgICBmb2N1c01lbnVTdWJtZW51SXRlbUJ5SW5kZXgoXG4gICAgICAgICAgYWN0aXZlU3VibWVudVBhcmVudEtleSxcbiAgICAgICAgICByZXNvbHZlU3VibWVudUFjdGl2ZUluZGV4KGFjdGl2ZVN1Ym1lbnVQYXJlbnRLZXksIHN1Ym1lbnVJdGVtcykgLSAxXG4gICAgICAgIClcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cblxuICAgICAgaWYgKGV2ZW50LmtleSA9PT0gXCJUYWJcIikge1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXG4gICAgICAgIGNvbnN0IGFjdGl2ZUluZGV4ID0gcmVzb2x2ZVN1Ym1lbnVBY3RpdmVJbmRleChhY3RpdmVTdWJtZW51UGFyZW50S2V5LCBzdWJtZW51SXRlbXMpXG5cbiAgICAgICAgaWYgKGFjdGl2ZUluZGV4IDwgMCkge1xuICAgICAgICAgIGZvY3VzTWVudVN1Ym1lbnVJdGVtQnlJbmRleChhY3RpdmVTdWJtZW51UGFyZW50S2V5LCBldmVudC5zaGlmdEtleSA/IHN1Ym1lbnVJdGVtcy5sZW5ndGggLSAxIDogMClcbiAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICB9XG5cbiAgICAgICAgZm9jdXNNZW51U3VibWVudUl0ZW1CeUluZGV4KGFjdGl2ZVN1Ym1lbnVQYXJlbnRLZXksIGFjdGl2ZUluZGV4ICsgKGV2ZW50LnNoaWZ0S2V5ID8gLTEgOiAxKSlcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cblxuICAgICAgaWYgKGV2ZW50LmtleSA9PT0gXCJIb21lXCIpIHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgICAgICBmb2N1c01lbnVTdWJtZW51SXRlbUJ5SW5kZXgoYWN0aXZlU3VibWVudVBhcmVudEtleSwgMClcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cblxuICAgICAgaWYgKGV2ZW50LmtleSA9PT0gXCJFbmRcIikge1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXG4gICAgICAgIGZvY3VzTWVudVN1Ym1lbnVJdGVtQnlJbmRleChhY3RpdmVTdWJtZW51UGFyZW50S2V5LCBzdWJtZW51SXRlbXMubGVuZ3RoIC0gMSlcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cblxuICAgICAgaWYgKGV2ZW50LmtleSA9PT0gXCJBcnJvd0xlZnRcIikge1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXG4gICAgICAgIGNsb3NlU3VibWVudSh7IGZvY3VzUGFyZW50OiB0cnVlIH0pXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICB9XG5cbiAgICAgIGlmIChldmVudC5rZXkgPT09IFwiRW50ZXJcIiB8fCBldmVudC5rZXkgPT09IFwiIFwiKSB7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcbiAgICAgICAgY29uc3QgYWN0aXZlSW5kZXggPSByZXNvbHZlU3VibWVudUFjdGl2ZUluZGV4KGFjdGl2ZVN1Ym1lbnVQYXJlbnRLZXksIHN1Ym1lbnVJdGVtcylcbiAgICAgICAgY29uc3QgYWN0aXZlTWVudUl0ZW0gPSBhY3RpdmVJbmRleCA+PSAwID8gc3VibWVudUl0ZW1zW2FjdGl2ZUluZGV4XSA6IHN1Ym1lbnVJdGVtc1swXVxuXG4gICAgICAgIGFjdGl2ZU1lbnVJdGVtPy5jbGljaygpXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cblxuICAgIGNvbnN0IG1lbnVJdGVtcyA9IGdldE1lbnVJdGVtcygpXG5cbiAgICBpZiAobWVudUl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCJBcnJvd0Rvd25cIikge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgICAgZm9jdXNNZW51SXRlbUJ5SW5kZXgocmVzb2x2ZUFjdGl2ZUluZGV4KG1lbnVJdGVtcykgKyAxKVxuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIkFycm93VXBcIikge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgICAgZm9jdXNNZW51SXRlbUJ5SW5kZXgocmVzb2x2ZUFjdGl2ZUluZGV4KG1lbnVJdGVtcykgLSAxKVxuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIlRhYlwiKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXG4gICAgICBjb25zdCBhY3RpdmVJbmRleCA9IHJlc29sdmVBY3RpdmVJbmRleChtZW51SXRlbXMpXG5cbiAgICAgIGlmIChhY3RpdmVJbmRleCA8IDApIHtcbiAgICAgICAgZm9jdXNNZW51SXRlbUJ5SW5kZXgoZXZlbnQuc2hpZnRLZXkgPyBtZW51SXRlbXMubGVuZ3RoIC0gMSA6IDApXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICB9XG5cbiAgICAgIGZvY3VzTWVudUl0ZW1CeUluZGV4KGFjdGl2ZUluZGV4ICsgKGV2ZW50LnNoaWZ0S2V5ID8gLTEgOiAxKSlcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCJIb21lXCIpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcbiAgICAgIGZvY3VzTWVudUl0ZW1CeUluZGV4KDApXG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cblxuICAgIGlmIChldmVudC5rZXkgPT09IFwiRW5kXCIpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcbiAgICAgIGZvY3VzTWVudUl0ZW1CeUluZGV4KG1lbnVJdGVtcy5sZW5ndGggLSAxKVxuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIkFycm93UmlnaHRcIikge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuXG4gICAgICBjb25zdCBhY3RpdmVJbmRleCA9IHJlc29sdmVBY3RpdmVJbmRleChtZW51SXRlbXMpXG4gICAgICBjb25zdCBhY3RpdmVNZW51SXRlbSA9IGFjdGl2ZUluZGV4ID49IDAgPyBtZW51SXRlbXNbYWN0aXZlSW5kZXhdIDogbWVudUl0ZW1zWzBdXG4gICAgICBjb25zdCBhY3RpdmVJdGVtS2V5ID0gYWN0aXZlTWVudUl0ZW0/LmdldEF0dHJpYnV0ZShcImRhdGEtdHJlZS1ub2RlLW1lbnUta2V5XCIpXG5cbiAgICAgIGlmIChhY3RpdmVJdGVtS2V5KSB7XG4gICAgICAgIGFjdGl2YXRlU3VibWVudShhY3RpdmVJdGVtS2V5LCB7IGZvY3VzRmlyc3RDaGlsZDogdHJ1ZSB9KVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cblxuICAgIGlmIChldmVudC5rZXkgPT09IFwiQXJyb3dMZWZ0XCIgJiYgdHJlZU5vZGVNZW51U3VibWVudVBhcmVudEtleS52YWx1ZSkge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgICAgY2xvc2VTdWJtZW51KClcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCJFbnRlclwiIHx8IGV2ZW50LmtleSA9PT0gXCIgXCIpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcblxuICAgICAgY29uc3QgYWN0aXZlSW5kZXggPSByZXNvbHZlQWN0aXZlSW5kZXgobWVudUl0ZW1zKVxuICAgICAgY29uc3QgYWN0aXZlTWVudUl0ZW0gPSBhY3RpdmVJbmRleCA+PSAwID8gbWVudUl0ZW1zW2FjdGl2ZUluZGV4XSA6IG1lbnVJdGVtc1swXVxuXG4gICAgICBhY3RpdmVNZW51SXRlbT8uY2xpY2soKVxuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIG9uU2NvcGVEaXNwb3NlKCgpID0+IHtcbiAgICBjbGVhclN1Ym1lbnVUaW1lcnMoKVxuICB9KVxuXG4gIHJldHVybiB7XG4gICAgc3VibWVudVNpZGUsXG4gICAgbWVudVN0eWxlLFxuICAgIG1lbnVXaWR0aENsYXNzLFxuICAgIHN1Ym1lbnVQYXJlbnRLZXk6IHRyZWVOb2RlTWVudVN1Ym1lbnVQYXJlbnRLZXksXG4gICAgb3BlbixcbiAgICBjbG9zZSxcbiAgICBoYW5kbGVJdGVtQ2xpY2ssXG4gICAgaGFuZGxlU3VibWVudUl0ZW1DbGljayxcbiAgICBoYW5kbGVJdGVtTW91c2VFbnRlcixcbiAgICBoYW5kbGVTdWJtZW51TW91c2VFbnRlcixcbiAgICBzY2hlZHVsZVN1Ym1lbnVDbG9zZSxcbiAgICBoYW5kbGVGb2N1c0luLFxuICAgIGhhbmRsZU5hdmlnYXRpb24sXG4gIH1cbn1cbiJdLCJtYXBwaW5ncyI6IkFBTUEsU0FBUyxVQUFVLFVBQVUsZ0JBQWdCLFdBQXFCO0FBa0MzRCxhQUFNLHlCQUF5QixDQUFDLFNBQWlCLFdBQW1CLEdBQUcsT0FBTyxJQUFJLE1BQU07QUFFeEYsYUFBTSwrQkFBK0IsQ0FBQyxTQUEyQjtBQUN0RSxNQUFJLFNBQVMsVUFBVTtBQUNyQixXQUFPO0FBQUEsTUFDTCxPQUFPO0FBQUEsTUFDUCxRQUFRO0FBQUEsSUFDVjtBQUFBLEVBQ0Y7QUFFQSxTQUFPO0FBQUEsSUFDTCxPQUFPO0FBQUEsSUFDUCxRQUFRO0FBQUEsRUFDVjtBQUNG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