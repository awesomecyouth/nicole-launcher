/**
 * 游戏进程监控(应用级单一定时器):运行中禁用启动入口,退出自动恢复
 * 依据: docs/tasks/2026_10_21__001__ux__dashboard_restructure_tasks.md D-T1
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'

export const useLauncherStore = defineStore('launcher', () => {
  const isGameRunning = ref(false)
  /** 进程出现时刻(ms),供运行时长展示 */
  const runningSince = ref(0)

  /** 运行时长文本(分钟粒度) */
  const runningDurationText = computed(() => {
    if (!isGameRunning.value || !runningSince.value) return ''
    const minutes = Math.floor((Date.now() - runningSince.value) / 60_000)
    if (minutes < 60) return `${minutes} 分钟`
    return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`
  })

  let timer: number | undefined

  /** main.ts 初始化时调用;5s 轮询(非 Windows 平台恒为 false,无害) */
  function setupMonitor(): void {
    if (timer !== undefined || !('__TAURI_INTERNALS__' in window)) return
    void poll()
    timer = window.setInterval(() => void poll(), 5000)
  }

  async function poll(): Promise<void> {
    try {
      const alive = await invoke<boolean>('is_game_running')
      if (alive && !isGameRunning.value) runningSince.value = Date.now()
      isGameRunning.value = alive
    } catch {
      // 非致命:保持上次状态,下个周期重试
    }
  }

  return { isGameRunning, runningSince, runningDurationText, setupMonitor }
})
