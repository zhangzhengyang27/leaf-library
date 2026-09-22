// capture 页极简 toast（主应用 useToast 不进轻量入口）
import { ref } from 'vue'
export const toastMessage = ref('')
let timer: number | undefined
export function showToast(message: string): void {
  toastMessage.value = message
  if (timer) window.clearTimeout(timer)
  timer = window.setTimeout(() => (toastMessage.value = ''), 1600)
}
