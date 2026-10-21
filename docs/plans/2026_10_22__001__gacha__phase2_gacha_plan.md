# 二期规划:祈愿记录获取、展示与 UIGF v4.2 导出

> 创建日期:2026-10-22
> 状态:待评审
> 依据:`docs/project-spec.md` 第 6.3 条(规划中功能);接口行为来自 Snap.Hutao 1.16.5 源码调研(ApiEndpoints.csv / GachaInfoClient / GachaLogQuerySTokenProvider);UIGF 格式来自 [uigf.org v4.2 标准](https://uigf.org/zh/standards/uigf.html)

## 1. 目标与范围

| # | 功能 | 说明 |
|---|------|------|
| 1 | 祈愿记录获取 | stoken → genAuthKey → getGachaLog 全卡池分页拉取(增量合并) |
| 2 | 本地存储 | 按 uid 持久化(plugin-store,`gacha:{uid}`) |
| 3 | 展示 | 独立 Gacha 页:每角色统计卡(总抽数/五星数/保底进度)+ 卡池筛选记录列表 |
| 4 | 导出 | UIGF v4.2 单文件 JSON(plugin-dialog 保存) |

不在本期范围:国际服 SToken 换取 authkey(Snap 的 SToken 路径同样仅支持国服,需 OSLK2 盐,交接文档已注明未取得;国际服用户可走「导入 UIGF」兜底,导入功能列为增强)、千星奇域等其他游戏数组。

## 2. API 细节(源码已核对)

### 2.1 genAuthKey(每次刷新现取,免维护有效期)

| 项 | 值 |
|----|----|
| 端点 | POST `api-takumi.mihoyo.com/binding/api/genAuthKey` |
| 头 | SToken cookie + DS **Gen1/LK2**(与 action_ticket 同族) |
| Body | `{"auth_appid":"webview_gacha","game_biz":"hk4e_cn","game_uid":<int>,"region":<区服>}` |
| 响应 | `data: {authkey, authkey_ver, sign_type}` |

### 2.2 getGachaLog(分页)

| 项 | 值 |
|----|----|
| 端点 | GET `public-operation-hk4e.mihoyo.com/gacha_info/api/getGachaLog?{query}`(无特殊头) |
| Query | `lang=zh-cn&auth_appid=webview_gacha&authkey=..&authkey_ver=1&sign_type=2&gacha_type=..&size=20&end_id=..` |
| 卡池 | 100 新手 / 200 常驻 / 301 角色 / 302 武器 / 400 集录(500 城市池预留) |
| 分页 | 每页取末条 `id` 作 `end_id` 续拉,直到返回 < 20 条;**页间 300ms 限速** |
| 响应 | `data.list[]: {uid, gacha_type, item_id, count, time, name, lang, item_type, rank_type, id}`(id 为长数字字符串,全局唯一且单调) |

已知错误码:authkey 失效(-101 等)→ 重新 genAuthKey 重试一次。

### 2.3 增量合并

- 本地按 uid 存 `items`(按 id 升序);刷新时逐卡池拉取,遇 `id ≤ 本地该池最大 id` 即止(提前停止)。
- 新旧合并按 id 去重;`end_id` 起点用本地全池最大 id。

## 3. UIGF v4.2 导出

```jsonc
{
  "info": {
    "export_timestamp": "<秒级时间戳>",      // 必填
    "export_app": "Nicole Launcher",        // 必填
    "export_app_version": "<app 版本>",      // 必填
    "version": "v4.0"                        // 必填,标准版本
  },
  "hk4e": [{
    "uid": "<uid>", "timezone": 8, "lang": "zh-cn",   // CN=8;timezone 按区服(os_* 按大区)
    "list": [{
      "uigf_gacha_type": "301",   // 400(祈愿二)归并为 301(共享保底),其余同 gacha_type
      "gacha_type": "400", "item_id": "..", "count": "1",
      "time": "YYYY-MM-DD HH:mm:ss", "name": "..", "item_type": "..",
      "rank_type": "5", "id": "<纯数字,id 1-19 位>"
    }]
  }]
}
```

要点:list 各字段输出为字符串;`time` 保持米哈游原始格式;id 保持原值。文件命名:`UIGF_v4.0_<uid>.json`(dialog 保存,默认文件名预填)。

## 4. UI 设计

- 菜单新增 **Gacha**(Dashboard 与 Accounts 之间,低频查看)。
- 页面结构(卡片网格,同 Accounts 风格):
  - 每角色一张祈愿卡:总抽数 / 五星数(及出货率)/ 四星数 / 最近五星距今年限;卡内按池 tab(全部/角色/武器/常驻/新手/集录)显示最近 N 条(分页加载)。
  - 卡头操作:刷新(增量)、导出 UIGF、清空(确认弹窗)。
- 复用现有组件体系(SCard/SButton/SModal/SProgress);列表行:物品名、星级色(5=primary-strong/金系)、池类型、时间。

## 5. 数据模型

```ts
interface GachaItem {
  id: string          // 排序与去重键
  gachaType: number   // 100/200/301/302/400
  itemId: string
  name: string
  itemType: string    // 角色or武器
  rankType: number    // 3/4/5
  time: string        // YYYY-MM-DD HH:mm:ss
}
// plugin-store: gacha:{uid} → { items: GachaItem[]; updatedAt: number }
```

## 6. 任务划分与顺序

| 编号 | 任务 |
|------|------|
| G1 | `api/gacha.ts`:genAuthKey + 分页拉取(限速、authkey 失效重取) |
| G2 | `stores/gacha.ts`:per-uid 增量合并与持久化 |
| G3 | Gacha 页 UI(统计卡 + 池 tab 列表 + 刷新/清空) |
| G4 | UIGF v4.2 导出(构造 + dialog 保存) |
| G5 | 文档收尾 |

## 7. 风险

| 风险 | 应对 |
|------|------|
| 分页请求过快触发风控 | 页间 300ms;失败可续(end_id 断点即本地最大 id) |
| authkey/DS 细节偏差 | Gen1/LK2 已有实现且 action_ticket 链路验证过同族签名 |
| 大记录量 UI 卡顿 | 列表分页渲染(每页 50),不引虚拟滚动库 |
| 国际服 | V2.1 不支持换取(缺 OSLK2),文档明示;UIGF 导入兜底列为增强 |
