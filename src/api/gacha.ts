/**
 * 米哈游祈愿记录(gacha log)获取
 * 依据: docs/plans/2026_10_22__001__gacha__phase2_gacha_plan.md §2
 * 行为参考: Snap.Hutao 1.16.5 BindingClient2.GenerateAuthenticationKeyAsync(Gen1/LK2)
 *   与 GachaInfoClient(GachaLogQuerySTokenProvider/GachaLogTypedQueryOptions)
 * 注意:SToken 换取 authkey 仅国服(Snap 同);每次刷新现取,免维护有效期
 */
import { dsGen1 } from './ds'
import { cookieHeader, type CookieCredential } from './headers'
import { miHoYoRequest } from './http'

const CN_GEN_AUTH_KEY = 'https://api-takumi.mihoyo.com/binding/api/genAuthKey'
const CN_GACHA_LOG = 'https://public-operation-hk4e.mihoyo.com/gacha_info/api/getGachaLog'

/** 卡池类型:100 新手 / 200 常驻 / 301 角色 / 302 武器 / 400 集录 / 500 城市 */
export const GACHA_TYPES = [100, 200, 301, 302, 400, 500] as const
export type GachaType = (typeof GACHA_TYPES)[number]

/** 单条祈愿记录 */
export interface GachaItem {
  /** 全局唯一且单调,排序与去重键 */
  id: string
  gachaType: number
  itemId: string
  name: string
  /** 角色或武器 */
  itemType: string
  rankType: number
  /** YYYY-MM-DD HH:mm:ss */
  time: string
}

/** 请求上下文 */
export interface GachaCaller {
  cred: CookieCredential
  /** 游戏内角色 uid */
  uid: string
  region: string
  isOversea: boolean
}

interface AuthKey {
  authkey: string
  authkey_ver: number
  sign_type: number
}

/** stoken → authkey(仅国服;Gen1/LK2 签名) */
async function genAuthKey(caller: GachaCaller): Promise<AuthKey> {
  return await miHoYoRequest<AuthKey>({
    method: 'POST',
    url: CN_GEN_AUTH_KEY,
    headers: {
      Cookie: cookieHeader(caller.cred, 'SToken'),
      DS: dsGen1('LK2'),
    },
    data: {
      auth_appid: 'webview_gacha',
      game_biz: 'hk4e_cn',
      game_uid: Number(caller.uid),
      region: caller.region,
    },
  })
}

interface RawItem {
  uid: string
  gacha_type: string
  item_id: string
  count?: string
  time: string
  name: string
  lang?: string
  item_type: string
  rank_type: string
  id: string
}

function toItem(raw: RawItem): GachaItem {
  return {
    id: raw.id,
    gachaType: Number(raw.gacha_type),
    itemId: raw.item_id,
    name: raw.name,
    itemType: raw.item_type,
    rankType: Number(raw.rank_type),
    time: raw.time,
  }
}

/** 拉取单页(size=20;end_id 为上一页最旧记录 id,向更旧翻页;返回按新→旧) */
async function fetchPage(authKey: AuthKey, gachaType: number, endId: string): Promise<GachaItem[]> {
  const query =
    `lang=zh-cn&auth_appid=webview_gacha&authkey=${encodeURIComponent(authKey.authkey)}` +
    `&authkey_ver=${authKey.authkey_ver}&sign_type=${authKey.sign_type}` +
    `&gacha_type=${gachaType}&size=20&end_id=${endId}`
  const raw = await miHoYoRequest<{ list: RawItem[] }>({
    method: 'GET',
    url: `${CN_GACHA_LOG}?${query}`,
  })
  return (raw.list ?? []).map(toItem)
}

const PAGE_GAP_MS = 300

/**
 * 全量/增量拉取一个角色的祈愿记录(逐池翻页):
 * 从最新页向旧翻,遇 stopAtId(本地最新记录 id,增量模式)即止;
 * 页间 300ms 限速;任一页失败时重取一次 authkey 再试(防过期)。
 * 返回新→旧顺序的记录。
 */
export async function fetchGachaItems(
  caller: GachaCaller,
  stopAtId = '0',
  onProgress?: (loaded: number, gachaType: number) => void
): Promise<GachaItem[]> {
  if (caller.isOversea) {
    throw new Error('国际服暂不支持直接获取祈愿记录(缺 OSLK2 盐),可使用 UIGF 导入(后续增强)')
  }

  const collected: GachaItem[] = []
  for (const gachaType of GACHA_TYPES) {
    let authKey = await genAuthKey(caller)
    let endId = '0'
    for (;;) {
      let page: GachaItem[]
      try {
        page = await fetchPage(authKey, gachaType, endId)
      } catch (err) {
        // authkey 失效等情况:重取一次再试(仍失败则抛出,已收集数据由调用方保留)
        authKey = await genAuthKey(caller)
        page = await fetchPage(authKey, gachaType, endId)
        void err
      }
      if (page.length === 0) break

      // 增量:本页含已有记录则只取新部分并止步
      const hitIndex = page.findIndex((item) => item.id <= stopAtId)
      if (hitIndex >= 0) {
        collected.push(...page.slice(0, hitIndex))
        break
      }
      collected.push(...page)

      if (page.length < 20) break
      endId = page[page.length - 1].id
      onProgress?.(collected.length, gachaType)
      await new Promise((r) => setTimeout(r, PAGE_GAP_MS))
    }
    onProgress?.(collected.length, gachaType)
    await new Promise((r) => setTimeout(r, PAGE_GAP_MS))
  }
  return collected
}
