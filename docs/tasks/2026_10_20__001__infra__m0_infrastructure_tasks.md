# M0 基础设施搭建任务

> 依赖计划:`docs/plans/2026_10_20__001__phase1__development_plan.md`(§3、§4、§5.1、§6)
> 前置任务:无(其他里程碑的地基)
> 总体状态:**已完成(新库重建于 2026-10-20,实测验收通过)**
> 说明:下表 ✅ 原为旧代码库(同级目录 `nicole-launcher.broken/`)的完成记录;新库已审查式重建并全部验证通过。

## 任务清单

| 编号 | 任务 | 状态 |
|------|------|------|
| M0-T0 | 安装依赖:`@tauri-apps/plugin-http`、`@tauri-apps/plugin-store`、`@tauri-apps/plugin-dialog`(前端 + Rust crate)、`js-md5`、`qrcode-generator`;更新 `src-tauri/capabilities/default.json` 权限 | ✅ 已完成 |
| M0-T1 | 移除 `src/pages/launcher/index.vue` 的 `@vean/ui` 坏引用;`src/main.ts` 接入 pinia | ✅ 已完成 |
| M0-T2 | 主题色板:`src/styles/theme.css`(CSS 变量 + Tailwind 4 `@theme inline` 双模式)+ `stores/settings.ts`(主题/语言/deviceId,持久化到 plugin-store)+ 夜间模式切换 UI | ✅ 已完成 |
| M0-T3 | axios 管线:`main.ts` 中 Tauri 环境下用 plugin-http 的 fetch 替换 `window.fetch`;`src/api/http.ts` 创建 `adapter: "fetch"` 实例与响应解包拦截器 | ✅ 已完成 |
| M0-T4 | DS 签名与头工厂:`src/api/ds.ts`(Gen1/Gen2)、`src/api/headers.ts`(x-rpc 预设族 + Cookie 拼装) | ✅ 已完成 |
| M0-T5 | `src/games/` 注册表(types/registry/genshin)+ 布局按主题 token 重构,**保留 Logo 随机切换机制** | ✅ 已完成 |
| M0-T6 | 轻量基础组件:`src/components/ui/` 下 SButton / SCard / SModal / SProgress | ✅ 已完成 |

### 实施备注(2026-10-20)

- 主题 token 命名在 plan 基础上微调:`text`→`ink`、`border-c`→`line`、`bg`→`base`(避免 `bg-bg`/`text-text` 类名);变量与类名:`bg-base`/`bg-surface`/`bg-surface-2`/`text-ink`/`text-ink-2`/`primary(-strong/-soft)`/`border-line`/`success`/`warning`/`danger`。
- `tsconfig.json` 补充了 `paths` 的 `@/*` 映射(此前仅 vite 侧有 alias,旧代码未暴露)。
- `js-md5` 0.9 需具名导入(`import { md5 } from "js-md5"`)。
- DS 自测向量固化为 `dsSelfTest()`(`src/api/ds.ts`),dev 模式启动时在控制台自动执行;当前三向量全部通过。
- `pnpm build`(vue-tsc + vite)零报错,`cargo check` 通过;夜间/日间切换与"重启保留"逻辑已实现,可在 `pnpm tauri dev` 中人工复核。

### 新库重建备注(2026-10-20)

- **根因定位(重要,旧库未解之谜的答案)**:在 macOS 26 WKWebView 中**将 `window.fetch` 全局替换为 plugin-http 的 fetch,会导致页面渲染与输入事件冻结**——JS 事件循环仍存活(网络心跳持续),但无重绘、无事件、窗口缩放不重排。旧库 main.ts 恰好采用此全局替换模式,其"首屏渲染后 JS 静默死亡/白屏"现象与此高度吻合。修复:plugin-http 惰性加载,仅经 axios `env.fetch` 注入(`src/api/http.ts`),`window.fetch` 永不改动,应用启动路径完全不触碰 plugin-http。
- 防护设施(错误红条 / dev 看门狗 / 自动 devtools / page_ready)按用户决策**未带入**,保持架构简洁;排查期间的临时诊断代码(网络心跳)已全部移除。
- settings store 修复旧库 bug:`isDark` 由非响应式 computed(`document.documentElement.classList.contains`)改为响应式 ref,夜间切换按钮的图标/文案不再滞留。
- `vue-i18n` 未引入(旧库装而未用),settings store 相应去掉 locale 字段,待实际需要多语言时再加。
- 验收实测:webview 渲染/点击/窗口缩放正常;夜间切换即时生效且重启保留(`settings.json` 持久化);`pnpm build` 与 `cargo check` 通过。

### webview 白屏问题记录(2026-10-20,最终未解决)

- M0 功能实现本身完整且构建通过(浏览器端完全正常),但 `tauri dev` 的 WKWebView 白屏问题经多轮排查未能定位,项目决定迁移至新代码库重开。
- 完整事实矩阵、已排除项、防护设施与新项目检查清单见 `docs/handover/2026_10_20__003__handover__env_lessons.md`。→ 后续:新库已于 2026-10-20 定位同类根因(window.fetch 全局替换),见上方"新库重建备注"。

