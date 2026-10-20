/**
 * 米哈游实时便笺(game_record/app/genshin/api/dailyNote)
 * 依据: docs/plans/2026_10_20__001__phase1__development_plan.md §5.5
 * 行为参考: Snap.Hutao 1.16.5 GameRecordClient / CardClient / GeetestService
 * 注意: ① 先 index 后 dailyNote(降风控);② Cookie 为 CookieToken+LToken 双段;
 * ③ 1034 风控 → card wapi 注册验证 → 用户手动极验滑块 → 换取新 challenge 重试;
 * ④ 响应同时含旧平铺字段与新版嵌套字段(daily_task 等),优先取平铺字段
 */
import { dsGen2 } from './ds'
import { bbsHeaders, cookieHeader, withDeviceFp, type CookieCredential } from './headers'
import { miHoYoRequest, MiHoYoApiError } from './http'
import { RETCODE } from './constants'
import { solveGtChallengeByWindow } from './geetest'
import { logLine } from './logger'
import type { UserRole } from '@/stores/accounts'

const CN_RECORD = 'https://api-takumi-record.mihoyo.com'
const OS_RECORD = 'https://bbs-api-os.hoyolab.com'
const CN_CARD_WAPI = 'https://api-takumi-record.mihoyo.com/game_record/app/card/wapi'

/** 探索派遣项 */
export interface NoteExpedition {
  avatarSideIcon: string
  status: 'Finished' | 'Ongoing' | (string & {})
  remainedTime: number
}

/** 参量质变仪(recovery_time 内层为 PascalCase 键) */
export interface NoteTransformer {
  obtained: boolean
  reached: boolean
  recoverySeconds: number
}

/** 便笺数据(满值取 max_*,倒计时由本地按 fetchedAt 推进) */
export interface DailyNote {
  resin: { current: number; max: number; recoveryTime: number }
  homeCoin: { current: number; max: number; recoveryTime: number }
  task: { finished: number; total: number; extraRewardReceived: boolean }
  resinDiscount: { remain: number; limit: number }
  expeditions: NoteExpedition[]
  transformer: NoteTransformer
}

export interface NoteCaller {
  cred: CookieCredential
  deviceId: string
  isOversea: boolean
  fingerprint?: string
  role: UserRole
}

interface RawNote {
  current_resin: number
  max_resin: number
  resin_recovery_time: number
  current_home_coin: number
  max_home_coin: number
  home_coin_recovery_time: number
  finished_task_num: number
  total_task_num: number
  is_extra_task_reward_received: boolean
  remain_resin_discount_num: number
  resin_discount_num_limit: number
  expeditions: { avatar_side_icon: string; status: string; remained_time: number }[]
  transformer?: {
    obtained: boolean
    recovery_time?: { Day: number; Hour: number; Minute: number; Second: number; reached: boolean }
  }
  /** 新版嵌套字段(与平铺字段并存,平铺缺失时兜底) */
  daily_task?: { total_num: number; finished_num: number; is_extra_task_reward_received: boolean }
}

function host(isOversea: boolean): string {
  return isOversea ? OS_RECORD : CN_RECORD
}

function dualCookie(cred: CookieCredential): string {
  return cookieHeader(cred, 'CookieToken') + ';' + cookieHeader(cred, 'LToken')
}

/** 头:BBS 预设 + 双段 Cookie + 国服 Referer/tool_verison;DS Gen2 + X4/OSX4 */
function noteHeaders(
  caller: NoteCaller,
  query: string,
  isDailyNote: boolean,
  extra: Record<string, string> = {}
): Record<string, string> {
  const extraHeaders: Record<string, string> = { Cookie: dualCookie(caller.cred), ...extra }
  if (!caller.isOversea) {
    extraHeaders['Referer'] = 'https://webstatic.mihoyo.com/'
    if (isDailyNote) extraHeaders['x-rpc-tool_verison'] = 'v5.0.1-ys'
  }
  let headers = bbsHeaders(caller.deviceId, extraHeaders)
  headers['DS'] = dsGen2(caller.isOversea ? 'OSX4' : 'X4', '', query)
  return withDeviceFp(headers, caller.fingerprint)
}

function toNote(raw: RawNote): DailyNote {
  const t = raw.transformer?.recovery_time
  return {
    resin: { current: raw.current_resin, max: raw.max_resin, recoveryTime: raw.resin_recovery_time },
    homeCoin: {
      current: raw.current_home_coin,
      max: raw.max_home_coin,
      recoveryTime: raw.home_coin_recovery_time,
    },
    task: {
      finished: raw.finished_task_num ?? raw.daily_task?.finished_num ?? 0,
      total: raw.total_task_num ?? raw.daily_task?.total_num ?? 0,
      extraRewardReceived: raw.is_extra_task_reward_received ?? raw.daily_task?.is_extra_task_reward_received ?? false,
    },
    resinDiscount: { remain: raw.remain_resin_discount_num, limit: raw.resin_discount_num_limit },
    expeditions: (raw.expeditions ?? []).map((e) => ({
      avatarSideIcon: e.avatar_side_icon,
      status: e.status,
      remainedTime: e.remained_time,
    })),
    transformer: {
      obtained: raw.transformer?.obtained ?? false,
      reached: t?.reached ?? false,
      recoverySeconds: t ? t.Day * 86400 + t.Hour * 3600 + t.Minute * 60 + t.Second : 0,
    },
  }
}

