# Nicole Launcher 第一期开发规划

> 创建日期:2026-10-20
> 状态:待评审
> 依据:`docs/project-spec.md` 第 6 节;接口行为参考 Snap.Hutao 1.16.5 源码调研(本文附录为调研结论沉淀)

## 1. 目标与范围

第一期交付以下能力(均以原神为主、国服优先,结构上兼容国际服):

| # | 功能 | 说明 |
|---|------|------|
| 1 | 账号添加管理 | 米游社账号添加(国服扫码 / 双服手动 Cookie)、凭据派生刷新、角色(UID)管理 |
| 2 | 启动游戏 | 自动换取登录票据 `login_auth_ticket` 并以参数启动游戏进程 |
| 3 | 每日签到 | 签到状态、月历奖励展示、一键签到(补签列为增强) |
| 4 | 每日便笺 | 实时便笺(树脂/宝钱/委托/派遣等)获取与展示、可配置自动刷新 |

不在本期范围:祈愿记录与 UIGF 导出(二期)、B 服(channel=14)票据启动(走注册表方案,另立任务)、米哈游其他游戏实际接入(仅保留扩展点)。

## 2. 现状盘点

已有(Tauri 2 + Vue 3.5 + TS + Vite 8 + Tailwind 4 脚手架):

- 侧边栏布局 `src/layouts/MainLayout.vue`,含 **Logo 随机切换机制(规范第 6.8 条要求务必保留)**
- 空白页面:dashboard / launcher / settings;路由 `src/router/index.ts`
- 已安装未接入:pinia、axios;`vue-i18n` 已装(本期不启用,仅保留)

问题与缺口:

- `src/pages/launcher/index.vue:2` 引用未安装的 `@vean/ui`(坏引用,需移除)
- `tauri-plugin-store`、`tauri-plugin-http`、`tauri-plugin-dialog` 均未安装
- Rust 端仅有 greet 示例;无游戏路径发现、进程启动能力
- 无主题色板、无夜间模式;组件层为空

## 3. 总体架构

### 3.1 分层职责

```
┌─ Vue 前端(全部业务逻辑)────────────────────────────┐
│ pages / components / stores(pinia) / composables    │
│ api/(axios 封装:DS 签名、x-rpc 头、cookie 注入、     │
│      响应解包)  games/(多游戏注册表)                 │
├─ Tauri 插件层 ──────────────────────────────────────┤
│ plugin-http(绕 CORS 的 fetch) plugin-store(持久化) │
│ plugin-dialog(选择游戏路径)   opener(打开外部链接)  │
├─ Rust 核心(仅系统能力)─────────────────────────────┤
│ detect_game_path / launch_game / config.ini 读写     │
└──────────────────────────────────────────────────────┘
```

原则:米哈游 API 请求全部由前端 axios 发起(通过 plugin-http 的 fetch 绕过 CORS),DS 签名、cookie 拼装在 TS 实现;Rust 只做 Web 做不到的事——进程启动、文件系统访问。凭据与请求细节留在前端,避免每个接口写 Rust command + 双份类型的样板。

### 3.2 网络层方案

- 在 Tauri 环境将 `window.fetch` 替换为 `@tauri-apps/plugin-http` 的 `fetch`(main.ts 中一次性挂载),axios 使用 `adapter: "fetch"`(axios ≥1.7)。
- `src/api/http.ts` 创建统一实例,拦截器职责:
  1. 请求:按 API 族注入预设头(UA / x-rpc-app_version / client_type / device_id),按需生成 DS 头,按 CookieType 拼接 Cookie 头;
  2. 响应:解包 `{retcode, message, data}`,retcode≠0 抛类型化错误(含 -3501 扫码过期、1034 风控等待验证、-5003 已签到等已知码)。
- 设备标识:`deviceId`(UUID v4)持久化于 settings store,首启生成。

### 3.3 多游戏扩展设计

`src/games/` 注册表,每个游戏一个配置对象,UI 与 api 层只依赖接口:

