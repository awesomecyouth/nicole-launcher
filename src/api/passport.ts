/**
 * 米哈游 passport 接口:扫码登录(国服)与 token 派生(双服)
 * 依据: docs/plans/2026_10_20__001__phase1__development_plan.md §5.2/§6.3
 * 行为参考: Snap.Hutao 1.16.5 HoyoPlayPassportClient / PassportClient(XRpc5/XRpc2)
 */
import { dsGen2 } from './ds'
import { cookieHeader, hypHeaders, type CookieCredential } from './headers'
import { miHoYoRequest } from './http'

const CN_PASSPORT = 'https://passport-api.mihoyo.com'
const OS_ACCOUNT = 'https://api-account-os.hoyoverse.com'

/** SToken cookie + DS Gen2/PROD 签名头(国服 token 派生用,GET 无 query) */
function stokenHeaders(cred: CookieCredential): Record<string, string> {
  return {
    Cookie: cookieHeader(cred, 'SToken'),
    DS: dsGen2('PROD', '', ''),
  }
}

export interface QrLogin {
  /** 二维码内容(米游社 App 扫描) */
  url: string
  ticket: string
}

/** 扫码状态(token_type==1 的 token 即 stoken v2) */
export interface QrLoginStatus {
  status: string
  tokens?: { tokenType: number; token: string }[]
  userInfo?: { aid: string; mid: string }
}

/** 创建扫码登录二维码(仅国服,HYP 头,无 DS) */
export function createQrLogin(hypDeviceId: string): Promise<QrLogin> {
  return miHoYoRequest<QrLogin>({
    method: 'POST',
    url: `${CN_PASSPORT}/account/ma-cn-passport/app/createQRLogin`,
    headers: hypHeaders(false, hypDeviceId),
    data: {},
  })
}

/** 轮询扫码状态;retcode -3501 表示已过期,需重建二维码 */
export async function queryQrLoginStatus(hypDeviceId: string, ticket: string): Promise<QrLoginStatus> {
  const raw = await miHoYoRequest<{ status: string; tokens?: { token_type: number; token: string }[]; user_info?: { aid: string; mid: string } }>({
    method: 'POST',
    url: `${CN_PASSPORT}/account/ma-cn-passport/app/queryQRLoginStatus`,
    headers: hypHeaders(false, hypDeviceId),
    data: { ticket },
  })
  return {
    status: raw.status,
    tokens: raw.tokens?.map((t) => ({ tokenType: t.token_type, token: t.token })),
    userInfo: raw.user_info ? { aid: raw.user_info.aid, mid: raw.user_info.mid } : undefined,
  }
}

/** stoken → cookie_token(国 GET + DS;国际 POST body,无 DS) */
export async function getCookieTokenBySToken(cred: CookieCredential, isOversea: boolean): Promise<{ uid: string; cookieToken: string }> {
  const raw = isOversea
    ? await miHoYoRequest<{ uid: string; cookie_token: string }>({
        method: 'POST',
        url: `${OS_ACCOUNT}/account/auth/api/getCookieAccountInfoBySToken`,
        headers: { Cookie: cookieHeader(cred, 'SToken') },
        data: { stoken: cred.stoken, uid: cred.stuid },
      })
    : await miHoYoRequest<{ uid: string; cookie_token: string }>({
        method: 'GET',
        url: `${CN_PASSPORT}/account/auth/api/getCookieAccountInfoBySToken`,
        headers: stokenHeaders(cred),
      })
  return { uid: raw.uid, cookieToken: raw.cookie_token }
}

/** stoken → ltoken(国 GET + DS;国际 POST body,无 DS) */
export async function getLTokenBySToken(cred: CookieCredential, isOversea: boolean): Promise<string> {
  const raw = isOversea
    ? await miHoYoRequest<{ ltoken: string }>({
        method: 'POST',
        url: `${OS_ACCOUNT}/account/auth/api/getLTokenBySToken`,
        headers: { Cookie: cookieHeader(cred, 'SToken') },
        data: { stoken: cred.stoken, uid: cred.stuid },
      })
    : await miHoYoRequest<{ ltoken: string }>({
        method: 'GET',
        url: `${CN_PASSPORT}/account/auth/api/getLTokenBySToken`,
        headers: stokenHeaders(cred),
      })
  return raw.ltoken
}

/** 解析整段 Cookie 文本为根凭据(要求 stuid+mid+stoken 三键齐全) */
export function parseCookieCredential(text: string): { stuid: string; stoken: string; mid: string } {
  const map: Record<string, string> = {}
  for (const seg of text.split(';')) {
    const eq = seg.indexOf('=')
    if (eq < 0) continue
    const key = seg.slice(0, eq).trim()
    const value = seg.slice(eq + 1).trim()
    if (key) map[key] = value
  }
  const { stuid, mid, stoken } = map
  if (!stuid || !mid || !stoken) {
    throw new Error('Cookie 缺少必需字段:需同时包含 stuid、mid、stoken')
  }
  return { stuid, stoken, mid }
}
