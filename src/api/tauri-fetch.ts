/**
 * Tauri 原生 HTTP 通道:直接 invoke plugin:http 的 IPC 命令
 *
 * 为什么不用 @tauri-apps/plugin-http 的 fetch:
 *  1. 其 JS 端经 new Request() 构造请求,WKWebView 按 fetch 规范静默丢弃
 *     禁设头(Cookie/Referer)——米哈游鉴权全靠 Cookie 头,会全部 -100 未登录;
 *  2. 即便绕过,Rust 端默认也过滤这些头(需 Cargo 开启 unsafe-headers feature)。
 * 本模块把请求头作为 IPC 数据直传(配合 unsafe-headers),响应侧逐块读取拼接。
 * 参考实现: tauri-plugin-http 2.8.3 dist-js/index.js(同一套命令,去掉 Request 构造)
 */
import { invoke } from '@tauri-apps/api/core'
import { logLine } from './logger'

export interface RawHttpResponse {
  status: number
  statusText: string
  url: string
  headers: Record<string, string>
  bodyText: string
}

/** 连接层瞬时失败的标识(reqwest display),对它自动重试 */
const RETRYABLE = 'error sending request'
/** 重试退避间隔(ms) */
const RETRY_DELAYS_MS = [500, 2000]
/** 连接超时(ms):插件默认无超时,避免连接挂起导致请求永远 pending */
const CONNECT_TIMEOUT_MS = 10_000

/** 经 Rust reqwest 发起请求;连接层瞬时失败(Windows 实测偶发)自动退避重试 */
export async function tauriRawFetch(req: {
  method: string
  url: string
  headers: Record<string, string>
  body?: string | null
}): Promise<RawHttpResponse> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rawFetchOnce(req)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes(RETRYABLE) || attempt >= RETRY_DELAYS_MS.length) {
        logLine(`net fail ${req.method} ${req.url}: ${msg}`)
        throw err
      }
      logLine(`net retry(${attempt + 1}) ${req.method} ${req.url}: ${msg}`)
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
    }
  }
}

async function rawFetchOnce(req: {
  method: string
  url: string
  headers: Record<string, string>
  body?: string | null
}): Promise<RawHttpResponse> {
  const rid = await invoke<number>('plugin:http|fetch', {
    clientConfig: {
      method: req.method,
      url: req.url,
      headers: Object.entries(req.headers).map(([name, value]) => [name, value]),
      data: req.body != null ? Array.from(new TextEncoder().encode(req.body)) : null,
      connectTimeout: CONNECT_TIMEOUT_MS,
    },
  })

  try {
    const sent = await invoke<{
      status: number
      statusText: string
      url: string
      headers: [string, string][]
      rid: number
    }>('plugin:http|fetch_send', { rid })

    const headers: Record<string, string> = {}
    for (const [name, value] of sent.headers) headers[name] = value

    // 逐块读取:每块末尾追加了标志字节(0=还有数据,1=结束;空响应为单个 [1])
    const parts: Uint8Array[] = []
    for (;;) {
      const chunk = new Uint8Array(await invoke<number[]>('plugin:http|fetch_read_body', { rid: sent.rid }))
      const flag = chunk[chunk.length - 1]
      parts.push(chunk.subarray(0, chunk.length - 1))
      if (flag === 1) break
    }
    const total = parts.reduce((sum, p) => sum + p.length, 0)
    const merged = new Uint8Array(total)
    let offset = 0
    for (const p of parts) {
      merged.set(p, offset)
      offset += p.length
    }
    return {
      status: sent.status,
      statusText: sent.statusText,
      url: sent.url,
      headers,
      bodyText: new TextDecoder().decode(merged),
    }
  } catch (err) {
    await invoke('plugin:http|fetch_cancel', { rid }).catch(() => {})
    throw err
  }
}
