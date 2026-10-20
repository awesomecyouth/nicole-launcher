/**
 * 米哈游实时便笺(game_record/app/genshin/api/dailyNote)
 * 依据: docs/plans/2026_10_20__001__phase1__development_plan.md §5.5
 * 行为参考: Snap.Hutao 1.16.5 GameRecordClient / GameRecordClientOversea
 * 注意: ① 先 index 后 dailyNote(降风控);② Cookie 为 CookieToken+LToken 双段;
 * ③ 响应同时含旧平铺字段与新版嵌套字段(daily_task 等),此处优先取平铺字段
 */
import { dsGen2 } from './ds'
import { bbsHeaders, cookieHeader, withDeviceFp, type CookieCredential } from './headers'
import { miHoYoRequest } from './http'
import type { UserRole } from '@/stores/accounts'

const CN_RECORD = 'https://api-takumi-record.mihoyo.com'
const OS_RECORD = 'https://bbs-api-os.hoyolab.com'

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
  transformer?: { obtained: boolean; recovery_time?: { Day: number; Hour: number; Minute: number; Second: number; reached: boolean } }
  /** 新版嵌套字段(与平铺字段并存,平铺缺失时兜底) */
  daily_task?: { total_num: number; finished_num: number; is_extra_task_reward_received: boolean }
}

function host(isOversea: boolean): string {
  return isOversea ? OS_RECORD : CN_RECORD
}

/** 头:BBS 预设 + 双段 Cookie + 国服 Referer/tool_verison;DS Gen2 + X4/OSX4 */
function noteHeaders(caller: NoteCaller, query: string, isDailyNote: boolean): Record<string, string> {
  const cred = caller.cred
  const cookie = cookieHeader(cred, 'CookieToken') + ';' + cookieHeader(cred, 'LToken')
  const extra: Record<string, string> = { Cookie: cookie }
  if (!caller.isOversea) {
    extra['Referer'] = 'https://webstatic.mihoyo.com/'
    if (isDailyNote) extra['x-rpc-tool_verison'] = 'v5.0.1-ys'
  }
  let headers = bbsHeaders(caller.deviceId, extra)
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
 * 拉取实时便笺:严格先 index 后 dailyNote(模拟官方行为降低风控)
 */
export async function getDailyNote(caller: NoteCaller): Promise<DailyNote> {
  const query = `role_id=${caller.role.uid}&server=${caller.role.region}`
  const base = `${host(caller.isOversea)}/game_record/app/genshin/api`

  await miHoYoRequest<unknown>({
    method: 'GET',
    url: `${base}/index?${query}`,
    headers: noteHeaders(caller, query, false),
  })

  const raw = await miHoYoRequest<RawNote>({
    method: 'GET',
    url: `${base}/dailyNote?${query}`,
    headers: noteHeaders(caller, query, true),
  })
  return toNote(raw)
}
