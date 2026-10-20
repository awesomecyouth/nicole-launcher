# M0 基础设施实现快照(可直接迁移)

> 交接文档,依赖总览 `2026_10_20__001__handover__overview.md`
> 原实现于 2026-10-20 完成,`pnpm build` + `cargo check` 通过,DS 向量自测通过

## 1. 依赖与版本

前端(pnpm):
```
@tauri-apps/plugin-http @tauri-apps/plugin-store @tauri-apps/plugin-dialog
js-md5(0.9.x,注意必须具名导入:import { md5 } from "js-md5")
qrcode-generator
(已有:vue 3.5 / vue-router 5 / pinia 4 / axios 1.20 / tailwindcss 4 / vue-i18n 11)
```

Rust(Cargo.toml):
```toml
tauri = { version = "2", features = ["devtools"] }   # devtools:macOS WKWebView 无内置检查器
tauri-plugin-opener = "2"
tauri-plugin-http = "2"
tauri-plugin-store = "2"
tauri-plugin-dialog = "2"
```

capabilities/default.json 关键配置:
```json
"permissions": ["core:default", "opener:default", "store:default", "dialog:default",
  { "identifier": "http:default",
    "allow": [ {"url": "https://*.mihoyo.com"}, {"url": "https://*.hoyoverse.com"}, {"url": "https://*.hoyolab.com"} ] }]
```

## 2. 目录结构(前端)

```
src/
  api/       constants.ts(盐值/UA/错误码)  ds.ts(签名+自测)  headers.ts(头工厂)  http.ts(axios 管线)
  games/     types.ts  genshin.ts(biz/actId/uid→区服)  registry.ts
  stores/    settings.ts(主题/语言/deviceId → plugin-store 持久化)
  components/ui/  SButton SCard SModal SProgress(+index.ts)
  pages/     dashboard accounts launcher settings
  styles/    theme.css(色板) main.css
  layouts/MainLayout.vue(含 Logo 随机切换,规范要求保留)
```

## 3. 主题色板(theme.css 原文照抄)

提取自 docs/images/nicole.jpg:珊瑚粉主色(色相 0-17°)、暖米浅底、紫调深底。
Tailwind 4 用 `@theme inline` 内联 CSS 变量,`.dark` class 切换即生效:

```css
:root {
  --nl-bg: #faf3ea;  --nl-surface: #fffdfa; --nl-surface-2: #f5e9dd;
  --nl-text: #3d2b33; --nl-text-2: #8a6f6f;
  --nl-primary: #cc8478; --nl-primary-strong: #b46060; --nl-primary-soft: #f0ccc0;
  --nl-border: #ead9cc;
  --nl-success: #6c9352; --nl-warning: #c98f2f; --nl-danger: #c25b5b;
}
.dark {
  --nl-bg: #221628;  --nl-surface: #2f1d33; --nl-surface-2: #3c243c;
  --nl-text: #f0e4e0; --nl-text-2: #b89ca8;
  --nl-primary: #d89084; --nl-primary-strong: #e4a89c; --nl-primary-soft: #4a2f3f;
  --nl-border: #4d3844;
  --nl-success: #8db971; --nl-warning: #d9a441; --nl-danger: #d97c7c;
}
@theme inline {
  --color-base: var(--nl-bg);        /* 用 bg-base 而非 bg-bg,避免怪类名 */
  --color-surface: var(--nl-surface);
  --color-surface-2: var(--nl-surface-2);
  --color-ink: var(--nl-text);       /* text-ink / text-ink-2 */
  --color-ink-2: var(--nl-text-2);
  --color-primary: var(--nl-primary);        /* hover 用 primary-strong,选中底 primary-soft */
  --color-primary-strong: var(--nl-primary-strong);
  --color-primary-soft: var(--nl-primary-soft);
  --color-line: var(--nl-border);    /* border-line */
  --color-success: var(--nl-success); --color-warning: var(--nl-warning); --color-danger: var(--nl-danger);
}
```

settings store:theme `"light"|"dark"|"auto"`,watch 后 `document.documentElement.classList.toggle("dark", ...)`;持久化用 plugin-store 的 `load("settings.json", { autoSave: true })`,**非 Tauri 环境(纯浏览器 dev)catch 回退默认值**。deviceId 用 `crypto.randomUUID()` 首启生成持久化。

## 4. 网络管线核心

main.ts 引导顺序(血泪教训:mount 必须最先):
```ts
async function bootstrap() {
  app.mount("#app");                       // ① 先挂载,任何初始化失败都不白屏
  if ("__TAURI_INTERNALS__" in window) {
    import("@tauri-apps/api/core").then(({ invoke }) => invoke("page_ready")).catch(() => {});
    const { fetch } = await import("@tauri-apps/plugin-http").catch(() => ({ fetch: undefined }));
    if (fetch) window.fetch = fetch;       // ② 绕 CORS,业务请求前完成即可
  }
  await useSettingsStore(pinia).init().catch(...);  // ③ 失败降级
}
```

http.ts:axios `adapter: "fetch"`;`miHoYoRequest<T>()` 解包 `{retcode,message,data}`,retcode≠0 抛 `MiHoYoApiError`。已知码:`-3501` 扫码过期、`1034` 风控、`-3201` Cookie 失效、`-5003` 已签到、`-5005` 补签用尽。

## 5. DS 签名(已验证,三组向量固化在 ds.ts 的 dsSelfTest)

- Gen1:`DS = "{t},{r},{md5(salt={salt}&t={t}&r={r})}"`,r 为 6 位随机小写字母数字
- Gen2:明文追加 `&b={body}&q={query 按字典序重排}`,r 为 100000-200000(**特判 100000→642367**)
- 三个易错点:空 body 用 `"{}"`(PROD 盐);`&b=&q=` 不可省略;q 必须排序
- 验证:`dsSelfTest()` 三向量全过(node crypto 独立计算固化)

## 6. 陷阱清单(本次实测踩过)

| 陷阱 | 解法 |
|------|------|
| tsconfig 无 `paths` 而 vite 有 alias | tsconfig 加 `"paths": {"@/*": ["./src/*"]}`,**不要加 baseUrl**(TS6 已废弃) |
| js-md5 0.9 默认导入不可调用 | 具名导入 `import { md5 }` |
| `__dirname` 在 Vite 8 native configLoader 报警告 | 用 `import.meta.dirname` |
| vite config 依赖环境变量(TAURI_DEV_HOST) | **绝对禁止**,会触发 re-optimize → webview 白屏(见 003 文档) |
| 主题 token 命名 | 用 ink/line/base 而非 text/border/bg,避免 `bg-bg` 怪类名 |

## 7. 基础组件要点

- SButton:variant(primary/ghost/danger)× size(sm/md/lg)+ disabled/loading(旋转 spinner)
- SCard:`bg-surface rounded-xl border border-line shadow-sm p-4` + title/header slot
- SModal:Teleport to body + overlay 点击关闭 + Transition
- SProgress:value/max + ≥90% 自动 warning 色(warnNearFull)
