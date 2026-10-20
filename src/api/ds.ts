/**
 * 米哈游 DS(数据签名)算法:Gen1 / Gen2
 * DS = "{t},{r},{md5hex}"
 *  - Gen1: md5(salt={salt}&t={t}&r={r}),r 为 6 位随机小写字母数字
 *  - Gen2: 追加 &b={body}&q={query},r 为 100000-200000 随机数(100000 特判 642367)
 * 易错点:
 *  1. Gen2 的 "&b=" "&q=" 段不可省略:body 为空时用 "{}"(PROD 盐);GET 无 query 时 q 为空串
 *  2. Gen2 的 q:query 按 & 拆段字典序排序后重拼
 * 依据: docs/plans/2026_10_20__001__phase1__development_plan.md §6.1
 */
import { md5 } from 'js-md5'
import { SALTS, type SaltName } from './constants'

const LOWER_ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Gen1 的 r:6 位随机小写字母数字 */
function randomR1(): string {
  let r = ''
  for (let i = 0; i < 6; i++) {
    r += LOWER_ALNUM[Math.floor(Math.random() * LOWER_ALNUM.length)]
  }
  return r
}

/** Gen2 的 r:100000-200000 随机数,100000 特判为 642367 */
function randomR2(): number {
  const r = 100000 + Math.floor(Math.random() * 100001)
  return r === 100000 ? 642367 : r
}

/** 把 query 按 & 拆段字典序排序后重拼 */
export function sortQuery(query: string): string {
  if (!query) return ''
  return query.split('&').sort().join('&')
}

/** Gen1 签名(签到 / action_ticket 等,client_type=2/4 类接口) */
export function dsGen1(salt: SaltName, t: number = Math.floor(Date.now() / 1000), r: string = randomR1()): string {
  const c = md5(`salt=${SALTS[salt]}&t=${t}&r=${r}`)
  return `${t},${r},${c}`
}

/** Gen2 签名(便笺 / token 派生等,client_type=5 类接口) */
export function dsGen2(
  salt: SaltName,
  body: string,
  query: string,
  t: number = Math.floor(Date.now() / 1000),
  r: number = randomR2()
): string {
  const b = body === '' ? '{}' : body
  const q = sortQuery(query)
  const c = md5(`salt=${SALTS[salt]}&t=${t}&r=${r}&b=${b}&q=${q}`)
  return `${t},${r},${c}`
}

/**
 * 固定向量自测(期望值由 node crypto 独立计算固化)。
 * 返回失败项列表,空数组即全部通过。
 */
export function dsSelfTest(): string[] {
  const failures: string[] = []
  const expect = (name: string, actual: string, digest: string, full: string) => {
    const want = `${full},${digest}`
    if (actual !== want) failures.push(`${name}: got ${actual}, want ${want}`)
  }
  expect('gen1', dsGen1('K2', 1700000000, 'abc123'), '387e4a2ddb11de5ae413379efb8b1d0d', '1700000000,abc123')
  expect(
    'gen2-empty',
    dsGen2('PROD', '', '', 1700000000, 123456),
    '8d6b5df6b7767e0cee87bf2ea097ec2d',
    '1700000000,123456'
  )
  expect(
    'gen2-sorted',
    dsGen2('X4', '{"act_id":"x"}', 'server=cn_gf01&role_id=100', 1700000000, 200000),
    'f4ad0f9b4bedfb7202431c3ee96f2adf',
    '1700000000,200000'
  )
  return failures
}
