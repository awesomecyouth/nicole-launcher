# 环境教训:macOS 26 WKWebView 白屏问题全记录

> 交接文档,依赖总览 `2026_10_20__001__handover__overview.md`
> 结论先行:**问题最终未定位**。本文记录已证实事实、已排除项与防护设施,确保新项目不重蹈覆辙。

## 1. 现象

- 浏览器访问 `http://localhost:1420/` 完全正常(Vue 挂载、主题、页面全部工作)
- `tauri dev` 的 app 窗口白屏:先出现过"只剩暖米色背景",后变为"完全空白(无背景色)"
- 同一台机器上,项目早期的手写脚手架(同样的 Tauri 2 + Vite + WKWebView)**从未出现此问题**
- 机器:macOS 26(Darwin 25.6),wry 0.57 / tao 0.37.1 / tauri 2.12.4

## 2. 已证实的事实(通过双通道观测:Rust on_page_load 日志 + vite 请求级日志 + 窗口标题心跳 + 本地上报服务器)

1. **webview 首次加载流程正常**:`page Started → Finished` 出现,vite 收到完整模块请求序列(index.html → main.ts → vue/pinia → 全部组件 → 图片),甚至 Logo 图片渲染请求与 `@tauri-apps_api_core.js`(page_ready invoke 链)都发生过——即 **mount 与渲染至少有时是成功的**
2. **vite 的整页刷新(full-reload)在 webview 上不生效**:`location.reload()` 无论 vite client 触发还是 Rust `eval()` 注入,均不产生新导航;`location.href` 赋值导航同样未观测到请求。wry 的导航策略(delegate)只按 URL 判定且放行 localhost,**拦截发生在更底层(WebKit 层),原因未明**
3. **"Re-optimizing dependencies" 与白屏强相关**:每次启动日志带这条的实例全部白屏。其触发源之一是 vite config 内容不稳定(原 config 读取 `process.env.TAURI_DEV_HOST`,不同 shell 启动哈希即变)。re-optimize 使预构建依赖旧 URL 返回 504,vite client 要求整页刷新 → reload 失效 → 卡死
4. **93MB 的 `~/Library/Caches/nicole-launcher/WebKit` 缓存清除后曾"恢复正常"一轮**(index.html → main.ts → mounted 三级探针全过),但后续重启再次白屏——清缓存不是充分修复,或存在多个叠加因素
5. **最终未解状态**:干净重启(清全部进程+缓存)后,`page Started/Finished` 正常、模块请求部分发生,但窗口标题心跳(内联 setInterval)不执行、`page_ready` invoke 未达 Rust、看门狗 eval 无效——**页面加载完成但 JS 静默不执行/死亡,无崩溃日志**(DiagnosticReports 无 WebContent 崩溃报告)

## 3. 已排除项

- ❌ 前端代码 bug(浏览器端完全正常;且曾在 webview 中完整 mounted 过)
- ❌ wry 导航策略拦截 reload(delegate 源码确认按 URL 放行)
- ❌ WebContent 进程崩溃(无 crash log,进程存活)
- ❌ CORS/网络(webview 与 vite 的 TCP 连接与 HTTP 请求均正常发生)
- ❌ tauro#15517 的 tao panic(版本已高于影响范围,且无 panic 日志)
- ❌ IPv6 解析问题(webview 实际用 127.0.0.1 连接,lsof 证实)

## 4. 防护设施(全部值得带入新项目)

1. **mount 前置**:任何 Tauri 侧初始化(plugin-http fetch 替换、settings IPC)都不得阻塞 `app.mount`——初始化失败只降级不白屏
2. **页面错误红条**:`index.html` 内联全局 `error`/`unhandledrejection` 钩子,把未捕获错误渲染为页面底部红条(WKWebView 无控制台时的第一排障入口)
3. **vite config 稳定性原则**:配置**禁止依赖环境变量/动态内容**,否则触发 re-optimize 连锁
4. **devtools**:`tauri` 加 `devtools` feature + debug 启动时 `win.open_devtools()` 自动打开 WebKit inspector(注意:打包发布前移除 feature)
5. **dev 看门狗**:Rust `page_ready` command(前端 mount 后 invoke)+ 8 秒未就绪自动强制重载。**注意:本次实测 eval 导航亦无效,看门狗未能救活——带入新项目时优先改用 `Webview::navigate()`(原生 load URL,绕过 JS)或销毁重建窗口**
6. **诊断基建复用思路**:vite middleware 请求日志插件、`on_page_load` println、窗口标题心跳(可用 AppleScript 无损读取)——下次排障直接组装,不必重搭

## 5. 新项目检查清单(按优先级)

1. `git init` + 每个可用状态提交(本次最大遗憾:没有"最后已知好状态"可回退)
2. 空壳项目先跑通 `tauri dev`(窗口正常显示 + inspector 能开),**作为基线提交**
3. 每引入一类变更(依赖/插件/配置/代码)立即验证 + 提交,**一次只变一个变量**
4. 引入 plugin-http/store/dialog 后立即验证 webview(不只验证浏览器)
5. 保留 `index.html` 错误红条与 main.ts mount 前置结构(照抄 M0 快照)
6. 首次白屏时:立即看 inspector 红条/console → 查启动日志有无 "Re-optimizing" → 清 `~/Library/Caches/<bundle-id>` → 重启;仍不行则 `git bisect` 回基线
7. 如新项目空壳也白屏:则是本机 WebKit/工具链环境问题(与代码无关),考虑升级 macOS 补丁 / cargo clean 冷构建 / 换设备验证

## 6. 未解之谜(留给新项目排查时参考)

- WKWebView reload/导航静默失效的确切机制(怀疑 macOS 26 WebKit 回归或与 wry 的 IPC 注入交互)
- 为何"模块图全加载、渲染请求发生,但 JS 静默死亡"(最后未解状态)
- 多实例开发(用户前台 + 助手后台交替跑 tauri dev)是否加剧了缓存/状态损坏
