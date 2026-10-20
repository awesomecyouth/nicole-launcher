/**
 * 实时便笺状态:当前角色便笺数据 + 风控态 + 自动刷新定时器
 * 倒计时不在 store 推进:数据存 recoveryTime 秒数与 fetchedAt,由 UI 每分钟重渲染
 * 依据: docs/tasks/2026_10_20__005__dailynote__m4_daily_note_tasks.md
 */
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { getDailyNote, type DailyNote, type NoteCaller } from '@/api/dailynote'
import { MiHoYoApiError } from '@/api/http'
import { RETCODE } from '@/api/constants'
import { useAccountsStore } from './accounts'
import { useSettingsStore } from './settings'

export type NoteState = 'idle' | 'loading' | 'ok' | 'risk' | 'error'

const CACHE_TTL_MS = 5 * 60 * 1000

export const useNotesStore = defineStore('notes', () => {
  const state = ref<NoteState>('idle')
  const errorMsg = ref('')
  const note = ref<DailyNote | null>(null)
  /** 数据获取时刻(ms),倒计时本地推进的基准 */
  const fetchedAt = ref(0)

  let lastLoadedUid = ''
  let lastLoadedAt = 0
  let timer: number | undefined

  function callerFor(): NoteCaller | null {
    const accounts = useAccountsStore()
    const user = accounts.currentUser
    const role = accounts.currentRole
    if (!user || !role) return null
    return {
      cred: { accountId: user.aid, cookieToken: user.cookieToken, ltoken: user.ltoken, ltuid: user.aid },
      deviceId: useSettingsStore().deviceId,
      isOversea: user.isOversea,
      fingerprint: user.fingerprint,
      role,
    }
  }

  /** 拉取便笺;同角色 5 分钟内不重拉;1034 → 风控态;失败不清空已有数据 */
  async function load(force = false): Promise<void> {
    const caller = callerFor()
    if (!caller) {
      state.value = 'idle'
      return
    }
    if (!force && caller.role.uid === lastLoadedUid && Date.now() - lastLoadedAt < CACHE_TTL_MS) return

    state.value = 'loading'
    errorMsg.value = ''
    try {
      note.value = await getDailyNote(caller)
      fetchedAt.value = Date.now()
      state.value = 'ok'
      lastLoadedUid = caller.role.uid
      lastLoadedAt = Date.now()
    } catch (err) {
      if (err instanceof MiHoYoApiError && err.retcode === RETCODE.RISK_VERIFY) {
        state.value = 'risk'
        return
      }
      state.value = note.value ? 'ok' : 'error'
      errorMsg.value = err instanceof Error ? err.message : String(err)
    }
  }

  /** 按设置项管理自动刷新定时器(仅应用运行期间有效),main.ts 初始化时调用一次 */
  function setupAutoRefresh(): void {
    const settings = useSettingsStore()
    watch(
      () => settings.noteRefreshInterval,
      (mode) => {
        if (timer !== undefined) {
          window.clearInterval(timer)
          timer = undefined
        }
        if (mode !== 'off') {
          const ms = mode === '30m' ? 30 * 60_000 : 60 * 60_000
          timer = window.setInterval(() => void load(true), ms)
        }
      },
      { immediate: true },
    )
  }

  return { state, errorMsg, note, fetchedAt, load, setupAutoRefresh }
})
