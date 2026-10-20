<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'

const router = useRouter()
const route = useRoute()
const settings = useSettingsStore()

const menus = [
  { name: 'dashboard', label: 'Dashboard' },
  { name: 'accounts', label: 'Accounts' },
  { name: 'launcher', label: 'Launcher' },
  { name: 'settings', label: 'Settings' },
]

const activeMenu = computed(() => (route.name as string) ?? 'dashboard')
const onMenuClick = (menuName: string) => {
  router.replace({ name: menuName })
}

// Logo 随机与点击切换机制(规范第 6.8 条,务必保留)
const iconIndexRef = ref(Math.floor(Math.random() * 6) + 1)
const iconHref = computed(() => {
  const index = iconIndexRef.value.toString().padStart(5, '0')
  return new URL(`../assets/nicole/nicole-${index}.png`, import.meta.url).href
})
const refreshIcon = () => {
  let newIndex = Math.floor(Math.random() * 6) + 1
  while (newIndex === iconIndexRef.value) {
    newIndex = Math.floor(Math.random() * 6) + 1
  }
  iconIndexRef.value = newIndex
}

const toggleTheme = () => {
  void settings.setTheme(settings.isDark ? 'light' : 'dark')
}
</script>

<template>
  <div class="flex h-full w-full flex-row bg-base">
    <aside class="flex min-w-60 flex-col py-4 ps-4">
      <div class="flex flex-row items-end justify-start gap-2 py-2">
        <img :src="iconHref" class="w-15 cursor-pointer" alt="Nicole" @click="refreshIcon" />
        <span class="cursor-pointer font-extrabold text-ink" @click="refreshIcon">Nicole Launcher</span>
      </div>
      <div class="flex flex-1 flex-col items-start justify-start gap-2 py-2">
        <div
          v-for="(menu, i) in menus"
          :key="menu.name"
          class="w-full cursor-pointer rounded-l-lg p-4 transition-all duration-300 hover:bg-primary hover:text-white hover:shadow-2xl"
          :class="{
            'bg-primary font-semibold text-white shadow-lg shadow-primary/40': activeMenu === menu.name,
            'mt-auto': i === menus.length - 1,
          }"
          @click="onMenuClick(menu.name)"
        >
          {{ menu.label }}
        </div>
        <button
          class="mt-2 flex w-full cursor-pointer items-center gap-2 rounded-lg p-3 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          title="切换日间 / 夜间模式"
          @click="toggleTheme"
        >
          <!-- sun -->
          <svg
            v-if="settings.isDark"
            viewBox="0 0 24 24"
            class="h-4.5 w-4.5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="4" />
            <path
              d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
            />
          </svg>
          <!-- moon -->
          <svg v-else viewBox="0 0 24 24" class="h-4.5 w-4.5" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
          </svg>
          <span>{{ settings.isDark ? '日间模式' : '夜间模式' }}</span>
        </button>
      </div>
    </aside>
    <div class="flex-1 overflow-x-hidden rounded-2xl border border-line bg-surface p-4 shadow-lg">
      <slot></slot>
    </div>
  </div>
</template>
