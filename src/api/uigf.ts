/**
 * UIGF v4.2 单文件导出(仅 hk4e 原神数组)
 * 规范: https://uigf.org/zh/standards/uigf.html
 * 要点:list 字段全部字符串化;time 保持原始格式;400(祈愿二)的
 * uigf_gacha_type 归并为 301(与角色活动池共享保底)
 */
import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { version as appVersion } from '../../package.json'
import type { GachaItem } from './gacha'

/** 区服 → 时区偏移(米哈游服务器规则) */
function timezoneOf(region: string): number {
  if (region.startsWith('os_usa')) return -5
  if (region.startsWith('os_euro')) return 1
  // cn_gf01 / cn_qd01 / os_asia / os_cht
  return 8
}

export function buildUigfJson(uid: string, region: string, items: GachaItem[]): string {
  return JSON.stringify({
    info: {
      export_timestamp: Math.floor(Date.now() / 1000),
      export_app: 'Nicole Launcher',
      export_app_version: appVersion,
      version: 'v4.0',
    },
    hk4e: [
      {
        uid,
        timezone: timezoneOf(region),
        lang: 'zh-cn',
        list: items.map((item) => ({
          uigf_gacha_type: String(item.gachaType === 400 ? 301 : item.gachaType),
          gacha_type: String(item.gachaType),
          item_id: item.itemId,
          count: '1',
          time: item.time,
          name: item.name,
          lang: 'zh-cn',
          item_type: item.itemType,
          rank_type: String(item.rankType),
          id: item.id,
        })),
      },
    ],
  })
}

/** 导出为 UIGF 文件(dialog 选路径 → Rust 写出);取消返回 false */
export async function exportUigfFile(uid: string, region: string, items: GachaItem[]): Promise<boolean> {
  const path = await save({
    defaultPath: `UIGF_v4.0_${uid}.json`,
    filters: [{ name: 'UIGF 祈愿记录', extensions: ['json'] }],
  })
  if (typeof path !== 'string') return false
  await invoke('save_text_file', { path, contents: buildUigfJson(uid, region, items) })
  return true
}
