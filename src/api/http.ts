/**
 * 统一 axios 管线:plugin-http fetch adapter + {retcode,message,data} 解包
 *
 * 重要:plugin-http 的 fetch 只经此处的 env.fetch 注入给 axios,绝不赋给 window.fetch。
 * macOS WKWebView 下全局替换 fetch 会导致页面渲染与输入事件冻结(JS 仍存活,
 * 2026-10-20 差分实验定位,详见 docs/tasks/2026_10_20__001 M0 实施备注)。
 * plugin-http 惰性加载:应用启动路径完全不触碰它,首个业务请求才加载。
 * 依据: docs/plans/2026_10_20__001__phase1__development_plan.md §3.2
 */
import axios, { type AxiosRequestConfig } from 'axios'
import type { MiHoYoResponse } from './constants'

/** 米哈游 API 业务错误(retcode !== 0) */
export class MiHoYoApiError extends Error {
  constructor(
    public readonly retcode: number,
    message: string
  ) {
    super(`[${retcode}] ${message}`)
    this.name = 'MiHoYoApiError'
  }
}

const http = axios.create({
  adapter: 'fetch',
  timeout: 15000,
})

/** 惰性加载 plugin-http 的 fetch(仅 Tauri 环境需要;纯浏览器 dev 用原生 fetch) */
let tauriFetch: typeof window.fetch | null = null
async function ensureTauriFetch(): Promise<void> {
  if (!tauriFetch && '__TAURI_INTERNALS__' in window) {
    tauriFetch = (await import('@tauri-apps/plugin-http')).fetch as typeof window.fetch
  }
}

/**
 * 发起米哈游 API 请求并解包:retcode===0 返回 data,否则抛 MiHoYoApiError
 */
export async function miHoYoRequest<T>(config: AxiosRequestConfig): Promise<T> {
  await ensureTauriFetch()
  const resp = await http.request<MiHoYoResponse<T>>({
    ...config,
    env: tauriFetch ? { fetch: tauriFetch } : undefined,
  })
  const body = resp.data
  if (typeof body?.retcode === 'number' && body.retcode !== 0) {
    throw new MiHoYoApiError(body.retcode, body.message)
  }
  return body.data
}