```ts
// src/games/types.ts(示意)
interface GameConfig {
  id: string;                     // "genshin"
  biz: { cn: string; os: string };  // "hk4e_cn" / "hk4e_global"
  signIn: { cn: { host, actId }, os: { host, actId } };
  regionFromUid: (uid: string) => Region;
  // 二期:gacha、UIGF 导出挂在这里
}
```

顶栏预留游戏切换位(V1 仅展示原神,不可切换)。星布谷地等后续新增仅增配置 + 页面模块。

### 3.4 目录结构(目标)

```
src/
  api/            # axios 实例、拦截器、按域拆分的接口模块
    http.ts  ds.ts  headers.ts
    passport.ts  binding.ts  signin.ts  dailynote.ts  auth-ticket.ts
  games/
    types.ts  registry.ts  genshin.ts
  stores/
    settings.ts  accounts.ts  notes.ts  sign.ts
  composables/
  components/
    ui/           # SButton、SCard 等基础件(替代 @vean/ui,自建轻量)
    note/  sign/  account/
  pages/
    dashboard/  accounts/  launcher/  settings/
  layouts/MainLayout.vue
src-tauri/src/
  game_path.rs  launch.rs  lib.rs
```

### 3.5 数据存储设计(Tauri Store)

- `settings.json`:主题(light/dark/auto)、语言、deviceId、启动选项(游戏路径、区服方案、窗口参数开关)、便笺刷新间隔。
- `users.json`:`{ users: MihoyoUser[], currentUserId }`。

`MihoyoUser` 模型(对齐 Snap.Hutao 实体,仅存必要字段):

```ts
interface MihoyoUser {
  id: string;             // 内部 uuid
  aid: string;            // 账号 id(= stuid = account_id = ltuid)
  mid: string;            // 唯一识别键(去重/关联角色)
  isOversea: boolean;
  stoken: string;         // 根凭据(v2),长期
  ltoken: string;         // 派生,惰性刷新
  cookieToken: string;    // 派生,1 天惰性刷新
  cookieTokenUpdatedAt: number;
  fingerprint?: string;   // device_fp,7 天刷新(国服)
  fpUpdatedAt?: number;
  preferredUid?: string;
  nickname?: string; avatarUrl?: string;
  roles: UserRole[];      // 绑定角色列表
}
interface UserRole { gameBiz, region, uid, nickname, level, isChosen }
```

> 说明:Store 为明文 JSON,与参考实现(Snap.Hutao 明文 SQLite)同级。后续可用 keyring 加固,本期不做(轻量化优先)。

## 4. 主题色板(基于 docs/images/nicole.jpg 提取)

图片主色:珊瑚粉/玫红(色相 0-17°)、暖米浅底、紫调深底。围绕它们定义双模式色板,组件一律使用语义 token,不写死颜色。

```css
/* src/styles/theme.css(示意,Tailwind 4 @theme + class 切换夜间) */
:root {
  --nl-bg: #faf3ea;          /* 暖米白    */
  --nl-surface: #fffdfa;
  --nl-surface-2: #f5e9dd;
  --nl-text: #3d2b33;        /* 暖深棕    */
  --nl-text-2: #8a6f6f;
  --nl-primary: #cc8478;     /* 主强调色  */
  --nl-primary-strong: #b46060;
  --nl-primary-soft: #f0ccc0; /* 选中底/浅强调 */
  --nl-border: #ead9cc;
}
.dark {
  --nl-bg: #221628;          /* 紫黑      */
  --nl-surface: #2f1d33;
  --nl-surface-2: #3c243c;
  --nl-text: #f0e4e0;
  --nl-text-2: #b89ca8;
  --nl-primary: #d89084;     /* 夜间略提亮以保证对比度 */
  --nl-primary-strong: #e4a89c;
  --nl-primary-soft: #4a2f3f;
  --nl-border: #4d3844;
}
@theme inline {
  --color-bg: var(--nl-bg);
  --color-surface: var(--nl-surface);
  --color-surface-2: var(--nl-surface-2);
  --color-text: var(--nl-text);
  --color-text-2: var(--nl-text-2);
  --color-primary: var(--nl-primary);
  --color-primary-strong: var(--nl-primary-strong);
  --color-primary-soft: var(--nl-primary-soft);
  --color-border-c: var(--nl-border);
}
```

