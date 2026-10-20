<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { SButton, SCard } from '@/components/ui'
import { buildLaunchArgs, createAuthTicket } from '@/api/auth-ticket'
import { useAccountsStore } from '@/stores/accounts'
import { useSettingsStore } from '@/stores/settings'

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

const isWin = ref(false)
const gameInfo = ref<GameInfo | null>(null)
const running = ref(false)
const launchState = ref<'idle' | 'busy' | 'running' | 'error'>('idle')
const statusText = ref('')
const errorMsg = ref('')

const serverLabel = computed(() => ({ cn: '国服官服', bili: 'B 服', os: '国际服' })[gameInfo.value?.server ?? 'cn'])

/** 账号区服与游戏客户端不匹配(仅提示,不阻断查看) */
const serverMismatch = computed(() => {
  const user = accounts.currentUser
  if (!user || !gameInfo.value) return false
  return user.isOversea !== (gameInfo.value.server === 'os')
})

const launchDisabled = computed(() => !isWin.value || !gameInfo.value || running.value || launchState.value === 'busy')

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

onMounted(async () => {
  isWin.value = await invoke<boolean>('is_windows')
  if (settings.gameExe) {
    try {
      gameInfo.value = await invoke<GameInfo>('inspect_game_path', { exe: settings.gameExe })
    } catch (err) {
      errorMsg.value = `已保存的游戏路径失效:${errText(err)}`
    }
  }
  running.value = await invoke<boolean>('is_game_running')
})

