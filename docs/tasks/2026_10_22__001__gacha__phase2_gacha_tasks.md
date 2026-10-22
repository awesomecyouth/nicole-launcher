# 二期任务:祈愿记录

> 依赖计划:`docs/plans/2026_10_22__001__gacha__phase2_gacha_plan.md`
> 前置任务:第一期全部完成(M0-M4、Dashboard 化重构)
> 总体状态:**已完成(2026-10-22,国服账号真机验收:拉取/增量/账号隔离/卡池卡片/UIGF 导出)**

## 任务清单

| 编号 | 任务 | 状态 |
|------|------|------|
| G1 | `api/gacha.ts`:genAuthKey(SToken + Gen1/LK2,body webview_gacha)+ getGachaLog 分页(逐池拉取、end_id 断点、页间 300ms、authkey 失效重取一次) | ✅ 已完成(真机验收) |
| G2 | `stores/gacha.ts`:per-uid items(id 升序)+ 增量合并去重 + `gacha:{uid}` 持久化 + 统计 computed(总抽数/五星数/四星数/最近五星) | ✅ 已完成(统计移至组件层) |
| G3 | Gacha 页(菜单加项):每角色统计卡 + 池 tab 分页列表(每页 50)+ 刷新(增量)/清空(确认) | ✅ 已完成(改为卡池卡片平铺,见备注) |
| G4 | UIGF v4.2 导出:info + hk4e 构造(400→uigf_gacha_type 301、字段字符串化、timezone 按区服)+ plugin-dialog 保存(默认文件名 `UIGF_v4.0_<uid>.json`) | ✅ 已完成(真机验收) |
| G5 | 文档收尾与真机验收 | ✅ 已完成 |

## 实施备注(2026-10-22)

- **页面范围(用户要求)**:仅展示当前账号(随左下角头像菜单切换),进入/切换只从磁盘恢复数据展示;网络刷新仅手动(全量拉取代价高,之后增量秒级完成)。
- **卡池语义勘误(验收中发现)**:400 为「祈愿二」(5.0 双角色池第二条,与 301 共享保底;Snap 注释 SpecialActivityAvatar),500 为「集录」(社区共识,Snap 枚举名 ActivityCity 有误导);UI 展示层将 301+400 合并为「角色」分组统计——与 UIGF 的 400→uigf_gacha_type 301 归并规则同源,导出仍保留原始 gacha_type。
- **布局演进**:初版"池 tab + 统计隔离"经用户反馈改为**卡池卡片平铺**(Dashboard 同风格 auto-fill 网格),每卡自带统计(五星/四星/五星率/距上次五星/最早记录)与 50 条分页列表。
- 写文件经 Rust `save_text_file` command(避免为此引入 fs 插件);导出文件写入经 dialog 选路径。
- 国际服直接拉取仍不支持(缺 OSLK2 盐,入口报错提示);UIGF 导入列为后续增强。

## 实施约束

- 仅国服 SToken 换取路径;国际服在 UI 中禁用刷新并提示(导出仍可用已有数据)。
- 分页限速 300ms;请求全部走 `miHoYoRequest`(tauri-fetch 通道)。
- 列表分页渲染,不引虚拟滚动等新依赖。
