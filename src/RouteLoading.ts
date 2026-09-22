/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-C_4vKAXg.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$9 = /* @__PURE__ */ defineComponent(
*/
{
  __name: "RouteLoading",
  props: {
    variant: { default: "default" },
    delay: { default: 140 }
  },
  setup(__props) {
    const props = __props;
    const visible = ref(props.delay === 0);
    let timer;
    const variantClass = computed(() => {
      return `route-loading--${props.variant}`;
    });
    onMounted(() => {
      if (props.delay <= 0) {
        visible.value = true;
        return;
      }
      timer = setTimeout(() => {
        visible.value = true;
      }, props.delay);
    });
    onBeforeUnmount(() => {
      if (timer) {
        clearTimeout(timer);
      }
    });
    return (_ctx, _cache) => {
      return visible.value ? (openBlock(), createElementBlock("div", {
        key: 0,
        class: normalizeClass(["route-loading", variantClass.value]),
        role: "status",
        "aria-live": "polite",
        "aria-label": "页面加载中"
      }, [
        createBaseVNode("div", _hoisted_1$9, [
          _cache[7] || (_cache[7] = createBaseVNode("div", { class: "route-loading__header skeleton" }, null, -1)),
          __props.variant === "recorder-record" ? (openBlock(), createElementBlock("div", _hoisted_2$8, [..._cache[0] || (_cache[0] = [
            createStaticVNode('<div class="route-loading__column" data-v-84593bec><div class="skeleton h-12" data-v-84593bec></div><div class="skeleton h-80" data-v-84593bec></div></div><div class="route-loading__column" data-v-84593bec><div class="skeleton h-12" data-v-84593bec></div><div class="skeleton h-16" data-v-84593bec></div><div class="skeleton h-16" data-v-84593bec></div><div class="skeleton h-24" data-v-84593bec></div></div>', 2)
          ])])) : __props.variant === "recorder-history" ? (openBlock(), createElementBlock("div", _hoisted_3$6, [..._cache[1] || (_cache[1] = [
            createStaticVNode('<div class="route-loading__column" data-v-84593bec><div class="skeleton h-12" data-v-84593bec></div><div class="route-loading__list" data-v-84593bec><div class="skeleton h-14" data-v-84593bec></div><div class="skeleton h-14" data-v-84593bec></div><div class="skeleton h-14" data-v-84593bec></div><div class="skeleton h-14" data-v-84593bec></div><div class="skeleton h-14" data-v-84593bec></div></div></div>', 1)
          ])])) : __props.variant === "recorder-playback" ? (openBlock(), createElementBlock("div", _hoisted_4$4, [..._cache[2] || (_cache[2] = [
            createStaticVNode('<div class="route-loading__column" data-v-84593bec><div class="skeleton h-72" data-v-84593bec></div><div class="skeleton h-20" data-v-84593bec></div><div class="route-loading__grid route-loading__grid--wide" data-v-84593bec><div class="skeleton h-20" data-v-84593bec></div><div class="skeleton h-20" data-v-84593bec></div><div class="skeleton h-20" data-v-84593bec></div><div class="skeleton h-20" data-v-84593bec></div></div></div>', 1)
          ])])) : __props.variant === "recorder-clip" ? (openBlock(), createElementBlock("div", _hoisted_5$2, [..._cache[3] || (_cache[3] = [
            createStaticVNode('<div class="route-loading__column" data-v-84593bec><div class="skeleton h-12" data-v-84593bec></div><div class="skeleton h-64" data-v-84593bec></div><div class="skeleton h-24" data-v-84593bec></div></div><div class="route-loading__column" data-v-84593bec><div class="skeleton h-12" data-v-84593bec></div><div class="skeleton h-16" data-v-84593bec></div><div class="skeleton h-16" data-v-84593bec></div><div class="skeleton h-16" data-v-84593bec></div></div>', 2)
          ])])) : __props.variant === "editor" ? (openBlock(), createElementBlock("div", _hoisted_6$2, [..._cache[4] || (_cache[4] = [
            createStaticVNode('<div class="route-loading__column" data-v-84593bec><div class="skeleton h-12" data-v-84593bec></div><div class="skeleton h-9" data-v-84593bec></div><div class="skeleton h-9" data-v-84593bec></div><div class="skeleton h-9" data-v-84593bec></div><div class="skeleton h-9" data-v-84593bec></div></div><div class="route-loading__column" data-v-84593bec><div class="skeleton h-12" data-v-84593bec></div><div class="skeleton h-72" data-v-84593bec></div></div><div class="route-loading__column" data-v-84593bec><div class="skeleton h-12" data-v-84593bec></div><div class="skeleton h-72" data-v-84593bec></div></div>', 3)
          ])])) : __props.variant === "capture" ? (openBlock(), createElementBlock("div", _hoisted_7$2, [..._cache[5] || (_cache[5] = [
            createStaticVNode('<div class="route-loading__column" data-v-84593bec><div class="skeleton h-12" data-v-84593bec></div><div class="skeleton h-64" data-v-84593bec></div><div class="route-loading__grid route-loading__grid--wide" data-v-84593bec><div class="skeleton h-20" data-v-84593bec></div><div class="skeleton h-20" data-v-84593bec></div><div class="skeleton h-20" data-v-84593bec></div><div class="skeleton h-20" data-v-84593bec></div></div></div>', 1)
          ])])) : (openBlock(), createElementBlock("div", _hoisted_8, [..._cache[6] || (_cache[6] = [
            createStaticVNode('<div class="route-loading__sidebar" data-v-84593bec><div class="skeleton h-12" data-v-84593bec></div><div class="skeleton h-9" data-v-84593bec></div><div class="skeleton h-9" data-v-84593bec></div><div class="skeleton h-9" data-v-84593bec></div></div><div class="route-loading__main" data-v-84593bec><div class="skeleton h-12" data-v-84593bec></div><div class="skeleton h-48" data-v-84593bec></div><div class="route-loading__grid" data-v-84593bec><div class="skeleton h-24" data-v-84593bec></div><div class="skeleton h-24" data-v-84593bec></div><div class="skeleton h-24" data-v-84593bec></div></div></div>', 2)
          ])]))
        ])
      ], 2)) : createCommentVNode("", true);
    };
  }
}
