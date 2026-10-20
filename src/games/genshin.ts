/**
 * 原神游戏配置
 * 区服映射依据: docs/plans/2026_10_20__001__phase1__development_plan.md §6.4
 */
import type { GameConfig } from "./types";

/** uid 首位 → 区服代号 */
const REGION_BY_FIRST_DIGIT: Record<string, string> = {
  "1": "cn_gf01",
  "2": "cn_gf01",
  "3": "cn_gf01",
  "4": "cn_gf01",
  "5": "cn_qd01",
  "6": "os_usa",
  "7": "os_euro",
  "8": "os_asia",
  "9": "os_cht",
};

export const genshin: GameConfig = {
  id: "genshin",
  name: "原神",
  biz: { cn: "hk4e_cn", os: "hk4e_global" },
  signIn: {
    cn: { host: "https://api-takumi.mihoyo.com/event/luna", actId: "e202311201442471" },
    os: { host: "https://sg-hk4e-api.hoyoverse.com/event/sol", actId: "e202102251931481" },
  },
  regionFromUid(uid: string): string {
    const first = uid.charAt(uid.length - 9);
    return REGION_BY_FIRST_DIGIT[first] ?? "cn_gf01";
  },
  isOverseaUid(uid: string): boolean {
    const first = uid.charAt(uid.length - 9);
    return !["1", "2", "3", "4", "5"].includes(first);
  },
};