/**
 * 单请求 + 1034 风控自动重试:challenge 按该请求自身的 path 注册(参考实现的 per-call
 * CardVerifiationHeaders),index 与 dailyNote 各自独立处理。
 */
async function requestWithRisk<T>(
  caller: NoteCaller,
  url: string,
  query: string,
  isDailyNote: boolean,
  riskPath: string
): Promise<T> {
  const call = (extra: Record<string, string> = {}) =>
    miHoYoRequest<T>({ method: 'GET', url, headers: noteHeaders(caller, query, isDailyNote, extra) })
  try {
    return await call()
  } catch (err) {
    if (err instanceof MiHoYoApiError && err.retcode === RETCODE.RISK_VERIFY) {
      logLine(`note 1034 on ${riskPath}, start verification`)
      const challenge = await solveNoteRisk(caller, riskPath)
      if (challenge) {
        logLine(`note retry ${riskPath} with challenge`)
        return await call({ 'x-rpc-challenge': challenge })
      }
    }
    throw err
  }
}

/** 一次完整拉取:index → dailyNote(顺序不可换) */
async function fetchNote(caller: NoteCaller): Promise<DailyNote> {
  const query = `role_id=${caller.role.uid}&server=${caller.role.region}`
  const base = `${host(caller.isOversea)}/game_record/app/genshin/api`

  // 风控注册用的 challenge_path 为完整 URL(与参考实现 GameRecordXPath() 一致)
  await requestWithRisk<unknown>(caller, `${base}/index?${query}`, query, false, `${base}/index`)
  const raw = await requestWithRisk<RawNote>(caller, `${base}/dailyNote?${query}`, query, true, `${base}/dailyNote`)
  return toNote(raw)
}

/**
 * 1034 风控处理:card wapi 注册验证 → 用户手动极验滑块(子窗口)→ 校验换取新 challenge。
 * 用户取消或任一步失败返回 null。
 */
async function solveNoteRisk(caller: NoteCaller, riskPath: string): Promise<string | null> {
  try {
    // 1. 注册验证(is_high=true,challenge_game=2 即原神)
    const reg = await miHoYoRequest<{ gt: string; challenge: string }>({
      method: 'GET',
      url: `${CN_CARD_WAPI}/createVerification?is_high=true`,
      headers: withDeviceFp(
        {
          ...bbsHeaders(caller.deviceId, {
            Cookie: dualCookie(caller.cred),
            'x-rpc-challenge_game': '2',
            'x-rpc-challenge_path': riskPath,
          }),
          DS: dsGen2('X4', '', 'is_high=true'),
        },
        caller.fingerprint
      ),
    })
    logLine(`risk: verification registered for ${riskPath}`)

    // 2. 用户手动完成滑块
    const validate = await solveGtChallengeByWindow(reg.gt, reg.challenge, caller.isOversea)
    if (!validate) return null

    // 3. 校验换取新 challenge:body 为 geetest_* 三键,seccode = "{validate}|jordan"
    //    (字段名与参考实现 GeetestWebResponse 一致;DS 的 b 必须与实际 body 字节一致,故传字符串)
    const body = JSON.stringify({
      geetest_challenge: validate.geetest_challenge,
      geetest_validate: validate.geetest_validate,
      geetest_seccode: `${validate.geetest_validate}|jordan`,
    })
    const verified = await miHoYoRequest<{ challenge: string }>({
      method: 'POST',
      url: `${CN_CARD_WAPI}/verifyVerification`,
      headers: withDeviceFp(
        {
          ...bbsHeaders(caller.deviceId, {
            Cookie: dualCookie(caller.cred),
            'Content-Type': 'application/json',
            'x-rpc-challenge_game': '2',
            'x-rpc-challenge_path': riskPath,
          }),
          DS: dsGen2('X4', body, ''),
        },
        caller.fingerprint
      ),
      data: body,
    })
    logLine(`risk: verifyVerification ok, challenge=${verified.challenge.slice(0, 12)}...`)
    return verified.challenge
  } catch (err) {
    logLine(`risk chain failed: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/** 拉取实时便笺;1034 由各请求自行处理(滑块验证后自动重试) */
export async function getDailyNote(caller: NoteCaller): Promise<DailyNote> {
  return await fetchNote(caller)
}
