/**
 * 米哈游启动换票(login_auth_ticket)与启动参数拼装
 * 依据: docs/plans/2026_10_20__001__phase1__development_plan.md §5.3、
 *       docs/tasks/2026_10_20__003__launcher__m2_game_launch_tasks.md M2-T4
 * 行为参考: Snap.Hutao 1.16.5 HoyoPlayPassportClient(GameProcessFactory 参数顺序)
 * 注意:仅保留命令行参数传入与账号免登票据;注入类能力一律不实现(用户决策)
 */
import { cookieHeader, hypHeaders, withDeviceFp, type CookieCredential } from './headers'
import { miHoYoRequest } from './http'

const CN_VERIFIER = 'https://passport-api.mihoyo.com/account/ma-cn-verifier/app/createAuthTicketByGameBiz'
const OS_VERIFIER = 'https://sg-public-api.hoyoverse.com/account/ma-verifier/api/createAuthTicketBySToken'

/** 换票上下文 */
export interface TicketCaller {
  cred: CookieCredential
  deviceId: string
  /** HYP 容器 device_id(53 位,国际服必带) */
  hypDeviceId: string
  isOversea: boolean
  mid: string
  stoken: string
  aid: string
  fingerprint?: string
}

/** 换取启动票据(无 DS;国服 LToken cookie,国际服 device_id 头) */
export async function createAuthTicket(caller: TicketCaller): Promise<string> {
  const raw = caller.isOversea
    ? await miHoYoRequest<{ ticket: string }>({
        method: 'POST',
        url: OS_VERIFIER,
        headers: hypHeaders(true, caller.hypDeviceId),
        data: { biz_name: 'hk4e_global', mid: caller.mid, stoken: caller.stoken },
      })
    : await miHoYoRequest<{ ticket: string }>({
        method: 'POST',
        url: CN_VERIFIER,
        headers: withDeviceFp(
          hypHeaders(false, undefined, { Cookie: cookieHeader(caller.cred, 'LToken') }),
          caller.fingerprint,
        ),
        data: { game_biz: 'hk4e_cn', mid: caller.mid, stoken: caller.stoken, uid: Number(caller.aid) },
      })
  return raw.ticket
}

/** 启动参数(Unity 命令行 + 免登票据),顺序与 Snap.Hutao GameProcessFactory 一致 */
export interface LaunchArgOptions {
  fullscreen: boolean
  borderless: boolean
  exclusive: boolean
  widthEnabled: boolean
  width: number
  heightEnabled: boolean
  height: number
  monitorEnabled: boolean
  /** 1-based 显示器编号 */
  monitor: number
}

export function buildLaunchArgs(opts: LaunchArgOptions, ticket?: string): string[] {
  const args: string[] = []
  if (opts.borderless) args.push('-popupwindow')
  if (opts.exclusive) args.push('-window-mode', 'exclusive')
  args.push('-screen-fullscreen', opts.fullscreen ? '1' : '0')
  if (opts.widthEnabled) args.push('-screen-width', String(opts.width))
  if (opts.heightEnabled) args.push('-screen-height', String(opts.height))
  if (opts.monitorEnabled) args.push('-monitor', String(opts.monitor))
  if (ticket) args.push(`login_auth_ticket=${ticket}`) // 等号连接,无 - 前缀
  return args
}
