// 放大镜当前取到的像素色（Magnifier 写，SelectionLayer 键盘读）
import { ref } from 'vue'
export const pickedColor = ref<{ r: number; g: number; b: number } | null>(null)
export function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const h = (n: number): string => n.toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase()
}
