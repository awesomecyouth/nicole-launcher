/**
 * 实时便笺状态(多角色):按 uid 维护数据/状态,磁盘持久化(notes.json)
 * 倒计时不在 store 推进:数据存 recoveryTime 秒数与 fetchedAt,由 UI 每分钟重渲染
 * 依据: docs/tasks/2026_10_21__001__ux__dashboard_restructure_tasks.md D-T2
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { load as loadStore, type Store } from '@tauri-apps/plugin-store'
import { getDailyNote, type DailyNote, type NoteCaller } from '@/api/dailynote'
import { MiHoYoApiError } from '@/api/http'
import { RETCODE } from '@/api/constants'
import { useAccountsStore } from './accounts'
import { useSettingsStore } from './settings'

export type NoteState = 'idle' | 'loading' | 'ok' | 'risk' | 'error'

interface NoteEntry {
  note: DailyNote
  fetchedAt: number
}

/** 串行批量刷新的间隔(ms),防多角色并行拉取放大 1034 风控 */
const SERIAL_REFRESH_GAP_MS = 1500

export const useNotesStore = defineStore('notes', () => {
  /** uid → 便笺数据(含获取时刻) */
  const entries = ref<Record<string, NoteEntry>>({})
  /** uid → 请求状态/错误信息 */
  const states = ref<Record<string, NoteState>>({})
  const errors = ref<Record<string, string>>({})

  let timer: number | undefined
  let persisted: Store | null = null
  let persistedLoading: Promise<void> | null = null

  /** 当前角色视图(NoteCard 等单角色消费方的兼容接口) */
  const currentUid = computed(() => useAccountsStore().currentRole?.uid ?? '')
  const note = computed<DailyNote | null>(() => entries.value[currentUid.value]?.note ?? null)
  const fetchedAt = computed(() => entries.value[currentUid.value]?.fetchedAt ?? 0)
  const state = computed<NoteState>(() => states.value[currentUid.value] ?? 'idle')
  const errorMsg = computed(() => errors.value[currentUid.value] ?? '')

  function entryOf(uid: string): NoteEntry | null {
    return entries.value[uid] ?? null
  }

  function stateOf(uid: string): NoteState {
    return states.value[uid] ?? 'idle'
  }

  function errorOf(uid: string): string {
    return errors.value[uid] ?? ''
  }

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

  async function readPersisted(uid: string): Promise<NoteEntry | null> {
    await ensurePersisted()
    return (await persisted?.get<NoteEntry>(`note:${uid}`)) ?? null
  }

  function writePersisted(uid: string, data: NoteEntry): void {
    void ensurePersisted().then(() => persisted?.set(`note:${uid}`, data))
  }

  /** uid → 请求上下文(在全部账号中查找该角色归属) */
  function callerForUid(uid: string): NoteCaller | null {
    const accounts = useAccountsStore()
    for (const user of accounts.users) {
      const role = user.roles.find((r) => r.uid === uid)
      if (role) {
        return {
          cred: { accountId: user.aid, cookieToken: user.cookieToken, ltoken: user.ltoken, ltuid: user.aid },
          deviceId: useSettingsStore().deviceId,
          isOversea: user.isOversea,
          fingerprint: user.fingerprint,
          role,
        }
      }
    }
    return null
  }

  /**
   * 拉取指定角色的便笺:
   *  - 已有该角色数据且非强制 → 直接复用;
   *  - 否则先用磁盘持久化数据即时占位,关闭「打开时刷新」则止步于此;
   *  - 1034 → 风控态;失败不清空已有数据
   */
  async function loadUid(uid: string, force = false): Promise<void> {
    if (!uid) return
    if (!force && entries.value[uid]) return

    if (!entries.value[uid]) {
      const saved = await readPersisted(uid)
      if (saved) {
        entries.value[uid] = saved
        states.value[uid] = 'ok'
        if (!useSettingsStore().refreshNoteOnOpen) return
      }
    }

    const caller = callerForUid(uid)
    if (!caller) {
      states.value[uid] = 'idle'
      return
    }

    states.value[uid] = 'loading'
    errors.value[uid] = ''
    try {
      const fresh = await getDailyNote(caller)
      entries.value[uid] = { note: fresh, fetchedAt: Date.now() }
      states.value[uid] = 'ok'
      writePersisted(uid, entries.value[uid])
    } catch (err) {
      if (err instanceof MiHoYoApiError && err.retcode === RETCODE.RISK_VERIFY) {
        states.value[uid] = 'risk'
        return
      }
      states.value[uid] = entries.value[uid] ? 'ok' : 'error'
      errors.value[uid] = err instanceof Error ? err.message : String(err)
    }
  }

  /** 当前角色加载(单角色消费方兼容入口) */
  async function load(force = false): Promise<void> {
    await loadUid(currentUid.value, force)
  }

  /** 串行批量刷新(一键刷新;间隔防风控) */
  async function refreshSerially(uids: string[]): Promise<void> {
    for (const uid of uids) {
      await loadUid(uid, true)
      await new Promise((r) => setTimeout(r, SERIAL_REFRESH_GAP_MS))
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

  return {
    entries,
    states,
    errors,
    note,
    fetchedAt,
    state,
    errorMsg,
    entryOf,
    stateOf,
    errorOf,
    load,
    loadUid,
    refreshSerially,
    setupAutoRefresh,
  }
})
