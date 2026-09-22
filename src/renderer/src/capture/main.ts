import { createApp } from 'vue'
import CaptureApp from './App.vue'

// 截图遮罩/贴图窗的轻量入口：不挂 router/Pinia，保证快捷键唤起 <200ms
createApp(CaptureApp).mount('#app')
