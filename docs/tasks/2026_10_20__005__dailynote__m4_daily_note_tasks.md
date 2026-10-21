# M4 每日便笺任务

> 依赖计划:`docs/plans/2026_10_20__001__phase1__development_plan.md`(§5.5、§6.1、§6.3、§6.4)
> 前置任务:`docs/tasks/2026_10_20__002__account__m1_account_management_tasks.md`(M1 全部完成,需要当前角色 uid/region 与 cookie_token/ltoken)
> 总体状态:**已完成(2026-10-20,国服真机验收:数值对照米游社 App 一致、倒计时与设置项正常)**

## 任务清单

| 编号 | 任务 | 状态 |
|------|------|------|
| M4-T1 | `api/dailynote.ts`:`index` + `dailyNote` 顺序请求封装(国/国际双实现) | ✅ 已完成 |
| M4-T2 | `stores/notes.ts` + 数据模型:字段映射、倒计时本地推进、1034 风控态 | ✅ 已完成 |
| M4-T3 | 便笺卡片 UI:树脂/宝钱/委托/周本/派遣/质变仪六区块,多角色支持 | ✅ 已完成(真机验收;多角色经 accounts 角色切换器联动) |
| M4-T4 | 自动刷新:设置项(关闭/30min/60min,默认关)+ 前端定时器 | ✅ 已完成(真机验收持久化) |
| M4-T5 | Dashboard 集成与概览(树脂进度最醒目位) | ✅ 已完成(真机验收) |

## 实施备注(2026-10-20)

- **`x-rpc-tool_verison` 值勘误**:交接文档(004)记为 `v5.0.1-1ys`,Snap.Hutao 1.16.5 源码实际为 `v5.0.1-ys`,实现取源码值并真机验证通过。
- **DS 空 body 默认值按盐区分**(本次修正 ds.ts):PROD → `"{}"`,其余盐(X4/OSX4 的 GET)→ 空串,依据 Snap.Hutao DataSignOptions;修正后 PROD 自测向量不受影响。
- 响应结构:旧平铺字段(current_resin 等)与新版嵌套字段(daily_task、archon_quest_progress、calendar_url)并存,实现优先取平铺字段、daily_task 兜底。
- transformer.recovery_time 内层键为 PascalCase(Day/Hour/Minute/Second/reached),已按秒折算。
- 倒计时实现:store 只存 recoveryTime 秒数 + fetchedAt 基准,UI 每分钟本地重渲染,不发请求;刷新失败静默保留旧数据。
- 国际服路径(OSX4/hoyolab 域)构建完成但未真机验证(无国际服账号)。

## 极验验证补全(2026-10-20,用户决策:仅手动滑块,不接第三方打码)

- 1034 触发时自动弹子窗口(`/geetest` 裸路由 + `WebviewWindow`),加载极验官方 `gt.0.5.2.js`(`product:'bind'` 自动弹滑块),完成结果经 tauri event 回传主窗口;用户关闭窗口视为取消。
- card wapi 链路(与 Snap.Hutao CardClient/GeetestService 逐字段对齐,三个易错点全部实测踩过):
  1. 端点为 `/game_record/app/card/wapi/{createVerification,verifyVerification}`(注意 **`/app` 段**,参考 ApiEndpoints.csv);
  2. `x-rpc-challenge_path` 传**完整 URL** 而非裸路径;`x-rpc-challenge_game: 2`(原神);challenge 按请求各自注册(index/dailyNote 独立处理,不可共用);
  3. verifyVerification 的 body 为 `geetest_challenge / geetest_validate / geetest_seccode`(seccode = `"{validate}|jordan"`)——字段名不是 challenge/validate,错了会报 `-1 拼图已过期`。
- 成功后原请求带 `x-rpc-challenge: <新 challenge>` 重试(DS 重签)。全链路每步写 nicole.log(`risk:`/`note` 前缀)。
- 真机验证:真实 1034 触发 → 滑块 → 便笺加载成功,后续刷新不再弹窗。

## 实现要点

### M4-T1 API 细节

| 项 | 国服 | 国际服 |
|----|------|--------|
| 端点 | `api-takumi-record.mihoyo.com/game_record/app/genshin/api/{index,dailyNote}?role_id={uid}&server={region}` | `bbs-api-os.hoyolab.com` 同路径 |
| 头 | BBS 预设;Cookie **CookieToken + LToken 双段**;`Referer: https://webstatic.mihoyo.com`;`x-rpc-tool_verison: v5.0.1-1ys`(保持原拼写) | BBS-OS 预设,无 Referer/tool_verison |
| DS | Gen2 + X4 | Gen2 + OSX4 |

**顺序要求:先 `index` 后 `dailyNote`**(模拟官方行为降低风控);retcode `1034` → 标记风控态,提示稍后重试(V1 不做 geetest)。

### M4-T2 数据模型

字段映射(满值一律取响应 `max_*`,不硬编码):

| 字段 | 含义 | 备注 |
|------|------|------|
| current_resin / max_resin / resin_recovery_time | 树脂 | 满值约 200 |
| current_home_coin / max_home_coin / home_coin_recovery_time | 洞天宝钱 | **max=0 → 显示"未解锁"** |
| finished_task_num / total_task_num / is_extra_task_reward_received | 每日委托 | |
| remain_resin_discount_num / resin_discount_num_limit | 周本减半 | |
| expeditions[] {avatar_side_icon, status, remained_time} | 探索派遣 | status: Finished/Ongoing |
| transformer {obtained, recovery_time{Day,Hour,Minute,Second,reached}} | 参量质变仪 | **recovery_time 为 PascalCase 字段**;按 604800s 周期反推 |

- 倒计时本地推进:`*_recovery_time` 秒数转为本地时钟,卡片每分钟重渲染(UI 定时器,不发请求)。
- // TODO @cache 便笺数据按 uid 缓存,页面切换不重拉(刷新间隔内)

### M4-T3 卡片 UI

- 每个角色一张 SCard:头部昵称/UID/区服 + 刷新时间;区块顺序:树脂(大号进度条)→ 派遣(头像横排 + 各自剩余时间)→ 宝钱 → 委托(含额外奖励领取状态)→ 周本减半 → 质变仪(可用/倒计时)。
- 多账号多角色:当前账号的全部原神角色 tab 或列表切换;与 accounts store 的 preferredUid 联动。
- 进度条组件复用 M0 的 SProgress;树脂/宝钱接近满值(≥90%)时用 warning 色提示。

### M4-T4 自动刷新

- settings store 增加 `noteRefreshInterval: "off" | "30m" | "60m"`(默认 off);notes store 持有定时器,仅应用运行期间有效;刷新静默失败不清空已有数据,只更新"最后尝试时间"。

## 验收标准

- 国服角色:各资源数值与米游社 App 一致;倒计时每分钟推进;宝钱未解锁显示正确。
- 请求顺序 index→dailyNote(devtools/network 断言);1034 时给出风控提示且不崩溃。
- 手动刷新、自动刷新(30min)按预期工作;切换角色重新拉取。
- 国际服角色走 hoyolab 域名与 OSX4 盐,数据同样正确展示。
