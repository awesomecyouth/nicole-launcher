# M2 启动游戏任务

> 依赖计划:`docs/plans/2026_10_20__001__phase1__development_plan.md`(§5.3、§6.2、§6.3)
> 前置任务:`docs/tasks/2026_10_20__002__account__m1_account_management_tasks.md`(M1 全部完成,需要当前账号/角色)
> 总体状态:**代码完成(2026-10-20);mac 上 disabled 态/参数卡已人工确认,Windows 真机验收待用户反馈**

## 任务清单

| 编号 | 任务 | 状态 |
|------|------|------|
| M2-T1 | Rust `detect_game_path`:Windows 扫描 Unity output_log 提取游戏目录 | ✅ 已实现(待 Windows 实测) |
| M2-T2 | Rust config.ini 读写:channel/sub_channel 读取、写回(带备份) | ✅ 已实现(待 Windows 实测) |
| M2-T3 | Rust `launch_game(exe, args)`:std::process 启动、运行中检测 | ✅ 已实现(待 Windows 实测) |
| M2-T4 | `api/auth-ticket.ts` 换票:国服/国际服双实现 + 启动参数拼装 | ✅ 已实现(待 Windows 实测) |
| M2-T5 | 启动页 UI:路径状态与手动选择(plugin-dialog)、区服显示、参数开关、启动按钮与状态反馈 | ✅ 已实现(非 Windows 禁用态已确认) |

## 实施备注(2026-10-20)

- **用户决策**:保留 Snap.Hutao 的命令行参数传入与米游社账号免登票据;**注入类功能完全移除**(FOV/帧率/去雾/Island/提权挂起等一概不实现)。参数集与拼装顺序照 `GameProcessFactory`:`-popupwindow`/`-window-mode exclusive`/`-screen-fullscreen`/`-screen-width`/`-screen-height`/`-monitor`/`login_auth_ticket=`(等号连接)。
- 非 Windows:路径探测/选择/启动一律 disabled(顶部提示条),启动参数仍可配置并持久化。
- 区服方案:国服官服 `1/1`、国际服 `1/0`(KnownLaunchSchemes 非兼容主流值);B 服(`PCGameSDK.dll` 存在)不换票不写回,裸启动并提示。
- Rust 检测:output_log 路径解析为手工引号回溯(不引 regex 依赖);`tasklist`(Win)/`pgrep`(其他)判运行。
- 启动不提权(std::process 直接 spawn);若 Windows 实测因 UAC 失败,再评估是否改 ShellExecute runas。
- 换票:国服 `createAuthTicketByGameBiz`(LToken cookie + fp,body uid 为数字);国际服 `createAuthTicketBySToken`(device_id 头,无 Cookie);均 HYP UA、无 DS,与参考实现一致。

## Windows 首测反馈与修复(2026-10-20)

