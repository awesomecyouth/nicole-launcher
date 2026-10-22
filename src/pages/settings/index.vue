<script setup lang="ts">
import { computed } from 'vue'
import { openUrl } from '@tauri-apps/plugin-opener'
import { SButton, SCard } from '@/components/ui'
import { useSettingsStore, type NoteRefreshInterval, type ThemeMode } from '@/stores/settings'
import { useLauncherStore } from '@/stores/launcher'

const settings = useSettingsStore()
const launcher = useLauncherStore()

const serverLabel = computed(() => ({ cn: '国服官服', bili: 'B 服', os: '国际服' })[launcher.gameInfo?.server ?? 'cn'])

function openUigf(): void {
  void openUrl('https://uigf.org/')
}

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: '日间' },
  { value: 'dark', label: '夜间' },
  { value: 'auto', label: '跟随系统' },
]

const noteRefreshOptions: { value: NoteRefreshInterval; label: string }[] = [
  { value: 'off', label: '关闭' },
  { value: '30m', label: '每 30 分钟' },
  { value: '60m', label: '每 60 分钟' },
]
</script>

<template>
  <div class="flex flex-col gap-4">
    <SCard title="外观">
      <div class="flex items-center gap-2">
        <span class="w-20 text-ink-2">主题模式</span>
        <div class="flex gap-2">
          <SButton
            v-for="opt in themeOptions"
            :key="opt.value"
            :variant="settings.theme === opt.value ? 'primary' : 'ghost'"
            size="sm"
            @click="settings.setTheme(opt.value)"
          >
            {{ opt.label }}
          </SButton>
        </div>
      </div>
    </SCard>

    <SCard title="便笺">
      <div class="flex items-center gap-2">
        <span class="w-20 text-ink-2">自动刷新</span>
        <div class="flex gap-2">
          <SButton
            v-for="opt in noteRefreshOptions"
            :key="opt.value"
            :variant="settings.noteRefreshInterval === opt.value ? 'primary' : 'ghost'"
            size="sm"
            @click="settings.setNoteRefreshInterval(opt.value)"
          >
            {{ opt.label }}
          </SButton>
        </div>
      </div>
      <div class="mt-3 flex items-center gap-2">
        <label class="flex cursor-pointer items-center gap-2 text-ink">
          <input
            :checked="settings.refreshNoteOnOpen"
            type="checkbox"
            class="accent-primary"
            @change="settings.setRefreshNoteOnOpen(($event.target as HTMLInputElement).checked)"
          />
          打开应用时自动刷新
        </label>
      </div>
      <p class="mt-2 text-xs text-ink-2">
        仅应用运行期间有效;刷新失败不会清空已有数据。关闭「打开时自动刷新」则启动仅展示本地缓存数据(含上次更新时间)。
      </p>
    </SCard>

    <SCard v-if="settings.isWindows" title="启动游戏">
      <template #header>
        <div class="flex gap-2">
          <SButton size="sm" variant="ghost" @click="launcher.detect()">重新探测</SButton>
          <SButton size="sm" variant="ghost" @click="launcher.pickExe()">选择主程序</SButton>
        </div>
      </template>

      <!-- 游戏路径 -->
      <p v-if="launcher.gameInfo" class="mb-4 break-all text-xs text-ink-2" :title="launcher.gameInfo.exe">
        [{{ serverLabel }}] {{ launcher.gameInfo.exe }}
      </p>
      <p v-else class="mb-4 text-xs text-ink-2">未设置游戏路径——可自动探测或手动选择;启动按钮位于侧边栏,随时可用。</p>

      <!-- 启动参数(Unity 命令行,非注入) -->
      <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <label class="flex cursor-pointer items-center gap-2 text-ink">
          <input
            v-model="settings.launchOptions.fullscreen"
            type="checkbox"
            class="accent-primary"
            @change="settings.setLaunchOptions({ fullscreen: settings.launchOptions.fullscreen })"
          />全屏
        </label>
        <label class="flex cursor-pointer items-center gap-2 text-ink">
          <input
            v-model="settings.launchOptions.borderless"
            type="checkbox"
            class="accent-primary"
            @change="settings.setLaunchOptions({ borderless: settings.launchOptions.borderless })"
          />无边框(-popupwindow)
        </label>
        <label class="flex cursor-pointer items-center gap-2 text-ink">
          <input
            v-model="settings.launchOptions.exclusive"
            type="checkbox"
            class="accent-primary"
            @change="settings.setLaunchOptions({ exclusive: settings.launchOptions.exclusive })"
          />独占全屏(-window-mode exclusive)
        </label>
        <label class="flex cursor-pointer items-center gap-2 text-ink">
          <input
            v-model="settings.launchOptions.monitorEnabled"
            type="checkbox"
            class="accent-primary"
            @change="settings.setLaunchOptions({ monitorEnabled: settings.launchOptions.monitorEnabled })"
          />指定显示器
        </label>
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
          />宽度
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
          />高度
          <input
            v-model.number="settings.launchOptions.height"
            type="number"
            :disabled="!settings.launchOptions.heightEnabled"
            class="w-20 rounded border border-line bg-surface px-2 py-1 text-xs disabled:opacity-50"
            @change="settings.setLaunchOptions({ height: settings.launchOptions.height })"
          />
        </label>
      </div>
      <p class="mt-2 text-xs text-ink-2">Unity 命令行参数,启动时拼装传入;不含任何注入类功能。</p>
    </SCard>

    <SCard title="语言">
      <p class="text-ink-2">中文</p>
      <!-- TODO @i18n 接入 vue-i18n 并开放语言切换 -->
    </SCard>

    <SCard title="关于">
      <p class="text-ink-2">Nicole Launcher v0.1.0 · Tauri 2 + Vue 3</p>
      <p class="mt-2 text-xs text-ink-2">
        本应用支持
        <a class="cursor-pointer text-primary-strong hover:underline" @click="openUigf">UIGF 统一可交换祈愿记录标准</a>
        数据格式。
      </p>
    </SCard>
  </div>
</template>
