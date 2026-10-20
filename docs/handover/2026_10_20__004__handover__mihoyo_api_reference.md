# 米哈游接口速查(新项目日常查表)

> 交接文档,来源:Snap.Hutao 1.16.5 源码四路调研 + 社区盐值交叉验证(2026-10-20)
> 详细规划见 `plans/2026_10_20__001__phase1__development_plan.md`,各功能实现要点见 `tasks/` 对应文档

## 1. 盐值与客户端常量(已交叉验证:X4/X6/PROD 双源一致)

| 常量 | 值 | 用途 |
|------|----|------|
| X4 | `xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs` | 便笺/game_record,Gen2 |
| X6 | `t0qEgfub6cvueAPgR5m9aQWWVciEer7v` | widget v2,Gen2 |
| PROD | `JwYDpKvLj6MrMqqYU6jTKF17KNO2PXoS` | token 派生,Gen2 |
| OSX4 | `h4c1d6ywfq5bsbnbhm1bzq7bxzzv6srt` | 国际服便笺 |
| OSX6 | `okr4obncj8bw5a65hbnn5oo6ixjc3l9w` | 国际服 widget |
| LK2 | `EJncUPGnOHajenjLhBOsdpwEMZmiCmQX` | 国服签到/action_ticket,Gen1(社区源,签名失败先核对) |
| K2 | `rtvTthKxEyreVXQCnhluFgLXPOFKPHlA` | Gen1(社区源,同上) |

| 常量 | 值 |
|------|----|
| BBS UA | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) miHoYoBBS/{app_version}`(client_type=5,带 x-rpc-app_version/device_id) |
| HYP UA | `HYPContainer/1.1.4.133`(扫码/换票,client_type=3,device_id=53 位随机小写字母数字) |
| 换票 app_id | 国服 `ddxf5dufpuyo` / 国际服 `ddxf6vlr1reo` |
| 签到 act_id | 国服 `e202311201442471` / 国际服 `e202102251931481` |
| game_biz | `hk4e_cn` / `hk4e_global` |
| app_version 起始值 | `2.71.1`(可配置,随米游社版本更新) |

## 2. DS 签名(实现与自测向量已固化,照抄 ds.ts)

```
DS 头格式: "{t},{r},{md5hex小写}"
Gen1: md5("salt={salt}&t={t}&r={r}")                r=6位随机小写字母数字
Gen2: md5("salt={salt}&t={t}&r={r}&b={body}&q={query字典序排序}")
      r=100000-200000 随机数(特判 100000→642367);空 body 用 "{}"(PROD);GET 空 query 仍拼 "&q="
