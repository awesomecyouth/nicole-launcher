/**
 * 每日签到状态:当前角色的月历 + 签到状态机
 * 已签判定一律以服务端 info.is_sign 为准,不做本地记录(天然幂等)
 * 依据: docs/tasks/2026_10_20__004__signin__m3_daily_signin_tasks.md
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { doSignReward, getSignHome, getSignInfo, type SignAward, type SignCaller, type SignInfo } from '@/api/signin'
import { MiHoYoApiError } from '@/api/http'
import { RETCODE } from '@/api/constants'
import { useAccountsStore, type MihoyoUser, type UserRole } from './accounts'
import { useSettingsStore } from './settings'

export type SignState = 'idle' | 'loading' | 'signed' | 'unsigned' | 'risk' | 'error'

const CACHE_TTL_MS = 5 * 60 * 1000

export const useSignStore = defineStore('sign', () => {
  const state = ref<SignState>('idle')
  const errorMsg = ref('')
  const month = ref(0)
  const awards = ref<SignAward[]>([])
  const info = ref<SignInfo | null>(null)

  let lastLoadedUid = ''
  let lastLoadedAt = 0

  const totalSignDay = computed(() => info.value?.totalSignDay ?? 0)

  /** 从账号仓库组装签到上下文 */
  function callerFor(user: MihoyoUser, role: UserRole): SignCaller {
    return {
      cred: { accountId: user.aid, cookieToken: user.cookieToken },
      deviceId: useSettingsStore().deviceId,
      isOversea: user.isOversea,
      fingerprint: user.fingerprint,
      role,
    }
  }

  /** 拉取月历与签到状态;同角色 5 分钟内不重复请求(TODO @cache 后续可改为失效标记) */
  async function load(force = false): Promise<void> {
    const accounts = useAccountsStore()
    const user = accounts.currentUser
    const role = accounts.currentRole
    if (!user || !role) {
      state.value = 'idle'
      return
    }
    if (!force && role.uid === lastLoadedUid && Date.now() - lastLoadedAt < CACHE_TTL_MS) return

    state.value = 'loading'
    errorMsg.value = ''
    try {
      const caller = callerFor(user, role)
      const [home, signInfo] = await Promise.all([getSignHome(caller), getSignInfo(caller)])
      month.value = home.month
      awards.value = home.awards
      info.value = signInfo
      state.value = signInfo.isSign ? 'signed' : 'unsigned'
      lastLoadedUid = role.uid
      lastLoadedAt = Date.now()
    } catch (err) {
      state.value = 'error'
      errorMsg.value = err instanceof Error ? err.message : String(err)
    }
  }

  /** 一键签到:已签(-5003)优雅处理;风控(gt/challenge)进入 risk 态;成功后强制重拉 */
  async function sign(): Promise<void> {
    const accounts = useAccountsStore()
    const user = accounts.currentUser
    const role = accounts.currentRole
    if (!user || !role) return
    if (state.value === 'signed') return

    state.value = 'loading'
    errorMsg.value = ''
    try {
      const result = await doSignReward(callerFor(user, role))
      if (result.gt || result.challenge) {
        state.value = 'risk'
        return
      }
      if (result.success !== 1) {
        state.value = 'error'
        errorMsg.value = `签到未成功(risk_code=${result.riskCode})`
        return
      }
      await load(true)
    } catch (err) {
      if (err instanceof MiHoYoApiError && err.retcode === RETCODE.ALREADY_SIGNED) {
        await load(true)
        return
      }
      state.value = 'error'
      errorMsg.value = err instanceof Error ? err.message : String(err)
    }
  }

  function reset(): void {
    state.value = 'idle'
    info.value = null
    awards.value = []
    month.value = 0
    lastLoadedUid = ''
    lastLoadedAt = 0
  }

  return { state, errorMsg, month, awards, info, totalSignDay, load, sign, reset }
})