用法即 `class="bg-surface text-text hover:bg-primary-strong"`。语义色(success `#7ba05b` / warning `#d9a441` / danger `#c25b5b`,双模式各调一档亮度)另列少量 token。侧边栏现用的 `bg-orange-600` 一并替换为主题 token,样式结构保留。

## 5. 模块规划

### 5.1 M0 基础设施(先行,其余模块的地基)

| 任务 | 内容 | 产出 |
|------|------|------|
| M0-T1 | 移除 `@vean/ui` 坏引用;接入 pinia | 可编译 |
| M0-T2 | 主题色板 + 夜间模式切换(settings store + `.dark` class 挂载) | theme.css、主题切换 UI |
| M0-T3 | axios 管线:fetch 替换、实例、响应解包、已知错误码 | `src/api/http.ts` |
| M0-T4 | DS 签名 + 头工厂:Gen1/Gen2、盐表、x-rpc 预设、Cookie 拼接 | `ds.ts`、`headers.ts` |
| M0-T5 | games 注册表 + 路由/布局按新色板重构(保留 Logo 随机切换) | `games/`、布局 |
| M0-T6 | 自建轻量基础组件:SButton / SCard / SModal / SProgress | `components/ui/` |

### 5.2 M1 账号管理

**添加方式(V1 两条路径):**

1. **国服扫码**(首选):`POST /account/ma-cn-passport/app/createQRLogin` → 渲染二维码(本地渲染,不经外部服务)→ 3s 轮询 `queryQRLoginStatus`,`status=="Confirmed"` 取 `token_type==1` 的 stoken;`-3501` 过期自动重建二维码。请求头:UA `HYPContainer/1.1.4.133`、`x-rpc-app_id: ddxf5dufpuyo`、`client_type: 3`、device_id(53 位随机小写字母数字)。
2. **双服手动 Cookie**:粘贴整段 cookie 文本,要求含 `stuid`+`mid`+`stoken` 三键;按 `mid` 去重(已存在 → 更新凭据)。

手机验证码 / 国际服密码登录涉及 RSA 加密与 aigis 风控链路,V1 不做,列为后续增强。

**入库初始化流程**(统一收口,两路径共用):

```
拿到 {stuid, stoken, mid}
 → stoken 换 ltoken(getLTokenBySToken)
 → stoken 换 cookie_token(getCookieAccountInfoBySToken)
 → 获取用户信息(getUserFullInfo:昵称/头像)
 → 获取角色列表(国服:getActionTicketBySToken → getUserGameRoles;
   国际服:getUserGameRolesByCookie)
 → 任一步失败:报错不入库;角色为空:提示后仍入库(仅无法使用便笺/签到)
```

**运行期刷新**:应用启动与请求失败时惰性刷新(cookie_token >1 天必刷);device_fp 7 天刷(国服)。

**UI**:账号列表(头像/昵称/角色数/选中态)、添加向导(扫码/粘贴两个 tab)、角色选择器(当前操作 UID)、删除、手动刷新按钮。

### 5.3 M2 启动游戏

**换票链路**(无 DS,注意国服/国际服两套):

| 项 | 国服 | 国际服 |
|----|------|--------|
| URL | `POST passport-api.mihoyo.com/account/ma-cn-verifier/app/createAuthTicketByGameBiz` | `POST sg-public-api.hoyoverse.com/account/ma-verifier/api/createAuthTicketBySToken` |
| 头 | UA `HYPContainer/1.1.4.133`、`x-rpc-app_id: ddxf5dufpuyo`、`client_type: 3`、Cookie `ltoken;ltuid` | 同 UA、`x-rpc-app_id: ddxf6vlr1reo`、client_type 3、device_id(53 位) |
| Body | `{game_biz:"hk4e_cn", mid, stoken, uid: aid}` | `{biz_name:"hk4e_global", mid, stoken}` |
| 响应 | `data.ticket` | `data.ticket` |

