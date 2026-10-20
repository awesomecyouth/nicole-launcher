<script setup lang="ts">
import { SButton, SCard } from '@/components/ui'
import { useSettingsStore, type NoteRefreshInterval, type ThemeMode } from '@/stores/settings'

const settings = useSettingsStore()

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
      <p class="mt-2 text-xs text-ink-2">仅应用运行期间有效;刷新失败不会清空已有数据。</p>
    </SCard>

    <SCard title="语言">
      <p class="text-ink-2">中文</p>
      <!-- TODO @i18n 接入 vue-i18n 并开放语言切换 -->
    </SCard>

    <SCard title="关于">
      <p class="text-ink-2">Nicole Launcher v0.1.0 · Tauri 2 + Vue 3</p>
    </SCard>
  </div>
</template>