## 实现要点

### M0-T0 依赖与权限

- Rust 端 `src-tauri/Cargo.toml` 增加 `tauri-plugin-http`、`tauri-plugin-store`、`tauri-plugin-dialog`;`lib.rs` 注册插件 `.plugin(tauri_plugin_http::init())` 等。
- capabilities 增加 `http:default`(并在 permissions 中允许 `https://*.mihoyo.com`、`https://*.hoyoverse.com`、`https://*.hoyolab.com` 的 URL scope)、`store:default`、`dialog:default`。
- 前端 `pnpm add @tauri-apps/plugin-http @tauri-apps/plugin-store @tauri-apps/plugin-dialog js-md5 qrcode-generator`。

### M0-T2 主题

- 色板变量按 plan §4 原样落地:`:root` 浅色、`.dark` 深色,`@theme inline` 映射为 `bg`/`surface`/`surface-2`/`text`/`text-2`/`primary`/`primary-strong`/`primary-soft`/`border-c` token,另加 success/warning/danger 三语义色。
- 切换实现:settings store 持有 `theme: "light" | "dark" | "auto"`,watch 后 `document.documentElement.classList.toggle("dark", ...)`。
- 现有 `MainLayout.vue` 中 `bg-orange-600`、`bg-black/2`、`bg-white` 等硬编码色全部替换为主题 token。

### M0-T3 网络管线

```ts
// main.ts(Tauri 环境检测后)
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
if ("__TAURI_INTERNALS__" in window) window.fetch = tauriFetch as typeof window.fetch;
```

- `http.ts`:`axios.create({ adapter: "fetch", timeout: 15000 })`;响应拦截器解包 `{retcode, message, data}`:retcode===0 返回 data,否则抛 `MiHoYoApiError`(含 retcode/message 字段)。
- 已知错误码常量表:`-3501` 扫码过期、`1034` 风控需验证、`-5003` 已签到、`-5005` 补签次数用尽、`-3201` Cookie 失效。

### M0-T4 DS 签名(plan §6.1 算法,注意三个易错点)

1. Gen1 的 `r` 为 6 位随机小写字母数字;Gen2 的 `r` 为 100000–200000 随机数,**特判 100000 → 642367**。
2. Gen2 签名原文 `&b=&q=` 段**不可省略**:body 为空时用 `"{}"`(PROD 盐);GET 无 query 时 `q` 为空串但仍拼接。
3. Gen2 的 `q`:URL query 去掉 `?`,按 `&` 拆段**字典序排序**后重拼;md5 取小写 hex;最终头 `DS: "{t},{r},{md5}"`。

`headers.ts` 提供三个预设族(plan §6.2 常量):

| 预设 | UA | 关键头 | 用途 |
|------|----|--------|------|
| BBS | `Mozilla/5.0 ... miHoYoBBS/{app_version}` | `x-rpc-client_type: 5`、`x-rpc-app_version`、`x-rpc-device_id: {guid36}` | 签到/便笺/用户信息 |
| HYP | `HYPContainer/1.1.4.133` | `x-rpc-app_id: ddxf5dufpuyo(国)/ddxf6vlr1reo(国际)`、`client_type: 3`、`device_id: {53位随机小写字母数字}` | 扫码/换票 |
| Passport | 同 BBS UA | `x-rpc-app_id: bll8iq97cem8`、`client_type: 2`、`sdk_version: 2.16.0` | 验证码类(预留) |

Cookie 拼装按 CookieType:SToken=`stoken;stuid;mid`、LToken=`ltoken;ltuid`、CookieToken=`account_id;cookie_token`;有 fingerprint 时附 `x-rpc-device_fp`。盐表与 app_version 集中在一个常量文件,便于版本漂移时统一更新。

### M0-T5 games 注册表与布局

- `games/genshin.ts` 落地 plan §3.3 的 GameConfig:`biz: {cn: "hk4e_cn", os: "hk4e_global"}`、signIn 双服 host/actId、`regionFromUid`(plan §6.4 映射)。
- 布局重构仅动样式与结构,**Logo 随机切换逻辑(`MainLayout.vue` iconIndex/refreshIcon)原样保留**(规范第 6.8 条)。
- 路由调整:新增 `/accounts`;侧边栏菜单:Dashboard / Accounts / Launcher / Settings。

## 验收标准

- `pnpm build` 零报错;夜间/日间模式切换即时生效且重启保留。
- `ds.ts` 对以下向量自测通过(手算 md5 固化断言):Gen2 空 body(PROD 盐,`b={}`)、Gen2 带 query 排序、Gen1 六位随机 r。
- axios 管线对 mock 响应正确解包与抛错;devtools 中确认请求经 Tauri fetch 发出(无 CORS 报错)。
