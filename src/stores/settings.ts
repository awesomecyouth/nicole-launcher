/**
 * 应用设置:主题 / deviceId,持久化到 Tauri Store(settings.json)
 * 依据: docs/plans/2026_10_20__001__phase1__development_plan.md §3.5
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { load, type Store } from '@tauri-apps/plugin-store'
import { randomDeviceId53 } from '@/api/headers'

export type ThemeMode = 'light' | 'dark' | 'auto'

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<ThemeMode>('auto')
  const deviceId = ref('')
  /** HYP 容器扫码/换票用 device_id(53 位),首启生成后固定 */
  const hypDeviceId = ref('')
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
    } catch {
      store = null
    }
    applyTheme()
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (theme.value === 'auto') applyTheme()
    })
  }

  async function setTheme(mode: ThemeMode): Promise<void> {
    theme.value = mode
    applyTheme()
    await store?.set('theme', mode)
  }

  return { theme, deviceId, hypDeviceId, isDark, init, setTheme }
})
