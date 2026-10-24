# Nicole Launcher

基于 Tauri 2 + Vue 3 的米哈游游戏启动器（当前支持原神），轻量、跨平台（macOS / Windows）。

以《原神》角色**尼可（Nicole）**命名，主体色取自角色形象提炼的珊瑚粉色系，支持日间 / 夜间 / 跟随系统三种主题模式。

## 功能

- **账号管理**：米游社账号添加（扫码 / Cookie 粘贴）、凭据派生与自动刷新、多账号切换、Cookie 一键复制
- **每日签到**：签到状态与月历奖励展示、一键签到、触发风控时弹出极验滑块手动验证
- **实时便笺**：树脂 / 洞天宝钱 / 委托 / 周本 / 探索派遣 / 参量质变仪，多账号多角色总览，倒计时本地推进，可选自动刷新
- **启动游戏**（仅 Windows）：自动探测 / 手动选择游戏路径，自动换取登录票据免登启动，区服方案自动写回（含备份），启动参数可配置；游戏运行状态全局监控
- **祈愿记录**：全卡池拉取（增量合并）、按池统计（五星率 / 距上次五星等）、[UIGF v4](https://uigf.org/zh/standards/uigf.html) 格式导入 / 导出

### 区服支持说明

| 功能 | 国服 | 国际服 (HoYoLAB) |
|------|:----:|:----:|
| 账号添加 | 扫码 / Cookie | Cookie 粘贴 |
| 每日签到 / 实时便笺 / 启动游戏 | ✅ | ✅ |
| 祈愿记录直接拉取 | ✅ | ❌（可导入 UIGF 文件，导出不受影响） |

## 下载

前往 [Releases](../../releases) 获取对应平台安装包（推送 `v*` 标签时由 CI 自动构建）：

| 平台 | 产物 |
|------|------|
| macOS (Apple Silicon) | `NicoleLauncher_v<version>_macOS_aarch64.dmg` |
| Windows x64 | `NicoleLauncher_v<version>_Windows_x64-setup.exe` |
| Windows ARM64 | `NicoleLauncher_v<version>_Windows_arm64-setup.exe` |

> macOS 安装包未签名 / 未公证，首次打开请右键 →「打开」，或在「系统设置 → 隐私与安全性」中允许。

## 开发

```bash
pnpm install
pnpm tauri dev    # 开发调试
pnpm tauri build  # 本地构建
```

## AI 声明

**本项目的全部代码由 AI 编写完成**，由 [Claude CLI](https://claude.com/claude-code)（Anthropic）与 GLM-5.3（Z.ai）协作产出，人类角色为需求定义、方案评审与真机验收。

## 鸣谢

- [Snap.Hutao](https://github.com/SnapHutaoRemasteringProject/Snap.Hutao.Remastered) — 接口行为参考与 API 调研
- [mihoyo-api-sdk](https://github.com/UIGF-org/mihoyo-api-sdk)（UIGF-org）— 米哈游接口规范交叉验证
- [UIGF](https://uigf.org/) — 统一可交换祈愿记录标准
- [Tauri](https://tauri.app/) — 应用框架

## 免责声明

本项目为非官方社区工具，与 miHoYo / HoYoverse 无任何关联。「原神」、米游社及相关角色（含 Nicole）的名称与形象版权归 miHoYo 所有。本项目仅供个人学习与交流使用，请勿用于任何商业用途；使用本项目产生的任何后果由使用者自行承担。
