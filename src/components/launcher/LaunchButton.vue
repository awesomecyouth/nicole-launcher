<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import { SButton } from '@/components/ui'
import { useSettingsStore } from '@/stores/settings'
import { useLauncherStore } from '@/stores/launcher'

/** 全局启动按钮(仅 Windows 渲染):纯展示与事件转发,全部状态在 launcher store */
const settings = useSettingsStore()
const launcher = useLauncherStore()

const pathMenuOpen = ref(false)
let pathMenuTimer: number | undefined

onUnmounted(() => {
  if (pathMenuTimer !== undefined) window.clearTimeout(pathMenuTimer)
})

const serverLabel = computed(() => ({ cn: '国服官服', bili: 'B 服', os: '国际服' })[launcher.gameInfo?.server ?? 'cn'])

const launchDisabled = computed(
  () => !settings.isWindows || !launcher.gameInfo || launcher.isGameRunning || launcher.launchState === 'busy',
)

function togglePathMenu(): void {
  pathMenuOpen.value = !pathMenuOpen.value
  if (pathMenuOpen.value) {
    pathMenuTimer = window.setTimeout(() => (pathMenuOpen.value = false), 8000)
  }
}
</script>

<template>
  <div v-if="settings.isWindows" class="flex flex-col gap-1.5">
    <div class="flex items-center gap-2">
      <SButton
        size="lg"
        class="min-w-40"
        :disabled="launchDisabled"
        :loading="launcher.launchState === 'busy'"
        @click="launcher.launch()"
      >
        {{ launcher.isGameRunning ? '游戏运行中' : '启 动 游 戏' }}
      </SButton>

      <!-- 路径状态与操作 -->
      <div class="relative">
        <button
          class="max-w-56 cursor-pointer truncate rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-2 transition-colors hover:bg-surface-2"
          :title="launcher.gameInfo?.exe ?? '未设置游戏路径'"
          @click="togglePathMenu"
        >
          <template v-if="launcher.gameInfo">[{{ serverLabel }}] {{ launcher.gameInfo.exe }}</template>
          <template v-else>未设置游戏路径</template>
        </button>
        <div
          v-if="pathMenuOpen"
          class="absolute top-full left-0 z-40 mt-1 w-44 rounded-lg border border-line bg-surface p-1 shadow-xl"
        >
          <button
            class="w-full cursor-pointer rounded px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-2"
            @click="launcher.detect()"
          >
            重新探测路径
          </button>
          <button
            class="w-full cursor-pointer rounded px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-2"
            @click="launcher.pickExe()"
          >
            手动选择主程序
          </button>
        </div>
      </div>
      <p v-if="launcher.gameInfo?.is_bili" class="text-xs text-warning">B 服将跳过票据免登(裸启动)</p>
    </div>
    <p v-if="launcher.statusText" class="text-xs text-ink-2">{{ launcher.statusText }}</p>
    <p v-if="launcher.errorMsg" class="text-xs text-danger">{{ launcher.errorMsg }}</p>
  </div>
</template>
