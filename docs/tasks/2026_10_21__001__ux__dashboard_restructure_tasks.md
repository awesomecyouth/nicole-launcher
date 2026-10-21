# Dashboard 化重构任务

> 依赖计划:`docs/plans/2026_10_21__001__ux__dashboard_restructure_plan.md`
> 前置任务:M0-M4 全部完成(`docs/tasks/2026_10_20__001~005`)
> 总体状态:**未开始**

## 任务清单

| 编号 | 任务 | 状态 |
|------|------|------|
| D-T1 | `stores/launcher.ts`:应用级游戏进程监控(`isGameRunning` 状态 + 单一 5s 轮询定时器,应用启动即开;附带运行起点时间供展示运行时长) | ⬜ 未开始 |
| D-T2 | `stores/notes.ts` 多角色化:数据改为 `Map<uid, {note, fetchedAt, state, errorMsg}>`(保留按 uid 磁盘持久化与倒计时基准);多角色刷新**串行 + 1-2s 间隔**(防 1034 放大) | ⬜ 未开始 |
| D-T3 | `AccountSwitcher` 全局组件:Dashboard 顶部常驻,头像+昵称,下拉列全部账号(切换 setCurrent)/当前账号角色组(preferredUid)/「管理账号」展开内嵌管理面板(添加向导/刷新/删除,复用现 Accounts 页能力) | ⬜ 未开始 |
| D-T4 | `LaunchButton` 全局组件(仅 Windows 渲染):消费 launcher store(运行中禁用/退出恢复),点击走现 launch 流(换票→config 写回→ShellExecute→等待进程);路径探测/选择入下拉;启动参数卡迁至 Settings 页 | ⬜ 未开始 |
| D-T5 | `NoteBoard` 便笺总览:当前账号全部角色逐卡展示(复用 NoteCard 核心块),其他账号折叠为摘要行(头像+昵称+树脂/派遣一行),一键刷新(串行 force) | ⬜ 未开始 |
| D-T6 | 路由与页面收敛:移除 `/accounts`、`/launcher` 路由与页面文件,侧边栏仅 Dashboard / Settings;全局清理死引用 | ⬜ 未开始 |

## 实施约束

- 提交节奏按 plan §3:先 D-T1/D-T2(stores 层,一次 commit),再 D-T3~D-T6(UI 层,可按组件分次 commit)。
- 下拉菜单纯 CSS/条件渲染实现,不引组件库(规范 §3/§4)。
- Logo 随机与点击切换机制(规范 6.8)在布局调整中原样保留。
- 便笺骨架屏、本地缓存优先、「打开时刷新」设置等既有行为不变,仅数据结构多角色化。

## 实施要点

### D-T1 launcher store

```ts
// stores/launcher.ts 骨架
export const useLauncherStore = defineStore('launcher', () => {
  const isGameRunning = ref(false)
  const runningSince = ref(0)   // 进程出现时刻,供运行时长展示
  let timer: number | undefined
  function setupMonitor(): void {  // main.ts 初始化时调用;5s 轮询 invoke('is_game_running')
    // 运行→空闲边界时更新 runningSince
  }
})
```

- Launcher 页现有的页面级 `processMonitor` 与启动等待循环在 D-T4/D-T6 中移除,统一消费本 store。

### D-T2 notes store 数据结构

```ts
const notesMap = ref<Record<string, { note: DailyNote; fetchedAt: number }>>({})
const states = ref<Record<string, NoteState>>({})   // per-uid 状态
```

- 现有 `note/fetchedAt/state` 单值字段改为当前角色视图(computed 取 `currentRole.uid` 对应项);NoteCard 消费接口尽量不变以减少 UI 改动。
- 持久化 key 不变(`note:{uid}`),天然兼容多角色。
- 一键刷新(D-T5)逐角色 `load(uid, force)`,`await new Promise(r => setTimeout(r, 1500))` 间隔。

### D-T3 AccountSwitcher

- 纯手写下拉:外层 `relative` 容器 + 点击切换 `open`,点击外部关闭(可选 `@blur`/document click,保持简单可用 document click 委托)。
- 管理面板:复用 `AddAccountModal` 与账号列表操作(设为当前/刷新/删除确认),从现 Accounts 页迁移为组件 `AccountManagePanel`。

### D-T4 LaunchButton

- `settings.isWindows === false` 时整个组件不渲染(mac 上 Dashboard 无启动区)。
- 下拉项:「重新探测」「选择主程序」;游戏路径与识别结果常驻按钮旁小字。
- 启动状态机沿用现 launcher 页(换票中→写回区服→等待进程→运行中),错误提示就地展示。

### D-T5 NoteBoard

- 展开态角色卡 = 现 NoteCard 内容;折叠态摘要行 = 头像 + 昵称 + `树脂 x/y` + 最早结束的派遣倒计时。
- 其他账号(非当前)默认折叠整组,组头显示账号昵称 + 角色数,点击展开再拉取(首次展开才请求)。

### D-T6 收敛清单

- 删除:`src/pages/accounts/`、`src/pages/launcher/`、对应路由、菜单数组收敛为两项。
- `settings.launchOptions` 参数卡 UI 迁入 Settings(逻辑不变)。
- 回归:夜间模式、Logo 切换、极验子窗口、错误红条不受影响。

## 验收标准

- 切换账号/角色全程在 Dashboard 完成,无页面跳转;添加/删除/刷新账号能力不缺失。
- 游戏启动后全局按钮禁用、进程退出 ≤5s 恢复;应用任何页面可见运行状态。
- 便笺总览正确展示多账号多角色;一键刷新串行无 1034 放大;骨架屏/本地缓存/打开时刷新行为不回退。
- mac 上无启动相关 UI;Windows 上路径探测/选择/启动全流程可用。
- 路由收敛后无死链;`pnpm build` 零报错。
