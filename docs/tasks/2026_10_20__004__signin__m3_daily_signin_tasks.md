# M3 每日签到任务

> 依赖计划:`docs/plans/2026_10_20__001__phase1__development_plan.md`(§5.4、§6.1、§6.2、§6.4)
> 前置任务:`docs/tasks/2026_10_20__002__account__m1_account_management_tasks.md`(M1 全部完成,需要当前账号/角色与 cookie_token 刷新链)
> 总体状态:**已完成(2026-10-21,一键签到真机验收通过)**

## 任务清单

| 编号 | 任务 | 状态 |
|------|------|------|
| M3-T1 | `api/signin.ts`:`home`(月历奖励)、`info`(签到状态)、`sign`(签到)三接口,国/国际双实现 | ✅ 已完成 |
| M3-T2 | `stores/sign.ts`:当前角色签到状态、月历数据、签到动作状态机(空闲/签到位/已签/风控/失败) | ✅ 已完成 |
| M3-T3 | 签到卡片 UI:今日状态 + 累计天数 + 月历奖励网格(已领高亮、滚动定位当日) | ✅ 已完成(真机验收) |
| M3-T4 | 一键签到 + 风控兜底(`gt/challenge`/`risk_code` 时提示并 opener 打开官方签到页) | ✅ 已完成(构建验证;风控分支无法主动触发) |
| M3-T5 | Dashboard 集成:启动时拉取 info,未签时给出醒目提示 | ✅ 已完成(真机验收) |

## 实施备注(2026-10-20)

- URL 格式双源核对:社区 mihoyo-api-sdk 用 `/event/luna/{game}/info`(带 game 段),交接文档用 `/event/luna/info`;curl 实测**两种均有效**,实现取无 game 段格式。
- 头部与参考实现(SignInClient/Oversea)对齐:国服 BBS 预设 + CookieToken + `x-rpc-signgame: hk4e`(+ device_fp),info/sign 加 Gen1/LK2 DS;国际服仅 Cookie 与 Accept(无 x-rpc 公共头、无 DS)。
- Gen1 签名不含 body/query,info(GET)与 sign(POST)共用 `dsGen1('LK2')`。
- 真机验收记录:info + home 拉取正常,月历渲染、已领高亮、当日定位正确;当日已在官方签过 → 按钮正确禁用(幂等,以服务端 is_sign 为准)。**一键签到动作已于 2026-10-21 真机验收通过**(未签 → 点击 → 月历推进、状态翻转);同日修复成功判定(retcode==0 即成功,`data.success` 不可靠),此前"签到未成功(risk_code=0)"为误报、服务端实际已签。
- 签到状态 5 分钟短缓存(`stores/sign.ts` lastLoadedUid/lastLoadedAt),切换角色自动重拉。

## 实现要点

### M3-T1 API 细节

域名与路径:国服 `api-takumi.mihoyo.com/event/luna/*`,国际服 `sg-hk4e-api.hoyoverse.com/event/sol/*`;act_id 国服 `e202311201442471`、国际服 `e202102251931481`(常量入 games/genshin.ts)。

| 接口 | 方法 | 请求 | 头 | DS |
|------|------|------|-----|----|
| 月历 home | GET | `?lang=zh-cn&act_id=` | BBS 预设,无 cookie | 无 |
| 状态 info | GET | `?lang=zh-cn&act_id=&uid={uid}&region={region}` | BBS 预设 + CookieToken cookie | 国 Gen1+LK2;国际无 DS、无 x-rpc 公共头 |
| 签到 sign | POST JSON | body `{"act_id","region","uid"}`;国际服 URL 追加 `?lang=zh-cn` | 同 info | 同 info |

- 国服每个请求附 `x-rpc-signgame: hk4e`;有 device_fp 时附 `x-rpc-device_fp`。
- 响应字段:info → `total_sign_day, today, is_sign, sign_cnt_missed`;home → `month, awards[{icon,name,cnt}]`;sign → `success, risk_code, gt, challenge`。
- 错误码处理:`-5003` 视为"今日已签"(非错误);`-5005` 补签次数用尽(增强阶段处理)。

### M3-T2 状态机与幂等

- 已签判定一律以服务端 `info.is_sign` 为准,不做本地"uid+日期"记录(参考实现同策略,天然幂等)。
- 签到流程:`info` 确认未签 → `sign` → 成功后重拉 `info` 刷新月历高亮;`sign` 返回含 `gt/challenge` 或 `success!=1` 且有 `risk_code` → 进入风控态。

### M3-T3 月历网格

- `awards` 按序号映射,前 `total_sign_day` 个 `IsClaimed` 高亮(主题 primary-soft 底 + primary 描边);当日格子滚动定位;7 列网格布局。
- 卡片头部:角色昵称/UID + 今日是否已签徽标 + 累计签到天数。

### M3-T4 风控兜底

- 触发风控:SModal 提示"触发米哈游风控验证",提供"打开官方签到页"按钮 → `@tauri-apps/plugin-opener` 打开:
  - 国服:`https://act.mihoyo.com/bbs/event/signin/hk4e/index.html?act_id=e202311201442471`
  - 国际服:`https://act.hoyolab.com/ys/event/signin-sea-v3/index.html?act_id=e202102251931481`
- V1 不做内嵌 WebView 打码与 JSBridge 注入(列为后续增强);风控态在卡片上保留"重试"入口。

### M3-T5 Dashboard 集成

- 应用启动(或切换当前角色)后拉取一次 `info`;未签 → Dashboard 顶部提示条 + 一键签到按钮直达。
- // TODO @cache info 结果短缓存(如 5 分钟),避免页面切换重复请求

## 验收标准

- 国服账号:显示正确签到状态与当月奖励,一键签到成功后月历高亮推进、状态翻转为已签。
- 已签状态下再点签到:按 `-5003` 优雅提示,不报错。
- 国际服账号:无 DS 链路可用,act_id/域名切换正确。
- 触发风控(或模拟 gt 响应):出现提示弹窗,opener 正确打开官方页。
