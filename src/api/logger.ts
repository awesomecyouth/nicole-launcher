/**
 * 轻量运行日志:append 到系统日志目录 nicole.log(经 Rust command,浏览器环境静默跳过)
 * 记录内容:未捕获错误(红条)、网络层失败与重试;排查 Windows 环境问题的主要依据
 */
import { invoke } from '@tauri-apps/api/core'

export function logLine(text: string): void {
  const ts = new Date().toLocaleString('sv-SE', { hour12: false })
  invoke('append_log', { line: `[${ts}] ${text}` }).catch(() => {})
}
