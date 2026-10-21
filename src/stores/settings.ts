/**
 * 应用设置:主题 / deviceId,持久化到 Tauri Store(settings.json)
 * 依据: docs/plans/2026_10_20__001__phase1__development_plan.md §3.5
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { load, type Store } from '@tauri-apps/plugin-store'
import { invoke } from '@tauri-apps/api/core'
import { randomDeviceId53 } from '@/api/headers'
import type { LaunchArgOptions } from '@/api/auth-ticket'

export type ThemeMode = 'light' | 'dark' | 'auto'
export type NoteRefreshInterval = 'off' | '30m' | '60m'

const defaultLaunchOptions: LaunchArgOptions = {
  fullscreen: false,
  borderless: false,
  exclusive: false,
  widthEnabled: false,
  width: 1920,
  heightEnabled: false,
  height: 1080,
  monitorEnabled: false,
  monitor: 1,
}

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<ThemeMode>('auto')
  const deviceId = ref('')
  /** HYP 容器扫码/换票用 device_id(53 位),首启生成后固定 */
  const hypDeviceId = ref('')
  /** 便笺自动刷新间隔(默认关闭,仅应用运行期间有效) */
  const noteRefreshInterval = ref<NoteRefreshInterval>('off')
  /** 启动参数开关(默认值对齐 Snap.Hutao:窗口化) */
  const launchOptions = ref<LaunchArgOptions>({ ...defaultLaunchOptions })
  /** 已校验的游戏 exe 路径(空 = 未设置) */
  const gameExe = ref('')
  /** 是否 Windows(启动游戏等功能仅 Windows 可用,默认 true 避免初始化期闪烁) */
  const isWindows = ref(true)
  const isDark = ref(false)
  let store: Store | null = null

  function applyTheme(): void {
    const preferDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    isDark.value = theme.value === 'dark' || (theme.value === 'auto' && preferDark)
    document.documentElement.classList.toggle('dark', isDark.value)
  }

  /** 应用启动时加载;非 Tauri 环境(纯浏览器 dev)回退默认值 */
  async function init(): Promise<void> {
    try {
      store = await load('settings.json', { autoSave: true })
      theme.value = (await store.get<ThemeMode>('theme')) ?? 'auto'
      let id = (await store.get<string>('deviceId')) ?? ''
      if (!id) {
        id = crypto.randomUUID()
        await store.set('deviceId', id)
      }
      deviceId.value = id
      hypDeviceId.value = (await store.get<string>('hypDeviceId')) ?? ''
      if (!hypDeviceId.value) {
        hypDeviceId.value = randomDeviceId53()
        await store.set('hypDeviceId', hypDeviceId.value)
      }
      noteRefreshInterval.value = (await store.get<NoteRefreshInterval>('noteRefreshInterval')) ?? 'off'
      launchOptions.value = { ...defaultLaunchOptions, ...(await store.get<LaunchArgOptions>('launchOptions')) }
      gameExe.value = (await store.get<string>('gameExe')) ?? ''
    } catch {
      store = null
    }
    applyTheme()
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (theme.value === 'auto') applyTheme()
    })
    invoke<boolean>('is_windows')
      .then((value) => (isWindows.value = value))
      .catch(() => {})
  }

  async function setTheme(mode: ThemeMode): Promise<void> {
    theme.value = mode
    applyTheme()
    await store?.set('theme', mode)
  }

  async function setNoteRefreshInterval(mode: NoteRefreshInterval): Promise<void> {
    noteRefreshInterval.value = mode
    await store?.set('noteRefreshInterval', mode)
  }

  async function setLaunchOptions(patch: Partial<LaunchArgOptions>): Promise<void> {
    launchOptions.value = { ...launchOptions.value, ...patch }
    await store?.set('launchOptions', launchOptions.value)
  }

  async function setGameExe(exe: string): Promise<void> {
    gameExe.value = exe
    await store?.set('gameExe', exe)
  }

  return {
    theme,
    deviceId,
    hypDeviceId,
    noteRefreshInterval,
    launchOptions,
    gameExe,
    isWindows,
    isDark,
    init,
    setTheme,
    setNoteRefreshInterval,
    setLaunchOptions,
    setGameExe,
  }
})
