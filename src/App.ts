/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-C_4vKAXg.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main = /* @__PURE__ */ defineComponent(
*/
{
  __name: "App",
  setup(__props) {
    const { pendingConfirm: pendingConfirm2, confirmChecked: confirmChecked2, confirming: confirming2, runConfirmed: runConfirmed2 } = useDialogs();
    const route = useRoute();
    const router2 = useRouter();
    const HIDE_SHELL_ROUTES = /* @__PURE__ */ new Set(["screenshotCapture", "screenRecorderClip"]);
    const showShell = computed(() => !HIDE_SHELL_ROUTES.has(String(route.name || "")));
    function runInLibrary(fn) {
      void (async () => {
        if (String(route.name || "") !== "photos") await router2.push("/photos");
        fn();
      })();
    }
    let uninstallAppMenu = null;
    let unbindScreenshotImported = null;
    let uninstallTrackpad = null;
    let uninstallMenuAction = null;
    onMounted(() => {
      uninstallAppMenu = useAppMenu().install();
      unbindScreenshotImported = window.api.screenshot.onImported(() => {
        void usePhotoData().refreshAllPools();
      });
      uninstallMenuAction = window.api.onAppMenuAction((e) => {
        const { action } = e;
        const ui = useLibraryUI();
        switch (action) {
          case "import-folder":
            void usePhotoActions().handleImportFolder();
            break;
          case "import-files":
            void usePhotoActions().handleImportFiles();
            break;
          case "bookmark":
            runInLibrary(() => {
              usePhotoActions().bookmarkModalOpen.value = true;
            });
            break;
          case "new-smart":
            runInLibrary(() => usePhotoActions().openSmartAlbumModal(null));
            break;
          case "focus-search":
            document.getElementById("library-search")?.focus();
            break;
          case "synthesize-shortcut": {
            const el = document.activeElement;
            const editable = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
            const { key, code, metaKey, ctrlKey } = e;
            if (!key || !code || editable) break;
            window.dispatchEvent(
              new KeyboardEvent("keydown", {
                key,
                code,
                metaKey: !!metaKey,
                ctrlKey: !!ctrlKey,
                cancelable: true
              })
            );
            break;
          }
          case "open-tags":
            void router2.push("/tags");
            break;
          case "layout-next": {
            const tabs2 = useLibraryTabs();
            const order = ["grid", "waterfall", "list", "auto"];
            const cur = order.indexOf(tabs2.active.layout);
            tabs2.active.layout = order[(cur + 1) % order.length];
            tabs2.persist();
            break;
          }
          case "toggle-filter":
            ui.toggleFilterBar();
            break;
          case "toggle-sidebar":
            ui.togglePanel();
            break;
          // ── 十五轮 C14：原 ⋯更多菜单入口迁移（Eagle 工具栏无 ⋯）──
          case "map": {
            runInLibrary(() => useLibraryTabs().setView("map", "地图"));
            break;
          }
          case "duplicates":
            runInLibrary(() => void useDuplicateScan().openDuplicateScan());
            break;
          case "selection-mode":
            runInLibrary(() => usePhotoSelection().toggleSelectionMode());
            break;
          case "batch-rename":
            runInLibrary(() => {
              usePhotoActions().batchRenameOpen.value = true;
            });
            break;
          case "convert-webp":
            runInLibrary(
              () => usePhotoActions().handleConvertToWebP([...usePhotoSelection().selectedIds.value])
            );
            break;
          case "export-selected":
            runInLibrary(
              () => void usePhotoActions().exportSelected([...usePhotoSelection().selectedIds.value])
            );
            break;
          case "remove-selected":
            runInLibrary(
              () => usePhotoActions().handleDeleteIds([...usePhotoSelection().selectedIds.value])
            );
            break;
          case "remove-all":
            runInLibrary(() => usePhotoActions().handleRemoveAll());
            break;
          case "lock":
            runInLibrary(() => usePhotoActions().handleLockAction());
            break;
          case "toggle-theme": {
            const { theme: theme2, setTheme } = useTheme();
            void setTheme(theme2.value === "dark" ? "light" : "dark");
            break;
          }
          // ── 十五轮批6：整理菜单（对选中批量评分/标签/归组，Eagle organize.* 语义）──
          case "organize-folder-add":
            runInLibrary(() => usePhotoActions().openFolderModal());
            break;
          case "organize-tag-copy":
            runInLibrary(() => {
              const ids = [...usePhotoSelection().selectedIds.value];
              const first = usePhotoData().allPhotos.value.find((p) => ids.includes(p.id));
              if (!first || first.tags.length === 0) {
                useToast().warning("选中素材没有标签");
                return;
              }
              void window.api.photos.copyText(first.tags.join(", ")).then(() => useToast().success("已复制标签")).catch(
                (err) => useToast().error("复制失败", { description: err.message })
              );
            });
            break;
          case "organize-tag-clear":
            runInLibrary(() => {
              void (async () => {
                const data = usePhotoData();
                const ids = [...usePhotoSelection().selectedIds.value];
                const targets = data.allPhotos.value.filter((p) => ids.includes(p.id));
                if (targets.length === 0) {
                  useToast().warning("请先选中素材");
                  return;
                }
                const allTags = /* @__PURE__ */ new Set();
                for (const p of targets) for (const t of p.tags) allTags.add(t);
                try {
                  for (const tag of allTags) {
                    await window.api.photos.removeTagFromMultiple(ids, tag);
                  }
                  await usePhotoData().loadPhotos();
                  useToast().success(`已清除 ${targets.length} 项的全部标签`);
                } catch (err) {
                  useToast().error("清除标签失败", { description: err.message });
                }
              })();
            });
            break;
          default:
            if (action.startsWith("organize-rating-")) {
              const rating = Number(action.slice(-1));
              runInLibrary(() => {
                const ids = [...usePhotoSelection().selectedIds.value];
                if (ids.length === 0) {
                  useToast().warning("请先选中素材");
                  return;
                }
                void usePhotoActions().handleBatchUpdate(ids, { rating }).then(() => useToast().success(`已为 ${ids.length} 项设置 ${rating} 星`)).catch(
                  (err) => useToast().error("批量设置评分失败", { description: err.message })
                );
              });
            } else if (action === "organize-tag-add" || action === "organize-tag-paste") {
              runInLibrary(() => {
                const ids = [...usePhotoSelection().selectedIds.value];
                if (ids.length === 0) {
                  useToast().warning("请先选中素材");
                  return;
                }
                const applyTags = async (raw) => {
                  const tags = raw.split(/[\s,，、]+/).map((t) => t.trim()).filter(Boolean);
                  if (tags.length === 0) return;
                  for (const tag of tags) await usePhotoActions().addTagToMany(ids, tag);
                  useToast().success(`已为 ${ids.length} 项添加 ${tags.length} 个标签`);
                };
                if (action === "organize-tag-add") {
                  useDialogs().requestPrompt({
                    title: "添加标签",
                    label: "标签名称（空格/逗号分隔多个）",
                    initialValue: "",
                    confirmLabel: "添加",
                    onSubmit: (v) => applyTags(v)
                  });
                } else {
                  void window.api.photos.getClipboardText().then((raw) => applyTags(raw)).catch(
                    (err) => useToast().error("读取剪贴板失败", { description: err.message })
                  );
                }
              });
            }
            break;
        }
      });
      const tabs = useLibraryTabs();
      uninstallTrackpad = installTrackpadSwipe(
        window,
        () => {
          if (route.name === "photos") tabs.back();
        },
        () => {
          if (route.name === "photos") tabs.forward();
        }
      );
    });
    onBeforeUnmount(() => {
      unbindScreenshotImported?.();
      unbindScreenshotImported = null;
      uninstallAppMenu?.();
      uninstallAppMenu = null;
      uninstallMenuAction?.();
      uninstallMenuAction = null;
      uninstallTrackpad?.();
      uninstallTrackpad = null;
    });
    const loadingVariant = computed(() => {
      const routeName = String(route.name || "");
      if (routeName === "snippets") {
        return "editor";
      }
      if (routeName === "screenRecorderRecord") {
        return "recorder-record";
      }
      if (routeName === "screenRecorderHistory") {
        return "recorder-history";
      }
      if (routeName === "screenRecorderPlayback") {
        return "recorder-playback";
      }
      if (routeName === "screenRecorderClip") {
        return "recorder-clip";
      }
      if (routeName === "screenshot" || routeName === "screenshotCapture") {
        return "capture";
      }
      return "default";
    });
    const loadingDelay = computed(() => {
      if (loadingVariant.value.startsWith("recorder") || loadingVariant.value === "capture") {
        return 160;
      }
      return 120;
    });
    return (_ctx, _cache) => {
      const _component_router_view = resolveComponent("router-view");
      return openBlock(), createElementBlock(Fragment, null, [
        !showShell.value ? (openBlock(), createElementBlock("div", _hoisted_1, [
          createVNode(_component_router_view, null, {
            default: withCtx(({ Component }) => [
              (openBlock(), createBlock(Suspense, { timeout: "0" }, {
                fallback: withCtx(() => [
                  createVNode(RouteLoading, {
                    variant: loadingVariant.value,
                    delay: loadingDelay.value
                  }, null, 8, ["variant", "delay"])
                ]),
                default: withCtx(() => [
                  (openBlock(), createBlock(resolveDynamicComponent(Component)))
                ]),
                _: 2
              }, 1024))
            ]),
            _: 1
          })
        ])) : (openBlock(), createBlock(_sfc_main$5, { key: 1 }, {
          default: withCtx(() => [
            createVNode(_component_router_view, null, {
              default: withCtx(({ Component }) => [
                (openBlock(), createBlock(Suspense, { timeout: "0" }, {
                  fallback: withCtx(() => [
                    createVNode(RouteLoading, {
                      variant: loadingVariant.value,
                      delay: loadingDelay.value
                    }, null, 8, ["variant", "delay"])
                  ]),
                  default: withCtx(() => [
                    (openBlock(), createBlock(resolveDynamicComponent(Component)))
                  ]),
                  _: 2
                }, 1024))
              ]),
              _: 1
            })
          ]),
          _: 1
        })),
        createVNode(UModal, {
          "model-value": unref(pendingConfirm2) !== null,
          size: "sm",
          "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => pendingConfirm2.value = null)
        }, {
          title: withCtx(() => [
            createBaseVNode("span", _hoisted_2, [
              createVNode(_sfc_main$8, { icon: "ic-modal-status-warning" }),
              createTextVNode(" " + toDisplayString(unref(pendingConfirm2)?.title), 1)
            ])
          ]),
          footer: withCtx(() => [
            createVNode(_sfc_main$4, {
              variant: "ghost",
              disabled: unref(confirming2),
              onClick: _cache[1] || (_cache[1] = ($event) => pendingConfirm2.value = null)
            }, {
              default: withCtx(() => [..._cache[3] || (_cache[3] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }, 8, ["disabled"]),
            createVNode(_sfc_main$4, {
              variant: "danger",
              loading: unref(confirming2),
              onClick: unref(runConfirmed2)
            }, {
              default: withCtx(() => [
                createTextVNode(toDisplayString(unref(pendingConfirm2)?.confirmLabel), 1)
              ]),
              _: 1
            }, 8, ["loading", "onClick"])
          ]),
          default: withCtx(() => [
            createBaseVNode("p", _hoisted_3, toDisplayString(unref(pendingConfirm2)?.body), 1),
            unref(pendingConfirm2)?.checkbox ? (openBlock(), createBlock(_sfc_main$3, {
              key: 0,
              modelValue: unref(confirmChecked2),
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => isRef(confirmChecked2) ? confirmChecked2.value = $event : null),
              label: unref(pendingConfirm2).checkbox.label,
              class: "mt-3"
            }, null, 8, ["modelValue", "label"])) : createCommentVNode("", true)
          ]),
          _: 1
        }, 8, ["model-value"]),
        createVNode(_sfc_main$1)
      ], 64);
    };
  }
}
