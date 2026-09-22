  }
  rebuildIndex()
  renderClusters()
  // 只在首次渲染（或素材从空变为有）时 fitBounds（审查 P3-51）：
  // 旧实现每次 photos 引用变化都重置视野，用户手动缩放/平移会被反复拉回
  const hasGps = photosWithGpsList().length > 0
  if (!hasGps || everFitted) return
  everFitted = true
  fitToMarkers()
}

let everFitted = false

function fitToMarkers(): void {
  const items = photosWithGpsList()
  if (!map || items.length === 0) return
  const bounds = new LngLatBounds()
  for (const p of items) bounds.extend([p.longitude!, p.latitude!])
  map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 })
}

function initMap(): void {
  if (!mapEl.value || map) return
  map = new MLMap({
    container: mapEl.value,
    // 内联栅格样式：openfreemap 在部分网络不可达（实测 SSL 握手被断），
    // 改用 Carto basemaps（WGS84 无偏移，与 EXIF 坐标一致；国内可达实测 200）
    style: {
      version: 8,
      sources: {
        carto: {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
