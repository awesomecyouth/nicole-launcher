/**
 * 多游戏注册表类型:新游戏(如星布谷地)仅需新增一个 GameConfig 实现
 * 依据: docs/plans/2026_10_20__001__phase1__development_plan.md §3.3
 */

/** 签到接口配置(域名 + act_id) */
export interface SignInConfig {
  host: string;
  actId: string;
}

export interface GameConfig {
  /** 唯一 id,如 "genshin" */
  id: string;
  /** 展示名 */
  name: string;
  /** 业务标识,国服/国际服 */
  biz: { cn: string; os: string };
  /** 每日签到配置 */
  signIn: { cn: SignInConfig; os: SignInConfig };
  /** uid → 区服代号 */
  regionFromUid(uid: string): string;
  /** uid 是否国际服(首位 1-5 为国服) */
  isOverseaUid(uid: string): boolean;
}
