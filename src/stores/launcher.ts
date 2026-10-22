/**
 * 游戏启动状态(全局唯一):路径识别、启动流程、进程监控
 * 状态收敛于 store 而非组件——页面切换不丢失(Windows 实测反馈 #2/#4)
 * 依据: docs/tasks/2026_10_20__003、用户反馈 2026-10-22
 */
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { buildLaunchArgs, createAuthTicket } from '@/api/auth-ticket'
import { useAccountsStore } from './accounts'
import { useSettingsStore } from './settings'

/** Rust 侧 GameInfo 的镜像 */
export interface GameInfo {
  exe: string
  server: 'cn' | 'bili' | 'os'
  channel: number
  sub_channel: number
  is_bili: boolean
}

export type LaunchState = 'idle' | 'busy' | 'error'

export const useLauncherStore = defineStore('launcher', () => {
  const accounts = useAccountsStore()
  const settings = useSettingsStore()

  const gameInfo = ref<GameInfo | null>(null)
  const isGameRunning = ref(false)
  const launchState = ref<LaunchState>('idle')
  const statusText = ref('')
  const errorMsg = ref('')

  let monitor: number | undefined
  let waitPoll: number | undefined

  // ---------- 路径(settings.gameExe 异步加载完成后自动校验,修复启动时路径不显示) ----------
  watch(
    () => settings.gameExe,
    (exe) => {
      gameInfo.value = null
      errorMsg.value = ''
      if (!exe) return
      invoke<GameInfo>('inspect_game_path', { exe })
        .then((info) => (gameInfo.value = info))
        .catch((err) => (errorMsg.value = `已保存的游戏路径失效:${err instanceof Error ? err.message : String(err)}`))
    },
    { immediate: true },
  )

  async function detect(): Promise<void> {
    errorMsg.value = ''
    statusText.value = '正在探测游戏路径...'
    const found = await invoke<GameInfo | null>('detect_game_path')
    if (found) {
      gameInfo.value = found
      await settings.setGameExe(found.exe)
      statusText.value = ''
    } else {
      statusText.value = '未在默认位置找到原神,请手动选择主程序'
    }
  }

  async function pickExe(): Promise<void> {
    errorMsg.value = ''
    statusText.value = ''
    const picked = await open({
      multiple: false,
      filters: [{ name: '游戏主程序', extensions: ['exe'] }],
    })
    if (typeof picked !== 'string') return
    try {
      gameInfo.value = await invoke<GameInfo>('inspect_game_path', { exe: picked })
      await settings.setGameExe(picked)
    } catch (err) {
      errorMsg.value = err instanceof Error ? err.message : String(err)
    }
  }

  // ---------- 进程监控(应用级,5s;退出时同步清理运行中文案,修复 #4) ----------
  function setupMonitor(): void {
    if (monitor !== undefined || !('__TAURI_INTERNALS__' in window)) return
    void poll()
    monitor = window.setInterval(() => void poll(), 5000)
  }

  async function poll(): Promise<void> {
    try {
      const alive = await invoke<boolean>('is_game_running')
      if (!alive && isGameRunning.value && statusText.value === '游戏运行中') {
        statusText.value = ''
      }
      isGameRunning.value = alive
    } catch {
      // 非致命:保持上次状态,下个周期重试
    }
  }

  // ---------- 启动流程 ----------
  async function launch(): Promise<void> {
    const user = accounts.currentUser
    const role = accounts.currentRole
    errorMsg.value = ''
    statusText.value = ''

    if (!user || !role) {
      errorMsg.value = '请先添加账号并选择角色'
      launchState.value = 'error'
      return
    }
    if (!gameInfo.value) {
      errorMsg.value = '未设置游戏路径'
      launchState.value = 'error'
      return
    }
    if (isGameRunning.value) {
      errorMsg.value = '游戏已在运行中'
      launchState.value = 'error'
      return
    }
    const serverMismatch = user.isOversea !== (gameInfo.value.server === 'os')
    if (serverMismatch) {
      errorMsg.value = `当前账号为${user.isOversea ? '国际服' : '国服'}账号,与游戏客户端不匹配`
      launchState.value = 'error'
      return
    }

    launchState.value = 'busy'
    try {
      let ticket: string | undefined
      if (gameInfo.value.is_bili) {
        statusText.value = 'B 服客户端不支持票据免登,将直接启动...'
      } else {
        statusText.value = '正在获取登录票据...'
        ticket = await createAuthTicket({
          cred: { accountId: user.aid, cookieToken: user.cookieToken, ltoken: user.ltoken, ltuid: user.aid },
          deviceId: settings.deviceId,
          hypDeviceId: settings.hypDeviceId,
          isOversea: user.isOversea,
          mid: user.mid,
          stoken: user.stoken,
          aid: user.aid,
          fingerprint: user.fingerprint,
        })

        // 目标区服方案:国服官服 1/1、国际服 1/0;不一致时备份写回
        const [channel, sub] = user.isOversea ? [1, 0] : [1, 1]
        if (gameInfo.value.channel !== channel || gameInfo.value.sub_channel !== sub) {
          statusText.value = '正在切换区服方案(config.ini)...'
          await invoke('set_game_channels', { exe: gameInfo.value.exe, channel, subChannel: sub })
          gameInfo.value = { ...gameInfo.value, channel, sub_channel: sub }
        }
      }

      statusText.value = '正在启动游戏...'
      await invoke('launch_game', { exe: gameInfo.value.exe, args: buildLaunchArgs(settings.launchOptions, ticket) })

      // UAC 确认 + 进程冷启动较慢:2s 轮询等待进程出现(持续监控由上方 monitor 负责)
      statusText.value = '已发起启动,等待游戏进程(含 UAC 确认)...'
      await new Promise<void>((resolve) => {
        waitPoll = window.setInterval(() => {
          void invoke<boolean>('is_game_running').then((alive) => {
            if (alive) {
              window.clearInterval(waitPoll)
              waitPoll = undefined
              resolve()
            }
          })
        }, 2000)
      })
      isGameRunning.value = true
      statusText.value = '游戏运行中'
    } catch (err) {
      errorMsg.value = err instanceof Error ? err.message : String(err)
      statusText.value = ''
      launchState.value = 'error'
      return
    }
    launchState.value = 'idle'
  }

  return {
    gameInfo,
    isGameRunning,
    launchState,
    statusText,
    errorMsg,
    setupMonitor,
    detect,
    pickExe,
    launch,
  }
})
