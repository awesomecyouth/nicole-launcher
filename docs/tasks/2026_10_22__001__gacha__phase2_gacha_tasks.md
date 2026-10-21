# 二期任务:祈愿记录

> 依赖计划:`docs/plans/2026_10_22__001__gacha__phase2_gacha_plan.md`
> 前置任务:第一期全部完成(M0-M4、Dashboard 化重构)
> 总体状态:**未开始**

## 任务清单

| 编号 | 任务 | 状态 |
|------|------|------|
| G1 | `api/gacha.ts`:genAuthKey(SToken + Gen1/LK2,body webview_gacha)+ getGachaLog 分页(逐池拉取、end_id 断点、页间 300ms、authkey 失效重取一次) | ⬜ 未开始 |
| G2 | `stores/gacha.ts`:per-uid items(id 升序)+ 增量合并去重 + `gacha:{uid}` 持久化 + 统计 computed(总抽数/五星数/四星数/最近五星) | ⬜ 未开始 |
| G3 | Gacha 页(菜单加项):每角色统计卡 + 池 tab 分页列表(每页 50)+ 刷新(增量)/清空(确认) | ⬜ 未开始 |
| G4 | UIGF v4.2 导出:info + hk4e 构造(400→uigf_gacha_type 301、字段字符串化、timezone 按区服)+ plugin-dialog 保存(默认文件名 `UIGF_v4.0_<uid>.json`) | ⬜ 未开始 |
| G5 | 文档收尾与真机验收 | ⬜ 未开始 |

## 实施约束

- 仅国服 SToken 换取路径;国际服在 UI 中禁用刷新并提示(导出仍可用已有数据)。
- 分页限速 300ms;请求全部走 `miHoYoRequest`(tauri-fetch 通道)。
- 列表分页渲染,不引虚拟滚动等新依赖。
