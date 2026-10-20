# M1 账号管理任务

> 依赖计划:`docs/plans/2026_10_20__001__phase1__development_plan.md`(§3.5、§5.2、§6.2、§6.3)
> 前置任务:`docs/tasks/2026_10_20__001__infra__m0_infrastructure_tasks.md`(M0 全部完成)
> 总体状态:**已完成(2026-10-20,国服扫码真机验收通过)**

## 任务清单

| 编号 | 任务 | 状态 |
|------|------|------|
| M1-T1 | `stores/accounts.ts` + `users.json` 持久化:MihoyoUser/UserRole 模型、当前账号/当前角色状态、按 mid 去重逻辑 | ✅ 已完成 |
| M1-T2 | `api/passport.ts`:扫码创建/轮询、stoken→cookie_token、stoken→ltoken(国/国际双实现) | ✅ 已完成 |
| M1-T3 | 初始化流程:用户信息(getUserFullInfo)、角色列表(国服 action_ticket 链路 / 国际服 ByCookie)、device_fp 获取 | ✅ 已完成 |
| M1-T4 | 扫码登录 UI:qrcode-generator 本地渲染二维码、3s 轮询、过期自动重建 | ✅ 已完成(真机验收) |
| M1-T5 | 手动 Cookie 粘贴 UI:解析校验 `stuid+mid+stoken` 三键、已存在则更新凭据 | ✅ 已完成(构建验证,未真机实测) |
| M1-T6 | 账号列表页(头像/昵称/角色数/选中态/删除/手动刷新)+ 角色选择器 | ✅ 已完成(列表/选中/角色真机验收;删除/mid 去重构建验证) |
| M1-T7 | 惰性刷新:应用启动时 cookie_token(>1 天)与 device_fp(>7 天,国服)自动刷新;请求遇 Cookie 失效自动重刷一次重试 | ✅ 已完成(构建验证;失效自动重刷留待 M3/M4 消费侧按需接入) |

## 实施备注(2026-10-20)

- **关键发现:Cookie/Referer 双层剥离(本次最重要教训)**。米哈游鉴权基于 Cookie 头,但:① WKWebView 的 `new Request()` 按 fetch 规范静默丢弃禁设头(Cookie/Referer),`@tauri-apps/plugin-http` 的 JS fetch 包装器内部即用 Request 构造;② 即便直接走 IPC,插件 Rust 端默认也过滤这些头,需开启 `unsafe-headers` cargo feature。修复 = `src/api/tauri-fetch.ts` 直连 `plugin:http|fetch|fetch_send|fetch_read_body` IPC + axios 自定义 adapter(`src/api/http.ts`)+ Cargo feature。**任何需鉴权的接口若报 `-100 未登录`,先查这条链路。**
- DS 的 r 随机数格式经双源核对:Snap.Hutao 中 PROD/Gen2 派生用 6 位字母数字(includeChars=true),game_record(X4/X6)用数字;社区 mihoyo-api-sdk 定为 Gen2 一律数字。实测数字格式在 PROD 派生可用(md5 覆盖 r,服务端不校验格式)。
- 错误归因教训:初始化链路的报错最初被轮询的 catch 吞掉误标为"轮询失败"。现 `addUserWithInit` 各步骤带标签(派生登录凭据失败/获取用户信息失败),UI 侧初始化独立 try/catch。
- getUserFullInfo:国服无 cookie(仅 Referer + bbs 头),国际服带 LToken,行为与 Snap.Hutao UserClient/UserClientOversea 一致。
- 真机验收记录:扫码 → 手机确认 → 派生 cookieToken/ltoken → 用户信息(昵称/头像)→ 1 个角色 → device_fp 全链路成功;users.json 持久化、重启保留、当前账号标记、角色选择器均正常。

## 实现要点

### M1-T2 API 细节(passport.ts)

**扫码(仅国服,HYP 预设头,无 DS):**