```

Cookie 拼装:SToken=`stoken;stuid;mid` / LToken=`ltoken;ltuid` / CookieToken=`account_id;cookie_token`;有 fingerprint 附 `x-rpc-device_fp`。

## 3. 账号体系(M1)

**凭据模型**:`stoken(v2)+stuid+mid` 是唯一长期根凭据;ltoken/cookie_token(1 天)/device_fp(7 天,国服)惰性派生。按 `mid` 去重。

| 用途 | 端点 | 鉴权/DS |
|------|------|---------|
| 扫码创建 | POST `passport-api.mihoyo.com/account/ma-cn-passport/app/createQRLogin` | HYP 头,无 DS;返回 `data.url/ticket` |
| 扫码轮询(3s) | POST `.../queryQRLoginStatus` body `{ticket}` | 同上;`Confirmed`+`token_type==1`→stoken;`-3501` 过期重建 |
| stoken→cookie_token | 国 GET / OS POST `passport-api.mihoyo.com/account/auth/api/getCookieAccountInfoBySToken`(OS 域 `api-account-os.hoyoverse.com`,body `{stoken,uid}`) | SToken cookie;国 Gen2/PROD,OS 无 |
| stoken→ltoken | `.../account/auth/api/getLTokenBySToken` | 同上 |
| 用户信息 | GET `bbs-api.mihoyo.com/user/wapi/getUserFullInfo?uid={aid}&gids=2` | 无 cookie,Referer bbs.mihoyo.com |
| action_ticket | GET `api-takumi.mihoyo.com/auth/api/getActionTicketBySToken?action_type=game_role&...` | SToken + Gen1/K2 |
| 角色列表(国) | GET `api-takumi.mihoyo.com/binding/api/getUserGameRoles?action_ticket=..&game_biz=hk4e_cn` | LToken |
| 角色列表(OS) | GET `api-os-takumi.hoyoverse.com/binding/api/getUserGameRolesByCookie?game_biz=hk4e_global` | LToken |
| device_fp | POST `public-data-api.mihoyo.com/device-fp/api/getFp`(伪造安卓设备 JSON) | 无 |

角色字段:`game_biz, region, game_uid, nickname, level, is_chosen, region_name, is_official`。

## 4. 启动游戏换票(M2,均无 DS)

| 项 | 国服 | 国际服 |
|----|------|--------|
| 端点 | POST `passport-api.mihoyo.com/account/ma-cn-verifier/app/createAuthTicketByGameBiz` | POST `sg-public-api.hoyoverse.com/account/ma-verifier/api/createAuthTicketBySToken` |
| 头 | HYP UA、app_id `ddxf5dufpuyo`、client_type 3、Cookie `ltoken;ltuid` | 同 UA、app_id `ddxf6vlr1reo`、device_id(53 位)、无 Cookie |
| Body | `{"game_biz":"hk4e_cn","mid":,"stoken":,"uid":aid}` | `{"biz_name":"hk4e_global","mid":,"stoken":}` |
| 响应 | `data.ticket` → 启动参数 `login_auth_ticket=<ticket>`(**等号连接,无 `-` 前缀**) | 同 |

启动参数拼装在前端:必带 `login_auth_ticket=<t>`;可选 `-screen-fullscreen 0/1`、`-screen-width/-height N`、`-popupwindow`、`-window-mode exclusive`、`-monitor N`(Unity 参数空格分隔)。游戏路径:Windows 扫 `%APPDATA%/../LocalLow/miHoYo/{Genshin Impact,原神}/output_log.txt` 正则提取,或手动选择;区服 = exe 同目录 `config.ini` 的 `channel/sub_channel`(写回前备份)。B 服(存在 `PCGameSDK.dll`)无票据方案。

## 5. 每日签到(M3)

域名:国 `api-takumi.mihoyo.com/event/luna` / OS `sg-hk4e-api.hoyoverse.com/event/sol`。

| 接口 | 方法 | DS | 响应要点 |
|------|------|----|----------|
| `/{luna|sol}/home?act_id=` | GET | 无 | `month, awards[{icon,name,cnt}]` |
| `/{luna|sol}/info?act_id&uid&region` | GET | 国 Gen1+LK2;OS 无 | `total_sign_day, is_sign, today` |
| `/{luna|sol}/sign` | POST `{act_id,region,uid}` | 同上 | `success, risk_code, gt, challenge` |

国服每请求附 `x-rpc-signgame: hk4e`;鉴权 CookieToken。`-5003` 已签(非错误)。风控(gt/challenge):提示 + opener 打开官方页兜底(国 `act.mihoyo.com/bbs/event/signin/hk4e/index.html?act_id=e202311201442471` / OS `act.hoyolab.com/ys/event/signin-sea-v3/index.html?act_id=e202102251931481`)。已签判定以服务端 `is_sign` 为准,不本地去重。

## 6. 每日便笺(M4)

`GET {api-takumi-record.mihoyo.com | bbs-api-os.hoyolab.com}/game_record/app/genshin/api/dailyNote?role_id={uid}&server={region}`;**先请求同目录 `index` 再请求 `dailyNote`**(降风控);DS Gen2+X4/OSX4;Cookie = CookieToken+LToken 双段;国服带 Referer `webstatic.mihoyo.com` 与 `x-rpc-tool_verison: v5.0.1-1ys`(保持原拼写);`1034` = 风控。

字段(满值取 `max_*`):树脂 `current/max_resin + resin_recovery_time`;宝钱 `current/max_home_coin`(**max=0 未解锁**);委托 `finished/total_task_num + is_extra_task_reward_received`;周本 `remain_resin_discount_num/limit`;派遣 `expeditions[{avatar_side_icon,status,remained_time}]`;质变仪 `transformer{obtained,recovery_time{...PascalCase...}}`(604800s 周期)。

## 7. uid → 区服(uid 倒数第 9 位即首位)

`1-4`→`cn_gf01` `5`→`cn_qd01` `6`→`os_usa` `7`→`os_euro` `8`→`os_asia` `9`→`os_cht`;首位 1-5 判国服。

## 8. 通用

响应包装 `{retcode, message, data}`,retcode==0 成功。登录类接口风控响应头 `X-Rpc-Aigis`(极验,V1 不做打码,兜底跳官方页)。OSLK2/OSK2 盐未取得(国际服 genAuthKey 祈愿用,二期再找)。
