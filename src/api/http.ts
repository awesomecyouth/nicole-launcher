/**
 * 统一 axios 管线 + {retcode,message,data} 解包
 *
 * 网络通道(2026-10-20 定稿,两条铁律):
 *  1. 禁止给 window.fetch 赋值 —— macOS WKWebView 下全局替换会冻结渲染/输入
 *     (旧库白屏根因,见 docs/tasks/2026_10_20__001 M0 实施备注);
 *  2. Tauri 环境必须走 tauri-fetch 的原生 IPC 通道 —— 浏览器 fetch 规范禁设
 *     Cookie/Referer 头,而米哈游鉴权基于 Cookie(直用 plugin-http 的 fetch 会
 *     全部 -100 未登录,配合 Cargo 侧 unsafe-headers feature)。
 * 纯浏览器 dev 回退 axios 内置 fetch adapter(受 CORS 限制,仅调试 UI 用)。
 * 依据: docs/plans/2026_10_20__001__phase1__development_plan.md §3.2
 */
import axios, { AxiosError, AxiosHeaders, type AxiosAdapter, type AxiosRequestConfig, type AxiosResponse } from 'axios'
import type { MiHoYoResponse } from './constants'
import { tauriRawFetch } from './tauri-fetch'

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

/** Tauri 环境 axios adapter:请求头经 IPC 数据直传,Cookie/Referer 可用 */
const tauriAdapter: AxiosAdapter = async (config) => {
  const headers: Record<string, string> = {}
  const headerObj = AxiosHeaders.from(config.headers).toJSON() as Record<string, unknown>
  for (const [key, value] of Object.entries(headerObj)) {
    headers[key] = Array.isArray(value) ? value.join(', ') : String(value)
  }
  const hasBody = config.data != null
  const body = hasBody ? (typeof config.data === 'string' ? config.data : JSON.stringify(config.data)) : null
  if (body != null && !Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json'
  }

  const raw = await tauriRawFetch({
    method: (config.method ?? 'get').toUpperCase(),
    url: config.url ?? '',
    headers,
    body,
  })

  let data: unknown = raw.bodyText
  if (raw.bodyText) {
    try {
      data = JSON.parse(raw.bodyText)
    } catch {
      // 非 JSON 响应保留文本
    }
  }
  const response: AxiosResponse = {
    data,
    status: raw.status,
    statusText: raw.statusText,
    headers: AxiosHeaders.from(raw.headers),
    config,
  }
  if (!config.validateStatus || config.validateStatus(raw.status)) {
    return response
  }
  throw new AxiosError(
    `Request failed with status code ${raw.status}`,
    AxiosError.ERR_BAD_RESPONSE,
    config,
    undefined,
    response
  )
}

const http = axios.create({
  adapter: '__TAURI_INTERNALS__' in window ? tauriAdapter : 'fetch',
  timeout: 15000,
})

/**
 * 发起米哈游 API 请求并解包:retcode===0 返回 data,否则抛 MiHoYoApiError
 */
export async function miHoYoRequest<T>(config: AxiosRequestConfig): Promise<T> {
  const resp = await http.request<MiHoYoResponse<T>>(config)
  const body = resp.data
  if (typeof body?.retcode === 'number' && body.retcode !== 0) {
    throw new MiHoYoApiError(body.retcode, body.message)
  }
  return body.data
}
