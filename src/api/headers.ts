/**
 * 米哈游请求头工厂:x-rpc 预设族与 Cookie 拼装
 * 依据: docs/plans/2026_10_20__001__phase1__development_plan.md §6.2
 */
import { BBS_APP_VERSION, BBS_UA, HYP_APP_ID, HYP_UA } from "./constants";

/** Cookie 鉴权段类型 */
export type CookieType = "SToken" | "LToken" | "CookieToken";

/** 凭据形状(字段可选,按 CookieType 取所需段) */
export interface CookieCredential {
  stoken?: string;
  stuid?: string;
  mid?: string;
  ltoken?: string;
  ltuid?: string;
  accountId?: string;
  cookieToken?: string;
}

/** 按 CookieType 拼接 Cookie 头值 */
export function cookieHeader(cred: CookieCredential, type: CookieType): string {
  switch (type) {
    case "SToken":
      return `stoken=${cred.stoken};stuid=${cred.stuid};mid=${cred.mid}`;
    case "LToken":
      return `ltoken=${cred.ltoken};ltuid=${cred.ltuid}`;
    case "CookieToken":
      return `account_id=${cred.accountId};cookie_token=${cred.cookieToken}`;
  }
}

/** 米游社 BBS 预设(签到 / 便笺 / 角色列表,client_type=5) */
export function bbsHeaders(deviceId: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "User-Agent": BBS_UA,
    Accept: "application/json",
    "x-rpc-app_version": BBS_APP_VERSION,
    "x-rpc-client_type": "5",
    "x-rpc-device_id": deviceId,
    ...extra,
  };
}

/** HoyoPlay 容器预设(扫码登录 / 换取登录票据,client_type=3) */
export function hypHeaders(
  isOversea: boolean,
  deviceId53?: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": HYP_UA,
    Accept: "application/json",
    "x-rpc-app_id": isOversea ? HYP_APP_ID.os : HYP_APP_ID.cn,
    "x-rpc-client_type": "3",
    ...extra,
  };
  if (deviceId53) headers["x-rpc-device_id"] = deviceId53;
  return headers;
}

/** 生成 53 位随机小写字母数字(HYP device_id) */
export function randomDeviceId53(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 53; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/** 请求头追加 device_fp(存在时) */
export function withDeviceFp(headers: Record<string, string>, fingerprint?: string): Record<string, string> {
  if (fingerprint) headers["x-rpc-device_fp"] = fingerprint;
  return headers;
}
