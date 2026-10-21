/**
 * 签到日历子窗口:点击便笺卡签到条目时打开,展示该角色的完整月历
 * 页面实现见 src/pages/sign/index.vue(裸路由 /sign)
 */
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

export function openSignWindow(uid: string): void {
  if (!('__TAURI_INTERNALS__' in window)) return
  // 固定 label 复用单窗口(重复点击聚焦已有窗口)
  new WebviewWindow('sign-calendar', {
    url: `/sign?uid=${encodeURIComponent(uid)}`,
    title: '签到日历',
    width: 600,
    height: 700,
    resizable: true,
    center: true,
  })
}
