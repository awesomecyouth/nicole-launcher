/**
 * 每日签到状态(多角色):按 uid 维护签到信息;月历奖励(awards)全局缓存一次
 * 已签判定一律以服务端 info.is_sign 为准,不做本地记录(天然幂等)
 * 依据: docs/tasks/2026_10_21__001__ux__dashboard_restructure_tasks.md、用户反馈 #5
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { emit, listen } from '@tauri-apps/api/event'
import { doSignReward, getSignHome, getSignInfo, type SignAward, type SignCaller, type SignInfo } from '@/api/signin'
import { MiHoYoApiError } from '@/api/http'
import { RETCODE } from '@/api/constants'
import { useAccountsStore } from './accounts'
import { useSettingsStore } from './settings'

export type SignState = 'idle' | 'loading' | 'signed' | 'unsigned' | 'risk' | 'error'

/** 同角色缓存有效期:期间进入页面不重复请求 */
const CACHE_TTL_MS = 5 * 60 * 1000

/** 子窗口数据载荷(跨窗口事件桥:子窗口不自行发请求,规避多 webview 资源表问题) */
export interface SignWindowPayload {
  uid: string
  info: SignInfo | null
  state: SignState
  errorMsg: string
  awards: SignAward[]
  month: number
  role: { nickname: string; regionName: string; isOversea: boolean } | null
}

export const useSignStore = defineStore('sign', () => {
  /** uid → 签到信息/状态 */
  const infos = ref<Record<string, SignInfo>>({})
  const states = ref<Record<string, SignState>>({})
  const errors = ref<Record<string, string>>({})

  /** 月历奖励(与角色无关,全局拉取一次) */
  const awards = ref<SignAward[]>([])
  const month = ref(0)
  let awardsLoaded = false

  const loadedAt: Record<string, number> = {}

  function infoOf(uid: string): SignInfo | null {
    return infos.value[uid] ?? null
  }

  function stateOf(uid: string): SignState {
    return states.value[uid] ?? 'idle'
  }

  function errorOf(uid: string): string {
    return errors.value[uid] ?? ''
  }

  /** uid → 请求上下文(在全部账号中查找该角色归属) */
  function callerForUid(uid: string): SignCaller | null {
    const accounts = useAccountsStore()
    for (const user of accounts.users) {
      const role = user.roles.find((r) => r.uid === uid)
      if (role) {
        return {
          cred: { accountId: user.aid, cookieToken: user.cookieToken },
          deviceId: useSettingsStore().deviceId,
          isOversea: user.isOversea,
          fingerprint: user.fingerprint,
          role,
        }
      }
    }
    return null
  }

  async function ensureAwards(caller: SignCaller): Promise<void> {
    if (awardsLoaded) return
    const home = await getSignHome(caller)
    month.value = home.month
    awards.value = home.awards
    awardsLoaded = true
  }

  /** 拉取指定角色的签到信息(含月历);同角色 5 分钟内不重拉 */
  async function loadUid(uid: string, force = false): Promise<void> {
    if (!uid) return
    if (!force && infos.value[uid] && Date.now() - (loadedAt[uid] ?? 0) < CACHE_TTL_MS) return

    const caller = callerForUid(uid)
    if (!caller) {
      states.value[uid] = 'idle'
      return
    }

    states.value[uid] = 'loading'
    errors.value[uid] = ''
    try {
      await ensureAwards(caller)
      const info = await getSignInfo(caller)
      infos.value[uid] = info
      states.value[uid] = info.isSign ? 'signed' : 'unsigned'
      loadedAt[uid] = Date.now()
    } catch (err) {
      states.value[uid] = 'error'
      errors.value[uid] = err instanceof Error ? err.message : String(err)
    }
  }

  /** 指定角色一键签到:已签(-5003)优雅处理;风控(gt/challenge)进入 risk 态;成功后强制重拉 */
  async function signUid(uid: string): Promise<void> {
    const caller = callerForUid(uid)
    if (!caller) return
    if (states.value[uid] === 'signed') return

    states.value[uid] = 'loading'
    errors.value[uid] = ''
    try {
      // 成功判定与参考实现一致:retcode==0(未抛错)即已签;data.success 不可靠
      const result = await doSignReward(caller)
      if (result.gt || result.challenge) {
        states.value[uid] = 'risk'
        return
      }
      await loadUid(uid, true)
    } catch (err) {
      if (err instanceof MiHoYoApiError && err.retcode === RETCODE.ALREADY_SIGNED) {
        await loadUid(uid, true)
        return
      }
      states.value[uid] = 'error'
      errors.value[uid] = err instanceof Error ? err.message : String(err)
    }
  }

  /** 子窗口数据载荷组装 */
  function payloadOf(uid: string): SignWindowPayload {
    const accounts = useAccountsStore()
    let role: SignWindowPayload['role'] = null
    for (const user of accounts.users) {
      const found = user.roles.find((r) => r.uid === uid)
      if (found) role = { nickname: found.nickname, regionName: found.regionName, isOversea: user.isOversea }
    }
    return {
      uid,
      info: infoOf(uid),
      state: stateOf(uid),
      errorMsg: errorOf(uid),
      awards: awards.value,
      month: month.value,
      role,
    }
  }

  /**
   * 跨窗口事件桥(仅主窗口调用,main.ts):子窗口 sign:req/sign:act →
   * 主窗口执行网络请求/签到 → 广播 sign:data。子窗口因此完全无网络。
   */
  function setupBridge(): void {
    void listen<{ uid: string }>('sign:req', async (event) => {
      const uid = event.payload?.uid
      if (!uid) return
      await loadUid(uid)
      void emit('sign:data', payloadOf(uid))
    })
    void listen<{ uid: string }>('sign:act', async (event) => {
      const uid = event.payload?.uid
      if (!uid) return
      await signUid(uid)
      void emit('sign:data', payloadOf(uid))
    })
  }

  return { awards, month, infos, states, errors, infoOf, stateOf, errorOf, loadUid, signUid, setupBridge }
})
