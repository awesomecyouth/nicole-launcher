/**
 * 用户信息 / 角色列表 / 设备指纹
 * 依据: docs/plans/2026_10_20__001__phase1__development_plan.md §5.2/§6.3
 * 行为参考: Snap.Hutao 1.16.5 UserClient / BindingClient / DeviceFpClient
 */
import { dsGen1 } from './ds'
import { bbsHeaders, cookieHeader, type CookieCredential } from './headers'
import { miHoYoRequest } from './http'
import type { UserRole } from '@/stores/accounts'

const CN_BBS = 'https://bbs-api.mihoyo.com'
const OS_BBS = 'https://bbs-api-os.hoyolab.com'
const CN_TAKUMI = 'https://api-takumi.mihoyo.com'
const OS_TAKUMI = 'https://api-os-takumi.hoyoverse.com'

interface RawRole {
  game_biz: string
  region: string
  game_uid: string
  nickname: string
  level: number
  is_chosen: boolean
  region_name: string
}

function toRole(raw: RawRole): UserRole {
  return {
    gameBiz: raw.game_biz,
    region: raw.region,
    uid: raw.game_uid,
    nickname: raw.nickname,
    level: raw.level,
    isChosen: raw.is_chosen,
    regionName: raw.region_name,
  }
}

/** 用户信息(昵称/头像);国服无 cookie 仅 Referer,国际服带 LToken */
export async function getUserFullInfo(
  cred: CookieCredential,
  deviceId: string,
  isOversea: boolean,
): Promise<{ nickname: string; avatarUrl: string }> {
  const url = `${isOversea ? OS_BBS : CN_BBS}/user/wapi/getUserFullInfo?uid=${cred.stuid}&gids=2`
  const headers = isOversea
    ? bbsHeaders(deviceId, { Cookie: cookieHeader(cred, 'LToken') })
    : bbsHeaders(deviceId, { Referer: 'https://bbs.mihoyo.com/' })
  const raw = await miHoYoRequest<{ user_info: { nickname: string; avatar_url?: string; avatar?: string } }>({
    method: 'GET',
    url,
    headers,
  })
  return {
    nickname: raw.user_info?.nickname ?? '',
    avatarUrl: raw.user_info?.avatar_url ?? raw.user_info?.avatar ?? '',
  }
}

/** action_ticket(国服角色列表前置;SToken cookie + Gen1/K2) */
export async function getActionTicket(cred: CookieCredential): Promise<string> {
  const query = `action_type=game_role&stoken=${cred.stoken}&uid=${cred.stuid}`
  const raw = await miHoYoRequest<{ ticket: string }>({
    method: 'GET',
    url: `${CN_TAKUMI}/auth/api/getActionTicketBySToken?${query}`,
    headers: {
      Cookie: cookieHeader(cred, 'SToken'),
      DS: dsGen1('K2'),
    },
  })
  return raw.ticket
}

/** 角色列表:国服走 action_ticket,国际服 ByCookie(LToken) */
export async function getUserGameRoles(cred: CookieCredential, gameBiz: string, isOversea: boolean): Promise<UserRole[]> {
  const raw = isOversea
    ? await miHoYoRequest<{ list: RawRole[] }>({
        method: 'GET',
        url: `${OS_TAKUMI}/binding/api/getUserGameRolesByCookie?game_biz=${gameBiz}`,
        headers: { Cookie: cookieHeader(cred, 'LToken') },
      })
    : await miHoYoRequest<{ list: RawRole[] }>({
        method: 'GET',
        url: `${CN_TAKUMI}/binding/api/getUserGameRoles?action_ticket=${encodeURIComponent(await getActionTicket(cred))}&game_biz=${gameBiz}`,
        headers: { Cookie: cookieHeader(cred, 'LToken') },
      })
  return (raw.list ?? []).map(toRole)
}

/* ---------- 设备指纹(国服风控缓解,结构同官方客户端上报) ---------- */

function randomLowerHex(len: number): string {
  const chars = '0123456789abcdef'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

function randomUpperAndNumber(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

/** 伪造安卓设备 ext_fields(自造随机值,仅保持字段结构) */
function fakeAndroidExtFields(): string {
  const device = randomUpperAndNumber(12)
  const product = randomUpperAndNumber(6)
  return JSON.stringify({
    proxyStatus: 0,
    isRoot: 0,
    romCapacity: '512',
    deviceName: device,
    productName: product,
    romRemain: '512',
    hostname: 'dg02-pool03-kvm87',
    screenSize: '1440x2905',
    isTablet: 0,
    aaid: '',
    model: device,
    brand: 'XiaoMi',
    hardware: 'qcom',
    deviceType: 'OP5913L1',
    devId: 'REL',
    serialNumber: 'unknown',
    sdCapacity: 512215,
    buildTime: '1693626947000',
    buildUser: 'android-build',
    simState: 5,
    ramRemain: '239814',
    appUpdateTimeDiff: 1702604034482,
    deviceInfo: `XiaoMi/${product}/OP5913L1:13/SKQ1.221119.001/T.118e6c7-5aa23-73911:user/release-keys`,
    vaid: '',
    buildType: 'user',
    sdkVersion: '34',
    ui_mode: 'UI_MODE_TYPE_NORMAL',
    isMockLocation: 0,
    cpuType: 'arm64-v8a',
    isAirMode: 0,
    ringMode: 2,
    chargeStatus: 1,
    manufacturer: 'XiaoMi',
    emulatorStatus: 0,
    appMemory: '512',
    osVersion: '14',
    vendor: 'unknown',
    accelerometer: '1.4883357x7.1712894x6.2847486',
    sdRemain: 239600,
    buildTags: 'release-keys',
    packageName: 'com.mihoyo.hyperion',
    networkType: 'WiFi',
    oaid: '',
    debugStatus: 1,
    ramCapacity: '469679',
    magnetometer: '20.081251x-27.487501x2.1937501',
    display: `${product}_13.1.0.181(CN01)`,
    appInstallTimeDiff: 1688455751496,
    packageVersion: '2.20.1',
    gyroscope: '0.030226856x0.014647375x0.010652636',
    batteryStatus: 100,
    hasKeyboard: 0,
    board: 'taro',
  })
}

/** 获取 device_fp(仅国服;失败可容忍,不阻断入库) */
export async function getDeviceFp(bbsDeviceId: string, currentFp?: string): Promise<string> {
  const raw = await miHoYoRequest<{ device_fp: string }>({
    method: 'POST',
    url: 'https://public-data-api.mihoyo.com/device-fp/api/getFp',
    data: {
      device_id: randomLowerHex(16),
      bbs_device_id: bbsDeviceId,
      seed_id: crypto.randomUUID(),
      seed_time: `${Date.now()}`,
      platform: '2',
      app_name: 'bbs_cn',
      device_fp: currentFp || randomLowerHex(13),
      ext_fields: fakeAndroidExtFields(),
    },
  })
  return raw.device_fp
}