| 接口 | 方法/端点 | Body | 响应要点 |
|------|-----------|------|----------|
| 创建 | POST `passport-api.mihoyo.com/account/ma-cn-passport/app/createQRLogin` | `{}` | `data.url`(二维码内容)、`data.ticket` |
| 轮询 | POST `.../queryQRLoginStatus` | `{"ticket": "..."}` | `data.status=="Confirmed"` 且 `tokens[token_type==1].token` 即 stoken v2;`user_info.aid/mid`;retcode `-3501` 过期 |

**token 派生:**

| 接口 | 端点 | 鉴权 | DS | 响应 |
|------|------|------|----|------|
| 换 cookie_token | 国 GET `passport-api.mihoyo.com/account/auth/api/getCookieAccountInfoBySToken`;国际 POST `api-account-os.hoyoverse.com` 同路径,body `{stoken, uid}` | SToken cookie | 国 Gen2/PROD;国际无 | `data.uid`、`data.cookie_token` |
| 换 ltoken | 国 GET `.../account/auth/api/getLTokenBySToken`(国际同族) | SToken cookie | 国 Gen2/PROD | `data.ltoken` |

### M1-T3 初始化链路(入库前统一执行)

```
{stuid, stoken, mid}
 → getUserFullInfo: GET bbs-api.mihoyo.com/user/wapi/getUserFullInfo?uid={aid}&gids=2
   (无 cookie,Referer: bbs.mihoyo.com;取 nickname/avatar)
 → 角色列表:
   国服: GET api-takumi.mihoyo.com/auth/api/getActionTicketBySToken
         ?action_type=game_role&stoken={}&uid={} (SToken cookie,DS Gen1/K2)
         → GET api-takumi.mihoyo.com/binding/api/getUserGameRoles
           ?action_ticket={}&game_biz=hk4e_cn (LToken cookie)
   国际: GET api-os-takumi.hoyoverse.com/binding/api/getUserGameRolesByCookie
         ?game_biz=hk4e_global (LToken cookie)
 → device_fp(国服): POST public-data-api.mihoyo.com/device-fp/api/getFp
   body 为伪造安卓设备信息 JSON,取 data.device_fp
```

失败策略:token 派生/用户信息失败 → 报错不入库;角色列表为空 → 提示"该账号无原神角色"后仍入库(便笺/签到不可用)。角色字段:`game_biz, region, game_uid, nickname, level, is_chosen, region_name`。

### M1-T4/M1-T5 添加向导

- 页面 `/accounts` 顶部"添加账号"→ SModal 两个 tab:扫码 / 粘贴 Cookie。
- 扫码:`qrcode-generator` 生成二维码(canvas/svg),`PeriodicTimer` 3s 轮询;`-3501` 时自动重建并提示;`Confirmed` 后组装 `{stuid: aid, stoken, mid}` 进入统一初始化。
- 粘贴:整段 cookie 按 `;`/`=` 解析,要求三键齐全;按 `mid` 判定新建/更新(更新路径仅覆盖 stoken/ltoken/cookieToken 并重跑初始化)。
- isOversea 判定:粘贴路径由用户勾选"国际服账号"(或由 ltoken 域名无法区分时默认国服);扫码路径恒为国服。

### M1-T6 状态与 UI

- 当前账号 + 当前角色(preferredUid)为全局状态,后续签到/便笺/启动模块均消费它;切换时持久化 preferredUid。
- 列表项展示:头像、昵称、aid/mid、角色数、国服/国际服标记;操作:设为当前、刷新凭据、删除(需确认弹窗)。

## 验收标准

- 国服账号可经扫码与粘贴两条路径添加,昵称与角色列表正确展示。
- 重启应用后账号保留;cookie_token 超过 1 天后首次请求自动刷新成功。
- 同一账号(mid 相同)重复添加走更新路径,不产生重复条目。
- 删除账号后列表与 users.json 同步清理。
