<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import qrcode from 'qrcode-generator'
import { SButton, SModal } from '@/components/ui'
import { createQrLogin, parseCookieCredential, queryQrLoginStatus } from '@/api/passport'
import { MiHoYoApiError } from '@/api/http'
import { RETCODE } from '@/api/constants'
import { useAccountsStore } from '@/stores/accounts'
import { useSettingsStore } from '@/stores/settings'

const modelValue = defineModel<boolean>({ required: true })
const accounts = useAccountsStore()
const settings = useSettingsStore()

const tab = ref<'qr' | 'cookie'>('qr')
const qrSvg = ref('')
const qrStatus = ref('')
const busy = ref(false)

const cookieText = ref('')
const cookieOversea = ref(false)
const cookieError = ref('')

let timer: number | undefined
let live = false

watch(
  modelValue,
  (open) => {
    if (open) startQr()
    else stopQr()
  },
  { immediate: true }
)

onUnmounted(stopQr)

function stopQr(): void {
  live = false
  if (timer !== undefined) {
    window.clearTimeout(timer)
    timer = undefined
  }
  qrSvg.value = ''
  qrStatus.value = ''
}

/** 创建二维码并进入轮询;-3501 过期自动重建 */
async function startQr(): Promise<void> {
  live = true
  busy.value = true
  qrStatus.value = '正在创建二维码...'
  try {
    const { url, ticket } = await createQrLogin(settings.hypDeviceId)
    if (!live) return
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()
    qrSvg.value = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true })
    qrStatus.value = '等待扫码:打开米游社 App → 我的 → 扫一扫'
    schedulePoll(ticket)
  } catch (err) {
    if (!live) return
    qrStatus.value = `二维码创建失败:${errText(err)}`
  } finally {
    busy.value = false
  }
}

function schedulePoll(ticket: string): void {
  if (!live) return
  timer = window.setTimeout(() => void poll(ticket), 3000)
}

async function poll(ticket: string): Promise<void> {
  if (!live) return
  try {
    const st = await queryQrLoginStatus(settings.hypDeviceId, ticket)
    if (!live) return
    if (st.status === 'Confirmed') {
      const stoken = st.tokens?.find((t) => t.tokenType === 1)?.token
      if (stoken && st.userInfo) {
        // 先停止轮询,再单独执行初始化(错误归因独立,不混入轮询分支)
        stopQr()
        await initScannedAccount(stoken, st.userInfo)
        return
      }
      qrStatus.value = '扫码结果缺少 stoken,正在重建二维码...'
      await startQr()
    } else if (st.status === 'Scanned') {
      qrStatus.value = '已扫码,请在手机上确认登录'
      schedulePoll(ticket)
    } else {
      schedulePoll(ticket)
    }
  } catch (err) {
    if (!live) return
    if (err instanceof MiHoYoApiError && err.retcode === RETCODE.QR_EXPIRED) {
      qrStatus.value = '二维码已过期,正在重建...'
      await startQr()
    } else {
      qrStatus.value = `轮询失败:${errText(err)}`
      schedulePoll(ticket)
    }
  }
}

/** 扫码确认后的入库初始化(独立错误提示) */
async function initScannedAccount(stoken: string, userInfo: { aid: string; mid: string }): Promise<void> {
  qrStatus.value = '扫码成功,正在初始化账号...'
  busy.value = true
  try {
    await accounts.addUserWithInit({ stuid: userInfo.aid, stoken, mid: userInfo.mid }, false)
    close()
  } catch (err) {
    qrStatus.value = `账号初始化失败:${errText(err)}`
  } finally {
    busy.value = false
  }
}

async function submitCookie(): Promise<void> {
  cookieError.value = ''
  busy.value = true
  try {
    const cred = parseCookieCredential(cookieText.value)
    await accounts.addUserWithInit(cred, cookieOversea.value)
    cookieText.value = ''
    close()
  } catch (err) {
    cookieError.value = errText(err)
  } finally {
    busy.value = false
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function close(): void {
  modelValue.value = false
}
</script>

<template>
  <SModal v-model="modelValue" title="添加账号" width="26rem">
    <div class="mb-4 flex gap-2">
      <SButton :variant="tab === 'qr' ? 'primary' : 'ghost'" size="sm" @click="tab = 'qr'">扫码添加(国服)</SButton>
      <SButton :variant="tab === 'cookie' ? 'primary' : 'ghost'" size="sm" @click="tab = 'cookie'">粘贴 Cookie</SButton>
    </div>

    <!-- 扫码 -->
    <div v-if="tab === 'qr'" class="flex flex-col items-center gap-3">
      <div
        class="flex h-64 w-64 items-center justify-center rounded-lg border border-line bg-white p-2"
        v-html="qrSvg"
      ></div>
      <p class="min-h-5 text-center text-sm text-ink-2">{{ qrStatus }}</p>
    </div>

    <!-- Cookie -->
    <div v-else class="flex flex-col gap-3">
      <textarea
        v-model="cookieText"
        class="h-40 w-full resize-none rounded-lg border border-line bg-surface p-3 font-mono text-xs text-ink outline-none focus:border-primary"
        placeholder="粘贴包含 stuid、mid、stoken 的整段 Cookie"
      />
      <label class="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
        <input v-model="cookieOversea" type="checkbox" class="accent-primary" />
        国际服账号(HoYoLAB)
      </label>
      <p v-if="cookieError" class="text-sm text-danger">{{ cookieError }}</p>
      <SButton :disabled="busy || !cookieText.trim()" :loading="busy" @click="submitCookie">添加</SButton>
    </div>
  </SModal>
</template>
