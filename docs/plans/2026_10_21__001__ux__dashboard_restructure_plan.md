# Dashboard 化重构规划(账号切换/启动/便笺总览)

> 创建日期:2026-10-21
> 状态:待评审
> 来源:用户 2026-10-20 反馈第 4/5/6/8 项(用户切换不便、多账号便笺总览、Accounts 页合并、游戏进程监控全局化)
> 关联:`docs/plans/2026_10_20__001__phase1__development_plan.md`(§3.4 目录结构)

## 1. 目标

把高频操作(切换账号/角色、启动游戏、查看全部账号便笺)集中到 Dashboard,取消独立的 Accounts 与 Launcher 页面,侧边栏收敛为 Dashboard / Settings 两项(启动游戏入口仅 Windows 显示)。

## 2. 设计

### 2.1 全局账号切换器(Header 组件)

- Dashboard 顶部常驻 `AccountSwitcher`:头像 + 当前账号昵称,点击下拉列出全部账号(头像/昵称/服别/角色数),选中即 `setCurrent`;底部「管理账号」入口展开内联的账号管理面板(现 Accounts 页能力:添加向导/刷新/删除/角色选择)。
- 角色切换:下拉内二级(当前账号的多角色横向按钮组),复用现有角色选择逻辑(preferredUid)。

### 2.2 全局启动组件(Header 组件,仅 Windows)

- `LaunchButton`:主按钮 + 状态(空闲/等待进程/运行中);点击走现有 launch 流(换票→config 写回→ShellExecute)。
- **进程监控全局化(#8 完整版)**:监控从 Launcher 页的 5s 轮询升级为应用级——`stores/launcher.ts` 持有 `isGameRunning` 状态与单一轮询定时器(5s,应用启动即开,游戏运行期间按钮禁用,退出自动恢复;可加游戏运行时长展示)。
- 启动参数配置移入 Settings 页(现 Launcher 页的参数卡);路径探测/选择保留在 Dashboard 的启动按钮旁(下拉或弹窗)。

### 2.3 便笺总览(#5)

- `NoteBoard`:当前账号全部角色逐卡展示(复用 NoteCard 核心块),支持展开/收起;非当前账号默认折叠为摘要行(头像+昵称+树脂/派遣一行概览)。
- 一键刷新:全部已展开角色的便笺 force 拉取(注意 index→dailyNote 顺序与 1034 链路按角色独立处理)。
- 数据层:`stores/notes.ts` 从单角色单份改为 `Map<uid, {note, fetchedAt, state}>`;倒计时推进逻辑不变。

### 2.4 页面与路由调整(#6/#7)

- 移除 `/accounts` 与 `/launcher` 路由;Dashboard 与 Settings 保留;侧边栏仅两项(规范 6.8 的 Logo 机制不变)。
- 账号管理(添加/删除/刷新/Cookie 粘贴)作为 Dashboard 内嵌面板保留全部现有能力。

## 3. 实施顺序(建议两次提交)

1. **stores 层**:notes 多角色化 + launcher 全局监控 store;路由/菜单收敛。
2. **UI 层**:AccountSwitcher / LaunchButton / NoteBoard / Dashboard 重排 / Settings 增参数卡;删除旧页面。

## 4. 风险

- 多角色并行拉取会放大 1034 风控概率:串行逐角色拉取,间隔 1-2s。
- AccountSwitcher 下拉是新的交互形态,保持轻量(纯 CSS 下拉,不引组件库)。
