/**
 * 账号仓库:米游社账号列表与当前账号/角色状态,持久化到 users.json
 * 模型依据: docs/plans/2026_10_20__001__phase1__development_plan.md §3.5
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { load, type Store } from '@tauri-apps/plugin-store'
import { getCookieTokenBySToken, getLTokenBySToken } from '@/api/passport'
import { getDeviceFp, getUserFullInfo, getUserGameRoles } from '@/api/binding'
import { genshin } from '@/games/genshin'
import { useSettingsStore } from './settings'

/** 绑定的游戏角色 */
export interface UserRole {
  gameBiz: string
  region: string
  uid: string
  nickname: string
  level: number
  isChosen: boolean
  regionName: string
}

/** 米游社账号(stoken 为根凭据,其余为派生) */
export interface MihoyoUser {
  /** 内部 uuid */
  id: string
  aid: string
  mid: string
  isOversea: boolean
  stoken: string
  ltoken: string
  cookieToken: string
  cookieTokenUpdatedAt: number
  fingerprint?: string
  fpUpdatedAt?: number
  preferredUid?: string
  nickname?: string
  avatarUrl?: string
  roles: UserRole[]
}

/** 根凭据(扫码确认或 Cookie 解析所得) */
export interface RawCredential {
  stuid: string
  stoken: string
  mid: string
}

const DAY_MS = 24 * 3600 * 1000
const FP_STALE_MS = 7 * DAY_MS

export const useAccountsStore = defineStore('accounts', () => {
  const users = ref<MihoyoUser[]>([])
  const currentUserId = ref('')
  let store: Store | null = null

  const currentUser = computed<MihoyoUser | null>(() => users.value.find((u) => u.id === currentUserId.value) ?? null)

  /** 当前操作角色:优先 preferredUid,否则第一个角色 */
  const currentRole = computed<UserRole | null>(() => {
    const u = currentUser.value
    if (!u || u.roles.length === 0) return null
    return u.roles.find((r) => r.uid === u.preferredUid) ?? u.roles[0]
  })

  /** 应用启动时加载;非 Tauri 环境(纯浏览器 dev)保持空列表 */
  async function init(): Promise<void> {
    try {
      store = await load('users.json', { autoSave: true })
      users.value = (await store.get<MihoyoUser[]>('users')) ?? []
      currentUserId.value = (await store.get<string>('currentUserId')) ?? ''
      if (!currentUserId.value && users.value.length > 0) {
        await setCurrent(users.value[0].id)
      }
    } catch {
      store = null
    }
    refreshStale().catch((err) => console.error('stale credential refresh failed:', err))
  }

  /**
   * 统一入库初始化(扫码确认 / Cookie 粘贴共用):
   * 派生 token → 用户信息(失败不入库)→ 角色列表(空/失败仍入库)→(国服)device_fp(失败容忍)
   */
  async function addUserWithInit(cred: RawCredential, isOversea: boolean): Promise<MihoyoUser> {
    const settings = useSettingsStore()

    /** 各步骤失败时补上步骤标签,避免上层误报错误来源 */
    async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
      try {
        return await fn()
      } catch (err) {
        throw new Error(`${name}:${err instanceof Error ? err.message : String(err)}`)
      }
    }

    const [ltoken, cookie] = await step('派生登录凭据失败', () =>
      Promise.all([getLTokenBySToken(cred, isOversea), getCookieTokenBySToken(cred, isOversea)])
    )
    const fullCred = { ...cred, ltoken, ltuid: cred.stuid }
    const info = await step('获取用户信息失败', () => getUserFullInfo(fullCred, settings.deviceId, isOversea))

    let roles: UserRole[] = []
    try {
      roles = await getUserGameRoles(fullCred, isOversea ? genshin.biz.os : genshin.biz.cn, isOversea)
    } catch (err) {
      console.error('role list fetch failed:', err)
    }

    const now = Date.now()
    const user: Omit<MihoyoUser, 'id'> = {
      aid: cred.stuid,
      mid: cred.mid,
      isOversea,
      stoken: cred.stoken,
      ltoken,
      cookieToken: cookie.cookieToken,
      cookieTokenUpdatedAt: now,
      nickname: info.nickname,
      avatarUrl: info.avatarUrl,
      roles,
    }
    if (!isOversea) {
      try {
        user.fingerprint = await getDeviceFp(settings.deviceId)
        user.fpUpdatedAt = now
      } catch (err) {
        console.error('device fp fetch failed:', err)
      }
    }
    return upsertUser(user)
  }

  /** 手动刷新:重派生 ltoken/cookie_token,顺带处理过期的 device_fp */
  async function refreshUser(userId: string): Promise<void> {
    const user = users.value.find((u) => u.id === userId)
    if (!user) return
    const settings = useSettingsStore()
    const cred: RawCredential = { stuid: user.aid, stoken: user.stoken, mid: user.mid }
    const [ltoken, cookie] = await Promise.all([
      getLTokenBySToken(cred, user.isOversea),
      getCookieTokenBySToken(cred, user.isOversea),
    ])
    user.ltoken = ltoken
    user.cookieToken = cookie.cookieToken
    user.cookieTokenUpdatedAt = Date.now()
    if (!user.isOversea && (!user.fingerprint || Date.now() - (user.fpUpdatedAt ?? 0) > FP_STALE_MS)) {
      try {
        user.fingerprint = await getDeviceFp(settings.deviceId, user.fingerprint)
        user.fpUpdatedAt = Date.now()
      } catch (err) {
        console.error('device fp refresh failed:', err)
      }
    }
    await persist()
  }

  /** 启动惰性刷新:cookie_token 超过 1 天(或缺失)的账号自动重派生 */
  async function refreshStale(): Promise<void> {
    for (const user of users.value) {
      if (!user.cookieToken || Date.now() - user.cookieTokenUpdatedAt > DAY_MS) {
        await refreshUser(user.id).catch((err) => console.error(`refresh ${user.aid} failed:`, err))
      }
    }
  }

  async function persist(): Promise<void> {
    await store?.set('users', users.value)
    await store?.set('currentUserId', currentUserId.value)
  }

  /** 按 mid 去重写入:已存在则合并更新(保留 id/preferredUid),否则新增 */
  function upsertUser(user: Omit<MihoyoUser, 'id'>): MihoyoUser {
    const idx = users.value.findIndex((u) => u.mid === user.mid)
    if (idx >= 0) {
      const merged: MihoyoUser = { ...users.value[idx], ...user, id: users.value[idx].id }
      users.value[idx] = merged
      void persist()
      return merged
    }
    const created: MihoyoUser = { ...user, id: crypto.randomUUID() }
    users.value.push(created)
    if (users.value.length === 1) void setCurrent(created.id)
    else void persist()
    return created
  }

  async function removeUser(id: string): Promise<void> {
    users.value = users.value.filter((u) => u.id !== id)
    if (currentUserId.value === id) {
      currentUserId.value = users.value[0]?.id ?? ''
    }
    await persist()
  }

  async function setCurrent(id: string): Promise<void> {
    currentUserId.value = id
    await persist()
  }

  async function setPreferredUid(uid: string): Promise<void> {
    const u = currentUser.value
    if (!u) return
    u.preferredUid = uid
    await persist()
  }

  return {
    users,
    currentUserId,
    currentUser,
    currentRole,
    init,
    upsertUser,
    addUserWithInit,
    refreshUser,
    removeUser,
    setCurrent,
    setPreferredUid,
  }
})
