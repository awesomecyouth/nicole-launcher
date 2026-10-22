/**
 * 祈愿记录仓库:按 uid 维护记录(id 升序)、增量合并、磁盘持久化(gacha:{uid})
 * 依据: docs/plans/2026_10_22__001__gacha__phase2_gacha_plan.md §2.3/§5
 * 页面仅展示当前账号的角色记录(用户要求:随全局账号切换,不混排多账号)
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { load as loadStore, type Store } from '@tauri-apps/plugin-store'
import { fetchGachaItems, type GachaCaller, type GachaItem } from '@/api/gacha'
import { logLine } from '@/api/logger'
import { useAccountsStore } from './accounts'

interface GachaEntry {
  items: GachaItem[]
  updatedAt: number
}

/** 刷新间隔(ms),防多角色连续全量拉取触发风控 */
const ROLE_REFRESH_GAP_MS = 1000

export const useGachaStore = defineStore('gacha', () => {
  /** uid → 祈愿数据(items 按 id 升序) */
  const entries = ref<Record<string, GachaEntry>>({})
  /** uid → 请求状态(risk 未用,保留 error/ok/loading) */
  const states = ref<Record<string, 'idle' | 'loading' | 'ok' | 'error'>>({})
  const errors = ref<Record<string, string>>({})
  const progresses = ref<Record<string, number>>({})

  let persisted: Store | null = null
  let persistedLoading: Promise<void> | null = null

  function ensurePersisted(): Promise<void> {
    persistedLoading ??= (async () => {
      if (!('__TAURI_INTERNALS__' in window)) return
      try {
        persisted = await loadStore('gacha.json', { autoSave: true })
      } catch {
        persisted = null
      }
    })()
    return persistedLoading
  }

  function entryOf(uid: string): GachaEntry | null {
    return entries.value[uid] ?? null
  }

  /** 从磁盘恢复(展示本地数据,不发请求) */
  async function hydrate(uid: string): Promise<void> {
    if (entries.value[uid]) return
    await ensurePersisted()
    const saved = (await persisted?.get<GachaEntry>(`gacha:${uid}`)) ?? null
    if (saved) {
      entries.value[uid] = saved
      states.value[uid] = 'ok'
    }
  }

  /** uid → 请求上下文(全部账号中查找角色归属) */
  function callerForUid(uid: string): GachaCaller | null {
    const accounts = useAccountsStore()
    for (const user of accounts.users) {
      const role = user.roles.find((r) => r.uid === uid)
      if (role) {
        return {
          cred: { stuid: user.aid, stoken: user.stoken, mid: user.mid },
          uid: role.uid,
          region: role.region,
          isOversea: user.isOversea,
        }
      }
    }
    return null
  }

  /**
   * 增量刷新一个角色:本地已有数据作为 stopAt 断点,新记录合并去重后按 id 升序存储
   */
  async function refreshUid(uid: string): Promise<void> {
    const caller = callerForUid(uid)
    if (!caller) {
      states.value[uid] = 'idle'
      return
    }
    await hydrate(uid)

    states.value[uid] = 'loading'
    errors.value[uid] = ''
    progresses.value[uid] = 0
    try {
      const localItems = entries.value[uid]?.items
      const stopAt = (localItems && localItems.length > 0 ? localItems[localItems.length - 1].id : '0') ?? '0'
      const fresh = await fetchGachaItems(caller, stopAt, (loaded) => {
        progresses.value[uid] = loaded
      })
      if (fresh.length > 0) {
        const merged = [...(entries.value[uid]?.items ?? []), ...fresh]
        // id 升序去重(id 超长,BigInt 比较)
        const seen = new Set<string>()
        const items = merged
          .filter((item) => (seen.has(item.id) ? false : seen.add(item.id)))
          .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
        entries.value[uid] = { items, updatedAt: Date.now() }
      } else if (entries.value[uid]) {
        entries.value[uid] = { ...entries.value[uid], updatedAt: Date.now() }
      }
      states.value[uid] = 'ok'
      const entry = entries.value[uid]
      if (entry) {
        void ensurePersisted().then(() => persisted?.set(`gacha:${uid}`, entry))
      }
    } catch (err) {
      states.value[uid] = entries.value[uid] ? 'ok' : 'error'
      errors.value[uid] = err instanceof Error ? err.message : String(err)
      logLine(`gacha refresh ${uid} failed: ${errors.value[uid]}`)
    } finally {
      delete progresses.value[uid]
    }
  }

  /** 刷新当前账号全部角色(串行 + 间隔) */
  async function refreshCurrentAccount(): Promise<void> {
    const accounts = useAccountsStore()
    const user = accounts.currentUser
    if (!user) return
    for (const role of user.roles) {
      await refreshUid(role.uid)
      await new Promise((r) => setTimeout(r, ROLE_REFRESH_GAP_MS))
    }
  }

  /** 清空指定角色记录(内存 + 磁盘) */
  async function clearUid(uid: string): Promise<void> {
    delete entries.value[uid]
    states.value[uid] = 'idle'
    await ensurePersisted()
    await persisted?.delete(`gacha:${uid}`)
  }

  /**
   * 导入 UIGF 条目:仅接受**当前账号**角色的 uid(其他账号的记录本页不可见,导入会造成
   * "提示成功却看不到记录"的困惑;未知 uid 同理),与本地记录按 id 去重合并后持久化。
   */
  async function importEntries(
    items: {
      uid: string
      items: GachaItem[]
    }[]
  ): Promise<{ imported: { uid: string; added: number }[]; skipped: string[] }> {
    const accounts = useAccountsStore()
    const knownUids = new Set(accounts.currentUser?.roles.map((r) => r.uid) ?? [])

    const imported: { uid: string; added: number }[] = []
    const skipped: string[] = []
    for (const entry of items) {
      if (!knownUids.has(entry.uid)) {
        skipped.push(entry.uid)
        continue
      }
      const local = entries.value[entry.uid]?.items ?? []
      const before = local.length
      const seen = new Set(local.map((i) => i.id))
      const merged = [...local, ...entry.items.filter((i) => !seen.has(i.id))]
      merged.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
      entries.value[entry.uid] = { items: merged, updatedAt: Date.now() }
      states.value[entry.uid] = 'ok'
      errors.value[entry.uid] = ''
      await ensurePersisted()
      await persisted?.set(`gacha:${entry.uid}`, entries.value[entry.uid]!)
      imported.push({ uid: entry.uid, added: merged.length - before })
    }
    return { imported, skipped }
  }

  /** 当前账号全部角色 uid(页面随全局切换消费) */
  const currentAccountUids = computed(() => useAccountsStore().currentUser?.roles.map((r) => r.uid) ?? [])

  return {
    entries,
    states,
    errors,
    progresses,
    currentAccountUids,
    entryOf,
    hydrate,
    refreshUid,
    refreshCurrentAccount,
    importEntries,
    clearUid,
  }
})
