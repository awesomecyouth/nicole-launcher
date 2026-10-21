/**
 * 实时便笺状态:当前角色便笺数据 + 风控态 + 自动刷新定时器
 * 倒计时不在 store 推进:数据存 recoveryTime 秒数与 fetchedAt,由 UI 每分钟重渲染
 * 便笺数据按 uid 持久化到 notes.json:启动即展示本地数据(带更新时间),避免骨架屏跳动
 * 依据: docs/tasks/2026_10_20__005__dailynote__m4_daily_note_tasks.md
 */
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { load as loadStore, type Store } from '@tauri-apps/plugin-store'
import { getDailyNote, type DailyNote, type NoteCaller } from '@/api/dailynote'
import { MiHoYoApiError } from '@/api/http'
import { RETCODE } from '@/api/constants'
import { useAccountsStore } from './accounts'
import { useSettingsStore } from './settings'

export type NoteState = 'idle' | 'loading' | 'ok' | 'risk' | 'error'

interface PersistedNote {
  note: DailyNote
  fetchedAt: number
}

export const useNotesStore = defineStore('notes', () => {
  const state = ref<NoteState>('idle')
  const errorMsg = ref('')
  const note = ref<DailyNote | null>(null)
  /** 数据获取时刻(ms),倒计时本地推进的基准 */
  const fetchedAt = ref(0)

  let lastLoadedUid = ''
  let timer: number | undefined
  let persisted: Store | null = null
  let persistedLoading: Promise<void> | null = null

  /** 惰性初始化本地持久化(notes.json);非 Tauri 环境跳过 */
  function ensurePersisted(): Promise<void> {
    persistedLoading ??= (async () => {
      if (!('__TAURI_INTERNALS__' in window)) return
      try {
        persisted = await loadStore('notes.json', { autoSave: true })
      } catch {
        persisted = null
      }
    })()
    return persistedLoading
  }

  async function readPersisted(uid: string): Promise<PersistedNote | null> {
    await ensurePersisted()
    return (await persisted?.get<PersistedNote>(`note:${uid}`)) ?? null
  }

  function writePersisted(uid: string, data: PersistedNote): void {
    void ensurePersisted().then(() => persisted?.set(`note:${uid}`, data))
  }

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

  /**
   * 拉取便笺:
   *  - 内存已有该角色数据且非强制 → 直接复用(避免每次到首页都刷新);
   *  - 否则先用磁盘持久化数据即时占位(跨启动也生效),关闭「打开时刷新」则止步于此;
   *  - 1034 → 风控态;失败不清空已有数据;手动/定时刷新走 force
   */
  async function load(force = false): Promise<void> {
    const caller = callerFor()
    if (!caller) {
      state.value = 'idle'
      return
    }
    if (!force && caller.role.uid === lastLoadedUid && note.value) return

    if (caller.role.uid !== lastLoadedUid) {
      const saved = await readPersisted(caller.role.uid)
      if (saved) {
        note.value = saved.note
        fetchedAt.value = saved.fetchedAt
        state.value = 'ok'
        lastLoadedUid = caller.role.uid
        if (!useSettingsStore().refreshNoteOnOpen) return
      }
    }

    state.value = 'loading'
    errorMsg.value = ''
    try {
      const fresh = await getDailyNote(caller)
      note.value = fresh
      fetchedAt.value = Date.now()
      state.value = 'ok'
      lastLoadedUid = caller.role.uid
      writePersisted(caller.role.uid, { note: fresh, fetchedAt: fetchedAt.value })
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
      { immediate: true }
    )
  }

  return { state, errorMsg, note, fetchedAt, load, setupAutoRefresh }
})
