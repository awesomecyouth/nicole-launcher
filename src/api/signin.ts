/**
 * 米哈游每日签到接口(国服 luna / 国际服 sol)
 * 依据: docs/plans/2026_10_20__001__phase1__development_plan.md §5.4
 * 行为参考: Snap.Hutao 1.16.5 SignInClient / SignInClientOversea
 * (URL 双格式均有效:/event/luna/info 与 /event/luna/{game}/info,取前者)
 */
import { dsGen1 } from './ds'
import { bbsHeaders, cookieHeader, withDeviceFp, type CookieCredential } from './headers'
import { miHoYoRequest } from './http'
import { genshin } from '@/games/genshin'
import type { UserRole } from '@/stores/accounts'

/** 月历奖励项 */
export interface SignAward {
  icon: string
  name: string
  cnt: number
}

export interface SignHome {
  month: number
  /** 当月天数 */
  bizcnt?: number
  awards: SignAward[]
}

export interface SignInfo {
  totalSignDay: number
  today: string
  isSign: boolean
  signCntMissed: number
}

export interface SignResult {
  success: number
  riskCode: number
  gt?: string
  challenge?: string
}

/** 签到请求上下文:凭据 + 设备标识 + 目标角色 */
export interface SignCaller {
  cred: CookieCredential
  deviceId: string
  isOversea: boolean
  fingerprint?: string
  role: UserRole
}

/** 官方签到页(风控兜底,opener 打开) */
export function officialSignPageUrl(isOversea: boolean): string {
  return isOversea
    ? `https://act.hoyolab.com/ys/event/signin-sea-v3/index.html?act_id=${genshin.signIn.os.actId}`
    : `https://act.mihoyo.com/bbs/event/signin/hk4e/index.html?act_id=${genshin.signIn.cn.actId}`
}

/**
 * 请求头:国服 BBS 预设 + CookieToken + signgame(+ device_fp);
 * 国际服无 x-rpc 公共头(仅 Cookie 与 Accept,与参考实现一致)
 */
function signHeaders(caller: SignCaller, withDs: boolean): Record<string, string> {
  const cookie = { Cookie: cookieHeader(caller.cred, 'CookieToken') }
  if (caller.isOversea) {
    return { Accept: 'application/json', ...cookie }
  }
  let headers = bbsHeaders(caller.deviceId, {
    ...cookie,
    'x-rpc-signgame': 'hk4e',
  })
  if (withDs) headers['DS'] = dsGen1('LK2')
  return withDeviceFp(headers, caller.fingerprint)
}

function host(isOversea: boolean): string {
  return isOversea ? genshin.signIn.os.host : genshin.signIn.cn.host
}

function actId(isOversea: boolean): string {
  return isOversea ? genshin.signIn.os.actId : genshin.signIn.cn.actId
}

/** 月历奖励列表(无需鉴权也可用,但保持与参考实现一致带上 Cookie) */
export async function getSignHome(caller: SignCaller): Promise<SignHome> {
  const raw = await miHoYoRequest<{ month: number; bizcnt?: number; awards: SignAward[] }>({
    method: 'GET',
    url: `${host(caller.isOversea)}/home?lang=zh-cn&act_id=${actId(caller.isOversea)}`,
    headers: signHeaders(caller, false),
  })
  return { month: raw.month, bizcnt: raw.bizcnt, awards: raw.awards ?? [] }
}

/** 签到状态(is_sign / total_sign_day) */
export async function getSignInfo(caller: SignCaller): Promise<SignInfo> {
  const { uid, region } = caller.role
  const raw = await miHoYoRequest<{ total_sign_day: number; today: string; is_sign: boolean; sign_cnt_missed: number }>(
    {
      method: 'GET',
      url: `${host(caller.isOversea)}/info?lang=zh-cn&act_id=${actId(caller.isOversea)}&uid=${uid}&region=${region}`,
      headers: signHeaders(caller, !caller.isOversea),
    }
  )
  return {
    totalSignDay: raw.total_sign_day,
    today: raw.today,
    isSign: raw.is_sign,
    signCntMissed: raw.sign_cnt_missed,
  }
}

/** 执行签到;-3501/-5003 等业务码由 http.ts 抛 MiHoYoApiError;风控返回 gt/challenge */
export async function doSignReward(caller: SignCaller): Promise<SignResult> {
  const os = caller.isOversea
  const raw = await miHoYoRequest<{ success: number; risk_code: number; gt?: string; challenge?: string }>({
    method: 'POST',
    url: os ? `${host(os)}/sign?lang=zh-cn` : `${host(os)}/sign`,
    headers: signHeaders(caller, !os),
    data: { act_id: actId(os), region: caller.role.region, uid: caller.role.uid },
  })
  return { success: raw.success, riskCode: raw.risk_code, gt: raw.gt, challenge: raw.challenge }
}
