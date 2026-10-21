<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { SButton } from '@/components/ui'
import { buildLaunchArgs, createAuthTicket } from '@/api/auth-ticket'
import { useAccountsStore } from '@/stores/accounts'
import { useSettingsStore } from '@/stores/settings'
import { useLauncherStore } from '@/stores/launcher'

/** Rust 侧 GameInfo 的镜像 */
interface GameInfo {
  exe: string
  server: 'cn' | 'bili' | 'os'
  channel: number
  sub_channel: number
  is_bili: boolean
}

const accounts = useAccountsStore()
const settings = useSettingsStore()
const launcher = useLauncherStore()

const gameInfo = ref<GameInfo | null>(null)
const pathMenuOpen = ref(false)
const launchState = ref<'idle' | 'busy' | 'error'>('idle')
const statusText = ref('')
const errorMsg = ref('')
let pathMenuTimer: number | undefined
let waitPoll: number | undefined

onUnmounted(() => {
  if (pathMenuTimer !== undefined) window.clearTimeout(pathMenuTimer)
  if (waitPoll !== undefined) window.clearInterval(waitPoll)
})

const serverLabel = computed(() => ({ cn: '国服官服', bili: 'B 服', os: '国际服' })[gameInfo.value?.server ?? 'cn'])

/** 账号区服与游戏客户端不匹配 */
const serverMismatch = computed(() => {
  const user = accounts.currentUser
  if (!user || !gameInfo.value) return false
  return user.isOversea !== (gameInfo.value.server === 'os')
})

const launchDisabled = computed(
  () => !settings.isWindows || !gameInfo.value || launcher.isGameRunning || launchState.value === 'busy'
)

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** 初始化:校验已保存路径(由 Dashboard 挂载时调用一次) */
async function init(): Promise<void> {
  if (!settings.gameExe) return
  try {
    gameInfo.value = await invoke<GameInfo>('inspect_game_path', { exe: settings.gameExe })
  } catch (err) {
    errorMsg.value = `已保存的游戏路径失效:${errText(err)}`
  }
}
void init()

function togglePathMenu(): void {
  pathMenuOpen.value = !pathMenuOpen.value
  if (pathMenuOpen.value) {
    pathMenuTimer = window.setTimeout(() => (pathMenuOpen.value = false), 8000)
  }
}

async function detect(): Promise<void> {
  pathMenuOpen.value = false
  errorMsg.value = ''
  statusText.value = '正在探测游戏路径...'
  const found = await invoke<GameInfo | null>('detect_game_path')
  if (found) {
    gameInfo.value = found
    await settings.setGameExe(found.exe)
    statusText.value = ''
  } else {
    statusText.value = '未在默认位置找到原神,请手动选择主程序'
  }
}

async function pickExe(): Promise<void> {
  pathMenuOpen.value = false
  errorMsg.value = ''
  statusText.value = ''
  const picked = await open({
    multiple: false,
    filters: [{ name: '游戏主程序', extensions: ['exe'] }],
  })
  if (typeof picked !== 'string') return
  try {
    gameInfo.value = await invoke<GameInfo>('inspect_game_path', { exe: picked })
    await settings.setGameExe(picked)
  } catch (err) {
    errorMsg.value = errText(err)
  }
}

