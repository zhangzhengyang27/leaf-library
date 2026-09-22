/**
 * 二十八轮：设置页「操控」偏好（localStorage 持久化）。
 * PhotoGrid / PhotoListView 双击时读取，设置页写入。
 */

export type DoubleClickAction = 'preview' | 'system'

const DBL_CLICK_KEY = 'leaf.pref.double-click-action'

export function loadDoubleClickAction(): DoubleClickAction {
  try {
    return localStorage.getItem(DBL_CLICK_KEY) === 'system' ? 'system' : 'preview'
  } catch {
    return 'preview'
  }
}
