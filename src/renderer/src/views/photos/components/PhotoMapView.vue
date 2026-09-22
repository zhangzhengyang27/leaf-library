<template>
  <div class="map-view relative h-full w-full">
    <div ref="mapEl" class="absolute inset-0" />
    <!-- 无 GPS 数据 -->
    <div
      v-if="!loading && gpsCount === 0"
      class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface-0 text-fg-muted"
    >
      <div class="text-5xl mb-3">🗺️</div>
      <div class="text-lg mb-1">没有带 GPS 信息的图片</div>
      <div class="text-sm">手机拍摄的照片通常带定位；截图和网络图片一般没有</div>
    </div>
    <div
      v-if="loading"
      class="absolute inset-0 z-10 flex items-center justify-center bg-surface-0 text-fg-muted"
    >
      正在加载地图…
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Map as MLMap, Marker, NavigationControl, LngLatBounds } from 'maplibre-gl'
import Supercluster from 'supercluster'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Photo } from '../../../types/photo'

const props = defineProps<{
  /** 图库全部图片（组件内部过滤有 GPS 的） */
  photos: Photo[]
  loading: boolean
}>()

const emit = defineEmits<{
  'select-photo': [photoId: string]
}>()

const mapEl = ref<HTMLDivElement | null>(null)
let map: MLMap | null = null
let styleLoaded = false
let pendingRender: (() => void) | null = null

/** 活跃 marker（渲染前统一清空） */
let markers: Marker[] = []

interface PointProps {
  id: string
}

let clusterIndex: Supercluster<PointProps> | null = null
let indexPhotos: Photo[] = []

const gpsCount = computed(() => photosWithGpsList().length)

function photosWithGpsList(): Photo[] {
  return props.photos.filter(
    (p) => p.latitude != null && p.longitude != null && Math.abs(p.latitude) <= 90
  )
}

/** 重建 supercluster 索引（photos 变化时调用） */
function rebuildIndex(): void {
  const items = photosWithGpsList()
  indexPhotos = items
  const index = new Supercluster<PointProps>({ radius: 60, maxZoom: 16 })
  index.load(
    items.map((p) => ({
      type: 'Feature' as const,
      properties: { id: p.id },
      geometry: { type: 'Point' as const, coordinates: [p.longitude!, p.latitude!] }
    }))
  )
  clusterIndex = index
}

function photoById(id: string): Photo | undefined {
  return indexPhotos.find((p) => p.id === id)
}

function clearMarkers(): void {
  for (const marker of markers) marker.remove()
  markers = []
}

/** 按当前视野渲染聚合结果（supercluster，万级点流畅） */
function renderClusters(): void {
  if (!map) return
  clearMarkers()
  if (!clusterIndex) return

  const bounds = map.getBounds()
  const zoom = Math.round(map.getZoom())
  const clusters = clusterIndex.getClusters(
    [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
    zoom
  )

  for (const feature of clusters) {
    const [lng, lat] = feature.geometry.coordinates
    const props = feature.properties as {
      cluster?: boolean
      cluster_id?: number
      point_count?: number
      id?: string
    }

    if (props.cluster && typeof props.cluster_id === 'number') {
      // 聚合气泡：显示数量，点击展开
      const el = document.createElement('div')
      el.className = 'leaf-map-cluster'
      el.textContent = String(props.point_count ?? 0)
      el.addEventListener('click', () => {
        const expansion = clusterIndex!.getClusterExpansionZoom(props.cluster_id!)
        map!.easeTo({ center: [lng, lat], zoom: expansion })
      })
      markers.push(new Marker({ element: el }).setLngLat([lng, lat]).addTo(map))
    } else {
      const photo = photoById(props.id ?? '')
      if (!photo) continue
      const el = document.createElement('div')
      el.className = 'leaf-map-thumb'
      const img = document.createElement('img')
      img.src = `thumb://256/${photo.id}`
      img.loading = 'lazy'
      img.title = photo.fileName
      img.addEventListener('click', () => emit('select-photo', photo.id))
      el.appendChild(img)
      markers.push(new Marker({ element: el }).setLngLat([lng, lat]).addTo(map))
    }
  }
}

function renderWhenReady(): void {
  if (!map || !styleLoaded) {
    pendingRender = renderWhenReady
    return
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
            'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
            'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png'
          ],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors © CARTO',
          maxzoom: 20
        }
      },
      layers: [{ id: 'basemap', type: 'raster', source: 'carto' }]
    },
    center: [116.4, 39.9],
    zoom: 2,
    attributionControl: { compact: true }
  })
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
  map.on('load', () => {
    styleLoaded = true
    if (pendingRender) {
      pendingRender()
      pendingRender = null
    }
  })
  // 视野/缩放变化时按需重算聚合
  map.on('moveend', () => {
    if (styleLoaded && clusterIndex) renderClusters()
  })
}

watch(
  () => props.photos,
  () => renderWhenReady()
)

onMounted(() => {
  initMap()
})

onUnmounted(() => {
  map?.remove()
  map = null
  pendingRender = null
})
</script>

<style>
.leaf-map-thumb {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: transform 0.15s;
}
.leaf-map-thumb:hover {
  transform: scale(1.15);
}
.leaf-map-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.leaf-map-cluster {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
  padding: 0 8px;
  border-radius: 18px;
  background: #10b981;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: transform 0.15s;
}
.leaf-map-cluster:hover {
  transform: scale(1.1);
}
</style>
