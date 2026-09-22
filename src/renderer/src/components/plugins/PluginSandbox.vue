<script setup lang="ts">
/**
 * PluginSandbox · 插件沙箱容器（阶段 5.1 MVP）
 *
 * sandbox iframe（allow-scripts，无 allow-same-origin → origin 隔离，无 nodeIntegration）。
 * 桥协议（postMessage，父↔iframe 双通道）：
 *   插件 → 父：{ type: 'leaf:ready' }                      插件 DOM 就绪
 *   父   → 插件：{ type: 'leaf:data', payload }             注入当前数据（选中素材等）
 * 白名单：只透传 payload，插件无法直接访问 window.api / 主进程。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { InstalledPlugin } from '@renderer/types/plugin'

const props = defineProps<{
  plugin: InstalledPlugin
  /** 注入给插件的当前数据（选中素材摘要等） */
  payload?: unknown
  /** 容器高度（px） */
  height?: number
}>()

const iframeRef = ref<HTMLIFrameElement | null>(null)
const srcDoc = ref('')
const loadError = ref('')

/**
 * 插件沙箱 CSP（代码审查 P0-5）：opaque origin 下默认无 CSP，
 * 插件脚本可 fetch/WebSocket 把 payload（素材路径/元数据）外传公网。
 * 这里封死网络通道：default-src 'none' + 仅允许内联脚本/样式与 data: thumb: 图片。
 */
const PLUGIN_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data: thumb: blob:; font-src data:; connect-src 'none'; " +
  "object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"

function injectCsp(html: string): string {
  // 用 DOMParser 解析后向真实 <head> 元素前插 meta（审查 P1-12）：
  // 旧实现 replace 第一个 </head> 字面量，恶意插件 HTML 把它放进注释/属性即可让
  // CSP meta 落入无效位置，封网目标失效
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const head = doc.head ?? doc.createElement('head')
    const meta = doc.createElement('meta')
    meta.setAttribute('http-equiv', 'Content-Security-Policy')
    meta.setAttribute('content', PLUGIN_CSP)
    // 同时封死 WebRTC（connect-src 不约束 RTCPeerConnection）
    const webrtcBlock = doc.createElement('script')
    webrtcBlock.textContent =
      'try{RTCPeerConnection=undefined;webkitRTCPeerConnection=undefined}catch(_){}'
    head.prepend(meta, webrtcBlock)
    if (!doc.head) doc.documentElement.prepend(head)
    return '<!DOCTYPE html>' + doc.documentElement.outerHTML
  } catch {
    return `<head><meta http-equiv="Content-Security-Policy" content="${PLUGIN_CSP}"></head>${html}`
  }
}

/**
 * postMessage 走结构化克隆，而 Vue 的 reactive 代理**不可克隆**——直接 post 会抛
 * `DataCloneError: [object Array] could not be cloned`（payload 里带 tags 这类
 * 响应式数组时必现，插件因此永远收不到数据）。桥协议只传元数据，先转纯数据，
 * 顺带挡掉误传函数 / DOM 节点。
 */
function plainPayload(v: unknown): unknown {
  if (v === null || v === undefined || typeof v !== 'object') return v ?? null
  try {
    return JSON.parse(JSON.stringify(v))
  } catch {
    return null
  }
}

function onMessage(e: MessageEvent): void {
  const win = iframeRef.value?.contentWindow
  if (!win || e.source !== win) return
  const msg = e.data as { type?: string }
  if (msg?.type === 'leaf:ready') {
    win.postMessage({ type: 'leaf:data', payload: plainPayload(props.payload) }, '*')
  }
}

function pushPayload(): void {
  const win = iframeRef.value?.contentWindow
  if (win) win.postMessage({ type: 'leaf:data', payload: plainPayload(props.payload) }, '*')
}

onMounted(async () => {
  window.addEventListener('message', onMessage)
  const res = await window.api.plugins.readAsset(props.plugin.id, props.plugin.entry)
  if (res.ok) srcDoc.value = injectCsp(res.content)
  else loadError.value = res.error
})

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
})

// payload 变化时主动推送（如切换选中素材）
watch(
  () => props.payload,
  () => pushPayload()
)
</script>

<template>
  <div class="plugin-sandbox overflow-hidden rounded-md border border-line-subtle bg-surface-0">
    <div
      class="flex items-center justify-between border-b border-line-subtle bg-surface-1 px-2 py-1"
    >
      <span class="truncate text-[10px] text-fg-secondary">{{ plugin.name }}</span>
      <span class="shrink-0 text-[9px] text-fg-muted">v{{ plugin.version }}</span>
    </div>
    <p v-if="loadError" class="px-2 py-3 text-[10px] text-danger">{{ loadError }}</p>
    <iframe
      v-show="srcDoc && !loadError"
      ref="iframeRef"
      :srcdoc="srcDoc"
      sandbox="allow-scripts"
      class="block w-full"
      :style="{ height: `${height ?? 120}px` }"
      title="plugin sandbox"
    />
  </div>
</template>
