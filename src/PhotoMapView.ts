/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$9 = /* @__PURE__ */ defineComponent(
*/
{
  __name: "PhotoMapView",
  props: {
    photos: {},
    loading: { type: Boolean }
  },
  emits: ["select-photo"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const mapEl = ref(null);
    let map2 = null;
    let styleLoaded = false;
    let pendingRender = null;
    let markers = [];
    let clusterIndex = null;
    let indexPhotos = [];
    const gpsCount = computed(() => photosWithGpsList().length);
    function photosWithGpsList() {
      return props.photos.filter(
        (p2) => p2.latitude != null && p2.longitude != null && Math.abs(p2.latitude) <= 90
      );
    }
    function rebuildIndex() {
      const items2 = photosWithGpsList();
      indexPhotos = items2;
      const index2 = new Supercluster({ radius: 60, maxZoom: 16 });
      index2.load(
        items2.map((p2) => ({
          type: "Feature",
          properties: { id: p2.id },
          geometry: { type: "Point", coordinates: [p2.longitude, p2.latitude] }
        }))
      );
      clusterIndex = index2;
    }
    function photoById(id3) {
      return indexPhotos.find((p2) => p2.id === id3);
    }
    function clearMarkers() {
      for (const marker of markers) marker.remove();
      markers = [];
    }
    function renderClusters() {
      if (!map2) return;
      clearMarkers();
      if (!clusterIndex) return;
      const bounds = map2.getBounds();
      const zoom = Math.round(map2.getZoom());
      const clusters = clusterIndex.getClusters(
        [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        zoom
      );
      for (const feature of clusters) {
        const [lng, lat] = feature.geometry.coordinates;
        const props2 = feature.properties;
        if (props2.cluster && typeof props2.cluster_id === "number") {
          const el2 = document.createElement("div");
          el2.className = "leaf-map-cluster";
          el2.textContent = String(props2.point_count ?? 0);
          el2.addEventListener("click", () => {
            const expansion = clusterIndex.getClusterExpansionZoom(props2.cluster_id);
            map2.easeTo({ center: [lng, lat], zoom: expansion });
          });
          markers.push(new Zp({ element: el2 }).setLngLat([lng, lat]).addTo(map2));
        } else {
          const photo = photoById(props2.id ?? "");
          if (!photo) continue;
          const el2 = document.createElement("div");
          el2.className = "leaf-map-thumb";
          const img = document.createElement("img");
          img.src = `thumb://256/${photo.id}`;
          img.loading = "lazy";
          img.title = photo.fileName;
          img.addEventListener("click", () => emit("select-photo", photo.id));
          el2.appendChild(img);
          markers.push(new Zp({ element: el2 }).setLngLat([lng, lat]).addTo(map2));
        }
      }
    }
    function renderWhenReady() {
      if (!map2 || !styleLoaded) {
        pendingRender = renderWhenReady;
        return;
      }
      rebuildIndex();
      renderClusters();
      const hasGps = photosWithGpsList().length > 0;
      if (!hasGps || everFitted) return;
      everFitted = true;
      fitToMarkers();
    }
    let everFitted = false;
    function fitToMarkers() {
      const items2 = photosWithGpsList();
      if (!map2 || items2.length === 0) return;
      const bounds = new Xi();
      for (const p2 of items2) bounds.extend([p2.longitude, p2.latitude]);
      map2.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
    }
    function initMap() {
      if (!mapEl.value || map2) return;
      map2 = new zp({
        container: mapEl.value,
        // 内联栅格样式：openfreemap 在部分网络不可达（实测 SSL 握手被断），
        // 改用 Carto basemaps（WGS84 无偏移，与 EXIF 坐标一致；国内可达实测 200）
        style: {
          version: 8,
          sources: {
            carto: {
              type: "raster",
              tiles: [
                "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
                "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
                "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png"
              ],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors © CARTO",
              maxzoom: 20
            }
          },
          layers: [{ id: "basemap", type: "raster", source: "carto" }]
        },
        center: [116.4, 39.9],
        zoom: 2,
        attributionControl: { compact: true }
      });
      map2.addControl(new Vp({ showCompass: false }), "top-right");
      map2.on("load", () => {
        styleLoaded = true;
        if (pendingRender) {
          pendingRender();
          pendingRender = null;
        }
      });
      map2.on("moveend", () => {
        if (styleLoaded && clusterIndex) renderClusters();
      });
    }
    watch(
      () => props.photos,
      () => renderWhenReady()
    );
    onMounted(() => {
      initMap();
    });
    onUnmounted(() => {
      map2?.remove();
      map2 = null;
      pendingRender = null;
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$9, [
        createBaseVNode("div", {
          ref_key: "mapEl",
          ref: mapEl,
          class: "absolute inset-0"
        }, null, 512),
        !__props.loading && gpsCount.value === 0 ? (openBlock(), createElementBlock("div", _hoisted_2$9, [..._cache[0] || (_cache[0] = [
          createBaseVNode("div", { class: "text-5xl mb-3" }, "🗺️", -1),
          createBaseVNode("div", { class: "text-lg mb-1" }, "没有带 GPS 信息的图片", -1),
          createBaseVNode("div", { class: "text-sm" }, "手机拍摄的照片通常带定位；截图和网络图片一般没有", -1)
        ])])) : createCommentVNode("", true),
        __props.loading ? (openBlock(), createElementBlock("div", _hoisted_3$9, " 正在加载地图… ")) : createCommentVNode("", true)
      ]);
    };
  }
}