async function detect(): Promise<void> {
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

/** 一键启动:换票(B 服跳过)→ 区服写回 → 拉起进程 */
async function launch(): Promise<void> {
  const user = accounts.currentUser
  const role = accounts.currentRole
  errorMsg.value = ''
  statusText.value = ''

  if (!user || !role) {
    errorMsg.value = '请先在「账号管理」添加账号并选择角色'
    launchState.value = 'error'
    return
  }
  if (!gameInfo.value) {
    errorMsg.value = '未设置游戏路径'
    launchState.value = 'error'
    return
  }
  if (running.value) {
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

    // 稍等后检测运行状态(游戏进程拉起有延迟)
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      if (await invoke<boolean>('is_game_running')) break
    }
    running.value = await invoke<boolean>('is_game_running')
    launchState.value = running.value ? 'running' : 'idle'
    statusText.value = running.value ? '游戏运行中' : '已发起启动(未检测到进程,请稍后自行确认)'
  } catch (err) {
    launchState.value = 'error'
    errorMsg.value = errText(err)
    statusText.value = ''
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 非 Windows 禁用提示 -->
    <div v-if="!isWin" class="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
      游戏启动功能仅支持 Windows;路径探测/选择与启动已禁用,启动参数仍可预先配置。
    </div>

    <!-- 账号 -->
    <SCard title="账号与角色">
      <template v-if="accounts.currentUser">
        <div class="flex items-center gap-3 text-sm">
          <span class="font-medium text-ink">{{ accounts.currentUser.nickname || accounts.currentUser.aid }}</span>
          <span
            class="rounded px-1.5 py-0.5 text-xs"
            :class="
              accounts.currentUser.isOversea ? 'bg-warning/20 text-warning' : 'bg-primary-soft text-primary-strong'
            "
          >
            {{ accounts.currentUser.isOversea ? '国际服账号' : '国服账号' }}
          </span>
        </div>
        <p v-if="accounts.currentRole" class="mt-1 text-xs text-ink-2">
          当前角色:{{ accounts.currentRole.nickname }} · {{ accounts.currentRole.uid }}({{
            accounts.currentRole.regionName
          }})
        </p>
        <p v-else class="mt-1 text-xs text-ink-2">当前账号无原神角色,请先在「账号管理」刷新角色列表</p>
        <p v-if="serverMismatch" class="mt-2 text-xs text-danger">
          账号区服与游戏客户端不匹配({{ accounts.currentUser.isOversea ? '国际服账号' : '国服账号' }} vs
          {{ serverLabel }}),无法票据免登
        </p>
      </template>
      <div v-else class="py-4 text-center text-sm text-ink-2">请先在「账号管理」添加账号</div>
    </SCard>

    <!-- 游戏路径 -->
    <SCard title="游戏路径">
      <template #header>
        <div class="flex gap-2">
          <SButton size="sm" variant="ghost" :disabled="!isWin" @click="detect">重新探测</SButton>
          <SButton size="sm" variant="ghost" :disabled="!isWin" @click="pickExe">选择主程序</SButton>
        </div>
      </template>
      <template v-if="gameInfo">
        <div class="flex items-center gap-2 text-sm">
          <span class="rounded bg-primary-soft px-1.5 py-0.5 text-xs text-primary-strong">{{ serverLabel }}</span>
          <span class="break-all text-xs text-ink-2">{{ gameInfo.exe }}</span>
        </div>
        <p class="mt-1 text-xs text-ink-2">
          config.ini:channel={{ gameInfo.channel }} / sub_channel={{ gameInfo.sub_channel }}
        </p>
        <p v-if="gameInfo.is_bili" class="mt-2 text-xs text-warning">
          B 服客户端不支持票据免登,启动时将跳过登录票据(裸启动)
        </p>
      </template>
      <div v-else class="py-4 text-center text-sm text-ink-2">
        {{
          isWin
            ? '未设置游戏路径:点击「重新探测」自动查找,或「选择主程序」手动指定'
            : '游戏路径功能已在非 Windows 系统上禁用'
        }}
      </div>
      <p v-if="statusText && !gameInfo" class="mt-2 text-xs text-ink-2">{{ statusText }}</p>
    </SCard>

    <!-- 启动参数(Unity 命令行,非注入) -->
    <SCard title="启动参数">
      <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <label class="flex cursor-pointer items-center gap-2 text-ink"
          ><input
            v-model="settings.launchOptions.fullscreen"
            type="checkbox"
            class="accent-primary"
            @change="settings.setLaunchOptions({ fullscreen: settings.launchOptions.fullscreen })"
          />全屏</label
        >
        <label class="flex cursor-pointer items-center gap-2 text-ink"
          ><input
            v-model="settings.launchOptions.borderless"
            type="checkbox"
            class="accent-primary"
            @change="settings.setLaunchOptions({ borderless: settings.launchOptions.borderless })"
          />无边框(-popupwindow)</label
        >
        <label class="flex cursor-pointer items-center gap-2 text-ink"
          ><input
            v-model="settings.launchOptions.exclusive"
            type="checkbox"
            class="accent-primary"
            @change="settings.setLaunchOptions({ exclusive: settings.launchOptions.exclusive })"
          />独占全屏(-window-mode exclusive)</label
        >
        <label class="flex cursor-pointer items-center gap-2 text-ink"
          ><input
            v-model="settings.launchOptions.monitorEnabled"
            type="checkbox"
            class="accent-primary"
            @change="settings.setLaunchOptions({ monitorEnabled: settings.launchOptions.monitorEnabled })"
          />指定显示器</label
        >
        <label v-if="settings.launchOptions.monitorEnabled" class="flex items-center gap-2 text-ink">
          显示器编号
          <input
            v-model.number="settings.launchOptions.monitor"
            type="number"
            min="1"
            class="w-16 rounded border border-line bg-surface px-2 py-1 text-xs"
            @change="settings.setLaunchOptions({ monitor: settings.launchOptions.monitor })"
          />
        </label>
      </div>
      <div class="mt-3 flex items-center gap-4 text-sm">
        <label class="flex cursor-pointer items-center gap-2 text-ink">
          <input
            v-model="settings.launchOptions.widthEnabled"
            type="checkbox"
            class="accent-primary"
            @change="settings.setLaunchOptions({ widthEnabled: settings.launchOptions.widthEnabled })"
          />
          宽度
          <input
            v-model.number="settings.launchOptions.width"
            type="number"
            :disabled="!settings.launchOptions.widthEnabled"
            class="w-20 rounded border border-line bg-surface px-2 py-1 text-xs disabled:opacity-50"
            @change="settings.setLaunchOptions({ width: settings.launchOptions.width })"
          />
        </label>
        <label class="flex cursor-pointer items-center gap-2 text-ink">
          <input
            v-model="settings.launchOptions.heightEnabled"
            type="checkbox"
            class="accent-primary"
            @change="settings.setLaunchOptions({ heightEnabled: settings.launchOptions.heightEnabled })"
          />
          高度
          <input
            v-model.number="settings.launchOptions.height"
            type="number"
            :disabled="!settings.launchOptions.heightEnabled"
            class="w-20 rounded border border-line bg-surface px-2 py-1 text-xs disabled:opacity-50"
            @change="settings.setLaunchOptions({ height: settings.launchOptions.height })"
          />
        </label>
      </div>
      <p class="mt-2 text-xs text-ink-2">参数在启动时拼装传入;仅支持 Unity 命令行参数,不含任何注入类功能。</p>
    </SCard>

    <!-- 启动 -->
    <SCard title="启动">
      <SButton size="lg" class="w-full" :disabled="launchDisabled" :loading="launchState === 'busy'" @click="launch">
        {{ running ? '游戏运行中' : '启 动' }}
      </SButton>
      <p v-if="statusText" class="mt-2 text-center text-xs text-ink-2">{{ statusText }}</p>
      <p v-if="errorMsg" class="mt-2 text-center text-xs text-danger">{{ errorMsg }}</p>
    </SCard>
  </div>
</template>
