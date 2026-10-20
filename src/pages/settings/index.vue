<script setup lang="ts">
import { SButton, SCard } from '@/components/ui'
import { useSettingsStore, type ThemeMode } from '@/stores/settings'

const settings = useSettingsStore()

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: '日间' },
  { value: 'dark', label: '夜间' },
  { value: 'auto', label: '跟随系统' },
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

    <SCard title="语言">
      <p class="text-ink-2">中文</p>
      <!-- TODO @i18n 接入 vue-i18n 并开放语言切换 -->
    </SCard>

    <SCard title="关于">
      <p class="text-ink-2">Nicole Launcher v0.1.0 · Tauri 2 + Vue 3</p>
    </SCard>
  </div>
</template>
