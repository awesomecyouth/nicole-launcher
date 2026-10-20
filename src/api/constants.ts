/**
 * 米哈游接口常量表:DS 盐值、UA、app_id、错误码
 * 集中于此,便于随米游社版本漂移时统一更新
 * 依据: docs/plans/2026_10_20__001__phase1__development_plan.md §6.2
 */

/** DS 签名盐值 */
export const SALTS = {
  /** 国服签到 / action_ticket(Gen1) */
  LK2: 'EJncUPGnOHajenjLhBOsdpwEMZmiCmQX',
  K2: 'rtvTthKxEyreVXQCnhluFgLXPOFKPHlA',
  /** 实时便笺 / game_record(Gen2) */
  X4: 'xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs',
  X6: 't0qEgfub6cvueAPgR5m9aQWWVciEer7v',
  /** token 派生(Gen2) */
  PROD: 'JwYDpKvLj6MrMqqYU6jTKF17KNO2PXoS',
  /** 国际服对应盐 */
  OSX4: 'h4c1d6ywfq5bsbnbhm1bzq7bxzzv6srt',
  OSX6: 'okr4obncj8bw5a65hbnn5oo6ixjc3l9w',
} as const

export type SaltName = keyof typeof SALTS

/** 米游社客户端版本(x-rpc-app_version 与 UA 共用),随版本更新调整 */
export const BBS_APP_VERSION = '2.71.1'

/** HoyoPlay 容器 UA(扫码登录 / 换取登录票据) */
export const HYP_UA = 'HYPContainer/1.1.4.133'
export const HYP_APP_ID = { cn: 'ddxf5dufpuyo', os: 'ddxf6vlr1reo' } as const

/** 米游社 BBS UA(签到 / 便笺 / 角色列表) */
export const BBS_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) miHoYoBBS/${BBS_APP_VERSION}`

/** 米哈游通用响应已知错误码 */
export const RETCODE = {
  /** 扫码登录二维码过期 */
  QR_EXPIRED: -3501,
  /** 风控,需要验证(geetest) */
  RISK_VERIFY: 1034,
  /** Cookie 失效 */
  COOKIE_INVALID: -3201,
  /** 今日已签到 */
  ALREADY_SIGNED: -5003,
  /** 补签次数用尽 */
  RESIGN_EXHAUSTED: -5005,
} as const

/** 通用响应包装 {retcode, message, data} */
export interface MiHoYoResponse<T> {
  retcode: number
  message: string
  data: T
}