/** 一键启动:换票(B 服跳过)→ 区服写回 → 拉起进程 → 等待进程出现 */
async function launch(): Promise<void> {
  const user = accounts.currentUser
  const role = accounts.currentRole
  errorMsg.value = ''
  statusText.value = ''

  if (!user || !role) {
    errorMsg.value = '请先添加账号并选择角色'
    launchState.value = 'error'
    return
  }
  if (!gameInfo.value) {
    errorMsg.value = '未设置游戏路径'
    launchState.value = 'error'
    return
  }
  if (launcher.isGameRunning) {
    errorMsg.value = '游戏已在运行中'
    launchState.value = 'error'
    return
  }
  if (serverMismatch.value) {
    errorMsg.value = `当前账号为${user.isOversea ? '国际服' : '国服'}账号,与游戏客户端(${serverLabel.value})不匹配`
    launchState.value = 'error'
    return
  }

  launchState.value = 'busy'
  try {
    let ticket: string | undefined
    if (gameInfo.value.is_bili) {
      statusText.value = 'B 服客户端不支持票据免登,将直接启动...'
    } else {
      statusText.value = '正在获取登录票据...'
      ticket = await createAuthTicket({
        cred: { accountId: user.aid, cookieToken: user.cookieToken, ltoken: user.ltoken, ltuid: user.aid },
        deviceId: settings.deviceId,
        hypDeviceId: settings.hypDeviceId,
        isOversea: user.isOversea,
        mid: user.mid,
        stoken: user.stoken,
        aid: user.aid,
        fingerprint: user.fingerprint,
      })

      // 目标区服方案:国服官服 1/1、国际服 1/0;不一致时备份写回
      const [channel, sub] = user.isOversea ? [1, 0] : [1, 1]
      if (gameInfo.value.channel !== channel || gameInfo.value.sub_channel !== sub) {
        statusText.value = '正在切换区服方案(config.ini)...'
        await invoke('set_game_channels', { exe: gameInfo.value.exe, channel, subChannel: sub })
        gameInfo.value = { ...gameInfo.value, channel, sub_channel: sub }
      }
    }

    statusText.value = '正在启动游戏...'
    await invoke('launch_game', { exe: gameInfo.value.exe, args: buildLaunchArgs(settings.launchOptions, ticket) })

    // UAC 确认 + 进程冷启动较慢:2s 轮询等待进程出现(持续监控由 launcher store 负责)
    statusText.value = '已发起启动,等待游戏进程(含 UAC 确认)...'
    await new Promise<void>((resolve) => {
      waitPoll = window.setInterval(() => {
        void invoke<boolean>('is_game_running').then((alive) => {
          if (alive) {
            window.clearInterval(waitPoll)
            waitPoll = undefined
            resolve()
          }
        })
      }, 2000)
    })
    statusText.value = '游戏运行中'
  } catch (err) {
    launchState.value = 'error'
    errorMsg.value = errText(err)
    statusText.value = ''
    return
  }
  launchState.value = 'idle'
}
</script>

<template>
  <div v-if="settings.isWindows" class="flex flex-col gap-1.5">
    <div class="flex items-center gap-2">
      <SButton size="lg" class="min-w-40" :disabled="launchDisabled" :loading="launchState === 'busy'" @click="launch">
        {{ launcher.isGameRunning ? `游戏运行中 · ${launcher.runningDurationText}` : '启 动 游 戏' }}
      </SButton>

      <!-- 路径状态与操作 -->
      <div class="relative">
        <button
          class="max-w-56 cursor-pointer truncate rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-2 transition-colors hover:bg-surface-2"
          :title="gameInfo?.exe ?? '未设置游戏路径'"
          @click="togglePathMenu"
        >
          <template v-if="gameInfo">[{{ serverLabel }}] {{ gameInfo.exe }}</template>
          <template v-else>未设置游戏路径</template>
        </button>
        <div
          v-if="pathMenuOpen"
          class="absolute top-full left-0 z-40 mt-1 w-44 rounded-lg border border-line bg-surface p-1 shadow-xl"
        >
          <button
            class="w-full cursor-pointer rounded px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-2"
            @click="detect"
          >
            重新探测路径
          </button>
          <button
            class="w-full cursor-pointer rounded px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-2"
            @click="pickExe"
          >
            手动选择主程序
          </button>
        </div>
      </div>
      <p v-if="gameInfo?.is_bili" class="text-xs text-warning">B 服将跳过票据免登(裸启动)</p>
    </div>
    <p v-if="statusText" class="text-xs text-ink-2">{{ statusText }}</p>
    <p v-if="errorMsg" class="text-xs text-danger">{{ errorMsg }}</p>
  </div>
</template>