**游戏路径发现**(Rust 命令):

1. `detect_game_path()`:Windows 扫 `%APPDATA%/../LocalLow/miHoYo/{Genshin Impact,原神}/output_log.txt`,正则提取 `...YuanShen|GenshinImpact_Data` 目录;macOS/扫描失败 → 返回空,由用户经 plugin-dialog 手动选择 exe。
2. 读取目录下 `config.ini` 的 `channel`/`sub_channel` 判断区服方案;启动前按目标区服写回(先备份)。

**启动**:Rust `launch_game(exe_path, args)`(std::process,不提权、不注入)。参数拼装在前端完成:

- 必带:`login_auth_ticket=<ticket>`(等号连接,无 `-` 前缀)
- 可选(设置页开关):`-screen-fullscreen 0/1`、`-screen-width/-screen-height`、`-popupwindow`、`-window-mode exclusive`、`-monitor N`

**UI**:启动页(当前账号/角色、区服显示、游戏路径状态与重新检测、启动按钮;启动中状态反馈)。B 服方案检测到 `PCGameSDK.dll` 时提示"B 服不支持票据启动"并仅提供裸启动。

### 5.4 M3 每日签到

**API**(`api-takumi.mihoyo.com/event/luna/*` 国服 / `sg-hk4e-api.hoyoverse.com/event/sol/*` 国际服;act_id:`e202311201442471` / `e202102251931481`):

| 接口 | 方法 | 鉴权 | DS | 用途 |
|------|------|------|----|------|
| `/{luna|sol}/home?act_id=` | GET | 无 | 无 | 月历奖励列表 |
| `/{luna|sol}/info?act_id&uid&region` | GET | cookie_token | 国服 Gen1+LK2;OS 无 | 签到状态(is_sign/total_sign_day) |
| `/{luna|sol}/sign` | POST | cookie_token | 同上 | 签到,body `{act_id, region, uid}` |
| `/{luna|sol}/resign_info` | GET | cookie_token | 同上 | 补签信息(增强) |
| `/{luna|sol}/resign` | POST | cookie_token | 同上 | 补签(增强) |

国服公共头:UA `miHoYoBBS/{version}`、`x-rpc-client_type: 5`、`x-rpc-app_version`、`x-rpc-device_id`、每请求附 `x-rpc-signgame: hk4e`;国际服无 x-rpc 公共头、无 DS。

**功能**:签到状态卡片(今日是否已签/累计天数)、月历奖励网格(已领高亮)、一键签到(当前选中角色)。已签状态以服务端 `is_sign` 为准,不做本地去重存储。

**风控兜底**:响应含 `gt/challenge` 或 `risk_code` 时,提示"触发风控"并用 opener 打开官方签到页(`act.mihoyo.com/bbs/event/signin/hk4e/index.html?act_id=...`)由用户浏览器内完成;不做内嵌 WebView 打码(V1 简化)。

自动签到调度不做(参考实现亦无),应用启动时检查未签则提示。

### 5.5 M4 每日便笺

**API**:`GET api-takumi-record.mihoyo.com/game_record/app/genshin/api/dailyNote?role_id={uid}&server={region}`(国际服 `bbs-api-os.hoyolab.com` 同路径)。鉴权:Cookie(cookie_token + ltoken);DS Gen2 + X4/OSX4 盐;国服带 Referer `webstatic.mihoyo.com` 与 `x-rpc-tool_verison: v5.0.1-1ys`(保持原拼写)。**国服先请求同目录 `index` 接口再请求 `dailyNote**, 模拟官方行为降低风控概率;retcode 1034 时提示风控并引导稍后重试。

**展示字段**(满值取响应 `max_*`,不硬编码):树脂(current/max + 回满倒计时)、洞天宝钱(max=0 显示"未解锁")、每日委托(finished/total + 额外奖励领取状态)、周本减半(remain/limit)、探索派遣(头像列表 + 各自剩余时间)、参量质变仪(可得性 + 恢复倒计时,注意其 recovery_time 为 PascalCase 字段)。

**刷新策略**:进入页面获取 + 手动刷新;自动刷新为设置项(关闭/30min/60min,默认关),应用运行期间前端定时器实现。系统级通知(树脂满推送)列为 P2 增强(需确认 notification 插件)。

## 6. 技术附录(实现速查)

### 6.1 DS 签名算法

```
t = unix 秒
r = Gen1: 6 位随机小写字母数字;Gen2: 100000-200000 随机数(100000 时取 642367)
Gen1: md5(salt={salt}&t={t}&r={r})
Gen2: md5(salt={salt}&t={t}&r={r}&b={body}&q={query 按 & 拆分字典序重排拼接})
     body 为空时用 "{}"(PROD 盐);GET 无 query 时 q 为空串但 "&b=&q=" 不可省略