- **账号添加偶发失败**(error sending request,重试即成功;用户环境直连无代理):网络层对 reqwest 连接类错误自动重试一次(500ms 间隔),并补 10s connectTimeout(插件默认无连接超时;axios timeout 在自定义 adapter 下无效)。写入 `src/api/tauri-fetch.ts`。
- **启动报 os error 740(需要提升)**:游戏 exe manifest 要求管理员,CreateProcess 拒绝。Windows 分支改用 ShellExecuteW `runas` verb(手写 FFI 零依赖,传工作目录,UAC 弹窗授权),与参考实现一致;macOS 分支维持 std::process。已用 `cargo check --target x86_64-pc-windows-gnu` 交叉验证(edition 2024 需 `unsafe extern`)。
- **新增运行日志**:`append_log` command 写入系统日志目录 `nicole.log`(Windows 在 `%LOCALAPPDATA%\app.cyouth.nicole\logs\`);红条错误与网络重试自动记录,后续 Windows 排障直接看该文件。
- 首测通过项:扫码与 Cookie 添加账号(重试后)、删除账号、便笺/签到数据正常。待复测:一键启动(UAC 弹窗后游戏拉起 + 免登)、config.ini 写回。

## 实现要点

### M2-T1 路径发现(src-tauri/src/game_path.rs)

1. 读 `%APPDATA%/../LocalLow/miHoYo/Genshin Impact/output_log.txt`(国际服优先),不存在再读 `.../miHoYo/原神/output_log.txt`。
2. 正则 `".:(?:\\|/).+(?:GenshinImpact|YuanShen)(?=_Data)"` 提取 warmup 行中的安装目录,拼 `GenshinImpact.exe` / `YuanShen.exe` 验证存在。
3. 扫描失败/macOS → 返回空;用户经 plugin-dialog 手动选择(过滤器 exe;mac 下允许 .app)。
4. 结果(exe 路径 + 识别出的国服/国际服)存 settings store。

### M2-T2 config.ini(src-tauri/src/game_config.rs)

- 路径:exe 同目录 `config.ini`;解析 `[general]` 段 `channel`/`sub_channel`。
- 已知方案(节选,完整表见 plan 调研):国服官服 `1/1`、B 服 `14/0`、国际服 `1/0`(以 KnownLaunchSchemes 为准实现常量)。
- 启动前若目标区服与当前不一致:先复制 `config.ini → config.ini.bak`,再写回目标 channel/sub_channel。
- B 服检测:存在 `YuanShen_Data/Plugins/PCGameSDK.dll` 即提示"B 服不支持票据启动",仅允许裸启动。

### M2-T3 进程启动(src-tauri/src/launch.rs)

- `#[tauri::command] launch_game(exe: String, args: Vec<String>) -> Result<LaunchReport, String>`,std::process::Command,不提权、不注入、不挂起。
- `is_game_running()`:遍历进程名(`YuanShen`/`GenshinImpact`)判断运行中,启动前检查、启动后轮询确认退出。
- 平台差异:Windows 主场景;macOS 允许启动选择的可执行文件(国际服 mac 客户端场景),失败信息原样透出。

### M2-T4 换票与参数(api/auth-ticket.ts + stores/launcher)

**换票(无 DS,HYP 预设头):**

| 项 | 国服 | 国际服 |
|----|------|--------|
| 端点 | POST `passport-api.mihoyo.com/account/ma-cn-verifier/app/createAuthTicketByGameBiz` | POST `sg-public-api.hoyoverse.com/account/ma-verifier/api/createAuthTicketBySToken` |
| 头 | UA `HYPContainer/1.1.4.133`、`x-rpc-app_id: ddxf5dufpuyo`、`client_type: 3`;Cookie `ltoken;ltuid` | 同 UA、`x-rpc-app_id: ddxf6vlr1reo`、client_type 3、`device_id: {53位}`(无 Cookie) |
| Body | `{"game_biz":"hk4e_cn","mid":..,"stoken":..,"uid": aid}` | `{"biz_name":"hk4e_global","mid":..,"stoken":..}` |
| 响应 | `data.ticket` | `data.ticket` |

前置检查:账号 isOversea 与游戏 exe 国/国际一致,不一致时提示且不换票。

**参数拼装(前端完成):**

- 必带:`login_auth_ticket=<ticket>` —— **等号连接,参数名前无 `-`**。
- 可选开关(settings store 持久化):`-screen-fullscreen 0/1`(总开关开启时始终附加)、`-screen-width N`、`-screen-height N`、`-popupwindow`、`-window-mode exclusive`、`-monitor N`(1-based)。
- Unity 参数用空格分隔,与 `login_auth_ticket` 一起交给 `launch_game`。

### M2-T5 启动页

- 展示:当前账号昵称 + 当前角色(UID/区服)、游戏路径与识别结果(未找到 → "重新检测 / 手动选择"按钮)、参数开关组、大号"启动"按钮。
- 启动流程反馈:换票中 → 启动中 → 已启动(游戏运行中禁用按钮);每步失败给出可读错误(票据失败/路径无效/已在运行)。

## 验收标准

- Windows 真机:选中角色的国服账号一键启动,游戏内免登进入对应账号,config.ini 正确写回且留有 .bak。
- 国际服路径:换票请求走 sg-public-api 域名,启动参数格式一致。
- 区服/账号不匹配、游戏运行中、路径缺失三种异常均有明确提示且不误启动。
- B 服目录下不发起换票,提示裸启动。
