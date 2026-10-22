/**
 * UIGF v4.2 单文件导出/导入(仅 hk4e 原神数组;导入不兼容 v3 及更低版本)
 * 规范: https://uigf.org/zh/standards/uigf.html
 * 要点:list 字段全部字符串化;time 保持原始格式;400(祈愿二)的
 * uigf_gacha_type 归并为 301(与角色活动池共享保底)
 */
import { open, save } from '@tauri-apps/plugin-dialog'
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

/** 导出条目(一个角色一项;单文件 hk4e 数组支持多 uid) */
export interface UigfExportEntry {
  uid: string
  region: string
  items: GachaItem[]
}

export function buildUigfJson(entries: UigfExportEntry[]): string {
  return JSON.stringify({
    info: {
      export_timestamp: Math.floor(Date.now() / 1000),
      export_app: 'Nicole Launcher',
      export_app_version: appVersion,
      version: 'v4.0',
    },
    hk4e: entries.map((entry) => ({
      uid: entry.uid,
      timezone: timezoneOf(entry.region),
      lang: 'zh-cn',
      list: entry.items.map((item) => ({
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
    })),
  })
}

/** 导出为 UIGF 文件(dialog 选路径 → Rust 写出);取消返回 false */
export async function exportUigfFile(entries: UigfExportEntry[]): Promise<boolean> {
  if (entries.length === 0) return false
  const defaultName =
    entries.length === 1 ? `UIGF_v4.0_${entries[0].uid}.json` : `UIGF_v4.0_${entries.length}roles.json`
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: 'UIGF 祈愿记录', extensions: ['json'] }],
  })
  if (typeof path !== 'string') return false
  await invoke('save_text_file', { path, contents: buildUigfJson(entries) })
  return true
}

/* ---------- 导入(仅 v4) ---------- */

/** 导入结果条目 */
export interface UigfImportEntry {
  uid: string
  items: GachaItem[]
}

interface UigfListItem {
  gacha_type?: string | number
  item_id?: string | number
  time?: string
  name?: string | number
  item_type?: string | number
  rank_type?: string | number
  id?: string | number
}

/** 解析 UIGF v4 JSON 文本;非 v4 / 结构不符抛错 */
export function parseUigfJson(text: string): UigfImportEntry[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('文件不是有效的 JSON')
  }
  const root = data as { info?: { version?: string }; hk4e?: { uid?: string | number; list?: UigfListItem[] }[] }
  const version = root.info?.version ?? ''
  if (!/^v4\.\d+$/.test(version)) {
    throw new Error(`仅支持 UIGF v4 格式(当前文件版本:${version || '未知'})`)
  }
  if (!Array.isArray(root.hk4e)) {
    throw new Error('文件缺少 hk4e(原神)数据')
  }

  const entries: UigfImportEntry[] = []
  for (const raw of root.hk4e) {
    const uid = String(raw.uid ?? '')
    if (!uid || !Array.isArray(raw.list)) continue
    const items: GachaItem[] = []
    for (const row of raw.list) {
      // 必填:gacha_type/item_id/time/id(UIGF hk4e 必填集)
      if (row.gacha_type == null || row.item_id == null || !row.time || row.id == null) continue
      items.push({
        id: String(row.id),
        gachaType: Number(row.gacha_type),
        itemId: String(row.item_id),
        name: String(row.name ?? ''),
        itemType: String(row.item_type ?? ''),
        rankType: Number(row.rank_type ?? 0),
        time: row.time,
      })
    }
    if (items.length > 0) entries.push({ uid, items })
  }
  if (entries.length === 0) {
    throw new Error('文件中没有可导入的祈愿记录')
  }
  return entries
}

/** 选择并解析 UIGF 文件;取消返回 null */
export async function pickAndParseUigf(): Promise<UigfImportEntry[] | null> {
  const path = await open({
    multiple: false,
    filters: [{ name: 'UIGF 祈愿记录', extensions: ['json'] }],
  })
  if (typeof path !== 'string') return null
  const text = await invoke<string>('read_text_file', { path })
  return parseUigfJson(text)
}
