/**
 * 账号仓库:米游社账号列表与当前账号/角色状态,持久化到 users.json
 * 模型依据: docs/plans/2026_10_20__001__phase1__development_plan.md §3.5
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { load, type Store } from '@tauri-apps/plugin-store'

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
    removeUser,
    setCurrent,
    setPreferredUid,
  }
})