请求头:DS: "{t},{r},{md5hex小写}"
```

### 6.2 常量表

| 常量 | 值 |
|------|----|
| 盐 X4 | `xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs`(便笺,Gen2) |
| 盐 X6 | `t0qEgfub6cvueAPgR5m9aQWWVciEer7v` |
| 盐 PROD | `JwYDpKvLj6MrMqqYU6jTKF17KNO2PXoS`(token 派生,Gen2) |
| 盐 OSX4 / OSX6 | `h4c1d6ywfq5bsbnbhm1bzq7bxzzv6srt` / `okr4obncj8bw5a65hbnn5oo6ixjc3l9w` |
| 盐 LK2 | `EJncUPGnOHajenjLhBOsdpwEMZmiCmQX`(国服签到/action_ticket,Gen1) |
| 盐 K2 | `rtvTthKxEyreVXQCnhluFgLXPOFKPHlA`(Gen1) |
| HYP UA | `HYPContainer/1.1.4.133` |
| 换票 app_id | 国服 `ddxf5dufpuyo` / 国际服 `ddxf6vlr1reo`(client_type 3) |
| BBS UA | `Mozilla/5.0 ... miHoYoBBS/{app_version}`(client_type 5) |
| 签到 act_id | 国服 `e202311201442471` / 国际服 `e202102251931481` |
| game_biz | `hk4e_cn` / `hk4e_global` |

> 盐值中 X4/X6/PROD 与 Snap.Hutao 源码交叉验证一致;LK2/K2 取自社区开源实现(SurplusFate/GenshinGachaHelper),实现时若国服签到/角色列表签名失败优先核对盐值是否随米游社版本更新。`x-rpc-app_version` 需可配置,便于随版本更新。

### 6.3 核心 API 汇总

| 用途 | 方法 | 端点 | 鉴权 | DS |
|------|------|------|------|----|
| 扫码创建 | POST | `passport-api.mihoyo.com/account/ma-cn-passport/app/createQRLogin` | HYP 头 | 无 |
| 扫码轮询 | POST | `.../queryQRLoginStatus` body `{ticket}` | HYP 头 | 无 |
| 换 cookie_token | GET/POST | `passport-api.mihoyo.com/account/auth/api/getCookieAccountInfoBySToken`(OS:`api-account-os.hoyoverse.com` 同路径) | stoken | Gen2/PROD(OS 无) |
| 换 ltoken | GET | `.../account/auth/api/getLTokenBySToken` | stoken | Gen2/PROD(OS 无) |
| 用户信息 | GET | `bbs-api.mihoyo.com/user/wapi/getUserFullInfo?uid={aid}&gids=2` | 无 cookie,Referer bbs.mihoyo.com | 无 |
| action_ticket | GET | `api-takumi.mihoyo.com/auth/api/getActionTicketBySToken?action_type=game_role&...` | stoken | Gen1/K2 |
| 角色列表(国) | GET | `api-takumi.mihoyo.com/binding/api/getUserGameRoles?action_ticket=...&game_biz=hk4e_cn` | ltoken | 无 |
| 角色列表(OS) | GET | `api-os-takumi.hoyoverse.com/binding/api/getUserGameRolesByCookie?game_biz=hk4e_global` | ltoken | 无 |
| device_fp | POST | `public-data-api.mihoyo.com/device-fp/api/getFp` | 伪造设备 JSON body | 无 |
| 换登录票据 | POST | 见 §5.3 表 | 见 §5.3 表 | 无 |
| 签到四接口 | — | 见 §5.4 表 | cookie_token | 见 §5.4 表 |
| 实时便笺 | GET | `api-takumi-record.mihoyo.com/game_record/app/genshin/api/dailyNote`(OS:`bbs-api-os.hoyolab.com`) | cookie_token+ltoken | Gen2/X4(OSX4) |
| 便笺前置 index | GET | 同目录 `/index?role_id&server` | 同上 | 同上 |

响应统一 `{retcode, message, data}`,retcode==0 成功。通用响应头风控标记:`X-Rpc-Aigis`(登录类)。

### 6.4 uid → 区服映射

uid 首位:1-4 `cn_gf01`、5 `cn_qd01`、6 `os_usa`、7 `os_euro`、8 `os_asia`、9 `os_cht`;首位 1-5 判定国服。

## 7. 里程碑与验收

| 里程碑 | 内容 | 验收标准 |
|--------|------|----------|
| M0 | 基础设施 | 夜间模式可切换;axios 管线单测(DS 向量)通过;构建零报错 |
| M1 | 账号管理 | 扫码/粘贴 Cookie 均能添加国服账号并正确展示昵称与角色列表;重启后凭据保留,cookie_token 自动刷新 |
| M2 | 启动游戏 | Windows 下选中角色一键启动,游戏内免登进入对应账号;区服方案正确写回 config.ini |
| M3 | 每日签到 | 显示当日签到状态与月历;一键签到成功(retcode -5003 视为已签);触发风控有明确提示与跳官方页兜底 |
| M4 | 每日便笺 | 各资源数值/倒计时正确展示;手动/自动刷新可用;多账号可切换查看 |

建议按 M0 → M1 → M3 → M4 → M2 顺序实施(启动游戏依赖 Windows 真机验证,可后置;签到/便笺先行见效)。

## 8. 风险与开放问题

| 风险 | 应对 |
|------|------|
| 国服签到/便笺风控(geetest、1034) | 顺序请求(index→dailyNote)、device_fp、失败提示 + 跳官方页;不承诺 V1 自动过码 |
| LK2/K2 盐值随米游社版本漂移 | 盐值与 app_version 集中于常量表,一次改动全局生效;签名失败时给出可读错误 |
| macOS 无国服客户端 | 启动模块为 Windows 主场景;mac 下路径手选 + 裸启动能力保留,票据逻辑不受影响 |
| Store 明文存凭据 | 与参考实现同级;keyring 加固列为后续任务 |
| 扫码登录接口变动 | 手动 Cookie 路径永远保留为兜底 |

## 9. 依赖清单(已于 2026-10-20 经用户确认全部引入)

前端(pnpm):

| 包 | 用途 | 备注 |
|----|------|------|
| `@tauri-apps/plugin-http` + Rust `tauri-plugin-http` | 绕 CORS 请求米哈游 API | 核心,必须 |
| `@tauri-apps/plugin-store` + Rust `tauri-plugin-store` | 配置与账号持久化 | spec 指定 |
| `@tauri-apps/plugin-dialog` + Rust `tauri-plugin-dialog` | 手动选择游戏路径 | 建议 |
| `js-md5` | DS 签名 MD5 | 轻量纯 JS,约 10KB |
| `qrcode-generator` | 扫码登录二维码本地渲染 | 轻量,无依赖树 |

Rust 端不新增 crate(进程启动用 std,路径扫描用 std fs)。`tauri-plugin-notification`(便笺满推送)列为 P2 可选,本期不引。

## 10. 后续 task 文档约定

- 每个里程碑(或其内独立任务)在 `docs/tasks/` 建文档,文件名 `2026_MM_DD__NNN__module__desc.md`,文档内注明依赖本文档路径。
- 待实现功能以 `// TODO @类型 说明` 注释标注(如 `// TODO @cache 便笺数据短缓存`)。
- 任务完成时更新文档内任务状态标识。
