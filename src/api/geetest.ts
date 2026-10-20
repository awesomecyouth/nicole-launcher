/**
 * 极验(geetest)手动验证:弹出子窗口加载官方 gt.js,由用户完成滑块,结果经事件回传。
 * 仅手动验证,不接任何第三方打码服务(用户决策 2026-10-20)。
 * 页面实现见 src/pages/geetest/index.vue;行为参考 Snap.Hutao GeetestWebView2ContentProvider。
 */
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { logLine } from './logger'

/** 极验成功回执(gt3 getValidate 结构) */
export interface GeetestValidate {
  geetest_challenge: string
  geetest_validate: string
  geetest_seccode: string
}

/**
 * 打开验证窗口等待用户完成滑块;取消/关闭窗口返回 null。
 * 浏览器环境(无 Tauri)直接返回 null。
 */
export function solveGtChallengeByWindow(
  gt: string,
  challenge: string,
  isOversea: boolean
): Promise<GeetestValidate | null> {
  if (!('__TAURI_INTERNALS__' in window)) return Promise.resolve(null)

  return new Promise((resolve) => {
    const unlisteners: Promise<UnlistenFn>[] = []
    let settled = false
    const finish = (value: GeetestValidate | null): void => {
      if (settled) return
      settled = true
      for (const p of unlisteners) p.then((fn) => fn())
      if (value) logLine('geetest solved')
      else logLine('geetest canceled')
      resolve(value)
    }

    unlisteners.push(listen<GeetestValidate>('geetest:result', (event) => finish(event.payload)))
    unlisteners.push(
      listen('geetest:failed', () => {
        logLine('geetest failed (onError)')
        finish(null)
      })
    )

    const url = `/geetest?gt=${encodeURIComponent(gt)}&challenge=${encodeURIComponent(challenge)}&oversea=${isOversea ? 1 : 0}`
    const win = new WebviewWindow('geetest-verify', {
      url,
      title: '安全验证',
      width: 420,
      height: 460,
      resizable: false,
      center: true,
    })
    win.once('close', () => finish(null))
    win.once('tauri:error', (e: { payload: unknown }) => {
      logLine(`geetest window error: ${JSON.stringify(e.payload)}`)
      finish(null)
    })
  })
}
